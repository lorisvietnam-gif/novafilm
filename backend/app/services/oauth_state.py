# -*- coding: utf-8 -*-
"""OAuth 登录的一次性凭证：CSRF state 与登录 code，都存在 Redis 且只能用一次。

与 password_reset 同一套约定：Redis 不可用就直接失败（不做内存兜底），键里只存
令牌的 sha256，明文只在浏览器和本进程里各出现一次。state 用 GETDEL 消费，保证同一个
state 第二次回调必然失败——这既是 CSRF 校验，也是重放防护。
"""
from __future__ import annotations

import hashlib
import json
import logging
import secrets
from dataclasses import dataclass
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

# state 覆盖用户跳转第三方再跳回的时间；登录 code 只在两次请求之间活着
STATE_TTL_SECONDS = 10 * 60
GRANT_TTL_SECONDS = 2 * 60


class OAuthStoreError(Exception):
    """Redis is unavailable, so no state or login code can be stored."""


class OAuthStateError(Exception):
    """A state or login code was missing, expired, already used or for another provider."""


@dataclass(frozen=True)
class LoginState:
    """What the callback needs to finish the exchange it started."""

    provider: str
    code_verifier: str


def get_redis_client() -> Any:
    """Connect to Redis; raise OAuthStoreError on failure (no in-memory fallback)."""
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
        logger.warning("oauth state redis unavailable: %s", exc)
        raise OAuthStoreError("登录服务暂时不可用，请稍后再试") from exc


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _state_key(state_digest: str) -> str:
    return f"oauth:state:{state_digest}"


def _grant_key(grant_digest: str) -> str:
    return f"oauth:grant:{grant_digest}"


def create_login_state(redis_client: Any, provider: str, code_verifier: str) -> str:
    """Store a fresh state bound to this provider and PKCE verifier; return the plaintext."""
    state = secrets.token_urlsafe(32)
    payload = json.dumps({"provider": provider, "v": code_verifier}, separators=(",", ":"))
    redis_client.setex(_state_key(_digest(state)), STATE_TTL_SECONDS, payload)
    return state


def consume_login_state(redis_client: Any, provider: str, state: str) -> LoginState:
    """Validate and delete the state, returning the verifier; raise OAuthStateError if not.

    GETDEL is atomic: two concurrent callbacks carrying the same state cannot both pass.
    """
    raw = (state or "").strip()
    if not raw:
        raise OAuthStateError("state 无效或已过期")
    stored = redis_client.getdel(_state_key(_digest(raw)))
    if not stored:
        raise OAuthStateError("state 无效或已过期")
    try:
        payload = json.loads(stored)
    except ValueError as exc:
        raise OAuthStateError("state 无效或已过期") from exc
    if not isinstance(payload, dict) or payload.get("provider") != provider:
        # A state minted for another provider is still burned here, never reused.
        raise OAuthStateError("state 无效或已过期")
    verifier = str(payload.get("v") or "")
    if not verifier:
        raise OAuthStateError("state 无效或已过期")
    return LoginState(provider=provider, code_verifier=verifier)


def issue_login_grant(redis_client: Any, user_id: int) -> str:
    """Mint the one-time code the browser swaps for a session JWT."""
    grant = secrets.token_urlsafe(32)
    redis_client.setex(_grant_key(_digest(grant)), GRANT_TTL_SECONDS, str(int(user_id)))
    return grant


def consume_login_grant(redis_client: Any, grant: str) -> int:
    """Validate and delete the login code, returning the user_id it was issued for."""
    raw = (grant or "").strip()
    if not raw:
        raise OAuthStateError("登录凭证无效或已过期")
    user_id_raw = redis_client.getdel(_grant_key(_digest(raw)))
    if not user_id_raw:
        raise OAuthStateError("登录凭证无效或已过期")
    try:
        return int(user_id_raw)
    except (TypeError, ValueError) as exc:
        raise OAuthStateError("登录凭证无效或已过期") from exc
