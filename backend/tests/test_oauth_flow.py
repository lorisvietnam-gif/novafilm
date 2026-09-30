"""Google 登录全流程：state + PKCE -> 换 token -> 认人 -> 一次性 code 换会话 JWT。

全程离线：httpx.MockTransport 顶掉 token/userinfo 两个外呼，FakeRedis 顶掉 Redis，
resolve_oauth_user 顶掉数据库。
"""

from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import parse_qs

import httpx
import pytest
from httpx import ASGITransport

from app.database import get_db
from app.main import app as main_app
from app.services import oauth, oauth_accounts, oauth_state
from app.services.auth import decode_token
from tests.oauth_fakes import FakeRedis, fake_session, fake_settings, mock_transport, query_of

SETTINGS = fake_settings(google_client_id="gid", google_client_secret="gsecret")

TOKEN_OK = httpx.Response(200, json={"access_token": "at-1", "token_type": "Bearer"})
USERINFO_OK = httpx.Response(
    200,
    json={
        "sub": "google-sub-1",
        "email": "Ada@Example.com",
        "email_verified": True,
        "name": "Ada Lovelace",
        "picture": "https://lh3.example/a.png",
    },
)


def _client(responses: dict[str, httpx.Response], calls: list[httpx.Request] | None = None):
    return httpx.AsyncClient(transport=mock_transport(responses, calls))


def _fake_db() -> MagicMock:
    """AsyncSession 替身：所有查询都查不到东西。"""
    return fake_session(None)


def _stub_resolve(monkeypatch: pytest.MonkeyPatch, user_id: int = 4242) -> None:
    async def fake_resolve(_db, identity, settings=None):
        return oauth_accounts.OAuthLoginResult(
            user=SimpleNamespace(id=user_id, email=identity.email), outcome="create"
        )

    monkeypatch.setattr(oauth_accounts, "resolve_oauth_user", fake_resolve)


# --------------------------------------------------------------------------- PKCE


def test_code_challenge_matches_the_rfc7636_vector() -> None:
    # RFC 7636 appendix B
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    assert oauth.code_challenge_s256(verifier) == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_created_pkce_pair_is_fresh_and_within_spec_limits() -> None:
    first_verifier, first_challenge = oauth.create_pkce_pair()
    second_verifier, _ = oauth.create_pkce_pair()
    assert 43 <= len(first_verifier) <= 128
    assert first_challenge == oauth.code_challenge_s256(first_verifier)
    assert "=" not in first_challenge
    assert first_verifier != second_verifier


def test_pkce_is_sent_even_for_a_provider_that_does_not_require_it() -> None:
    # Facebook không bắt buộc PKCE, nhưng ta gửi cho tất cả: thêm vào không tốn gì.
    for provider in ("google", "microsoft", "facebook", "tiktok"):
        spec = oauth.find_spec(provider)
        url = oauth.build_authorize_url(
            spec, redirect_uri="https://api.example.com/cb", state="s", code_challenge="c"
        )
        assert query_of(url)["code_challenge"] == "c"
        assert query_of(url)["code_challenge_method"] == "S256"
        assert query_of(url)["response_type"] == "code"  # 绝不用 implicit


# ------------------------------------------------------------------ authorize URL


def test_authorize_url_carries_every_required_parameter() -> None:
    url = oauth.build_authorize_url(
        oauth.find_spec("google"),
        redirect_uri="http://localhost:8000/api/auth/google/callback",
        state="state-123",
        code_challenge="challenge-abc",
        settings=SETTINGS,
    )
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    q = query_of(url)
    assert q["client_id"] == "gid"
    assert q["scope"] == "openid email profile"
    assert q["state"] == "state-123"
    assert q["redirect_uri"] == "http://localhost:8000/api/auth/google/callback"
    assert q["access_type"] == "online"


