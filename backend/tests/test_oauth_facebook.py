"""Facebook 登录：Graph API 的 riêng biệt, và vì sao mọi email Facebook đều là nhánh B."""

from __future__ import annotations

from urllib.parse import parse_qs

import httpx
import pytest

from app.services import oauth, oauth_accounts
from tests.oauth_fakes import fake_session, fake_settings, mock_transport, query_of

SETTINGS = fake_settings(facebook_client_id="fid", facebook_client_secret="fsecret")

TOKEN_OK = httpx.Response(200, json={"access_token": "at-f", "token_type": "Bearer"})
USERINFO_OK = httpx.Response(
    200,
    json={
        "id": "fb-1",
        "name": "Ada",
        "email": "ada@example.com",
        "picture": {"data": {"url": "https://scontent.fb/a.jpg"}},
    },
)


@pytest.mark.asyncio
async def test_facebook_token_exchange_carries_the_redirect_uri() -> None:
    # Facebook BẮT BUỘC redirect_uri trong thân yêu cầu đổi token; thiếu là invalid_request
    calls: list[httpx.Request] = []
    spec = oauth.require_provider("facebook", SETTINGS)
    async with httpx.AsyncClient(
        transport=mock_transport({"access_token": TOKEN_OK, "me": USERINFO_OK}, calls)
    ) as client:
        await oauth.exchange_code_for_token(
            spec,
            code="fb-code",
            code_verifier="verifier",
            redirect_uri="http://localhost:8000/api/auth/facebook/callback",
            settings=SETTINGS,
            client=client,
        )
        await oauth.fetch_userinfo(spec, access_token="at-f", client=client)

    token_request, userinfo_request = calls
    form = {k: v[0] for k, v in parse_qs(token_request.content.decode()).items()}
    assert form["grant_type"] == "authorization_code"
    assert form["redirect_uri"] == "http://localhost:8000/api/auth/facebook/callback"
    assert form["client_id"] == "fid"
    assert form["client_secret"] == "fsecret"
    assert form["code_verifier"] == "verifier"
    # userinfo phải yêu cầu đúng các trường, và avatar nằm ở đường dẫn lồng
    assert userinfo_request.url.params["fields"] == "id,name,email,picture.type(large)"
    assert userinfo_request.headers["authorization"] == "Bearer at-f"


def test_facebook_identity_reads_the_nested_avatar() -> None:
    identity = oauth.identity_from_payload(oauth.find_spec("facebook"), USERINFO_OK.json())
    assert (identity.provider, identity.subject, identity.email) == (
        "facebook",
        "fb-1",
        "ada@example.com",
    )
    assert identity.avatar_url == "https://scontent.fb/a.jpg"


def test_facebook_email_is_never_treated_as_verified() -> None:
    # Facebook không có trường verified: mọi email đều là CHƯA xác minh, nên rơi vào
    # nhánh B chứ không được liên kết vào một tài khoản có sẵn theo email
    identity = oauth.identity_from_payload(oauth.find_spec("facebook"), USERINFO_OK.json())
    assert identity.email_verified is False
    assert (
        oauth_accounts.plan_oauth_link(identity, linked_user=None, email_user=None)
        == "create_pending"
    )


def test_facebook_authorize_url_uses_its_own_dialog_and_scope() -> None:
    url = oauth.build_authorize_url(
        oauth.find_spec("facebook"),
        redirect_uri="http://localhost:8000/api/auth/facebook/callback",
        state="s1",
        code_challenge="c1",
        settings=SETTINGS,
    )
    assert url.startswith("https://www.facebook.com/v21.0/dialog/oauth?")
    q = query_of(url)
    assert q["scope"] == "public_profile,email"
    assert q["client_id"] == "fid"
    assert q["code_challenge_method"] == "S256"


@pytest.mark.asyncio
async def test_facebook_userinfo_is_read_over_the_graph_api() -> None:
    spec = oauth.require_provider("facebook", SETTINGS)
    async with httpx.AsyncClient(
        transport=mock_transport({"me": USERINFO_OK})
    ) as client:
        payload = await oauth.fetch_userinfo(spec, access_token="at-f", client=client)
    identity = oauth.identity_from_payload(spec, payload)
    assert (identity.subject, identity.email, identity.email_verified) == (
        "fb-1",
        "ada@example.com",
        False,
    )