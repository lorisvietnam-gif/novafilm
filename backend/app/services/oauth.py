# -*- coding: utf-8 -*-
"""OAuth login: Authorization Code + PKCE against Google and Microsoft.

`configured_providers()` reads the very same settings the login endpoints use, so the
frontend can render a button exactly when a client_id *and* a client_secret are present
and never when only a half-filled configuration would fail at the provider.

Only the Authorization Code flow with PKCE is implemented; the implicit flow is not
supported because it needs no client secret and would leak one. The client secret never
leaves the backend: the provider redirects the browser to the backend callback, the
backend swaps the code for a token, and hands the browser a one-time code instead of a
JWT so no token ends up in a URL.

Every outbound call goes through an injectable httpx client, so the whole flow is
testable with `httpx.MockTransport` and no network.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.services import oauth_accounts, oauth_state
from app.services.oauth_accounts import OAuthIdentity

logger = logging.getLogger(__name__)

_EMAIL = TypeAdapter(EmailStr)

# The provider must answer fast: we are holding the browser on a 302.
_HTTP_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
_MAX_NICKNAME = 64


class OAuthConfigError(Exception):
    """The requested provider is unknown or has no credentials configured."""


class OAuthProviderError(Exception):
    """The provider refused a request, or answered something unusable."""


class OAuthFlowError(Exception):
    """A login attempt failed in a way the frontend can be told about.

    `code` is a stable machine-readable token (never an upstream error string) so the
    browser redirect can carry it and the frontend can localise it.
    """

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code



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


# --------------------------------------------------------------------------- PKCE


def code_challenge_s256(code_verifier: str) -> str:
    """RFC 7636 S256 challenge: base64url(sha256(verifier)), no padding."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def create_pkce_pair() -> tuple[str, str]:
    """A fresh (code_verifier, code_challenge); the verifier never leaves the backend."""
    # token_urlsafe(64) -> 86 chars, inside the RFC 7636 43..128 range.
    verifier = secrets.token_urlsafe(64)
    return verifier, code_challenge_s256(verifier)


# ------------------------------------------------------------------- authorize URL


@dataclass(frozen=True)
class AuthorizeRequest:
    """A ready-to-open provider URL plus the state that must come back with it."""

    url: str
    state: str


def build_authorize_url(
    spec: OAuthProviderSpec,
    *,
    redirect_uri: str,
    state: str,
    code_challenge: str,
    settings: Settings | None = None,
) -> str:
    """Assemble the provider authorize URL, PKCE included."""
    client_id, _ = client_credentials(spec, settings)
    params: list[tuple[str, str]] = [
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("scope", " ".join(spec.scopes)),
        ("state", state),
        ("code_challenge", code_challenge),
        ("code_challenge_method", "S256"),
        *spec.extra_authorize_params,
    ]
    return f"{spec.authorize_url}?{urlencode(params)}"


def start_authorization(
    spec: OAuthProviderSpec,
    *,
    settings: Settings | None = None,
    store: Any | None = None,
) -> AuthorizeRequest:
    """Issue a CSRF state bound to a fresh PKCE verifier, then build the authorize URL.

    The verifier is kept server-side next to the state: the callback can only complete
    the exchange it started.
    """
    cfg = settings if settings is not None else get_settings()
    redis_client = store if store is not None else oauth_state.get_redis_client()
    verifier, challenge = create_pkce_pair()
    state = oauth_state.create_login_state(redis_client, spec.name, verifier)
    url = build_authorize_url(
        spec,
        redirect_uri=redirect_uri_for(spec.name, cfg),
        state=state,
        code_challenge=challenge,
        settings=cfg,
    )
    return AuthorizeRequest(url=url, state=state)


# ------------------------------------------------------------------ token exchange


@asynccontextmanager
async def _client_scope(client: httpx.AsyncClient | None) -> AsyncIterator[httpx.AsyncClient]:
    """Use the caller's client (tests inject a MockTransport) or open a short-lived one."""
    if client is not None:
        yield client
        return
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=False) as owned:
        yield owned


async def _raise_for_provider_error(response: httpx.Response, *, step: str) -> None:
    """Turn an upstream error body into a logged OAuthProviderError.

    The upstream description is logged, never returned: it can echo the client secret
    back and has no business reaching the browser.
    """
    if response.status_code < 400:
        return
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    upstream_error = str(payload.get("error") or "")[:64]
    upstream_desc = str(payload.get("error_description") or "")[:300]
    logger.warning(
        "oauth %s failed provider=%s status=%s error=%s detail=%s",
        step,
        response.request.url.host,
        response.status_code,
        upstream_error,
        upstream_desc,
    )
    raise OAuthProviderError(f"{step} failed ({upstream_error or response.status_code})")


