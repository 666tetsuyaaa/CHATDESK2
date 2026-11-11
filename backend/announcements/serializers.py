from rest_framework import serializers

from .models import Announcement

CONTENT_MAX_LENGTH = 5000


class AnnouncementSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    content = serializers.CharField(max_length=CONTENT_MAX_LENGTH)

    class Meta:
        model = Announcement
        fields = ["announcement_id", "title", "content", "created_by", "created_at", "updated_at"]
        read_only_fields = ["announcement_id", "created_by", "created_at", "updated_at"]

    def validate_title(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Title can't be empty.")
        return value

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError("Content can't be empty.")
        return value.strip()

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)