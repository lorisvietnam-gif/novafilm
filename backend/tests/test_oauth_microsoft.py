"""Microsoft 登录：同一条 Authorization Code + PKCE 流水线上的 provider 差异。"""

from __future__ import annotations

from types import SimpleNamespace
from urllib.parse import parse_qs

import httpx
import pytest
from httpx import ASGITransport

from app.main import app as main_app
from app.services import oauth, oauth_accounts, oauth_state
from app.services.auth import decode_token
from tests.oauth_fakes import FakeRedis, fake_session, fake_settings, mock_transport, query_of

SETTINGS = fake_settings(microsoft_client_id="mid", microsoft_client_secret="msecret")

TOKEN_OK = httpx.Response(200, json={"access_token": "at-m", "token_type": "Bearer"})
USERINFO_OK = httpx.Response(
    200,
    json={"sub": "ms-sub-1", "email": "Ada@Example.com", "name": "Ada Lovelace"},
)


def test_authorize_url_targets_microsoft_with_its_own_scope_and_redirect() -> None:
    url = oauth.build_authorize_url(
        oauth.MICROSOFT,
        redirect_uri="http://localhost:8000/api/auth/microsoft/callback",
        state="s1",
        code_challenge="c1",
        settings=SETTINGS,
    )
    assert url.startswith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?")
    q = query_of(url)
    assert q["client_id"] == "mid"
    assert q["response_type"] == "code"
    assert q["code_challenge_method"] == "S256"
    assert q["redirect_uri"] == "http://localhost:8000/api/auth/microsoft/callback"
    assert "User.Read" in q["scope"]
    assert q["prompt"] == "select_account"


def test_microsoft_email_claim_counts_as_verified() -> None:
    # Microsoft 不发 email_verified，但它只对已验证地址发 email claim
    identity = oauth.parse_microsoft_identity(
        {"sub": " s1 ", "email": "Ada@Example.com", "name": "Ada"}
    )
    assert (identity.provider, identity.subject, identity.email) == (
        "microsoft",
        "s1",
        "ada@example.com",
    )
    assert identity.email_verified is True
    assert identity.nickname == "Ada"


def test_microsoft_preferred_username_alone_is_not_enough() -> None:
    # 个人账号常常只有 preferred_username，没有任何验证过的邮箱 -> 拒绝登录
    identity = oauth.parse_microsoft_identity(
        {"sub": "s1", "preferred_username": "someone@outlook.com", "name": "Some One"}
    )
    assert identity.email == ""
    assert identity.email_verified is False


def test_microsoft_explicit_email_verified_false_wins_over_the_claim() -> None:
    # 显式 false 优先，不能因为 email 存在就当成已验证
    identity = oauth.parse_microsoft_identity(
        {"sub": "s1", "email": "a@b.co", "email_verified": False}
    )
    assert identity.email_verified is False


def test_microsoft_identity_without_a_subject_is_refused() -> None:
    with pytest.raises(oauth.OAuthProviderError):
        oauth.parse_microsoft_identity({"email": "a@b.co"})


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
        grant = await oauth.complete_login(
            spec,
            code="ms-code",
            state=started.state,
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
    assert userinfo_request.url.host == "graph.microsoft.com"
    assert userinfo_request.headers["authorization"] == "Bearer at-m"

    assert oauth_state.consume_login_grant(r, grant) == 9090


@pytest.mark.asyncio
async def test_microsoft_without_a_verified_email_never_reaches_the_accounts_table() -> None:
    # 个人账号只有 preferred_username 时，真实账号层必须直接拒绝
    unverified = httpx.Response(
        200, json={"sub": "s1", "preferred_username": "someone@outlook.com", "name": "S"}
    )
    r = FakeRedis()
    spec = oauth.require_provider("microsoft", SETTINGS)
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    async with httpx.AsyncClient(
        transport=mock_transport({"token": TOKEN_OK, "userinfo": unverified})
    ) as client:
        with pytest.raises(oauth_accounts.OAuthIdentityError) as err:
            await oauth.complete_login(
                spec,
                code="c",
                state=started.state,
                db=fake_session(),
                settings=SETTINGS,
                client=client,
                store=r,
            )
    assert err.value.code == "email_unverified"


@pytest.mark.asyncio
async def test_microsoft_state_is_not_accepted_by_the_google_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 拿 microsoft 的 state 去敲 google 的回调 = 跨 provider 伪造
    calls: list[httpx.Request] = []
    google = oauth.require_provider(
        "google", fake_settings(google_client_id="gid", google_client_secret="gsec")
    )
    r = FakeRedis()
    oauth_state.create_login_state(r, "microsoft", "v")
    async with httpx.AsyncClient(transport=mock_transport({}, calls)) as client:
        with pytest.raises(oauth.OAuthFlowError) as err:
            await oauth.complete_login(
                google,
                code="c",
                state=oauth_state.create_login_state(r, "microsoft", "v2"),
                db=fake_session(),
                settings=fake_settings(google_client_id="gid", google_client_secret="gsec"),
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
