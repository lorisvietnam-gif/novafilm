"""Ghi xong mà `episode_content` không đổi ⇒ **hoàn tiền + báo lỗi**, tuyệt đối không settle.

Nguyên tắc này không bắt được bằng `try/except`. LLM không ném exception: nó trả
rác, parser nuốt rác, không có gì để bắt. Cách duy nhất biết một lần gọi có ghi
được gì là so `episode_content` trước và sau.

Và phải so **trước khi** ghi dòng `usage_events`: `settle_task` chấm tiền theo
`usage_events`, nên dòng đó đã nằm trong bảng thì task fail vẫn thu được tiền
(đo thật: task 788 `failed` mà vẫn `charged=320`, 8 dòng `llm_chat`).

Hai hình dạng bị chặn ở đây:
  1. LLM trả về đúng nội dung cũ ⇒ merge ra y hệt ⇒ mất tiền mà không có gì mới.
  2. `run_episode_script_batch` trả `[]` (không còn tập thiếu) ⇒ cũng phải báo lỗi,
     **không** được ghi tiền rồi mới `raise` như code cũ.
"""

from __future__ import annotations

import hashlib
from contextlib import AsyncExitStack, asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import UsageEvent
from app.models_drama import DramaProject, DramaScript
from app.services.billing.context import billing_scope
from app.services.billing.settlement import freeze_for_task, settle_task
from app.services.drama.jobs import (
    _episode_content_fingerprint,
    _episode_record_fingerprint,
)

from tests.conftest import make_task, make_user

DONE_BODY = "Một nội dung đủ dài để qua ngưỡng. " * 40


@asynccontextmanager
async def _same_session(db: AsyncSession):
    yield db


async def _make_project(db: AsyncSession, user, *, body: str = "") -> DramaProject:
    project = DramaProject(user_id=user.id, title="episode no-write guard")
    db.add(project)
    await db.flush()
    script = DramaScript(
        project_id=project.id,
        source="Một người lạ tìm thấy mảnh giấy trong chuyến xe hoa tốc.",
        summary={"logline": "test", "episodeCount": 1},
        episode_content={
            "episodes": [{"episodeNumber": 1, "title": "Tap 1", "body": body}]
        },
        params={"episode_count": 1, "locale": "vi"},
    )
    db.add(script)
    await db.flush()
    return project


async def _seed_frozen(db: AsyncSession, user, project: DramaProject):
    task = await make_task(db, user, domain="drama", task_type="episode_script")
    task.drama_project_id = project.id
    task.payload = {"project_id": project.id, "force": False, "total": 1, "episode_number": None}
    await db.commit()
    frozen = await freeze_for_task(db, task)
    await db.commit()
    return task, frozen


async def _warm(db: AsyncSession, project: DramaProject) -> DramaProject:
    return (
        await db.execute(
            select(DramaProject)
            .where(DramaProject.id == project.id)
            .options(selectinload(DramaProject.script))
        )
    ).scalar_one()


async def _usage_rows(db: AsyncSession, task_id: int) -> list[UsageEvent]:
    return list(
        (
            await db.execute(
                select(UsageEvent)
                .where(UsageEvent.task_run_id == task_id)
                .order_by(UsageEvent.id)
            )
        )
        .scalars()
        .all()
    )


async def _run_job(db: AsyncSession, task, project: DramaProject, *, fake_batch, fake_outline=None):
    async def _no_outline(_creative, _summary, existing, _total, **_kwargs):
        return existing, False

    async with AsyncExitStack() as stack:
        stack.enter_context(
            patch("app.services.drama.jobs.AsyncSessionLocal", lambda: _same_session(db))
        )
        stack.enter_context(patch("app.services.drama.jobs.run_episode_script_batch", fake_batch))
        stack.enter_context(
            patch(
                "app.services.drama.jobs.ensure_episode_outline",
                fake_outline or _no_outline,
            )
        )
        await _warm(db, project)
        await stack.enter_async_context(billing_scope(task.id))

        from app.services.drama.jobs import run_episode_scripts_job

        return await run_episode_scripts_job(
            project_id=project.id, force=False, task_id=task.id
        )


# --- fingerprint helpers --------------------------------------------------------


def test_fingerprint_notices_a_changed_body():
    before = [{"episodeNumber": 1, "body": "a" * 600}]
    after = [{"episodeNumber": 1, "body": "b" * 600}]
    assert _episode_content_fingerprint(before) != _episode_content_fingerprint(after)


def test_fingerprint_ignores_reordering_and_derived_fields():
    """Thứ tự và `creative`/`summary` không phải nội dung; đổi chúng không có nghĩa là đã viết."""
    a = [{"episodeNumber": 1, "body": "x" * 600, "creative": "A"}]
    b = [{"episodeNumber": 1, "body": "x" * 600, "creative": "B"}]
    assert _episode_content_fingerprint(a) == _episode_content_fingerprint(b)

    c = [{"episodeNumber": 2, "body": "y"}, {"episodeNumber": 1, "body": "x"}]
    d = [{"episodeNumber": 1, "body": "x"}, {"episodeNumber": 2, "body": "y"}]
    assert _episode_content_fingerprint(c) == _episode_content_fingerprint(d)


