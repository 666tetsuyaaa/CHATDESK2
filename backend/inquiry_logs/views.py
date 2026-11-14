from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config.query_params import date_param, id_param, office_param
from faqs.models import Faq
from tickets.services import create_ai_answered_ticket, create_ticket_from_log
from users.colleges import filter_by_college
from users.models import User
from users.permissions import IsOfficeStaff, IsStudent

from .models import ESCALATED_INTENT, InquiryLog
from .serializers import ChatAskSerializer, InquiryLogFeedbackSerializer, InquiryLogSerializer
from .services import MORE_QUESTIONS_NOTE, answer_message, duplicate_result, exact_repeat_ticket, format_turns
from .unanswered import MAX_LOGS, UNANSWERED_INTENTS, group_unanswered

UNANSWERED_DEFAULT_DAYS = 90


def logs_for_office_scope(qs, user, params):
    """Office Admins: logs tagged with their office (picked in the mobile
    category selector) or that escalated into a ticket routed there - a log
    with neither can't be attributed to any one office. Super Admin:
    everything, or ?office=<id> / ?office=unassigned."""
    if user.role == user.Role.OFFICE_ADMIN:
        return qs.filter(Q(office=user.office) | Q(ticket__office=user.office)).distinct()
    office = office_param(params)
    if office == "unassigned":
        return qs.filter(office__isnull=True).filter(Q(ticket__isnull=True) | Q(ticket__office__isnull=True))
    if office:
        return qs.filter(Q(office_id=office) | Q(ticket__office_id=office)).distinct()
    return qs


class ChatAskView(APIView):
    """POST /api/v1/chat/ask/ - student only. Logs every interaction, then
    answers, asks to clarify, points to an already-open ticket, or creates a
    new ticket - whichever answer_message decided, for each of up to 3
    questions in the message."""

    permission_classes = [IsStudent]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "chat"

    def post(self, request):
        serializer = ChatAskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.validated_data["message"]
        office = serializer.validated_data.get("office")
        history = serializer.validated_data.get("history")

        # The AI call (~seconds) stays outside the transaction/lock.
        answered = answer_message(message, office=office, history=history, user=request.user)
        context = format_turns(history)
        # Tickets keep the student's whole message, even when it asked
        # several things and the ticket is about one of them.
        conversation = (
            "\n".join(filter(None, [context, f"Student: {message}"]))
            if context or len(answered["parts"]) > 1
            else ""
        )

        with transaction.atomic():
            if any(part["detected_intent"] == ESCALATED_INTENT for part in answered["parts"]):
                # Serialize this student's escalations: a second request that
                # raced past the classifier's duplicate check waits here,
                # then sees the first request's ticket.
                User.objects.select_for_update().filter(pk=request.user.pk).first()
            payloads = [self.save_part(request.user, office, part, conversation) for part in answered["parts"]]

        # The first answer's fields stay at the top level (as before one
        # message could ask several things); "parts" holds every answer.
        payload = {
            **payloads[0],
            "parts": payloads,
            "note": MORE_QUESTIONS_NOTE if answered["more_questions"] else None,
        }
        escalated = any(part["is_escalated"] for part in payloads)
        return Response(payload, status=status.HTTP_201_CREATED if escalated else status.HTTP_200_OK)

    @staticmethod
    def save_part(user, office, result, conversation):
        """Logs one answered question (and makes its ticket); returns its
        part of the response."""
        message = result["message"]
        if result["detected_intent"] == ESCALATED_INTENT:
            repeat = exact_repeat_ticket(user, message)
            if repeat is not None:
                result = {**duplicate_result(repeat), "question": result["question"]}

        log = InquiryLog.objects.create(
            user=user,
            office=office,
            user_message=message,
            detected_intent=result["detected_intent"],
            chatbot_response=result["reply"],
            is_escalated=result["detected_intent"] == ESCALATED_INTENT,
        )
        ticket = None
        if log.is_escalated:
            ticket = create_ticket_from_log(
                log, office=office, title=result["ticket_title"], conversation_context=conversation
            )
        elif result.get("faq") is not None:
            # Every real question gets a ticket: an FAQ answer is recorded
            # as one already resolved by the AI (not in the staff queue).
            ticket = create_ai_answered_ticket(log, result["faq"], office=office, conversation_context=conversation)

        payload = {
            "log_id": log.log_id,
            "question": result.get("question"),
            "detected_intent": log.detected_intent,
            "reply": log.chatbot_response,
            "is_escalated": log.is_escalated,
            "is_answer": log.is_answer,
            "suggested_questions": result.get("suggested_questions", []),
        }
        linked_ticket = ticket or result.get("existing_ticket")
        if linked_ticket is not None:
            payload["ticket_id"] = linked_ticket.ticket_id
            payload["ticket_code"] = linked_ticket.ticket_code
            payload["ticket_title"] = linked_ticket.title
            payload["ticket_ai_resolved"] = linked_ticket.is_ai_resolved
        return payload


