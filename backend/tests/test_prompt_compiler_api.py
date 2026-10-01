"""Endpoint bộ biên dịch prompt — không tốn credit, không gọi model, không ghi DB.

Hai endpoint này không chạm database, nên test ghi đè ``get_current_user`` thay vì dựng
cả bộ hạ tầng auth. Nhờ vậy test vẫn xanh khi chưa có Postgres.
"""

from __future__ import annotations

import httpx
import pytest
from httpx import ASGITransport

from app.deps import get_current_user
from app.main import app
from app.models import User

PROFILES_URL = "/api/drama/prompt-compiler/profiles"
COMPILE_URL = "/api/drama/prompt-compiler/compile"


async def _fake_user() -> User:
    return User(id=1, email="compiler@example.com")


async def _call(method: str, url: str, **kwargs) -> httpx.Response:
    """Gọi endpoint có token giả; override dọn sạch dù test pass hay fail."""
    app.dependency_overrides[get_current_user] = _fake_user
    try:
        async with httpx.AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            return await ac.request(method, url, **kwargs)
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_profiles_endpoint_lists_every_profile_with_evidence_counts() -> None:
    res = await _call("GET", PROFILES_URL)
    assert res.status_code == 200, res.text
    models = res.json()["models"]
    assert models[0]["id"] == "seedance-2-5"
    seedance = next(m for m in models if m["id"] == "seedance-2-0")
    assert seedance["readiness"] == "evidence-based"
    assert seedance["evidence_counts"]["unknown"] == 0
    muse = next(m for m in models if m["id"] == "muse-video")
    assert muse["readiness"] == "skeleton"
    assert muse["evidence_counts"]["unknown"] > 0


@pytest.mark.asyncio
async def test_profiles_endpoint_requires_auth() -> None:
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        res = await ac.get(PROFILES_URL)
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_compile_endpoint_returns_prompt_and_parameter_plan() -> None:
    res = await _call(
        "POST",
        COMPILE_URL,
        json={
            "model": "seedance-2-5",
            "scene": {
                "subject": "穿绿裙的年轻女子",
                "action": "在草坪上奔跑",
                "setting": "月下花园",
                "style": "浪漫写实电影感",
                "references": [
                    {
                        "label": "阿灵",
                        "url": "https://cdn.example.com/ling.png",
                        "kind": "character",
                    }
                ],
            },
            "aspect_ratio": "9:16",
            "duration_sec": 8,
            "resolution": "1080p",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["model"] == "seedance-2-5"
    assert data["compiler_mode"] == "seedance"
    assert data["prompt"].startswith("【强制约束：")
    assert data["parameters"]["image_field"] == "reference_image_urls"
    assert data["parameters"]["ratio"] == "9:16"
    assert data["used_facts"], "phải kèm các mục hồ sơ đã dùng để dựng prompt"


@pytest.mark.asyncio
async def test_compile_endpoint_rejects_a_model_without_a_profile() -> None:
    res = await _call(
        "POST",
        COMPILE_URL,
        json={"model": "sora", "scene": {"subject": "x"}, "duration_sec": 6},
    )
    assert res.status_code == 400
    assert "sora" in res.json()["detail"]


@pytest.mark.asyncio
async def test_compile_endpoint_is_deterministic() -> None:
    payload = {
        "model": "veo-3-1",
        "scene": {"subject": "a detective", "setting": "an office"},
        "aspect_ratio": "9:16",
        "duration_sec": 8,
        "resolution": "1080p",
    }
    first = await _call("POST", COMPILE_URL, json=payload)
    second = await _call("POST", COMPILE_URL, json=payload)
    assert first.status_code == 200 and second.status_code == 200
    assert first.json() == second.json()
