"""allowlist 环境变量：配置出错必须点名变量，且默认不内置任何站点域名。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.config import parse_host_list, parse_origin_list
from app.services.oss import cors_origin_list


def _settings(**overrides):
    base = {
        "cors_origins": "",
        "oss_cors_extra_origins": "",
        "public_base_url": "",
        "static_host_allowlist": "",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_parse_origin_list_trims_and_normalises():
    assert parse_origin_list(
        "https://a.example.com, http://b.example.com:8080/ ,",
        variable="OSS_CORS_EXTRA_ORIGINS",
    ) == ["https://a.example.com", "http://b.example.com:8080"]


@pytest.mark.parametrize(
    "bad",
    [
        "a.example.com",
        "ftp://a.example.com",
        "https://a.example.com/static",
        "https://a.example.com?x=1",
        "https://a.example.com#f",
        "https://a example.com",
    ],
)
def test_parse_origin_list_rejects_malformed(bad):
    with pytest.raises(ValueError, match="OSS_CORS_EXTRA_ORIGINS"):
        parse_origin_list(bad, variable="OSS_CORS_EXTRA_ORIGINS")


def test_parse_host_list_lowercases():
    assert parse_host_list(
        "A.Example.com:8000, b.example.com", variable="STATIC_HOST_ALLOWLIST"
    ) == ["a.example.com:8000", "b.example.com"]


@pytest.mark.parametrize(
    "bad",
    ["https://a.example.com", "a.example.com/static", "a b"],
)
def test_parse_host_list_rejects_malformed(bad):
    with pytest.raises(ValueError, match="STATIC_HOST_ALLOWLIST"):
        parse_host_list(bad, variable="STATIC_HOST_ALLOWLIST")


def test_cors_origin_list_ships_only_loopback_by_default():
    assert cors_origin_list(_settings()) == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]


def test_cors_origin_list_merges_configured_origins_without_duplicates():
    origins = cors_origin_list(
        _settings(
            cors_origins="http://localhost:5174",
            oss_cors_extra_origins="https://studio.example.com,https://studio.example.com",
            public_base_url="https://api.example.com/",
        )
    )
    assert "http://localhost:5174" in origins
    assert "http://localhost:5173" in origins
    assert origins.count("https://studio.example.com") == 1
    assert "https://api.example.com" in origins


def test_cors_origin_list_raises_naming_the_variable():
    with pytest.raises(ValueError, match="OSS_CORS_EXTRA_ORIGINS"):
        cors_origin_list(_settings(oss_cors_extra_origins="studio.example.com"))


def test_settings_rejects_malformed_allowlist_at_construction():
    """校验发生在 Settings 构造期（启动即失败），而不是等到第一次用到白名单。"""
    from pydantic import ValidationError

    from app.config import Settings

    with pytest.raises(ValidationError, match="STATIC_HOST_ALLOWLIST"):
        Settings(static_host_allowlist="https://a.example.com/static")
    with pytest.raises(ValidationError, match="OSS_CORS_EXTRA_ORIGINS"):
        Settings(oss_cors_extra_origins="a.example.com")
