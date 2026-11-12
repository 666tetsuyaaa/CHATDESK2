import os
import shutil
import tempfile
from datetime import timedelta
from io import BytesIO, StringIO
from smtplib import SMTPException
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from PIL import Image

from announcements.models import Announcement
from config.testing import PASSWORD, BaseAPITestCase
from faqs.models import Faq
from offices.models import Office
from tickets.models import Ticket

from .models import PasswordResetCode, User

LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/token/refresh/"
REGISTER = "/api/v1/auth/register/"
RESET_REQUEST = "/api/v1/auth/password-reset/request/"
RESET_CONFIRM = "/api/v1/auth/password-reset/confirm/"

NO_EMAIL = {"REAL_EMAIL_ENABLED": False, "EMAIL_DEV_FALLBACK": False}
DEV_FALLBACK = {"REAL_EMAIL_ENABLED": False, "EMAIL_DEV_FALLBACK": True}
REAL_EMAIL = {"REAL_EMAIL_ENABLED": True, "EMAIL_DEV_FALLBACK": False}


def registration(**overrides):
    return {
        "email": "new.student@example.com",
        "password": PASSWORD,
        "first_name": "Juan",
        "last_name": "Dela Cruz",
        "school_id": "2026-00001",
        "course": "BSIT",
        **overrides,
    }


class LoginAndSessionTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.student = self.make_user("student@example.com")

    def login(self, password=PASSWORD):
        return self.client.post(LOGIN, {"email": "student@example.com", "password": password}, format="json")

    def test_login_returns_tokens(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_wrong_password_reason_is_in_non_field_errors(self):
        response = self.login("wrong-password")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["details"]["non_field_errors"], ["Invalid email or password."])

    def test_refresh_rotates_and_only_the_newest_refresh_token_works(self):
        # The apps must store the refresh token each refresh returns -
        # reusing the original one is exactly what logged users out.
        first_refresh = self.login().data["refresh"]
        rotated = self.client.post(REFRESH, {"refresh": first_refresh}, format="json")
        self.assertEqual(rotated.status_code, 200)
        self.assertIn("refresh", rotated.data)

        self.assertEqual(self.client.post(REFRESH, {"refresh": first_refresh}, format="json").status_code, 401)
        self.assertEqual(
            self.client.post(REFRESH, {"refresh": rotated.data["refresh"]}, format="json").status_code, 200
        )

    def test_login_is_rate_limited_per_email(self):
        for _ in range(10):
            self.login("wrong-password")
        self.assertEqual(self.login().status_code, 429)

    def test_unverified_student_can_log_in(self):
        self.student.is_email_verified = False
        self.student.save()
        self.assertEqual(self.login().status_code, 200)


