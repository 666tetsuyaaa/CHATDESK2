from django.db.models import F
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SchoolPhase
from .permissions import IsAdminOrReadOnly
from .serializers import SchoolPhaseSerializer
from .services import extract_phases_from_pdf


class SchoolPhaseListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/phases/ - all authenticated users can read, admin-only writes."""

    queryset = SchoolPhase.objects.all()
    serializer_class = SchoolPhaseSerializer
    permission_classes = [IsAdminOrReadOnly]


class SchoolPhaseDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/phases/{phase_id}/"""

    queryset = SchoolPhase.objects.all()
    serializer_class = SchoolPhaseSerializer
    permission_classes = [IsAdminOrReadOnly]
    lookup_url_kwarg = "phase_id"


class CurrentPhaseView(APIView):
    """GET /api/v1/phases/current/ - the active phase for today, or an empty
    fallback if no phase is currently defined."""

    def get(self, request):
        # Manila date (settings.TIME_ZONE), not the server OS clock - a UTC
        # host would otherwise flip phases 8 hours late.
        today = timezone.localdate()
        # Phases may overlap: the most recently started wins (it's the newer
        # event), and on a tie the shorter, more specific one.
        phase = (
            SchoolPhase.objects.filter(start_date__lte=today, end_date__gte=today)
            .annotate(length=F("end_date") - F("start_date"))
            .order_by("-start_date", "length", "phase_id")
            .first()
        )
        if phase is None:
            return Response({
                "phase_id": None,
                "name": None,
                "guidance_message": "",
                "suggested_questions": [],
            })
        return Response(SchoolPhaseSerializer(phase).data)


class PhaseExtractView(APIView):
    """
    POST /api/v1/phases/extract/ - admin only. Upload a calendar PDF
    (multipart field "file"), get back candidate phases for review -
    nothing is saved here. Confirmed candidates get created individually
    through the existing POST /api/v1/phases/ endpoint, so they still go
    through its date validation.
    """

    permission_classes = [IsAdminOrReadOnly]
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response(
                {
                    "error": "validation_error",
                    "message": "Invalid request parameters.",
                    "details": {"file": ["This field is required."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if uploaded_file.content_type != "application/pdf":
            return Response(
                {
                    "error": "validation_error",
                    "message": "Invalid request parameters.",
                    "details": {"file": ["Must be a PDF file."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            phases = extract_phases_from_pdf(uploaded_file.read())
        except ValueError as error:
            return Response(
                {
                    "error": "validation_error",
                    "message": "Invalid request parameters.",
                    "details": {"file": [str(error)]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            return Response(
                {
                    "error": "extraction_failed",
                    "message": "Could not extract phases from this PDF right now.",
                    "details": {},
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({"phases": phases})