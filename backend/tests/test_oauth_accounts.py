"""Danh tính bên thứ ba và tài khoản cục bộ: nhận người bằng (provider, subject_id), không phải bằng email."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services import oauth_accounts as oa
from app.services.auth import oauth_only_password_hash, verify_password
from app.services.oauth_accounts import OAuthIdentity, OAuthIdentityError
from tests.oauth_fakes import fake_session, fake_settings


def _fake_db() -> MagicMock:
    """AsyncSession 替身：execute() 查不到任何行，新建的行收在 db.added。"""
    return fake_session(None)


def _identity(**over) -> OAuthIdentity:
    base = {
        "provider": "google",
        "subject": "google-sub-1",
        "email": "user@example.com",
        "email_verified": True,
        "nickname": "Ada",
    }
    base.update(over)
    return OAuthIdentity(**base)


def _user(**over):
    base = {"id": 7, "email": "user@example.com", "hashed_password": "hash"}
    base.update(over)
    return SimpleNamespace(**base)


# ------------------------------------------------------------------------- kế hoạch


def test_plan_signs_in_a_known_identity() -> None:
    # Đã từng đăng nhập bằng đúng cặp này: email có đổi cũng không sao
    assert (
        oa.plan_oauth_link(_identity(email="other@example.com"), linked_user=_user(), email_user=None)
        == "signin"
    )


def test_plan_creates_an_account_for_an_unknown_verified_address() -> None:
    assert oa.plan_oauth_link(_identity(), linked_user=None, email_user=None) == "create"


def test_plan_links_a_verified_address_to_the_existing_account() -> None:
    assert oa.plan_oauth_link(_identity(), linked_user=None, email_user=_user()) == "link"


def test_plan_refuses_when_autolink_is_off() -> None:
    # Tắt tự liên kết thì người dùng cũ phải tự chứng minh bằng mật khẩu trước
    with pytest.raises(OAuthIdentityError) as err:
        oa.plan_oauth_link(_identity(), linked_user=None, email_user=_user(), auto_link_email=False)
    assert err.value.code == "email_taken"


def test_plan_refuses_to_stack_a_second_provider_on_one_account() -> None:
    # Chống chiếm tài khoản: tài khoản đã gắn provider khác thì không ghi đè
    with pytest.raises(OAuthIdentityError) as err:
        oa.plan_oauth_link(
            _identity(provider="google"),
            linked_user=None,
            email_user=_user(),
            email_user_providers=frozenset({"microsoft"}),
        )
    assert err.value.code == "email_link_conflict"


def test_another_provider_on_the_same_account_still_blocks_linking() -> None:
    # Google đã gắn, giờ đến ký danh từ một provider khác -> vẫn phải từ chối
    with pytest.raises(OAuthIdentityError) as err:
        oa.plan_oauth_link(
            _identity(provider="microsoft"),
            linked_user=None,
            email_user=_user(),
            email_user_providers=frozenset({"google"}),
        )
    assert err.value.code == "email_link_conflict"


def test_same_provider_with_a_different_subject_still_links() -> None:
    # Cùng provider, khác open_id/sub: chưa từng gắn nên vẫn gắn được
    assert (
        oa.plan_oauth_link(
            _identity(provider="google"),
            linked_user=None,
            email_user=_user(),
            email_user_providers=frozenset({"google"}),
        )
        == "link"
    )


@pytest.mark.parametrize(
    "over",
    [
        {"provider": "tiktok", "email": "", "email_verified": False},
        {"provider": "facebook", "email": "a@b.co", "email_verified": False},
        {"provider": "facebook", "email": "", "email_verified": True},
    ],
)
def test_plan_falls_back_to_a_pending_account_without_a_verified_email(over: dict) -> None:
    # Nhánh B: không có email, hoặc email chưa xác minh -> không dùng email để liên kết,
    # không tạo tài khoản theo email. Chỉ nhận diện bằng (provider, subject_id).
    assert oa.plan_oauth_link(_identity(**over), linked_user=None, email_user=None) == "create_pending"


def test_pending_branch_ignores_the_autolink_switch() -> None:
    # Nhánh B không có email để mà liên kết, nên cờ auto_link không có ý nghĩa gì ở đây
    for auto_link in (True, False):
        assert (
            oa.plan_oauth_link(
                _identity(provider="tiktok", email="", email_verified=False),
                linked_user=None,
                email_user=None,
                auto_link_email=auto_link,
            )
            == "create_pending"
        )


@pytest.mark.asyncio
async def test_resolve_never_looks_up_an_email_owner_without_an_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # TikTok không có email: không được đi tra cứu ai theo email (tra cứu rỗng là lộ
    # đường liên kết sai, và tệ hơn là tra nhầm vào một hàng không liên quan)
    db = _fake_db()

    async def no_account(*_a, **_k):
        return None, None

    async def forbidden_email_lookup(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("an identity without an email must not be matched by email")

    async def fake_provision(_db, *, email, nickname, hashed_password, **kw):
        return _user(id=303, email=email, hashed_password=hashed_password)

    monkeypatch.setattr(oa, "_load_linked_user", no_account)
    monkeypatch.setattr(oa, "get_user_by_email", forbidden_email_lookup)
    monkeypatch.setattr(oa, "provision_new_user", fake_provision)

    result = await oa.resolve_oauth_user(
        db,
        _identity(provider="tiktok", subject="open-1", email="", email_verified=False),
        settings=fake_settings(),
    )

    assert result.outcome == "create_pending"
    assert result.needs_setup is True
    row = next(a for a in db.added if isinstance(a, oa.OAuthAccount))
    assert (row.provider, row.subject_id, row.email, row.needs_setup) == (
        "tiktok",
        "open-1",
        None,
        True,
    )


def test_oauth_only_password_can_never_be_guessed_but_never_crashes_login() -> None:
    # users.hashed_password 非空：OAuth 账号也要有值，但必须是猜不出来的真 bcrypt hash，
    # 否则 POST /auth/login 会对非法 hash 抛异常而不是返回 401
    hashed = oauth_only_password_hash()
    assert hashed.startswith("$2")
    assert verify_password("anything", hashed) is False
    assert verify_password("", hashed) is False


# ------------------------------------------------------------ địa chỉ nội bộ nhánh B


def test_placeholder_email_is_stable_undeliverable_and_unique_per_identity() -> None:
    # Không bịa hộp thư của ai: .invalid không bao giờ phân giải được (RFC 2606),
    # và cùng một danh tính luôn ra cùng một khoá nội bộ.
    first = oa.placeholder_email("tiktok", "open-1")
    assert first == oa.placeholder_email("tiktok", "open-1")
    assert first != oa.placeholder_email("tiktok", "open-2")
    assert first != oa.placeholder_email("facebook", "open-1")
    assert first.endswith("@users.invalid")
    assert first.startswith("tiktok_")


# ------------------------------------------------------------------------- resolve


@pytest.mark.asyncio
async def test_resolve_creates_the_user_and_the_identity_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _fake_db()
    identity = _identity()
    added = db.added

    async def no_account(*_a, **_k):
        return None, None

    async def no_email_user(*_a, **_k):
        return None

    async def fake_provision(_db, *, email, nickname, hashed_password, **kw):
        return _user(id=101, email=email, hashed_password=hashed_password)

    monkeypatch.setattr(oa, "_load_linked_user", no_account)
    monkeypatch.setattr(oa, "get_user_by_email", no_email_user)
    monkeypatch.setattr(oa, "provision_new_user", fake_provision)

    result = await oa.resolve_oauth_user(db, identity, settings=fake_settings())

    assert result.outcome == "create"
    assert result.needs_setup is False
    assert result.user.id == 101
    row = next(a for a in added if isinstance(a, oa.OAuthAccount))
    assert (row.provider, row.subject_id, row.email, row.user_id) == (
        "google",
        "google-sub-1",
        "user@example.com",
        101,
    )
    assert row.needs_setup is False
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_resolve_links_to_the_existing_account_without_creating_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _fake_db()
    added = db.added
    existing = _user(id=7)

    async def no_account(*_a, **_k):
        return None, None

    async def found_email_user(*_a, **_k):
        return existing

    async def forbidden_provision(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("must not create a second account for the same address")

    monkeypatch.setattr(oa, "_load_linked_user", no_account)
    monkeypatch.setattr(oa, "get_user_by_email", found_email_user)
    monkeypatch.setattr(oa, "provision_new_user", forbidden_provision)

    result = await oa.resolve_oauth_user(db, _identity(), settings=fake_settings())

    assert result.outcome == "link"
    assert result.user.id == 7
    rows = [a for a in added if isinstance(a, oa.OAuthAccount)]
    assert len(rows) == 1 and rows[0].user_id == 7


@pytest.mark.asyncio
async def test_resolve_signs_in_and_touches_last_login(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _fake_db()
    known = _user(id=7)
    account = oa.OAuthAccount(
        provider="google", subject_id="google-sub-1", user_id=7, email="a@b.co"
    )

    async def found_account(*_a, **_k):
        return known, account

    async def forbidden_email_lookup(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("a known identity must not look anyone up by email")

    monkeypatch.setattr(oa, "_load_linked_user", found_account)
    monkeypatch.setattr(oa, "get_user_by_email", forbidden_email_lookup)

    result = await oa.resolve_oauth_user(db, _identity(), settings=fake_settings())

    assert result.outcome == "signin"
    assert result.needs_setup is False
    assert result.user.id == 7
    assert account.last_login_at is not None


@pytest.mark.asyncio
async def test_resolve_keeps_asking_for_setup_while_the_account_is_incomplete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Lần đăng nhập sau với cùng open_id của một tài khoản chưa hoàn chỉnh vẫn không được
    # phát JWT — nếu phát, tài khoản đó lọt vào màn hình yêu cầu quyền trả phí.
    db = _fake_db()
    known = _user(id=7)
    account = oa.OAuthAccount(
        provider="tiktok", subject_id="open-1", user_id=7, email=None, needs_setup=True
    )

    async def found_account(*_a, **_k):
        return known, account

    monkeypatch.setattr(oa, "_load_linked_user", found_account)
    result = await oa.resolve_oauth_user(
        db, _identity(provider="tiktok", subject="open-1", email="", email_verified=False),
        settings=fake_settings(),
    )
    assert result.outcome == "needs_setup"
    assert result.needs_setup is True
    assert result.user.id == 7


@pytest.mark.asyncio
async def test_resolve_refuses_an_orphaned_identity_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # oauth_accounts còn nhưng hàng users đã mất: không âm thầm tạo tài khoản mới
    db = _fake_db()
    account = oa.OAuthAccount(provider="google", subject_id="ghost", user_id=7, email="a@b.co")

    async def orphaned(*_a, **_k):
        return None, account

    monkeypatch.setattr(oa, "_load_linked_user", orphaned)
    with pytest.raises(OAuthIdentityError) as err:
        await oa.resolve_oauth_user(db, _identity(subject="ghost"), settings=fake_settings())
    assert err.value.code == "identity_conflict"


@pytest.mark.asyncio
async def test_resolve_reports_a_unique_constraint_race(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sqlalchemy.exc import IntegrityError

    db = _fake_db()

    async def no_account(*_a, **_k):
        return None, None

    async def no_email_user(*_a, **_k):
        return None

    async def raising_provision(*_a, **_k):
        return _user(id=1)

    async def boom():
        raise IntegrityError("insert", {}, Exception("duplicate key"))

    db.commit.side_effect = boom
    monkeypatch.setattr(oa, "_load_linked_user", no_account)
    monkeypatch.setattr(oa, "get_user_by_email", no_email_user)
    monkeypatch.setattr(oa, "provision_new_user", raising_provision)

    with pytest.raises(OAuthIdentityError) as err:
        await oa.resolve_oauth_user(db, _identity(), settings=fake_settings())
    assert err.value.code == "identity_conflict"
    db.rollback.assert_awaited()