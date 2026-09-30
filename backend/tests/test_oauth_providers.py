"""Registry OAuth: /api/auth/providers chỉ trả provider đã cấu hình, và các luật URL callback."""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

from app.config import Settings
from app.main import app as main_app
from app.services import oauth
from app.services.oauth_providers import (
    PROVIDERS,
    RedirectUriError,
    provider_specs,
    read_path,
    read_text,
    validate_redirect_uri,
)
from tests.oauth_fakes import fake_settings

API = "/api/auth/providers"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=main_app), base_url="http://test")


def _with_settings(monkeypatch: pytest.MonkeyPatch, **overrides) -> None:
    monkeypatch.setattr(oauth, "get_settings", lambda: fake_settings(**overrides))


# --------------------------------------------------------------------- registry


def test_every_provider_is_a_pure_data_entry() -> None:
    # Provider là một dòng dữ liệu, không phải một nhánh if: registry là nguồn duy nhất.
    assert [spec.id for spec in provider_specs()] == ["google", "microsoft", "facebook", "tiktok"]
    assert all(spec.redirect_uri_template.endswith("/api/auth/{provider}/callback")
               for spec in provider_specs())


def test_apple_is_reserved_but_never_offered() -> None:
    # Sign in with Apple cần 99 USD/năm và phải xác minh id_token bằng JWKS: chừa chỗ,
    # không cho chạy, không hiện ra danh sách.
    apple = PROVIDERS["apple"]
    assert apple.implemented is False
    assert apple not in provider_specs()
    with pytest.raises(oauth.OAuthConfigError):
        oauth.require_provider("apple", fake_settings(apple_client_id="x", apple_client_secret="y"))


@pytest.mark.parametrize(
    ("provider", "settings_kwargs"),
    [
        ("google", {"google_client_id": "gid", "google_client_secret": "gsec"}),
        ("microsoft", {"microsoft_client_id": "mid", "microsoft_client_secret": "msec"}),
        ("facebook", {"facebook_client_id": "fid", "facebook_client_secret": "fsec"}),
        ("tiktok", {"tiktok_client_key": "tkey", "tiktok_client_secret": "tsec"}),
    ],
)
def test_each_provider_reads_its_own_credentials(
    provider: str, settings_kwargs: dict
) -> None:
    settings = fake_settings(**settings_kwargs)
    spec = oauth.require_provider(provider, settings)
    assert oauth.client_credentials(spec, settings) == tuple(settings_kwargs.values())


def test_tiktok_uses_client_key_not_client_id() -> None:
    # Login Kit gọi tham số là client_key; gửi client_id sẽ luôn ra invalid_client.
    spec = oauth.require_provider(
        "tiktok", fake_settings(tiktok_client_key="tkey", tiktok_client_secret="tsec")
    )
    assert spec.token_param_client_id == "client_key"
    assert spec.client_id_env == "tiktok_client_key"


def test_dotted_paths_read_nested_provider_json() -> None:
    payload = {"data": {"user": {"open_id": " open-1 ", "display_name": "Ada"}}}
    assert read_path(payload, "data.user.open_id") == " open-1 "
    assert read_text(payload, "data.user.display_name") == "Ada"
    assert read_text(payload, "data.user.missing") == ""
    assert read_text(payload, "picture.data.url") == ""
    assert read_path(payload, "") is None


def test_registry_declares_email_support_and_pkce_per_provider() -> None:
    table = {spec.id: (spec.supports_email, spec.pkce_required) for spec in provider_specs()}
    assert table == {
        "google": (True, True),
        "microsoft": (True, True),
        "facebook": (True, False),
        "tiktok": (False, True),
    }


# ------------------------------------------------------------- URL callback rules


def test_redirect_uri_follows_the_configured_backend_base() -> None:
    settings = fake_settings(oauth_redirect_base_url="https://api.example.com/")
    spec = oauth.find_spec("google")
    assert (
        oauth.redirect_uri_for(spec, settings)
        == "https://api.example.com/api/auth/google/callback"
    )


def test_tiktok_callback_must_be_https() -> None:
    spec = oauth.find_spec("tiktok")
    with pytest.raises(RedirectUriError, match="https"):
        validate_redirect_uri(spec, "http://api.example.com/api/auth/tiktok/callback")


def test_tiktok_callback_must_be_static() -> None:
    spec = oauth.find_spec("tiktok")
    with pytest.raises(RedirectUriError, match="query"):
        validate_redirect_uri(spec, "https://api.example.com/api/auth/tiktok/callback?x=1")


def test_tiktok_callback_has_a_length_ceiling() -> None:
    spec = oauth.find_spec("tiktok")
    long_uri = "https://api.example.com/" + "a" * 512
    with pytest.raises(RedirectUriError, match="512"):
        validate_redirect_uri(spec, long_uri)


@pytest.mark.parametrize("provider", ["google", "microsoft", "facebook", "tiktok"])
def test_every_provider_rejects_a_fragment_in_its_callback(provider: str) -> None:
    # Fragment không bao giờ tới được máy chủ, nên đăng ký nó chỉ là tự lừa mình
    spec = oauth.find_spec(provider)
    with pytest.raises(RedirectUriError, match="fragment"):
        validate_redirect_uri(spec, "https://api.example.com/api/auth/x/callback#a")


