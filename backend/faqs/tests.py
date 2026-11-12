from django.core.management import call_command
from io import StringIO
from config.testing import BaseAPITestCase
from inquiry_logs.models import InquiryLog
from users.models import User

from .models import Faq


def faq_payload(**overrides):
    return {
        "intent_keyword": "lost_id",
        "question_text": "How do I replace a lost school ID?",
        "answer_content": "File a request at the OSA window with an affidavit of loss.",
        "category": "General",
        **overrides,
    }


class FaqValidationTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.client = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))

    def test_valid_faq_is_saved(self):
        self.assertEqual(self.client.post("/api/v1/faqs/", faq_payload(), format="json").status_code, 201)

    def test_placeholder_answer_is_rejected(self):
        response = self.client.post("/api/v1/faqs/", faq_payload(answer_content="OSA ONLY"), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("answer_content", response.data["details"])

    def test_broken_character_is_rejected(self):
        response = self.client.post(
            "/api/v1/faqs/",
            faq_payload(answer_content="Apply for Admission � visit the admissions website."),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("broken character", response.data["details"]["answer_content"][0])


class PopularFaqTests(BaseAPITestCase):
    def test_most_answered_faqs_come_first_and_list_is_padded(self):
        student = self.make_user("student@example.com")
        for keyword in ("a_faq", "b_faq", "c_faq", "d_faq"):
            Faq.objects.create(
                intent_keyword=keyword, question_text=f"Question {keyword}?",
                answer_content="A long enough answer.", category="General",
            )
        for _ in range(3):
            InquiryLog.objects.create(user=student, user_message="x", detected_intent="c_faq", chatbot_response="y")
        # Escalated logs don't count as answers.
        InquiryLog.objects.create(
            user=student, user_message="x", detected_intent="unresolved_complex_query",
            chatbot_response="y", is_escalated=True,
        )
        data = self.client_for(student).get("/api/v1/faqs/popular/").data
        self.assertEqual(len(data), 3)
        self.assertEqual(data[0]["question_text"], "Question c_faq?")

    def test_intent_keyword_must_have_no_spaces(self):
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        response = superadmin.post("/api/v1/faqs/", faq_payload(intent_keyword="lost school id"), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("intent_keyword", response.data["details"])


class ImportFaqsCommandTests(BaseAPITestCase):
    """manage.py import_faqs: the FAQ master list loader."""

    def setUp(self):
        super().setUp()
        import json
        import tempfile
        from offices.models import Office

        self.osa, _ = Office.objects.get_or_create(code="OSA", defaults={"name": "Office of Student Affairs (OSA)"})
        Faq.objects.create(intent_keyword="test_placeholder", question_text="Old?", answer_content="An old placeholder answer.", category="General")
        Faq.objects.create(intent_keyword="old_placeholder", question_text="Older?", answer_content="An older placeholder answer.", category="General")
        Faq.objects.create(intent_keyword="staff_added", question_text="Staff?", answer_content="Added by staff in the dashboard.", category="General")
        rows = [
            {"intent_keyword": "get_school_id", "question_text": "How do I get my school ID?", "answer_content": "Go to the OSA office with your COR.", "category": "Clearance", "office_code": "OSA"},
            {"intent_keyword": "dorm_curfew", "question_text": "What is the dorm curfew?", "answer_content": "Ask the dorm manager for the curfew.", "category": "General", "office_code": "XYZ"},
        ]
        self.file = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(rows, self.file)
        self.file.close()

    def run_import(self, *args):
        out = StringIO()
        call_command("import_faqs", "--file", self.file.name, *args, stdout=out)
        return out.getvalue()

    def test_dry_run_changes_nothing(self):
        output = self.run_import()
        self.assertIn("add:       2", output)
        self.assertIn("Dry run", output)
        self.assertEqual(Faq.objects.count(), 3)

    def test_apply_adds_removes_test_faqs_and_keeps_others(self):
        output = self.run_import("--apply", "--remove", "old_placeholder")
        self.assertIn("offices not found in ChatDesk (those FAQs get no office): XYZ", output)
        self.assertEqual(
            sorted(Faq.objects.values_list("intent_keyword", flat=True)),
            ["dorm_curfew", "get_school_id", "staff_added"],
        )
        self.assertEqual(Faq.objects.get(intent_keyword="get_school_id").office, self.osa)
        self.assertIsNone(Faq.objects.get(intent_keyword="dorm_curfew").office)
        # Running it again changes nothing.
        self.assertIn("unchanged: 2", self.run_import("--apply"))
        self.assertEqual(Faq.objects.count(), 3)
