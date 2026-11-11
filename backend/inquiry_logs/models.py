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
# Small talk and housekeeping - not real inquiries for analytics purposes.
NON_INQUIRY_INTENTS = (CONVERSATIONAL_INTENT, CLARIFICATION_INTENT, OFF_TOPIC_INTENT, UNCLEAR_INTENT)
SYSTEM_INTENTS = (ESCALATED_INTENT, DUPLICATE_TICKET_INTENT, *NON_INQUIRY_INTENTS)


class InquiryLog(models.Model):
    class Feedback(models.TextChoices):
        UP = "up", "Helpful"
        DOWN = "down", "Not helpful"

    log_id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="inquiry_logs"
    )
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

    @property
    def is_answer(self):
        """True when the reply was an FAQ's answer - the only replies worth rating."""
        return self.detected_intent not in SYSTEM_INTENTS