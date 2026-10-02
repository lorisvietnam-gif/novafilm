"""Định tuyến ảnh Kira: channel của nhà cung cấp phải sống, Seedream vẫn về TokenFree.

Hồi quy cho lỗi đo được: `_ensure_tokenfree_channel` tắt **mọi** dòng channel không phải
TokenFree ở mỗi lần nạp, nên dòng `image-kira` bị tắt vĩnh viễn.
`synchronize_logical_models_with_channels` bỏ qua channel `enabled=False`, nên
`hy-image-v3.5-free` không bao giờ có logical model, và
`resolve_logical_model_candidates("image", "hy-image-v3.5-free")` rơi xuống Seedream của
TokenFree — đúng cái 401 đã gặp.

Bản sửa: dòng mà `.env` đang khai thì không tắt, và dòng đã bị tắt thì bật lại
(`_heal_env_channel_row`). Cơ chế fallback **giữ nguyên** — không thêm nhánh ưu tiên theo
tên model.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.config import Settings
from app.models_settings import SystemModelChannelRow
from app.schemas_routing import AdminRoutingSettingsPatch, SystemModelChannelIn
from app.services import model_settings
from app.services.logical_model_router import resolve_logical_model_candidates
from app.services.model_settings import (
    _encrypt_secret,
    get_routing_snapshot,
    load_model_settings_cache,
)
from app.services.tokenfree_gateway import TOKENFREE_BASE_URL, TOKENFREE_CHANNEL_ID

HY = "hy-image-v3.5-free"
SEEDREAM = "seedream-5-0-pro"
KIRA_ID = "image-kira"


def _env_settings() -> Settings:
    """`.env` giả: có Kira (ảnh) + nhà cung cấp văn bản riêng. Không phụ thuộc máy."""
    return Settings(
        secret_key="test-secret-key-for-routing",
        kira_base_url="https://kiraai.vn/api/v1",
        kira_api_key="sk-kira-test",
        openai_base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        openai_api_key="sk-text-test",
        model_llm="gemini-3.5-flash",
        model_image="doubao-seedream-5-0-260128",
        model_image_45="",
        model_video="doubao-seedance-2-5-260628",
        model_video_2="",
        model_audio="qwen-tts-2025-05-22",
    )


@pytest.fixture
def env_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    """Ép nạp cấu hình nhìn `.env` giả, và không để lọt overlay ra ngoài."""
    settings = _env_settings()
    monkeypatch.setattr(model_settings, "get_settings", lambda: settings)
    monkeypatch.setattr(model_settings, "reload_settings", lambda: None)
    monkeypatch.setattr(model_settings, "_refresh_overlay", lambda config: None)
    snapshot = get_routing_snapshot()
    yield settings
    model_settings._refresh_routing_snapshot(
        snapshot.channels, snapshot.logical_models, snapshot.default_models
    )


def _row(*, id: str, base_url: str, key: str, models: list[str], enabled: bool, sort_order: int):
    return SystemModelChannelRow(
        id=id,
        name=id,
        base_url=base_url,
        api_key_ciphertext=_encrypt_secret(key) if key else None,
        api_format="openai",
        protocol="auto",
        models=models,
        enabled=enabled,
        sort_order=sort_order,
    )


async def _seed_channels(db, *, kira_enabled: bool = False) -> None:
    """Dựng đúng trạng thái DB thật: Kira bị tắt bởi khoá TokenFree, thêm một dòng lạ."""
    db.add(
        _row(
            id=TOKENFREE_CHANNEL_ID,
            base_url=TOKENFREE_BASE_URL,
            key="sk-tokenfree-test",
            models=["doubao-seedream-5-0-260128", "qwen-tts-2025-05-22"],
            enabled=True,
            sort_order=0,
        )
    )
    db.add(
        _row(
            id=KIRA_ID,
            base_url="https://kiraai.vn/api/v1",
            key="sk-kira-test",
            models=[HY],
            enabled=kira_enabled,
            sort_order=-2,
        )
    )
    # Dòng của nhà cung cấp đã bị gỡ khỏi `.env`: vẫn phải bị tắt như trước.
    db.add(
        _row(
            id="legacy-vendor",
            base_url="https://legacy.example.com/v1",
            key="sk-legacy-test",
            models=["seedream-4-5"],
            enabled=True,
            sort_order=3,
        )
    )
    await db.flush()


def _channel(enabled: dict[str, bool] | None = None) -> dict:
    snapshot = get_routing_snapshot()
    return {c.id: c.enabled for c in snapshot.channels} if enabled is None else enabled


def _routes(capability: str, model_id: str) -> list[tuple[str, str]]:
    return [(r.channel_id, r.upstream_model) for r in resolve_logical_model_candidates(capability, model_id)]


async def test_kira_image_model_routes_to_kira_not_tokenfree(db_session, env_settings) -> None:
    """Đây là lỗi gốc: HY Image phải ra Kira, không rơi về Seedream của TokenFree."""
    await _seed_channels(db_session, kira_enabled=False)
    await load_model_settings_cache(db_session)

    assert _routes("image", HY) == [(KIRA_ID, HY)]
    # Chốt chặn: Seedream vẫn phải ở TokenFree.
    assert _routes("image", SEEDREAM) == [(TOKENFREE_CHANNEL_ID, "doubao-seedream-5-0-260128")]


async def test_env_channel_row_is_healed_but_stale_row_still_disabled(db_session, env_settings) -> None:
    """Khoá TokenFree chỉ được tắt dòng lạ; dòng của `.env` thì bật lại."""
    await _seed_channels(db_session, kira_enabled=False)
    await load_model_settings_cache(db_session)

    enabled = _channel()
    assert enabled[KIRA_ID] is True
    assert enabled["legacy-vendor"] is False
    assert enabled[TOKENFREE_CHANNEL_ID] is True

    rows = {
        row.id: row
        for row in (await db_session.execute(select(SystemModelChannelRow))).scalars().all()
    }
    assert rows[KIRA_ID].enabled is True
    # Hồi phục không được đụng cột đã có: base URL và khoá giữ nguyên.
    assert rows[KIRA_ID].base_url == "https://kiraai.vn/api/v1"
    assert rows[KIRA_ID].models == [HY]


async def test_hy_image_does_not_become_the_default_image_model(db_session, env_settings) -> None:
    """Thêm Kira không được giành mất vị trí mặc định của Seedream."""
    await _seed_channels(db_session, kira_enabled=False)
    await load_model_settings_cache(db_session)

    assert get_routing_snapshot().default_models.image_model == "doubao-seedream-5-0-260128"


async def test_admin_routing_patch_does_not_switch_kira_off(db_session, env_settings) -> None:
    """Ngoặc nguy hiểm: PATCH routing gửi `system_channels` từng tắt mọi channel khác.

    Gửi Kira qua đường đó sẽ tự tắt chính channel Kira, nên đường đó không được dùng để
    thêm channel. Ở đây kiểm tra: sau khi lưu routing, Kira vẫn sống và HY vẫn ra Kira.
    """
    await _seed_channels(db_session, kira_enabled=True)
    body = AdminRoutingSettingsPatch(
        system_channels=[
            SystemModelChannelIn(
                id=TOKENFREE_CHANNEL_ID,
                name="TokenFree New API",
                base_url=TOKENFREE_BASE_URL,
                api_format="openai",
                protocol="auto",
                models=["doubao-seedream-5-0-260128"],
                enabled=True,
                sort_order=0,
            )
        ]
    )
    await model_settings.patch_admin_routing_settings(db_session, body)

    assert _channel()[KIRA_ID] is True
    # Lưu routing ghim danh sách model TokenFree về đúng preset của trang, nên HY xuất
    # hiện thêm ở TokenFree dưới dạng ứng viên dự phòng. Ưu tiên phải vẫn là Kira
    # (`sort_order=-2` → priority nhỏ hơn), và cơ chế failover là cố ý, không xoá.
    routes = _routes("image", HY)
    assert routes[0] == (KIRA_ID, HY)
