from django.db import transaction
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status as http_status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from users.colleges import filter_by_college
from users.permissions import IsOfficeStaff, IsStudent

from .models import Ticket, TicketMessage, overdue_filter
from .notifications import notify_staff_message, notify_ticket_answered
from .serializers import (
    TicketCreateSerializer,
    TicketFollowUpSerializer,
    TicketMessageCreateSerializer,
    TicketMessageSerializer,
    TicketSerializer,
    TicketUpdateSerializer,
)

UNASSIGNED = "unassigned"


def annotate_message_info(qs):
    """message_count and last_staff_message_at for TicketSerializer, in the
    same query instead of one per ticket."""
    return qs.annotate(
        message_count=Count("messages"),
        last_staff_message_at=Max(
            "messages__created_at", filter=Q(messages__sender_role=TicketMessage.Sender.STAFF)
        ),
    ).order_by("-created_at", "-ticket_id")  # aggregation drops Meta.ordering


def visible_tickets(user):
    """Tickets this user may open: Super Admin all, Office Admin their
    office's, students their own."""
    qs = Ticket.objects.select_related("user", "office")
    if user.role == user.Role.SUPERADMIN:
        return qs
    if user.role == user.Role.OFFICE_ADMIN:
        if user.office_id is None:
            return qs.none()
        return qs.filter(office=user.office)
    return qs.filter(user=user)


def apply_ticket_filters(qs, params, allow_office_filter):
    """?status=, ?category=, ?source=staff|ai, ?college=, ?overdue=true,
    ?search= (title, question or ticket code) and - for Super Admin only -
    ?office=<id> or ?office=unassigned."""
    if params.get("status"):
        qs = qs.filter(status=params["status"])
    if params.get("category"):
        qs = qs.filter(subject_category=params["category"])
    source = params.get("source")
    if source == "staff":
        qs = qs.filter(is_ai_resolved=False)
    elif source == "ai":
        qs = qs.filter(is_ai_resolved=True)
    qs = filter_by_college(qs, params.get("college"))
    office = params.get("office")
    if allow_office_filter and office:
        qs = qs.filter(office__isnull=True) if office == UNASSIGNED else qs.filter(office_id=office)
    if params.get("overdue") in ("true", "1"):
        qs = qs.filter(overdue_filter())
    search = params.get("search")
    if search:
        qs = qs.filter(
            Q(issue_description__icontains=search)
            | Q(title__icontains=search)
            | Q(ticket_code__icontains=search.strip())
        )
    return qs


class TicketListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/tickets/ - superadmin: all tickets. office_admin: tickets
                            routed to their own office only (?office= is
                            ignored). student: own tickets only. Filters:
                            see apply_ticket_filters. Paginated.
    POST /api/v1/tickets/ - student only, manual creation bypassing the AI.
    """

    def get_queryset(self):
        user = self.request.user
        qs = annotate_message_info(Ticket.objects.select_related("user", "office"))
        params = self.request.query_params

        if user.role == user.Role.SUPERADMIN:
            return apply_ticket_filters(qs, params, allow_office_filter=True)

        if user.role == user.Role.OFFICE_ADMIN:
            if user.office_id is None:
                return qs.none()
            return apply_ticket_filters(qs.filter(office=user.office), params, allow_office_filter=False)

        # Students always see only their own tickets - ownership is enforced
        # server-side, not trusted from the ?creator=me query param.
        own = qs.filter(user=user)
        source = params.get("source")
        if source == "staff":
            own = own.filter(is_ai_resolved=False)
        elif source == "ai":
            own = own.filter(is_ai_resolved=True)
        return own

    def get_serializer_class(self):
        return TicketCreateSerializer if self.request.method == "POST" else TicketSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsStudent()]
        return [permissions.IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save()
        return Response(TicketSerializer(ticket).data, status=http_status.HTTP_201_CREATED)


class TicketDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/v1/tickets/{ticket_id}/ - all roles; students restricted to
          their own, office_admin restricted to their office's tickets.
    PATCH /api/v1/tickets/{ticket_id}/ - superadmin or office_admin. An
          office_admin can update status/resolution but can't reroute a
          ticket to a different office - see perform_update below. Marking
          a ticket resolved emails the student the answer.
    """

    lookup_url_kwarg = "ticket_id"

    def get_queryset(self):
        qs = visible_tickets(self.request.user)
        return annotate_message_info(qs) if self.request.method == "GET" else qs

    def get_serializer_class(self):
        return TicketUpdateSerializer if self.request.method == "PATCH" else TicketSerializer

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsOfficeStaff()]
        return [permissions.IsAuthenticated()]

    def perform_update(self, serializer):
        user = self.request.user
        ticket = self.get_object()
        if user.role == user.Role.OFFICE_ADMIN:
            serializer.validated_data.pop("office", None)
        extra = {}
        changes_answer = {"status", "resolution"} & serializer.validated_data.keys()
        if ticket.is_ai_resolved and changes_answer:
            # Staff stepped in on a chatbot-answered ticket - it's theirs now.
            extra["is_ai_resolved"] = False
        new_status = serializer.validated_data.get("status")
        newly_answered = new_status == Ticket.Status.RESOLVED and ticket.status != Ticket.Status.RESOLVED
        if new_status == Ticket.Status.RESOLVED:
            if ticket.resolved_by_id is None:
                extra["resolved_by"] = self.request.user
            extra["resolved_at"] = timezone.now()
        elif new_status == Ticket.Status.PENDING and ticket.status != Ticket.Status.PENDING:
            # Back in the staff queue: the overdue clock starts again.
            extra["waiting_since"] = timezone.now()
        updated = serializer.save(**extra)
        if newly_answered:
            notify_ticket_answered(updated)

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        ticket = annotate_message_info(visible_tickets(request.user)).get(ticket_id=kwargs["ticket_id"])
        return Response(TicketSerializer(ticket).data)


