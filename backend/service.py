from __future__ import annotations

import hashlib
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from .security import hash_password, new_token, normalize_email, token_hash, validate_email, validate_password, verify_password
from .storage import Database

USER_ID_RE = re.compile(r"^pm-user-[0-9a-f]{20}$")
REF_KINDS = {"favorites": "place", "read_later": "content", "saved_routes": "route"}


class ServiceError(Exception):
    code = "service_error"

    def __init__(self, message: str | None = None):
        super().__init__(message or self.code)


class ValidationError(ServiceError):
    code = "validation_error"


class AuthenticationError(ServiceError):
    code = "authentication_required"


class AuthorizationError(ServiceError):
    code = "forbidden"


class StateConflict(ServiceError):
    code = "sync_conflict"

    def __init__(self, revision: int, checksum: str | None):
        super().__init__(self.code)
        self.revision = int(revision)
        self.checksum = checksum


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None = None) -> str:
    return (value or utc_now()).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def clean_text(value: Any, maximum: int) -> str:
    return str(value or "").strip()[:maximum]


def nonnegative_int(value: Any, *, code: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(code) from exc
    if parsed < 0:
        raise ValidationError(code)
    return parsed


def safe_user(row) -> dict:
    return {
        "id": row["id"], "email": row["email"], "display_name": row["display_name"],
        "city": row["city"], "timezone": row["timezone"], "role": row["role"],
        "status": row["status"], "created_at": row["created_at"], "updated_at": row["updated_at"],
    }


def normalize_sync_state(value: Any) -> dict:
    if not isinstance(value, dict):
        raise ValidationError("invalid_state_schema")
    if nonnegative_int(value.get("schema_version", 0), code="invalid_state_schema") != 1:
        raise ValidationError("invalid_state_schema")
    if value.get("storage_mode") != "device_local" or value.get("sync_status") != "local_only":
        raise ValidationError("invalid_local_state_contract")
    local_user_id = clean_text(value.get("local_user_id"), 120)
    if not re.fullmatch(r"pm-local-user-[a-z0-9-]+", local_user_id):
        raise ValidationError("invalid_local_user_id")
    profile = value.get("profile") if isinstance(value.get("profile"), dict) else {}
    normalized_profile = {
        "display_name": clean_text(profile.get("display_name"), 60) or "Паломник",
        "email": clean_text(profile.get("email"), 160),
        "updated_at": clean_text(profile.get("updated_at"), 60) or None,
    }
    collections = value.get("collections") if isinstance(value.get("collections"), dict) else {}
    normalized_collections: dict[str, list[dict]] = {}
    for name, expected_kind in REF_KINDS.items():
        rows = collections.get(name)
        if not isinstance(rows, list) or len(rows) > 5000:
            raise ValidationError("invalid_collection")
        out, seen = [], set()
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("ref"), dict):
                raise ValidationError("invalid_collection_item")
            kind = clean_text(row["ref"].get("kind"), 40)
            rid = clean_text(row["ref"].get("id"), 180)
            if kind != expected_kind or not rid:
                raise ValidationError("invalid_collection_ref")
            key = f"{kind}:{rid}"
            if key in seen:
                continue
            seen.add(key)
            source = row.get("source")
            if source not in ("user", "legacy_migration"):
                source = "user"
            out.append({"ref": {"kind": kind, "id": rid}, "saved_at": clean_text(row.get("saved_at"), 60) or None, "source": source})
        normalized_collections[name] = out
    migration = value.get("migration") if isinstance(value.get("migration"), dict) else {}
    unresolved = migration.get("unresolved") if isinstance(migration.get("unresolved"), list) else []
    if len(unresolved) > 5000:
        raise ValidationError("invalid_migration_state")
    normalized_unresolved = []
    for row in unresolved:
        if not isinstance(row, dict):
            continue
        fingerprint = clean_text(row.get("fingerprint"), 80)
        legacy_key = clean_text(row.get("legacy_key"), 80)
        kind_hint = clean_text(row.get("kind_hint"), 40)
        if not fingerprint or not legacy_key or kind_hint not in REF_KINDS.values():
            continue
        normalized_unresolved.append({
            "fingerprint": fingerprint, "legacy_key": legacy_key, "kind_hint": kind_hint,
            "title": clean_text(row.get("title"), 240), "sub": clean_text(row.get("sub"), 240),
            "url": clean_text(row.get("url"), 500), "preserved_at": clean_text(row.get("preserved_at"), 60) or None,
        })
    checked = migration.get("legacy_keys_checked") if isinstance(migration.get("legacy_keys_checked"), list) else []
    checked = list(dict.fromkeys(clean_text(x, 80) for x in checked if clean_text(x, 80)))[:100]
    return {
        "schema_version": 1, "local_user_id": local_user_id, "storage_mode": "device_local", "sync_status": "local_only",
        "profile": normalized_profile, "collections": normalized_collections,
        "migration": {
            "legacy_keys_checked": checked,
            "migrated_refs": nonnegative_int(migration.get("migrated_refs") or 0, code="invalid_migration_state"),
            "unresolved": normalized_unresolved,
            "last_checked_at": clean_text(migration.get("last_checked_at"), 60) or None,
        },
    }


