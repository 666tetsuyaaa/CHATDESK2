from datetime import timedelta

from django.utils import timezone

from config.testing import BaseAPITestCase
from inquiry_logs.models import InquiryLog
from offices.models import Office
from tickets.models import Ticket
from users.models import User


class OfficeWorkloadTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.osa = Office.objects.create(name="Test Affairs", code="TAF")
        self.reg = Office.objects.create(name="Test Records", code="TRC")
        self.it_student = self.make_user("it@example.com", course="BSIT")
        self.ce_student = self.make_user("ce@example.com", course="BSCE")
        now = timezone.now()

        def ticket(user, office, status, created_ago, resolved_after=None, ai=False):
            t = Ticket.objects.create(
                user=user, office=office, subject_category="x", issue_description="x",
                status=status, is_ai_resolved=ai,
            )
            created = now - created_ago
            resolved = created + resolved_after if resolved_after else None
            Ticket.objects.filter(pk=t.pk).update(created_at=created, resolved_at=resolved)
            return t

        self.oldest = ticket(self.it_student, self.osa, "pending", timedelta(days=5))
        ticket(self.it_student, self.osa, "pending", timedelta(days=1))
        ticket(self.ce_student, self.osa, "resolved", timedelta(days=3), resolved_after=timedelta(hours=2))
        ticket(self.ce_student, self.reg, "resolved", timedelta(days=3), resolved_after=timedelta(hours=4))
        ticket(self.it_student, self.reg, "resolved", timedelta(days=2), resolved_after=timedelta(seconds=1), ai=True)
        ticket(self.it_student, None, "pending", timedelta(hours=3))
        self.superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))

    def overview(self, **params):
        return self.superadmin.get("/api/v1/analytics/overview/", params).data

    def test_per_office_breakdown_puts_most_pending_first(self):
        offices = self.overview()["offices"]
        self.assertEqual(offices[0]["office_code"], "TAF")
        osa = offices[0]
        self.assertEqual((osa["pending"], osa["resolved"], osa["ai_answered"]), (2, 1, 0))
        self.assertEqual(osa["oldest_pending_code"], self.oldest.ticket_code)
        self.assertEqual(osa["avg_resolution_seconds"], 2 * 3600)
        reg = next(o for o in offices if o["office_code"] == "TRC")
        self.assertEqual((reg["resolved"], reg["ai_answered"], reg["avg_resolution_seconds"]), (1, 1, 4 * 3600))
        unassigned = next(o for o in offices if o["office_id"] is None)
        self.assertEqual(unassigned["pending"], 1)

    def test_ai_answered_tickets_do_not_inflate_staff_numbers(self):
        data = self.overview()
        self.assertEqual(data["tickets_by_status"], {"pending": 3, "active": 0, "resolved": 2})
        self.assertEqual(data["ai_answered_tickets"], 1)
        self.assertEqual(data["resolution_rate"], 0.4)
        self.assertEqual(data["avg_resolution_seconds"], 3 * 3600)

    def test_office_and_college_filters(self):
        only_reg = self.overview(office=self.reg.office_id)
        self.assertEqual([o["office_code"] for o in only_reg["offices"]], ["TRC"])
        self.assertEqual(self.overview(office="unassigned")["tickets_by_status"]["pending"], 1)
        it_only = self.overview(college="it_computing")
        self.assertEqual(it_only["tickets_by_status"], {"pending": 3, "active": 0, "resolved": 0})

    def test_office_admin_sees_only_their_office_row(self):
        admin = self.client_for(self.make_user("reg@example.com", role=User.Role.OFFICE_ADMIN, office=self.reg))
        offices = admin.get("/api/v1/analytics/overview/").data["offices"]
        self.assertEqual([o["office_code"] for o in offices], ["TRC"])


class AnalyticsOverviewTests(BaseAPITestCase):
    def test_small_talk_is_reported_separately_from_inquiries(self):
        student = self.make_user("student@example.com")
        for intent, escalated in [
            ("scholarship_requirements", False),
            ("scholarship_requirements", False),
            ("unresolved_complex_query", True),
            ("conversational", False),
            ("conversational", False),
            ("unclear", False),
            ("off_topic", False),
            ("duplicate_ticket", False),
        ]:
            InquiryLog.objects.create(
                user=student, user_message="x", detected_intent=intent,
                chatbot_response="y", is_escalated=escalated,
            )
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        data = superadmin.get("/api/v1/analytics/overview/").data

        self.assertEqual(data["total_inquiries"], 3)
        self.assertEqual(data["total_escalations"], 1)
        self.assertEqual(data["total_messages"], 8)
        self.assertEqual(
            {row["intent"] for row in data["intent_frequencies"]},
            {"scholarship_requirements", "unresolved_complex_query"},
        )
        self.assertEqual(
            {row["intent"]: row["count"] for row in data["other_interactions"]},
            {"conversational": 2, "unclear": 1, "off_topic": 1, "duplicate_ticket": 1},
        )
