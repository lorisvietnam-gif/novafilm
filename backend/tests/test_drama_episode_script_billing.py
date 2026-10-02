"""分集剧本生成的用量落账必须归属到 task_run_id（回归）。

背景（实测，2026-10-02，真实库 + 真实 HTTP `POST /api/drama/agents/episode_script`）：
  task 737  force=false  -> 35ms，无 LLM 调用，charged=0 refunded=48（正确，未用到额度）
  task 738  单集 full    -> 76s，charged=40 refunded=8，usage_events#20 task_run_id=738
  task 739  force=true   -> 95s，charged=40 refunded=8，usage_events#21 task_run_id=739

即 episode_script 两条分支本来就写 llm_chat 用量行。若这行不落到 task_run_id 上，
`settle_task` 扫不到事件就会把整笔预扣当退款（task 711 就是 48 全退）。本测试锁死
"用量行必须归属 task + 只按实际用量收费、多退差额" 这条契约。
"""
from __future__ import annotations

from contextlib import AsyncExitStack, asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models import UsageEvent
from app.models_drama import DramaProject, DramaScript
from app.services.billing.context import billing_scope
from app.services.billing.pricing import charge_fen_for_tokens
from app.services.billing.settlement import freeze_for_task, settle_task

from tests.conftest import make_task, make_user

# 正文字符数需达到 MIN_EPISODE_CONTENT_CHARS 才会被算作"已完成"
DONE_BODY = "Tap mot noi dung manh. " * 60


@asynccontextmanager
async def _same_session(db: AsyncSession):
    """把 jobs 内自开 session 钉到用例事务，避免真实落库。"""
    yield db


async def _make_project(
    db: AsyncSession,
    user,
    *,
    body: str = "",
    creative: str = "",
) -> DramaProject:
    project = DramaProject(user_id=user.id, title="分集剧本计费回归")
    db.add(project)
    await db.flush()
    script = DramaScript(
        project_id=project.id,
        source="Một người lạ tìm thấy mảnh giấy trong chuyến xe hoa tốc.",
        summary={"logline": "test", "episodeCount": 1},
        episode_content={
            "episodes": [
                {"episodeNumber": 1, "title": "Tap 1", "body": body, "creative": creative}
            ]
        },
        params={"episode_count": 1},
    )
    db.add(script)
    await db.flush()
    return project


def _llm_price_fen() -> int:
    """一次 llm_chat 调用的真实单价（不含预估 buffer）。"""
    s = get_settings()
    _, charge = charge_fen_for_tokens(int(s.billing_est_llm_tokens), "llm_chat", settings=s)
    return int(charge)


async def _usage_rows(db: AsyncSession, task_id: int) -> list[UsageEvent]:
    return list(
        (
            await db.execute(
                select(UsageEvent).where(UsageEvent.task_run_id == task_id).order_by(UsageEvent.id)
            )
        )
        .scalars()
        .all()
    )


async def _warm_project(db: AsyncSession, project: DramaProject) -> DramaProject:
    """预载 project.script，避免 job 内 db.get(options=selectinload) 走同步 IO。"""
    return (
        await db.execute(
            select(DramaProject)
            .where(DramaProject.id == project.id)
            .options(selectinload(DramaProject.script))
        )
    ).scalar_one()


async def _seed_frozen_task(
    db: AsyncSession,
    user,
    project: DramaProject,
    *,
    payload: dict,
) -> tuple:
    task = await make_task(db, user, domain="drama", task_type="episode_script")
    task.drama_project_id = project.id
    task.payload = payload
    await db.commit()
    frozen = await freeze_for_task(db, task)
    await db.commit()
    return task, frozen


async def _seed_result(*_args, **_kwargs):
    class _Result:
        created_count = 0
        reused_count = 0

    return _Result()