class AccountService:
    def __init__(self, database: Database, *, session_days: int = 30, recovery_minutes: int = 30):
        self.db = database
        self.db.migrate(iso())
        self.session_ttl = timedelta(days=max(1, session_days))
        self.recovery_ttl = timedelta(minutes=max(5, recovery_minutes))

    def _user_by_email(self, conn, email: str):
        return conn.execute("SELECT * FROM users WHERE email_normalized=?", (normalize_email(email),)).fetchone()

    def _user_by_id(self, conn, user_id: str):
        return conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()

    def _new_session(self, conn, user_id: str) -> dict:
        raw = new_token(32); csrf = new_token(24); now = utc_now(); expires = now + self.session_ttl
        conn.execute(
            "INSERT INTO sessions(token_hash,user_id,csrf_hash,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?,?)",
            (token_hash(raw), user_id, token_hash(csrf), iso(now), iso(expires), iso(now)),
        )
        return {"session_token": raw, "csrf_token": csrf, "expires_at": iso(expires)}

    def _session_row(self, conn, session_token: str):
        row = conn.execute(
            "SELECT s.*,u.email,u.display_name,u.city,u.timezone,u.role,u.status,u.created_at AS user_created_at,u.updated_at AS user_updated_at "
            "FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?",
            (token_hash(session_token),),
        ).fetchone()
        if not row or row["status"] != "active" or parse_iso(row["expires_at"]) <= utc_now():
            if row:
                conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(session_token),))
            raise AuthenticationError()
        return row

    def _session_user(self, row) -> dict:
        return {
            "id": row["user_id"], "email": row["email"], "display_name": row["display_name"],
            "city": row["city"], "timezone": row["timezone"], "role": row["role"], "status": row["status"],
            "created_at": row["user_created_at"], "updated_at": row["user_updated_at"],
        }

    def _require_csrf(self, session_row, csrf_token: str) -> None:
        if not csrf_token or not secrets.compare_digest(session_row["csrf_hash"], token_hash(csrf_token)):
            raise AuthorizationError("invalid_csrf")

    def register(self, email: str, password: str, display_name: str = "Паломник", *, city: str = "", timezone_name: str = "") -> dict:
        normalized = validate_email(email); password = validate_password(password)
        now = iso(); user_id = "pm-user-" + secrets.token_hex(10)
        profile_name = clean_text(display_name, 60) or "Паломник"
        with self.db.transaction() as conn:
            if self._user_by_email(conn, normalized):
                raise ValidationError("email_unavailable")
            conn.execute(
                "INSERT INTO users(id,email_normalized,email,password_hash,display_name,city,timezone,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (user_id, normalized, normalized, hash_password(password), profile_name, clean_text(city, 80), clean_text(timezone_name, 80), "user", "active", now, now),
            )
            session = self._new_session(conn, user_id)
            user = safe_user(self._user_by_id(conn, user_id))
        return {"user": user, **session}

    def login(self, email: str, password: str) -> dict:
        normalized = normalize_email(email)
        with self.db.transaction() as conn:
            row = self._user_by_email(conn, normalized)
            if not row or row["status"] != "active" or not verify_password(str(password or ""), row["password_hash"]):
                raise AuthenticationError("invalid_credentials")
            session = self._new_session(conn, row["id"])
            user = safe_user(row)
        return {"user": user, **session}

    def session(self, session_token: str, *, rotate_csrf: bool = False) -> dict:
        with self.db.transaction() as conn:
            row = self._session_row(conn, session_token)
            now = iso(); conn.execute("UPDATE sessions SET last_seen_at=? WHERE token_hash=?", (now, token_hash(session_token)))
            result = {"user": self._session_user(row), "expires_at": row["expires_at"]}
            if rotate_csrf:
                csrf = new_token(24); conn.execute("UPDATE sessions SET csrf_hash=? WHERE token_hash=?", (token_hash(csrf), token_hash(session_token)))
                result["csrf_token"] = csrf
            return result

    def logout(self, session_token: str, csrf_token: str) -> None:
        with self.db.transaction() as conn:
            row = self._session_row(conn, session_token); self._require_csrf(row, csrf_token)
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(session_token),))

    def get_profile(self, session_token: str) -> dict:
        return self.session(session_token)["user"]

    def update_profile(self, session_token: str, csrf_token: str, patch: dict) -> dict:
        if not isinstance(patch, dict): raise ValidationError("invalid_profile")
        with self.db.transaction() as conn:
            session = self._session_row(conn, session_token); self._require_csrf(session, csrf_token)
            user = self._user_by_id(conn, session["user_id"])
            display = clean_text(patch.get("display_name", user["display_name"]), 60) or user["display_name"]
            city = clean_text(patch.get("city", user["city"]), 80)
            tz = clean_text(patch.get("timezone", user["timezone"]), 80)
            now = iso()
            conn.execute("UPDATE users SET display_name=?,city=?,timezone=?,updated_at=? WHERE id=?", (display, city, tz, now, user["id"]))
            return safe_user(self._user_by_id(conn, user["id"]))

    def get_state(self, session_token: str) -> dict:
        with self.db.transaction() as conn:
            session = self._session_row(conn, session_token)
            row = conn.execute("SELECT * FROM my_pm_states WHERE user_id=?", (session["user_id"],)).fetchone()
            if not row:
                return {"revision": 0, "checksum": None, "updated_at": None, "state": None}
            return {"revision": row["revision"], "checksum": row["state_sha256"], "updated_at": row["updated_at"], "state": json.loads(row["state_json"])}

    def put_state(self, session_token: str, csrf_token: str, base_revision: int, state: dict) -> dict:
        normalized = normalize_sync_state(state)
        encoded = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > 1024 * 1024:
            raise ValidationError("state_too_large")
        checksum = hashlib.sha256(encoded.encode("utf-8")).hexdigest(); now = iso()
        with self.db.transaction() as conn:
            session = self._session_row(conn, session_token); self._require_csrf(session, csrf_token)
            row = conn.execute("SELECT revision,state_sha256 FROM my_pm_states WHERE user_id=?", (session["user_id"],)).fetchone()
            current_revision = int(row["revision"]) if row else 0
            if int(base_revision) != current_revision:
                raise StateConflict(current_revision, row["state_sha256"] if row else None)
            next_revision = current_revision + 1
            conn.execute(
                "INSERT INTO my_pm_states(user_id,revision,state_json,state_sha256,updated_at) VALUES(?,?,?,?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,state_json=excluded.state_json,state_sha256=excluded.state_sha256,updated_at=excluded.updated_at",
                (session["user_id"], next_revision, encoded, checksum, now),
            )
            return {"revision": next_revision, "checksum": checksum, "updated_at": now, "state": normalized}

    def request_recovery(self, email: str) -> str | None:
        with self.db.transaction() as conn:
            row = self._user_by_email(conn, normalize_email(email))
            if not row or row["status"] != "active":
                return None
            raw = new_token(32); now = utc_now(); expires = now + self.recovery_ttl
            conn.execute("DELETE FROM recovery_tokens WHERE user_id=? OR expires_at<=?", (row["id"], iso(now)))
            conn.execute("INSERT INTO recovery_tokens(token_hash,user_id,created_at,expires_at,used_at) VALUES(?,?,?,?,NULL)", (token_hash(raw), row["id"], iso(now), iso(expires)))
            return raw

    def reset_password(self, recovery_token: str, new_password: str) -> None:
        password = validate_password(new_password); now = utc_now()
        with self.db.transaction() as conn:
            row = conn.execute("SELECT * FROM recovery_tokens WHERE token_hash=?", (token_hash(recovery_token),)).fetchone()
            if not row or row["used_at"] or parse_iso(row["expires_at"]) <= now:
                raise AuthenticationError("invalid_recovery_token")
            conn.execute("UPDATE users SET password_hash=?,updated_at=? WHERE id=?", (hash_password(password), iso(now), row["user_id"]))
            conn.execute("UPDATE recovery_tokens SET used_at=? WHERE token_hash=?", (iso(now), token_hash(recovery_token)))
            conn.execute("DELETE FROM sessions WHERE user_id=?", (row["user_id"],))

    def export_account(self, session_token: str) -> dict:
        user = self.get_profile(session_token); state = self.get_state(session_token)
        return {"api_version": "1.0", "exported_at": iso(), "user": user, "my_pm": state}

    def delete_account(self, session_token: str, csrf_token: str, password: str) -> None:
        with self.db.transaction() as conn:
            session = self._session_row(conn, session_token); self._require_csrf(session, csrf_token)
            user = self._user_by_id(conn, session["user_id"])
            if not user or not verify_password(str(password or ""), user["password_hash"]):
                raise AuthenticationError("invalid_credentials")
            conn.execute("DELETE FROM users WHERE id=?", (user["id"],))
