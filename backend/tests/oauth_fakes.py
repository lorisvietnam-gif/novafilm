"""OAuth 测试用的替身：假 Redis、假 settings、假 httpx 传输。

这些替身保证整套登录流程测试既不连网也不连 Postgres。
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx


class FakeRedis:
    """最小 Redis 替身：get/getdel/setex/incr/expire/ttl/ping（对应 Redis 6.2+ GETDEL）。"""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    def ping(self) -> bool:
        return True

    def get(self, key: str) -> str | None:
        return self.store.get(key)

    def getdel(self, key: str) -> str | None:
        value = self.store.pop(key, None)
        self.ttls.pop(key, None)
        return value

    def setex(self, key: str, ttl: int, value: str) -> bool:
        self.store[key] = str(value)
        self.ttls[key] = int(ttl)
        return True

    def incr(self, key: str) -> int:
        count = int(self.store.get(key, "0")) + 1
        self.store[key] = str(count)
        return count

    def expire(self, key: str, ttl: int) -> bool:
        self.ttls[key] = int(ttl)
        return True

    def ttl(self, key: str) -> int:
        return int(self.ttls.get(key, -1))

    def expire_all(self) -> None:
        """Mô phỏng TTL của Redis: mọi khoá biến mất khỏi bộ nhớ."""
        self.store.clear()
        self.ttls.clear()


def fake_session(row: object | None = None) -> MagicMock:
    """AsyncSession 替身：execute() 的 scalar_one_or_none() 恒返回 row。

    新建的行都收在 db.added 里，方便断言；commit/refresh/rollback 是协程。
    """
    result = MagicMock()
    result.scalar_one_or_none.return_value = row
    result.scalars.return_value.all.return_value = []
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()
    db.added = []
    db.add = MagicMock(side_effect=db.added.append)
    return db


def fake_settings(**overrides) -> SimpleNamespace:
    """一份只含 OAuth 字段的假 Settings（后端真的只读这些）。"""
    base = SimpleNamespace(
        google_client_id="",
        google_client_secret="",
        microsoft_client_id="",
        microsoft_client_secret="",
        facebook_client_id="",
        facebook_client_secret="",
        tiktok_client_key="",
        tiktok_client_secret="",
        oauth_redirect_base_url="http://localhost:8000",
        oauth_post_login_redirect_url="http://localhost:5173/auth",
        oauth_auto_link_email=True,
        oauth_rate_limit_per_minute=30,
        cors_origins="http://localhost:5173,http://127.0.0.1:5173",
        secret_key="test-secret-key-for-oauth-tests",
    )
    for key, value in overrides.items():
        setattr(base, key, value)
    return base


def mock_transport(responses: dict[str, httpx.Response], calls: list[httpx.Request] | None = None):
    """按 URL 里的关键字返回预置响应的 httpx 传输。"""

    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        target = request.url.host + request.url.path
        for needle, response in responses.items():
            if needle in target:
                return response
        return httpx.Response(404, json={"error": "unsupported_test_url", "path": target})

    return httpx.MockTransport(handler)


def query_of(url: str) -> dict[str, str]:
    """解析 URL 的 query string 成 dict。"""
    from urllib.parse import parse_qs, urlsplit

    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}