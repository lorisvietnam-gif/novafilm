# -*- coding: utf-8 -*-
"""Đổ danh tính bên thứ ba thành tài khoản cục bộ: nhận người bằng (provider, subject).

Ba quy tắc cứng:

1. **Định danh duy nhất là `(provider, subject_id)`.** Email chỉ là *bằng chứng* ở nhánh A,
   không bao giờ là khoá. TikTok không trả email, nên nhánh B tồn tại và tuyệt đối không
   bịa ra địa chỉ giả, cũng không ghép email từ tên hiển thị.

2. **Nhánh A — provider có email ĐÃ XÁC MINH.** Tìm tài khoản theo email; có sẵn thì
   liên kết (nếu `oauth_auto_link_email` bật), không có thì tạo mới. Không ghi đè:
   tài khoản đã gắn provider khác thì từ chối.

3. **Nhánh B — không có email, hoặc email chưa xác minh.** Chỉ khớp được bằng
   `(provider, subject_id)`. Lần đầu tạo một tài khoản *chưa hoàn chỉnh* và bắt người
   dùng tự đặt email + mật khẩu; tài khoản chưa hoàn chỉnh không được vào màn hình
   yêu cầu quyền trả phí.
"""
from __future__ import annotations

import hashlib
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
# TLD .invalid được RFC 2606 dành riêng và không bao giờ phân giải được. Địa chỉ sinh ra
# ở đây KHÔNG phải hộp thư của ai cả: nó là khoá nội bộ để lấp chỗ trống cho cột
# users.email (NOT NULL, UNIQUE) khi provider không cho email.
_PLACEHOLDER_EMAIL_DOMAIN = "users.invalid"
# Trùng với mặc định của User.nickname: tài khoản chưa hoàn chỉnh chưa có tên để hiển thị.
_DEFAULT_NICKNAME = "创作者"


