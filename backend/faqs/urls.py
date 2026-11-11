from django.urls import path
from .views import FaqDetailView, FaqListCreateView, PopularFaqListView

urlpatterns = [
    path("", FaqListCreateView.as_view(), name="faq-list-create"),
    path("popular/", PopularFaqListView.as_view(), name="faq-popular"),
    path("<int:faq_id>/", FaqDetailView.as_view(), name="faq-detail"),
]