# -*- coding: utf-8 -*-
"""OAuth provider registry: the backend is the only source of truth for what is enabled.

`configured_providers()` reads the very same settings the login endpoints use, so the
frontend can render a button exactly when a client_id *and* a client_secret are present
and never when only a half-filled configuration would fail at the provider.

Only the Authorization Code flow with PKCE is implemented; the implicit flow is not
supported because it needs no client secret and would leak one.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings, get_settings


class OAuthConfigError(Exception):
    """The requested provider is unknown or has no credentials configured."""


@dataclass(frozen=True)
class OAuthProviderSpec:
    """Static per-provider endpoints. Secrets are never stored here."""

    name: str
    label: str
    authorize_url: str
    token_url: str
    userinfo_url: str
    # Fields on Settings holding this provider's client_id / client_secret
    client_id_setting: str
    client_secret_setting: str
    scopes: tuple[str, ...]
    # Extra authorize-query parameters this provider requires
    extra_authorize_params: tuple[tuple[str, str], ...] = ()


GOOGLE = OAuthProviderSpec(
    name="google",
    label="Google",
    authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
    token_url="https://oauth2.googleapis.com/token",
    userinfo_url="https://openidconnect.googleapis.com/v1/userinfo",
    client_id_setting="google_client_id",
    client_secret_setting="google_client_secret",
    scopes=("openid", "email", "profile"),
    extra_authorize_params=(("access_type", "online"),),
)

# Insertion order is the order /api/auth/providers reports.
PROVIDERS: dict[str, OAuthProviderSpec] = {GOOGLE.name: GOOGLE}


def provider_specs() -> tuple[OAuthProviderSpec, ...]:
    """Every provider this build knows about, configured or not."""
    return tuple(PROVIDERS.values())


def configured_providers(settings: Settings | None = None) -> list[OAuthProviderSpec]:
    """Providers whose client_id *and* client_secret are both set.

    Half a configuration is not a working login, so it must not reach the frontend.
    """
    cfg = settings if settings is not None else get_settings()
    return [
        spec
        for spec in provider_specs()
        if str(getattr(cfg, spec.client_id_setting, "") or "").strip()
        and str(getattr(cfg, spec.client_secret_setting, "") or "").strip()
    ]


def find_spec(name: str) -> OAuthProviderSpec | None:
    """Look up a provider by name, or None when the name is not one of ours."""
    return PROVIDERS.get(str(name or "").strip().lower())


def require_provider(name: str, settings: Settings | None = None) -> OAuthProviderSpec:
    """Return a configured provider or raise OAuthConfigError."""
    spec = find_spec(name)
    if spec is None:
        raise OAuthConfigError(f"未知的第三方登录方式: {name}")
    cfg = settings if settings is not None else get_settings()
    if not str(getattr(cfg, spec.client_id_setting, "") or "").strip() or not str(
        getattr(cfg, spec.client_secret_setting, "") or ""
    ).strip():
        raise OAuthConfigError(f"{spec.label} 登录未配置")
    return spec


def client_credentials(spec: OAuthProviderSpec, settings: Settings | None = None) -> tuple[str, str]:
    """The client_id / client_secret pair for a configured provider."""
    cfg = settings if settings is not None else get_settings()
    client_id = str(getattr(cfg, spec.client_id_setting, "") or "").strip()
    client_secret = str(getattr(cfg, spec.client_secret_setting, "") or "").strip()
    return client_id, client_secret


def redirect_uri_for(name: str, settings: Settings | None = None) -> str:
    """The exact callback URL to register in the provider console.

    Google and Microsoft compare the redirect_uri byte for byte, which is why
    http://localhost:8000 and http://127.0.0.1:8000 are two different values.
    """
    cfg = settings if settings is not None else get_settings()
    base = str(cfg.oauth_redirect_base_url or "").rstrip("/")
    return f"{base}/api/auth/{name}/callback"


def login_url_for(name: str) -> str:
    """Backend path the frontend points its button at (prefix it with the API base)."""
    return f"/api/auth/{name}/login"
