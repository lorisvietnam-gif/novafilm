"""Bảng danh tính OAuth: gắn tài khoản bên thứ ba (provider + subject) vào một hàng users."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OAuthAccount(Base):
    """Một danh tính bên thứ ba.

    ``subject_id`` là khoá định danh THẬT SỰ: nó là ID ổn định bên provider (OIDC ``sub``,
    ``open_id`` của TikTok, ``id`` của Facebook) và là thứ backend dùng để "nhận ra người
    này". ``email`` chỉ để đối chiếu, nên nó **tuỳ chọn** — TikTok không trả email.

    ``(provider, subject_id)`` là duy nhất: một danh tính bên thứ ba chỉ thuộc về một tài
    khoản cục bộ. Việc "cùng một người" được quyết định ở đây, không phải ở cột email.
    """

    __tablename__ = "oauth_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "subject_id", name="uq_oauth_account_provider_subject"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)
    subject_id: Mapped[str] = mapped_column(String(255), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Email provider khẳng định tại lúc liên kết; NULL khi provider không có email.
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    # True khi tài khoản được mở từ một provider không có email xác minh và người dùng
    # chưa tự đặt email + mật khẩu. Đặt lại False ở POST /api/auth/oauth/setup.
    needs_setup: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