def test_record_fingerprint_sees_summary_mode_changes():
    """`summary` 模式只回填创意与摘要，正文理应不变 —— 所以它要比整条记录。"""
    before = {"episodeNumber": 1, "body": "x" * 600, "summary": "cũ"}
    after = {"episodeNumber": 1, "body": "x" * 600, "summary": "mới"}
    assert _episode_record_fingerprint(before) != _episode_record_fingerprint(after)


def test_record_fingerprint_survives_a_missing_episode():
    """Tập chưa tồn tại thì phải cho một giá trị ổn định, không ném."""
    for value in (None, [], {}, "x", 7):
        assert isinstance(_episode_record_fingerprint(value), str)
        assert _episode_record_fingerprint(value) == _episode_record_fingerprint(value)


# --- the guarantee --------------------------------------------------------------


@pytest.mark.asyncio
async def test_llm_returning_the_old_text_refunds_everything(db_session: AsyncSession) -> None:
    """LLM trả lại đúng nội dung cũ ⇒ không có gì mới ⇒ hoàn tiền, ví không đổi."""
    # Phải **dưới** ngưỡng, nếu không `auto_missing_episode_numbers` thấy không thiếu
    # tập nào và vòng lặp không gọi LLM — vô nghĩa. Mô phỏng đúng hình dạng thật: model
    # trả lại y hệt (hoặc rác ngắn hơn) nội dung đang có, nên merge không đổi gì.
    old = "Nội dung cũ đã có sẵn."
    user = await make_user(db_session)
    project = await _make_project(db_session, user, body=old)
    task, frozen = await _seed_frozen(db_session, user, project)
    balance_before = int(user.balance_fen or 0)

    async def _same_text_batch(_summary, _existing, **_kwargs):
        # Đúng bằng cái đang lưu ⇒ merge ra y hệt ⇒ coi như không viết gì.
        return [{"episodeNumber": 1, "title": "Tap 1", "body": old}]

    result = await _run_job(db_session, task, project, fake_batch=_same_text_batch)

    assert result["ok"] is False, "ghi không được gì thì không được báo thành công"
    assert "episode_content" in str(result["error"])

    assert await _usage_rows(db_session, task.id) == [], (
        "không được ghi dòng usage: settle_task chi theo usage_events, "
        "ghi rồi thì fail vẫn thu được tiền"
    )

    out = await settle_task(db_session, task.id)
    await db_session.commit()
    assert out["charged"] == 0
    assert out["refunded"] == frozen
    assert int(user.balance_fen or 0) == balance_before + frozen, "ví phải được hoàn đủ"


@pytest.mark.asyncio
async def test_empty_batch_refunds_instead_of_charging(db_session: AsyncSession) -> None:
    """`run_episode_script_batch` trả `[]` ⇒ code cũ ghi tiền rồi mới `raise`.

    Đây là lỗi *thứ tự*: `record_line` chạy trước `raise RuntimeError("分集生成无进度")`,
    nên task fail mà vẫn mất tiền. Sửa ở đây: raise trước, không bao giờ ghi dòng.
    """
    user = await make_user(db_session)
    project = await _make_project(db_session, user, body="")
    task, frozen = await _seed_frozen(db_session, user, project)
    balance_before = int(user.balance_fen or 0)

    async def _empty_batch(_summary, _existing, **_kwargs):
        return []

    result = await _run_job(db_session, task, project, fake_batch=_empty_batch)

    assert result["ok"] is False
    assert "无进度" in str(result["error"])
    assert await _usage_rows(db_session, task.id) == []

    out = await settle_task(db_session, task.id)
    await db_session.commit()
    assert out["charged"] == 0
    assert out["refunded"] == frozen
    assert int(user.balance_fen or 0) == balance_before + frozen


@pytest.mark.asyncio
async def test_writing_something_real_still_charges(db_session: AsyncSession) -> None:
    """Chốt lại phía bên kia: viết thật thì vẫn thu tiền như cũ."""
    user = await make_user(db_session)
    project = await _make_project(db_session, user, body="")
    task, _frozen = await _seed_frozen(db_session, user, project)

    async def _good_batch(_summary, _existing, **_kwargs):
        return [{"episodeNumber": 1, "title": "Tap 1", "body": DONE_BODY}]

    result = await _run_job(db_session, task, project, fake_batch=_good_batch)

    assert result["ok"] is True
    rows = await _usage_rows(db_session, task.id)
    assert len(rows) == 1, "viết thật thì phải ghi đúng một dòng llm_chat"
    assert rows[0].task_run_id == task.id
    assert rows[0].charge_fen > 0


