"""Microsoft 登录：同一条 Authorization Code + PKCE 流水线上的 provider 差异。"""

from __future__ import annotations

from types import SimpleNamespace
from urllib.parse import parse_qs

import httpx
import pytest
from httpx import ASGITransport

from app.main import app as main_app
from app.services import oauth, oauth_accounts, oauth_state
from tests.oauth_fakes import FakeRedis, fake_session, fake_settings, mock_transport, query_of

SETTINGS = fake_settings(microsoft_client_id="mid", microsoft_client_secret="msecret")

TOKEN_OK = httpx.Response(200, json={"access_token": "at-m", "token_type": "Bearer"})
USERINFO_OK = httpx.Response(
    200,
    json={"sub": "ms-sub-1", "email": "Ada@Example.com", "name": "Ada Lovelace"},
)


def _identity(payload: dict) -> oauth.OAuthIdentity:
    return oauth.identity_from_payload(oauth.find_spec("microsoft"), payload)


def test_authorize_url_targets_microsoft_with_its_own_scope_and_redirect() -> None:
    url = oauth.build_authorize_url(
        oauth.find_spec("microsoft"),
        redirect_uri="http://localhost:8000/api/auth/microsoft/callback",
        state="s1",
        code_challenge="c1",
        settings=SETTINGS,
    )
    assert url.startswith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?")
    q = query_of(url)
    assert q["client_id"] == "mid"
    assert q["redirect_uri"] == "http://localhost:8000/api/auth/microsoft/callback"
    assert "openid" in q["scope"]
    assert q["prompt"] == "select_account"


def test_microsoft_email_claim_counts_as_verified() -> None:
    # Microsoft không gửi email_verified, nhưng chỉ phát claim `email` cho hộp thư nó đã kiểm tra
    identity = _identity({"sub": " s1 ", "email": "Ada@Example.com", "name": "Ada"})
    assert (identity.provider, identity.subject, identity.email) == (
        "microsoft",
        "s1",
        "ada@example.com",
    )
    assert identity.email_verified is True
    assert identity.nickname == "Ada"


def test_microsoft_preferred_username_is_used_but_never_counts_as_verified() -> None:
    # preferred_username là UPN do quản trị viên tenant đặt: đọc được để hiển thị,
    # nhưng KHÔNG phải bằng chứng sở hữu hộp thư -> phải rơi vào nhánh B.
    identity = _identity({"sub": "s1", "preferred_username": "someone@outlook.com", "name": "S"})
    assert identity.email == "someone@outlook.com"
    assert identity.email_verified is False


def test_microsoft_falls_back_to_the_email_claim() -> None:
    identity = _identity({"sub": "s1", "email": "a@b.co", "name": "S"})
    assert identity.email == "a@b.co"
    assert identity.email_verified is True


def test_microsoft_explicit_email_verified_false_wins_over_the_claim() -> None:
    # 显式 false 优先，不能因为 email 存在就当成已验证
    assert _identity({"sub": "s1", "email": "a@b.co", "email_verified": False}).email_verified is False


def test_microsoft_identity_without_a_subject_is_refused() -> None:
    with pytest.raises(oauth.OAuthProviderError):
        _identity({"email": "a@b.co"})


@pytest.mark.asyncio
async def test_microsoft_login_roundtrip_mints_a_session_jwt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[httpx.Request] = []
    r = FakeRedis()
    monkeypatch.setattr(oauth_state, "get_redis_client", lambda: r)

    async def fake_resolve(_db, identity, settings=None):
        return oauth_accounts.OAuthLoginResult(
            user=SimpleNamespace(id=9090, email=identity.email), outcome="create"
        )

    monkeypatch.setattr(oauth_accounts, "resolve_oauth_user", fake_resolve)

    spec = oauth.require_provider("microsoft", SETTINGS)
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    async with httpx.AsyncClient(
        transport=mock_transport({"login.microsoftonline.com": TOKEN_OK, "userinfo": USERINFO_OK}, calls)
    ) as client:
        handoff = await oauth.complete_login(
            spec,
            code="ms-code",
            state=started.state,
            session_id=started.session_id,
            db=fake_session(),
            settings=SETTINGS,
            client=client,
            store=r,
        )

    token_request, userinfo_request = calls
    form = {k: v[0] for k, v in parse_qs(token_request.content.decode()).items()}
    assert form["client_id"] == "mid"
    assert form["client_secret"] == "msecret"
    assert form["redirect_uri"] == "http://localhost:8000/api/auth/microsoft/callback"
    assert form["code_verifier"]
    assert userinfo_request.url.host == "graph.microsoft.com"
    assert userinfo_request.headers["authorization"] == "Bearer at-m"

    assert oauth_state.consume_login_grant(r, handoff.token) == 9090


