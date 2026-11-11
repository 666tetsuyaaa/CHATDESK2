from django.urls import path

from .views import (
    CurrentPhaseView,
    PhaseExtractView,
    SchoolPhaseDetailView,
    SchoolPhaseListCreateView,
)

urlpatterns = [
    path("phases/", SchoolPhaseListCreateView.as_view(), name="phase-list-create"),
    path("phases/current/", CurrentPhaseView.as_view(), name="phase-current"),
    path("phases/extract/", PhaseExtractView.as_view(), name="phase-extract"),
    path("phases/<int:phase_id>/", SchoolPhaseDetailView.as_view(), name="phase-detail"),
]