class TicketFollowUpView(APIView):
    """POST /api/v1/tickets/{ticket_id}/follow-up/ - student, own tickets.
    "I still need help" on a chatbot-answered ticket: reopens it as pending
    for staff, keeping the same ticket code, with the chatbot's answer moved
    into the conversation so staff see what the student already got."""

    permission_classes = [IsStudent]

    def post(self, request, ticket_id):
        serializer = TicketFollowUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.validated_data.get("message", "").strip()

        with transaction.atomic():
            ticket = get_object_or_404(
                Ticket.objects.select_for_update(), ticket_id=ticket_id, user=request.user
            )
            if not ticket.is_ai_resolved:
                return Response(
                    {
                        "error": "validation_error",
                        "message": "This ticket is already with OSA staff.",
                        "details": {},
                    },
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            context_lines = [ticket.conversation_context] if ticket.conversation_context else []
            context_lines.append(f"ChatDesk answered: {ticket.resolution or ''}")
            context_lines.append("Student asked for staff follow-up.")
            if message:
                context_lines.append(f"Student: {message}")
            ticket.conversation_context = "\n".join(context_lines)
            ticket.status = Ticket.Status.PENDING
            ticket.is_ai_resolved = False
            ticket.resolution = None
            ticket.resolved_at = None
            ticket.resolved_by = None
            ticket.reopened_at = timezone.now()
            ticket.waiting_since = ticket.reopened_at
            ticket.save()

        return Response(TicketSerializer(ticket).data, status=http_status.HTTP_200_OK)


class TicketMessageListCreateView(APIView):
    """
    GET  /api/v1/tickets/{ticket_id}/messages/ - the ticket's conversation,
         oldest first. Same access as the ticket itself.
    POST /api/v1/tickets/{ticket_id}/messages/ - {"body": "..."}.
         Staff message: a pending ticket becomes "active" (waiting on the
         student) and the student is emailed. Student message: the ticket
         goes back to "pending" for staff, reopening it if it was resolved.
         Students can't message a chatbot-answered ticket; they use
         follow-up first.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ticket_messages"

    def get_throttles(self):
        return super().get_throttles() if self.request.method == "POST" else []

    def get(self, request, ticket_id):
        ticket = get_object_or_404(visible_tickets(request.user), ticket_id=ticket_id)
        messages = ticket.messages.select_related("sender", "ticket__user", "ticket__office")
        return Response(TicketMessageSerializer(messages, many=True, context={"viewer": request.user}).data)

    def post(self, request, ticket_id):
        serializer = TicketMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        is_student = user.role == user.Role.STUDENT

        with transaction.atomic():
            ticket = get_object_or_404(
                visible_tickets(user).select_for_update(of=("self",)), ticket_id=ticket_id
            )
            if is_student and ticket.is_ai_resolved:
                return Response(
                    {
                        "error": "validation_error",
                        "message": 'Tap "I still need help" to send this ticket to staff first.',
                        "details": {},
                    },
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            message = TicketMessage.objects.create(
                ticket=ticket,
                sender=user,
                sender_role=TicketMessage.Sender.STUDENT if is_student else TicketMessage.Sender.STAFF,
                body=serializer.validated_data["body"],
            )
            if is_student:
                if ticket.status != Ticket.Status.PENDING:
                    # Waiting on staff again. A ticket that's already pending
                    # keeps its place (and overdue clock) in the queue.
                    ticket.status = Ticket.Status.PENDING
                    ticket.waiting_since = timezone.now()
                    ticket.resolved_at = None
                    ticket.save(update_fields=["status", "waiting_since", "resolved_at"])
            else:
                fields = []
                if ticket.is_ai_resolved:
                    ticket.is_ai_resolved = False  # staff stepped in - theirs now
                    fields.append("is_ai_resolved")
                if ticket.status == Ticket.Status.PENDING:
                    ticket.status = Ticket.Status.ACTIVE
                    fields.append("status")
                if fields:
                    ticket.save(update_fields=fields)
                notify_staff_message(ticket, message)

        data = TicketMessageSerializer(message, context={"viewer": user}).data
        return Response(data, status=http_status.HTTP_201_CREATED)
