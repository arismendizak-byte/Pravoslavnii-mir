from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets

PASSWORD_SCHEME = "scrypt-v1"
SCRYPT_N = 1 << 14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_email(value: str) -> str:
    return str(value or "").strip().casefold()


def validate_email(value: str) -> str:
    email = normalize_email(value)
    if not email or len(email) > 254 or not EMAIL_RE.fullmatch(email):
        raise ValueError("invalid_email")
    return email


def validate_password(value: str) -> str:
    password = str(value or "")
    if len(password) < 10 or len(password) > 256:
        raise ValueError("invalid_password")
    return password


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    password = validate_password(password)
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R,
        p=SCRYPT_P, dklen=SCRYPT_DKLEN,
    )
    return f"{PASSWORD_SCHEME}${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, digest_b64 = str(encoded).split("$", 5)
        if scheme != PASSWORD_SCHEME:
            return False
        expected = _unb64(digest_b64)
        actual = hashlib.scrypt(
            str(password).encode("utf-8"), salt=_unb64(salt_b64),
            n=int(n), r=int(r), p=int(p), dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def new_token(bytes_count: int = 32) -> str:
    return secrets.token_urlsafe(bytes_count)


def token_hash(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()
