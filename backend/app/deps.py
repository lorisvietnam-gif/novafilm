from fastapi import Depends, HTTPException, Header, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.services import oauth_accounts
from app.services.api_keys import API_KEY_PREFIX, user_from_api_key
from app.services.auth import decode_token, get_user_by_id

security = HTTPBearer(auto_error=False)


def client_ip(request: Request) -> str:
    """IP thật của người gọi: proxy đặt trước, rồi mới tới peer trực tiếp."""
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    real = (request.headers.get("x-real-ip") or "").strip()
    if real:
        return real
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


async def _user_from_bearer(db: AsyncSession, token: str) -> User | None:
    """Resolve a user from a Bearer token: the pf_ prefix means an API key, otherwise parse it as a JWT."""
    if token.startswith(API_KEY_PREFIX):
        return await user_from_api_key(db, token)
    sub = decode_token(token)
    if not sub:
        return None
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        return None
    return await get_user_by_id(db, user_id)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    user = await _user_from_bearer(db, creds.credentials)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效")
    return user


async def get_api_user(
    creds: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
) -> User:
    """Public API: accepts a JWT or a pf_live_ API key (Bearer / X-Api-Key)."""
    token = (x_api_key or "").strip()
    if not token and creds:
        token = creds.credentials
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="缺少 API Key")
    user = await _user_from_bearer(db, token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API Key 无效或已撤销")
    return user


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    # Require role=admin for /api/admin routes
    if (user.role or "user") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return user


async def require_setup_complete(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Cổng cho màn hình đòi quyền trả phí.

    Tài khoản vừa được tạo từ một provider không có email xác minh (TikTok, Facebook)
    chưa tự đặt email/mật khẩu được. Nó xem và dùng thử được, nhưng chưa được nạp tiền
    hay chi tiền cho tới khi chứng minh được mình là chính mình.
    """
    if await oauth_accounts.pending_identity(db, int(user.id)) is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="请先完善账号信息")
    return user