@override_settings(**DEV_FALLBACK)
class RegistrationTests(BaseAPITestCase):
    def test_register_accepts_any_domain_by_default(self):
        response = self.client.post(REGISTER, registration(email="someone@gmail.com"), format="json")
        self.assertEqual(response.status_code, 201)
        # No verification step: the account is verified and logged in at once.
        self.assertTrue(response.data["user"]["is_email_verified"])
        self.assertIn("access", response.data)
        self.assertNotIn("dev_verify_url", response.data)

    def test_register_rejects_common_password(self):
        response = self.client.post(REGISTER, registration(password="password123"), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data["details"])

    def test_register_rejects_password_similar_to_email(self):
        response = self.client.post(
            REGISTER, registration(email="juandelacruz2026@example.com", password="juandelacruz2026"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data["details"])

    @override_settings(ALLOWED_EMAIL_DOMAINS=["ustp.edu.ph"])
    def test_register_enforces_school_domain_when_configured(self):
        rejected = self.client.post(REGISTER, registration(email="someone@gmail.com"), format="json")
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("email", rejected.data["details"])
        accepted = self.client.post(REGISTER, registration(email="someone@ustp.edu.ph"), format="json")
        self.assertEqual(accepted.status_code, 201)

    @override_settings(**REAL_EMAIL)
    def test_register_sends_a_welcome_email_without_a_link(self):
        with mock.patch("users.services.send_mail") as send:
            response = self.client.post(REGISTER, registration(), format="json")
        self.assertEqual(response.status_code, 201)
        send.assert_called_once()
        email = send.call_args.kwargs
        self.assertEqual(email["subject"], "Welcome to ChatDesk")
        self.assertEqual(email["recipient_list"], ["new.student@example.com"])
        self.assertIn("Thank you for registering on ChatDesk", email["message"])
        self.assertNotIn("http", email["message"])

    @override_settings(**REAL_EMAIL)
    def test_failed_welcome_email_still_creates_the_account(self):
        with mock.patch("users.services.send_mail", side_effect=SMTPException("Gmail down")):
            response = self.client.post(REGISTER, registration(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(email="new.student@example.com").exists())
        self.assertIn("access", response.data)

    def test_verification_endpoints_are_gone(self):
        # Checked by URL lookup: rendering Django 5.0's 404 page fails under
        # Python 3.14 (fine on the server's 3.12).
        from django.urls import Resolver404, resolve

        for path in ("/api/v1/auth/verify-email/resend/", "/api/v1/auth/verify-email/1/sometoken/"):
            with self.assertRaises(Resolver404):
                resolve(path)


class PasswordResetTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.student = self.make_user("student@example.com")

    def request_code(self):
        return self.client.post(RESET_REQUEST, {"email": "student@example.com"}, format="json")

    def confirm(self, code, password="Brand-New-Pass-2026"):
        return self.client.post(
            RESET_CONFIRM,
            {"email": "student@example.com", "code": code, "new_password": password},
            format="json",
        )

    def issue_code(self):
        """Create a code directly (bypassing the 60s request cooldown)."""
        with override_settings(**DEV_FALLBACK):
            PasswordResetCode.objects.filter(user=self.student).update(created_at="2000-01-01T00:00:00Z")
            return self.request_code().data["dev_code"]

    @override_settings(**NO_EMAIL)
    def test_code_never_returned_outside_debug(self):
        response = self.request_code()
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("dev_code", response.data)

    @override_settings(**DEV_FALLBACK)
    def test_code_returned_in_debug_without_email(self):
        self.assertIn("dev_code", self.request_code().data)

    @override_settings(**REAL_EMAIL)
    def test_email_failure_looks_like_success_and_leaves_no_code(self):
        with mock.patch("users.services.send_mail", side_effect=SMTPException("Gmail down")):
            failed = self.request_code()
        unknown = self.client.post(RESET_REQUEST, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(failed.status_code, 200)
        self.assertEqual(failed.data, unknown.data)
        self.assertFalse(PasswordResetCode.objects.filter(user=self.student, is_used=False).exists())

    def test_only_the_newest_code_is_valid(self):
        old_code = self.issue_code()
        new_code = self.issue_code()
        if old_code == new_code:
            self.skipTest("Random codes collided")
        self.assertEqual(self.confirm(old_code).status_code, 400)
        self.assertEqual(self.confirm(new_code).status_code, 200)

    def test_code_is_burned_after_five_wrong_guesses(self):
        code = self.issue_code()
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(PasswordResetCode.MAX_ATTEMPTS):
            self.assertEqual(self.confirm(wrong).status_code, 400)
        self.assertEqual(self.confirm(code).status_code, 400)

    def test_successful_reset_signs_out_existing_sessions(self):
        old_refresh = self.client.post(
            LOGIN, {"email": "student@example.com", "password": PASSWORD}, format="json"
        ).data["refresh"]
        self.assertEqual(self.confirm(self.issue_code()).status_code, 200)
        self.assertEqual(self.client.post(REFRESH, {"refresh": old_refresh}, format="json").status_code, 401)
        relogin = self.client.post(
            LOGIN, {"email": "student@example.com", "password": "Brand-New-Pass-2026"}, format="json"
        )
        self.assertEqual(relogin.status_code, 200)


class ProfilePictureTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        self.student = self.make_user("student@example.com")
        self.client = self.client_for(self.student)

    def upload(self, image, fmt="PNG", name="photo.png"):
        buffer = BytesIO()
        image.save(buffer, format=fmt)
        file = SimpleUploadedFile(name, buffer.getvalue(), content_type=f"image/{fmt.lower()}")
        with override_settings(MEDIA_ROOT=self.media_root):
            return self.client.patch("/api/v1/auth/me/", {"profile_picture": file}, format="multipart")

    def test_large_picture_is_shrunk_to_512(self):
        response = self.upload(Image.new("RGB", (2000, 1000), "navy"))
        self.assertEqual(response.status_code, 200)
        self.student.refresh_from_db()
        with Image.open(os.path.join(self.media_root, self.student.profile_picture.name)) as saved:
            self.assertLessEqual(max(saved.size), 512)

    def test_picture_over_2mb_is_rejected(self):
        noise = Image.frombytes("RGB", (1200, 1200), os.urandom(1200 * 1200 * 3))
        response = self.upload(noise)
        self.assertEqual(response.status_code, 400)
        self.assertIn("2 MB", response.data["details"]["profile_picture"][0])


class CollegeTests(BaseAPITestCase):
    def test_every_course_belongs_to_exactly_one_college(self):
        from .colleges import COLLEGES

        grouped = [course for college in COLLEGES for course in college["courses"]]
        self.assertEqual(sorted(grouped), sorted(code for code, _ in User.Course.choices))

    def test_college_list_endpoint(self):
        client = self.client_for(self.make_user("student@example.com"))
        data = client.get("/api/v1/colleges/").data
        it = next(c for c in data if c["key"] == "it_computing")
        self.assertIn({"code": "BSIT", "name": "BS Information Technology"}, it["courses"])
        science = next(c for c in data if c["key"] == "science_math")
        self.assertIn({"code": "BSCHEM", "name": "BS Chemistry"}, science["courses"])
        education = next(c for c in data if c["key"] == "education")
        self.assertIn(
            {"code": "BEED", "name": "BS Elementary Education", "retired": True}, education["courses"]
        )


@override_settings(**DEV_FALLBACK)
class CourseListTests(BaseAPITestCase):
    """The November 2026 official course list: one code per major, and the
    older codes kept only for accounts that already have them."""

    def setUp(self):
        super().setUp()
        self.admin = self.client_for(
            self.make_user("super@example.com", User.Role.SUPERADMIN, is_staff=True, is_superuser=True)
        )

    def test_register_with_a_major(self):
        response = self.client.post(REGISTER, registration(course="BSELT-TN"), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.get(email="new.student@example.com").course, "BSELT-TN")

    def test_register_with_nursing_still_allowed(self):
        response = self.client.post(REGISTER, registration(course="BSN"), format="json")
        self.assertEqual(response.status_code, 201)

    def test_register_rejects_a_retired_course(self):
        for course in ("BEED", "BSELT", "BTLED"):
            response = self.client.post(REGISTER, registration(course=course), format="json")
            self.assertEqual(response.status_code, 400, course)
            self.assertIn("course", response.data["details"])

    def test_existing_account_keeps_a_retired_course(self):
        student = self.make_user("old.student@example.com", course="BEED")
        response = self.admin.patch(f"/api/v1/users/{student.user_id}/", {"course": "BEED", "first_name": "Ana"}, format="json")
        self.assertEqual(response.status_code, 200)
        student.refresh_from_db()
        self.assertEqual((student.course, student.first_name), ("BEED", "Ana"))

    def test_account_cannot_be_moved_onto_a_retired_course(self):
        student = self.make_user("student@example.com", course="BSIT")
        response = self.admin.patch(f"/api/v1/users/{student.user_id}/", {"course": "BSED"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.admin.patch(f"/api/v1/users/{student.user_id}/", {"course": "BSED-MATH"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_admin_cannot_create_an_account_with_a_retired_course(self):
        payload = {"email": "made@example.com", "password": PASSWORD, "first_name": "Made", "last_name": "Here",
                   "role": "student", "course": "BSESM", "school_id": "2026-00099"}
        self.assertEqual(self.admin.post("/api/v1/users/", payload, format="json").status_code, 400)
        payload["course"] = "BSESM-PSDE"
        self.assertEqual(self.admin.post("/api/v1/users/", payload, format="json").status_code, 201)

    def test_every_code_fits_the_database_column(self):
        limit = User._meta.get_field("course").max_length
        self.assertTrue(all(len(code) <= limit for code, _ in User.Course.choices))


@override_settings(**DEV_FALLBACK)
class InputValidationTests(BaseAPITestCase):
    def test_school_id_must_be_digits_and_hyphens(self):
        for bad in ("abc123", "12", "2026_0001", "-202600001"):
            response = self.client.post(REGISTER, registration(school_id=bad), format="json")
            self.assertEqual(response.status_code, 400, bad)
            self.assertIn("school_id", response.data["details"])
        for good in ("2023304440", "2026-00006"):
            response = self.client.post(
                REGISTER, registration(school_id=good, email=f"{good}@example.com"), format="json"
            )
            self.assertEqual(response.status_code, 201, good)

    def test_names_must_contain_letters(self):
        response = self.client.post(REGISTER, registration(first_name="1234", last_name="   "), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("first_name", response.data["details"])
        self.assertIn("last_name", response.data["details"])

    def test_admin_created_accounts_follow_password_rules(self):
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        response = superadmin.post(
            "/api/v1/users/",
            {"email": "new@example.com", "password": "12345678", "first_name": "New", "last_name": "User"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data["details"])


class BugFixTests(BaseAPITestCase):
    """Regression tests for the November 2026 bug review."""

    def setUp(self):
        super().setUp()
        self.office = Office.objects.create(name="Test Student Affairs", code="TSA")
        self.superadmin = self.make_user("super@example.com", User.Role.SUPERADMIN, is_staff=True, is_superuser=True)
        self.admin = self.client_for(self.superadmin)

    def test_demoting_a_super_admin_removes_django_admin_access(self):
        other = self.make_user("other.super@example.com", User.Role.SUPERADMIN, is_staff=True, is_superuser=True)
        response = self.admin.patch(f"/api/v1/users/{other.user_id}/", {"role": "student", "course": "BSIT"}, format="json")
        self.assertEqual(response.status_code, 200)
        other.refresh_from_db()
        self.assertFalse(other.is_staff)
        self.assertFalse(other.is_superuser)

    def test_promoting_to_super_admin_matches_a_created_one(self):
        student = self.make_user("student@example.com")
        self.admin.patch(f"/api/v1/users/{student.user_id}/", {"role": "superadmin"}, format="json")
        student.refresh_from_db()
        self.assertTrue(student.is_staff)
        self.assertTrue(student.is_superuser)

    def test_editing_a_name_keeps_the_flags(self):
        other = self.make_user("other.super@example.com", User.Role.SUPERADMIN, is_staff=True, is_superuser=True)
        self.admin.patch(f"/api/v1/users/{other.user_id}/", {"first_name": "Renamed"}, format="json")
        other.refresh_from_db()
        self.assertTrue(other.is_superuser)

    def test_bad_filter_values_return_400_not_500(self):
        student = self.client_for(self.make_user("student@example.com"))
        for client, url in [
            (self.admin, "/api/v1/faqs/?office=abc"),
            (student, "/api/v1/faqs/popular/?office=abc"),
            (self.admin, "/api/v1/tickets/?office=abc"),
            (self.admin, "/api/v1/inquiry-logs/?office=abc"),
            (self.admin, "/api/v1/inquiry-logs/?user_id=abc"),
            (self.admin, "/api/v1/inquiry-logs/unanswered/?office=abc"),
            (self.admin, "/api/v1/analytics/overview/?office=abc"),
            (self.admin, "/api/v1/analytics/overview/?date_from=abc"),
            (self.admin, "/api/v1/inquiry-logs/?date_from=2026-13-45"),
        ]:
            self.assertEqual(client.get(url).status_code, 400, url)
        # Valid values still work.
        self.assertEqual(self.admin.get(f"/api/v1/tickets/?office={self.office.office_id}").status_code, 200)
        self.assertEqual(self.admin.get("/api/v1/tickets/?office=unassigned").status_code, 200)
        self.assertEqual(self.admin.get("/api/v1/analytics/overview/?date_from=2026-11-01").status_code, 200)

    def test_deactivated_user_cannot_refresh_their_login(self):
        self.make_user("student@example.com")
        tokens = self.client.post("/api/v1/auth/login/", {"email": "student@example.com", "password": PASSWORD}, format="json").data
        self.assertEqual(self.client.post("/api/v1/auth/token/refresh/", {"refresh": tokens["refresh"]}, format="json").status_code, 200)
        User.objects.filter(email="student@example.com").update(is_active=False)
        latest = tokens["refresh"]
        response = self.client.post("/api/v1/auth/token/refresh/", {"refresh": latest}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_student_with_history_cannot_be_deleted(self):
        student = self.make_user("student@example.com")
        Ticket.objects.create(user=student, subject_category="x", issue_description="x")
        response = self.admin.delete(f"/api/v1/users/{student.user_id}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Deactivate", response.data["message"])
        self.assertTrue(User.objects.filter(pk=student.pk).exists())

        fresh = self.make_user("fresh@example.com")
        self.assertEqual(self.admin.delete(f"/api/v1/users/{fresh.user_id}/").status_code, 204)

    def test_faq_keyword_cannot_be_a_system_intent(self):
        response = self.admin.post("/api/v1/faqs/", {
            "intent_keyword": "unresolved_complex_query", "question_text": "Reserved keyword test?",
            "answer_content": "This answer is long enough for the test.", "category": "General",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("intent_keyword", response.data["details"])


class SecondBugReviewTests(BaseAPITestCase):
    """Regression tests for the second November 2026 bug review."""

    def setUp(self):
        super().setUp()
        self.office = Office.objects.create(name="Test Student Affairs", code="TSA")
        self.superadmin = self.make_user("super@example.com", User.Role.SUPERADMIN, is_staff=True, is_superuser=True)
        self.admin = self.client_for(self.superadmin)
        self.student = self.make_user("student@example.com")

    def test_admin_with_announcements_cannot_be_deleted(self):
        other = self.make_user("other.super@example.com", User.Role.SUPERADMIN)
        announcement = Announcement.objects.create(title="Hi", content="Welcome back!", created_by=other)
        response = self.admin.delete(f"/api/v1/users/{other.user_id}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Announcement.objects.filter(pk=announcement.pk).exists())

    def test_unicode_digits_in_a_filter_return_400(self):
        self.assertEqual(self.admin.get("/api/v1/tickets/", {"office": "²"}).status_code, 400)

    def test_staff_message_on_a_chatbot_answer_opens_it_for_staff(self):
        ticket = Ticket.objects.create(
            user=self.student, subject_category="General", issue_description="x", office=self.office,
            status=Ticket.Status.RESOLVED, resolution="The FAQ answer.", resolved_at=timezone.now(),
            is_ai_resolved=True,
        )
        response = self.admin.post(f"/api/v1/tickets/{ticket.ticket_id}/messages/", {"body": "More details?"}, format="json")
        self.assertEqual(response.status_code, 201)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.ACTIVE)
        self.assertFalse(ticket.is_ai_resolved)
        self.assertIsNone(ticket.resolved_at)
        self.assertIsNone(ticket.resolution)
        self.assertIsNotNone(ticket.reopened_at)
        self.assertIn("ChatDesk answered: The FAQ answer.", ticket.conversation_context)

    def test_reopening_a_ticket_clears_its_resolved_date(self):
        ticket = Ticket.objects.create(user=self.student, subject_category="General", issue_description="x")
        url = f"/api/v1/tickets/{ticket.ticket_id}/"
        self.admin.patch(url, {"status": "resolved", "resolution": "Here is the answer."}, format="json")
        self.admin.patch(url, {"status": "pending"}, format="json")
        ticket.refresh_from_db()
        self.assertIsNone(ticket.resolved_at)
        self.assertIsNone(ticket.resolved_by)

    def test_overdue_ticket_in_an_office_without_admins_reaches_super_admins(self):
        lonely = Office.objects.create(name="Office With No Admin", code="NOADM")
        ticket = Ticket.objects.create(user=self.student, subject_category="General", issue_description="x", office=lonely)
        Ticket.objects.filter(pk=ticket.pk).update(waiting_since=timezone.now() - timedelta(days=10))
        out = StringIO()
        call_command("send_overdue_reminders", "--dry-run", stdout=out)
        self.assertIn("To: super@example.com", out.getvalue())
        self.assertIn(ticket.ticket_code, out.getvalue())
        self.assertIn("no active Office Admin", out.getvalue())

    def test_faq_keyword_must_be_unique_ignoring_case(self):
        Faq.objects.create(intent_keyword="enrollment_steps", question_text="How do I enroll?",
                           answer_content="Follow the enrollment steps.", category="Enrollment")
        response = self.admin.post("/api/v1/faqs/", {
            "intent_keyword": "Enrollment_Steps", "question_text": "How to enroll?",
            "answer_content": "This answer is long enough for the test.", "category": "Enrollment",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("intent_keyword", response.data["details"])


class ThirdBugReviewTests(BaseAPITestCase):
    """Regression tests for the third November 2026 bug review."""

    def setUp(self):
        super().setUp()
        self.superadmin = self.make_user("super@example.com", User.Role.SUPERADMIN)
        self.admin = self.client_for(self.superadmin)

    def test_user_list_sorts_z_to_a_on_the_server(self):
        for first in ("Ana", "Zed", "Mia"):
            User.objects.create_user(email=f"{first.lower()}@example.com", password=PASSWORD,
                                     first_name=first, last_name="User")
        names = [u["first_name"] for u in self.admin.get("/api/v1/users/", {"sort": "desc"}).data["results"]]
        self.assertEqual(names[:3], ["Zed", "Test", "Mia"])
        names = [u["first_name"] for u in self.admin.get("/api/v1/users/").data["results"]]
        self.assertEqual(names[0], "Ana")

    def test_faq_list_filters_unassigned(self):
        office = Office.objects.create(name="Test Student Affairs", code="TSA")
        body = {"answer_content": "An answer long enough.", "category": "General"}
        Faq.objects.create(intent_keyword="general_one", question_text="General?", **body)
        Faq.objects.create(intent_keyword="office_one", question_text="Office?", office=office, **body)
        rows = self.admin.get("/api/v1/faqs/", {"office": "unassigned"}).data["results"]
        self.assertEqual([r["intent_keyword"] for r in rows], ["general_one"])


class FourthBugReviewTests(BaseAPITestCase):
    """Regression tests for the fourth (end-to-end) November 2026 bug review."""

    def setUp(self):
        super().setUp()
        self.office = Office.objects.create(name="Test Student Affairs", code="TSA")
        self.student = self.make_user("student@example.com")
        self.staff = self.client_for(self.make_user("super@example.com", User.Role.SUPERADMIN))

    def ai_ticket(self):
        return Ticket.objects.create(
            user=self.student, subject_category="General", issue_description="x", office=self.office,
            status=Ticket.Status.RESOLVED, resolution="Bring your ID.\nThen sign the form.",
            resolved_at=timezone.now(), is_ai_resolved=True,
        )

    def test_chatbot_answer_stays_visible_after_staff_message(self):
        ticket = self.ai_ticket()
        self.assertIsNone(self.client_for(self.student).get(f"/api/v1/tickets/{ticket.ticket_id}/").data["chatbot_answer"])
        self.staff.post(f"/api/v1/tickets/{ticket.ticket_id}/messages/", {"body": "Anything else?"}, format="json")
        data = self.client_for(self.student).get(f"/api/v1/tickets/{ticket.ticket_id}/").data
        self.assertEqual(data["chatbot_answer"], "Bring your ID.\nThen sign the form.")
        self.assertIsNone(data["resolution"])

    def test_chatbot_answer_stays_visible_after_follow_up(self):
        ticket = self.ai_ticket()
        response = self.client_for(self.student).post(f"/api/v1/tickets/{ticket.ticket_id}/follow-up/", {}, format="json")
        self.assertEqual(response.data["chatbot_answer"], "Bring your ID.\nThen sign the form.")

    def test_campus_sized_sign_up_and_login_limits(self):
        from django.conf import settings
        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertGreaterEqual(int(rates["register"].split("/")[0]), 100)
        self.assertGreaterEqual(int(rates["login"].split("/")[0]), 100)
        self.assertEqual(rates["login_email"], "10/min")
