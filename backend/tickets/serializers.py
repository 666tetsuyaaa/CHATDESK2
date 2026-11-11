from rest_framework import serializers

from offices.models import Office
from users.colleges import college_for_course

from .models import Ticket, TicketMessage

RESOLUTION_MAX_LENGTH = 5000
MESSAGE_MAX_LENGTH = 2000


class TicketSerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(source="user", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)
    student_course = serializers.CharField(source="user.course", read_only=True, default=None)
    student_college = serializers.SerializerMethodField()
    log_id = serializers.PrimaryKeyRelatedField(source="log", read_only=True)
    office_name = serializers.CharField(source="office.name", read_only=True, default=None)
    is_overdue = serializers.BooleanField(read_only=True)
    chatbot_answer = serializers.CharField(read_only=True, allow_null=True)
    # Filled by annotate_message_info() on list/detail querysets.
    message_count = serializers.SerializerMethodField()
    last_staff_message_at = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "ticket_id", "ticket_code", "user_id", "user_email", "student_course", "student_college",
            "resolved_by", "log_id", "title", "subject_category",
            "office", "office_name", "issue_description", "conversation_context", "status", "resolution",
            "is_ai_resolved", "created_at", "reopened_at", "resolved_at",
            "waiting_since", "is_overdue", "message_count", "last_staff_message_at", "chatbot_answer",
        ]
        read_only_fields = [
            "ticket_id", "ticket_code", "user_id", "log_id", "resolved_by", "office_name",
            "conversation_context", "is_ai_resolved", "created_at", "reopened_at", "resolved_at",
            "waiting_since",
        ]

    def get_student_college(self, ticket):
        college = college_for_course(ticket.user.course)
        return college["name"] if college else None

    def get_message_count(self, ticket):
        if hasattr(ticket, "message_count"):
            return ticket.message_count
        return ticket.messages.count()

    def get_last_staff_message_at(self, ticket):
        if hasattr(ticket, "last_staff_message_at"):
            value = ticket.last_staff_message_at
        else:
            last = ticket.messages.filter(sender_role=TicketMessage.Sender.STAFF).last()
            value = last.created_at if last else None
        return serializers.DateTimeField().to_representation(value) if value else None


class TicketCreateSerializer(serializers.ModelSerializer):
    """POST /api/v1/tickets/ - student manual creation, bypassing the AI."""

    class Meta:
        model = Ticket
        fields = ["title", "subject_category", "issue_description"]
        extra_kwargs = {"title": {"required": False}}

    def create(self, validated_data):
        request = self.context["request"]
        # A manual ticket's category is already the student's own words.
        validated_data.setdefault("title", validated_data["subject_category"][:100])
        return Ticket.objects.create(user=request.user, **validated_data)


class TicketUpdateSerializer(serializers.ModelSerializer):
    """PATCH /api/v1/tickets/{id}/ - admin only. Status, resolution text,
    title, subject_category, and which office is responsible (routing);
    resolved_by and resolved_at are set server-side in the view."""

    office = serializers.PrimaryKeyRelatedField(
        queryset=Office.objects.all(), required=False, allow_null=True
    )
    resolution = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=RESOLUTION_MAX_LENGTH
    )

    class Meta:
        model = Ticket
        fields = ["status", "resolution", "office", "title", "subject_category"]

    def validate_title(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Title can't be empty.")
        return value

    def validate_subject_category(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Category can't be empty.")
        return value

    def validate(self, attrs):
        # A ticket can't be marked resolved without an answer for the student.
        if attrs.get("status") == Ticket.Status.RESOLVED:
            resolution = attrs.get("resolution", getattr(self.instance, "resolution", None))
            if not (resolution or "").strip():
                raise serializers.ValidationError({"resolution": ["Write an answer before resolving the ticket."]})
        if "resolution" in attrs and attrs["resolution"] is not None:
            attrs["resolution"] = attrs["resolution"].strip() or None
        return attrs


class TicketFollowUpSerializer(serializers.Serializer):
    """POST /api/v1/tickets/{id}/follow-up/ - optional note from the student."""

    message = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class TicketMessageSerializer(serializers.ModelSerializer):
    """One message in a ticket's conversation. Students see staff by office
    name only, not by personal name."""

    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketMessage
        fields = ["message_id", "ticket", "sender_role", "sender_name", "body", "created_at"]
        read_only_fields = fields

    def get_sender_name(self, message):
        if message.sender_role == TicketMessage.Sender.STUDENT:
            student = message.ticket.user
            return f"{student.first_name} {student.last_name}".strip()
        office = message.ticket.office
        viewer = self.context.get("viewer")
        if viewer is not None and viewer.role != viewer.Role.STUDENT and message.sender:
            return f"{message.sender.first_name} {message.sender.last_name}".strip()
        return f"{office.name} staff" if office else "ChatDesk staff"


class TicketMessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=MESSAGE_MAX_LENGTH)

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Write a message first.")
        return value
