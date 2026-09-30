# -*- coding: utf-8 -*-
"""SECRET_KEY startup gate regression (no database required).

The default SECRET_KEY is public in the repository: it signs every JWT and derives
the Fernet key that encrypts the provider API keys stored in the database. Shipping
it to production means anyone can mint an admin token and read those keys, so
Settings() must refuse to build itself in production instead of booting quietly.

These cases construct Settings() directly, so they run identically with or without
PostgreSQL.
"""
from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError

from app import config as config_module
from app.config import DEFAULT_SECRET_KEY, Settings


@pytest.fixture(autouse=True)
def _reset_warning_guard() -> None:
    """Let each case observe the once-per-process weak-key warning."""
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(config_module, "_weak_secret_warned", False)
    yield
    monkeypatch.undo()


def test_production_refuses_default_secret_key() -> None:
    """Production + the public default key must not construct at all."""
    with pytest.raises(ValidationError) as exc:
        Settings(app_env="production", secret_key=DEFAULT_SECRET_KEY)
    message = str(exc.value)
    assert "SECRET_KEY" in message
    assert "APP_ENV" in message


def test_production_refuses_blank_secret_key() -> None:
    """An empty or whitespace SECRET_KEY is the same hole as the default one."""
    with pytest.raises(ValidationError) as exc:
        Settings(app_env="production", secret_key="   ")
    assert "SECRET_KEY" in str(exc.value)


def test_prod_alias_also_refuses_default_secret_key() -> None:
    """The prod alias must not be a way around the gate."""
    with pytest.raises(ValidationError):
        Settings(app_env="prod", secret_key=DEFAULT_SECRET_KEY)


def test_production_refuses_deploy_placeholder_secret_key() -> None:
    """deploy/.env.prod.example ships a second public placeholder; it must not pass either."""
    with pytest.raises(ValidationError) as exc:
        Settings(app_env="production", secret_key="change-me-to-a-long-random-string")
    assert "SECRET_KEY" in str(exc.value)


def test_production_starts_with_private_secret_key() -> None:
    """A real key in production starts normally and keeps the environment label."""
    settings = Settings(app_env="production", secret_key="a-private-not-public-key")
    assert settings.app_env == "production"
    assert settings.secret_key == "a-private-not-public-key"


def test_development_starts_with_default_secret_key() -> None:
    """Zero-configuration local development must keep working."""
    settings = Settings(app_env="development", secret_key=DEFAULT_SECRET_KEY)
    assert settings.app_env == "development"
    assert settings.secret_key == DEFAULT_SECRET_KEY


def test_unset_app_env_is_development(monkeypatch: pytest.MonkeyPatch) -> None:
    """No APP_ENV at all means development, so a fresh clone boots with no config."""
    monkeypatch.delenv("APP_ENV", raising=False)
    settings = Settings(secret_key=DEFAULT_SECRET_KEY)
    assert settings.app_env == "development"


def test_app_env_is_case_and_space_insensitive() -> None:
    """APP_ENV=' Production ' is still production; staging is not."""
    assert Settings(app_env=" Production ", secret_key="k").app_env == "production"
    assert Settings(app_env="staging", secret_key=DEFAULT_SECRET_KEY).app_env == "staging"


def test_unknown_app_env_is_rejected() -> None:
    """A typo must not silently downgrade production to development."""
    with pytest.raises(ValidationError) as exc:
        Settings(app_env="prodution", secret_key=DEFAULT_SECRET_KEY)
    assert "APP_ENV" in str(exc.value)


def test_development_warns_once_about_default_secret_key(caplog: pytest.LogCaptureFixture) -> None:
    """Non-production keeps booting but says once that the key is public."""
    with caplog.at_level(logging.WARNING, logger="app.config"):
        Settings(app_env="development", secret_key=DEFAULT_SECRET_KEY)
        Settings(app_env="development", secret_key=DEFAULT_SECRET_KEY)
    warnings = [r for r in caplog.records if r.name == "app.config"]
    assert len(warnings) == 1
    assert "SECRET_KEY" in warnings[0].getMessage()


def test_private_secret_key_does_not_warn(caplog: pytest.LogCaptureFixture) -> None:
    """A private key is silent; the warning must not become startup noise."""
    with caplog.at_level(logging.WARNING, logger="app.config"):
        Settings(app_env="development", secret_key="a-private-not-public-key")
    assert [r for r in caplog.records if r.name == "app.config"] == []
