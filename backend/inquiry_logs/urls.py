from django.urls import path

from .history import ChatSessionDetailView, ChatSessionListView
from .views import ChatAskView, InquiryLogFeedbackView, InquiryLogListView, UnansweredQuestionsView

urlpatterns = [
    path("chat/ask/", ChatAskView.as_view(), name="chat-ask"),
    path("chat/logs/<int:log_id>/feedback/", InquiryLogFeedbackView.as_view(), name="chat-log-feedback"),
    path("chat/sessions/", ChatSessionListView.as_view(), name="chat-session-list"),
    path("chat/sessions/<str:client_id>/", ChatSessionDetailView.as_view(), name="chat-session-detail"),
    path("inquiry-logs/", InquiryLogListView.as_view(), name="inquiry-log-list"),
    path("inquiry-logs/unanswered/", UnansweredQuestionsView.as_view(), name="unanswered-questions"),
]