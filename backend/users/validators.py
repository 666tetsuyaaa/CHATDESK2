"""Input rules shared by every user-facing serializer. The web dashboard
(web/src/utils/validation.js) and mobile app (mobile/lib/validation.ts)
mirror these so a check never passes on screen and then fails here."""

import re

from rest_framework import serializers

# Real IDs look like "2023304440" or "2026-00006": digits, optional hyphens.
SCHOOL_ID_PATTERN = re.compile(r"^\d[\d-]{4,18}\d$")
NAME_MAX_LENGTH = 150


def validate_school_id(value):
    value = value.strip()
    if not SCHOOL_ID_PATTERN.match(value):
        raise serializers.ValidationError(
            "Enter a valid School ID: 6-20 digits, hyphens allowed (e.g. 2023304440 or 2026-00006)."
        )
    return value


def validate_person_name(value):
    value = " ".join(value.split())
    if not any(character.isalpha() for character in value):
        raise serializers.ValidationError("Enter a real name - it must contain letters.")
    if len(value) > NAME_MAX_LENGTH:
        raise serializers.ValidationError(f"Keep it under {NAME_MAX_LENGTH} characters.")
    return value
