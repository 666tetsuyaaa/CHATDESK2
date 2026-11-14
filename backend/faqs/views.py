from django.db.models import Count, Q
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from config.query_params import id_param, office_param
from inquiry_logs.models import InquiryLog
from users.permissions import IsOfficeStaff

from .models import Faq
from .permissions import IsAdminOrReadOnly
from .serializers import FaqSerializer


class FaqListCreateView(generics.ListCreateAPIView):
    """?search= matches question_text or intent_keyword. ?category=,
    ?office=<id> or ?office=unassigned (no office) filter exactly. All combine with AND; paginated per
    settings.REST_FRAMEWORK PAGE_SIZE."""

    serializer_class = FaqSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        # The stored embeddings are only needed by smart FAQ matching.
        qs = Faq.objects.defer("embedding", "embedding_text").order_by("-created_at")
        user = self.request.user
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(question_text__icontains=search) | Q(intent_keyword__icontains=search))

        # Office Admins only ever see their own office's FAQs - the ?office=
        # param is for Super Admin filtering and is ignored for them.
        if user.is_authenticated and user.role == user.Role.OFFICE_ADMIN:
            return qs.filter(office=user.office)
        office = office_param(self.request.query_params)
        if office == "unassigned":
            qs = qs.filter(office__isnull=True)
        elif office:
            qs = qs.filter(office_id=office)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        extra = {"user": user, "updated_by": user}
        if user.role == user.Role.OFFICE_ADMIN:
            # Force-assigned, not client-supplied - an Office Admin can only
            # ever create FAQs for their own office.
            extra["office"] = user.office
        serializer.save(**extra)


class PopularFaqListView(APIView):
    """GET /api/v1/faqs/popular/ - any authenticated user. The FAQs students
    ask about most, ranked by how many chats the AI answered with each one
    (escalated chats don't count - they matched no FAQ). Padded with the
    newest FAQs when there isn't enough chat history yet. ?office= narrows
    to that office's FAQs plus uncategorized ones, the same pool the chat
    classifier uses, so a suggestion is always answerable under that office.
    ?limit= defaults to 3, max 10."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            limit = min(max(int(request.query_params.get("limit", 3)), 1), 10)
        except ValueError:
            limit = 3

        faqs = Faq.objects.only("faq_id", "intent_keyword", "question_text", "created_at")
        office = id_param(request.query_params, "office")
        if office:
            faqs = faqs.filter(Q(office_id=office) | Q(office__isnull=True))
        faqs_by_keyword = {faq.intent_keyword: faq for faq in faqs.order_by("-created_at")}

        ask_counts = (
            InquiryLog.objects.filter(is_escalated=False, detected_intent__in=faqs_by_keyword.keys())
            .values("detected_intent")
            .annotate(ask_count=Count("log_id"))
            .order_by("-ask_count", "detected_intent")
        )
        ranked = [faqs_by_keyword[row["detected_intent"]] for row in ask_counts[:limit]]
        for faq in faqs_by_keyword.values():
            if len(ranked) >= limit:
                break
            if faq not in ranked:
                ranked.append(faq)

        return Response([{"faq_id": faq.faq_id, "question_text": faq.question_text} for faq in ranked])


class FaqDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FaqSerializer
    permission_classes = [IsAdminOrReadOnly]
    lookup_field = "faq_id"

    def get_queryset(self):
        qs = Faq.objects.defer("embedding", "embedding_text")
        user = self.request.user
        if user.is_authenticated and user.role == user.Role.OFFICE_ADMIN:
            return qs.filter(office=user.office)
        return qs

    def perform_update(self, serializer):
        user = self.request.user
        extra = {"updated_by": user}
        if user.role == user.Role.OFFICE_ADMIN:
            extra["office"] = user.office
        serializer.save(**extra)

class FaqCategoryCountsView(APIView):
    """GET /api/v1/faqs/categories/ - superadmin or office_admin. How many
    FAQs each category has, in one request (the FAQ page used to fetch a
    list per category just to count them). Office Admins: their office's."""

    permission_classes = [IsOfficeStaff]

    def get(self, request):
        qs = Faq.objects.all()
        if request.user.role == request.user.Role.OFFICE_ADMIN:
            qs = qs.filter(office=request.user.office)
        rows = qs.values("category").annotate(count=Count("pk")).order_by("category")
        return Response([{"category": row["category"], "count": row["count"]} for row in rows])
