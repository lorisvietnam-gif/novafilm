"""第三方登录接口：可用登录方式、发起登录、回调、用一次性 code 换会话 JWT。

三步都是后端自己的地址，浏览器全程不接触 client_secret：
  GET  /api/auth/providers                     前端问后端哪些按钮能显示
  GET  /api/auth/{provider}/login              302 到 Google / Microsoft
  GET  /api/auth/{provider}/callback           第三方回调，验证 state 后换 token
  POST /api/auth/oauth/exchange                用一次性 code 换 JWT
"""

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.schemas import (
    OAuthExchangeRequest,
    OAuthProviderOut,
    OAuthProvidersResponse,
    TokenResponse,
)
from app.services import oauth, oauth_state
from app.services.auth import create_access_token
from app.services.oauth import OAuthConfigError, OAuthFlowError, OAuthProviderError
from app.services.oauth_accounts import OAuthIdentityError
from app.services.oauth_state import OAuthStateError, OAuthStoreError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Which redirect key the frontend reads, and the query parameter carrying it.
CODE_QUERY = "oauth_code"
ERROR_QUERY = "oauth_error"


@router.get("/providers", response_model=OAuthProvidersResponse)
async def list_providers() -> OAuthProvidersResponse:
    """列出真正配置好凭据的登录方式；未配置时返回空数组。

    这是前端唯一的开关来源：后端有凭据才出现按钮，前端不再自带 feature flag，
    也就不会出现“按钮在、后端没配好”的半截状态。
    """
    return OAuthProvidersResponse(
        providers=[
            OAuthProviderOut(
                id=spec.name,
                label=spec.label,
                login_url=oauth.login_url_for(spec.name),
                redirect_uri=oauth.redirect_uri_for(spec.name),
            )
            for spec in oauth.configured_providers()
        ]
    )


@router.post("/oauth/exchange", response_model=TokenResponse)
async def oauth_exchange(body: OAuthExchangeRequest) -> TokenResponse:
    """用回调发回的一次性 code 换会话 JWT。

    code 只能用一次、2 分钟过期，因此它出现在 URL 里也不会变成长期凭证。
    """
    try:
        user_id = oauth_state.consume_login_grant(oauth_state.get_redis_client(), body.code)
    except OAuthStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OAuthStateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return TokenResponse(access_token=create_access_token(str(user_id)))


@router.get("/{provider}/login")
async def oauth_login(provider: str) -> RedirectResponse:
    """开始登录：发 state + PKCE，302 到第三方授权页。"""
    try:
        spec = oauth.require_provider(provider)
        request = oauth.start_authorization(spec)
    except OAuthConfigError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OAuthStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RedirectResponse(request.url, status_code=302)


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """第三方回调：校验 state、换 token、认人，最后把浏览器送回前端。

    失败时也回到前端，只是带上一个固定的错误码（上游原文只进日志），
    这样用户不会停在后端的一个 JSON 错误页上。
    """
    try:
        spec = oauth.require_provider(provider)
    except OAuthConfigError:
        return _redirect_to_frontend({ERROR_QUERY: "provider_unavailable"})

    params = request.query_params
    try:
        grant = await oauth.complete_login(
            spec,
            code=params.get("code", ""),
            state=params.get("state", ""),
            provider_error=params.get("error", ""),
            db=db,
        )
    except OAuthStoreError:
        return _redirect_to_frontend({ERROR_QUERY: "service_unavailable"})
    except OAuthFlowError as exc:
        # state_invalid / missing_code / access_denied ...
        return _redirect_to_frontend({ERROR_QUERY: exc.code})
    except OAuthIdentityError as exc:
        return _redirect_to_frontend({ERROR_QUERY: exc.code})
    except OAuthProviderError:
        logger.warning("oauth callback failed provider=%s", provider, exc_info=True)
        return _redirect_to_frontend({ERROR_QUERY: "provider_error"})
    return _redirect_to_frontend({CODE_QUERY: grant})


def _redirect_to_frontend(query: dict[str, str]) -> RedirectResponse:
    """Send the browser back to the frontend route that finishes the login."""
    base = str(get_settings().oauth_post_login_redirect_url or "").rstrip("/")
    target = f"{base}?{urlencode(query)}"
    return RedirectResponse(target, status_code=302)
