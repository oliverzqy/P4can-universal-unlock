"""Exercise the real loopback preview server without connecting to hardware."""

from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import threading
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("preview_offline_lab", ROOT / "tools/preview_offline_lab.py")
PREVIEW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREVIEW)


class PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), PREVIEW.PreviewHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join()
        cls.server.server_close()

    def request(self, path, method="GET"):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_dashboard_has_permanent_offline_banner(self):
        status, headers, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn("本地离线预览".encode(), body)
        self.assertIn("未连接车辆或 CAN 设备".encode(), body)
        self.assertIn("connect-src 'self'", headers["Content-Security-Policy"])
        self.assertIn(b"tlsscOffline", body)

    def test_boot_fixtures_are_disabled_and_lab_is_visible(self):
        status, _, body = self.request("/api/profile/status")
        profile = json.loads(body)
        self.assertEqual(status, 200)
        self.assertFalse(profile["setupMode"])
        self.assertFalse(profile["tlsscRestoreSupported"])
        _, _, body = self.request("/api/features/status")
        features = json.loads(body)
        self.assertTrue(features["lab"])
        self.assertFalse(features["tlsscRestore"])

    def test_dashboard_font_urls_are_served(self):
        for url in ("/fonts/geist-lab.woff2", "/fonts/geist-mono-lab.woff2"):
            status, headers, body = self.request(url)
            self.assertEqual(status, 200)
            self.assertEqual(headers["Content-Type"], "font/woff2")
            self.assertTrue(body.startswith(b"wOF2"))

    def test_telemetry_never_claims_live_can_or_successful_transmission(self):
        _, _, body = self.request("/api/snapshot?groups=home-fast")
        snapshot = json.loads(body)
        self.assertEqual(snapshot["fast"]["r79"]["txOk"], 0)
        for number in (1, 2, 3):
            self.assertFalse(snapshot["fast"]["cantraffic"][f"can{number}TrafficOnline"])

    def test_write_methods_are_rejected(self):
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            status, _, body = self.request("/api/features/status", method)
            self.assertEqual(status, 405)
            self.assertIn(b"read-only", body)

    def test_unknown_paths_cannot_read_files_or_proxy_requests(self):
        for path in ("/../../README.md", "/tools/preview_offline_lab.py", "/http://192.168.4.1/"):
            status, _, _ = self.request(path)
            self.assertEqual(status, 404)
        _, _, body = self.request("/api/snapshot?groups=lab-lite")
        self.assertFalse(json.loads(body)["alc"]["alcValid"])

    def test_existing_firmware_write_endpoints_are_rejected(self):
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            with self.subTest(method=method):
                status, _, _ = self.request("/api/features/tlssc-restore?enabled=1", method)
                self.assertEqual(status, 405)

    def test_unknown_api_is_explicitly_unavailable(self):
        _, _, body = self.request("/api/some-device-operation")
        response = json.loads(body)
        self.assertFalse(response["ok"])
        self.assertFalse(response["enabled"])

    def test_only_allowlisted_static_assets_are_served(self):
        for path in ("/../README.md", "/README.md", "/tools/preview_offline_lab.py"):
            with self.subTest(path=path):
                status, _, _ = self.request(path)
                self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
