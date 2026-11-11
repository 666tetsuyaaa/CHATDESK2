from config.testing import BaseAPITestCase
from faqs.models import Faq
from tickets.models import Ticket
from users.models import User

from .models import Office


class OfficeDeletionTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        self.office = Office.objects.create(name="Test Office ARCU")

    def test_office_with_staff_cannot_be_deleted(self):
        self.make_user("arcu.admin@example.com", role=User.Role.OFFICE_ADMIN, office=self.office)
        response = self.superadmin.delete(f"/api/v1/offices/{self.office.office_id}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Office Admin", response.data["message"])
        self.assertTrue(Office.objects.filter(pk=self.office.pk).exists())

    def test_office_without_staff_can_be_deleted(self):
        response = self.superadmin.delete(f"/api/v1/offices/{self.office.office_id}/")
        self.assertEqual(response.status_code, 204)


class OfficelessOfficeAdminTests(BaseAPITestCase):
    """An Office Admin whose office is somehow empty must see nothing -
    office=None filters would otherwise match every unassigned row."""

    def setUp(self):
        super().setUp()
        student = self.make_user("student@example.com")
        self.unassigned_ticket = Ticket.objects.create(
            user=student, subject_category="Unresolved Inquiry", issue_description="Unassigned concern"
        )
        admin = self.make_user("orphan@example.com", role=User.Role.OFFICE_ADMIN)
        self.assertIsNone(admin.office_id)
        self.client = self.client_for(admin)

    def test_cannot_list_or_open_unassigned_tickets(self):
        listing = self.client.get("/api/v1/tickets/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data["count"], 0)
        self.assertEqual(self.client.get(f"/api/v1/tickets/{self.unassigned_ticket.ticket_id}/").status_code, 404)

    def test_cannot_resolve_tickets_or_read_logs_or_analytics(self):
        patch = self.client.patch(
            f"/api/v1/tickets/{self.unassigned_ticket.ticket_id}/", {"status": "resolved"}, format="json"
        )
        self.assertEqual(patch.status_code, 403)
        self.assertEqual(self.client.get("/api/v1/inquiry-logs/").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/analytics/overview/").status_code, 403)

    def test_cannot_create_faqs_that_every_student_would_see(self):
        response = self.client.post(
            "/api/v1/faqs/",
            {
                "intent_keyword": "sneaky",
                "question_text": "Sneaky question?",
                "answer_content": "An answer every student would receive.",
                "category": "General",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Faq.objects.filter(intent_keyword="sneaky").exists())


class OfficeCodeTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))

    def test_suggested_codes_from_names(self):
        from .codes import suggest_code

        self.assertEqual(suggest_code("Office of Student Affairs (OSA)"), "OSA")
        self.assertEqual(suggest_code("ARCU"), "ARCU")
        self.assertEqual(suggest_code("Registrar"), "REG")
        self.assertEqual(suggest_code("Guidance & Counseling Services"), "GCS")

    def test_blank_code_is_generated_and_kept_unique(self):
        first = self.superadmin.post("/api/v1/offices/", {"name": "Test Cashier Desk"}, format="json")
        second = self.superadmin.post("/api/v1/offices/", {"name": "Test Clinic Desk", "code": ""}, format="json")
        self.assertEqual(first.data["code"], "TCD")
        self.assertEqual(second.data["code"], "TCD2")

    def test_code_is_uppercased_and_validated(self):
        ok = self.superadmin.post("/api/v1/offices/", {"name": "Test Library", "code": "lib"}, format="json")
        self.assertEqual(ok.data["code"], "LIB")
        for bad in ("L", "LIB RARY", "TOOLONGCODE1"):
            response = self.superadmin.post("/api/v1/offices/", {"name": f"Test {bad}", "code": bad}, format="json")
            self.assertEqual(response.status_code, 400, bad)
        duplicate = self.superadmin.post("/api/v1/offices/", {"name": "Test Library 2", "code": "LIB"}, format="json")
        self.assertEqual(duplicate.status_code, 400)
