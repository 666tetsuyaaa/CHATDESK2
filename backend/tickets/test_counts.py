from datetime import timedelta

from django.utils import timezone

from config.testing import BaseAPITestCase
from faqs.models import Faq
from offices.models import Office
from users.models import User

from .models import Ticket
from .tests import make_ticket


class DashboardCountsTests(BaseAPITestCase):
    """The single-request counts behind the Tickets and FAQ page tiles."""

    def setUp(self):
        super().setUp()
        self.osa = Office.objects.create(name="Test Student Affairs", code="TSA")
        self.reg = Office.objects.create(name="Test Records", code="TRC")
        student = self.make_user("student@example.com")
        make_ticket(student, self.osa, status=Ticket.Status.PENDING)
        make_ticket(student, self.osa, status=Ticket.Status.RESOLVED)
        make_ticket(student, self.reg, status=Ticket.Status.PENDING)
        make_ticket(student, self.osa, status=Ticket.Status.RESOLVED, is_ai_resolved=True)
        late = make_ticket(student, self.osa, status=Ticket.Status.PENDING)
        Ticket.objects.filter(pk=late.pk).update(waiting_since=timezone.now() - timedelta(days=10))
        Faq.objects.create(intent_keyword="a", question_text="Q a?", answer_content="An answer long enough.", category="Enrollment", office=self.osa)
        Faq.objects.create(intent_keyword="b", question_text="Q b?", answer_content="An answer long enough.", category="Enrollment", office=self.reg)
        Faq.objects.create(intent_keyword="c", question_text="Q c?", answer_content="An answer long enough.", category="Scholarship", office=self.osa)

    def test_super_admin_sees_all_ticket_counts(self):
        admin = self.client_for(self.make_user("admin@example.com", role=User.Role.SUPERADMIN))
        data = admin.get("/api/v1/tickets/counts/").data
        self.assertEqual(data, {"staff": 4, "pending": 3, "resolved": 1, "ai": 1, "overdue": 1})

    def test_counts_match_the_ticket_lists(self):
        admin = self.client_for(self.make_user("admin@example.com", role=User.Role.SUPERADMIN))
        counts = admin.get("/api/v1/tickets/counts/").data
        for key, params in (("staff", {"source": "staff"}), ("pending", {"source": "staff", "status": "pending"}),
                            ("resolved", {"source": "staff", "status": "resolved"}), ("ai", {"source": "ai"}),
                            ("overdue", {"overdue": "true"})):
            self.assertEqual(admin.get("/api/v1/tickets/", params).data["count"], counts[key], key)

    def test_office_admin_counts_only_their_office(self):
        office_admin = self.client_for(self.make_user("osa@example.com", role=User.Role.OFFICE_ADMIN, office=self.osa))
        self.assertEqual(office_admin.get("/api/v1/tickets/counts/").data,
                         {"staff": 3, "pending": 2, "resolved": 1, "ai": 1, "overdue": 1})
        self.assertEqual(office_admin.get("/api/v1/faqs/categories/").data,
                         [{"category": "Enrollment", "count": 1}, {"category": "Scholarship", "count": 1}])

    def test_faq_category_counts(self):
        admin = self.client_for(self.make_user("admin@example.com", role=User.Role.SUPERADMIN))
        self.assertEqual(admin.get("/api/v1/faqs/categories/").data,
                         [{"category": "Enrollment", "count": 2}, {"category": "Scholarship", "count": 1}])

    def test_students_cannot_see_them(self):
        student = self.client_for(self.make_user("other@example.com"))
        self.assertEqual(student.get("/api/v1/tickets/counts/").status_code, 403)
        self.assertEqual(student.get("/api/v1/faqs/categories/").status_code, 403)