@pytest.mark.asyncio
async def test_nothing_to_do_is_still_a_success_with_no_charge(db_session: AsyncSession) -> None:
    """正文 đã đạt ⇒ không có gì để sinh ⇒ **thành công**, không phải lỗi.

    Đây là hợp đồng cũ (`test_episode_script_no_llm_call_charges_nothing`): báo lỗi cho
    người dùng khi nội dung của họ đã đủ là sai. Vì vậy chốt bảo vệ chỉ bắn khi
    **đã tiêu tiền mà vẫn không viết gì**; không tiêu thì không báo lỗi.
    """
    from app.services.drama.agents import count_completed_episodes

    user = await make_user(db_session)
    project = await _make_project(db_session, user, body=DONE_BODY)
    assert count_completed_episodes([{"episodeNumber": 1, "body": DONE_BODY}], 1) == 1
    task, frozen = await _seed_frozen(db_session, user, project)

    async def _never_called(*_args, **_kwargs):  # pragma: no cover - phải không chạy
        raise AssertionError("không được gọi LLM khi đã đủ nội dung")

    result = await _run_job(db_session, task, project, fake_batch=_never_called)

    assert result["ok"] is True, "không có việc để làm thì không phải lỗi"
    assert await _usage_rows(db_session, task.id) == []
    out = await settle_task(db_session, task.id)
    await db_session.commit()
    assert out["charged"] == 0
    assert out["refunded"] == frozen


# --- locale phải đi từ job xuống prompt ----------------------------------------


@pytest.mark.asyncio
async def test_job_passes_the_project_locale_down(db_session: AsyncSession) -> None:
    """`project.params.locale` phải tới được `run_episode_script_batch`.

    Đây là đường gây ra project 28: locale=vi nhưng prompt không nhận locale nên ra
    tiếng Trung. Test khóa việc nối dây, không khóa nội dung prompt (việc đó của
    `test_episode_prompt_locale.py`).
    """
    user = await make_user(db_session)
    project = await _make_project(db_session, user, body="")
    task, _frozen = await _seed_frozen(db_session, user, project)
    seen: list[str] = []

    async def _capture(_summary, _existing, **kwargs):
        seen.append(kwargs.get("locale", ""))
        return [{"episodeNumber": 1, "title": "Tap 1", "body": DONE_BODY}]

    result = await _run_job(db_session, task, project, fake_batch=_capture)

    assert result["ok"] is True
    assert seen == ["vi"], "job phải truyền locale của project xuống prompt builder"


@pytest.mark.asyncio
async def test_job_falls_back_to_settings_default_locale(db_session: AsyncSession) -> None:
    """Dự án cũ không có `params.locale` ⇒ rơi về `settings.default_locale`, không phải ""."""
    from app.config import get_settings

    user = await make_user(db_session)
    project = await _make_project(db_session, user, body="")
    project.params = {"episode_count": 1}  # không có locale
    await db_session.flush()
    task, _frozen = await _seed_frozen(db_session, user, project)
    seen: list[str] = []

    async def _capture(_summary, _existing, **kwargs):
        seen.append(kwargs.get("locale", ""))
        return [{"episodeNumber": 1, "title": "Tap 1", "body": DONE_BODY}]

    result = await _run_job(db_session, task, project, fake_batch=_capture)

    assert result["ok"] is True
    assert seen == [get_settings().default_locale]


@pytest.mark.asyncio
async def test_single_episode_refuses_to_settle_when_it_writes_nothing(
    db_session: AsyncSession,
) -> None:
    """Đường một tập phải có chốt chặn tương tự — nếu không thì lỗ hổng chỉ kín một nửa."""
    user = await make_user(db_session)
    project = await _make_project(db_session, user, body="cũ" * 200)
    task = await make_task(db_session, user, domain="drama", task_type="episode_script")
    task.drama_project_id = project.id
    task.payload = {
        "project_id": project.id,
        "episode_number": 1,
        "generate_mode": "full",
    }
    await db_session.commit()
    frozen = await freeze_for_task(db_session, task)
    await db_session.commit()
    balance_before = int(user.balance_fen or 0)

    async def _same_body(_summary, _existing, number, _creative, **_kwargs):
        return [{"episodeNumber": number, "title": "Tap 1", "body": "cũ" * 200}]

    async def _no_seed(*_args, **_kwargs):
        class _R:
            created_count = 0
            reused_count = 0

        return _R()

    async with AsyncExitStack() as stack:
        stack.enter_context(
            patch("app.services.drama.jobs.AsyncSessionLocal", lambda: _same_session(db_session))
        )
        stack.enter_context(
            patch("app.services.drama.jobs.run_episode_full_from_creative", _same_body)
        )
        stack.enter_context(
            patch("app.services.drama.jobs.seed_assets_from_episode_body", _no_seed)
        )
        await _warm(db_session, project)
        await stack.enter_async_context(billing_scope(task.id))

        from app.services.drama.jobs import run_episode_scripts_job

        result = await run_episode_scripts_job(
            project_id=project.id,
            force=False,
            task_id=task.id,
            episode_number=1,
            generate_mode="full",
        )

    assert result["ok"] is False
    assert await _usage_rows(db_session, task.id) == []
    out = await settle_task(db_session, task.id)
    await db_session.commit()
    assert out["charged"] == 0
    assert out["refunded"] == frozen
    assert int(user.balance_fen or 0) == balance_before + frozen
    assert hashlib.sha1(b"").hexdigest()  # giữ import có ý nghĩa rõ ràng