def test_startup_rejects_a_tiktok_callback_violating_the_provider_rule() -> None:
    # HTTP ở local chạy được với mọi provider, riêng TikTok thì không -> báo ngay lúc
    # khởi động thay vì để người dùng đi hết vòng authorize rồi mới nhận lỗi.
    settings = fake_settings(
        tiktok_client_key="tkey",
        tiktok_client_secret="tsec",
        oauth_redirect_base_url="http://api.example.com",
    )
    with pytest.raises(RedirectUriError, match="https"):
        oauth.validate_configuration(settings)


def test_startup_accepts_a_https_tiktok_callback() -> None:
    settings = fake_settings(
        tiktok_client_key="tkey",
        tiktok_client_secret="tsec",
        oauth_redirect_base_url="https://api.example.com",
    )
    oauth.validate_configuration(settings)


# ------------------------------------------------------ open redirect after login


@pytest.mark.parametrize("candidate", ["https://evil.example/steal", "//evil.example"])
def test_absolute_url_to_another_domain_is_refused(candidate: str) -> None:
    # open redirect: link đăng nhập đưa nạn nhân sang miền khác kèm phiên vừa tạo
    with pytest.raises(oauth.OAuthFlowError) as err:
        oauth.safe_next_target(candidate, fake_settings())
    assert err.value.code == "redirect_invalid"


def test_relative_path_is_always_allowed() -> None:
    assert oauth.safe_next_target("/studio/new", fake_settings()) == "/studio/new"
    assert oauth.safe_next_target("", fake_settings()) == ""


def test_absolute_url_on_a_configured_origin_is_allowed() -> None:
    settings = fake_settings(cors_origins="https://novastudio.rr.kg")
    assert (
        oauth.safe_next_target("https://novastudio.rr.kg/auth", settings)
        == "https://novastudio.rr.kg/auth"
    )


def test_allowed_origins_come_from_the_login_redirect_and_cors() -> None:
    settings = fake_settings(
        oauth_post_login_redirect_url="https://novastudio.rr.kg/auth",
        cors_origins="https://admin.novastudio.rr.kg,https://novastudio.rr.kg",
    )
    assert oauth.allowed_redirect_origins(settings) == frozenset(
        {"https://novastudio.rr.kg", "https://admin.novastudio.rr.kg"}
    )


# ------------------------------------------------------------------- HTTP routes


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
    _with_settings(
        monkeypatch,
        google_client_id="gid",
        google_client_secret="gsecret",
        tiktok_client_key="tkey",
    )
    async with _client() as client:
        res = await client.get(API)
    assert [p["id"] for p in res.json()["providers"]] == ["google"]


@pytest.mark.asyncio
async def test_providers_payload_is_id_and_label_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _with_settings(
        monkeypatch,
        google_client_id="gid",
        google_client_secret="gsecret",
        microsoft_client_id="mid",
        microsoft_client_secret="msecret",
        facebook_client_id="fid",
        facebook_client_secret="fsecret",
        tiktok_client_key="tkey",
        tiktok_client_secret="tsecret",
    )
    async with _client() as client:
        res = await client.get(API)
    providers = res.json()["providers"]
    assert [p["id"] for p in providers] == ["google", "microsoft", "facebook", "tiktok"]
    assert all(set(p) == {"id", "label"} for p in providers)
    # 绝不能把 client_secret 或 callback URL 之类的字段漏出去
    assert "gsecret" not in res.text and "client_secret" not in res.text
    assert "redirect_uri" not in res.text


def test_malformed_oauth_urls_fail_at_settings_construction() -> None:
    # 拼不出来的回调地址不可能登记成功，宁可启动即报错
    with pytest.raises(ValueError, match="OAUTH_REDIRECT_BASE_URL"):
        Settings(oauth_redirect_base_url="api.example.com")
    with pytest.raises(ValueError, match="OAUTH_POST_LOGIN_REDIRECT_URL"):
        Settings(oauth_post_login_redirect_url="ftp://example.com")


def test_oauth_credentials_are_stripped_not_pasted_verbatim() -> None:
    # 控制台里复制多带一个空格是最常见的静默失败
    settings = Settings(
        google_client_id="  gid  ",
        google_client_secret="\tgsecret\n",
        tiktok_client_key=" tkkey ",
        tiktok_client_secret=" tksecret ",
    )
    assert settings.google_client_id == "gid"
    assert settings.google_client_secret == "gsecret"
    assert settings.tiktok_client_key == "tkkey"
    assert settings.tiktok_client_secret == "tksecret"


def test_unknown_provider_is_not_in_the_registry() -> None:
    assert oauth.find_spec("wechat") is None
    assert oauth.find_spec("") is None


def test_half_a_configuration_is_not_a_provider() -> None:
    # 只有 client_id 换不到 token，不能算“可用”
    for overrides in (
        {"google_client_id": "gid"},
        {"google_client_secret": "gsec"},
        {"google_client_id": "   "},
        {"tiktok_client_key": "tkey"},
    ):
        assert oauth.configured_providers(fake_settings(**overrides)) == []


def test_standalone_router_mounts_without_the_main_app() -> None:
    # 只想挂 oauth router 的最小应用也要能起来
    probe = FastAPI()
    from app.api.oauth import router

    probe.include_router(router, prefix="/api")
    paths = {r.path for r in probe.routes}
    assert "/api/auth/providers" in paths