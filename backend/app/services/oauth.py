# -*- coding: utf-8 -*-
"""Đăng nhập OAuth: Authorization Code + PKCE, một đường duy nhất cho mọi provider.

Provider chỉ là một dòng dữ liệu trong `oauth_providers.PROVIDERS`. Không có nhánh `if`
theo tên provider ở đây: dựng URL authorize, đổi code lấy token, đọc userinfo và rút ra
danh tính đều đọc cùng một registry entry.

`configured_providers()` đọc đúng những biến mà các endpoint đăng nhập dùng, nên frontend
chỉ thấy nút khi client_id **và** client_secret đều có, và không bao giờ thấy nút cho một
cấu hình nửa vời.

Chỉ có Authorization Code + PKCE. Implicit flow không dùng vì nó không cần client secret
và sẽ làm lộ một cái. Client secret không bao giờ rời backend: provider đưa trình duyệt
về callback của backend, backend đổi code lấy token rồi đưa cho trình duyệt một mã dùng
một lần — không có JWT nào nằm trong URL.

Mọi lệnh gọi ra ngoài đi qua một httpx client tiêm vào được, nên toàn bộ luồng test được
bằng `httpx.MockTransport`, không cần mạng.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urlsplit

import httpx
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.services import oauth_accounts, oauth_state
from app.services.oauth_accounts import OAuthIdentity
from app.services.oauth_providers import (
    ProviderSpec,
    RedirectUriError,
    find_spec,
    provider_specs,
    read_text,
    read_verified_flag,
    scope_string,
    validate_redirect_uri,
)

logger = logging.getLogger(__name__)

_EMAIL = TypeAdapter(EmailStr)

# Provider phải trả lời nhanh: ta đang giữ trình duyệt ở một 302.
_HTTP_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
_MAX_NICKNAME = 64
_MAX_AVATAR_URL = 512
# ?next= là đầu vào của trình duyệt: nó được lưu trong Redis rồi đưa vào Location,
# nên phải chặn độ dài trước khi nó thành một Location dài vô hạn.
_MAX_REDIRECT_LENGTH = 2048


class OAuthConfigError(Exception):
    """Provider lạ, hoặc provider được hỏi nhưng chưa cấu hình xong."""


class OAuthProviderError(Exception):
    """Provider từ chối yêu cầu, hoặc trả về thứ không dùng được."""


class OAuthFlowError(Exception):
    """Một lần đăng nhập hỏng theo cách frontend biết được.

    `code` là mã máy đọc được (không bao giờ là nguyên văn lỗi từ phía trên) để frontend
    tự bản địa hoá.
    """

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


@dataclass(frozen=True)
class AuthorizeRequest:
    """URL cần mở ở phía trình duyệt, cùng state và phiên đi kèm nó."""

    url: str
    state: str
    session_id: str


@dataclass(frozen=True)
class LoginHandoff:
    """Món quà đưa về frontend: mã một lần, và nơi cần quay lại sau khi dùng."""

    setup_required: bool
    token: str
    # Đã được kiểm tra open redirect ở lúc bắt đầu; vẫn kiểm lại ở lúc dùng.
    next_path: str = ""


# ------------------------------------------------------------------------ registry


def configured_providers(settings: Settings | None = None) -> list[ProviderSpec]:
    """Provider đã có đủ client_id *và* client_secret.

    Cấu hình nửa vời không phải một cách đăng nhập chạy được, nên không được tới frontend.
    """
    cfg = settings if settings is not None else get_settings()
    return [spec for spec in provider_specs() if all(client_credentials(spec, cfg))]


def client_credentials(spec: ProviderSpec, settings: Settings | None = None) -> tuple[str, str]:
    """Cặp client_id / client_secret đã cấu hình của provider."""
    cfg = settings if settings is not None else get_settings()
    client_id = str(getattr(cfg, spec.client_id_env, "") or "").strip()
    client_secret = str(getattr(cfg, spec.client_secret_env, "") or "").strip()
    return client_id, client_secret


def require_provider(provider_id: str, settings: Settings | None = None) -> ProviderSpec:
    """Trả về provider đã cấu hình, nếu không thì ném OAuthConfigError."""
    spec = oauth_provider_spec(provider_id)
    cfg = settings if settings is not None else get_settings()
    if not all(client_credentials(spec, cfg)):
        raise OAuthConfigError(f"{spec.label} 登录未配置")
    return spec


def oauth_provider_spec(provider_id: str) -> ProviderSpec:
    """Tra registry, chỉ nhận provider bản dựng này thực sự chạy được."""
    spec = find_spec(provider_id)
    if spec is None or not spec.implemented:
        raise OAuthConfigError(f"未知的第三方登录方式: {provider_id}")
    return spec


def redirect_uri_for(spec: ProviderSpec, settings: Settings | None = None) -> str:
    """Đúng URL callback phải dán vào console của provider.

    Dựng từ `OAUTH_REDIRECT_BASE_URL` và template của provider, không bao giờ lấy từ
    trình duyệt: provider so khớp `redirect_uri` từng byte, nên http://localhost:8000 và
    http://127.0.0.1:8000 là hai giá trị khác nhau và chỉ giá trị đã đăng ký mới chạy.
    """
    cfg = settings if settings is not None else get_settings()
    base = str(cfg.oauth_redirect_base_url or "").rstrip("/")
    return spec.redirect_uri_template.format(base=base, provider=spec.id)


def validate_configuration(settings: Settings | None = None) -> None:
    """Kiểm tra URL callback của mọi provider đang bật; sai thì ném ngay lúc khởi động.

    Không có lỗi này thì người dùng bấm nút, đi hết vòng authorize, rồi mới nhận
    `redirect_uri_mismatch` từ phía provider.
    """
    cfg = settings if settings is not None else get_settings()
    problems: list[str] = []
    for spec in configured_providers(cfg):
        uri = redirect_uri_for(spec, cfg)
        try:
            validate_redirect_uri(spec, uri)
        except RedirectUriError as exc:
            problems.append(str(exc))
    if problems:
        raise RedirectUriError("; ".join(problems))


# ------------------------------------------------------------------ open redirect


def allowed_redirect_origins(settings: Settings | None = None) -> frozenset[str]:
    """Các origin mà ta chịu đưa trình duyệt tới sau khi đăng nhập."""
    cfg = settings if settings is not None else get_settings()
    origins = set()
    for raw in (cfg.oauth_post_login_redirect_url, cfg.cors_origins):
        for item in str(raw or "").split(","):
            parts = urlsplit(item.strip())
            if parts.scheme in ("http", "https") and parts.netloc:
                origins.add(f"{parts.scheme}://{parts.netloc}".lower())
    return frozenset(origins)


def safe_next_target(candidate: str, settings: Settings | None = None) -> str:
    """Chỉ nhận đường dẫn tương đối, hoặc URL tuyệt đối nằm trong allowlist.

    URL tuyệt đối sang miền khác là open redirect: kẻ xấu gửi victim tới
    `https://ta.com/…?next=https://evil.example` và nhận lại phiên ở trang của hắn.
    Rỗng nghĩa là "không có ý định riêng", dùng URL mặc định.
    """
    value = str(candidate or "").strip()
    if not value:
        return ""
    if len(value) > _MAX_REDIRECT_LENGTH:
        raise OAuthFlowError("redirect_invalid", "登录后的跳转地址非法")
    # `//evil.example` và `/\evil.example` là URL protocol-relative mà trình duyệt vẫn
    # điều hướng; dấu \ trong URL cũng bị một số trình duyệt quy về /.
    if "\\" in value or value.startswith("//"):
        raise OAuthFlowError("redirect_invalid", "登录后的跳转地址非法")
    if value.startswith("/"):
        return value
    parts = urlsplit(value)
    origin = f"{parts.scheme}://{parts.netloc}".lower() if parts.netloc else ""
    if parts.scheme not in ("http", "https") or origin not in allowed_redirect_origins(settings):
        raise OAuthFlowError("redirect_invalid", "登录后的跳转地址非法")
    return value


# --------------------------------------------------------------------------- PKCE


def code_challenge_s256(code_verifier: str) -> str:
    """RFC 7636 S256: base64url(sha256(verifier)), bỏ padding."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def create_pkce_pair() -> tuple[str, str]:
    """Cặp (code_verifier, code_challenge) mới; verifier không bao giờ rời backend."""
    # token_urlsafe(64) -> 86 ký tự, nằm trong khoảng 43..128 của RFC 7636.
    verifier = secrets.token_urlsafe(64)
    return verifier, code_challenge_s256(verifier)


