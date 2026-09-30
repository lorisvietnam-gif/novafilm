# -*- coding: utf-8 -*-
"""接口 đăng nhập bên thứ ba: provider nào dùng được, bắt đầu, callback, đổi mã, bổ sung thông tin.

Năm bước, tất cả đều là địa chỉ của chính backend, trình duyệt không bao giờ chạm
client_secret:
    GET  /api/auth/providers            frontend hỏi backend nút nào được hiện
    GET  /api/auth/{provider}/login      302 sang Google / Microsoft / Facebook / TikTok
    GET  /api/auth/{provider}/callback   provider gọi lại: kiểm state rồi đổi token
    POST /api/auth/oauth/exchange        đổi mã một lần lấy JWT
    POST /api/auth/oauth/setup           nhánh B: điền email + mật khẩu, rồi mới có JWT
"""

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import client_ip
from app.schemas import (
    OAuthExchangeRequest,
    OAuthExchangeResponse,
    OAuthProviderOut,
    OAuthProvidersResponse,
    OAuthSetupRequest,
    TokenResponse,
)
from app.services import oauth, oauth_accounts, oauth_state, rate_limit
from app.services.auth import (
    create_access_token,
    get_user_by_email,
    get_user_by_id,
    hash_password,
)
from app.services.oauth import OAuthConfigError, OAuthFlowError, OAuthProviderError
from app.services.oauth_accounts import OAuthIdentityError
from app.services.oauth_state import OAuthStateError, OAuthStoreError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Which redirect key the frontend reads, and the query parameter carrying it.
CODE_QUERY = "oauth_code"
ERROR_QUERY = "oauth_error"
# Set alongside CODE_QUERY when the token is a setup token instead of a login grant.
SETUP_QUERY = "oauth_setup_required"
# Cookie phiên trình duyệt: chứng minh state trở về đúng với tab đã bắt đầu đăng nhập.
SESSION_COOKIE = "oauth_sid"
_RATE_LIMIT_WINDOW_SECONDS = 60


async def _enforce_rate_limit(request: Request) -> None:
    """Chặn spam / đoán mã trên toàn bộ các endpoint `/api/auth/*` theo IP.

    `GET /api/auth/providers` cố tình không qua cổng này: nó chỉ đọc cấu hình, không
    tiêu tốn tài nguyên và frontend hỏi nó ở mọi trang.
    """
    settings = get_settings()
    try:
        store = oauth_state.get_redis_client()
    except OAuthStoreError:
        # Không có Redis thì cả state lẫn grant cũng không hoạt động, nên endpoint này
        # không còn là đường tấn công nào nữa.
        return
    try:
        rate_limit.hit(
            store,
            scope="oauth",
            identifier=client_ip(request),
            limit=max(1, int(settings.oauth_rate_limit_per_minute)),
            window_seconds=_RATE_LIMIT_WINDOW_SECONDS,
        )
    except rate_limit.RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc


@router.get("/providers", response_model=OAuthProvidersResponse)
async def list_providers() -> OAuthProvidersResponse:
    """Danh sách những cách đăng nhập backend thực sự phục vụ được.

    Đây là nguồn duy nhất để frontend bật/tắt nút: backend có đủ credential thì mới có
    nút, nên không bao giờ xảy ra trạng thái nửa vời "có nút nhưng backend chưa cấu hình".
    Chỉ trả `id` và `label`; client_secret không bao giờ ra khỏi backend.
    """
    return OAuthProvidersResponse(
        providers=[
            OAuthProviderOut(id=spec.id, label=spec.label)
            for spec in oauth.configured_providers()
        ]
    )


@router.get("/{provider}/login", dependencies=[Depends(_enforce_rate_limit)])
async def oauth_login(provider: str, request: Request) -> RedirectResponse:
    """Bắt đầu đăng nhập: phát state + PKCE + cookie phiên, rồi 302 sang provider."""
    try:
        spec = oauth.require_provider(provider)
        next_path = oauth.safe_next_target(request.query_params.get("next", ""))
        started = oauth.start_authorization(spec, next_path=next_path)
    except OAuthConfigError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OAuthFlowError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OAuthStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    response = RedirectResponse(started.url, status_code=302)
    _set_session_cookie(response, started.session_id)
    return response


