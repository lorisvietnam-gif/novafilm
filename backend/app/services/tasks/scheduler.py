"""Task scheduler that leases due tasks and starts in-process execution."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select, update

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models_tasks import TaskRun
from app.services.billing.settlement import reconcile_terminal_frozen_tasks
from app.services.tasks.executor import execute_task_run
from app.services.tasks.service import (
    append_task_event,
    count_user_active_runtime_tasks,
    reconcile_sequential_batches,
    reconcile_stale_pending_tasks,
)

logger = logging.getLogger("app.tasks.scheduler")

# Scheduling loop handle, in-process execution slots, stop signal, heartbeat and orphan-scan timestamps
_scheduler_task: asyncio.Task | None = None
_running_jobs: dict[int, asyncio.Task] = {}
_stop_event = asyncio.Event()
_last_tick_mono: float = 0.0
_last_orphan_check_mono: float = 0.0
_intentionally_stopped: bool = True


# Start the task scheduling loop.
async def start_scheduler() -> None:
    global _scheduler_task, _intentionally_stopped, _last_tick_mono
    if _scheduler_task and not _scheduler_task.done():
        return
    _intentionally_stopped = False
    await recover_orphaned_tasks()
    _stop_event.clear()
    _last_tick_mono = time.monotonic()
    _scheduler_task = asyncio.create_task(_scheduler_loop(), name="task-scheduler")


# Stop the task scheduling loop and cancel the tasks it is running.
async def stop_scheduler() -> None:
    global _intentionally_stopped
    _intentionally_stopped = True
    _stop_event.set()
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
    running_jobs = list(_running_jobs.values())
    for task in running_jobs:
        if not task.done():
            task.cancel()
    if running_jobs:
        await asyncio.gather(*running_jobs, return_exceptions=True)
    _running_jobs.clear()


# Restart only the scheduling loop, keeping jobs still running in this process; used by the watchdog to recover a stuck tick.
async def restart_scheduler_loop(*, reason: str = "watchdog") -> None:
    global _scheduler_task, _intentionally_stopped, _last_tick_mono
    if _intentionally_stopped:
        return
    logger.warning("restarting task scheduler loop reason=%s", reason)
    _stop_event.set()
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
    await recover_orphaned_tasks()
    _stop_event.clear()
    _last_tick_mono = time.monotonic()
    _scheduler_task = asyncio.create_task(_scheduler_loop(), name="task-scheduler")


# How many platform tasks are running right now.
def running_count() -> int:
    return sum(1 for task in _running_jobs.values() if not task.done())


# Whether the scheduling loop is alive.
def scheduler_status() -> str:
    if _intentionally_stopped:
        return "stopped"
    if _scheduler_task and not _scheduler_task.done():
        return "running"
    return "stopped"


# Seconds since the last tick completed successfully; a very large value if it has never ticked.
def scheduler_tick_age_sec() -> float:
    if _last_tick_mono <= 0:
        return 1e9
    return max(0.0, time.monotonic() - _last_tick_mono)


# Whether a stale heartbeat means the loop is stuck (used by the watchdog).
def scheduler_tick_stale() -> bool:
    if _intentionally_stopped:
        return False
    stale_sec = max(15, int(get_settings().task_runtime_tick_stale_sec))
    return scheduler_tick_age_sec() > stale_sec


# Whether this process still holds the execution coroutine for the task.
def _job_alive(task_id: int) -> bool:
    job = _running_jobs.get(task_id)
    return bool(job and not job.done())


# Scan for due tasks each cycle and hand them to the executor.
async def _scheduler_loop() -> None:
    global _last_tick_mono
    while not _stop_event.is_set():
        _last_tick_mono = time.monotonic()
        timeout = max(20.0, float(get_settings().task_runtime_tick_stale_sec) - 10.0)
        try:
            await asyncio.wait_for(_tick(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.error("task scheduler tick timed out after %.0fs", timeout)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("task scheduler tick failed")
        finally:
            _last_tick_mono = time.monotonic()
        await asyncio.sleep(1.0)


# Scan for runnable tasks and claim them by lease.
async def _tick() -> None:
    global _last_orphan_check_mono
    now = datetime.now(UTC)
    orphan_every = max(5, int(get_settings().task_runtime_orphan_check_sec))
    if time.monotonic() - _last_orphan_check_mono >= orphan_every:
        await recover_orphaned_tasks()
        # Low-frequency reconciliation: converge tasks left in "terminal + frozen" by a settle that raised (idempotent)
        async with AsyncSessionLocal() as reconcile_db:
            await reconcile_terminal_frozen_tasks(reconcile_db)
        _last_orphan_check_mono = time.monotonic()

    async with AsyncSessionLocal() as db:
        await reconcile_sequential_batches(db)
        await reconcile_stale_pending_tasks(db)
    for task_id, job in list(_running_jobs.items()):
        if job.done():
            _running_jobs.pop(task_id, None)
    async with AsyncSessionLocal() as db:
        cancel_stmt = select(TaskRun.id).where(TaskRun.status == "cancel_requested")
        cancel_ids = [int(item) for item in (await db.execute(cancel_stmt)).scalars().all()]
    for task_id in cancel_ids:
        await cancel_running_task(task_id)

    capacity = max(1, int(get_settings().task_runtime_max_concurrency))
    user_limit = max(1, int(get_settings().task_user_max_concurrency))
    available_slots = max(0, capacity - running_count())
    if available_slots <= 0:
        return

    claimed_ids: list[int] = []
    async with AsyncSessionLocal() as db:
        stmt = (
            select(TaskRun.id, TaskRun.status, TaskRun.requested_by)
            .where(
                TaskRun.status.in_(("pending", "cancel_requested")),
                TaskRun.next_action_at.is_not(None),
                TaskRun.next_action_at <= now,
            )
            .order_by(TaskRun.priority.asc(), TaskRun.created_at.asc(), TaskRun.id.asc())
            .limit(max(available_slots * 4, available_slots))
        )
        candidates = list((await db.execute(stmt)).all())
        user_active_cache: dict[int, int] = {}
        for row in candidates:
            if len(claimed_ids) >= available_slots:
                break
            task_id = int(row.id)
            current_status = str(row.status)
            user_id = int(row.requested_by)
            if task_id in _running_jobs and not _running_jobs[task_id].done():
                continue
            if user_id not in user_active_cache:
                user_active_cache[user_id] = await count_user_active_runtime_tasks(db, user_id)
            if user_active_cache[user_id] >= user_limit:
                continue
            lease_token = uuid.uuid4().hex
            next_status = "leased" if current_status != "cancel_requested" else "cancel_requested"
            claim = (
                update(TaskRun)
                .where(TaskRun.id == task_id, TaskRun.status == current_status)
                .values(
                    status=next_status,
                    lease_token=lease_token,
                    lease_until=now + timedelta(minutes=10),
                )
            )
            result = await db.execute(claim)
            if int(result.rowcount or 0) != 1:
                continue
            task = await db.get(TaskRun, task_id)
            await append_task_event(
                db,
                task_id,
                event_type="task.leased",
                status=next_status,
                phase=getattr(task, "current_step_key", None),
                message="任务已被调度器领取",
            )
            claimed_ids.append(task_id)
            user_active_cache[user_id] += 1
        if claimed_ids:
            await db.commit()

    for task_id in claimed_ids:
        if task_id in _running_jobs and not _running_jobs[task_id].done():
            continue
        _running_jobs[task_id] = asyncio.create_task(_run_one(task_id))


# Wrap the executor and release the running slot when it finishes.
async def _run_one(task_id: int) -> None:
    try:
        await execute_task_run(task_id)
    finally:
        _running_jobs.pop(task_id, None)


# Cancel the local execution coroutine of a given task.
async def cancel_running_task(task_id: int) -> bool:
    task = _running_jobs.get(task_id)
    if not task or task.done():
        return False
    task.cancel()
    return True


# Put dead leased/running tasks back on the queue, skipping any whose coroutine this process still holds.
async def recover_orphaned_tasks() -> int:
    now = datetime.now(UTC)
    grace_sec = max(5, int(get_settings().task_runtime_recover_grace_sec))
    stale_before = now - timedelta(seconds=grace_sec)
    async with AsyncSessionLocal() as db:
        await reconcile_sequential_batches(db)
        await reconcile_stale_pending_tasks(db)
        stmt = select(TaskRun).where(
            or_(
                and_(
                    TaskRun.status == "leased",
                    or_(
                        and_(TaskRun.updated_at.is_not(None), TaskRun.updated_at < stale_before),
                        and_(TaskRun.lease_until.is_not(None), TaskRun.lease_until < now),
                    ),
                ),
                and_(
                    TaskRun.status == "running",
                    TaskRun.updated_at.is_not(None),
                    TaskRun.updated_at < stale_before,
                ),
            )
        )
        rows = list((await db.execute(stmt)).scalars().all())
        changed = 0
        for task in rows:
            if _job_alive(int(task.id)):
                continue
            task.status = "cancel_requested" if task.cancel_requested else "pending"
            task.next_action_at = now
            task.lease_token = None
            task.lease_until = None
            await append_task_event(
                db,
                task.id,
                event_type="task.recovered",
                status=task.status,
                phase=task.current_step_key,
                message="检测到任务执行中断或租约过期，已重新排队",
            )
            changed += 1
        if changed:
            await db.commit()
            logger.warning("recovered orphaned task runs count=%s", changed)
        return changed
