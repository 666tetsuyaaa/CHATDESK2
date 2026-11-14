from django.urls import path
from .views import FaqCategoryCountsView, FaqDetailView, FaqListCreateView, PopularFaqListView

urlpatterns = [
    path("", FaqListCreateView.as_view(), name="faq-list-create"),
    path("popular/", PopularFaqListView.as_view(), name="faq-popular"),
    path("categories/", FaqCategoryCountsView.as_view(), name="faq-category-counts"),
    path("<int:faq_id>/", FaqDetailView.as_view(), name="faq-detail"),
]