@pytest.mark.asyncio
async def test_episode_script_all_episodes_records_usage_on_task(db_session: AsyncSession) -> None:
    """全集生成分支：生成一集正文 ⇒ 用量行归属 task，charged=单价，refunded=差额。"""
    settings = get_settings()
    # 恢复生产 buffer 1.2，否则 est==charged，退差额这条契约无法断言
    # （conftest 的 billing_enabled fixture 把它置成 1.0）
    original_buffer = settings.billing_estimate_buffer
    settings.billing_estimate_buffer = 1.2

    user = await make_user(db_session)
    project = await _make_project(db_session, user)
    task, frozen = await _seed_frozen_task(
        db_session,
        user,
        project,
        payload={"project_id": project.id, "force": False, "total": 1, "episode_number": None},
    )

    async def _fake_batch(_summary, _existing, **_kwargs):
        return [{"episodeNumber": 1, "title": "Tap 1", "body": DONE_BODY}]

    async def _fake_outline(_creative, _summary, existing, _total):
        return existing, False

    try:
        async with AsyncExitStack() as stack:
            stack.enter_context(
                patch("app.services.drama.jobs.AsyncSessionLocal", lambda: _same_session(db_session))
            )
            stack.enter_context(
                patch("app.services.drama.jobs.run_episode_script_batch", _fake_batch)
            )
            stack.enter_context(
                patch("app.services.drama.jobs.ensure_episode_outline", _fake_outline)
            )
            await _warm_project(db_session, project)
            await stack.enter_async_context(billing_scope(task.id))

            from app.services.drama.jobs import run_episode_scripts_job

            result = await run_episode_scripts_job(
                project_id=project.id,
                force=False,
                task_id=task.id,
            )
        assert result["ok"] is True

        rows = await _usage_rows(db_session, task.id)
        assert len(rows) == 1, "全集生成必须写且只写一行 llm_chat 用量"
        row = rows[0]
        assert row.task_run_id == task.id
        assert row.billing_key == "llm_chat"
        assert row.domain == "drama"
        assert row.drama_project_id == project.id
        assert row.estimated is True
        price = _llm_price_fen()
        assert int(row.charge_fen) == price
        assert int(row.cost_fen) == price

        out = await settle_task(db_session, task.id)
        await db_session.commit()

        # 关键回归：按实际用量收费，不把预扣估算当实收（也不反向抬到估算值）
        assert out["charged"] == price > 0
        assert out["refunded"] == frozen - price
        assert frozen > out["charged"], "预扣含 buffer，结算必须退差额（多退少补）"
        assert int(task.billing_estimate_fen) == frozen
        assert int(task.billing_charged_fen) == price
        assert int(task.billing_refunded_fen) == frozen - price
        assert task.billing_status == "settled"
        assert (await _usage_rows(db_session, task.id))[0].settled is True
    finally:
        settings.billing_estimate_buffer = original_buffer


@pytest.mark.asyncio
async def test_episode_script_single_episode_records_usage_on_task(db_session: AsyncSession) -> None:
    """单集生成分支（episode_number 有值）：同样必须写用量行并按单价结算。"""
    user = await make_user(db_session)
    project = await _make_project(
        db_session,
        user,
        creative="Mot nguoi dan ong phat hien manh bi an gia trong chuyen xe hoa toc bien.",
    )
    task, _frozen = await _seed_frozen_task(
        db_session,
        user,
        project,
        payload={
            "project_id": project.id,
            "force": False,
            "total": 1,
            "episode_number": 1,
            "generate_mode": "full",
        },
    )

    async def _fake_full(_summary, _existing, number, _creative, **_kwargs):
        return [{"episodeNumber": number, "title": "Tap 1", "body": DONE_BODY}]

    async with AsyncExitStack() as stack:
        stack.enter_context(
            patch("app.services.drama.jobs.AsyncSessionLocal", lambda: _same_session(db_session))
        )
        stack.enter_context(
            patch("app.services.drama.jobs.run_episode_full_from_creative", _fake_full)
        )
        stack.enter_context(
            patch("app.services.drama.jobs.seed_assets_from_episode_body", _seed_result)
        )
        await _warm_project(db_session, project)
        await stack.enter_async_context(billing_scope(task.id))

        from app.services.drama.jobs import run_episode_scripts_job

        result = await run_episode_scripts_job(
            project_id=project.id,
            force=False,
            task_id=task.id,
            episode_number=1,
            generate_mode="full",
        )
    assert result["ok"] is True

    rows = await _usage_rows(db_session, task.id)
    assert len(rows) == 1, "单集生成必须写且只写一行 llm_chat 用量"
    assert rows[0].task_run_id == task.id
    assert rows[0].billing_key == "llm_chat"

    out = await settle_task(db_session, task.id)
    await db_session.commit()
    price = _llm_price_fen()
    assert out["charged"] == price > 0
    assert out["refunded"] == int(task.billing_estimate_fen) - price


@pytest.mark.asyncio
async def test_episode_script_no_llm_call_charges_nothing(db_session: AsyncSession) -> None:
    """没有 LLM 调用（正文已达标）时不写用量，结算必须整笔退回，不误收。

    这正是 task 711 的形状：任务 35ms 就完成，压根没调模型。
    """
    from app.services.drama.agents import count_completed_episodes

    user = await make_user(db_session)
    project = await _make_project(db_session, user, body=DONE_BODY)
    assert count_completed_episodes([{"episodeNumber": 1, "body": DONE_BODY}], 1) == 1, (
        "用例前提：正文已达标，自动流水线视为无待生成集"
    )
    task, frozen = await _seed_frozen_task(
        db_session,
        user,
        project,
        payload={"project_id": project.id, "force": False, "total": 1, "episode_number": None},
    )

    async with AsyncExitStack() as stack:
        stack.enter_context(
            patch("app.services.drama.jobs.AsyncSessionLocal", lambda: _same_session(db_session))
        )
        await _warm_project(db_session, project)
        await stack.enter_async_context(billing_scope(task.id))

        from app.services.drama.jobs import run_episode_scripts_job

        result = await run_episode_scripts_job(
            project_id=project.id,
            force=False,
            task_id=task.id,
        )
    assert result["ok"] is True

    assert await _usage_rows(db_session, task.id) == []
    out = await settle_task(db_session, task.id)
    await db_session.commit()
    assert out["charged"] == 0
    assert out["refunded"] == frozen
    assert task.billing_status == "settled"