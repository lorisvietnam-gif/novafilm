# -*- coding: utf-8 -*-
"""Canvas 参考图 → Seedance 多图参考：四个 chốt chặn 的离线回归。

全程离线：无网络、无上游 token。ark 层用假 httpx 客户端抓提交体；
流水线层用哨兵异常在拿到调用参数后立刻中止，不跑后续落盘逻辑。
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.main import app as main_app
from app.models import Project, ProjectStatus, Shot, ShotStatus, Template
from app.models_tasks import TaskRun
from app.services import pipeline
from app.services.ark import ArkGateway
from app.services.media_ref_limits import MAX_REFERENCE_IMAGES
from app.services.project_reference_images import (
    ReferenceImageError,
    ensure_reference_image_mode,
    merge_video_extra_refs,
    reference_image_budget,
    resolve_project_reference_images,
)
from tests.conftest import make_user

ARK_NATIVE_BASE = "https://ark.cn-beijing.volces.com/api/v3"
STILL = "https://cdn.example.com/shot1.jpg"
PREV_LAST = "https://cdn.example.com/prev_last.jpg"


def _urls(count: int, *, prefix: str = "subject") -> list[str]:
    return [f"https://cdn.example.com/{prefix}{i}.png" for i in range(count)]


# ---------------------------------------------------------------- 请求层校验


def test_no_reference_images_keeps_legacy_behaviour() -> None:
    """不带参考图时返回空列表：不改老流程（老流程本来就没有这一段）。"""
    assert resolve_project_reference_images(None, None) == []
    assert resolve_project_reference_images([], []) == []
    assert resolve_project_reference_images(["  "], [None]) == []


def test_subject_refs_come_first_and_style_board_is_kept() -> None:
    """主体优先，画风板保留一个名额（沿用 style_lock 的分流，不重写）。"""
    subjects = _urls(3)
    style = ["https://cdn.example.com/board.png"]
    assert resolve_project_reference_images(subjects, style) == [*subjects, *style]


def test_duplicate_urls_are_deduped_before_sending() -> None:
    """同一张图重复提交会被上游按张数计，发送前必须去重。"""
    one = "https://cdn.example.com/a.png"
    assert resolve_project_reference_images([one, one, f" {one} "], [one]) == [one]


def test_ten_reference_images_raise_readable_error() -> None:
    """10 张 → 直接报错，绝不悄悄截断成 9 张（截断会让角色画错）。"""
    with pytest.raises(ReferenceImageError) as err:
        resolve_project_reference_images(_urls(10), [])
    message = str(err.value)
    assert "10" in message
    assert str(MAX_REFERENCE_IMAGES) in message


def test_subject_over_per_shot_budget_raises_instead_of_truncating() -> None:
    """没破 9 张总上限，但本镜还要留静帧+衔接尾帧名额；不够就报错，不截断。"""
    budget = reference_image_budget(has_style_ref=False)
    assert budget == MAX_REFERENCE_IMAGES - 2
    assert len(resolve_project_reference_images(_urls(budget), [])) == budget
    with pytest.raises(ReferenceImageError) as err:
        resolve_project_reference_images(_urls(budget + 1), [])
    assert "名额" in str(err.value)


def test_style_board_costs_one_subject_slot() -> None:
    """带画风板时主体名额少一张，且画风板一定排在最后。"""
    assert reference_image_budget(has_style_ref=True) == reference_image_budget(
        has_style_ref=False
    ) - 1
    budget = reference_image_budget(has_style_ref=True)
    subjects = _urls(budget)
    style = ["https://cdn.example.com/board.png"]
    assert resolve_project_reference_images(subjects, style) == [*subjects, *style]
    with pytest.raises(ReferenceImageError):
        resolve_project_reference_images(_urls(budget + 1), style)


def test_non_public_reference_url_is_refused_with_a_readable_message() -> None:
    """Ark 云端拉不到 localhost / data URI；不能让用户以为这张图已经用上了。"""
    for bad in (
        "http://localhost:8000/static/a.png",
        "data:image/png;base64,AAAA",
        "/static/projects/p1/a.png",
    ):
        with pytest.raises(ReferenceImageError) as err:
            resolve_project_reference_images([bad], [])
        assert "公网" in str(err.value)


# ---------------------------------------------------------------- 模式互斥


def test_first_frame_mode_refuses_reference_images() -> None:
    """first_frame 与 reference_image 互斥：报错，不混发。"""
    with pytest.raises(ReferenceImageError) as err:
        ensure_reference_image_mode(None, has_reference=True)
    assert "first_frame" in str(err.value)
    with pytest.raises(ReferenceImageError):
        ensure_reference_image_mode("   ", has_reference=True)
    # 有目标画幅 → 走 reference_image，参考图放行
    ensure_reference_image_mode("9:16", has_reference=True)
    # 没有参考图时 first_frame 完全正常（老流程不受影响）
    ensure_reference_image_mode(None, has_reference=False)


# ------------------------------------------------------- 衔接尾帧 + 参考图合并


def test_merge_video_extra_refs_keeps_continuity_first_and_dedupes() -> None:
    assert merge_video_extra_refs([PREV_LAST], _urls(1) + _urls(1)) == [PREV_LAST, *_urls(1)]
    # 参考图与衔接尾帧撞图时也只算一张
    assert merge_video_extra_refs([PREV_LAST], [PREV_LAST]) == [PREV_LAST]
    assert merge_video_extra_refs(None, []) == []


def test_merge_video_extra_refs_raises_over_nine() -> None:
    """含本镜静帧在内合计超 9 张就报错，不截断。"""
    with pytest.raises(ReferenceImageError) as err:
        merge_video_extra_refs(_urls(8, prefix="prev"), _urls(1, prefix="style"))
    assert str(MAX_REFERENCE_IMAGES) in str(err.value)


# ---------------------------------------------------------------- ark 提交体


class _Resp:
    status_code = 200
    text = ""

    def json(self) -> dict:
        return {"id": "task-1"}


def _install_fake_http(monkeypatch: pytest.MonkeyPatch, captures: list[dict]) -> None:
    class _FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            captures.append(kwargs.get("json") or {})
            return _Resp()

    monkeypatch.setattr("app.services.ark.httpx.AsyncClient", _FakeAsyncClient)

    async def _no_ar_padding(url: str) -> str:
        # 宽高比垫边要下真图；这里只关心提交体，直接透传
        return url

    monkeypatch.setattr(
        "app.services.seedance_image_aspect.ensure_seedance_compatible_image_url",
        _no_ar_padding,
    )


def _gateway(*, native: bool) -> ArkGateway:
    base = ARK_NATIVE_BASE if native else "https://www.tokenfree.com/v1"
    # ark_mock / 缺 key 会让网关走假通道直接返回 mock-task-*，那样就抓不到提交体了。
    # 这里钉死 ark_mock=False 并塞一个占位 key，只为让代码真的去构造请求。
    gw = ArkGateway(
        settings=get_settings().model_copy(
            update={"ark_base_url": base, "ark_mock": False, "ark_api_key": "test-key"}
        )
    )
    # 路由快照要查库；测试里固定走 settings 的 base_url
    gw._resolve_ark_route = lambda *a, **k: None  # type: ignore[method-assign]
    return gw


def _image_urls_in(body: dict) -> list[str]:
    return [
        item["image_url"]["url"]
        for item in body["content"]
        if item.get("type") == "image_url"
    ]


def _image_roles_in(body: dict) -> list[str]:
    return [
        str(item.get("role") or "")
        for item in body["content"]
        if item.get("type") == "image_url"
    ]


@pytest.mark.asyncio
async def test_extra_image_urls_are_sent_as_reference_image(monkeypatch: pytest.MonkeyPatch) -> None:
    """chốt chặn 接线：extra_image_urls 必须以 reference_image 进提交体。"""
    captures: list[dict] = []
    _install_fake_http(monkeypatch, captures)
    gw = _gateway(native=True)
    extras = _urls(2, prefix="ref")

    task_id = await gw.gen_video_i2v(
        STILL, "shot move in", 5, ratio="9:16", extra_image_urls=extras
    )

    assert task_id == "task-1"
    assert len(captures) == 1
    assert _image_urls_in(captures[0]) == [STILL, *extras]
    assert set(_image_roles_in(captures[0])) == {"reference_image"}
    assert captures[0]["ratio"] == "9:16"


@pytest.mark.asyncio
async def test_first_frame_never_mixed_with_reference_image(monkeypatch: pytest.MonkeyPatch) -> None:
    """chốt chặn 2：没有目标画幅时带参考图，也不能出现 first_frame。"""
    captures: list[dict] = []
    _install_fake_http(monkeypatch, captures)
    gw = _gateway(native=True)

    await gw.gen_video_i2v(
        STILL, "shot move in", 5, ratio=None, extra_image_urls=_urls(2, prefix="ref")
    )

    roles = set(_image_roles_in(captures[0]))
    assert "first_frame" not in roles
    assert roles == {"reference_image"}


@pytest.mark.asyncio
async def test_tokenfree_route_puts_all_refs_in_reference_image_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """TokenFree 通道只认 reference_image_urls，不能再写顶层 image/first_frame。"""
    captures: list[dict] = []
    _install_fake_http(monkeypatch, captures)
    gw = _gateway(native=False)
    extras = _urls(3, prefix="ref")

    await gw.gen_video_i2v(STILL, "shot move in", 5, ratio="16:9", extra_image_urls=extras)

    meta_input = captures[0]["metadata"]["input"]
    assert meta_input["reference_image_urls"] == [STILL, *extras]
    assert "first_frame_url" not in meta_input
    assert "image" not in captures[0]
    assert "images" not in captures[0]


@pytest.mark.asyncio
async def test_more_than_nine_images_errors_and_sends_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """chốt chặn 1：合计 10 张时一个请求都不许发出去。"""
    captures: list[dict] = []
    _install_fake_http(monkeypatch, captures)
    gw = _gateway(native=True)

    with pytest.raises(RuntimeError) as err:
        await gw.gen_video_i2v(
            STILL,
            "shot move in",
            5,
            ratio="16:9",
            extra_image_urls=_urls(MAX_REFERENCE_IMAGES, prefix="ref"),
        )
    assert str(MAX_REFERENCE_IMAGES) in str(err.value)
    assert captures == []


@pytest.mark.asyncio
async def test_repeated_reference_urls_are_sent_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """chốt chặn 3：重复 URL、撞到本镜静帧的 URL 都只发一次。"""
    captures: list[dict] = []
    _install_fake_http(monkeypatch, captures)
    gw = _gateway(native=True)
    subject = "https://cdn.example.com/a.png"

    await gw.gen_video_i2v(
        STILL,
        "shot move in",
        5,
        ratio="16:9",
        extra_image_urls=[subject, subject, STILL, f" {subject} "],
    )

    assert _image_urls_in(captures[0]) == [STILL, subject]


@pytest.mark.asyncio
async def test_without_reference_images_payload_is_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """「没有图就不动老流程」：单图 + first_frame + 不传 ratio。"""
    captures: list[dict] = []
    _install_fake_http(monkeypatch, captures)
    gw = _gateway(native=True)

    await gw.gen_video_i2v(STILL, "shot move in", 5, ratio=None)

    body = captures[0]
    assert _image_urls_in(body) == [STILL]
    assert _image_roles_in(body) == ["first_frame"]
    assert "ratio" not in body


# ------------------------------------------------------------ 流水线接线


@asynccontextmanager
async def _same_session(db: AsyncSession):
    """把 pipeline 内自开 session 钉到用例事务。"""
    yield db


class _Stop(BaseException):
    """拿到调用参数就中止；继承 BaseException 才不会被 except Exception 误吞。"""


async def _noop(*_args, **_kwargs) -> None:
    return None


async def _make_project(
    db: AsyncSession,
    *,
    tpl_id: str,
    status: ProjectStatus = ProjectStatus.VIDEOING,
) -> tuple[Project, object]:
    """两镜项目：第一镜已有视频+尾帧，第二镜会真的提交 Seedance。"""
    user = await make_user(db)
    tpl = Template(id=tpl_id, name="参考图模板", style_prefix="x", seedream_config={})
    db.add(tpl)
    await db.flush()
    project = Project(
        user_id=user.id,
        template_id=tpl.id,
        source_text="测试",
        pipeline_mode="full",
        status=status,
    )
    db.add(project)
    await db.flush()
    db.add_all(
        [
            Shot(
                project_id=project.id,
                shot_no=1,
                image_url=STILL,
                video_url="https://cdn.example.com/v1.mp4",
                last_frame_url=PREV_LAST,
                status=ShotStatus.VIDEO_READY,
            ),
            Shot(
                project_id=project.id,
                shot_no=2,
                image_url=STILL,
                status=ShotStatus.IMAGE_READY,
            ),
        ]
    )
    await db.commit()
    return project, user


async def _run_videos(db: AsyncSession, project: Project, **kwargs) -> dict:
    captured: dict = {}

    async def _capture(*_args, **kw):
        captured.update(kw)
        raise _Stop()

    ark = SimpleNamespace(gen_and_wait_video=_capture)
    with (
        patch.object(pipeline, "AsyncSessionLocal", lambda: _same_session(db)),
        patch.object(pipeline, "publish_progress", _noop),
        patch.object(pipeline, "get_ark", return_value=ark),
    ):
        with pytest.raises(_Stop):
            await pipeline._parallel_videos(project.id, **kwargs)
    return captured


@pytest.mark.asyncio
async def test_pipeline_forwards_reference_images_to_seedance(
    db_session: AsyncSession,
) -> None:
    """端到端接线：Canvas 选的参考图要真的进 extra_image_urls。"""
    project, _user = await _make_project(db_session, tpl_id="tpl-ref-1")
    subjects = _urls(2)
    style = ["https://cdn.example.com/board.png"]

    captured = await _run_videos(
        db_session,
        project,
        subject_ref_urls=subjects,
        style_ref_urls=style,
    )

    # 衔接尾帧优先，其次主体参考图，最后画风板
    assert captured["extra_image_urls"] == [PREV_LAST, *subjects, *style]
    assert captured["ratio"] == "16:9"


@pytest.mark.asyncio
async def test_pipeline_without_reference_images_sends_only_continuity(
    db_session: AsyncSession,
) -> None:
    """老流程不受影响：没有参考图时仍然只带上一镜尾帧。"""
    project, _user = await _make_project(db_session, tpl_id="tpl-ref-2")

    captured = await _run_videos(db_session, project)

    assert captured["extra_image_urls"] == [PREV_LAST]


@pytest.mark.asyncio
async def test_pipeline_refuses_first_frame_mode_with_reference_images(
    db_session: AsyncSession,
) -> None:
    """画幅为空退回 first_frame 时，带参考图必须报错而不是混发。"""
    project, _user = await _make_project(db_session, tpl_id="tpl-ref-2b")

    async def _boom(*_args, **_kwargs):
        raise AssertionError("first_frame 模式不得再提交 Seedance")

    ark = SimpleNamespace(gen_and_wait_video=_boom)
    settings = get_settings().model_copy(update={"ark_video_ratio": ""})
    with (
        patch.object(pipeline, "AsyncSessionLocal", lambda: _same_session(db_session)),
        patch.object(pipeline, "publish_progress", _noop),
        patch.object(pipeline, "get_ark", return_value=ark),
        patch.object(pipeline, "get_settings", return_value=settings),
        patch.object(pipeline, "_project_output_ratio", lambda _p: ""),
    ):
        with pytest.raises(ReferenceImageError):
            await pipeline._parallel_videos(
                project.id,
                subject_ref_urls=_urls(1),
            )


# ------------------------------------------------------------ 生成接口接线


@asynccontextmanager
async def _auth_client(db: AsyncSession, user):
    async def _override_db():
        yield db

    main_app.dependency_overrides[get_db] = _override_db
    main_app.dependency_overrides[get_current_user] = lambda: user
    try:
        transport = httpx.ASGITransport(app=main_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
    finally:
        main_app.dependency_overrides.pop(get_db, None)
        main_app.dependency_overrides.pop(get_current_user, None)


async def _latest_pipeline_task(db: AsyncSession, project_id: int) -> TaskRun:
    result = await db.execute(
        select(TaskRun).where(
            TaskRun.project_id == project_id,
            TaskRun.task_type == "project_pipeline",
        )
    )
    return result.scalar_one()


@pytest.mark.asyncio
async def test_generate_without_body_still_accepts_query_restart(
    db_session: AsyncSession,
) -> None:
    """老客户端只发 ?restart=true 且不带 body，必须照旧能跑（向后兼容）。"""
    project, user = await _make_project(
        db_session, tpl_id="tpl-ref-3", status=ProjectStatus.DRAFT
    )

    async with _auth_client(db_session, user) as client:
        res = await client.post(f"/api/projects/{project.id}/generate?restart=true")

    assert res.status_code == 200, res.text
    task = await _latest_pipeline_task(db_session, project.id)
    assert task.payload["restart"] is True
    assert task.payload["subject_ref_urls"] == []
    assert task.payload["style_ref_urls"] == []


@pytest.mark.asyncio
async def test_generate_body_reference_images_reach_task_payload(
    db_session: AsyncSession,
) -> None:
    """有 body 时参考图随任务下发，流水线才拿得到。"""
    project, user = await _make_project(
        db_session, tpl_id="tpl-ref-4", status=ProjectStatus.DRAFT
    )
    subjects = _urls(2)
    style = ["https://cdn.example.com/board.png"]

    async with _auth_client(db_session, user) as client:
        res = await client.post(
            f"/api/projects/{project.id}/generate",
            json={"restart": True, "subject_ref_urls": subjects, "style_ref_urls": style},
        )

    assert res.status_code == 200, res.text
    task = await _latest_pipeline_task(db_session, project.id)
    assert task.payload["subject_ref_urls"] == subjects
    assert task.payload["style_ref_urls"] == style


@pytest.mark.asyncio
async def test_generate_rejects_non_public_reference_url(db_session: AsyncSession) -> None:
    """不可公网访问的图要当场报错，而不是建完任务才失败。"""
    project, user = await _make_project(
        db_session, tpl_id="tpl-ref-5", status=ProjectStatus.DRAFT
    )

    async with _auth_client(db_session, user) as client:
        res = await client.post(
            f"/api/projects/{project.id}/generate",
            json={"subject_ref_urls": ["http://localhost:8000/static/a.png"]},
        )

    assert res.status_code == 400
    assert "公网" in res.text
    tasks = (
        await db_session.execute(select(TaskRun).where(TaskRun.project_id == project.id))
    ).scalars().all()
    assert tasks == []