# ------------------------------------------------------------------ authorize URL


def build_authorize_url(
    spec: ProviderSpec,
    *,
    redirect_uri: str,
    state: str,
    code_challenge: str,
    settings: Settings | None = None,
) -> str:
    """Dựng URL authorize của provider, PKCE luôn kèm theo.

    Gửi PKCE cho cả provider không *bắt buộc* nó: thêm vào không tốn gì, còn thiếu thì
    một provider đổi yêu cầu giữa chừng sẽ làm toàn bộ đăng nhập hỏng.
    """
    client_id, _ = client_credentials(spec, settings)
    params: list[tuple[str, str]] = [
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("scope", scope_string(spec)),
        ("state", state),
        ("code_challenge", code_challenge),
        ("code_challenge_method", "S256"),
        *spec.extra_authorize_params,
    ]
    return f"{spec.authorize_url}?{urlencode(params)}"


def start_authorization(
    spec: ProviderSpec,
    *,
    settings: Settings | None = None,
    store: Any | None = None,
    next_path: str = "",
) -> AuthorizeRequest:
    """Phát state chống CSRF gắn với PKCE verifier mới, rồi dựng URL authorize."""
    cfg = settings if settings is not None else get_settings()
    redis_client = store if store is not None else oauth_state.get_redis_client()
    verifier, challenge = create_pkce_pair()
    state, session_id = oauth_state.create_login_state(
        redis_client, spec.id, verifier, next_path=next_path
    )
    url = build_authorize_url(
        spec,
        redirect_uri=redirect_uri_for(spec, cfg),
        state=state,
        code_challenge=challenge,
        settings=cfg,
    )
    return AuthorizeRequest(url=url, state=state, session_id=session_id)


