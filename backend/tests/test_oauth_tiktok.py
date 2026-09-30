"""TikTok 登录：provider không trả email, nên nhận diện chỉ có thể dựa vào (tiktok, open_id).

Đây là lý do nhánh B tồn tại. Toàn bộ test offline: MockTransport + FakeRedis, không Postgres.
"""

from __future__ import annotations

from types import SimpleNamespace
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi import HTTPException
from httpx import ASGITransport

from app.database import get_db
from app.main import app as main_app
from app.services import oauth, oauth_accounts, oauth_state
from tests.oauth_fakes import FakeRedis, fake_session, fake_settings, mock_transport, query_of

SETTINGS = fake_settings(
    tiktok_client_key="tkey",
    tiktok_client_secret="tsecret",
    oauth_redirect_base_url="https://api.example.com",
)

TOKEN_OK = httpx.Response(200, json={"access_token": "at-t", "token_type": "Bearer"})
USERINFO_OK = httpx.Response(
    200,
    json={
        "data": {
            "user": {
                "open_id": "tt-open-1",
                "display_name": "Linh",
                "avatar_url": "https://tiktok/a.png",
            }
        },
        "code": 0,
    },
)
RESPONSES = {"open.tiktokapis.com/v2/oauth/token": TOKEN_OK, "userinfo": USERINFO_OK}


def _spec():
    return oauth.require_provider("tiktok", SETTINGS)


def _upstream(calls: list[httpx.Request] | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=mock_transport(RESPONSES, calls))


async def _login(r: FakeRedis, code: str, db=None) -> oauth.LoginHandoff:
    spec = _spec()
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    async with _upstream() as client:
        return await oauth.complete_login(
            spec,
            code=code,
            state=started.state,
            session_id=started.session_id,
            db=db or fake_session(),
            settings=SETTINGS,
            client=client,
            store=r,
        )


def _http() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=main_app), base_url="http://test")


# ------------------------------------------------------------------ registry facts


def test_tiktok_has_no_email_support_in_the_registry() -> None:
    spec = oauth.find_spec("tiktok")
    assert spec.supports_email is False
    assert spec.email_path is None
    assert spec.pkce_required is True


def test_tiktok_identity_has_no_email_even_when_the_display_name_looks_like_one() -> None:
    # Tuyệt đối không ghép email từ tên hiển thị: chuỗi "ada@example.com" trong display_name
    # không phải hộp thư của ai
    identity = oauth.identity_from_payload(
        oauth.find_spec("tiktok"),
        {"data": {"user": {"open_id": "o1", "display_name": "ada@example.com"}}},
    )
    assert identity.email == ""
    assert identity.email_verified is False


# ------------------------------------------------------------------- round trip


