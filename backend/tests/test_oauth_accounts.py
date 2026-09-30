"""OAuth 身份与本地账号的绑定规则：认人只认 provider+subject，邮箱必须已验证。"""

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


def test_plan_signs_in_a_known_identity() -> None:
    # 已经绑过的 (provider, subject) 直接登录，邮箱变没变都不影响
    assert (
        oa.plan_oauth_link(_identity(email="other@example.com"), linked_user=_user(), email_user=None)
        == "signin"
    )


def test_plan_creates_an_account_for_an_unknown_address() -> None:
    assert oa.plan_oauth_link(_identity(), linked_user=None, email_user=None) == "create"


def test_plan_links_a_verified_address_to_the_existing_account() -> None:
    assert oa.plan_oauth_link(_identity(), linked_user=None, email_user=_user()) == "link"


def test_plan_refuses_when_autolink_is_off() -> None:
    # 关掉自动合并后，老用户必须先用密码登录再手动绑定
    with pytest.raises(OAuthIdentityError) as err:
        oa.plan_oauth_link(_identity(), linked_user=None, email_user=_user(), auto_link_email=False)
    assert err.value.code == "email_taken"


@pytest.mark.parametrize(
    "over",
    [{"email_verified": False}, {"email": ""}, {"email": "", "email_verified": False}],
)
def test_plan_refuses_an_unverified_address_even_when_free(over: dict) -> None:
    # 邮箱没被 provider 确认时，既不建号也不绑定：
    # 否则可以用 preferred_username 之类的字段占住别人的邮箱
    with pytest.raises(OAuthIdentityError) as err:
        oa.plan_oauth_link(_identity(**over), linked_user=None, email_user=None)
    assert err.value.code == "email_unverified"


def test_oauth_only_password_can_never_be_guessed_but_never_crashes_login() -> None:
    # users.hashed_password 非空：OAuth 账号也要有值，但必须是猜不出来的真 bcrypt hash，
    # 否则 POST /auth/login 会对非法 hash 抛异常而不是返回 401
    hashed = oauth_only_password_hash()
    assert hashed.startswith("$2")
    assert verify_password("anything", hashed) is False
    assert verify_password("", hashed) is False


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

    async def fake_provision(_db, *, email, nickname, hashed_password):
        return _user(id=101, email=email, hashed_password=hashed_password)

    monkeypatch.setattr(oa, "_load_linked_user", no_account)
    monkeypatch.setattr(oa, "get_user_by_email", no_email_user)
    monkeypatch.setattr(oa, "provision_new_user", fake_provision)

    result = await oa.resolve_oauth_user(db, identity, settings=fake_settings())

    assert result.outcome == "create"
    assert result.user.id == 101
    row = next(a for a in added if isinstance(a, oa.OAuthAccount))
    assert (row.provider, row.subject, row.email, row.user_id) == (
        "google",
        "google-sub-1",
        "user@example.com",
        101,
    )
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
    account = oa.OAuthAccount(provider="google", subject="google-sub-1", user_id=7, email="a@b.co")

    async def found_account(*_a, **_k):
        return known, account

    async def forbidden_email_lookup(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("a known identity must not look anyone up by email")

    monkeypatch.setattr(oa, "_load_linked_user", found_account)
    monkeypatch.setattr(oa, "get_user_by_email", forbidden_email_lookup)

    result = await oa.resolve_oauth_user(db, _identity(), settings=fake_settings())

    assert result.outcome == "signin"
    assert result.user.id == 7
    assert account.last_login_at is not None


@pytest.mark.asyncio
async def test_resolve_refuses_an_orphaned_identity_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # oauth_accounts 还在但 users 行没了：不能默默建号，要报错让人来处理
    db = _fake_db()
    account = oa.OAuthAccount(provider="google", subject="ghost", user_id=7, email="a@b.co")

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
