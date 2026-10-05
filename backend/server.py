from __future__ import annotations

import argparse
import json
import os
import sys
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .public_data import PublicDataAdapter
from .service import (
    AccountService,
    AuthenticationError,
    AuthorizationError,
    ServiceError,
    StateConflict,
    ValidationError,
)
from .storage import Database

API_PREFIX = "/api/v1"
SESSION_COOKIE = "pravmir_session"
MAX_BODY_BYTES = 2 * 1024 * 1024


def default_db_path() -> Path:
    configured = os.environ.get("PRAVMIR_DB")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".pravmir" / "pravmir.db"


class BackendApp:
    def __init__(self, project_root: str | Path, db_path: str | Path):
        self.project_root = Path(project_root).resolve()
        self.public = PublicDataAdapter(self.project_root)
        self.accounts = AccountService(Database(db_path))
        self.secure_cookies = os.environ.get("PRAVMIR_SECURE_COOKIES", "0") == "1"
        self.dev_recovery = os.environ.get("PRAVMIR_DEV_RECOVERY", "0") == "1"


class Handler(SimpleHTTPRequestHandler):
    server_version = "PravmirBackend/1.45"
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, app: BackendApp, **kwargs):
        self.app = app
        super().__init__(*args, directory=str(app.project_root), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        if os.environ.get("PRAVMIR_QUIET", "0") != "1":
            super().log_message(fmt, *args)

    def _json(self, status: int, payload: dict, headers: dict[str, str] | None = None) -> None:
        body = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("application/json"):
            raise ValidationError("json_required")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValidationError("invalid_content_length") from exc
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValidationError("invalid_body_size")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as exc:
            raise ValidationError("invalid_json") from exc
        if not isinstance(payload, dict):
            raise ValidationError("json_object_required")
        return payload

    def _cookie_token(self) -> str:
        raw = self.headers.get("Cookie", "")
        cookie = SimpleCookie()
        try:
            cookie.load(raw)
        except Exception:
            return ""
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else ""

    def _session_cookie(self, token: str, max_age: int) -> str:
        cookie = SimpleCookie()
        cookie[SESSION_COOKIE] = token
        cookie[SESSION_COOKIE]["path"] = "/"
        cookie[SESSION_COOKIE]["httponly"] = True
        cookie[SESSION_COOKIE]["samesite"] = "Lax"
        cookie[SESSION_COOKIE]["max-age"] = str(max(0, int(max_age)))
        if self.app.secure_cookies:
            cookie[SESSION_COOKIE]["secure"] = True
        return cookie.output(header="").strip()

    def _clear_cookie(self) -> str:
        return self._session_cookie("", 0)

    def _csrf(self) -> str:
        return self.headers.get("X-Pravmir-CSRF", "")

    def _same_origin_or_absent(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        host = self.headers.get("Host", "")
        expected_http = f"http://{host}"
        expected_https = f"https://{host}"
        return origin in (expected_http, expected_https)

    def _require_same_origin(self) -> None:
        if not self._same_origin_or_absent():
            raise AuthorizationError("cross_origin_forbidden")

    def _handle_error(self, exc: Exception) -> None:
        if isinstance(exc, StateConflict):
            self._json(HTTPStatus.CONFLICT, {"error": exc.code, "revision": exc.revision, "checksum": exc.checksum})
            return
        if isinstance(exc, AuthenticationError):
            self._json(HTTPStatus.UNAUTHORIZED, {"error": str(exc) or exc.code})
            return
        if isinstance(exc, AuthorizationError):
            self._json(HTTPStatus.FORBIDDEN, {"error": str(exc) or exc.code})
            return
        if isinstance(exc, ValidationError):
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(exc) or exc.code})
            return
        if isinstance(exc, ServiceError):
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(exc) or exc.code})
            return
        print(f"backend error: {exc!r}", file=sys.stderr)
        self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "internal_error"})

    def _api_path(self):
        parsed = urlparse(self.path)
        return parsed, parsed.path[len(API_PREFIX):] if parsed.path.startswith(API_PREFIX) else None

    def do_GET(self) -> None:
        parsed, api_path = self._api_path()
        if api_path is None:
            return super().do_GET()
        try:
            if api_path == "/health":
                self._json(HTTPStatus.OK, {"ok": True, "api_version": "1.0", "service": "pravmir", "public": self.app.public.summary()})
                return
            if api_path == "/public/summary":
                self._json(HTTPStatus.OK, {"api_version": "1.0", "counts": self.app.public.summary()})
                return
            if api_path.startswith("/public/"):
                tail = [unquote(x) for x in api_path[len("/public/"):].split("/") if x]
                if not tail or len(tail) > 2:
                    self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"}); return
                kind = tail[0]
                if kind not in self.app.public.SOURCES:
                    self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"}); return
                if len(tail) == 2:
                    row = self.app.public.resolve(kind, tail[1])
                    if not row:
                        self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"}); return
                    self._json(HTTPStatus.OK, {"api_version": "1.0", "kind": kind, "item": row}); return
                query = parse_qs(parsed.query)
                try:
                    limit = min(200, max(1, int((query.get("limit") or [50])[0])))
                    offset = max(0, int((query.get("offset") or [0])[0]))
                except ValueError:
                    raise ValidationError("invalid_pagination")
                rows, total = self.app.public.list(kind, limit=limit, offset=offset)
                self._json(HTTPStatus.OK, {"api_version": "1.0", "kind": kind, "total": total, "offset": offset, "limit": limit, "items": rows}); return
            if api_path == "/account/session":
                result = self.app.accounts.session(self._cookie_token(), rotate_csrf=True)
                self._json(HTTPStatus.OK, {"api_version": "1.0", **result}); return
            if api_path == "/account/profile":
                self._json(HTTPStatus.OK, {"api_version": "1.0", "user": self.app.accounts.get_profile(self._cookie_token())}); return
            if api_path == "/account/my-pm":
                self._json(HTTPStatus.OK, {"api_version": "1.0", **self.app.accounts.get_state(self._cookie_token())}); return
            if api_path == "/account/export":
                self._json(HTTPStatus.OK, self.app.accounts.export_account(self._cookie_token()), {"Content-Disposition": 'attachment; filename="pravmir-account-export.json"'}); return
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
        except Exception as exc:
            self._handle_error(exc)

    def do_POST(self) -> None:
        parsed, api_path = self._api_path()
        if api_path is None:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"}); return
        try:
            self._require_same_origin()
            payload = self._read_json()
            if api_path == "/auth/register":
                result = self.app.accounts.register(
                    payload.get("email", ""), payload.get("password", ""), payload.get("display_name", "Паломник"),
                    city=payload.get("city", ""), timezone_name=payload.get("timezone", ""),
                )
                max_age = max(1, self.app.accounts.session_ttl.days) * 86400
                session_token = result.pop("session_token")
                self._json(HTTPStatus.CREATED, {"api_version": "1.0", **result}, {"Set-Cookie": self._session_cookie(session_token, max_age)})
                return
            if api_path == "/auth/login":
                result = self.app.accounts.login(payload.get("email", ""), payload.get("password", ""))
                max_age = max(1, self.app.accounts.session_ttl.days) * 86400
                session_token = result.pop("session_token")
                self._json(HTTPStatus.OK, {"api_version": "1.0", **result}, {"Set-Cookie": self._session_cookie(session_token, max_age)})
                return
            if api_path == "/auth/logout":
                self.app.accounts.logout(self._cookie_token(), self._csrf())
                self._json(HTTPStatus.OK, {"ok": True}, {"Set-Cookie": self._clear_cookie()}); return
            if api_path == "/auth/recovery/request":
                token = self.app.accounts.request_recovery(payload.get("email", ""))
                response = {"ok": True, "message": "Если аккаунт существует, восстановление подготовлено."}
                if self.app.dev_recovery and token:
                    response["dev_recovery_token"] = token
                self._json(HTTPStatus.OK, response); return
            if api_path == "/auth/recovery/reset":
                self.app.accounts.reset_password(payload.get("token", ""), payload.get("password", ""))
                self._json(HTTPStatus.OK, {"ok": True}, {"Set-Cookie": self._clear_cookie()}); return
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
        except Exception as exc:
            self._handle_error(exc)

    def do_PATCH(self) -> None:
        _, api_path = self._api_path()
        if api_path is None:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"}); return
        try:
            self._require_same_origin(); payload = self._read_json()
            if api_path == "/account/profile":
                user = self.app.accounts.update_profile(self._cookie_token(), self._csrf(), payload)
                self._json(HTTPStatus.OK, {"api_version": "1.0", "user": user}); return
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
        except Exception as exc:
            self._handle_error(exc)

    def do_PUT(self) -> None:
        _, api_path = self._api_path()
        if api_path is None:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"}); return
        try:
            self._require_same_origin(); payload = self._read_json()
            if api_path == "/account/my-pm":
                result = self.app.accounts.put_state(
                    self._cookie_token(), self._csrf(), int(payload.get("base_revision", -1)), payload.get("state")
                )
                self._json(HTTPStatus.OK, {"api_version": "1.0", **result}); return
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
        except (TypeError, ValueError):
            self._handle_error(ValidationError("invalid_revision"))
        except Exception as exc:
            self._handle_error(exc)

    def do_DELETE(self) -> None:
        _, api_path = self._api_path()
        if api_path is None:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"}); return
        try:
            self._require_same_origin(); payload = self._read_json()
            if api_path == "/account":
                self.app.accounts.delete_account(self._cookie_token(), self._csrf(), payload.get("password", ""))
                self._json(HTTPStatus.OK, {"ok": True}, {"Set-Cookie": self._clear_cookie()}); return
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
        except Exception as exc:
            self._handle_error(exc)


def make_server(project_root: str | Path, db_path: str | Path, host: str, port: int) -> ThreadingHTTPServer:
    app = BackendApp(project_root, db_path)

    def factory(*args, **kwargs):
        return Handler(*args, app=app, **kwargs)

    server = ThreadingHTTPServer((host, int(port)), factory)
    server.daemon_threads = True
    return server


def main() -> int:
    parser = argparse.ArgumentParser(description="Pravoslavnii Mir local-first backend + static server")
    parser.add_argument("--host", default=os.environ.get("PRAVMIR_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PRAVMIR_PORT", "8787")))
    parser.add_argument("--db", default=str(default_db_path()))
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    args = parser.parse_args()
    server = make_server(args.root, args.db, args.host, args.port)
    print(f"Pravmir backend http://{args.host}:{args.port}  db={Path(args.db).expanduser()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