# ------------------------------------------------------------------ token exchange


@asynccontextmanager
async def _client_scope(client: httpx.AsyncClient | None) -> AsyncIterator[httpx.AsyncClient]:
    """Dùng client của người gọi (test tiêm MockTransport) hoặc mở một client ngắn hạn."""
    if client is not None:
        yield client
        return
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=False) as owned:
        yield owned


def _raise_for_provider_error(response: httpx.Response, *, step: str) -> None:
    """Biến lỗi từ phía trên thành OAuthProviderError, chỉ log mã lỗi.

    Thân lỗi của provider có thể lặp lại client_secret hoặc access token, và nó không
    có việc gì đi tới trình duyệt — nên không ghi ra log, không trả về cho frontend.
    """
    if response.status_code < 400:
        return
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    upstream_error = str(payload.get("error") or "")[:64]
    logger.warning(
        "oauth %s failed host=%s status=%s error=%s",
        step,
        response.request.url.host,
        response.status_code,
        upstream_error or "unknown",
    )
    raise OAuthProviderError(f"{step} failed ({upstream_error or response.status_code})")


async def _post_token_request(
    http: httpx.AsyncClient, spec: ProviderSpec, fields: dict[str, str]
) -> httpx.Response:
    headers = {"Accept": "application/json"}
    if spec.token_request_style == "json":
        return await http.post(spec.token_url, json=fields, headers=headers)
    if spec.token_request_style == "query":
        return await http.post(f"{spec.token_url}?{urlencode(fields)}", headers=headers)
    return await http.post(spec.token_url, data=fields, headers=headers)


async def exchange_code_for_token(
    spec: ProviderSpec,
    *,
    code: str,
    code_verifier: str,
    redirect_uri: str,
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> str:
    """Đổi authorization code lấy access token (chỉ backend dùng client secret).

    `redirect_uri` luôn gửi kèm: Facebook bắt buộc, các provider còn lại nhận nó như
    một phần của thứ tự đổi code và sẽ từ chối nếu thiếu.
    """
    client_id, client_secret = client_credentials(spec, settings)
    fields = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        spec.token_param_client_id: client_id,
        spec.token_param_client_secret: client_secret,
        "code_verifier": code_verifier,
    }
    async with _client_scope(client) as http:
        response = await _post_token_request(http, spec, fields)
        _raise_for_provider_error(response, step="token exchange")
        try:
            payload = response.json()
        except ValueError as exc:
            raise OAuthProviderError("token endpoint returned non-JSON") from exc

    access_token = str((payload or {}).get("access_token") or "").strip()
    if not access_token:
        raise OAuthProviderError("token endpoint returned no access_token")
    return access_token


