"""第三方登录：可用登录方式（GET /api/auth/providers）与配置校验。"""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

from app.config import Settings
from app.main import app as main_app
from app.services import oauth
from tests.oauth_fakes import fake_settings

API = "/api/auth/providers"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=main_app), base_url="http://test")


def _with_settings(monkeypatch: pytest.MonkeyPatch, **overrides) -> None:
    monkeypatch.setattr(oauth, "get_settings", lambda: fake_settings(**overrides))


@pytest.mark.asyncio
async def test_providers_empty_when_nothing_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    # 后端没有任何 client_id/client_secret -> 空数组，前端据此不渲染按钮
    _with_settings(monkeypatch)
    async with _client() as client:
        res = await client.get(API)
    assert res.status_code == 200
    assert res.json() == {"providers": []}


@pytest.mark.asyncio
async def test_providers_lists_only_fully_configured_providers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 只填了一半 = 不可用，不能出现在列表里，否则用户点了才报 invalid_client
    _with_settings(monkeypatch, google_client_id="gid", google_client_secret="gsecret")
    async with _client() as client:
        res = await client.get(API)
    payload = res.json()
    assert [p["id"] for p in payload["providers"]] == ["google"]


@pytest.mark.asyncio
async def test_providers_payload_carries_login_and_redirect_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _with_settings(
        monkeypatch,
        google_client_id="gid",
        google_client_secret="gsecret",
        microsoft_client_id="mid",
        microsoft_client_secret="msecret",
    )
    async with _client() as client:
        res = await client.get(API)
    providers = {p["id"]: p for p in res.json()["providers"]}
    assert set(providers) == {"google", "microsoft"}
    assert providers["google"]["label"] == "Google"
    assert providers["google"]["login_url"] == "/api/auth/google/login"
    # 回调地址必须落在后端，且和控制台登记的字面完全一致
    assert providers["google"]["redirect_uri"] == "http://localhost:8000/api/auth/google/callback"
    assert providers["microsoft"]["redirect_uri"] == (
        "http://localhost:8000/api/auth/microsoft/callback"
    )
    # 绝不能把 client_secret 之类的字段漏出去
    assert "client_secret" not in res.text and "gsecret" not in res.text


def test_redirect_uri_follows_the_configured_backend_base() -> None:
    settings = fake_settings(oauth_redirect_base_url="https://api.example.com/")
    assert (
        oauth.redirect_uri_for("google", settings)
        == "https://api.example.com/api/auth/google/callback"
    )


def test_malformed_oauth_urls_fail_at_settings_construction() -> None:
    # 拼不出来的回调地址不可能登记成功，宁可启动即报错
    with pytest.raises(ValueError, match="OAUTH_REDIRECT_BASE_URL"):
        Settings(oauth_redirect_base_url="api.example.com")
    with pytest.raises(ValueError, match="OAUTH_POST_LOGIN_REDIRECT_URL"):
        Settings(oauth_post_login_redirect_url="ftp://example.com")


def test_oauth_credentials_are_stripped_not_pasted_verbatim() -> None:
    # 控制台里复制多带一个空格是最常见的静默失败
    settings = Settings(google_client_id="  gid  ", google_client_secret="\tgsecret\n")
    assert settings.google_client_id == "gid"
    assert settings.google_client_secret == "gsecret"


def test_unknown_provider_is_not_in_the_registry() -> None:
    assert oauth.find_spec("apple") is None
    assert oauth.find_spec("") is None
    with pytest.raises(oauth.OAuthConfigError):
        oauth.require_provider("apple", fake_settings(google_client_id="x", google_client_secret="y"))


def test_every_registered_provider_has_an_identity_parser() -> None:
    # 新增 provider 时若忘了写邮箱校验解析器，登录会静默跳过校验，这里挡住
    missing = [spec.name for spec in oauth.provider_specs() if spec.name not in oauth.IDENTITY_PARSERS]
    assert missing == []


def test_half_a_configuration_is_not_a_provider() -> None:
    # 只有 client_id 换不到 token，不能算“可用”
    for overrides in (
        {"google_client_id": "gid"},
        {"google_client_secret": "gsec"},
        {"google_client_id": "   "},
    ):
        assert oauth.configured_providers(fake_settings(**overrides)) == []
        with pytest.raises(oauth.OAuthConfigError):
            oauth.require_provider("google", fake_settings(**overrides))


def test_standalone_router_mounts_without_the_main_app() -> None:
    # 只想挂 oauth router 的最小应用也要能起来
    probe = FastAPI()
    from app.api.oauth import router

    probe.include_router(router, prefix="/api")
    paths = {r.path for r in probe.routes}
    assert "/api/auth/providers" in paths
