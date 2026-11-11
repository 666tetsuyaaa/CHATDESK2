import re

from rest_framework import serializers

from .models import Office

OFFICE_CODE_PATTERN = re.compile(r"^[A-Z0-9]{2,10}$")


class OfficeSerializer(serializers.ModelSerializer):
    # Optional: left blank, one is generated from the name (Office.save).
    code = serializers.CharField(max_length=10, required=False, allow_blank=True)

    class Meta:
        model = Office
        fields = ["office_id", "name", "code", "created_at"]
        read_only_fields = ["office_id", "created_at"]

    def validate_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Office name is required.")
        taken = Office.objects.filter(name__iexact=value)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError("An office with this name already exists.")
        return value

    def validate_code(self, value):
        value = value.strip().upper()
        if not value:
            return value
        if not OFFICE_CODE_PATTERN.match(value):
            raise serializers.ValidationError("Use 2-10 letters or numbers, no spaces (e.g. OSA, REG).")
        taken = Office.objects.filter(code=value)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError("Another office already uses this code.")
        return value
