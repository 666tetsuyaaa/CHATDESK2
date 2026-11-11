import re

from rest_framework import serializers

from inquiry_logs.models import SYSTEM_INTENTS
from offices.models import Office

from .models import Faq

BROKEN_CHARACTER = "�"
MIN_ANSWER_LENGTH = 15
QUESTION_MAX_LENGTH = 300
INTENT_KEYWORD_PATTERN = re.compile(r"^[A-Za-z0-9_]{2,100}$")


class FaqSerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(source="user", read_only=True)
    office = serializers.PrimaryKeyRelatedField(
        queryset=Office.objects.all(), required=False, allow_null=True
    )
    office_name = serializers.CharField(source="office.name", read_only=True, default=None)

    class Meta:
        model = Faq
        fields = ["faq_id", "user_id", "intent_keyword", "question_text",
                  "answer_content", "category", "office", "office_name",
                  "created_at", "updated_at", "updated_by"]
        read_only_fields = ["faq_id", "created_at", "updated_at", "updated_by", "user_id"]

    def _reject_broken_characters(self, value):
        if BROKEN_CHARACTER in value:
            raise serializers.ValidationError(
                f"Contains a broken character ({BROKEN_CHARACTER}), usually from copy-pasting - "
                "please retype that part."
            )
        return value

    def validate_intent_keyword(self, value):
        value = value.strip()
        if not INTENT_KEYWORD_PATTERN.match(value):
            raise serializers.ValidationError(
                "Use 2-100 letters, numbers or underscores, no spaces (e.g. scholarship_requirements)."
            )
        # These names mark chatbot outcomes in the inquiry logs (escalated,
        # small talk, ...). An FAQ using one would have its real answers
        # counted as that outcome in analytics and Unanswered Questions.
        if value.lower() in SYSTEM_INTENTS:
            raise serializers.ValidationError(
                f'"{value}" is reserved by the chatbot. Please choose a different keyword.'
            )
        # The database only rejects an exact repeat; "Enrollment" and
        # "enrollment" would be two FAQs that look like one.
        taken = Faq.objects.filter(intent_keyword__iexact=value)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError("An FAQ with this keyword already exists.")
        return value

    def validate_question_text(self, value):
        value = " ".join(value.split())
        if len(value) > QUESTION_MAX_LENGTH:
            raise serializers.ValidationError(f"Keep the question under {QUESTION_MAX_LENGTH} characters.")
        return self._reject_broken_characters(value)

    def validate_answer_content(self, value):
        # Students see this text word for word - a placeholder like
        # "OSA ONLY" would be sent as a real answer.
        if len(value.strip()) < MIN_ANSWER_LENGTH:
            raise serializers.ValidationError(
                f"Answer is too short to help a student (at least {MIN_ANSWER_LENGTH} characters)."
            )
        return self._reject_broken_characters(value)