def test_start_authorization_stores_the_state_and_points_at_the_provider() -> None:
    r = FakeRedis()
    spec = oauth.require_provider("google", SETTINGS)
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)

    q = query_of(started.url)
    assert q["state"] == started.state
    # verifier 留在服务端，绝不出现在跳转 URL 里
    assert "code_verifier" not in started.url
    restored = oauth_state.consume_login_state(r, "google", started.state, started.session_id)
    assert q["code_challenge"] == oauth.code_challenge_s256(restored.code_verifier)


# ---------------------------------------------------------------- whole flow


@pytest.mark.asyncio
async def test_google_login_roundtrip_mints_a_session_jwt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[httpx.Request] = []
    consumed: list[str] = []

    class RecordingRedis(FakeRedis):
        def getdel(self, key: str):
            import json as _json

            value = super().getdel(key)
            if value and key.startswith("oauth:state:"):
                consumed.append(_json.loads(value)["v"])
            return value

    r = RecordingRedis()
    _stub_resolve(monkeypatch, user_id=4242)
    spec = oauth.require_provider("google", SETTINGS)
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)

    async with _client({"oauth2.googleapis.com/token": TOKEN_OK, "userinfo": USERINFO_OK}, calls) as c:
        handoff = await oauth.complete_login(
            spec,
            code="auth-code-1",
            state=started.state,
            session_id=started.session_id,
            db=_fake_db(),
            settings=SETTINGS,
            client=c,
            store=r,
        )

    token_request, userinfo_request = calls
    form = {
        k: v[0]
        for k, v in parse_qs(token_request.content.decode()).items()
    }
    assert form["grant_type"] == "authorization_code"
    assert form["code"] == "auth-code-1"
    assert form["client_id"] == "gid"
    assert form["client_secret"] == "gsecret"  # 只出现在后端这一次请求里
    assert form["redirect_uri"] == "http://localhost:8000/api/auth/google/callback"
    # verifier 必须和发起时存进 Redis 的那一个一致，否则换 token 会被 provider 拒绝
    assert len(consumed) == 1
    assert form["code_verifier"] == consumed[0]
    assert userinfo_request.headers["authorization"] == "Bearer at-1"

    # 一次性 code -> JWT -> 解出同一个 user
    assert handoff.setup_required is False
    assert oauth_state.consume_login_grant(r, handoff.token) == 4242
    from app.services.auth import create_access_token

    assert decode_token(create_access_token("4242")) == "4242"


@pytest.mark.asyncio
async def test_callback_without_state_is_refused_before_any_upstream_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # CSRF：没有 state 就不许开始换 token，一个外呼都不能发
    calls: list[httpx.Request] = []
    _stub_resolve(monkeypatch)
    spec = oauth.require_provider("google", SETTINGS)
    async with _client({}, calls) as c:
        with pytest.raises(oauth.OAuthFlowError) as err:
            await oauth.complete_login(
                spec, code="code", state="", db=_fake_db(), settings=SETTINGS, client=c, store=FakeRedis()
            )
    assert err.value.code == "state_invalid"
    assert calls == []


@pytest.mark.asyncio
async def test_callback_with_a_forged_state_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[httpx.Request] = []
    _stub_resolve(monkeypatch)
    spec = oauth.require_provider("google", SETTINGS)
    r = FakeRedis()
    _state, sid = oauth_state.create_login_state(r, "google", "real-verifier")
    async with _client({}, calls) as c:
        with pytest.raises(oauth.OAuthFlowError) as err:
            await oauth.complete_login(
                spec,
                code="code",
                state="forged",
                session_id=sid,
                db=_fake_db(),
                settings=SETTINGS,
                client=c,
                store=r,
            )
    assert err.value.code == "state_invalid"
    assert calls == []


