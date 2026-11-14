"""Shared helpers for the test suites (python manage.py test)."""

import json
import logging
from types import SimpleNamespace

from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase

from users.models import User

PASSWORD = "Str0ng-Test-Pass!"

# Django 5.0's error-report formatting crashes under the test client on
# Python 3.14 ("'super' object has no attribute 'dicts'"), burying the real
# exception. Silencing this logger lets the test client re-raise the
# original error instead.
logging.getLogger("django.request").setLevel(logging.CRITICAL + 1)


class BaseAPITestCase(APITestCase):
    def setUp(self):
        # Throttle counters live in the cache - start every test from zero.
        cache.clear()
        self.client = APIClient()

    def make_user(self, email, role=User.Role.STUDENT, office=None, **extra):
        return User.objects.create_user(
            email=email, password=PASSWORD, first_name="Test", last_name="User",
            role=role, office=office, **extra,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client


class FakeOpenAI:
    """Stands in for the OpenAI client: returns preset classifier decisions
    (or raises) and counts calls, so tests never hit the real API."""

    def __init__(self, *decisions, error=None, vectors=None, embedding_error=None):
        self.decisions = list(decisions) or [{}]
        self.error = error
        self.calls = 0
        self.requests = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        # Embeddings: text -> vector; any other text gets DEFAULT_VECTOR.
        self.vectors = vectors or {}
        self.embedding_error = embedding_error
        self.embedded = []
        self.embeddings = SimpleNamespace(create=self._embed)

    DEFAULT_VECTOR = [0.0, 0.0, 1.0]

    def with_options(self, **kwargs):
        return self

    def _embed(self, model, input):
        if self.embedding_error is not None:
            raise self.embedding_error
        self.embedded.extend(input)
        return SimpleNamespace(data=[
            SimpleNamespace(index=i, embedding=self.vectors.get(text, self.DEFAULT_VECTOR))
            for i, text in enumerate(input)
        ])

    def _create(self, **kwargs):
        self.calls += 1
        self.requests.append(kwargs)
        if self.error is not None:
            raise self.error
        decision = self.decisions.pop(0) if len(self.decisions) > 1 else self.decisions[0]
        content = json.dumps({
            "message_type": "needs_staff",
            "matched_intent_keyword": None,
            "match_confidence": "none",
            "candidate_intent_keywords": [],
            "requested_details": [],
            "duplicate_of_ticket_id": None,
            "ticket_title": "Test Concern",
            **decision,
        })
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])
