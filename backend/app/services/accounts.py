# -*- coding: utf-8 -*-
"""建号：给没有本地密码的第三方登录用户开一个和注册等价的新账号。

和 app/api/auth.py 的 register 保持同一套初始状态（额度、注册赠送、plan、钱包流水），
否则同一个人从邮箱注册和从 Google 登录进来会拿到不一样的账号。
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User, WalletLedger


async def provision_new_user(
    db: AsyncSession,
    *,
    email: str,
    nickname: str,
    hashed_password: str,
) -> User:
    """Create a free user plus its signup grant, mirroring POST /auth/register."""
    settings = get_settings()
    grant = int(settings.billing_signup_grant_fen or 0)
    user = User(
        email=email.lower(),
        nickname=nickname,
        hashed_password=hashed_password,
        quota_left=settings.new_user_quota,
        balance_fen=grant,
        plan="free",
    )
    db.add(user)
    await db.flush()
    if grant > 0:
        db.add(
            WalletLedger(
                user_id=user.id,
                delta_fen=grant,
                balance_after=grant,
                kind="grant",
                ref_type="signup",
                ref_id=str(user.id),
                note="signup_grant",
            )
        )
    return user
