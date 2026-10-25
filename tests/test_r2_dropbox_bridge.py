import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "r2-dropbox-bridge.py"
SPEC = importlib.util.spec_from_file_location("r2_dropbox_bridge", MODULE_PATH)
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


class BridgePolicyTests(unittest.TestCase):
    def test_processed_video_is_eligible(self):
        self.assertTrue(bridge.eligible({
            ".tag": "file",
            "path_lower": "/resofit/bigo/hosts/123/processed/123-20261025t120000z.mp4",
        }))

    def test_google_business_derivative_is_eligible(self):
        self.assertTrue(bridge.eligible({
            ".tag": "file",
            "path_lower": "/resofit/bigo/hosts/123/processed/google-business/123-short.mp4",
        }))

    def test_cover_image_is_eligible(self):
        self.assertTrue(bridge.eligible({
            ".tag": "file",
            "path_lower": "/resofit/bigo/hosts/123/metadata/123-cover.jpg",
        }))

    def test_raw_capture_is_not_eligible(self):
        self.assertFalse(bridge.eligible({
            ".tag": "file",
            "path_lower": "/resofit/bigo/hosts/123/raw-captures/123-raw.mp4",
        }))

    def test_json_metadata_is_not_eligible(self):
        self.assertFalse(bridge.eligible({
            ".tag": "file",
            "path_lower": "/resofit/bigo/hosts/123/metadata/123.json",
        }))

    def test_folder_is_not_eligible(self):
        self.assertFalse(bridge.eligible({
            ".tag": "folder",
            "path_lower": "/resofit/bigo/hosts/123/processed",
        }))

    def test_processed_key_preserves_relative_path(self):
        self.assertEqual(
            bridge.r2_key_from_dropbox_path(
                "/ResoFit/BIGO/hosts/123/processed/123-clip.mp4"
            ),
            "public/bigo/hosts/123/processed/123-clip.mp4",
        )

    def test_google_business_key_preserves_subfolder(self):
        self.assertEqual(
            bridge.r2_key_from_dropbox_path(
                "/ResoFit/BIGO/hosts/123/processed/google-business/123-short.mp4"
            ),
            "public/bigo/hosts/123/processed/google-business/123-short.mp4",
        )

    def test_cover_key_uses_metadata_namespace(self):
        self.assertEqual(
            bridge.r2_key_from_dropbox_path(
                "/ResoFit/BIGO/hosts/123/metadata/123-cover.jpg"
            ),
            "public/bigo/hosts/123/metadata/123-cover.jpg",
        )

    def test_old_media_is_excluded_from_bootstrap_window(self):
        cutoff = datetime(2026, 10, 25, tzinfo=timezone.utc)
        self.assertFalse(bridge.recent_enough({
            "server_modified": "2026-10-24T23:59:59Z"
        }, cutoff))
        self.assertTrue(bridge.recent_enough({
            "server_modified": "2026-10-25T00:00:00Z"
        }, cutoff))


if __name__ == "__main__":
    unittest.main()