async def fetch_userinfo(
    spec: ProviderSpec,
    *,
    access_token: str,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Đọc hồ sơ mà provider bảo chứng.

    Danh tính đến từ lệnh gọi TLS này chứ không phải từ một id_token ta tự kiểm chứng:
    người gọi không bao giờ phải tin một JWT mà chưa kiểm chữ ký.
    """
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    async with _client_scope(client) as http:
        if spec.userinfo_method == "post":
            response = await http.post(spec.userinfo_url, headers=headers)
        else:
            response = await http.get(spec.userinfo_url, headers=headers)
        _raise_for_provider_error(response, step="userinfo")
        try:
            payload = response.json()
        except ValueError as exc:
            raise OAuthProviderError("userinfo returned non-JSON") from exc

    if not isinstance(payload, dict):
        raise OAuthProviderError("userinfo returned a non-object")
    return payload


# ----------------------------------------------------------------------- identity


def _resolved_email_path(spec: ProviderSpec, payload: dict[str, Any]) -> str:
    """Đường dẫn thực sự tạo ra email, tính cả đường dẫn dự phòng."""
    if spec.email_path and read_text(payload, spec.email_path):
        return spec.email_path
    for fallback in spec.email_fallback_paths:
        if read_text(payload, fallback):
            return fallback
    return spec.email_path or ""


def identity_from_payload(spec: ProviderSpec, payload: dict[str, Any]) -> OAuthIdentity:
    """Biến userinfo của provider thành danh tính, chỉ giữ những gì provider bảo chứng.

    Email chưa được xác minh vẫn được giữ lại (để hiển thị), nhưng cờ `email_verified`
    đi kèm quyết định có dùng nó để liên kết tài khoản hay không.
    """
    subject = read_text(payload, spec.subject_id_path)
    if not subject:
        raise OAuthProviderError(f"{spec.label} userinfo has no subject id")

    email_path = _resolved_email_path(spec, payload)
    raw_email = read_text(payload, email_path).lower() if email_path else ""
    try:
        email = str(_EMAIL.validate_python(raw_email)).lower() if raw_email else ""
    except ValidationError as exc:
        raise OAuthProviderError(f"{spec.label} returned an unusable email claim") from exc

    nickname = read_text(payload, spec.name_path)[:_MAX_NICKNAME]
    if not nickname:
        # Không có tên thì lấy tên hộp thư; ở nhánh B (không email) thì để trống và
        # accounts.py chịu trách nhiệm đặt tên mặc định.
        nickname = email.split("@", 1)[0][:_MAX_NICKNAME] if email else ""

    return OAuthIdentity(
        provider=spec.id,
        subject=subject,
        email=email,
        email_verified=read_verified_flag(payload, spec, email_path),
        nickname=nickname,
        avatar_url=read_text(payload, spec.avatar_path)[:_MAX_AVATAR_URL],
    )


# --------------------------------------------------------------------- whole flow


async def complete_login(
    spec: ProviderSpec,
    *,
    code: str,
    state: str,
    session_id: str = "",
    db: AsyncSession,
    provider_error: str = "",
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
    store: Any | None = None,
) -> LoginHandoff:
    """Khép callback: kiểm CSRF, đổi code, nhận diện, mở tài khoản, phát mã một lần.

    Trả về mà frontend sẽ dùng ở POST /api/auth/oauth/exchange (hoặc
    /api/auth/oauth/setup khi tài khoản chưa hoàn chỉnh). Không có JWT nào nằm trong
    URL chuyển hướng, vì URL đó sẽ nằm trong log và lịch sử.
    """
    cfg = settings if settings is not None else get_settings()
    redis_client = store if store is not None else oauth_state.get_redis_client()

    if provider_error:
        # Người dùng bấm "Huỷ", hoặc provider từ chối trước khi phát code. Chuỗi này do
        # trình duyệt đưa tới nên phải cắt bớt; nó cũng không đi ra frontend (chỉ mã
        # `access_denied` mới đi).
        raise OAuthFlowError("access_denied", str(provider_error)[:64])
    if not (code or "").strip():
        raise OAuthFlowError("missing_code")
    if not (state or "").strip():
        raise OAuthFlowError("state_invalid")

    # Một lần dùng: state phát ra lại hoặc bịa đều biến mất khỏi Redis trước khi được tin.
    try:
        login_state = oauth_state.consume_login_state(redis_client, spec.id, state, session_id)
    except oauth_state.OAuthStateError as exc:
        raise OAuthFlowError("state_invalid", str(exc)) from exc

    access_token = await exchange_code_for_token(
        spec,
        code=code,
        code_verifier=login_state.code_verifier,
        redirect_uri=redirect_uri_for(spec, cfg),
        settings=cfg,
        client=client,
    )
    payload = await fetch_userinfo(spec, access_token=access_token, client=client)
    identity = identity_from_payload(spec, payload)

    result = await oauth_accounts.resolve_oauth_user(db, identity, settings=cfg)
    logger.info(
        "oauth login ok provider=%s user_id=%s outcome=%s",
        spec.id,
        result.user.id,
        result.outcome,
    )
    if result.needs_setup:
        return LoginHandoff(
            setup_required=True,
            token=oauth_state.issue_setup_token(redis_client, int(result.user.id)),
            next_path=login_state.next_path,
        )
    return LoginHandoff(
        setup_required=False,
        token=oauth_state.issue_login_grant(redis_client, int(result.user.id)),
        next_path=login_state.next_path,
    )