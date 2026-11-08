from rest_framework import serializers

from offices.models import Office
from users.colleges import college_for_course

from .models import (
    CLARIFICATION_INTENT,
    CONVERSATIONAL_INTENT,
    DUPLICATE_TICKET_INTENT,
    ESCALATED_INTENT,
    OFF_TOPIC_INTENT,
    UNCLEAR_INTENT,
    InquiryLog,
)


# What each non-FAQ outcome means, in words office staff use.
INTENT_LABELS = {
    ESCALATED_INTENT: "Sent to staff",
    DUPLICATE_TICKET_INTENT: "Repeat of an open ticket",
    CONVERSATIONAL_INTENT: "Small talk",
    CLARIFICATION_INTENT: "Asked to clarify",
    OFF_TOPIC_INTENT: "Off-topic",
    UNCLEAR_INTENT: "Unclear message",
}


def intent_label(intent, faq_questions):
    """A readable name for a detected intent: the fixed label above, or the
    FAQ's own question when the chatbot answered from an FAQ."""
    if intent in INTENT_LABELS:
        return INTENT_LABELS[intent]
    return faq_questions.get(intent) or intent.replace("_", " ").capitalize()


class InquiryLogSerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(source="user", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_name = serializers.SerializerMethodField()
    intent_label = serializers.SerializerMethodField()
    office_name = serializers.CharField(source="office.name", read_only=True, default=None)
    student_college = serializers.SerializerMethodField()
    ticket_code = serializers.SerializerMethodField()

    class Meta:
        model = InquiryLog
        fields = [
            "log_id", "user_id", "user_email", "user_name", "user_message", "detected_intent", "intent_label",
            "chatbot_response", "is_escalated", "office", "office_name",
            "student_college", "ticket_code", "feedback", "timestamp",
        ]
        read_only_fields = fields

    def get_user_name(self, log):
        return f"{log.user.first_name} {log.user.last_name}".strip()

    def get_intent_label(self, log):
        return intent_label(log.detected_intent, self.context.get("faq_questions", {}))

    def get_student_college(self, log):
        college = college_for_course(log.user.course)
        return college["name"] if college else None

    def get_ticket_code(self, log):
        ticket = getattr(log, "ticket", None)
        return ticket.ticket_code if ticket else None


CHAT_MESSAGE_MAX_LENGTH = 1000


class ChatTurnSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    # Assistant turns carry full FAQ answers, so this is looser than the
    # message cap; the classifier truncates each turn anyway.
    text = serializers.CharField(allow_blank=True, trim_whitespace=True, max_length=10000)


class ChatAskSerializer(serializers.Serializer):
    # Capped so one message can't run up the OpenAI bill or, by failing the
    # AI call, fall through to creating a ticket.
    message = serializers.CharField(
        allow_blank=False, trim_whitespace=True, max_length=CHAT_MESSAGE_MAX_LENGTH
    )
    # Earlier turns of the current chat, oldest first - context only, so
    # follow-ups like "is that all?" aren't escalated. Optional.
    history = ChatTurnSerializer(many=True, required=False, max_length=20)
    # Which office/category the student picked before asking - optional at
    # the API level (older mobile builds or a "General" skip option can omit
    # it), but the mobile UI is expected to always collect it now.
    office = serializers.PrimaryKeyRelatedField(
        queryset=Office.objects.all(), required=False, allow_null=True
    )


class InquiryLogFeedbackSerializer(serializers.ModelSerializer):
    """PATCH-only, student-facing: the sole field a student can ever touch
    on one of their own inquiry logs is their thumbs up/down."""

    class Meta:
        model = InquiryLog
        fields = ["feedback"]

    def validate(self, attrs):
        # Only an FAQ answer can be rated - a vote on "Could you rephrase?"
        # or a greeting means nothing and dilutes the helpfulness data.
        if self.instance is not None and not self.instance.is_answer:
            raise serializers.ValidationError("Only answers from the knowledge base can be rated.")
        return attrs