@router.get("/{provider}/callback", dependencies=[Depends(_enforce_rate_limit)])
async def oauth_callback(
    provider: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Provider gọi lại: kiểm state, đổi token, nhận diện, rồi đưa trình duyệt về frontend.

    Hỏng cũng quay về frontend, chỉ mang theo một mã lỗi cố định (nguyên văn lỗi phía
    trên chỉ vào log) để người dùng không mắc kẹt ở một trang JSON của backend.
    """
    try:
        spec = oauth.require_provider(provider)
    except OAuthConfigError:
        return _redirect_to_frontend(None, {ERROR_QUERY: "provider_unavailable"})

    params = request.query_params
    try:
        handoff = await oauth.complete_login(
            spec,
            code=params.get("code", ""),
            state=params.get("state", ""),
            session_id=request.cookies.get(SESSION_COOKIE, ""),
            provider_error=params.get("error", ""),
            db=db,
        )
    except OAuthStoreError:
        return _redirect_to_frontend(None, {ERROR_QUERY: "service_unavailable"})
    except (OAuthFlowError, OAuthIdentityError) as exc:
        # state_invalid / missing_code / access_denied / email_taken / ...
        return _redirect_to_frontend(None, {ERROR_QUERY: exc.code})
    except OAuthProviderError:
        logger.warning("oauth callback failed provider=%s", provider, exc_info=True)
        return _redirect_to_frontend(None, {ERROR_QUERY: "provider_error"})

    query = {CODE_QUERY: handoff.token}
    if handoff.setup_required:
        query[SETUP_QUERY] = "1"
    return _redirect_to_frontend(handoff.next_path, query)


@router.post(
    "/oauth/exchange",
    response_model=OAuthExchangeResponse,
    dependencies=[Depends(_enforce_rate_limit)],
)
async def oauth_exchange(body: OAuthExchangeRequest) -> OAuthExchangeResponse:
    """Đổi mã một lần lấy JWT.

    Mã chỉ dùng một lần và hết hạn sau 2 phút, nên nó xuất hiện trong URL cũng không biến
    thành phiên lâu dài.
    """
    try:
        user_id = oauth_state.consume_login_grant(oauth_state.get_redis_client(), body.code)
    except OAuthStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OAuthStateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return OAuthExchangeResponse(access_token=create_access_token(str(user_id)))


@router.post(
    "/oauth/setup",
    response_model=TokenResponse,
    dependencies=[Depends(_enforce_rate_limit)],
)
async def oauth_setup(body: OAuthSetupRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Nhánh B: điền email + mật khẩu cho tài khoản provider không cho email.

    Chỉ tài khoản đang chờ mới qua được; tài khoản đã hoàn chỉnh thì từ chối, để không ai
    dùng đường này để đặt lại mật khẩu cho tài khoản đã có mật khẩu.
    """
    try:
        user_id = oauth_state.consume_setup_token(oauth_state.get_redis_client(), body.setup_token)
    except OAuthStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OAuthStateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = await get_user_by_id(db, user_id)
    identity = await oauth_accounts.pending_identity(db, user_id)
    if user is None or identity is None:
        raise HTTPException(status_code=400, detail="账号不存在或已完成设置")
    if await get_user_by_email(db, str(body.email)):
        raise HTTPException(status_code=400, detail="邮箱已注册")

    user.email = str(body.email).lower()
    user.hashed_password = hash_password(body.password)
    if body.nickname.strip():
        user.nickname = body.nickname.strip()
    identity.email = user.email
    identity.needs_setup = False
    await db.commit()
    return TokenResponse(access_token=create_access_token(str(user.id)))


def _set_session_cookie(response: Response, session_id: str) -> None:
    """Gắn cookie phiên cho tới hết hạn của state.

    `samesite=lax` để cookie vẫn đi kèm khi provider chuyển hồn trình duyệt về bằng một
    lượt GET cấp cao nhất; `secure` bật khi backend chạy qua https.
    """
    base = str(get_settings().oauth_redirect_base_url or "")
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        max_age=oauth_state.SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=base.startswith("https://"),
        path="/api/auth",
    )


def _redirect_to_frontend(next_path: str, query: dict[str, str]) -> RedirectResponse:
    """Đưa trình duyệt về trang frontend kết thúc đăng nhập, rồi xoá cookie phiên.

    `next_path` đến từ Redis nên không phải do trình duyệt sửa được, nhưng vẫn được kiểm
    tra lại: URL tuyệt đối sang miền khác là open redirect.
    """
    target = oauth.safe_next_target(next_path) or str(get_settings().oauth_post_login_redirect_url)
    separator = "&" if "?" in target else "?"
    response = RedirectResponse(f"{target}{separator}{urlencode(query)}", status_code=302)
    response.delete_cookie(SESSION_COOKIE, path="/api/auth")
    return response