import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import APP, authorized_request, required_env

client = TestClient(APP)


class BridgeConfigTests(unittest.TestCase):
    def test_required_env_rejects_missing_value(self):
        with patch.dict(os.environ, {"BRIDGE_TEST_VALUE": ""}, clear=False):
            with self.assertRaises(RuntimeError):
                required_env("BRIDGE_TEST_VALUE")

    def test_authorization_rejects_wrong_token(self):
        with patch.dict(os.environ, {"BRIDGE_API_TOKEN": "test-token"}, clear=False):
            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as caught:
                authorized_request("Bearer wrong-token")
            self.assertEqual(caught.exception.status_code, 401)

    def test_health_endpoint_is_liveness_only(self):
        response = client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_readiness_reports_missing_config_without_secrets(self):
        keys = [
            "BRIDGE_API_TOKEN",
            "GOOGLE_SERVICE_ACCOUNT_JSON",
            "GEMINI_API_KEY",
            "GEMINI_MODEL",
            "GOOGLE_DRIVE_ALLOWED_FOLDER_IDS",
        ]
        with patch.dict(os.environ, {key: "" for key in keys}, clear=False):
            response = client.get("/readyz")
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertFalse(body["ready"])
        self.assertNotIn("GOOGLE_SERVICE_ACCOUNT_JSON", str(body.get("values", {})))
        self.assertIn("GOOGLE_DRIVE_ALLOWED_FOLDER_IDS", body["missing_configuration"])


if __name__ == "__main__":
    unittest.main()