@pytest.mark.asyncio
async def test_callback_state_is_single_use(monkeypatch: pytest.MonkeyPatch) -> None:
    # 同一个 state 第二次回调（重放）必须失败，且不再发任何外呼
    calls: list[httpx.Request] = []
    _stub_resolve(monkeypatch)
    spec = oauth.require_provider("google", SETTINGS)
    r = FakeRedis()
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    async with _client({"token": TOKEN_OK, "userinfo": USERINFO_OK}, calls) as c:
        await oauth.complete_login(
            spec,
            code="code",
            state=started.state,
            session_id=started.session_id,
            db=_fake_db(),
            settings=SETTINGS,
            client=c,
            store=r,
        )
        sent = len(calls)
        with pytest.raises(oauth.OAuthFlowError) as err:
            await oauth.complete_login(
                spec,
                code="code",
                state=started.state,
                session_id=started.session_id,
                db=_fake_db(),
                settings=SETTINGS,
                client=c,
                store=r,
            )
    assert err.value.code == "state_invalid"
    assert len(calls) == sent


@pytest.mark.asyncio
async def test_callback_state_must_come_from_the_same_browser_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # state đúng nhưng cookie phiên của tab khác = CSRF, không một token nào được đổi
    calls: list[httpx.Request] = []
    _stub_resolve(monkeypatch)
    spec = oauth.require_provider("google", SETTINGS)
    r = FakeRedis()
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    async with _client({"token": TOKEN_OK, "userinfo": USERINFO_OK}, calls) as c:
        with pytest.raises(oauth.OAuthFlowError) as err:
            await oauth.complete_login(
                spec,
                code="code",
                state=started.state,
                session_id="cookie-cua-tab-khac",
                db=_fake_db(),
                settings=SETTINGS,
                client=c,
                store=r,
            )
    assert err.value.code == "state_invalid"
    assert calls == []


@pytest.mark.asyncio
async def test_callback_with_an_expired_state_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    # TTL hết = state không còn trong Redis: y hệt state bị đoán
    calls: list[httpx.Request] = []
    _stub_resolve(monkeypatch)
    spec = oauth.require_provider("google", SETTINGS)
    r = FakeRedis()
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    r.expire_all()
    async with _client({"token": TOKEN_OK, "userinfo": USERINFO_OK}, calls) as c:
        with pytest.raises(oauth.OAuthFlowError) as err:
            await oauth.complete_login(
                spec,
                code="code",
                state=started.state,
                session_id=started.session_id,
                db=_fake_db(),
                settings=SETTINGS,
                client=c,
                store=r,
            )
    assert err.value.code == "state_invalid"
    assert calls == []


@pytest.mark.asyncio
async def test_callback_without_a_code_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_resolve(monkeypatch)
    spec = oauth.require_provider("google", SETTINGS)
    with pytest.raises(oauth.OAuthFlowError) as err:
        await oauth.complete_login(
            spec, code="  ", state="s", db=_fake_db(), settings=SETTINGS, store=FakeRedis()
        )
    assert err.value.code == "missing_code"


