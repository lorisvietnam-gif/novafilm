# -*- coding: utf-8 -*-
"""Tạo tài khoản: mở một tài khoản miễn phí cho người đến từ đăng nhập bên thứ ba.

Giữ nguyên trạng thái khởi tạo của POST /auth/register (hạn mức, quà đăng ký, plan,
dòng ví) — nếu không, cùng một người sẽ nhận hai tài khoản khác nhau chỉ tùy họ đăng ký
bằng email hay đăng nhập bằng Google.
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
    avatar_url: str = "",
) -> User:
    """Create a free user plus its signup grant, mirroring POST /auth/register."""
    settings = get_settings()
    grant = int(settings.billing_signup_grant_fen or 0)
    user = User(
        email=email.lower(),
        nickname=nickname,
        hashed_password=hashed_password,
        avatar_url=avatar_url,
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