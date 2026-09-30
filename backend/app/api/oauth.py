"""第三方登录接口：可用登录方式、发起登录、回调、用一次性 code 换会话 JWT。"""

from fastapi import APIRouter

from app.schemas import OAuthProviderOut, OAuthProvidersResponse
from app.services import oauth

router = APIRouter(prefix="/auth", tags=["auth"])


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