@pytest.mark.asyncio
async def test_user_cancelling_reports_access_denied(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_resolve(monkeypatch)
    spec = oauth.require_provider("google", SETTINGS)
    with pytest.raises(oauth.OAuthFlowError) as err:
        await oauth.complete_login(
            spec,
            code="",
            state="s",
            provider_error="access_denied",
            db=_fake_db(),
            settings=SETTINGS,
            store=FakeRedis(),
        )
    assert err.value.code == "access_denied"


@pytest.mark.asyncio
async def test_provider_errors_are_logged_without_the_token_or_the_secret(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Provider trả về lỗi lặp lại bí mật: không được ghi ra log, cũng không trả cho trình duyệt
    _stub_resolve(monkeypatch)
    spec = oauth.require_provider("google", SETTINGS)
    r = FakeRedis()
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    refused = httpx.Response(
        400,
        json={"error": "invalid_grant", "error_description": "bad code for gsecret at-1"},
    )
    async with _client({"token": refused}) as c:
        with pytest.raises(oauth.OAuthProviderError) as err:
            await oauth.complete_login(
                spec,
                code="code",
                state=started.state,
                session_id=started.session_id,
                db=_fake_db(),
                settings=SETTINGS,
                client=c,
                store=r,
            )
    assert "gsecret" not in str(err.value)
    assert "at-1" not in str(err.value)
    assert "gsecret" not in caplog.text and "at-1" not in caplog.text


@pytest.mark.asyncio
async def test_a_successful_login_never_logs_the_code_state_or_token(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Đường đi happy path cũng phải sạch: state, code và access token là ba thứ không
    # được xuất hiện trong log, dù ở đâu cũng được.
    _stub_resolve(monkeypatch, user_id=4242)
    spec = oauth.require_provider("google", SETTINGS)
    r = FakeRedis()
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    with caplog.at_level(logging.INFO):
        async with _client({"token": TOKEN_OK, "userinfo": USERINFO_OK}) as c:
            handoff = await oauth.complete_login(
                spec,
                code="super-secret-code",
                state=started.state,
                session_id=started.session_id,
                db=_fake_db(),
                settings=SETTINGS,
                client=c,
                store=r,
            )
    assert started.state not in caplog.text
    assert "super-secret-code" not in caplog.text
    assert "at-1" not in caplog.text
    assert handoff.token not in caplog.text
    assert "oauth login ok provider=google user_id=4242 outcome=create" in caplog.text


# --------------------------------------------------------------- identity parsing


def test_google_identity_normalises_the_email_and_name() -> None:
    identity = oauth.identity_from_payload(
        oauth.find_spec("google"),
        {"sub": " s1 ", "email": "Ada@Example.com", "email_verified": True, "name": "Ada"},
    )
    assert (identity.provider, identity.subject, identity.email) == ("google", "s1", "ada@example.com")
    assert identity.email_verified is True
    assert identity.nickname == "Ada"


@pytest.mark.parametrize("flag", [False, None, "false", "", 0])
def test_google_identity_only_trusts_a_real_true(flag) -> None:
    # 缺失/奇怪的值一律当作未验证
    identity = oauth.identity_from_payload(
        oauth.find_spec("google"), {"sub": "s1", "email": "a@b.co", "email_verified": flag}
    )
    assert identity.email_verified is False


def test_google_identity_accepts_a_string_true() -> None:
    identity = oauth.identity_from_payload(
        oauth.find_spec("google"), {"sub": "s1", "email": "a@b.co", "email_verified": "true"}
    )
    assert identity.email_verified is True


def test_google_identity_reads_the_avatar_and_falls_back_to_the_mailbox_name() -> None:
    identity = oauth.identity_from_payload(
        oauth.find_spec("google"),
        {"sub": "s1", "email": "ada@example.com", "email_verified": True, "picture": "https://a/x.png"},
    )
    assert identity.nickname == "ada"
    assert identity.avatar_url == "https://a/x.png"


def test_google_identity_without_a_subject_is_refused() -> None:
    with pytest.raises(oauth.OAuthProviderError):
        oauth.identity_from_payload(
            oauth.find_spec("google"), {"email": "a@b.co", "email_verified": True}
        )


def test_google_identity_with_an_unusable_email_is_refused() -> None:
    with pytest.raises(oauth.OAuthProviderError):
        oauth.identity_from_payload(
            oauth.find_spec("google"), {"sub": "s1", "email": "not-an-email", "email_verified": True}
        )


# ------------------------------------------------------------------ HTTP routes


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=main_app), base_url="http://test")


def _with_oauth_state(monkeypatch: pytest.MonkeyPatch, r: FakeRedis) -> None:
    monkeypatch.setattr(oauth, "get_settings", lambda: SETTINGS)
    monkeypatch.setattr(oauth_state, "get_redis_client", lambda: r)


@pytest.mark.asyncio
async def test_login_endpoint_redirects_to_the_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _with_oauth_state(monkeypatch, FakeRedis())
    async with _http_client() as client:
        res = await client.get("/api/auth/google/login", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"].startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert query_of(res.headers["location"])["code_challenge_method"] == "S256"
    # Cookie phiên phải được gắn ngay ở lần bắt đầu đăng nhập
    assert "oauth_sid" in res.cookies


@pytest.mark.asyncio
async def test_login_endpoint_refuses_an_absolute_url_to_another_domain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # open redirect: không phát state, không 302 sang provider
    _with_oauth_state(monkeypatch, FakeRedis())
    async with _http_client() as client:
        res = await client.get(
            "/api/auth/google/login",
            params={"next": "https://evil.example/steal"},
            follow_redirects=False,
        )
    assert res.status_code == 400
    assert "evil.example" not in res.text


@pytest.mark.asyncio
async def test_login_endpoint_404s_for_an_unconfigured_or_unknown_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(oauth, "get_settings", lambda: fake_settings())
    monkeypatch.setattr(oauth_state, "get_redis_client", lambda: FakeRedis())
    async with _http_client() as client:
        google = await client.get("/api/auth/google/login")
        apple = await client.get("/api/auth/apple/login")
    assert google.status_code == 404
    assert apple.status_code == 404


@pytest.mark.asyncio
async def test_exchange_endpoint_returns_a_jwt_for_a_valid_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    r = FakeRedis()
    monkeypatch.setattr(oauth_state, "get_redis_client", lambda: r)
    grant = oauth_state.issue_login_grant(r, 31337)
    async with _http_client() as client:
        res = await client.post("/api/auth/oauth/exchange", json={"code": grant})
        replay = await client.post("/api/auth/oauth/exchange", json={"code": grant})
    assert res.status_code == 200
    assert decode_token(res.json()["access_token"]) == "31337"
    assert replay.status_code == 400  # 一次性


@pytest.mark.asyncio
async def test_exchange_endpoint_rejects_a_missing_code() -> None:
    async with _http_client() as client:
        res = await client.post("/api/auth/oauth/exchange", json={"code": ""})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_auth_endpoints_are_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    r = FakeRedis()
    _with_oauth_state(monkeypatch, r)
    monkeypatch.setattr(
        "app.api.oauth.get_settings",
        lambda: fake_settings(
            google_client_id="gid", google_client_secret="gsecret", oauth_rate_limit_per_minute=3
        ),
    )
    async with _http_client() as client:
        codes = [
            (await client.get("/api/auth/google/login", follow_redirects=False)).status_code
            for _ in range(5)
        ]
    assert codes[:3] == [302, 302, 302]
    assert codes[3:] == [429, 429]


@pytest.mark.asyncio
async def test_callback_redirects_the_browser_to_the_frontend_with_the_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    r = FakeRedis()
    _stub_resolve(monkeypatch, user_id=555)
    _with_oauth_state(monkeypatch, r)
    spec = oauth.require_provider("google", SETTINGS)
    started = oauth.start_authorization(spec, settings=SETTINGS, store=r)
    main_app.dependency_overrides[get_db] = lambda: _fake_db()

    async def fake_complete(*_args, **_kwargs):
        return oauth.LoginHandoff(setup_required=False, token=oauth_state.issue_login_grant(r, 555))

    monkeypatch.setattr(oauth, "complete_login", fake_complete)
    try:
        async with _http_client() as client:
            await client.get("/api/auth/google/login", follow_redirects=False)
            res = await client.get(
                "/api/auth/google/callback",
                params={"code": "auth-code", "state": started.state},
                follow_redirects=False,
            )
    finally:
        main_app.dependency_overrides.pop(get_db, None)

    assert res.status_code == 302
    location = res.headers["location"]
    assert location.startswith("http://localhost:5173/auth?")
    assert "oauth_code=" in location
    assert "access_token" not in location


@pytest.mark.asyncio
async def test_callback_redirects_with_an_error_code_when_state_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _with_oauth_state(monkeypatch, FakeRedis())
    main_app.dependency_overrides[get_db] = lambda: _fake_db()
    try:
        async with _http_client() as client:
            res = await client.get(
                "/api/auth/google/callback",
                params={"code": "auth-code", "state": "forged"},
                follow_redirects=False,
            )
    finally:
        main_app.dependency_overrides.pop(get_db, None)

    assert res.status_code == 302
    assert query_of(res.headers["location"]) == {"oauth_error": "state_invalid"}