class InquiryLogFeedbackView(generics.UpdateAPIView):
    """PATCH /api/v1/chat/logs/{log_id}/feedback/ - student only, and only
    ever on their own logs (get_queryset scopes this, matching the
    student-ticket-ownership pattern elsewhere: someone else's log_id just
    404s rather than 403s). The only field accepted is `feedback`."""

    serializer_class = InquiryLogFeedbackSerializer
    permission_classes = [IsStudent]
    lookup_url_kwarg = "log_id"

    def get_queryset(self):
        return InquiryLog.objects.filter(user=self.request.user)


class InquiryLogListView(generics.ListAPIView):
    """GET /api/v1/inquiry-logs/ - superadmin or office_admin. Raw logs for
    system analytics. Office Admins only see logs tagged with their office
    (the student picked it in the mobile category selector) or that
    escalated into a ticket later routed to their office - a log with
    neither has no way to be attributed to any one office.
    ?intent=, ?user_id=, ?student= (name or email), ?is_escalated=,
    ?date_from=, ?date_to=, ?college= and (Super Admin) ?office= filter.
    Paginated."""

    serializer_class = InquiryLogSerializer
    permission_classes = [IsOfficeStaff]

    def get_queryset(self):
        qs = InquiryLog.objects.select_related("user", "office", "ticket")
        qs = logs_for_office_scope(qs, self.request.user, self.request.query_params)
        qs = filter_by_college(qs, self.request.query_params.get("college"))

        intent = self.request.query_params.get("intent")
        if intent:
            qs = qs.filter(detected_intent=intent)
        user_id = id_param(self.request.query_params, "user_id")
        if user_id:
            qs = qs.filter(user_id=user_id)
        student = (self.request.query_params.get("student") or "").strip()
        if student:
            qs = qs.filter(
                Q(user__email__icontains=student)
                | Q(user__first_name__icontains=student)
                | Q(user__last_name__icontains=student)
            )
        is_escalated = self.request.query_params.get("is_escalated")
        if is_escalated is not None:
            qs = qs.filter(is_escalated=is_escalated.lower() in ("1", "true", "yes"))
        date_from = date_param(self.request.query_params, "date_from")
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        date_to = date_param(self.request.query_params, "date_to")
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)
        return qs

    def get_serializer_context(self):
        # FAQ questions for the readable intent labels, in one query.
        context = super().get_serializer_context()
        context["faq_questions"] = dict(Faq.objects.values_list("intent_keyword", "question_text"))
        return context


class UnansweredQuestionsView(APIView):
    """GET /api/v1/inquiry-logs/unanswered/ - superadmin or office_admin.
    The questions the chatbot couldn't answer from an FAQ (sent to staff,
    or too unclear to match), grouped by similar wording, most asked first.
    Questions an FAQ added or edited since now covers are left out.
    ?days= (default 90, max 365) and, for Super Admin, ?office=."""

    permission_classes = [IsOfficeStaff]

    def get(self, request):
        try:
            days = min(max(int(request.query_params.get("days", UNANSWERED_DEFAULT_DAYS)), 1), 365)
        except ValueError:
            days = UNANSWERED_DEFAULT_DAYS
        logs = InquiryLog.objects.filter(
            detected_intent__in=UNANSWERED_INTENTS, timestamp__gte=timezone.now() - timedelta(days=days)
        ).select_related("office", "ticket__office")
        logs = logs_for_office_scope(logs, request.user, request.query_params)
        logs = list(logs.order_by("-timestamp")[:MAX_LOGS])

        faqs = Faq.objects.all()
        if request.user.role == User.Role.OFFICE_ADMIN:
            faqs = faqs.filter(Q(office=request.user.office) | Q(office__isnull=True))
        groups = group_unanswered(logs, faqs.only("question_text", "updated_at"))
        return Response({"days": days, "total_questions": sum(g["count"] for g in groups), "groups": groups})
