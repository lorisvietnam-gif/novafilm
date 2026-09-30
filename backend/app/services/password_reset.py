# -*- coding: utf-8 -*-
"""Password recovery by e-mail: a one-shot Redis token plus an SMTP reset link."""
from __future__ import annotations

import hashlib
import logging
import secrets
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services.auth import get_user_by_email, get_user_by_id, hash_password
from app.services.email import send_email

logger = logging.getLogger(__name__)

# token TTL / per-e-mail cooldown
TOKEN_TTL_SECONDS = 30 * 60
COOLDOWN_SECONDS = 60

GENERIC_OK_MESSAGE = "若该邮箱已注册，将收到重置邮件"


class PasswordResetError(Exception):
    """A business error during password recovery or reset."""


class RedisUnavailableError(PasswordResetError):
    """Redis is unavailable, so a reset token cannot be issued or validated."""


class InvalidTokenError(PasswordResetError):
    """The reset token is invalid or has expired."""


def _token_hash(token: str) -> str:
    # Store only the sha256; the plaintext token appears solely in the e-mail link
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _token_key(token_hash: str) -> str:
    return f"pwdreset:{token_hash}"


def _user_key(user_id: int) -> str:
    return f"pwdreset:user:{user_id}"


def _cooldown_key(email: str) -> str:
    return f"pwdreset:cd:{email}"


def get_redis_client() -> Any:
    """Connect to Redis; raise RedisUnavailableError on failure (no in-memory fallback)."""
    try:
        import redis

        client = redis.Redis.from_url(
            get_settings().redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        client.ping()
        return client
    except Exception as exc:  # noqa: BLE001
        logger.warning("password reset redis unavailable: %s", exc)
        raise RedisUnavailableError("服务暂时不可用，请稍后再试") from exc


def create_reset_token(redis_client: Any, user_id: int) -> str:
    """Issue a one-shot token and invalidate that user's previous tokens."""
    old_hash = redis_client.get(_user_key(user_id))
    if old_hash:
        redis_client.delete(_token_key(str(old_hash)))

    token = secrets.token_urlsafe(32)
    th = _token_hash(token)
    pipe = redis_client.pipeline()
    pipe.setex(_token_key(th), TOKEN_TTL_SECONDS, str(user_id))
    pipe.setex(_user_key(user_id), TOKEN_TTL_SECONDS, th)
    pipe.execute()
    return token


def consume_reset_token(redis_client: Any, token: str) -> int:
    """Validate and delete the token, returning user_id; raises InvalidTokenError when it is not valid."""
    raw = (token or "").strip()
    if not raw:
        raise InvalidTokenError("重置链接无效或已过期")
    th = _token_hash(raw)
    key = _token_key(th)
    # GETDEL is atomic: of two concurrent reset requests, only one gets the user_id
    user_id_raw = redis_client.getdel(key)
    if not user_id_raw:
        raise InvalidTokenError("重置链接无效或已过期")
    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError) as exc:
        raise InvalidTokenError("重置链接无效或已过期") from exc

    redis_client.delete(_user_key(user_id))
    return user_id


def build_reset_link(token: str) -> str:
    # The user-facing Auth page: ?mode=reset&token=...
    base = str(get_settings().public_base_url or "").rstrip("/")
    return f"{base}/auth?mode=reset&token={token}"


async def request_password_reset(db: AsyncSession, email: str) -> dict[str, Any]:
    """
    Start a recovery: write the Redis token and try to send the e-mail. Always returns the
    same generic success message (defeats account enumeration); raises when Redis is unavailable.
    """
    redis_client = get_redis_client()
    email_norm = str(email or "").strip().lower()
    cd_key = _cooldown_key(email_norm)

    # 60 second cooldown: a repeat request succeeds without sending another mail
    if redis_client.get(cd_key):
        return {"ok": True, "message": GENERIC_OK_MESSAGE}

    redis_client.setex(cd_key, COOLDOWN_SECONDS, "1")

    user = await get_user_by_email(db, email_norm)
    if not user:
        return {"ok": True, "message": GENERIC_OK_MESSAGE}

    token = create_reset_token(redis_client, int(user.id))
    link = build_reset_link(token)
    body = (
        "您正在重置 PRINTFILM 账号密码。\n\n"
        f"请在 30 分钟内打开以下链接设置新密码：\n{link}\n\n"
        "如非本人操作，请忽略本邮件。"
    )
    sent = await send_email(
        to_addrs=[email_norm],
        subject="PRINTFILM 密码重置",
        body=body,
    )
    if not sent:
        logger.warning(
            "password reset email not sent (smtp off or failed) user_id=%s email=%s",
            user.id,
            email_norm,
        )
    return {"ok": True, "message": GENERIC_OK_MESSAGE}


async def apply_password_reset(
    db: AsyncSession,
    *,
    token: str,
    new_password: str,
) -> None:
    """Validate the token, then update the password; the token is consumed once."""
    redis_client = get_redis_client()
    user_id = consume_reset_token(redis_client, token)
    user = await get_user_by_id(db, user_id)
    if not user:
        raise InvalidTokenError("重置链接无效或已过期")
    user.hashed_password = hash_password(new_password)
    await db.commit()