@pytest.mark.asyncio
async def test_microsoft_without_a_verified_email_creates_a_pending_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 个人账号只有 preferred_username 时，真实账号层把它丢进 nhánh B（tài khoản chưa hoàn chỉnh）
    unverified = httpx.Response(
        200, json={"sub": "s1", "preferred_username": "someone@outlook.com", "name": "S"}
    )
    r = FakeRedis()
    spec = oauth.require_provider("microsoft", SETTINGS)
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)

    async def fake_resolve(_db, identity, settings=None):
        return oauth_accounts.OAuthLoginResult(
            user=SimpleNamespace(id=5150), outcome="create_pending"
        )

    monkeypatch.setattr(oauth_accounts, "resolve_oauth_user", fake_resolve)
    async with httpx.AsyncClient(transport=mock_transport({"token": TOKEN_OK, "userinfo": unverified})) as c:
        handoff = await oauth.complete_login(
            spec,
            code="c",
            state=started.state,
            session_id=started.session_id,
            db=fake_session(),
            settings=SETTINGS,
            client=c,
            store=r,
        )
    assert handoff.setup_required is True
    # token đó chỉ điền thông tin, không đổi được JWT
    assert oauth_state.consume_setup_token(r, handoff.token) == 5150
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_grant(r, handoff.token)


@pytest.mark.asyncio
async def test_microsoft_state_is_not_accepted_by_the_google_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 拿 microsoft 的 state 去敲 google 的回调 = 跨 provider 伪造
    calls: list[httpx.Request] = []
    google_settings = fake_settings(google_client_id="gid", google_client_secret="gsec")
    google = oauth.require_provider("google", google_settings)
    r = FakeRedis()
    _state, sid = oauth_state.create_login_state(r, "microsoft", "v")
    async with httpx.AsyncClient(transport=mock_transport({}, calls)) as client:
        with pytest.raises(oauth.OAuthFlowError) as err:
            await oauth.complete_login(
                google,
                code="c",
                state=oauth_state.create_login_state(r, "microsoft", "v2")[0],
                session_id=sid,
                db=fake_session(),
                settings=google_settings,
                client=client,
                store=r,
            )
    assert err.value.code == "state_invalid"
    assert calls == []


@pytest.mark.asyncio
async def test_microsoft_login_endpoint_redirects_to_microsoft(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(oauth, "get_settings", lambda: SETTINGS)
    monkeypatch.setattr(oauth_state, "get_redis_client", lambda: FakeRedis())
    async with httpx.AsyncClient(transport=ASGITransport(app=main_app), base_url="http://test") as c:
        res = await c.get("/api/auth/microsoft/login", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"].startswith(
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?"
    )


@pytest.mark.asyncio
async def test_callback_maps_a_provider_refusal_to_a_frontend_error_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 用户点了“取消”：不当作服务端故障，明确回 access_denied
    r = FakeRedis()
    monkeypatch.setattr(oauth, "get_settings", lambda: SETTINGS)
    monkeypatch.setattr(oauth_state, "get_redis_client", lambda: r)
    spec = oauth.require_provider("microsoft", SETTINGS)
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    async with httpx.AsyncClient(transport=ASGITransport(app=main_app), base_url="http://test") as c:
        res = await c.get(
            "/api/auth/microsoft/callback",
            params={"error": "access_denied", "state": started.state},
            follow_redirects=False,
        )
    assert res.status_code == 302
    assert query_of(res.headers["location"]) == {"oauth_error": "access_denied"}