async def exchange_code_for_token(
    spec: OAuthProviderSpec,
    *,
    code: str,
    code_verifier: str,
    redirect_uri: str,
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> str:
    """Swap the authorization code for an access token (backend-only secret use)."""
    client_id, client_secret = client_credentials(spec, settings)
    form = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
        "code_verifier": code_verifier,
    }
    async with _client_scope(client) as http:
        response = await http.post(
            spec.token_url,
            data=form,
            headers={"Accept": "application/json"},
        )
        await _raise_for_provider_error(response, step="token exchange")
        try:
            payload = response.json()
        except ValueError as exc:
            raise OAuthProviderError("token endpoint returned non-JSON") from exc

    access_token = str((payload or {}).get("access_token") or "").strip()
    if not access_token:
        raise OAuthProviderError("token endpoint returned no access_token")
    return access_token


async def fetch_userinfo(
    spec: OAuthProviderSpec,
    *,
    access_token: str,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Read the profile the provider vouches for.

    The identity comes from this TLS call with the access token, not from an id_token we
    validate ourselves: the caller then never has to trust a JWT we did not check a
    signature against.
    """
    async with _client_scope(client) as http:
        response = await http.get(
            spec.userinfo_url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )
        await _raise_for_provider_error(response, step="userinfo")
        try:
            payload = response.json()
        except ValueError as exc:
            raise OAuthProviderError("userinfo returned non-JSON") from exc

    if not isinstance(payload, dict):
        raise OAuthProviderError("userinfo returned a non-object")
    return payload


# ----------------------------------------------------------------------- identity


def _nickname_from(payload: dict[str, Any], email: str) -> str:
    """A display name for a brand new account: provider name, else the mailbox name."""
    parts = [
        str(payload.get(key) or "").strip()
        for key in ("name", "given_name", "displayName", "givenName")
    ]
    candidate = next((p for p in parts if p), "")
    if not candidate:
        candidate = email.split("@", 1)[0]
    return candidate[:_MAX_NICKNAME]


def _bool_claim(value: Any) -> bool:
    """OIDC boolean claims arrive as JSON booleans, but some providers send strings."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() == "true"
    return False


def parse_google_identity(payload: dict[str, Any]) -> OAuthIdentity:
    """Turn Google's userinfo into an identity, keeping only what Google verified.

    Google states email_verified explicitly, so an unverified (or absent) flag is never
    upgraded: a login then cannot claim an address Google has not confirmed.
    """
    subject = str(payload.get("sub") or "").strip()
    if not subject:
        raise OAuthProviderError("google userinfo has no sub")
    raw_email = str(payload.get("email") or "").strip().lower()
    try:
        email = str(_EMAIL.validate_python(raw_email)).lower() if raw_email else ""
    except ValidationError as exc:
        raise OAuthProviderError("google returned an unusable email claim") from exc
    return OAuthIdentity(
        provider="google",
        subject=subject,
        email=email,
        # Google sends email_verified as a JSON boolean.
        email_verified=_bool_claim(payload.get("email_verified")),
        nickname=_nickname_from(payload, email),
    )


# --------------------------------------------------------------------- whole flow


async def complete_login(
    spec: OAuthProviderSpec,
    *,
    code: str,
    state: str,
    db: AsyncSession,
    provider_error: str = "",
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
    store: Any | None = None,
) -> str:
    """Finish the callback: CSRF check, code swap, identity, account, one-time code.

    Returns the one-time code the browser hands back to /api/auth/oauth/exchange. No JWT
    is placed in a redirect URL, where it would end up in logs and history.
    """
    cfg = settings if settings is not None else get_settings()
    redis_client = store if store is not None else oauth_state.get_redis_client()

    if provider_error:
        # The user pressed "cancel", or the provider refused before issuing a code.
        raise OAuthFlowError("access_denied", provider_error)
    if not (code or "").strip():
        raise OAuthFlowError("missing_code")
    if not (state or "").strip():
        raise OAuthFlowError("state_invalid")

    # Single use: a replayed or forged state is gone from Redis before it is trusted.
    try:
        login_state = oauth_state.consume_login_state(redis_client, spec.name, state)
    except oauth_state.OAuthStateError as exc:
        raise OAuthFlowError("state_invalid", str(exc)) from exc
    redirect_uri = redirect_uri_for(spec.name, cfg)
    access_token = await exchange_code_for_token(
        spec,
        code=code,
        code_verifier=login_state.code_verifier,
        redirect_uri=redirect_uri,
        settings=cfg,
        client=client,
    )
    payload = await fetch_userinfo(spec, access_token=access_token, client=client)

    if spec.name == "google":
        identity = parse_google_identity(payload)
    else:  # pragma: no cover - guarded by require_provider()
        raise OAuthProviderError(f"no identity parser for provider {spec.name}")

    result = await oauth_accounts.resolve_oauth_user(db, identity, settings=cfg)
    logger.info(
        "oauth login ok provider=%s user_id=%s outcome=%s",
        spec.name,
        result.user.id,
        result.outcome,
    )
    return oauth_state.issue_login_grant(redis_client, int(result.user.id))
