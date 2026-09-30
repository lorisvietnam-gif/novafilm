"""In-process task executor for the de-workerized task platform."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from app.database import AsyncSessionLocal
from app.services.billing.context import billing_scope
from app.services.billing.settlement import freeze_for_task, settle_task
from app.services.tasks.handlers import get_task_handler
from app.services.tasks.service import append_task_event, get_task_for_runtime, set_task_step_state

logger = logging.getLogger(__name__)


# Execute a single task and write the platform status back.
async def execute_task_run(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await get_task_for_runtime(db, task_id)
        if not task:
            return
        if task.cancel_requested and task.status == "cancel_requested":
            await _mark_cancelled(db, task)
            return
        handler = get_task_handler(task.domain, task.task_type)
        if handler is None:
            task.status = "failed"
            task.error_code = "handler_missing"
            task.error_message = f"未注册任务处理器: {task.domain}/{task.task_type}"
            task.finished_at = datetime.now(UTC)
            # Not pre-held, so leave the status as none
            task.billing_status = "none"
            await append_task_event(
                db,
                task.id,
                event_type="task.failed",
                status=task.status,
                phase=task.current_step_key,
                message=task.error_message,
            )
            await db.commit()
            return

        # Read steps before freeze_for_task: _lock_task(populate_existing=True)
        # evicts the preloaded relationships, after which touching task.steps raises MissingGreenlet on the async lazy load.
        step = task.steps[0] if task.steps else None

        try:
            await freeze_for_task(db, task)
        except ValueError as exc:
            # Insufficient balance: an expected failure, with a dedicated error code so the front end can point the user at top-up
            await _fail_task_before_start(
                db, task, step, error_code="insufficient_balance", message=str(exc)
            )
            return
        except Exception as exc:  # noqa: BLE001
            # A transient DB failure that is not a ValueError must not escape bare: the task would otherwise stay leased forever, waiting only for the watchdog cycle as a backstop
            logger.exception("freeze_for_task failed task_id=%s", task.id)
            from app.services.exc_format import format_exception_message

            await _fail_task_before_start(
                db,
                task,
                step,
                error_code=type(exc).__name__,
                message=format_exception_message(exc, fallback="预扣失败", limit=500),
            )
            return

        now = datetime.now(UTC)
        task.status = "running"
        task.started_at = task.started_at or now
        task.next_action_at = None
        task.lease_until = None
        set_task_step_state(task, step, status="submitting", now=now)
        await append_task_event(
            db,
            task.id,
            event_type="task.started",
            status=task.status,
            phase=task.current_step_key,
            message="任务开始执行",
        )
        await db.commit()

    try:
        async with billing_scope(task_id):
            async with AsyncSessionLocal() as db:
                task = await get_task_for_runtime(db, task_id)
                if not task:
                    return
                handler = get_task_handler(task.domain, task.task_type)
                result = await handler.executor(task) if handler else {"ok": False, "error": "missing_handler"}
                # Reload including selectinload steps; do not use refresh, which evicts the relationships and then triggers a lazy load.
                task = await get_task_for_runtime(db, task_id)
                if not task:
                    return
                if isinstance(result, dict) and (result.get("deferred") or result.get("awaiting_poll")):
                    await db.commit()
                    return
                if task.status == "awaiting_poll":
                    await db.commit()
                    return
                if isinstance(result, dict) and result.get("cancelled"):
                    await _mark_cancelled(db, task)
                    return
                # A handler returning ok:False must converge to a failure (never treat it as succeeded)
                if isinstance(result, dict) and result.get("ok") is False:
                    err_text = str(result.get("error") or "任务执行失败").strip()[:500] or "任务执行失败"
                    await _fail_task(db, task, RuntimeError(err_text))
                    return
                await _complete_task(db, task, result or {"ok": True})
    except asyncio.CancelledError:
        async with AsyncSessionLocal() as db:
            task = await get_task_for_runtime(db, task_id)
            if task:
                if task.cancel_requested:
                    await _mark_cancelled(db, task)
                else:
                    await _requeue_interrupted_task(db, task)
        raise
    except Exception as exc:  # noqa: BLE001
        async with AsyncSessionLocal() as db:
            task = await get_task_for_runtime(db, task_id)
            if task:
                await _fail_task(db, task, exc)


# Converge the task to the succeeded state.
async def _complete_task(db, task, result: dict) -> None:
    now = datetime.now(UTC)
    step = task.steps[0] if task.steps else None
    set_task_step_state(task, step, status="done", now=now)
    task.status = "cancelled" if task.cancel_requested else "succeeded"
    task.progress_percent = 100 if task.status == "succeeded" else task.progress_percent
    task.result_payload = result
    task.error_code = None
    task.error_message = None
    task.finished_at = now
    await append_task_event(
        db,
        task.id,
        event_type="task.completed" if task.status == "succeeded" else "task.cancelled",
        status=task.status,
        phase=task.current_step_key,
        message="任务执行完成" if task.status == "succeeded" else "任务已取消",
        payload=result,
    )
    try:
        await settle_task(db, task.id)
    except Exception:  # noqa: BLE001
        logger.exception("settle_task failed task_id=%s", task.id)
    await db.commit()


    # Failure during the pre-hold phase (the handler has not run yet): _lock_task(populate_existing) has already evicted the
    # task.steps relationship, so unlike _fail_task we cannot reach task.steps[0]; the caller pre-reads the step and passes it in.
async def _fail_task_before_start(db, task, step, *, error_code: str, message: str) -> None:
    now = datetime.now(UTC)
    set_task_step_state(task, step, status="failed", now=now)
    task.status = "failed"
    task.error_code = error_code
    task.error_message = message[:500]
    task.finished_at = now
    # An exception after frozen (e.g. failing to write the usage row) keeps frozen so settle_task can reconcile; if the pre-hold never succeeded the status stays none
    if task.billing_status != "frozen":
        task.billing_status = "none"
    await append_task_event(
        db,
        task.id,
        event_type="task.failed",
        status=task.status,
        phase=task.current_step_key,
        message=task.error_message,
    )
    # Asset image/video: write back to asset.params.generation synchronously, so the front end is not left with only an empty "generation failed"
    await _fail_drama_asset_generation_if_needed(db, task, task.error_message)
    try:
        await settle_task(db, task.id)
    except Exception:  # noqa: BLE001
        logger.exception("settle_task failed task_id=%s", task.id)
    await db.commit()


# Converge the task to the failed state.
async def _fail_task(db, task, exc: Exception) -> None:
    from app.services.exc_format import format_exception_message

    now = datetime.now(UTC)
    step = task.steps[0] if task.steps else None
    set_task_step_state(task, step, status="failed", now=now)
    task.status = "failed"
    task.error_code = type(exc).__name__
    task.error_message = format_exception_message(exc, fallback="任务执行失败", limit=500)
    task.finished_at = now
    await append_task_event(
        db,
        task.id,
        event_type="task.failed",
        status=task.status,
        phase=task.current_step_key,
        message=task.error_message,
    )
    # Asset image/video: write back to asset.params.generation synchronously, so the front end is not left with only an empty "generation failed"
    await _fail_drama_asset_generation_if_needed(db, task, task.error_message or str(exc))
    if task.fragment_id:
        from app.models_drama import DramaEpisodeFragment
        from app.services.drama.generation import build_failed_generation_params

        frag = await db.get(DramaEpisodeFragment, int(task.fragment_id))
        if frag:
            params = dict(frag.params or {})
            prev_gen = params.get("generation") if isinstance(params.get("generation"), dict) else None
            # Keep root_error, so a generic "internal retries exhausted" cannot mask a real cause such as a human-content rejection
            params["generation"] = build_failed_generation_params(
                prev_gen if isinstance(prev_gen, dict) else None,
                task.error_message or str(exc),
            )
            frag.params = params
    if task.domain == "kepu" and task.project_id:
        from app.models import Project, ProjectStatus

        running = {
            ProjectStatus.SCRIPTING,
            ProjectStatus.IMAGING,
            ProjectStatus.VIDEOING,
            ProjectStatus.AUDIOING,
            ProjectStatus.COMPOSING,
            ProjectStatus.AUDITING,
        }
        project = await db.get(Project, int(task.project_id))
        if project and project.status in running:
            project.status = ProjectStatus.FAILED
            project.error_msg = (task.error_message or str(exc))[:2000]
    payload = task.payload if isinstance(task.payload, dict) else {}
    if payload.get("sequential") and task.batch_key:
        from app.services.tasks.service import fail_remaining_sequential_batch

        batch_index = int(payload.get("batch_index", 0))
        await fail_remaining_sequential_batch(
            db,
            task.batch_key,
            batch_index,
            "上一镜失败，无法衔接尾帧",
        )
    try:
        await settle_task(db, task.id)
    except Exception:  # noqa: BLE001
        logger.exception("settle_task failed task_id=%s", task.id)
    await db.commit()


# Converge the task to the cancelled state.
async def _mark_cancelled(db, task) -> None:
    # Yield inside the finalizing close-out window: the poller coroutine may be downloading the film and
    # writing real usage, and a full refund now would leave usage_events orphaned, money for nothing. The task
    # stays cancel_requested and the scheduler retries next round; the window TTL (10 min) is the backstop.
    from app.services.tasks.service import task_finalizing_window_open

    if task_finalizing_window_open(task):
        logger.info(
            "cancel deferred: task %s inside finalizing window, poller will settle",
            task.id,
        )
        return
    now = datetime.now(UTC)
    step = task.steps[0] if task.steps else None
    set_task_step_state(task, step, status="cancelled", now=now)
    task.status = "cancelled"
    task.finished_at = now
    task.next_action_at = None
    task.lease_until = None
    await append_task_event(
        db,
        task.id,
        event_type="task.cancelled",
        status=task.status,
        phase=task.current_step_key,
        message="任务已取消",
    )
    try:
        await settle_task(db, task.id)
    except Exception:  # noqa: BLE001
        logger.exception("settle_task failed task_id=%s", task.id)
    await db.commit()


async def _fail_drama_asset_generation_if_needed(db, task, error: str) -> None:
    """Fail a task that never started executing, updating the drama asset generation status in step."""
    if (task.domain or "") != "drama" or not task.asset_id:
        return
    if (task.task_type or "") not in {"asset_image", "asset_video"}:
        return
    from app.models_drama import DramaAsset

    asset = await db.get(DramaAsset, int(task.asset_id))
    if not asset:
        return
    msg = (error or "").strip() or "生成失败"
    params = dict(asset.params or {})
    params["generation"] = {"status": "failed", "error": msg[:400]}
    asset.params = params


# Interrupted by an application restart or hot reload: put the task back into the pending state.
async def _requeue_interrupted_task(db, task) -> None:
    now = datetime.now(UTC)
    step = task.steps[0] if task.steps else None
    set_task_step_state(task, step, status="pending", now=now)
    task.status = "pending"
    task.next_action_at = now
    task.lease_token = None
    task.lease_until = None
    await append_task_event(
        db,
        task.id,
        event_type="task.requeued",
        status=task.status,
        phase=task.current_step_key,
        message="任务被中断，已重新排队",
    )
    await db.commit()
