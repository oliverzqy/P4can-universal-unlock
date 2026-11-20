#!/usr/bin/env python3
"""Serve a loopback-only dashboard preview with synthetic, read-only responses."""

from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parents[1]
PROFILE = {
    "ok": True, "setupMode": False, "nvsError": False,
    "migrationNotice": False, "profile": 3, "topology": 2, "turn": 1,
    "canA": "BODY", "canB": "CHASSIS", "canExtra": "PARTY",
    "canBusCount": 3, "routeABus": 1, "routeBBus": 2,
    "nagSupported": False, "nagTorqueSupported": False,
    "nagTsl9Supported": False, "advancedEapSupported": False,
    "pedalMapSupported": False, "euUnlockSupported": False,
    "bodyControlsSupported": False, "tlsscRestoreSupported": False,
    "bannedSupported": False,
}
FEATURES = {
    "ok": True, "lab": True, "s3xy": False, "nag": False,
    "banned": False, "tlsscRestore": False,
    "advancedEapSupported": False, "euUnlockSupported": False,
    "pedalMapSupported": False, "bodyControlsSupported": False,
    "tlsscRestoreSupported": False, "bannedSupported": False,
}
R79 = {
    "txState": "ADMIN HOLD", "txReason": "OFFLINE",
    "txOk": 0, "txFail": 0, "lastTxValid": False,
}
TRAFFIC = {
    f"can{n}{field}": value
    for n in (1, 2, 3)
    for field, value in (
        ("State", 0), ("Ready", False), ("TrafficSeen", False),
        ("TrafficOnline", False), ("TrafficAgeMs", 0),
    )
}
FAST = {
    "nag": {"torque": 0, "apActive": False},
    "blink": {"dasStateValid": False}, "summon": {},
    "cantraffic": TRAFFIC, "r79": R79,
}
SLOW = {
    "blink": {"enabled": False}, "summon": {"tlssc": False},
    "s3xy": {"bluetoothEnabled": False}, "lab3f8": {},
}


def api_fixture(path: str, query: str) -> dict | None:
    """No proxy, device connection, file writes, or CAN transport exists here."""
    if path == "/api/profile/status":
        return PROFILE
    if path == "/api/features/status":
        return FEATURES
    if path in ("/api/driver-monitoring/config", "/api/isa-suppression/config"):
        return {"enabled": False, "supported": False}
    if path == "/api/continuous-ap/config":
        return {
            "enabled": False, "method": 0, "supported": False,
            "effectiveEnabled": False, "signalReadiness": "Unavailable",
            "state": "Disabled", "blockedReason": "OFFLINE",
        }
    if path == "/api/vision-control/stats":
        return {"supported": False, "busSupported": False, "requestDisabled": False}
    if path == "/api/snapshot":
        group = parse_qs(query).get("groups", [""])[0]
        if group == "lab-lite":
            return {"r79": R79, "alc": {"alcValid": False, "lane239Valid": False}}
        if group == "settings-lite":
            return {"system": {"fwVersion": "OFFLINE PREVIEW"}, **SLOW}
        return {"fast": FAST, "slow": SLOW, **FAST, **SLOW}
    if path in ("/api/heartbeat", "/api/system/heartbeat"):
        return {"ok": True}
    if path == "/api/system/stats":
        return {"fwVersion": "OFFLINE PREVIEW", "networkState": "OFFLINE", **TRAFFIC}
    if path.startswith("/api/"):
        return {"ok": False, "supported": False, "enabled": False, "error": "offline preview"}
    return None


def preview_html() -> bytes:
    html = (ROOT / "dashboard_source.html").read_text(encoding="utf-8")
    banner = (
        '<div id="offlinePreviewBanner" role="status" '
        'style="position:sticky;top:0;z-index:2147483647;padding:12px 18px;'
        'background:#fff1c2;color:#382900;font:600 14px/1.5 system-ui;'
        'text-align:center;overflow-wrap:anywhere">'
        '本地离线预览 · 全部为合成数据 · 未连接车辆或 CAN 设备</div>'
    )
    # The banner belongs to the preview server, not the embedded vehicle page.
    body_start = html.index(">", html.index("<body")) + 1
    return (html[:body_start] + banner + html[body_start:]).encode("utf-8")


class PreviewHandler(BaseHTTPRequestHandler):
    def reply(self, status: int, payload: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        # Existing scripts can only fetch this local fixture server; no forwarding.
        self.send_header(
            "Content-Security-Policy",
            "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
        )
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        parts = urlsplit(self.path)
        if parts.path in ("/", "/dashboard_source.html"):
            self.reply(200, preview_html(), "text/html; charset=utf-8")
            return
        fixture = api_fixture(parts.path, parts.query)
        if fixture is not None:
            data = json.dumps(fixture, ensure_ascii=False).encode("utf-8")
            self.reply(200, data, "application/json; charset=utf-8")
            return
        assets = {
            "/fonts/geist-latin.woff2": "fonts/geist-latin.woff2",
            "/fonts/geist-mono-latin.woff2": "fonts/geist-mono-latin.woff2",
            "/fonts/geist-lab.woff2": "fonts/geist-latin.woff2",
            "/fonts/geist-mono-lab.woff2": "fonts/geist-mono-latin.woff2",
        }
        if parts.path in assets:
            self.reply(200, (ROOT / assets[parts.path]).read_bytes(), "font/woff2")
            return
        self.reply(404, b"Not found", "text/plain; charset=utf-8")

    def reject_write(self) -> None:
        self.reply(405, b"Offline preview is read-only", "text/plain; charset=utf-8")

    do_POST = reject_write
    do_PUT = reject_write
    do_PATCH = reject_write
    do_DELETE = reject_write


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    with ThreadingHTTPServer(("127.0.0.1", args.port), PreviewHandler) as server:
        print(f"Offline preview: http://127.0.0.1:{server.server_port}", flush=True)
        print("Synthetic data only; no vehicle/CAN connection. Ctrl+C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
