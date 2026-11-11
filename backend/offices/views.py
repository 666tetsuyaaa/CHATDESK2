from django.db.models import ProtectedError
from rest_framework import generics, status
from rest_framework.response import Response

from .models import Office
from .permissions import IsAdminOrReadOnly
from .serializers import OfficeSerializer


class OfficeListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/offices/ - all authenticated users can read
    (needed so FAQ/Ticket filter dropdowns work), Super Admin-only writes."""

    queryset = Office.objects.all()
    serializer_class = OfficeSerializer
    permission_classes = [IsAdminOrReadOnly]


class OfficeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/offices/{office_id}/"""

    queryset = Office.objects.all()
    serializer_class = OfficeSerializer
    permission_classes = [IsAdminOrReadOnly]
    lookup_url_kwarg = "office_id"

    def destroy(self, request, *args, **kwargs):
        office = self.get_object()
        try:
            office.delete()
        except ProtectedError:
            staff_count = office.staff_members.count()
            return Response(
                {
                    "error": "validation_error",
                    "message": (
                        f"This office still has {staff_count} Office Admin account(s). "
                        "Reassign or remove them in User Management before deleting the office."
                    ),
                    "details": {},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
