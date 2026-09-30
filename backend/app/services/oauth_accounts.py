# -*- coding: utf-8 -*-
"""把第三方身份落到本站账号上：认人靠 provider+subject，绝不盲信邮箱。

三条硬规则：
1. provider 必须显式断言邮箱已验证，否则不建号也不绑定——否则任何人都能用
   preferred_username 之类的字段占住别人的邮箱，再等对方用真邮箱登录时被合并进来。
2. 只有 (provider, subject) 命中的身份才算“同一个人”；邮箱只是首次绑定的依据。
3. 同邮箱的旧账号是否自动合并由 OAUTH_AUTO_LINK_EMAIL 决定，关掉就退回“必须先用
   密码登录再手动绑定”。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.models import User
from app.models_oauth import OAuthAccount
from app.services.accounts import provision_new_user
from app.services.auth import get_user_by_email, get_user_by_id, oauth_only_password_hash

logger = logging.getLogger(__name__)

_NICKNAME_MAX = 64


class OAuthIdentityError(Exception):
    """The verified identity cannot be turned into a login; `code` reaches the browser."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


@dataclass(frozen=True)
class OAuthIdentity:
    """What the provider asserts about the person logging in."""

    provider: str
    subject: str
    email: str
    email_verified: bool
    nickname: str = ""


@dataclass(frozen=True)
class OAuthLoginResult:
    """The local account behind an identity, plus what had to happen to get there."""

    user: User
    outcome: str


def plan_oauth_link(
    identity: OAuthIdentity,
    *,
    linked_user: User | None,
    email_user: User | None,
    auto_link_email: bool = True,
) -> str:
    """Decide what to do with an identity. Pure: no database, fully testable.

    "signin"  this exact provider identity is already linked to an account
    "create"  nothing to reuse, so open a new account
    "link"    the verified address already belongs to an account, attach the identity
    "reject"  refuse, with the reason in OAuthIdentityError instead
    """
    if not identity.email or not identity.email_verified:
        # Unverified is treated exactly like absent: we must not create an account for an
        # address the provider has not confirmed, because that reserves somebody else's
        # email and later blocks their verified login.
        raise OAuthIdentityError("email_unverified", "第三方登录未提供已验证的邮箱")

    if linked_user is not None:
        return "signin"

    if email_user is None:
        return "create"

    if not auto_link_email:
        # Off means an operator wants returning users to prove themselves with a password
        # first; refuse rather than merge two identities behind the user's back.
        raise OAuthIdentityError(
            "email_taken", "该邮箱已有账号，请先用密码登录后再绑定第三方登录"
        )

    logger.info(
        "oauth auto-link provider=%s subject=%s user_id=%s",
        identity.provider,
        identity.subject,
        email_user.id,
    )
    return "link"


async def _load_linked_user(
    db: AsyncSession, provider: str, subject: str
) -> tuple[User | None, OAuthAccount | None]:
    account = (
        await db.execute(
            select(OAuthAccount).where(
                OAuthAccount.provider == provider,
                OAuthAccount.subject == subject,
            )
        )
    ).scalar_one_or_none()
    if account is None:
        return None, None
    return await get_user_by_id(db, int(account.user_id)), account


async def resolve_oauth_user(
    db: AsyncSession,
    identity: OAuthIdentity,
    *,
    settings: Settings | None = None,
) -> OAuthLoginResult:
    """Log in, link or create the local account behind a provider identity."""
    cfg = settings if settings is not None else get_settings()
    linked_user, account = await _load_linked_user(db, identity.provider, identity.subject)
    if linked_user is None and account is not None:
        # users row disappeared under a CASCADE that did not run (manual delete).
        raise OAuthIdentityError("identity_conflict", "第三方登录绑定已失效，请联系客服")

    email_user = None
    if linked_user is None:
        email_user = await get_user_by_email(db, identity.email)

    outcome = plan_oauth_link(
        identity,
        linked_user=linked_user,
        email_user=email_user,
        auto_link_email=bool(cfg.oauth_auto_link_email),
    )

    try:
        if outcome == "signin" and account is not None and linked_user is not None:
            account.last_login_at = datetime.now(timezone.utc)
            user = linked_user
        elif outcome == "link" and email_user is not None:
            user = email_user
            db.add(_new_account_row(identity, user.id))
        elif outcome == "create":
            user = await provision_new_user(
                db,
                email=identity.email,
                nickname=(identity.nickname or identity.email.split("@", 1)[0])[:_NICKNAME_MAX],
                hashed_password=oauth_only_password_hash(),
            )
            db.add(_new_account_row(identity, user.id))
        else:
            raise OAuthIdentityError("identity_conflict", "登录冲突，请重试")
        await db.commit()
    except IntegrityError as exc:
        # Two callbacks for the same identity or address raced; the unique constraints
        # caught it. The caller retries from a clean session.
        await db.rollback()
        logger.warning("oauth identity conflict provider=%s: %s", identity.provider, exc)
        raise OAuthIdentityError("identity_conflict", "登录冲突，请重试") from exc

    await db.refresh(user)
    return OAuthLoginResult(user=user, outcome=outcome)


def _new_account_row(identity: OAuthIdentity, user_id: int) -> OAuthAccount:
    return OAuthAccount(
        provider=identity.provider,
        subject=identity.subject,
        user_id=user_id,
        email=identity.email,
    )
