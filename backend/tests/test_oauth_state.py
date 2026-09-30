"""OAuth 登录的 Redis 一次性凭证：state（CSRF）与登录 code。"""

from __future__ import annotations

import pytest

from app.services import oauth_state
from tests.oauth_fakes import FakeRedis


def test_login_state_roundtrip_carries_the_pkce_verifier() -> None:
    r = FakeRedis()
    state = oauth_state.create_login_state(r, "google", "verifier-xyz")
    restored = oauth_state.consume_login_state(r, "google", state)
    assert restored.provider == "google"
    assert restored.code_verifier == "verifier-xyz"


def test_login_state_is_single_use() -> None:
    # 重放同一个 state 第二次必须失败
    r = FakeRedis()
    state = oauth_state.create_login_state(r, "google", "v")
    oauth_state.consume_login_state(r, "google", state)
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "google", state)


def test_login_state_rejects_a_foreign_provider() -> None:
    # 拿 google 的 state 去敲 microsoft 的回调，等于伪造
    r = FakeRedis()
    state = oauth_state.create_login_state(r, "google", "v")
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "microsoft", state)
    # 即便被拒也已经烧掉，不能回放
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "google", state)


@pytest.mark.parametrize("bad", ["", "   ", "not-a-real-state"])
def test_login_state_rejects_missing_or_unknown_state(bad: str) -> None:
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(FakeRedis(), "google", bad)


def test_login_state_ttl_is_short() -> None:
    r = FakeRedis()
    state = oauth_state.create_login_state(r, "google", "v")
    key = next(k for k in r.store if k.startswith("oauth:state:"))
    assert r.ttls[key] == oauth_state.STATE_TTL_SECONDS
    assert oauth_state.STATE_TTL_SECONDS <= 15 * 60


def test_state_key_stores_only_the_digest() -> None:
    # Redis 里不留明文 state，令牌只在浏览器和本进程里出现
    r = FakeRedis()
    state = oauth_state.create_login_state(r, "google", "v")
    assert all(state not in key for key in r.store)
    assert any(key.startswith("oauth:state:") for key in r.store)


def test_login_grant_is_single_use() -> None:
    # code 只够换一次 JWT，否则 URL 里出现的东西就能被反复使用
    r = FakeRedis()
    grant = oauth_state.issue_login_grant(r, 4242)
    assert oauth_state.consume_login_grant(r, grant) == 4242
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_grant(r, grant)


@pytest.mark.parametrize("bad", ["", "nope"])
def test_login_grant_rejects_missing_or_unknown_code(bad: str) -> None:
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_grant(FakeRedis(), bad)


def test_login_grant_ttl_is_very_short() -> None:
    r = FakeRedis()
    oauth_state.issue_login_grant(r, 1)
    key = next(k for k in r.store if k.startswith("oauth:grant:"))
    assert r.ttls[key] == oauth_state.GRANT_TTL_SECONDS
    assert oauth_state.GRANT_TTL_SECONDS <= 5 * 60


def test_redis_down_raises_instead_of_falling_back_to_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 没有内存兜底：宁可登录失败，也不能发一个校验不了的 state
    def boom(*_args, **_kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr("redis.Redis.from_url", boom)
    with pytest.raises(oauth_state.OAuthStoreError):
        oauth_state.get_redis_client()
