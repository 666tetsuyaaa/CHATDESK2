from unittest import mock

from rest_framework.test import APIClient

from config.testing import BaseAPITestCase


class HealthTests(BaseAPITestCase):
    def test_ok_without_login(self):
        response = APIClient().get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "ok"})

    def test_503_when_the_database_is_down(self):
        with mock.patch("config.health.connection.cursor", side_effect=Exception("db down")):
            response = APIClient().get("/api/v1/health/")
        self.assertEqual(response.status_code, 503)
