# -*- coding: utf-8 -*-
"""Giá trị mặc định người dùng đặt qua PATCH phải thắng giá trị đã chuẩn hoá.

Bối cảnh đo được trên database thật (lane bunny/4, brief `case-wizard-backend-b4.md`)::

    patch_admin_model_settings(db, AdminModelSettingsPatch(model_image='hy-image-v3.5-free'))
      -> applied: ['model_llm', 'model_image']          # nhận giá trị
      -> overlay ngay sau patch : 'doubao-seedream-5-0-260128'   # đã bị đổi lại
      -> sau reload             : 'doubao-seedream-5-0-260128'

Nguyên nhân: `patch_admin_model_settings` chỉ ghi vào `config["flat"]`, còn
`_compose_runtime_state` ghi **ngược** `default_models` xuống `flat`
(`flat["model_image"] = default_models.image_model`). `default_models` lúc đó vẫn còn giá
trị cũ trong `config["default_models"]`, nên giá trị vừa ghi bị đè **trong lúc patch**, rồi
`load_model_settings_cache` còn ghi ngược kết quả đè đó vào `config["flat"]` — mất vĩnh viễn.

Hai đường ghi cùng nói về một quyết định (`model_image`) nhưng chỉ một đường được tôn trọng.
Bản sửa cho `default_models` là nguồn chân lý, và `PATCH /api/admin/settings/models` ghi
vào đó luôn — không sửa bằng cách xoá `normalize_default_models` hay ép cứng.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import config as config_module
from app.models_settings import AppSettings, SystemModelChannelRow
from app.schemas_routing import DefaultModels, default_models_from_dict, default_models_to_dict
from app.schemas_settings import AdminModelSettingsPatch
from app.services import model_settings
from app.services.model_routing_config import resolve_logical_model_config

HY_IMAGE = "hy-image-v3.5-free"
SEEDREAM = "doubao-seedream-5-0-260128"


@pytest.fixture(autouse=True)
def _isolate_runtime_state() -> None:
    """overlay / routing snapshot là global; mỗi case phải trả lại đúng trạng thái cũ."""
    saved_overlay = dict(model_settings._overlay)
    saved_snapshot = model_settings._routing_snapshot
    yield
    model_settings._overlay.clear()
    model_settings._overlay.update(saved_overlay)
    model_settings._refresh_routing_snapshot(
        saved_snapshot.channels,
        saved_snapshot.logical_models,
        saved_snapshot.default_models,
    )
    config_module.get_settings.cache_clear()


@pytest.mark.asyncio
async def test_patch_model_image_survives_reload(db_session: AsyncSession) -> None:
    """Giá trị người dùng đặt phải còn sau khi nạp lại cấu hình — không bị ghi đè."""
    await model_settings.load_model_settings_cache(db_session)
    before = model_settings.get_routing_snapshot().default_models
    assert before.image_model != HY_IMAGE, "tiền đề của test: mặc định ban đầu không phải HY"

    settings, applied = await model_settings.patch_admin_model_settings(
        db_session, AdminModelSettingsPatch(model_image=HY_IMAGE)
    )
    assert "model_image" in applied
    # Ngay sau patch, overlay phải là giá trị người dùng đặt.
    assert model_settings.get_overlay_dict()["model_image"] == HY_IMAGE
    assert settings.model_image == HY_IMAGE

    # Nạp lại từ database: giá trị phải sống, không bị chuẩn hoá nuốt mất.
    await model_settings.load_model_settings_cache(db_session)
    assert model_settings.get_routing_snapshot().default_models.image_model == HY_IMAGE
    assert model_settings.get_overlay_dict()["model_image"] == HY_IMAGE


@pytest.mark.asyncio
async def test_patch_model_image_is_not_resurrected_after_restart(db_session: AsyncSession) -> None:
    """Sau một lần `patch` rồi nạp lại *hai lần*, giá trị vẫn phải là HY (chống ghi đè nhiều lớp)."""
    await model_settings.load_model_settings_cache(db_session)
    await model_settings.patch_admin_model_settings(
        db_session, AdminModelSettingsPatch(model_image=HY_IMAGE)
    )
    await model_settings.load_model_settings_cache(db_session)
    await model_settings.load_model_settings_cache(db_session)
    assert model_settings.get_routing_snapshot().default_models.image_model == HY_IMAGE


@pytest.mark.asyncio
async def test_patch_image_default_keeps_seedream_resolvable(db_session: AsyncSession) -> None:
    """Sửa để đổi mặc định được không được phá Seedream trên TokenFree."""
    await model_settings.load_model_settings_cache(db_session)
    await model_settings.patch_admin_model_settings(
        db_session, AdminModelSettingsPatch(model_image=HY_IMAGE)
    )
    await model_settings.load_model_settings_cache(db_session)
    snapshot = model_settings.get_routing_snapshot()
    resolved = resolve_logical_model_config(
        snapshot.logical_models, snapshot.channels, "image", SEEDREAM
    )
    assert resolved is not None, "Seedream phải còn phân giải được trên TokenFree"
    assert resolved["channel"].id == "tokenfree"


@pytest.mark.asyncio
async def test_patch_other_default_fields_also_win(db_session: AsyncSession) -> None:
    """Cùng cơ chế cho `model_llm` — không được chỉ vá riêng ảnh.

    Thêm `gemini-3-flash-preview` vào **channel TokenFree** (đã có sẵn, không bị tắt) để nó
    thật sự phân giải được: nếu không, case này chỉ đang đo `normalize_default_models` chứ
    không đo thứ tự ưu tiên, và sẽ đỏ vì lý do không liên quan.
    """
    from app.services.tokenfree_gateway import TOKENFREE_CHANNEL_ID

    tokenfree = (
        await db_session.execute(
            select(SystemModelChannelRow).where(SystemModelChannelRow.id == TOKENFREE_CHANNEL_ID)
        )
    ).scalar_one()
    tokenfree.models = list(tokenfree.models or []) + ["gemini-3-flash-preview"]
    await db_session.commit()
    await model_settings.load_model_settings_cache(db_session)
    assert resolve_logical_model_config(
        model_settings.get_routing_snapshot().logical_models,
        model_settings.get_routing_snapshot().channels,
        "text",
        "gemini-3-flash-preview",
    ) is not None, "tiền đề của test: model văn bản phải phân giải được"

    settings, applied = await model_settings.patch_admin_model_settings(
        db_session, AdminModelSettingsPatch(model_llm="gemini-3-flash-preview")
    )
    assert "model_llm" in applied
    assert settings.model_llm == "gemini-3-flash-preview"

    await model_settings.load_model_settings_cache(db_session)
    assert model_settings.get_routing_snapshot().default_models.text_model == "gemini-3-flash-preview"
    assert model_settings.get_overlay_dict()["model_llm"] == "gemini-3-flash-preview"


@pytest.mark.asyncio
async def test_patch_unresolvable_default_does_not_break_routing(db_session: AsyncSession) -> None:
    """Đặt mặc định không phân giải được thì phải rơi về model hợp lệ, không để trống.

    Đây là lưới an toàn của `normalize_default_models` — **không** phải chỗ sửa giá trị
    người dùng đặt. Case này khóa lại ranh giới: giá trị hợp lệ thắng, giá trị bất khả thi
    bị chuẩn hoá, và không bao giờ để sản phẩm rơi vào trạng thái không có model.
    """
    await model_settings.load_model_settings_cache(db_session)
    before = model_settings.get_routing_snapshot().default_models
    assert before.text_model, "tiền đề: phải có mặc định văn bản trước khi thử gắt sai"

    settings, _ = await model_settings.patch_admin_model_settings(
        db_session, AdminModelSettingsPatch(model_llm="khong-ton-tai-trong-kenh-nao")
    )
    assert settings.model_llm != "khong-ton-tai-trong-kenh-nao"
    await model_settings.load_model_settings_cache(db_session)
    after = model_settings.get_routing_snapshot().default_models
    assert after.text_model == before.text_model
    assert resolve_logical_model_config(
        after and model_settings.get_routing_snapshot().logical_models,
        model_settings.get_routing_snapshot().channels,
        "text",
        after.text_model,
    ) is not None


@pytest.mark.asyncio
async def test_patch_image_written_through_has_no_duplicate_key(db_session: AsyncSession) -> None:
    """Dict lưu trong DB chỉ được có khoá camelCase.

    Trộn thẳng `image_model` vào dict đang có `imageModel` sẽ tạo hai khoá, mà
    `default_models_from_dict` đọc camelCase trước — giá trị mới bị giá trị cũ che mất,
    đúng triệu chứng PATCH "nhận" xong rồi mất.
    """
    await model_settings.load_model_settings_cache(db_session)
    await model_settings.patch_admin_model_settings(
        db_session, AdminModelSettingsPatch(model_image=HY_IMAGE)
    )
    db_session.expire_all()
    row = (await db_session.execute(select(AppSettings).where(AppSettings.id == "default"))).scalar_one()
    defaults = dict(row.config_json["default_models"])
    assert defaults["imageModel"] == HY_IMAGE
    assert "image_model" not in defaults
    assert set(defaults) == {"textModel", "imageModel", "videoModel", "audioModel"}


@pytest.mark.asyncio
async def test_patch_unrelated_flat_field_does_not_move_defaults(db_session: AsyncSession) -> None:
    """Chỉ sửa khoá / tham số không kéo theo việc đổi mặc định."""
    await model_settings.load_model_settings_cache(db_session)
    before = model_settings.get_routing_snapshot().default_models
    await model_settings.patch_admin_model_settings(
        db_session, AdminModelSettingsPatch(ark_image_size="2K")
    )
    after = model_settings.get_routing_snapshot().default_models
    assert after == before


@pytest.mark.asyncio
async def test_patch_empty_model_image_does_not_wipe_default(db_session: AsyncSession) -> None:
    """Gửi chuỗi rỗng không được xoá mặc định đang chạy."""
    await model_settings.load_model_settings_cache(db_session)
    before = model_settings.get_routing_snapshot().default_models.image_model
    assert before
    await model_settings.patch_admin_model_settings(db_session, AdminModelSettingsPatch(model_image=""))
    await model_settings.load_model_settings_cache(db_session)
    assert model_settings.get_routing_snapshot().default_models.image_model == before


def test_default_models_roundtrip_keeps_all_capabilities() -> None:
    """`default_models_to_dict` phải giữ đủ bốn năng lực — nếu không thì ghi sẽ mất trường."""
    defaults = DefaultModels(
        text_model="gemini-3-flash-preview",
        image_model=HY_IMAGE,
        video_model="seedance-2-0",
        audio_model="gemini-3.1-flash-tts",
    )
    assert default_models_from_dict(
        {"text_model": "gemini-3-flash-preview", "image_model": HY_IMAGE,
         "video_model": "seedance-2-0", "audio_model": "gemini-3.1-flash-tts"}
    ) == defaults
    # Vòng tròn dict phải giữ nguyên: đường routing ghi camelCase, đường này đọc cả hai.
    assert default_models_from_dict(default_models_to_dict(defaults)) == defaults