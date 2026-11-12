import json
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import APP, authorized_request, fetch_media_bytes, required_env, valid_service_account_json

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

    def test_lowercase_bearer_authorization_is_accepted(self):
        with patch.dict(os.environ, {"BRIDGE_API_TOKEN": "test-token"}, clear=False):
            authorized_request("bearer test-token")

    def test_service_account_json_validation_rejects_invalid_payload(self):
        self.assertFalse(valid_service_account_json(""))
        self.assertFalse(valid_service_account_json("{not-json}"))
        self.assertFalse(valid_service_account_json(json.dumps({"type": "service_account"})))
        incomplete = {
            "type": "service_account",
            "project_id": "demo",
            "client_email": "bridge@example.iam.gserviceaccount.com",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        self.assertFalse(valid_service_account_json(json.dumps(incomplete)))
        complete = {
            **incomplete,
            "private_key": "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----",
        }
        self.assertTrue(valid_service_account_json(json.dumps(complete)))


    def test_oversized_drive_file_is_rejected_before_download(self):
        class Request:
            def execute(self):
                return {"size": str(20 * 1024 * 1024)}

        class Files:
            def get(self, **kwargs):
                return Request()

            def get_media(self, **kwargs):
                raise AssertionError("oversized content must not be downloaded")

        class Service:
            def files(self):
                return Files()

        with self.assertRaisesRegex(ValueError, "exceeds configured"):
            fetch_media_bytes(Service(), "large-file", "text/plain")

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
        self.assertIn("GOOGLE_DRIVE_ALLOWED_FOLDER_IDS", body["missing_configuration"])

    def test_readiness_rejects_malformed_service_account_json(self):
        with patch.dict(
            os.environ,
            {
                "BRIDGE_API_TOKEN": "test-token",
                "GOOGLE_SERVICE_ACCOUNT_JSON": '{"type": "service_account"}',
                "GEMINI_API_KEY": "test-gemini-key",
                "GEMINI_MODEL": "gemini-2.0-flash",
                "GOOGLE_DRIVE_ALLOWED_FOLDER_IDS": "folder-123",
            },
            clear=False,
        ):
            response = client.get("/readyz")
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertIn("GOOGLE_SERVICE_ACCOUNT_JSON", body["missing_configuration"])


if __name__ == "__main__":
    unittest.main()
