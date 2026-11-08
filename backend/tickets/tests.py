from datetime import datetime, timedelta
from io import StringIO
from unittest import mock
from zoneinfo import ZoneInfo

from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from config.testing import BaseAPITestCase, FakeOpenAI
from faqs.models import Faq
from inquiry_logs import services as chat_services
from offices.models import Office
from users.models import User

from .models import Ticket, next_ticket_code

MANILA = ZoneInfo("Asia/Manila")


def make_ticket(user, office=None, **extra):
    return Ticket.objects.create(
        user=user, office=office, subject_category="Unresolved Inquiry", issue_description="x", **extra
    )


class TicketCodeTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.osa = Office.objects.create(name="Test Student Affairs", code="TSA")
        self.reg = Office.objects.create(name="Test Records", code="TRC")
        self.student = self.make_user("student@example.com")

    def test_code_is_office_then_manila_date_then_daily_number(self):
        today = timezone.localdate().strftime("%m%d%y")
        first = make_ticket(self.student, self.osa)
        second = make_ticket(self.student, self.osa)
        other_office = make_ticket(self.student, self.reg)
        unassigned = make_ticket(self.student)
        self.assertEqual(first.ticket_code, f"TSA{today}001")
        self.assertEqual(second.ticket_code, f"TSA{today}002")
        self.assertEqual(other_office.ticket_code, f"TRC{today}001")
        self.assertEqual(unassigned.ticket_code, f"GEN{today}001")

    def test_numbering_restarts_each_manila_day(self):
        oct_31_late = datetime(2026, 10, 31, 23, 30, tzinfo=MANILA)
        nov_1_early = datetime(2026, 11, 1, 0, 30, tzinfo=MANILA)
        self.assertEqual(next_ticket_code(self.osa, oct_31_late), "TSA103126001")
        self.assertEqual(next_ticket_code(self.osa, oct_31_late), "TSA103126002")
        self.assertEqual(next_ticket_code(self.osa, nov_1_early), "TSA110126001")

    def test_code_never_changes_when_rerouted(self):
        ticket = make_ticket(self.student)
        original = ticket.ticket_code
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        superadmin.patch(f"/api/v1/tickets/{ticket.ticket_id}/", {"office": self.osa.office_id}, format="json")
        ticket.refresh_from_db()
        self.assertEqual(ticket.office, self.osa)
        self.assertEqual(ticket.ticket_code, original)

    def test_search_finds_ticket_by_code(self):
        ticket = make_ticket(self.student, self.osa)
        make_ticket(self.student, self.reg)
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        rows = superadmin.get("/api/v1/tickets/", {"search": ticket.ticket_code.lower()}).data["results"]
        self.assertEqual([r["ticket_id"] for r in rows], [ticket.ticket_id])


