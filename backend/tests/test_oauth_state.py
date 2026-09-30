"""Giấy tờ một lần của luồng OAuth: state (CSRF), phiên trình duyệt, mã đổi JWT."""

from __future__ import annotations

import pytest

from app.services import oauth_state
from tests.oauth_fakes import FakeRedis


def _create(r: FakeRedis, provider: str = "google", verifier: str = "v", **kw) -> tuple[str, str]:
    return oauth_state.create_login_state(r, provider, verifier, **kw)


def test_login_state_roundtrip_carries_the_pkce_verifier() -> None:
    r = FakeRedis()
    state, sid = _create(r, verifier="verifier-xyz")
    restored = oauth_state.consume_login_state(r, "google", state, sid)
    assert restored.provider == "google"
    assert restored.code_verifier == "verifier-xyz"
    assert restored.session_id == sid


def test_login_state_is_single_use() -> None:
    # 重放同一个 state 第二次必须失败
    r = FakeRedis()
    state, sid = _create(r)
    oauth_state.consume_login_state(r, "google", state, sid)
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "google", state, sid)


def test_login_state_expires() -> None:
    # TTL hết thì state biến mất khỏi Redis, y hệt một state bị dùng nhầm
    r = FakeRedis()
    state, sid = _create(r)
    r.expire_all()
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "google", state, sid)


def test_login_state_rejects_a_foreign_provider() -> None:
    # 拿 google 的 state 去敲 microsoft 的回调，等于伪造
    r = FakeRedis()
    state, sid = _create(r)
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "microsoft", state, sid)
    # 即便被拒也已经烧掉，不能回放
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "google", state, sid)


def test_login_state_requires_the_browser_session() -> None:
    # state đúng nhưng cookie phiên không khớp = CSRF từ tab khác
    r = FakeRedis()
    state, _sid = _create(r)
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "google", state, "another-tab")
    # bị từ chối thì cũng cháy luôn
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "google", state, _sid)


def test_state_tampered_in_redis_is_refused() -> None:
    # MAC lệch: kẻ tấn công ghi thẳng vào Redis vẫn không dựng được state hợp lệ
    r = FakeRedis()
    state, sid = _create(r)
    key = next(k for k in r.store if k.startswith("oauth:state:"))
    r.store[key] = r.store[key].replace('"m":"', '"m":"00')
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(r, "google", state, sid)


@pytest.mark.parametrize("bad", ["", "   ", "not-a-real-state"])
def test_login_state_rejects_missing_or_unknown_state(bad: str) -> None:
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_state(FakeRedis(), "google", bad, "sid")


def test_login_state_and_session_ttl_are_short() -> None:
    r = FakeRedis()
    _create(r)
    state_key = next(k for k in r.store if k.startswith("oauth:state:"))
    session_key = next(k for k in r.store if k.startswith("oauth:session:"))
    assert r.ttls[state_key] == oauth_state.STATE_TTL_SECONDS
    assert r.ttls[session_key] == oauth_state.SESSION_TTL_SECONDS
    assert oauth_state.STATE_TTL_SECONDS <= 15 * 60


def test_state_key_stores_only_the_digest() -> None:
    # Redis 里不留明文 state，令牌只在浏览器和本进程里出现
    r = FakeRedis()
    state, sid = _create(r)
    assert all(state not in key for key in r.store)
    assert all(sid not in key for key in r.store)
    assert any(key.startswith("oauth:state:") for key in r.store)


def test_next_path_travels_with_the_state() -> None:
    r = FakeRedis()
    state, sid = _create(r, next_path="/studio/new")
    assert oauth_state.consume_login_state(r, "google", state, sid).next_path == "/studio/new"


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


def test_setup_token_is_single_use_and_never_a_login_grant() -> None:
    # 账号待完善时只给 setup token；它换不出 JWT，也只能用一次
    r = FakeRedis()
    token = oauth_state.issue_setup_token(r, 77)
    assert oauth_state.consume_setup_token(r, token) == 77
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_setup_token(r, token)
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_login_grant(r, token)


def test_setup_token_expires() -> None:
    r = FakeRedis()
    token = oauth_state.issue_setup_token(r, 77)
    r.expire_all()
    with pytest.raises(oauth_state.OAuthStateError):
        oauth_state.consume_setup_token(r, token)


def test_redis_down_raises_instead_of_falling_back_to_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 没有内存兜底：宁可登录失败，也不能发一个校验不了的 state
    def boom(*_args, **_kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr("redis.Redis.from_url", boom)
    with pytest.raises(oauth_state.OAuthStoreError):
        oauth_state.get_redis_client()