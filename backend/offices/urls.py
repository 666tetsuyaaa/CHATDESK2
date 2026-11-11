from django.urls import path

from .views import OfficeDetailView, OfficeListCreateView

urlpatterns = [
    path("offices/", OfficeListCreateView.as_view(), name="office-list-create"),
    path("offices/<int:office_id>/", OfficeDetailView.as_view(), name="office-detail"),
]
