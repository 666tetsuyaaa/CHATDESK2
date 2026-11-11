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
