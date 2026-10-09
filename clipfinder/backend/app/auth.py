"""
Session-based user isolation.
Each visitor gets a unique anonymous session ID stored in a secure cookie.
All data (videos, segments, embeddings) is scoped to that session.
No signup required — privacy through isolation.
"""
import uuid
import hashlib
import secrets
import hmac
import os
from fastapi import Request, Response
from app.config import settings

# ─── Secret key for signing session cookies ──────────────────────────────────
# SESSION_SECRET should always be set in production so that sessions survive a
# restart. If it is missing we must NOT fall back to a secret derived from
# STORAGE_DIR: that path is a fixed, guessable value on Render (/app/storage),
# so anyone could derive the key and forge cookies to read another visitor's
# data.
#
# Instead, generate a strong RANDOM secret for this process. That keeps cookie
# signing unforgeable without preventing the app from booting (a hard failure
# here would take the whole service down on a misconfigured deploy). The only
# cost is that existing cookies stop validating after a restart — which is
# already the case on free hosting, where the database is wiped on restart
# anyway, so no durable data is lost.
_env_secret = os.getenv("SESSION_SECRET", "").strip()

if _env_secret:
    SESSION_SECRET = _env_secret
elif settings.is_production:
    SESSION_SECRET = secrets.token_hex(32)
    print(
        "[auth] WARNING: SESSION_SECRET is not set. Using a random per-process "
        "secret, so all sessions are invalidated on restart. Set SESSION_SECRET "
        'in your environment (generate: python -c "import secrets; '
        'print(secrets.token_hex(32))").'
    )
else:
    # Local development only: stable secret so sessions persist across reloads.
    SESSION_SECRET = hashlib.sha256(
        f"clipfinder-local-{settings.STORAGE_DIR}".encode()
    ).hexdigest()

COOKIE_NAME = "clipfinder_session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # 1 year


def _sign_session(session_id: str) -> str:
    """Create a signed session token: session_id.signature"""
    sig = hmac.digest(
        SESSION_SECRET.encode(),
        session_id.encode(),
        "sha256"
    ).hex()[:16]
    return f"{session_id}.{sig}"


def _verify_session(token: str) -> str | None:
    """Verify a signed session token, return session_id or None."""
    parts = token.split(".")
    if len(parts) != 2:
        return None
    session_id, signature = parts
    expected = hmac.digest(
        SESSION_SECRET.encode(),
        session_id.encode(),
        "sha256"
    ).hex()[:16]
    if hmac.compare_digest(signature, expected):
        return session_id
    return None


def get_session_id(request: Request) -> str | None:
    """Extract and verify session ID from cookie."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    return _verify_session(token)


def create_session_id() -> str:
    """Generate a new unique session ID."""
    return str(uuid.uuid4())


def set_session_cookie(response: Response, session_id: str) -> None:
    """Set a signed session cookie on the response."""
    token = _sign_session(session_id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )


def get_or_create_session(request: Request) -> tuple[str, bool]:
    """
    Get existing session or signal that a new one is needed.
    Returns (session_id, is_new).
    """
    existing = get_session_id(request)
    if existing:
        return existing, False
    return create_session_id(), True
