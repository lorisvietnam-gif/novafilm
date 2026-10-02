"""参考图超限的报错必须真的到达用户面前，而不是只躺在日志里。

这是"不悄悄截断"的**后半程**。前半程（``tokenfree_video`` / ``ark`` 改成报错而不是
截断）测的是"有没有报错"；这里测的是"报错有没有送到用户眼前"。两件事分开证明，
因为截断的报错了、但错误在某一层被吞掉，行为上跟没修一模一样。

真实的 Canvas 链路：
    gen_video_seedance_body / gen_and_wait_seedance_body
      → drama jobs → tasks/executor.execute_task_run
      → GET /api/tasks/{id}.error_message
      → GET /api/drama/episodes/{id} → frag.params.generation.error
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models_tasks import TaskStep
from app.services.media_ref_limits import MAX_REFERENCE_IMAGES, ReferenceImageError
from app.services.tasks.executor import execute_task_run
from app.services.tasks.service import get_task_for_runtime

from tests.conftest import make_task, make_user


def _over_limit_message(count: int = MAX_REFERENCE_IMAGES + 1) -> str:
    """和 media_ref_limits 里真正抛出的文案保持一致。"""
    from app.services.media_ref_limits import ensure_within_reference_image_limit

    with pytest.raises(ReferenceImageError) as err:
        ensure_within_reference_image_limit(
            [f"https://cdn.example.com/{i}.png" for i in range(count)]
        )
    return str(err.value)


@pytest.mark.asyncio
async def test_executor_records_reference_image_error_for_polling(
    db_session: AsyncSession,
) -> None:
    """后台任务里抛 ReferenceImageError：TaskRun 必须 failed，且带可读文案。

    这条是 ``GET /api/tasks/{id}`` 读的那两个字段。前端拿 ``error_message`` 直接
    显示，所以这里断言文案里必须有「几张图 / 会被丢掉几张」这些信息。
    """
    from app.services.tasks.handlers import TaskHandler

    user = await make_user(db_session, balance_fen=50_000)
    task = await make_task(
        db_session,
        user,
        domain="drama",
        task_type="fragment_video",
        status="leased",
    )
    db_session.add(TaskStep(task_id=task.id, step_key="main", step_type="run", status="pending"))
    await db_session.commit()
    task_id = int(task.id)
    expected = _over_limit_message()

    async def _raising_executor(_task):
        raise ReferenceImageError(expected)

    @asynccontextmanager
    async def same_session():
        yield db_session

    fake = TaskHandler("drama", "fragment_video", _raising_executor)
    with (
        patch("app.services.tasks.executor.AsyncSessionLocal", same_session),
        patch("app.services.tasks.executor.get_task_handler", return_value=fake),
    ):
        await execute_task_run(task_id)

    db_session.expire_all()
    done = await get_task_for_runtime(db_session, task_id)
    assert done is not None
    assert done.status == "failed"
    assert done.error_code == "ReferenceImageError"
    message = done.error_message or ""
    # 文案要能让人知道是"图太多"而不是"服务坏了"
    assert "ảnh" in message
    assert str(MAX_REFERENCE_IMAGES) in message
    assert str(MAX_REFERENCE_IMAGES + 1) in message
    assert done.finished_at is not None
    # 预扣的 credit 必须被退回（settled 而非 charged），用户不该为一次被拒的请求买单
    assert done.billing_status == "settled"
    assert done.steps and done.steps[0].status == "failed"


@pytest.mark.asyncio
async def test_reference_image_error_writes_fragment_generation_error(
    db_session: AsyncSession,
) -> None:
    """漫剧分片任务：报错要落进 ``frag.params.generation``，否则页面只显示空失败。

    ``_fail_task`` 对 fragment 有专门回写（executor.py:208-221），这层一旦断掉，
    ``GET /api/drama/episodes/{id}`` 返回的 generation 就只剩 status=failed 而没有
    原因 —— 前端弹窗会空着，用户更不知道发生了什么。
    """
    from app.models_drama import DramaEpisode, DramaEpisodeFragment, DramaProject
    from app.services.tasks.handlers import TaskHandler

    user = await make_user(db_session, balance_fen=50_000)
    project = DramaProject(user_id=user.id, title="test")
    db_session.add(project)
    await db_session.flush()
    episode = DramaEpisode(project_id=project.id, name="ep1")
    db_session.add(episode)
    await db_session.flush()
    frag = DramaEpisodeFragment(episode_id=episode.id, sort_order=1, params={})
    db_session.add(frag)
    await db_session.flush()
    task = await make_task(
        db_session,
        user,
        domain="drama",
        task_type="fragment_video",
        status="leased",
    )
    task.fragment_id = frag.id
    db_session.add(TaskStep(task_id=task.id, step_key="main", step_type="run", status="pending"))
    await db_session.commit()
    task_id = int(task.id)
    frag_id = int(frag.id)
    expected = _over_limit_message(count=MAX_REFERENCE_IMAGES + 3)

    async def _raising_executor(_task):
        raise ReferenceImageError(expected)

    @asynccontextmanager
    async def same_session():
        yield db_session

    fake = TaskHandler("drama", "fragment_video", _raising_executor)
    with (
        patch("app.services.tasks.executor.AsyncSessionLocal", same_session),
        patch("app.services.tasks.executor.get_task_handler", return_value=fake),
    ):
        await execute_task_run(task_id)

    db_session.expire_all()
    reloaded = await db_session.get(DramaEpisodeFragment, frag_id)
    assert reloaded is not None
    gen = (reloaded.params or {}).get("generation")
    assert isinstance(gen, dict)
    assert gen.get("status") == "failed"
    text = f"{gen.get('error') or ''} {gen.get('root_error') or ''}"
    assert "ảnh" in text
    assert str(MAX_REFERENCE_IMAGES + 3) in text


@pytest.mark.asyncio
async def test_reference_image_error_is_not_retried_as_insufficient_balance(
    db_session: AsyncSession,
) -> None:
    """超限不是余额问题：``error_code`` 不能被写成 ``insufficient_balance``。

    前端靠 ``error_code``/402 决定要不要弹"去充值"对话框。若超限被归到余额不足，
    用户会被引导去充一笔完全不需要充的钱。
    """
    from app.services.tasks.handlers import TaskHandler

    user = await make_user(db_session, balance_fen=50_000)
    task = await make_task(
        db_session,
        user,
        domain="drama",
        task_type="fragment_video",
        status="leased",
    )
    db_session.add(TaskStep(task_id=task.id, step_key="main", step_type="run", status="pending"))
    await db_session.commit()
    task_id = int(task.id)

    async def _raising_executor(_task):
        raise ReferenceImageError(_over_limit_message())

    @asynccontextmanager
    async def same_session():
        yield db_session

    fake = TaskHandler("drama", "fragment_video", _raising_executor)
    with (
        patch("app.services.tasks.executor.AsyncSessionLocal", same_session),
        patch("app.services.tasks.executor.get_task_handler", return_value=fake),
    ):
        await execute_task_run(task_id)

    db_session.expire_all()
    done = await get_task_for_runtime(db_session, task_id)
    assert done is not None
    assert done.error_code == "ReferenceImageError"
    assert done.error_code != "insufficient_balance"
    # 也没有实际扣费：预扣冻结的 credit 必须走结算退回，而不是留在冻结里
    assert done.billing_status == "settled"