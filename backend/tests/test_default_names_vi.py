"""Tên mặc định do hệ thống tự đặt phải là tiếng Việt, không phải tiếng Trung.

Những tên này nằm thẳng trong cột database và được hiển thị nguyên văn ở UI, nên
đọc mã nguồn không đủ: phải insert rồi đọc lại từ DB. Bộ test này khóa cả hai
chiều — tên mặc định mới là tiếng Việt, và logic đặt tên tự động vẫn coi tên mặc
định (kể cả bản cũ đã nằm sẵn trong database) là "chưa có tên người dùng".
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.models import Project, Template
from app.models_drama import DramaAsset, DramaProject
from app.schemas import ProjectCreate
from app.schemas_drama import DramaProjectCreate, DramaVoiceGenerateRequest
from app.services.drama import generation as drama_gen
from app.services.drama.agents import pick_auto_project_title


def _has_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


async def _stored(db, model, column: str, row_id):
    return (await db.execute(select(model.__table__.c[column]).where(model.id == row_id))).scalar_one()


@pytest.mark.asyncio
async def test_asset_created_without_name_is_stored_in_vietnamese(db_session) -> None:
    """Asset sinh ảnh mà không truyền `name` ⇒ tên lưu vào DB phải là tiếng Việt."""
    from tests.conftest import make_user

    user = await make_user(db_session)
    project = DramaProject(user_id=user.id, title="P")
    db_session.add(project)
    await db_session.flush()

    fake_ark = SimpleNamespace(
        gen_image=AsyncMock(
            return_value=SimpleNamespace(
                local_url="/static/generated/p1/a.png", remote_url="http://up/a.png"
            )
        )
    )
    with (
        patch.object(drama_gen, "get_ark", return_value=fake_ark),
        patch.object(drama_gen, "record_seedream_image_usage", AsyncMock()),
        patch("app.services.storage.republish_url", lambda url, *, sync=True: None),
    ):
        asset = await drama_gen.generate_asset_image(
            db_session, user, project, "một chú mèo", kind="character"
        )

    stored = await _stored(db_session, DramaAsset, "name", asset.id)
    assert stored == "Tài sản chưa đặt tên"
    assert not _has_cjk(stored)


@pytest.mark.asyncio
async def test_voice_asset_created_without_name_is_stored_in_vietnamese(db_session) -> None:
    """Cùng luật cho endpoint tạo giọng đọc."""
    from app.api.drama import generation as drama_api_gen
    from tests.conftest import make_user

    user = await make_user(db_session)
    project = DramaProject(user_id=user.id, title="P")
    db_session.add(project)
    await db_session.commit()

    async def _fake_synth(db, _user, _project, asset, **_kwargs):
        return asset

    with patch.object(drama_api_gen, "generate_voice_asset_audio", _fake_synth):
        out = await drama_api_gen.generate_voice(
            body=DramaVoiceGenerateRequest(project_id=project.id, voice_prompt="giọng nữ trẻ"),
            db=db_session,
            user=user,
        )

    stored = out["asset"]["name"]
    assert stored == "Giọng đọc chưa đặt tên"
    assert not _has_cjk(stored)


@pytest.mark.asyncio
async def test_model_column_defaults_are_vietnamese(db_session) -> None:
    """Default của cột model là thứ thực sự rơi vào database khi client không gửi tên."""
    from tests.conftest import make_user

    user = await make_user(db_session)
    tpl = Template(id="tpl-vi-default", name="T", style_prefix="x")
    db_session.add(tpl)
    await db_session.flush()

    project = Project(user_id=user.id, template_id=tpl.id, source_text="một câu chuyện ngắn")
    drama = DramaProject(user_id=user.id)
    db_session.add_all([project, drama])
    await db_session.commit()

    project_title = await _stored(db_session, Project, "title", project.id)
    drama_title = await _stored(db_session, DramaProject, "title", drama.id)
    assert project_title == "Chưa có tên"
    assert drama_title == "Dự án drama chưa có tên"
    assert not _has_cjk(project_title)
    assert not _has_cjk(drama_title)


def test_request_schema_defaults_are_vietnamese() -> None:
    assert ProjectCreate(template_id="tpl-vi", source_text="abc").title == "Chưa có tên"
    assert DramaProjectCreate().title == "Dự án drama chưa có tên"


@pytest.mark.parametrize(
    "current",
    [
        "Dự án drama chưa có tên",
        "Dự án bảng vẽ tự do",
        # Dữ liệu cũ đã nằm trong database; đổi mã nguồn không đổi dữ liệu cũ.
        "未命名漫剧",
        "自由画布项目",
    ],
)
def test_default_titles_are_still_auto_renamed(current: str) -> None:
    summary = {"seriesTitle": "Trăng Đi Theo Mình"}
    assert (
        pick_auto_project_title(
            summary, creative="một đoạn创意文案 đủ dài để làm tiền tố", current_title=current
        )
        == "Trăng Đi Theo Mình"
    )


def test_user_renamed_title_is_not_overwritten() -> None:
    summary = {"seriesTitle": "Trăng Đi Theo Mình"}
    assert (
        pick_auto_project_title(
            summary, creative="một đoạn创意文案 đủ dài", current_title="Tên tôi tự đặt"
        )
        is None
    )
