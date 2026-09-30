"""OAuth 登录身份表：把第三方账号（provider + subject）绑到本站 users 行。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OAuthAccount(Base):
    """一条第三方身份。subject 是 provider 侧的稳定用户 ID（OIDC 的 sub），绝不用邮箱。

    (provider, subject) 唯一：同一第三方身份只能属于一个本站账号，
    这是登录时“认人”而不是“认邮箱”的依据。
    """

    __tablename__ = "oauth_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_oauth_account_provider_subject"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)
    subject: Mapped[str] = mapped_column(String(255), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # 绑定那一刻 provider 断言的邮箱，仅供审计；登录判定以 subject 为准
    email: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
