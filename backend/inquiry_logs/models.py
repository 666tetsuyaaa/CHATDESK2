from django.conf import settings
from django.db import models

# detected_intent values the chatbot writes for anything that isn't an FAQ
# answer. Every other detected_intent is an FAQ's intent_keyword.
ESCALATED_INTENT = "unresolved_complex_query"
DUPLICATE_TICKET_INTENT = "duplicate_ticket"
CONVERSATIONAL_INTENT = "conversational"
CLARIFICATION_INTENT = "needs_clarification"
OFF_TOPIC_INTENT = "off_topic"
UNCLEAR_INTENT = "unclear"
# "Who am I?" / "What's my School ID?" - answered from the student's own
# account (and "what's Maria's School ID?" - politely refused).
ACCOUNT_INFO_INTENT = "account_info"
# "Talk to staff" / "produce a ticket" with no concern in it - pointed to
# "Still need help?" instead of making a ticket.
STAFF_REQUEST_INTENT = "asked_for_staff"
# Small talk and housekeeping - not real inquiries for analytics purposes.
NON_INQUIRY_INTENTS = (
    CONVERSATIONAL_INTENT, CLARIFICATION_INTENT, OFF_TOPIC_INTENT, UNCLEAR_INTENT,
    ACCOUNT_INFO_INTENT, STAFF_REQUEST_INTENT,
)
SYSTEM_INTENTS = (ESCALATED_INTENT, DUPLICATE_TICKET_INTENT, *NON_INQUIRY_INTENTS)


class InquiryLog(models.Model):
    class Feedback(models.TextChoices):
        UP = "up", "Helpful"
        DOWN = "down", "Not helpful"

    log_id = models.BigAutoField(primary_key=True)
    # Null once the student's account is deleted: the log is kept (analytics,
    # Inquiry Logs) without their identity - shown as "Deleted student".
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="inquiry_logs",
    )
    # The student's course when they asked, copied from their account, so
    # the college filters and analytics still work after it is deleted.
    student_course = models.CharField(max_length=10, null=True, blank=True)
    # Which office/category the student selected before asking - independent
    # of whether the inquiry ended up escalated to a ticket. Lets Office
    # Admins see their office's full inquiry volume, not just escalations.
    office = models.ForeignKey(
        "offices.Office", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="inquiry_logs",
    )
    user_message = models.TextField()
    detected_intent = models.CharField(max_length=100)
    chatbot_response = models.TextField()
    is_escalated = models.BooleanField(default=False)
    # Student's thumbs up/down on the bot's reply - null until they vote.
    # Only meaningful for non-escalated replies (an escalated log's
    # chatbot_response is the generic "I've created a ticket" message, not
    # an actual answer to rate).
    feedback = models.CharField(max_length=4, choices=Feedback.choices, null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tbl_inquiry_logs"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"Log {self.log_id} ({self.detected_intent})"

    def save(self, *args, **kwargs):
        if self._state.adding and self.student_course is None and self.user_id:
            self.student_course = self.user.course
        super().save(*args, **kwargs)

    @property
    def is_answer(self):
        """True when the reply was an FAQ's answer - the only replies worth rating."""
        return self.detected_intent not in SYSTEM_INTENTS


class ChatSession(models.Model):
    """
    One of a student's saved chats - History in the app. Kept on the server
    so it's the same on every phone and browser they log in from (it used to
    live only in the browser that made it). Holds the chat as the app shows
    it; the analytics and Inquiry Logs still come from InquiryLog. Deleted
    with the student's account - unlike their inquiry logs, a chat history
    is personal and has no use without them.
    """

    session_id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_sessions")
    # The app's own id for the chat.
    client_id = models.CharField(max_length=40)
    title = models.CharField(max_length=120)
    # [{"role": "user"|"assistant", "text": ..., plus what the app shows
    # with a reply: logId, feedback, ticket*, suggestions, question}]
    messages = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_chat_sessions"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "client_id"], name="unique_chat_session_per_user"),
        ]

    def __str__(self):
        return f"Chat {self.client_id} of user {self.user_id}"