class OAuthIdentityError(Exception):
    """Danh tính này không đổi được thành một lần đăng nhập; `code` tới trình duyệt."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


@dataclass(frozen=True)
class OAuthIdentity:
    """Những gì provider khẳng định về người đang đăng nhập."""

    provider: str
    subject: str
    # Rỗng nghĩa là provider không trả email — hoàn toàn bình thường với TikTok.
    email: str
    email_verified: bool
    nickname: str = ""
    avatar_url: str = ""


@dataclass(frozen=True)
class OAuthLoginResult:
    """Tài khoản cục bộ đứng sau một danh tính, cùng việc đã phải làm để tới đó."""

    user: User
    # signin | link | create | create_pending | needs_setup
    outcome: str

    @property
    def needs_setup(self) -> bool:
        """Tài khoản chưa có email/mật khẩu riêng: chỉ được nhận mã điền thông tin, không có JWT."""
        return self.outcome in ("create_pending", "needs_setup")


def placeholder_email(provider: str, subject: str) -> str:
    """Địa chỉ nội bộ, không gửi được, sinh ổn định từ (provider, subject_id).

    Không phải địa chỉ bịa để đánh tráo ai: nó không gửi được, không thuộc về người
    dùng, chỉ để một tài khoản chưa có email vẫn có một hàng hợp lệ trong `users`.
    """
    digest = hashlib.sha256(f"{provider}:{subject}".encode("utf-8")).hexdigest()[:32]
    return f"{provider}_{digest}@{_PLACEHOLDER_EMAIL_DOMAIN}"


def plan_oauth_link(
    identity: OAuthIdentity,
    *,
    linked_user: User | None,
    linked_needs_setup: bool = False,
    email_user: User | None,
    email_user_providers: frozenset[str] = frozenset(),
    auto_link_email: bool = True,
) -> str:
    """Quyết định làm gì với một danh tính. Hàm thuần: không đụng database, test được trực tiếp.

    "signin"         (provider, subject) đã gắn với một tài khoản đã hoàn chỉnh
    "needs_setup"    đã gắn, nhưng tài khoản vẫn chưa có email/mật khẩu riêng
    "link"           nhánh A: email đã xác minh thuộc về tài khoản có sẵn
    "create"         nhánh A: email đã xác minh chưa có ai dùng
    "create_pending" nhánh B: không email / chưa xác minh -> tạo tài khoản chưa hoàn chỉnh
    """
    if linked_user is not None:
        # Đã từng đăng nhập bằng đúng cặp này: không quan tâm email có đổi hay không.
        return "needs_setup" if linked_needs_setup else "signin"

    if not identity.email or not identity.email_verified:
        # Chưa xác minh thì coi như không có: không dùng để liên kết, không dùng để tạo
        # tài khoản theo email — nếu không, ai cũng có thể chiếm trước hộp thư của người
        # khác rồi chặn họ khi họ đăng nhập thật.
        return "create_pending"

    if email_user is None:
        return "create"

    if not auto_link_email:
        # Tắt nghĩa là chủ hệ thống muốn người dùng cũ tự chứng minh bằng mật khẩu trước;
        # từ chối còn hơn tự gộp hai danh tính sau lưng họ.
        raise OAuthIdentityError("email_taken", "该邮箱已有账号，请先用密码登录后再绑定第三方登录")

    others = {p for p in email_user_providers if p and p != identity.provider}
    if others:
        # Tài khoản này đã gắn provider khác. Ghi thêm sẽ biến một lần đăng nhập thành
        # hai, rồi đổi email là chiếm được cả hai. Từ chối, không ghi đè.
        raise OAuthIdentityError(
            "email_link_conflict",
            "该邮箱已绑定其他登录方式，请先用密码登录后再手动绑定",
        )

    logger.info(
        "oauth auto-link provider=%s user_id=%s",
        identity.provider,
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
                OAuthAccount.subject_id == subject,
            )
        )
    ).scalar_one_or_none()
    if account is None:
        return None, None
    return await get_user_by_id(db, int(account.user_id)), account


async def _linked_providers(db: AsyncSession, user_id: int) -> frozenset[str]:
    """Các provider đã gắn vào một tài khoản (dùng để chặn chiếm tài khoản)."""
    result = await db.execute(
        select(OAuthAccount.provider).where(OAuthAccount.user_id == user_id)
    )
    return frozenset(str(value) for value in result.scalars().all())


async def pending_identity(db: AsyncSession, user_id: int) -> OAuthAccount | None:
    """Danh tính đang chờ người dùng tự đặt email + mật khẩu, nếu có.

    Cùng một truy vấn phục vụ cả hai đầu: chặn màn hình đòi quyền trả phí và cho phép
    POST /api/auth/oauth/setup đóng trạng thái chờ.
    """
    result = await db.execute(
        select(OAuthAccount)
        .where(OAuthAccount.user_id == user_id, OAuthAccount.needs_setup.is_(True))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def resolve_oauth_user(
    db: AsyncSession,
    identity: OAuthIdentity,
    *,
    settings: Settings | None = None,
) -> OAuthLoginResult:
    """Đăng nhập, liên kết hoặc tạo tài khoản cục bộ đứng sau một danh tính provider."""
    cfg = settings if settings is not None else get_settings()
    linked_user, account = await _load_linked_user(db, identity.provider, identity.subject)
    if linked_user is None and account is not None:
        # Còn dòng oauth_accounts nhưng mất hàng users (xoá tay, CASCADE không chạy).
        raise OAuthIdentityError("identity_conflict", "第三方登录绑定已失效，请联系客服")

    email_user: User | None = None
    email_user_providers: frozenset[str] = frozenset()
    if linked_user is None and identity.email:
        email_user = await get_user_by_email(db, identity.email)
        if email_user is not None:
            email_user_providers = await _linked_providers(db, int(email_user.id))

    outcome = plan_oauth_link(
        identity,
        linked_user=linked_user,
        linked_needs_setup=bool(account is not None and account.needs_setup),
        email_user=email_user,
        email_user_providers=email_user_providers,
        auto_link_email=bool(cfg.oauth_auto_link_email),
    )

    try:
        if outcome in ("signin", "needs_setup") and account is not None and linked_user is not None:
            account.last_login_at = datetime.now(timezone.utc)
            user = linked_user
        elif outcome == "link" and email_user is not None:
            # Địa chỉ đã xác minh thuộc về một tài khoản có sẵn: chỉ gắn thêm danh tính,
            # tuyệt đối không mở tài khoản mới.
            user = email_user
            db.add(_new_account_row(identity, user.id))
        elif outcome in ("create", "create_pending"):
            email = identity.email or placeholder_email(identity.provider, identity.subject)
            user = await provision_new_user(
                db,
                email=email,
                nickname=(identity.nickname or _DEFAULT_NICKNAME)[:_NICKNAME_MAX],
                hashed_password=oauth_only_password_hash(),
                avatar_url=identity.avatar_url,
            )
            db.add(_new_account_row(identity, user.id))
        else:  # pragma: no cover - plan_oauth_link chỉ trả về 5 giá trị trên
            raise OAuthIdentityError("identity_conflict", "登录冲突，请重试")
        await db.commit()
    except IntegrityError as exc:
        # Hai callback cho cùng một danh tính hoặc cùng một địa chỉ chạy song song; ràng
        # buộc unique bắt được. Người gọi thử lại từ session sạch.
        await db.rollback()
        logger.warning("oauth identity conflict provider=%s: %s", identity.provider, exc)
        raise OAuthIdentityError("identity_conflict", "登录冲突，请重试") from exc

    await db.refresh(user)
    return OAuthLoginResult(user=user, outcome=outcome)


def _new_account_row(identity: OAuthIdentity, user_id: int) -> OAuthAccount:
    return OAuthAccount(
        provider=identity.provider,
        subject_id=identity.subject,
        user_id=user_id,
        # None = provider không cho email. subject_id mới là khoá định danh thật sự.
        email=identity.email or None,
        needs_setup=not (identity.email and identity.email_verified),
    )