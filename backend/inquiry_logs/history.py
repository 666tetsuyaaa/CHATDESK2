"""
A student's saved chats (History in the app), kept on the server so they
look the same in every browser and phone the student logs in from.

GET    /api/v1/chat/sessions/              - the newest MAX_SESSIONS chats
PUT    /api/v1/chat/sessions/{client_id}/  - save (create or replace) one chat;
       ?only_if_new=1 keeps an existing one (copying old chats up once)
DELETE /api/v1/chat/sessions/{client_id}/  - delete one chat

Students only, and only ever their own chats.
"""

import json
import re

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from users.permissions import IsStudent

from .models import ChatSession

# Oldest chats beyond this are dropped when a new one is saved.
MAX_SESSIONS = 100
MAX_MESSAGES = 300
MAX_TEXT = 6000
# The whole chat as JSON - a long chat is well under this.
MAX_BYTES = 400_000
CLIENT_ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")

# What the app keeps with a message, and the type of each. Anything else
# (like a connection error shown in the chat) isn't saved.
MESSAGE_FIELDS = {
    "role": str,
    "text": str,
    "logId": int,
    "feedback": (str, type(None)),
    "canRate": bool,
    "ticketId": int,
    "ticketTitle": str,
    "ticketCode": str,
    "ticketAiResolved": bool,
    "suggestions": list,
    "question": str,
}


def clean_message(raw):
    if not isinstance(raw, dict):
        raise serializers.ValidationError("Each message must be an object.")
    if raw.get("role") not in ("user", "assistant"):
        raise serializers.ValidationError('Each message needs a role of "user" or "assistant".')
    if not isinstance(raw.get("text"), str) or len(raw["text"]) > MAX_TEXT:
        raise serializers.ValidationError(f"Each message needs a text of at most {MAX_TEXT} characters.")
    if raw.get("isError"):
        return None
    message = {}
    for key, kind in MESSAGE_FIELDS.items():
        if key not in raw:
            continue
        value = raw[key]
        # bool is an int in Python - keep ids from accepting true/false.
        if isinstance(value, kind) and not (kind is int and isinstance(value, bool)):
            message[key] = value
    if "feedback" in message and message["feedback"] not in ("up", "down", None):
        del message["feedback"]
    if "suggestions" in message:
        message["suggestions"] = [s for s in message["suggestions"] if isinstance(s, str)][:5]
    return message


class ChatSessionSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120, allow_blank=True, trim_whitespace=True)
    messages = serializers.ListField(child=serializers.JSONField(), max_length=MAX_MESSAGES)

    def validate_messages(self, value):
        cleaned = [m for m in (clean_message(raw) for raw in value) if m is not None]
        if len(json.dumps(cleaned)) > MAX_BYTES:
            raise serializers.ValidationError("This chat is too long to save.")
        return cleaned


def session_data(session):
    return {
        "id": session.client_id,
        "title": session.title,
        "messages": session.messages,
        "updated_at": session.updated_at,
    }


class ChatSessionListView(APIView):
    """GET /api/v1/chat/sessions/ - student only. Their newest chats, newest first."""

    permission_classes = [IsStudent]

    def get(self, request):
        sessions = ChatSession.objects.filter(user=request.user).order_by("-updated_at")[:MAX_SESSIONS]
        return Response([session_data(s) for s in sessions])


class ChatSessionDetailView(APIView):
    """PUT/DELETE /api/v1/chat/sessions/{client_id}/ - student only, their own chats."""

    permission_classes = [IsStudent]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "chat_history"

    def put(self, request, client_id):
        if not CLIENT_ID.match(client_id):
            return Response(
                {"error": "validation_error", "message": "Invalid chat id.", "details": {}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ChatSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        title = serializer.validated_data["title"] or "New chat"
        messages = serializer.validated_data["messages"]
        with transaction.atomic():
            existing = ChatSession.objects.select_for_update().filter(user=request.user, client_id=client_id).first()
            if existing is not None and request.query_params.get("only_if_new") == "1":
                return Response(session_data(existing))
            if existing is None:
                session = ChatSession.objects.create(
                    user=request.user, client_id=client_id, title=title, messages=messages
                )
                # Only the newest MAX_SESSIONS are kept.
                old = ChatSession.objects.filter(user=request.user).order_by("-updated_at")[MAX_SESSIONS:]
                ChatSession.objects.filter(pk__in=list(old.values_list("pk", flat=True))).delete()
                return Response(session_data(session), status=status.HTTP_201_CREATED)
            existing.title = title
            existing.messages = messages
            existing.save(update_fields=["title", "messages", "updated_at"])
        return Response(session_data(existing))

    def delete(self, request, client_id):
        # Already gone (e.g. deleted on another phone) counts as done.
        ChatSession.objects.filter(user=request.user, client_id=client_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
