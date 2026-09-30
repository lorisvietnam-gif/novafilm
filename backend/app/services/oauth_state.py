# -*- coding: utf-8 -*-
"""Giấy tờ một lần của luồng đăng nhập OAuth: CSRF state, phiên trình duyệt, mã đổi JWT.

Tất cả nằm trong Redis và **chỉ dùng một lần** (GETDEL). Không có đường lùi về bộ nhớ:
Redis chết thì đăng nhập chết, chứ không phải phát ra một state mà không kiểm chứng được.

Ba loại giấy tờ:
- ``state``     — chống CSRF, gắn với provider + phiên trình duyệt, có TTL.
- ``sid``       — cookie phiên trình duyệt, sinh cùng state, so sánh constant-time.
- ``grant``     — mã một lần để đổi lấy JWT sau khi callback thành công.
- ``setup``     — nhánh B (TikTok): mã một lần để điền email + mật khẩu, KHÔNG phát JWT.

Trong Redis chỉ lưu digest của token, không lưu bản rõ. Bản rõ chỉ tồn tại trong
trình duyệt và trong RAM của tiến trình này.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
from dataclasses import dataclass
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

# state sống lâu đủ để người dùng nhảy sang trang bên thứ ba rồi quay lại;
# grant chỉ cần sống giữa hai request liên tiếp.
STATE_TTL_SECONDS = 10 * 60
GRANT_TTL_SECONDS = 2 * 60
SETUP_TTL_SECONDS = 30 * 60
# Cookie phiên: cùng thời gian với state.
SESSION_TTL_SECONDS = STATE_TTL_SECONDS


class OAuthStoreError(Exception):
    """Redis không dùng được, nên không lưu được state hay mã đăng nhập."""


class OAuthStateError(Exception):
    """State, phiên hoặc mã đăng nhập sai, hết hạn, đã dùng, hoặc của provider khác."""


@dataclass(frozen=True)
class LoginState:
    """Những gì callback cần để khép lại đúng cuộc đổi nó đã mở."""

    provider: str
    code_verifier: str
    session_id: str
    next_path: str


def get_redis_client() -> Any:
    """Mở kết nối Redis; thất bại thì ném OAuthStoreError (không có bộ nhớ dự phòng)."""
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


def _mac(secret: str, value: str) -> str:
    """Chữ ký HMAC của token, so sánh được bằng compare_digest (thời gian hằng số)."""
    return hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def _server_secret() -> str:
    # SECRET_KEY: hai bản sao ứng dụng dùng chung một Redis vẫn không thể giả mạo state
    # của nhau, vì MAC lệch nhau.
    return get_settings().secret_key


def _key(prefix: str, token: str) -> str:
    return f"oauth:{prefix}:{_digest(token)}"


_STATE_REJECTED = "state 无效或已过期"
_SESSION_REJECTED = "登录会话无效或已过期"
_GRANT_REJECTED = "登录凭证无效或已过期"
_SETUP_REJECTED = "账号信息待补充凭证无效或已过期"


def create_login_state(
    redis_client: Any,
    provider: str,
    code_verifier: str,
    *,
    next_path: str = "",
    session_id: str | None = None,
) -> tuple[str, str]:
    """Sinh state + phiên trình duyệt, lưu kèm PKCE verifier; trả về (state, sid).

    Verifier ở lại server: callback chỉ có thể khép lại đúng cuộc đổi nó đã mở.
    """
    state = secrets.token_urlsafe(32)
    sid = session_id or secrets.token_urlsafe(32)
    secret = _server_secret()
    payload = json.dumps(
        {
            "p": provider,
            "v": code_verifier,
            "s": sid,
            "n": str(next_path or ""),
            "m": _mac(secret, state),
        },
        separators=(",", ":"),
    )
    key = _key("state", state)
    redis_client.setex(key, STATE_TTL_SECONDS, payload)
    redis_client.setex(_key("session", sid), SESSION_TTL_SECONDS, _mac(secret, state))
    return state, sid


def consume_login_state(
    redis_client: Any, provider: str, state: str, session_id: str = ""
) -> LoginState:
    """Kiểm tra rồi XOÁ state, trả về verifier; sai thì ném OAuthStateError.

    GETDEL là nguyên tử: hai callback mang cùng một state không thể cùng đi qua.
    """
    raw = (state or "").strip()
    if not raw:
        raise OAuthStateError(_STATE_REJECTED)
    secret = _server_secret()
    stored = redis_client.getdel(_key("state", raw))
    if not stored:
        raise OAuthStateError(_STATE_REJECTED)
    try:
        payload = json.loads(stored)
    except ValueError as exc:
        raise OAuthStateError(_STATE_REJECTED) from exc
    if not isinstance(payload, dict):
        raise OAuthStateError(_STATE_REJECTED)

    # MAC đúng là bằng chứng state do chính server này phát ra; so sánh constant-time.
    if not hmac.compare_digest(str(payload.get("m") or ""), _mac(secret, raw)):
        raise OAuthStateError(_STATE_REJECTED)
    # Provider lệch thì state kia vẫn bị đốt ở đây, không bao giờ tái dùng được.
    if payload.get("p") != provider:
        raise OAuthStateError(_STATE_REJECTED)
    verifier = str(payload.get("v") or "")
    if not verifier:
        raise OAuthStateError(_STATE_REJECTED)

    expected_sid = str(payload.get("s") or "")
    if not expected_sid or not hmac.compare_digest(expected_sid, (session_id or "").strip()):
        raise OAuthStateError(_SESSION_REJECTED)
    if redis_client.getdel(_key("session", expected_sid)) is None:
        raise OAuthStateError(_SESSION_REJECTED)

    return LoginState(
        provider=provider,
        code_verifier=verifier,
        session_id=expected_sid,
        next_path=str(payload.get("n") or ""),
    )


def _issue(redis_client: Any, prefix: str, value: str, ttl: int) -> str:
    token = secrets.token_urlsafe(32)
    redis_client.setex(_key(prefix, token), ttl, value)
    return token


def _consume(redis_client: Any, prefix: str, token: str, rejected: str) -> str:
    raw = (token or "").strip()
    if not raw:
        raise OAuthStateError(rejected)
    stored = redis_client.getdel(_key(prefix, raw))
    if stored is None:
        raise OAuthStateError(rejected)
    return str(stored)


def issue_login_grant(redis_client: Any, user_id: int) -> str:
    """Mã một lần để đổi lấy JWT sau khi đăng nhập thành công."""
    return _issue(redis_client, "grant", str(int(user_id)), GRANT_TTL_SECONDS)


def consume_login_grant(redis_client: Any, grant: str) -> int:
    """Xác thực rồi xoá mã đăng nhập, trả về user_id nó được cấp cho."""
    try:
        return int(_consume(redis_client, "grant", grant, _GRANT_REJECTED))
    except (TypeError, ValueError) as exc:
        raise OAuthStateError(_GRANT_REJECTED) from exc


def issue_setup_token(redis_client: Any, user_id: int) -> str:
    """Nhánh B: mã một lần để điền email + mật khẩu, chưa phải JWT.

    Cố tình KHÔNG phát JWT ở bước này: tài khoản chưa hoàn chỉnh không được đi vào bất kỳ
    màn hình nào, kể cả màn hình đòi quyền trả phí.
    """
    return _issue(redis_client, "setup", str(int(user_id)), SETUP_TTL_SECONDS)


def consume_setup_token(redis_client: Any, token: str) -> int:
    """Xác thực rồi xoá mã điền thông tin, trả về user_id."""
    try:
        return int(_consume(redis_client, "setup", token, _SETUP_REJECTED))
    except (TypeError, ValueError) as exc:
        raise OAuthStateError(_SETUP_REJECTED) from exc