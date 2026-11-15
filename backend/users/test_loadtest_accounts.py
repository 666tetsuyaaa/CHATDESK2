from io import StringIO

from django.core.management import call_command

from config.testing import BaseAPITestCase
from inquiry_logs.models import ChatSession, InquiryLog
from tickets.models import Ticket
from users.models import User


def run(*args):
    out = StringIO()
    call_command("loadtest_accounts", *args, stdout=out)
    return out.getvalue()


class LoadtestAccountsTests(BaseAPITestCase):
    def test_dry_run_changes_nothing(self):
        self.assertIn("Would create 5", run("create", "--count", "5"))
        self.assertFalse(User.objects.exists())

    def test_create_then_delete_everything_they_made(self):
        output = run("create", "--count", "3", "--apply")
        self.assertEqual(User.objects.filter(email__startswith="zz.loadtest.").count(), 3)
        password = output.split("temporary): ")[1].split()[0]
        student = User.objects.get(email="zz.loadtest.01@example.com")
        self.assertTrue(student.check_password(password))
        log = InquiryLog.objects.create(user=student, user_message="Q", detected_intent="x", chatbot_response="A")
        Ticket.objects.create(user=student, log=log, subject_category="x", issue_description="x")
        ChatSession.objects.create(user=student, client_id="1", title="Q", messages=[])
        real = self.make_user("real.student@example.com")
        InquiryLog.objects.create(user=real, user_message="Q", detected_intent="x", chatbot_response="A")

        self.assertIn("Would delete 3 account(s), 1 inquiry log(s), 1 ticket(s)", run("delete"))
        run("delete", "--apply")
        self.assertFalse(User.objects.filter(email__startswith="zz.loadtest.").exists())
        self.assertFalse(Ticket.objects.exists())
        self.assertFalse(ChatSession.objects.exists())
        # Real students and their logs are untouched.
        self.assertTrue(User.objects.filter(pk=real.pk).exists())
        self.assertEqual(InquiryLog.objects.count(), 1)

    def test_never_touches_staff_with_the_prefix(self):
        admin = self.make_user("zz.loadtest.admin@example.com", role=User.Role.SUPERADMIN)
        run("delete", "--apply")
        self.assertTrue(User.objects.filter(pk=admin.pk).exists())