@pytest.mark.asyncio
async def test_tiktok_roundtrip_uses_client_key_and_the_nested_paths(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[httpx.Request] = []
    r = FakeRedis()

    async def fake_resolve(_db, identity, settings=None):
        assert identity.subject == "tt-open-1"
        assert identity.email == ""
        assert identity.nickname == "Linh"
        assert identity.avatar_url == "https://tiktok/a.png"
        return oauth_accounts.OAuthLoginResult(user=SimpleNamespace(id=8080), outcome="create_pending")

    monkeypatch.setattr(oauth_accounts, "resolve_oauth_user", fake_resolve)

    spec = _spec()
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    assert query_of(started.url)["redirect_uri"] == "https://api.example.com/api/auth/tiktok/callback"

    async with _upstream(calls) as client:
        handoff = await oauth.complete_login(
            spec,
            code="tt-code",
            state=started.state,
            session_id=started.session_id,
            db=fake_session(),
            settings=SETTINGS,
            client=client,
            store=r,
        )

    token_request, userinfo_request = calls
    assert token_request.method == "POST"
    form = {k: v[0] for k, v in parse_qs(token_request.content.decode()).items()}
    # TikTok gọi nó là client_key; gửi client_id sẽ luôn invalid_client
    assert form["client_key"] == "tkey"
    assert "client_id" not in form
    assert form["client_secret"] == "tsecret"
    assert form["code_verifier"]
    # userinfo của TikTok là POST, không phải GET
    assert userinfo_request.method == "POST"
    assert userinfo_request.url.host == "open.tiktokapis.com"
    assert handoff.setup_required is True
    assert oauth_state.consume_setup_token(r, handoff.token) == 8080


@pytest.mark.asyncio
async def test_second_login_with_the_same_open_id_lands_on_the_same_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Bài toán cốt lõi: lần hai vẫn không có email, và KHÔNG được tạo tài khoản mới.
    # Mô phỏng bảng oauth_accounts bằng dict và làm provision_new_user nổ lần thứ hai.
    known: dict[tuple[str, str], SimpleNamespace] = {}
    lookups: list[tuple[str, str]] = []
    created: list[int] = []

    async def fake_lookup(_db, provider, subject):
        lookups.append((provider, subject))
        identity = known.get((provider, subject))
        if identity is None:
            return None, None
        return SimpleNamespace(id=identity.user_id), identity

    async def fake_provision(_db, *, email, nickname, hashed_password, **kw):
        assert not known, "phải vào đúng tài khoản cũ, không tạo tài khoản thứ hai"
        known[("tiktok", "tt-open-1")] = SimpleNamespace(
            user_id=6060, needs_setup=True, last_login_at=None
        )
        created.append(6060)
        return SimpleNamespace(id=6060, email=email)

    monkeypatch.setattr(oauth_accounts, "_load_linked_user", fake_lookup)
    monkeypatch.setattr(oauth_accounts, "provision_new_user", fake_provision)

    r = FakeRedis()
    first = await _login(r, "tt-code-1")
    second = await _login(r, "tt-code-2")

    # Lần một: chưa có danh tính -> tài khoản chưa hoàn chỉnh, chỉ nhận mã điền thông tin
    assert first.setup_required is True
    # Lần hai: khớp (tiktok, tt-open-1) -> đúng tài khoản cũ, không mở tài khoản mới.
    # Vẫn chưa hoàn chỉnh nên tiếp tục không được nhận JWT.
    assert second.setup_required is True
    assert created == [6060]
    assert lookups == [("tiktok", "tt-open-1"), ("tiktok", "tt-open-1")]
    assert oauth_state.consume_setup_token(r, first.token) == 6060
    assert oauth_state.consume_setup_token(r, second.token) == 6060


@pytest.mark.asyncio
async def test_a_completed_account_signs_in_with_a_jwt_on_the_next_visit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Sau khi đã điền email + mật khẩu thì lần đăng nhập kế tiếp là bình thường
    identity = SimpleNamespace(user_id=6060, needs_setup=False, last_login_at=None)
    known: dict[tuple[str, str], SimpleNamespace] = {("tiktok", "tt-open-1"): identity}

    async def fake_lookup(_db, provider, subject):
        return SimpleNamespace(id=6060), known.get((provider, subject))

    async def forbidden_provision(*_a, **_kw):  # pragma: no cover - must not run
        raise AssertionError("tài khoản đã có thì không được mở tài khoản mới")

    monkeypatch.setattr(oauth_accounts, "_load_linked_user", fake_lookup)
    monkeypatch.setattr(oauth_accounts, "provision_new_user", forbidden_provision)

    r = FakeRedis()
    handoff = await _login(r, "tt-code-3")
    assert handoff.setup_required is False
    assert oauth_state.consume_login_grant(r, handoff.token) == 6060
    assert identity.last_login_at is not None


# ------------------------------------------------------------- endpoint /api/auth


@pytest.mark.asyncio
async def test_pending_login_never_receives_a_jwt(monkeypatch: pytest.MonkeyPatch) -> None:
    # Bằng chứng ở tầng API: token của tài khoản chưa hoàn chỉnh không đổi được JWT
    r = FakeRedis()
    monkeypatch.setattr(oauth, "get_settings", lambda: SETTINGS)
    monkeypatch.setattr(oauth_state, "get_redis_client", lambda: r)

    async def fake_complete(*_args, **_kwargs):
        return oauth.LoginHandoff(
            setup_required=True, token=oauth_state.issue_setup_token(r, 77)
        )

    monkeypatch.setattr(oauth, "complete_login", fake_complete)
    setup_token = oauth_state.issue_setup_token(r, 77)
    main_app.dependency_overrides[get_db] = lambda: fake_session()
    try:
        async with _http() as c:
            res = await c.get(
                "/api/auth/tiktok/callback",
                params={"code": "tt-code", "state": "s", "session_id": ""},
                follow_redirects=False,
            )
            code = query_of(res.headers["location"])["oauth_code"]
            exchange = await c.post("/api/auth/oauth/exchange", json={"code": code})
            setup = await c.post(
                "/api/auth/oauth/setup",
                json={"setup_token": setup_token, "email": "a@b.co", "password": "a-good-password"},
            )
    finally:
        main_app.dependency_overrides.pop(get_db, None)

    assert query_of(res.headers["location"]).get("oauth_setup_required") == "1"
    assert "access_token" not in res.headers["location"]
    assert exchange.status_code == 400  # setup token không đổi được JWT
    assert setup.status_code == 400  # và tài khoản chưa tồn tại trong DB của test này


@pytest.mark.asyncio
async def test_setup_endpoint_finishes_a_pending_account(monkeypatch: pytest.MonkeyPatch) -> None:
    # Sau khi điền email + mật khẩu thì tài khoản hoàn chỉnh và có JWT
    r = FakeRedis()
    monkeypatch.setattr(oauth_state, "get_redis_client", lambda: r)
    user = SimpleNamespace(
        id=909, email="tiktok_x@users.invalid", nickname="Linh", hashed_password="x"
    )
    identity = SimpleNamespace(email=None, needs_setup=True)

    async def lookup_by_id(_db, user_id):
        return user if user_id == user.id else None

    async def lookup_by_email(_db, _email):
        return None

    async def pending_identity(_db, user_id):
        return identity if user_id == user.id else None

    monkeypatch.setattr("app.api.oauth.get_user_by_id", lookup_by_id)
    monkeypatch.setattr("app.api.oauth.get_user_by_email", lookup_by_email)
    monkeypatch.setattr("app.api.oauth.oauth_accounts.pending_identity", pending_identity)

    setup_token = oauth_state.issue_setup_token(r, 909)
    main_app.dependency_overrides[get_db] = lambda: fake_session()
    try:
        async with _http() as c:
            res = await c.post(
                "/api/auth/oauth/setup",
                json={
                    "setup_token": setup_token,
                    "email": "linh@example.com",
                    "password": "a-good-password",
                    "nickname": "Linh",
                },
            )
            replay = await c.post(
                "/api/auth/oauth/setup",
                json={
                    "setup_token": setup_token,
                    "email": "linh@example.com",
                    "password": "a-good-password",
                },
            )
    finally:
        main_app.dependency_overrides.pop(get_db, None)

    assert res.status_code == 200
    assert user.email == "linh@example.com"
    assert identity.needs_setup is False
    assert res.json()["access_token"]
    assert replay.status_code == 400  # mã một lần


@pytest.mark.asyncio
async def test_setup_endpoint_refuses_an_account_that_is_already_complete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Đường này không được trở thành đường đặt lại mật khẩu cho tài khoản đã có mật khẩu
    r = FakeRedis()
    monkeypatch.setattr(oauth_state, "get_redis_client", lambda: r)

    async def lookup_by_id(_db, _user_id):
        return SimpleNamespace(id=1)

    async def no_pending_identity(_db, _user_id):
        return None

    monkeypatch.setattr("app.api.oauth.get_user_by_id", lookup_by_id)
    monkeypatch.setattr("app.api.oauth.oauth_accounts.pending_identity", no_pending_identity)
    setup_token = oauth_state.issue_setup_token(r, 1)
    main_app.dependency_overrides[get_db] = lambda: fake_session()
    try:
        async with _http() as c:
            res = await c.post(
                "/api/auth/oauth/setup",
                json={"setup_token": setup_token, "email": "a@b.co", "password": "a-good-password"},
            )
    finally:
        main_app.dependency_overrides.pop(get_db, None)
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_paid_screens_refuse_an_account_that_is_still_waiting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Tài khoản chưa hoàn chỉnh không được đi vào màn hình nạp tiền
    from app.deps import require_setup_complete
    from app.services import oauth_accounts as accounts

    async def pending(_db, _user_id):
        return SimpleNamespace(id=1, needs_setup=True)

    monkeypatch.setattr(accounts, "pending_identity", pending)
    with pytest.raises(HTTPException) as err:
        await require_setup_complete(user=SimpleNamespace(id=1), db=fake_session())
    assert err.value.status_code == 403