from config.testing import BaseAPITestCase
from users.models import User


class AnnouncementPermissionTests(BaseAPITestCase):
    def test_students_read_and_only_superadmins_post(self):
        student = self.client_for(self.make_user("student@example.com"))
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        payload = {"title": "Enrollment opens", "content": "Enrollment opens Monday."}

        self.assertEqual(student.post("/api/v1/announcements/", payload, format="json").status_code, 403)
        self.assertEqual(superadmin.post("/api/v1/announcements/", payload, format="json").status_code, 201)
        self.assertEqual(student.get("/api/v1/announcements/").data["count"], 1)

    def test_blank_title_or_content_is_rejected(self):
        superadmin = self.client_for(self.make_user("super@example.com", role=User.Role.SUPERADMIN))
        response = superadmin.post("/api/v1/announcements/", {"title": "   ", "content": "  "}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("title", response.data["details"])
        self.assertIn("content", response.data["details"])
