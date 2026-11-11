from rest_framework import serializers

from .models import SchoolPhase

GUIDANCE_MAX_LENGTH = 500
MAX_SUGGESTED_QUESTIONS = 5
SUGGESTED_QUESTION_MAX_LENGTH = 200


class SchoolPhaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolPhase
        fields = [
            "phase_id", "name", "start_date", "end_date",
            "guidance_message", "suggested_questions",
        ]
        read_only_fields = ["phase_id"]

    def validate_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Phase name can't be empty.")
        return value

    def validate_guidance_message(self, value):
        value = value.strip()
        if len(value) > GUIDANCE_MAX_LENGTH:
            raise serializers.ValidationError(f"Keep the guidance message under {GUIDANCE_MAX_LENGTH} characters.")
        return value

    def validate_suggested_questions(self, value):
        if not isinstance(value, list) or not all(isinstance(q, str) for q in value):
            raise serializers.ValidationError("Suggested questions must be a list of text.")
        questions = [" ".join(q.split()) for q in value if q.strip()]
        if len(questions) > MAX_SUGGESTED_QUESTIONS:
            raise serializers.ValidationError(f"Add at most {MAX_SUGGESTED_QUESTIONS} suggested questions.")
        if any(len(q) > SUGGESTED_QUESTION_MAX_LENGTH for q in questions):
            raise serializers.ValidationError(
                f"Keep each suggested question under {SUGGESTED_QUESTION_MAX_LENGTH} characters."
            )
        return questions

    def validate(self, attrs):
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": ["end_date must be on or after start_date."]}
            )
        # Overlaps are allowed - real academic calendars overlap constantly
        # (e.g. graduation applications during midterms). CurrentPhaseView
        # picks deterministically when more than one is active.
        return attrs