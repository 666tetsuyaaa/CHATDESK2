from datetime import date, timedelta
from unittest import mock

from config.testing import BaseAPITestCase
from users.models import User

from .models import SchoolPhase

TODAY = date(2026, 10, 15)


def phase(name, start_offset, end_offset):
    return SchoolPhase.objects.create(
        name=name,
        start_date=TODAY + timedelta(days=start_offset),
        end_date=TODAY + timedelta(days=end_offset),
        guidance_message=f"{name} guidance",
    )


class PhaseTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.student = self.client_for(self.make_user("student@example.com"))

    def current(self):
        with mock.patch("phases.views.timezone.localdate", return_value=TODAY):
            return self.student.get("/api/v1/phases/current/").data

    def test_overlapping_phases_can_be_saved(self):
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        phase("Midterm Exams", -5, 5)
        response = superadmin.post(
            "/api/v1/phases/",
            {
                "name": "Application for Graduation",
                "start_date": str(TODAY),
                "end_date": str(TODAY + timedelta(days=20)),
                "guidance_message": "Apply now.",
                "suggested_questions": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    def test_most_recently_started_phase_wins(self):
        phase("Semester", -60, 60)
        phase("Midterm Exams", -2, 3)
        self.assertEqual(self.current()["name"], "Midterm Exams")

    def test_shorter_phase_wins_a_same_day_start(self):
        phase("Long Window", -1, 30)
        phase("Short Window", -1, 2)
        self.assertEqual(self.current()["name"], "Short Window")

    def test_uses_manila_date(self):
        # Mocked timezone.localdate is what decides "today" - a phase that
        # starts tomorrow must not show yet, one ending today still shows.
        phase("Starts Tomorrow", 1, 10)
        self.assertIsNone(self.current()["phase_id"])
        phase("Ends Today", -10, 0)
        self.assertEqual(self.current()["name"], "Ends Today")

    def test_suggested_questions_are_cleaned_and_limited(self):
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        base = {"name": "Exams", "start_date": str(TODAY), "end_date": str(TODAY), "guidance_message": ""}
        ok = superadmin.post("/api/v1/phases/", {**base, "suggested_questions": ["  When are exams? ", ""]}, format="json")
        self.assertEqual(ok.data["suggested_questions"], ["When are exams?"])
        too_many = superadmin.post("/api/v1/phases/", {**base, "suggested_questions": ["q"] * 6}, format="json")
        self.assertEqual(too_many.status_code, 400)
