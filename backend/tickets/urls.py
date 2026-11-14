from django.urls import path

from .views import (
    TicketCountsView,
    TicketDetailView,
    TicketFollowUpView,
    TicketListCreateView,
    TicketMessageListCreateView,
)

urlpatterns = [
    path("tickets/", TicketListCreateView.as_view(), name="ticket-list-create"),
    path("tickets/counts/", TicketCountsView.as_view(), name="ticket-counts"),
    path("tickets/<int:ticket_id>/", TicketDetailView.as_view(), name="ticket-detail"),
    path("tickets/<int:ticket_id>/follow-up/", TicketFollowUpView.as_view(), name="ticket-follow-up"),
    path("tickets/<int:ticket_id>/messages/", TicketMessageListCreateView.as_view(), name="ticket-messages"),
]