class AiAnsweredTicketTests(BaseAPITestCase):
    """Every FAQ answer is recorded as a ticket already resolved by the AI."""

    def setUp(self):
        super().setUp()
        self.office = Office.objects.create(name="Test Scholarships Office", code="TSO")
        Faq.objects.create(
            intent_keyword="scholarship_requirements", question_text="What are scholarship requirements?",
            answer_content="Submit your COR, a 2x2 ID picture, and your grades.", category="Scholarship",
            office=self.office,
        )
        self.student = self.make_user("student@example.com")
        self.client = self.client_for(self.student)

    def ask(self, message, decision):
        with mock.patch.object(chat_services, "_client", FakeOpenAI(decision)):
            return self.client.post("/api/v1/chat/ask/", {"message": message}, format="json")

    def ask_faq(self):
        return self.ask("What are scholarship requirements?", {})

    def test_faq_answer_creates_resolved_ai_ticket_outside_staff_queue(self):
        response = self.ask_faq()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["ticket_ai_resolved"])
        ticket = Ticket.objects.get(ticket_id=response.data["ticket_id"])
        self.assertTrue(ticket.is_ai_resolved)
        self.assertEqual(ticket.status, Ticket.Status.RESOLVED)
        self.assertEqual(ticket.office, self.office)
        self.assertEqual(ticket.title, "What are scholarship requirements?")
        self.assertEqual(ticket.resolution, "Submit your COR, a 2x2 ID picture, and your grades.")
        self.assertTrue(ticket.ticket_code.startswith("TSO"))
        self.assertEqual(response.data["ticket_code"], ticket.ticket_code)

        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        self.assertEqual(superadmin.get("/api/v1/tickets/", {"source": "staff"}).data["count"], 0)
        self.assertEqual(superadmin.get("/api/v1/tickets/", {"source": "ai"}).data["count"], 1)

    def test_small_talk_creates_no_ticket(self):
        self.ask("hi", {"message_type": "conversational"})
        self.ask("asdf", {"message_type": "unclear"})
        self.assertFalse(Ticket.objects.exists())

    def test_follow_up_reopens_for_staff_with_same_code(self):
        ticket_id = self.ask_faq().data["ticket_id"]
        code = Ticket.objects.get(ticket_id=ticket_id).ticket_code
        response = self.client.post(
            f"/api/v1/tickets/{ticket_id}/follow-up/", {"message": "I'm a transferee, is it the same?"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        ticket = Ticket.objects.get(ticket_id=ticket_id)
        self.assertEqual(ticket.status, Ticket.Status.PENDING)
        self.assertFalse(ticket.is_ai_resolved)
        self.assertIsNone(ticket.resolution)
        self.assertIsNotNone(ticket.reopened_at)
        self.assertEqual(ticket.ticket_code, code)
        self.assertIn("ChatDesk answered: Submit your COR", ticket.conversation_context)
        self.assertIn("I'm a transferee", ticket.conversation_context)
        # Already with staff - a second follow-up is refused.
        self.assertEqual(self.client.post(f"/api/v1/tickets/{ticket_id}/follow-up/").status_code, 400)

    def test_cannot_follow_up_on_someone_elses_ticket(self):
        ticket_id = self.ask_faq().data["ticket_id"]
        other = self.client_for(self.make_user("other@example.com"))
        self.assertEqual(other.post(f"/api/v1/tickets/{ticket_id}/follow-up/").status_code, 404)

    def test_staff_reply_takes_over_an_ai_ticket(self):
        ticket_id = self.ask_faq().data["ticket_id"]
        admin = self.make_user("super@example.com", role=User.Role.SUPERADMIN)
        response = self.client_for(admin).patch(
            f"/api/v1/tickets/{ticket_id}/",
            {"status": "resolved", "resolution": "Also bring your enrollment form."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        ticket = Ticket.objects.get(ticket_id=ticket_id)
        self.assertFalse(ticket.is_ai_resolved)
        self.assertEqual(ticket.resolved_by, admin)

    def test_student_list_filters_by_source(self):
        self.ask_faq()
        make_ticket(self.student)
        self.assertEqual(self.client.get("/api/v1/tickets/", {"source": "ai"}).data["count"], 1)
        self.assertEqual(self.client.get("/api/v1/tickets/", {"source": "staff"}).data["count"], 1)
        self.assertEqual(self.client.get("/api/v1/tickets/").data["count"], 2)


class TicketAccessTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.registrar = Office.objects.create(name="Test Office Registrar")
        self.osa = Office.objects.create(name="Test Office OSA")
        self.alice = self.make_user("alice@example.com")
        self.bob = self.make_user("bob@example.com")
        self.alice_ticket = Ticket.objects.create(
            user=self.alice, title="Lost School ID", subject_category="Unresolved Inquiry",
            issue_description="Lost my ID", office=self.registrar,
        )
        self.bob_ticket = Ticket.objects.create(
            user=self.bob, title="Grade Correction", subject_category="Unresolved Inquiry",
            issue_description="Wrong grade", office=self.osa,
        )
        self.registrar_admin = self.make_user(
            "registrar@example.com", role=User.Role.OFFICE_ADMIN, office=self.registrar
        )

    def ids(self, response):
        return {row["ticket_id"] for row in response.data["results"]}

    def test_student_sees_only_own_tickets(self):
        client = self.client_for(self.alice)
        self.assertEqual(self.ids(client.get("/api/v1/tickets/")), {self.alice_ticket.ticket_id})
        self.assertEqual(client.get(f"/api/v1/tickets/{self.bob_ticket.ticket_id}/").status_code, 404)

    def test_office_admin_sees_only_their_office(self):
        client = self.client_for(self.registrar_admin)
        self.assertEqual(self.ids(client.get("/api/v1/tickets/")), {self.alice_ticket.ticket_id})
        self.assertEqual(client.get(f"/api/v1/tickets/{self.bob_ticket.ticket_id}/").status_code, 404)

    def test_office_admin_cannot_reroute_but_can_resolve(self):
        client = self.client_for(self.registrar_admin)
        response = client.patch(
            f"/api/v1/tickets/{self.alice_ticket.ticket_id}/",
            {"status": "resolved", "resolution": "Visit the Registrar window.", "office": self.osa.office_id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.alice_ticket.refresh_from_db()
        self.assertEqual(self.alice_ticket.status, Ticket.Status.RESOLVED)
        self.assertEqual(self.alice_ticket.office, self.registrar)
        self.assertEqual(self.alice_ticket.resolved_by, self.registrar_admin)
        self.assertIsNotNone(self.alice_ticket.resolved_at)

    def test_students_cannot_update_tickets(self):
        response = self.client_for(self.alice).patch(
            f"/api/v1/tickets/{self.alice_ticket.ticket_id}/", {"status": "resolved"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_search_matches_title(self):
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        response = superadmin.get("/api/v1/tickets/", {"search": "school id"})
        self.assertEqual(self.ids(response), {self.alice_ticket.ticket_id})

    def test_resolving_requires_an_answer(self):
        client = self.client_for(self.registrar_admin)
        response = client.patch(
            f"/api/v1/tickets/{self.alice_ticket.ticket_id}/", {"status": "resolved", "resolution": "   "}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("resolution", response.data["details"])

    def test_office_filter_includes_unassigned(self):
        unassigned = make_ticket(self.alice)
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        self.assertEqual(self.ids(superadmin.get("/api/v1/tickets/", {"office": "unassigned"})), {unassigned.ticket_id})
        self.assertEqual(
            self.ids(superadmin.get("/api/v1/tickets/", {"office": self.osa.office_id})), {self.bob_ticket.ticket_id}
        )

    def test_college_filter_uses_the_students_course(self):
        self.alice.course = "BSIT"
        self.alice.save()
        self.bob.course = "BSCE"
        self.bob.save()
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        it_rows = superadmin.get("/api/v1/tickets/", {"college": "it_computing"})
        self.assertEqual(self.ids(it_rows), {self.alice_ticket.ticket_id})
        self.assertEqual(it_rows.data["results"][0]["student_college"], "Information Technology & Computing")
        self.assertEqual(superadmin.get("/api/v1/tickets/", {"college": "nonsense"}).data["count"], 0)


ANSWERED_ISSUE = 'Student asked: "How do I get my good moral certificate?" - AI could not resolve.'


class TicketAnsweredEmailTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.office = Office.objects.create(name="Test Student Affairs", code="TSA")
        self.student = self.make_user("student@example.com")
        self.admin = self.client_for(self.make_user("osa@example.com", User.Role.OFFICE_ADMIN, self.office))
        self.ticket = Ticket.objects.create(
            user=self.student, office=self.office, subject_category="Certificates",
            title="Good Moral Certificate", issue_description=ANSWERED_ISSUE,
        )

    def patch(self, payload):
        with override_settings(REAL_EMAIL_ENABLED=True), self.captureOnCommitCallbacks(execute=True):
            return self.admin.patch(f"/api/v1/tickets/{self.ticket.ticket_id}/", payload, format="json")

    def test_resolving_emails_the_student_the_code_and_answer(self):
        response = self.patch({"status": "resolved", "resolution": "Request it at the OSA window with your ID."})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ["student@example.com"])
        self.assertIn(self.ticket.ticket_code, email.subject)
        self.assertIn("Request it at the OSA window with your ID.", email.body)
        self.assertIn("How do I get my good moral certificate?", email.body)
        self.assertNotIn("Student asked:", email.body)

    def test_no_email_unless_the_ticket_becomes_resolved(self):
        self.patch({"status": "active"})
        self.assertEqual(len(mail.outbox), 0)
        self.patch({"status": "resolved", "resolution": "Answer one."})
        self.patch({"resolution": "Answer one, corrected."})
        self.assertEqual(len(mail.outbox), 1)

    def test_failed_email_does_not_undo_the_answer(self):
        with mock.patch("users.services.send_mail", side_effect=OSError("Gmail down")):
            response = self.patch({"status": "resolved", "resolution": "Answer."})
        self.assertEqual(response.status_code, 200)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, Ticket.Status.RESOLVED)


class OverdueTicketTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.office = Office.objects.create(name="Test Student Affairs", code="TSA")
        self.other = Office.objects.create(name="Test Records", code="TRC")
        self.student = self.make_user("student@example.com")
        self.osa_admin = self.make_user("osa@example.com", User.Role.OFFICE_ADMIN, self.office)
        self.records_admin = self.make_user("records@example.com", User.Role.OFFICE_ADMIN, self.other)
        self.superadmin = self.make_user("super@example.com", User.Role.SUPERADMIN)

    def aged(self, ticket, days):
        Ticket.objects.filter(pk=ticket.pk).update(waiting_since=timezone.now() - timedelta(days=days))
        ticket.refresh_from_db()
        return ticket

    def test_only_pending_staff_tickets_past_the_limit_are_overdue(self):
        old = self.aged(make_ticket(self.student, self.office), 3)
        new = self.aged(make_ticket(self.student, self.office), 1)
        active = self.aged(make_ticket(self.student, self.office, status=Ticket.Status.ACTIVE), 5)
        ai = self.aged(make_ticket(self.student, self.office, status=Ticket.Status.RESOLVED, is_ai_resolved=True), 5)
        self.assertTrue(old.is_overdue)
        for ticket in (new, active, ai):
            self.assertFalse(ticket.is_overdue)

        response = self.client_for(self.osa_admin).get("/api/v1/tickets/?overdue=true")
        self.assertEqual([t["ticket_id"] for t in response.data["results"]], [old.ticket_id])
        self.assertTrue(response.data["results"][0]["is_overdue"])

    def test_new_tickets_start_waiting_and_follow_up_restarts_the_clock(self):
        ticket = make_ticket(self.student, self.office)
        self.assertIsNotNone(ticket.waiting_since)
        ai = make_ticket(self.student, self.office, status=Ticket.Status.RESOLVED, is_ai_resolved=True, resolution="A")
        self.assertIsNone(ai.waiting_since)
        self.client_for(self.student).post(f"/api/v1/tickets/{ai.ticket_id}/follow-up/", {}, format="json")
        ai.refresh_from_db()
        self.assertEqual(ai.waiting_since, ai.reopened_at)
        self.assertFalse(ai.is_overdue)

    def test_analytics_counts_overdue_per_office(self):
        self.aged(make_ticket(self.student, self.office), 3)
        self.aged(make_ticket(self.student, self.office), 4)
        make_ticket(self.student, self.other)
        response = self.client_for(self.superadmin).get("/api/v1/analytics/overview/")
        self.assertEqual(response.data["overdue_tickets"], 2)
        rows = {row["office_name"]: row for row in response.data["offices"]}
        self.assertEqual(rows["Test Student Affairs"]["overdue"], 2)
        self.assertEqual(rows["Test Records"]["overdue"], 0)
        self.assertEqual(response.data["offices"][0]["office_name"], "Test Student Affairs")

    def test_daily_reminder_goes_to_each_office_admin_and_super_admin_for_unassigned(self):
        osa_ticket = self.aged(make_ticket(self.student, self.office, title="Lost ID"), 3)
        self.aged(make_ticket(self.student), 3)
        make_ticket(self.student, self.other)  # not overdue yet
        out = StringIO()
        with override_settings(REAL_EMAIL_ENABLED=True):
            call_command("send_overdue_reminders", stdout=out)
        recipients = sorted(email.to[0] for email in mail.outbox)
        self.assertEqual(recipients, ["osa@example.com", "super@example.com"])
        osa_email = next(email for email in mail.outbox if email.to == ["osa@example.com"])
        self.assertEqual(osa_email.subject, "You have 1 ChatDesk ticket waiting")
        self.assertIn(osa_ticket.ticket_code, osa_email.body)
        self.assertIn("2 sent", out.getvalue())

    def test_dry_run_sends_nothing(self):
        self.aged(make_ticket(self.student, self.office), 3)
        out = StringIO()
        with override_settings(REAL_EMAIL_ENABLED=True):
            call_command("send_overdue_reminders", "--dry-run", stdout=out)
        self.assertEqual(len(mail.outbox), 0)
        self.assertIn("To: osa@example.com", out.getvalue())


class TicketMessageTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.office = Office.objects.create(name="Test Student Affairs", code="TSA")
        self.other = Office.objects.create(name="Test Records", code="TRC")
        self.student = self.make_user("student@example.com")
        self.staff_user = self.make_user("osa@example.com", User.Role.OFFICE_ADMIN, self.office)
        self.staff = self.client_for(self.staff_user)
        self.me = self.client_for(self.student)
        self.ticket = make_ticket(self.student, self.office, title="Scholarship Grade Requirement")
        self.url = f"/api/v1/tickets/{self.ticket.ticket_id}/messages/"

    def send(self, client, body):
        with override_settings(REAL_EMAIL_ENABLED=True), self.captureOnCommitCallbacks(execute=True):
            return client.post(self.url, {"body": body}, format="json")

    def test_staff_question_waits_on_the_student_and_emails_them(self):
        response = self.send(self.staff, "What year level are you in?")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["sender_role"], "staff")
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, Ticket.Status.ACTIVE)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("What year level are you in?", mail.outbox[0].body)
        self.assertIn(self.ticket.ticket_code, mail.outbox[0].subject)

    def test_student_reply_puts_it_back_in_the_staff_queue(self):
        self.send(self.staff, "What year level are you in?")
        response = self.send(self.me, "Second year.")
        self.assertEqual(response.status_code, 201)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, Ticket.Status.PENDING)
        self.assertEqual(len(mail.outbox), 1)  # students' messages don't email anyone

        thread = self.me.get(self.url).data
        self.assertEqual([m["body"] for m in thread], ["What year level are you in?", "Second year."])
        # Students see the office, not the staff member's own name.
        self.assertEqual(thread[0]["sender_name"], "Test Student Affairs staff")

    def test_student_message_reopens_a_resolved_ticket(self):
        Ticket.objects.filter(pk=self.ticket.pk).update(
            status=Ticket.Status.RESOLVED, resolution="Answer", resolved_at=timezone.now(),
        )
        self.send(self.me, "That didn't work for me.")
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, Ticket.Status.PENDING)
        self.assertIsNone(self.ticket.resolved_at)
        self.assertFalse(self.ticket.is_overdue)

    def test_pending_ticket_keeps_its_overdue_clock_when_the_student_adds_more(self):
        old = timezone.now() - timedelta(days=3)
        Ticket.objects.filter(pk=self.ticket.pk).update(waiting_since=old)
        self.send(self.me, "Any update?")
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.waiting_since, old)
        self.assertTrue(self.ticket.is_overdue)

    def test_student_cannot_message_a_chatbot_answered_ticket(self):
        Ticket.objects.filter(pk=self.ticket.pk).update(status=Ticket.Status.RESOLVED, is_ai_resolved=True)
        response = self.send(self.me, "Hello?")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.ticket.messages.exists())

    def test_others_cannot_read_or_write_the_thread(self):
        other_student = self.client_for(self.make_user("other@example.com"))
        other_office = self.client_for(self.make_user("records@example.com", User.Role.OFFICE_ADMIN, self.other))
        for client in (other_student, other_office):
            self.assertEqual(client.get(self.url).status_code, 404)
            self.assertEqual(self.send(client, "hi").status_code, 404)

    def test_blank_message_is_rejected(self):
        self.assertEqual(self.send(self.me, "   ").status_code, 400)

    def test_ticket_list_shows_message_count_and_latest_staff_reply(self):
        self.send(self.staff, "What year level are you in?")
        self.send(self.me, "Second year.")
        row = self.me.get("/api/v1/tickets/").data["results"][0]
        self.assertEqual(row["message_count"], 2)
        self.assertIsNotNone(row["last_staff_message_at"])
