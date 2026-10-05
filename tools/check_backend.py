#!/usr/bin/env python3
"""Compact M6.2 backend/API smoke check.

Uses only the Python standard library, a temporary SQLite database and an
in-process localhost server. No project data or user database is modified.
"""
from __future__ import annotations

import http.cookiejar
import json
import os
import tempfile
import threading
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.server import make_server


def fail(message: str) -> None:
    raise RuntimeError(message)


def main() -> int:
    previous = {key: os.environ.get(key) for key in ("PRAVMIR_DEV_RECOVERY", "PRAVMIR_QUIET", "PRAVMIR_SECURE_COOKIES")}
    os.environ["PRAVMIR_DEV_RECOVERY"] = "1"
    os.environ["PRAVMIR_QUIET"] = "1"
    os.environ["PRAVMIR_SECURE_COOKIES"] = "0"
    try:
        with tempfile.TemporaryDirectory(prefix="pravmir-backend-") as temp:
            db_path = Path(temp) / "smoke.db"
            server = make_server(ROOT, db_path, "127.0.0.1", 0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_address[1]}"
            jar = http.cookiejar.CookieJar()
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

            def call(method: str, path: str, payload: dict | None = None, *, csrf: str = "", origin: str = ""):
                body = None
                headers = {"Accept": "application/json"}
                if payload is not None:
                    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                    headers["Content-Type"] = "application/json"
                if csrf:
                    headers["X-Pravmir-CSRF"] = csrf
                if origin:
                    headers["Origin"] = origin
                request = urllib.request.Request(base + path, data=body, headers=headers, method=method)
                try:
                    response = opener.open(request, timeout=15)
                except urllib.error.HTTPError as exc:
                    response = exc
                raw = response.read()
                try:
                    parsed = json.loads(raw.decode("utf-8")) if raw else None
                except Exception as exc:
                    raise RuntimeError(f"non-JSON response {method} {path}: {raw[:200]!r}") from exc
                return response.status, parsed, response.headers

            try:
                status, health, _ = call("GET", "/api/v1/health")
                if status != 200 or health.get("api_version") != "1.0" or health.get("service") != "pravmir":
                    fail("health/API version failed")

                public_ids = {}
                for kind in ("place", "content", "route"):
                    status, payload, _ = call("GET", f"/api/v1/public/{kind}?limit=1")
                    if status != 200 or not payload.get("items"):
                        fail(f"public adapter failed for {kind}")
                    public_ids[kind] = payload["items"][0]["id"]
                status, _, _ = call("GET", "/api/v1/public/not-a-kind")
                if status != 404:
                    fail("unknown public kind must be 404")

                status, _, _ = call("POST", "/api/v1/auth/login", {"email": "x@example.org", "password": "not-a-real-password"}, origin="https://evil.example")
                if status != 403:
                    fail("cross-origin mutation must be rejected")

                account_a = "a@example.org"
                password_a = "correct-horse-a1"
                status, registered, headers = call("POST", "/api/v1/auth/register", {"email": account_a, "password": password_a, "display_name": "A"})
                if status != 201 or not registered.get("user") or not registered.get("csrf_token"):
                    fail("registration failed")
                cookies = "; ".join(headers.get_all("Set-Cookie") or [])
                if "HttpOnly" not in cookies or "SameSite=Lax" not in cookies:
                    fail("session cookie hardening missing")
                csrf_a = registered["csrf_token"]

                status, session, _ = call("GET", "/api/v1/account/session")
                if status != 200 or session.get("user", {}).get("email") != account_a or not session.get("csrf_token"):
                    fail("session lookup/CSRF rotation failed")
                csrf_a = session["csrf_token"]

                status, _, _ = call("PATCH", "/api/v1/account/profile", {"display_name": "No CSRF"})
                if status != 403:
                    fail("missing CSRF must be rejected")
                status, profile, _ = call("PATCH", "/api/v1/account/profile", {"display_name": "User A", "city": "Test City", "timezone": "Europe/Moscow"}, csrf=csrf_a)
                if status != 200 or profile.get("user", {}).get("display_name") != "User A":
                    fail("profile update failed")

                state_a = {
                    "schema_version": 1,
                    "local_user_id": "pm-local-user-device-a",
                    "storage_mode": "device_local",
                    "sync_status": "local_only",
                    "profile": {"display_name": "Local A", "email": "local-a@example.org", "updated_at": None},
                    "collections": {
                        "favorites": [{"ref": {"kind": "place", "id": public_ids["place"]}, "saved_at": None, "source": "user"}],
                        "read_later": [{"ref": {"kind": "content", "id": public_ids["content"]}, "saved_at": None, "source": "user"}],
                        "saved_routes": [{"ref": {"kind": "route", "id": public_ids["route"]}, "saved_at": None, "source": "legacy_migration"}],
                    },
                    "migration": {"legacy_keys_checked": ["favorites"], "migrated_refs": 1, "unresolved": [], "last_checked_at": None},
                }
                status, saved_a, _ = call("PUT", "/api/v1/account/my-pm", {"base_revision": 0, "state": state_a}, csrf=csrf_a)
                if status != 200 or saved_a.get("revision") != 1 or not saved_a.get("checksum"):
                    fail("first My PM save failed")
                status, conflict, _ = call("PUT", "/api/v1/account/my-pm", {"base_revision": 0, "state": state_a}, csrf=csrf_a)
                if status != 409 or conflict.get("revision") != 1:
                    fail("optimistic sync conflict failed")

                bad_state = dict(state_a); bad_state["schema_version"] = "broken"
                status, invalid, _ = call("PUT", "/api/v1/account/my-pm", {"base_revision": 1, "state": bad_state}, csrf=csrf_a)
                if status != 400 or invalid.get("error") != "invalid_state_schema":
                    fail("invalid state schema must be a 400")

                status, export_a, _ = call("GET", "/api/v1/account/export")
                if status != 200 or "password" in json.dumps(export_a).lower() or export_a.get("my_pm", {}).get("revision") != 1:
                    fail("safe account export failed")

                status, recovery, _ = call("POST", "/api/v1/auth/recovery/request", {"email": account_a})
                token = recovery.get("dev_recovery_token") if isinstance(recovery, dict) else None
                if status != 200 or not token:
                    fail("recovery token foundation failed")
                status, _, _ = call("POST", "/api/v1/auth/recovery/reset", {"token": token, "password": "correct-horse-a2"})
                if status != 200:
                    fail("recovery reset failed")
                status, _, _ = call("GET", "/api/v1/account/profile")
                if status != 401:
                    fail("password reset must invalidate sessions")

                status, login_a, _ = call("POST", "/api/v1/auth/login", {"email": account_a, "password": "correct-horse-a2"})
                if status != 200 or not login_a.get("csrf_token"):
                    fail("login after recovery failed")
                csrf_a = login_a["csrf_token"]
                status, remote_a, _ = call("GET", "/api/v1/account/my-pm")
                if status != 200 or remote_a.get("revision") != 1 or remote_a.get("state", {}).get("local_user_id") != "pm-local-user-device-a":
                    fail("server persistence after recovery failed")
                status, _, _ = call("POST", "/api/v1/auth/logout", {}, csrf=csrf_a)
                if status != 200:
                    fail("logout failed")

                account_b = "b@example.org"
                status, registered_b, _ = call("POST", "/api/v1/auth/register", {"email": account_b, "password": "correct-horse-b1", "display_name": "B"})
                if status != 201:
                    fail("second account registration failed")
                csrf_b = registered_b["csrf_token"]
                status, remote_b, _ = call("GET", "/api/v1/account/my-pm")
                if status != 200 or remote_b.get("revision") != 0 or remote_b.get("state") is not None:
                    fail("private My PM state leaked between accounts")
                state_b = json.loads(json.dumps(state_a)); state_b["local_user_id"] = "pm-local-user-device-b"; state_b["collections"]["read_later"] = []
                status, _, _ = call("PUT", "/api/v1/account/my-pm", {"base_revision": 0, "state": state_b}, csrf=csrf_b)
                if status != 200:
                    fail("second account save failed")
                status, _, _ = call("POST", "/api/v1/auth/logout", {}, csrf=csrf_b)
                if status != 200:
                    fail("second account logout failed")

                status, login_a, _ = call("POST", "/api/v1/auth/login", {"email": account_a, "password": "correct-horse-a2"})
                if status != 200:
                    fail("re-login A failed")
                csrf_a = login_a["csrf_token"]
                status, remote_a_again, _ = call("GET", "/api/v1/account/my-pm")
                if status != 200 or remote_a_again.get("state", {}).get("local_user_id") != "pm-local-user-device-a" or len(remote_a_again.get("state", {}).get("collections", {}).get("read_later", [])) != 1:
                    fail("account ownership isolation failed")

                status, _, _ = call("DELETE", "/api/v1/account", {"password": "correct-horse-a2"}, csrf=csrf_a)
                if status != 200:
                    fail("account deletion failed")
                status, _, _ = call("POST", "/api/v1/auth/login", {"email": account_a, "password": "correct-horse-a2"})
                if status != 401:
                    fail("deleted account can still log in")

                status, public_after, _ = call("GET", "/api/v1/public/place?limit=1")
                if status != 200 or not public_after.get("items"):
                    fail("public API must remain available without auth")
            finally:
                server.shutdown(); server.server_close(); thread.join(timeout=5)

            if not db_path.exists():
                fail("SQLite database was not created")
            print("BACKEND CHECK: OK")
            return 0
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


if __name__ == "__main__":
    raise SystemExit(main())
