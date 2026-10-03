"""Drama long-running jobs executed in-process by the task platform."""

from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import User
from app.models_tasks import TaskRun
from app.models_drama import (
    DramaAsset,
    DramaEpisode,
    DramaEpisodeFragment,
    DramaFragmentAssetRef,
    DramaProject,
)
from app.services.billing import record_line, record_llm_chat_line
from app.services.drama.billing_util import record_seed_assets_llm_usage
from app.services.drama.seed import seed_assets_from_episode_body
from app.services.drama.agents import (
    MIN_EPISODE_CONTENT_CHARS,
    auto_missing_episode_numbers,
    count_completed_episodes,
    ensure_episode_outline,
    episode_prompt_language,
    format_summary_text,
    merge_episode_bodies,
    next_episode_batch_range,
    pick_auto_project_title,
    resolve_episode_target,
    run_episode_body_from_brief,
    run_episode_brief_from_body,
    run_episode_full_from_creative,
    run_episode_script_batch,
    run_episode_script_from_draft,
    run_episode_summary_from_creative,
    run_script_summary,
    short_or_missing_episodes,
)
from app.services.drama.asset_video import generate_asset_video
from app.services.drama.generation import (
    apply_fragment_video_assets,
    build_failed_generation_params,
    deserialize_fragment_video_prepared,
    generate_asset_image,
    prepare_fragment_video_for_submit,
    serialize_fragment_video_prepared,
    submit_prepared_fragment_video,
)
from app.services.drama.visual_prompt import resolve_visual_prompt_for_asset

logger = logging.getLogger(__name__)

# 分集视频取消标记（episode_id）
_video_cancelled_episodes: set[int] = set()
ACTIVE_VIDEO_GEN_STATUSES = frozenset({"queued", "running", "generating"})


def _is_episode_video_cancelled(episode_id: int) -> bool:
    return int(episode_id) in _video_cancelled_episodes


def _mark_episode_video_cancelled(episode_id: int) -> None:
    _video_cancelled_episodes.add(int(episode_id))


def _clear_episode_video_cancelled(episode_id: int) -> None:
    _video_cancelled_episodes.discard(int(episode_id))


def clear_episode_video_cancelled(episode_id: int) -> None:
    """新入队分镜视频前清除进程内取消标记，避免误把新任务立刻作废。"""
    _clear_episode_video_cancelled(episode_id)


async def _reset_fragment_video_generation(
    db,
    *,
    episode_id: int | None = None,
    user_id: int | None = None,
) -> int:
    q = select(DramaEpisodeFragment)
    if episode_id is not None:
        q = q.where(DramaEpisodeFragment.episode_id == int(episode_id))
    if user_id is not None:
        # 按项目归属收敛：禁止跨用户重置分镜
        q = (
            q.join(DramaEpisode, DramaEpisodeFragment.episode_id == DramaEpisode.id)
            .join(DramaProject, DramaEpisode.project_id == DramaProject.id)
            .where(DramaProject.user_id == int(user_id))
        )
    frags = (await db.execute(q)).scalars().all()
    changed = 0
    for frag in frags:
        params = dict(frag.params or {})
        gen = params.get("generation") if isinstance(params, dict) else None
        status = str(gen.get("status") or "") if isinstance(gen, dict) else ""
        if status not in ACTIVE_VIDEO_GEN_STATUSES:
            continue
        params["generation"] = {"status": "cancelled", "error": "任务已取消"}
        frag.params = params
        changed += 1
    if changed:
        await db.commit()
    return changed


async def cancel_episode_video_jobs(episode_id: int) -> dict[str, Any]:
    """取消单集视频任务：标记取消并重置分镜生成状态。"""
    _mark_episode_video_cancelled(episode_id)
    async with AsyncSessionLocal() as db:
        fragments = await _reset_fragment_video_generation(db, episode_id=episode_id)
    logger.info(
        "取消分集视频 episode_id=%s fragments=%s",
        episode_id,
        fragments,
    )
    return {
        "ok": True,
        "episode_id": episode_id,
        "inprocess": 0,
        "purged": 0,
        "revoked": 0,
        "fragments": fragments,
    }


async def cancel_all_episode_video_jobs(user_id: int) -> dict[str, Any]:
    """取消指定用户的全部漫剧分镜视频任务，严禁波及其他用户。"""
    episode_ids: set[int] = set()
    async with AsyncSessionLocal() as db:
        frags = (
            (
                await db.execute(
                    select(DramaEpisodeFragment)
                    .join(DramaEpisode, DramaEpisodeFragment.episode_id == DramaEpisode.id)
                    .join(DramaProject, DramaEpisode.project_id == DramaProject.id)
                    .where(DramaProject.user_id == int(user_id))
                )
            )
            .scalars()
            .all()
        )
        for frag in frags:
            params = frag.params or {}
            gen = params.get("generation") if isinstance(params, dict) else None
            status = str(gen.get("status") or "") if isinstance(gen, dict) else ""
            if status in ACTIVE_VIDEO_GEN_STATUSES:
                episode_ids.add(int(frag.episode_id))
    for ep_id in list(episode_ids):
        _mark_episode_video_cancelled(ep_id)

    async with AsyncSessionLocal() as db:
        fragments = await _reset_fragment_video_generation(db, user_id=user_id)
    logger.info(
        "取消用户全部视频任务 user_id=%s fragments=%s episodes=%s",
        user_id,
        fragments,
        len(episode_ids),
    )
    return {
        "ok": True,
        "purged": 0,
        "revoked": 0,
        "fragments": fragments,
        "episodes": len(episode_ids),
    }


async def _enqueue_drama_task(
    db: AsyncSession,
    user: User,
    *,
    task_type: str,
    project_id: int,
    dedupe_suffix: str,
    payload: dict[str, Any],
    asset_id: int | None = None,
    episode_id: int | None = None,
    fragment_id: int | None = None,
    commit: bool = True,
) -> int:
    """通过统一任务平台入队漫剧任务，返回 task_run_id。"""
    from app.schemas_tasks import TaskCreateRequest, TaskTargetBind
    from app.services.tasks.service import create_task

    task = await create_task(
        db,
        user,
        TaskCreateRequest(
            domain="drama",
            task_type=task_type,
            dedupe_key=f"drama:{task_type}:{dedupe_suffix}",
            drama_project_id=project_id,
            asset_id=asset_id,
            episode_id=episode_id,
            fragment_id=fragment_id,
            payload=payload,
            targets=[TaskTargetBind(target_type="drama_project", target_id=project_id)],
        ),
        commit=commit,
    )
    return int(task.id)


async def dispatch_script_summary_job(db: AsyncSession, user: User, project_id: int) -> int:
    """入队剧本摘要任务。"""
    task_id = await _enqueue_drama_task(
        db,
        user,
        task_type="script_summary",
        project_id=project_id,
        dedupe_suffix=str(project_id),
        payload={"project_id": project_id},
    )
    logger.info("dispatch 剧本摘要 → task_id=%s project_id=%s", task_id, project_id)
    return task_id


async def run_script_summary_job(project_id: int) -> dict[str, Any]:
    # Worker：生成剧本摘要并写库
    async with AsyncSessionLocal() as db:
        project = await db.get(
            DramaProject,
            project_id,
            options=[selectinload(DramaProject.script)],
        )
        if not project or not project.script:
            logger.warning("剧本摘要失败：缺少剧本 project_id=%s", project_id)
            return {"ok": False, "error": "missing_script"}
        script = project.script
        creative = (script.source or "").strip()
        episode_count = (project.params or {}).get("episode_count")
        image_style_id = (project.params or {}).get("image_style_id")
        # locale 同样 quyết định ngôn ngữ của `summary`： tóm tắt là đầu vào của mọi
        # prompt phân tập, tóm tắt bằng tiếng Trung thì kéo `episode_content` theo.
        locale = str((project.params or {}).get("locale") or get_settings().default_locale)
        try:
            summary = await run_script_summary(
                creative,
                episode_count=int(episode_count) if episode_count else None,
                image_style_id=str(image_style_id) if image_style_id else None,
                locale=locale,
            )
        except Exception as exc:  # noqa: BLE001
            params = dict(script.params or {})
            params["summary_status"] = "failed"
            params["summary_error"] = str(exc)[:500]
            params.pop("summary_generating_at", None)
            script.params = params
            await db.commit()
            logger.exception("剧本摘要失败 project_id=%s err=%s", project_id, exc)
            return {"ok": False, "error": str(exc)[:500]}

        script.summary = summary
        params = dict(script.params or {})
        params["summary_text"] = format_summary_text(
            summary, text=episode_prompt_language(locale).episode
        )
        params["summary_status"] = "completed"
        params["summary_error"] = None
        params.pop("summary_generating_at", None)
        params["episode_content_status"] = params.get("episode_content_status") or "pending"
        script.params = params
        one_line = str(summary.get("oneLineStory") or "").strip()
        if one_line:
            project.description = one_line[:500]
        auto_title = pick_auto_project_title(
            summary, creative=creative, current_title=project.title or ""
        )
        if auto_title:
            project.title = auto_title
            script.name = auto_title
        user = await db.get(User, project.user_id)
        if user:
            await record_line(
                db,
                user_id=user.id,
                project_id=None,
                drama_project_id=project.id,
                billing_key="llm_chat",
                model=get_settings().model_llm,
                estimated=True,
                domain="drama",
            )
        await db.commit()
        logger.info(
            "剧本摘要完成 project_id=%s episode_count=%s series_title=%s one_line=%s",
            project_id,
            summary.get("episodeCount"),
            auto_title or project.title,
            (one_line[:40] + "…") if len(one_line) > 40 else one_line,
        )
        return {"ok": True, "project_id": project_id}


# ---------- episode scripts ----------


async def dispatch_episode_scripts_job(
    db: AsyncSession,
    user: User,
    project_id: int,
    force: bool = False,
    episode_number: int | None = None,
    draft: str | None = None,
    generate_mode: str | None = None,
) -> int:
    """入队分集剧本任务；可指定单集优化或创意→摘要/正文。"""
    project = await db.get(DramaProject, project_id, options=[selectinload(DramaProject.script)])
    total = 1
    if episode_number:
        total = 1
    elif project and project.script and isinstance(project.script.summary, dict):
        total = int(project.script.summary.get("episodeCount") or 1)
    ep_key = str(int(episode_number)) if episode_number else "all"
    mode_key = (generate_mode or "optimize").strip() or "optimize"
    task_id = await _enqueue_drama_task(
        db,
        user,
        task_type="episode_script",
        project_id=project_id,
        dedupe_suffix=f"{project_id}:force:{int(force)}:ep:{ep_key}:mode:{mode_key}",
        payload={
            "project_id": project_id,
            "force": force,
            "total": total,
            "episode_number": int(episode_number) if episode_number else None,
            "draft": (draft or "").strip() or None,
            "generate_mode": mode_key if episode_number else None,
        },
    )
    logger.info(
        "dispatch 分集剧本 → task_id=%s project_id=%s episode_number=%s mode=%s",
        task_id,
        project_id,
        episode_number,
        mode_key,
    )
    return task_id


def _episode_content_fingerprint(episodes: list[Any]) -> str:
    """指纹：真正写进 `episode_content` 的那部分（集号 + 正文）。

    用它回答一个 `try/except` 回答不了的问题 —— **LLM 到底有没有写进东西**。
    LLM 不抛异常：它返回垃圾、parser 吞掉垃圾，于是没有任何异常可抓；只有把调用
    前后的内容比一比才知道这一轮是不是白花钱。

    只取正文与集号，忽略 `creative`/`summary`/`origin` 等派生字段：那几项由同一次
    调用带回但不影响"这一集有没有正文"，混进来会让指纹在正文没变时也变化。
    """
    rows: list[str] = []
    for item in episodes or []:
        if not isinstance(item, dict):
            rows.append(f"~{type(item).__name__}")
            continue
        raw_number = item.get("episodeNumber", item.get("episode_number"))
        body = str(item.get("body") or item.get("content") or "")
        rows.append(f"{raw_number!s}\x1f{hashlib.sha1(body.encode('utf-8')).hexdigest()}")
    rows.sort()
    return hashlib.sha1("\x1e".join(rows).encode("utf-8")).hexdigest()


def _episode_record_fingerprint(item: Any) -> str:
    """指纹：单集记录的**全部**内容（正文 + 创意 + 摘要 + 集名）。

    单集路径要跟全集路径用不同的口径：`summary` / `brief` 两种模式本来就**不该**动
    正文（只回填创意与摘要），拿正文指纹去判它们必然误报「什么都没写」。
    """
    if not isinstance(item, dict):
        return f"~{type(item).__name__}"
    parts = [
        str(item.get("episodeNumber", item.get("episode_number")) or ""),
        str(item.get("body") or item.get("content") or ""),
        str(item.get("creative") or ""),
        str(item.get("summary") or item.get("synopsis") or ""),
        str(item.get("title") or ""),
    ]
    return hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()


def _find_episode(episodes: list[Any], number: int) -> Any:
    for item in episodes or []:
        if not isinstance(item, dict):
            continue
        try:
            if int(item.get("episodeNumber") or 0) == int(number):
                return item
        except (TypeError, ValueError):
            continue
    return None


def _assert_episode_content_written(
    *,
    where: str,
    before: str,
    after: str,
    spent_llm: bool,
    task_id: int | None,
    require_non_empty: bool,
    episodes: list[Any] | None = None,
) -> None:
    """写了却等于没写 ⇒ 抛错，让上层 `ok=False` ⇒ `_fail_task` ⇒ 全额退预扣。

    **必须在 `record_line` 之前调**：`settle_task` 按 `usage_events` 实扣，只要用量行
    已经落库，任务就算失败也收得到钱（task 788 实测：failed 仍 charged=320）。
    要退款就不能写下那一行。

    `require_non_empty` 交给调用方判断，因为「正文为空」只对产出正文的三种模式成立：
    `summary` 模式允许该集还没有正文。
    """
    suffix = f"，task_id={task_id}" if task_id else ""
    if spent_llm and before == after:
        raise RuntimeError(
            f"{where} 调用了文字模型但 episode_content 一个字节都没变"
            f"（指纹 {before[:12]}），本轮不落用量、退回全部预扣{suffix}"
        )
    if require_non_empty and not any(
        isinstance(item, dict) and str(item.get("body") or item.get("content") or "").strip()
        for item in (episodes or [])
    ):
        raise RuntimeError(f"{where} 结束时 episode_content 没有任何正文，不落用量、退回全部预扣{suffix}")


def _assert_requested_episodes_written(
    *,
    where: str,
    episodes: list[Any] | None,
    requested: list[int],
    task_id: int | None,
) -> None:
    """本轮**被要求**写的每一集都必须真的写出来，否则这一轮不收钱。

    Đây là chỗ đợt 1 thiếu. `_assert_episode_content_written` hỏi"`episode_content` có
    đổi không" — trả lời "có" chỉ cần **một** tập đủ dài. Đo thật (2026-10-03, project 39,
    locale=vi, task 821): vòng lặp sinh lại tập 1 ba lần vì nó ngắn hơn ngưỡng, mỗi vòng
    ghi một dòng dùng 40 分, rồi báo lỗi. Kết quả: `charged=120`, `refunded=456`,
    **11/12 tập rỗng**, và người dùng vẫn mất 120 分 cho một tập.

    `requested` là **đúng khoảng lô vừa sinh** (`next_episode_batch_range`), không phải
    toàn bộ danh sách tập thiếu: với `batch_size=1` mà 12 tập thiếu thì lô chỉ có 1 tập,
    đòi cả 12 là đòi những tập vòng này không được yêu cầu — và sẽ báo lỗi oang.

    Ngưỡng ở đây là **cùng** ngưỡng mà `auto_missing_episode_numbers` dùng để chọn tập
    kế tiếp (`short_or_missing_episodes`). Nếu hai chỗ lệch nhau thì vòng lặp sẽ sinh
    lại tập vừa ghi, mỗi lần lại thu tiền — đúng lỗi trên.

    **Phải gọi trước `record_line`**: `settle_task` trừ theo `usage_events`, dòng đã
    nằm trong bảng là tiền người dùng mất kể cả khi task fail (task 788: fail vẫn
    charged=320). Muốn hoàn thì đừng viết dòng đó.

    Thay vì trả về một danh sách thiếu, hàm **ném lỗi**: người dùng phải được báo là
    tập nào không ra, chứ không phải nhìn một trang có 11/12 tập trống mà báo thành công.
    """
    if not requested:
        return
    unresolved = short_or_missing_episodes(episodes or [], min(requested), max(requested))
    if unresolved:
        raise RuntimeError(
            f"分集生成要求写第 {'-'.join(str(n) for n in range(min(requested), max(requested) + 1))}"
            f" 集，但第 {'-'.join(str(n) for n in unresolved)} 集写出来是空的或短于 "
            f"{MIN_EPISODE_CONTENT_CHARS} 字符；本轮不落用量、退回全部预扣"
            f"，task_id={task_id}"
        )
    logger.info(
        "%s 逐集核对通过 requested=%s done=%s",
        where,
        requested,
        count_completed_episodes(episodes or [], max(requested)),
    )


async def run_episode_scripts_job(
    project_id: int,
    force: bool = False,
    task_id: int | None = None,
    episode_number: int | None = None,
    draft: str | None = None,
    generate_mode: str | None = None,
) -> dict[str, Any]:
    # Worker：大纲 + 循环逐集直到完成；也可只优化指定集
    logger.info(
        "开始生成分集剧本 project_id=%s force=%s task_id=%s episode_number=%s mode=%s",
        project_id,
        force,
        task_id,
        episode_number,
        generate_mode,
    )
    if episode_number:
        return await _run_single_episode_script_job(
            project_id,
            int(episode_number),
            draft=(draft or "").strip(),
            task_id=task_id,
            generate_mode=(generate_mode or "optimize").strip() or "optimize",
        )

    async def _sync_task_progress(done: int, total: int, *, phase: str, message: str) -> None:
        if not task_id:
            return
        from app.services.tasks.service import append_task_event

        async with AsyncSessionLocal() as tdb:
            task_row = await tdb.get(TaskRun, int(task_id))
            if not task_row or task_row.status not in {"leased", "running", "pending"}:
                return
            if total <= 0:
                pct = 0
            elif done >= total:
                pct = 100
            else:
                pct = min(99, max(1, int(round(100 * done / total))))
            task_row.progress_percent = pct
            task_row.current_step_key = "episode_script"
            task_row.current_step_status = phase
            await append_task_event(
                tdb,
                int(task_id),
                event_type="task.progress",
                status=task_row.status,
                phase=phase,
                message=message,
                payload={"done": done, "total": total, "progress_percent": pct},
            )
            await tdb.commit()

    async with AsyncSessionLocal() as db:
        project = await db.get(
            DramaProject,
            project_id,
            options=[selectinload(DramaProject.script)],
        )
        if not project or not project.script or not project.script.summary:
            logger.warning("分集剧本失败：缺少摘要 project_id=%s", project_id)
            return {"ok": False, "error": "missing_summary"}

        script = project.script
        summary = script.summary if isinstance(script.summary, dict) else {}
        existing: list = []
        content = script.episode_content
        if isinstance(content, dict) and isinstance(content.get("episodes"), list):
            existing = list(content["episodes"])
        elif isinstance(content, list):
            existing = list(content)

        total = resolve_episode_target(summary, project.params, script.params)
        if summary.get("episodeCount") != total:
            summary = {**summary, "episodeCount": total}
            script.summary = summary

        creative = (script.source or "").strip()
        # locale 决定正文语言：项目创建时写入 `params.locale`，老项目没有就落到
        # `settings.default_locale`。不接 locale 就是 project 28 那种结果 ——
        # locale=vi 却出 6/6 集中文（见 brief docs/briefs/case-episode-locale-and-silent-charge-b4.md）。
        locale = str((project.params or {}).get("locale") or get_settings().default_locale)
        # 「这一轮有没有花过 LLM 的钱」。只有花过又没写进去，才该报错退款；
        # 什么都没生成的空跑（例如正文已达标）不算失败，也不能改成失败。
        spent_llm = False
        # `initial_fp` = 本任务开始时（force 清空之后）的正文指纹，收尾时用来证明
        # 「这一整轮真的改了东西」；`iter_fp` 每轮滚动，用来抓「这一轮白花钱」。
        # 两者混用会自己把自己判成没写东西，所以分开存。
        # 取在 force 清空**之后**：force 本来就会清空正文，若在清空前取，
        # 「什么都没做」与「清空后重写」会算出同一个起始值，判断就废了。
        initial_fp = _episode_content_fingerprint(existing)
        iter_fp = initial_fp
        try:
            if force and existing:
                params0 = dict(script.params or {})
                status0 = str(params0.get("episode_content_status") or "")
                # generating=本轮已开跑（含进程重启续跑），勿再因 force 清空已生成正文
                if status0 != "generating":
                    existing = [
                        {
                            "episodeNumber": int(item.get("episodeNumber") or 0),
                            "title": str(item.get("title") or f"第 {item.get('episodeNumber')} 集"),
                            "body": "",
                        }
                        for item in existing
                        if isinstance(item, dict) and int(item.get("episodeNumber") or 0) >= 1
                    ]
                    script.episode_content = {"episodes": existing}
                    params0["episode_content_status"] = "generating"
                    params0["episode_content_error"] = None
                    script.params = params0
                    await db.flush()
                    initial_fp = _episode_content_fingerprint(existing)
                    iter_fp = initial_fp
                    logger.info("已清空分集正文准备重写 project_id=%s total=%s", project_id, total)
                else:
                    logger.info(
                        "force 续跑跳过清空 project_id=%s done=%s/%s",
                        project_id,
                        count_completed_episodes(existing, total),
                        total,
                    )

            existing, outline_used_llm = await ensure_episode_outline(
                creative, summary, existing, total, locale=locale
            )
            spent_llm = spent_llm or outline_used_llm
            script.episode_content = {"episodes": existing}
            params_outline = dict(script.params or {})
            params_outline["episode_content_status"] = "generating"
            script.params = params_outline
            await db.flush()
            if outline_used_llm:
                user = await db.get(User, project.user_id)
                if user:
                    await record_llm_chat_line(
                        db,
                        user_id=user.id,
                        domain="drama",
                        drama_project_id=project.id,
                    )
            logger.info("分集大纲就绪 project_id=%s titles=%s", project_id, len(existing))
            await _sync_task_progress(
                count_completed_episodes(existing, total),
                total,
                phase="generating",
                message=f"分集大纲就绪，开始生成 {count_completed_episodes(existing, total)}/{total}",
            )

            guard = 0
            while True:
                missing = auto_missing_episode_numbers(existing, total)
                if not missing:
                    break
                generated = count_completed_episodes(existing, total)
                logger.info(
                    "生成下一集 project_id=%s progress=%s/%s missing=%s",
                    project_id,
                    generated,
                    total,
                    missing[:5],
                )
                # Lấy khoảng của lô **trước khi** ghi: sau khi merge thì tập đầu đã
                # đạt ngưỡng và hàm này sẽ trả về lô *kế tiếp*. Cùng hàm với
                # `run_episode_script_batch` nên không có chuyện hai bên tính khác nhau.
                span = next_episode_batch_range(existing, total, 1) or (missing[0], missing[-1])
                batch = await run_episode_script_batch(
                    summary,
                    existing,
                    batch_size=1,
                    total=total,
                    creative=creative,
                    locale=locale,
                )
                if not batch:
                    # 原来这个 raise 排在 record_line 之后：任务确实什么都没写，
                    # 但 40 分已经落进 usage_events，failed 也照样收得到。先挪上来。
                    raise RuntimeError("分集生成无进度")
                existing = merge_episode_bodies(existing, batch)
                # 这一轮花了钱，就必须在落用量之前证明它写进了东西。
                next_fp = _episode_content_fingerprint(existing)
                _assert_episode_content_written(
                    where=f"分集正文 第 {missing[0]}–{missing[-1]} 集",
                    before=iter_fp,
                    after=next_fp,
                    spent_llm=True,
                    require_non_empty=True,
                    episodes=existing,
                    task_id=task_id,
                )
                # `episode_content` đổi không đủ: phải là **đúng lô vừa yêu cầu** đã đạt
                # ngưỡng. Nếu không, vòng sau sẽ sinh lại chúng và lại thu tiền (task 821:
                # 3 dòng dùng 40 分 rồi còn 11/12 tập rỗng).
                _assert_requested_episodes_written(
                    where=f"分集正文 第 {span[0]}–{span[1]} 集",
                    episodes=existing,
                    requested=list(range(span[0], span[1] + 1)),
                    task_id=task_id,
                )
                iter_fp = next_fp
                spent_llm = True
                script.episode_content = {"episodes": existing}
                params = dict(script.params or {})
                params["episode_content_status"] = "generating"
                params["episode_count"] = total
                params["episode_content_progress"] = {
                    "done": count_completed_episodes(existing, total),
                    "total": total,
                }
                script.params = params
                await db.commit()
                user = await db.get(User, project.user_id)
                if user:
                    await record_line(
                        db,
                        user_id=user.id,
                        project_id=None,
                        drama_project_id=project.id,
                        billing_key="llm_chat",
                        model=get_settings().model_llm,
                        estimated=True,
                        domain="drama",
                    )
                    await db.commit()
                await db.refresh(script)
                content = script.episode_content
                if isinstance(content, dict) and isinstance(content.get("episodes"), list):
                    existing = list(content["episodes"])
                done_now = count_completed_episodes(existing, total)
                logger.info(
                    "分集进度更新 project_id=%s progress=%s/%s",
                    project_id,
                    done_now,
                    total,
                )
                await _sync_task_progress(
                    done_now,
                    total,
                    phase="generating",
                    message=f"分集剧本进度 {done_now}/{total}",
                )
                guard += 1
                if guard > max(total * 2, 24):
                    raise RuntimeError(
                        f"分集生成未完成（{count_completed_episodes(existing, total)}/{total}）"
                    )

            # 收尾：跑过 LLM 就必须真的写进了正文（大纲那次调用也算花钱）。
            _assert_episode_content_written(
                where="分集剧本生成",
                before=initial_fp,
                after=iter_fp,
                spent_llm=spent_llm,
                require_non_empty=True,
                episodes=existing,
                task_id=task_id,
            )
            params = dict(script.params or {})
            params["episode_content_status"] = "completed"
            params["episode_content_error"] = None
            params["episode_count"] = total
            params["episode_content_progress"] = {"done": total, "total": total}
            script.params = params
            await db.commit()
            await _sync_task_progress(total, total, phase="succeeded", message=f"分集剧本全部完成 {total}/{total}")
            logger.info("分集剧本全部完成 project_id=%s total=%s", project_id, total)
            return {"ok": True, "project_id": project_id, "total": total}
        except Exception as exc:  # noqa: BLE001
            params = dict(script.params or {})
            params["episode_content_status"] = "failed"
            params["episode_content_error"] = str(exc)[:500]
            script.params = params
            await db.commit()
            logger.exception("分集剧本失败 project_id=%s err=%s", project_id, exc)
            return {"ok": False, "error": str(exc)[:500]}


async def _run_single_episode_script_job(
    project_id: int,
    episode_number: int,
    draft: str,
    task_id: int | None = None,
    generate_mode: str = "optimize",
) -> dict[str, Any]:
    """单集：草稿优化 / 创意→摘要 / 创意+摘要→正文 / 一键整集。"""
    mode = (generate_mode or "optimize").strip() or "optimize"
    logger.info(
        "开始单集剧本 project_id=%s episode_number=%s mode=%s draft_len=%s",
        project_id,
        episode_number,
        mode,
        len(draft or ""),
    )

    async with AsyncSessionLocal() as db:
        project = await db.get(
            DramaProject,
            project_id,
            options=[selectinload(DramaProject.script)],
        )
        if not project or not project.script or not project.script.summary:
            logger.warning("单集剧本失败：缺少摘要 project_id=%s", project_id)
            return {"ok": False, "error": "missing_summary"}

        script = project.script
        summary = script.summary if isinstance(script.summary, dict) else {}
        existing: list = []
        content = script.episode_content
        if isinstance(content, dict) and isinstance(content.get("episodes"), list):
            existing = list(content["episodes"])
        elif isinstance(content, list):
            existing = list(content)

        params = dict(script.params or {})
        params["episode_optimize_status"] = "generating"
        params["episode_optimize_number"] = int(episode_number)
        params["episode_optimize_mode"] = mode
        params.pop("episode_optimize_error", None)
        script.params = params
        await db.commit()

        project_source = (script.source or "").strip()
        current = next(
            (
                item
                for item in existing
                if isinstance(item, dict) and int(item.get("episodeNumber") or 0) == int(episode_number)
            ),
            None,
        )
        ep_creative = str((current or {}).get("creative") or "").strip()
        ep_summary = str((current or {}).get("summary") or "").strip()
        ep_title = str((current or {}).get("title") or "").strip() or f"第 {episode_number} 集"
        origin = str((current or {}).get("origin") or "")

        # 已有定妆角色名，约束单集 LLM 称呼
        char_name_rows = (
            await db.execute(
                select(DramaAsset.name).where(
                    DramaAsset.project_id == project.id,
                    DramaAsset.type == "character",
                )
            )
        ).scalars().all()
        character_asset_names = [str(n).strip() for n in char_name_rows if str(n or "").strip()]

        locale = str((project.params or {}).get("locale") or get_settings().default_locale)
        # 比的是**这一集**的整条记录，不是全集正文：summary / brief 模式只回填
        # 创意与摘要，正文理应不变，拿全集正文指纹判必然误报。
        before_fp = _episode_record_fingerprint(_find_episode(existing, episode_number))
        try:
            if mode == "summary":
                if len(ep_creative) < 20:
                    raise ValueError("请先填写本集原始创意（至少 20 字）")
                batch = await run_episode_summary_from_creative(
                    summary,
                    existing,
                    int(episode_number),
                    ep_creative,
                    project_source=project_source,
                    title=ep_title,
                    character_asset_names=character_asset_names,
                    locale=locale,
                )
            elif mode == "body":
                batch = await run_episode_body_from_brief(
                    summary,
                    existing,
                    int(episode_number),
                    creative=ep_creative,
                    summary=ep_summary,
                    project_source=project_source,
                    title=ep_title,
                    character_asset_names=character_asset_names,
                    locale=locale,
                )
            elif mode == "full":
                if len(ep_creative) < 20:
                    raise ValueError("请先填写本集原始创意（至少 20 字）")
                batch = await run_episode_full_from_creative(
                    summary,
                    existing,
                    int(episode_number),
                    ep_creative,
                    project_source=project_source,
                    title=ep_title,
                    character_asset_names=character_asset_names,
                    locale=locale,
                )
            elif mode == "brief":
                ep_body = str((current or {}).get("body") or (current or {}).get("content") or "").strip()
                if len(ep_body) < 80:
                    raise ValueError("请先有本集剧本内容，再补齐创意与摘要")
                batch = await run_episode_brief_from_body(
                    summary,
                    existing,
                    int(episode_number),
                    ep_body,
                    project_source=project_source,
                    title=ep_title,
                    character_asset_names=character_asset_names,
                    locale=locale,
                )
            else:
                if not draft or len(draft) < 20:
                    raise ValueError("请先输入本集剧本草稿，再让 AI 优化")
                batch = await run_episode_script_from_draft(
                    summary,
                    existing,
                    int(episode_number),
                    draft,
                    creative=project_source,
                    character_asset_names=character_asset_names,
                    locale=locale,
                )
            if origin == "manual":
                for item in batch:
                    item["origin"] = "manual"
            # summary 模式不要用空 body 覆盖已有正文
            if mode == "summary" and current:
                for item in batch:
                    item["body"] = str(current.get("body") or "")
            # 写回前刷新，避免覆盖用户在其他集的编辑
            await db.refresh(script)
            fresh_content = script.episode_content
            if isinstance(fresh_content, dict) and isinstance(fresh_content.get("episodes"), list):
                existing = list(fresh_content["episodes"])
            elif isinstance(fresh_content, list):
                existing = list(fresh_content)
            existing = merge_episode_bodies(existing, batch, prefer_incoming=True)
            script.episode_content = {"episodes": existing}

            # 跑过 LLM 就必须真的改了这一集，否则退款 + 报错，绝不 settle。
            # `require_non_empty` 只给产出正文的三种模式：summary 模式本来就允许
            # 这一集还没有正文（它只回填创意与摘要）。
            _assert_episode_content_written(
                where=f"单集剧本 第 {episode_number} 集（{mode}）",
                before=before_fp,
                after=_episode_record_fingerprint(_find_episode(existing, episode_number)),
                spent_llm=True,
                require_non_empty=mode in {"body", "full", "optimize"},
                episodes=existing,
                task_id=task_id,
            )
            # 单集路径同理：`require_non_empty` 问的是「有没有正文」，不是「**这一集**的
            # 正文够不够长」。集号 3 留着别人写的旧正文时，一集 rỗng vẫn lọt qua đó.
            if mode in {"body", "full", "optimize"}:
                _assert_requested_episodes_written(
                    where=f"单集剧本 第 {episode_number} 集（{mode}）",
                    episodes=existing,
                    requested=[int(episode_number)],
                    task_id=task_id,
                )

            assets_created = 0
            assets_reused = 0
            if mode in {"body", "full", "optimize"}:
                try:
                    seed_result = await seed_assets_from_episode_body(
                        db, project, int(episode_number)
                    )
                    assets_created = int(seed_result.created_count)
                    assets_reused = int(seed_result.reused_count)
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "单集正文后增量 seed 失败 project_id=%s episode=%s",
                        project_id,
                        episode_number,
                    )

            params = dict(script.params or {})
            params["episode_optimize_status"] = "completed"
            params["episode_optimize_number"] = int(episode_number)
            params["episode_optimize_mode"] = mode
            params["episode_optimize_assets_created"] = assets_created
            params["episode_optimize_assets_reused"] = assets_reused
            params.pop("episode_optimize_error", None)
            if str(params.get("episode_content_status") or "") != "generating":
                params["episode_content_status"] = "completed"
            script.params = params
            await db.commit()
            user = await db.get(User, project.user_id)
            if user:
                await record_line(
                    db,
                    user_id=user.id,
                    project_id=None,
                    drama_project_id=project.id,
                    billing_key="llm_chat",
                    model=get_settings().model_llm,
                    estimated=True,
                    domain="drama",
                )
                await db.commit()
            if task_id:
                from app.services.tasks.service import append_task_event

                task_row = await db.get(TaskRun, int(task_id))
                if task_row and task_row.status in {"leased", "running", "pending"}:
                    task_row.progress_percent = 100
                    task_row.current_step_key = "episode_script"
                    task_row.current_step_status = "succeeded"
                    await append_task_event(
                        db,
                        int(task_id),
                        event_type="task.progress",
                        status=task_row.status,
                        phase="succeeded",
                        message=f"第 {episode_number} 集已生成（{mode}）",
                        payload={
                            "episode_number": episode_number,
                            "generate_mode": mode,
                            "progress_percent": 100,
                            "assets_created_count": assets_created,
                            "assets_reused_count": assets_reused,
                        },
                    )
                    await db.commit()
            logger.info(
                "单集剧本完成 project_id=%s episode_number=%s mode=%s assets_created=%s",
                project_id,
                episode_number,
                mode,
                assets_created,
            )
            return {
                "ok": True,
                "project_id": project_id,
                "episode_number": episode_number,
                "generate_mode": mode,
                "assets_created_count": assets_created,
                "assets_reused_count": assets_reused,
            }
        except Exception as exc:  # noqa: BLE001
            params = dict(script.params or {})
            params["episode_optimize_status"] = "failed"
            params["episode_optimize_number"] = int(episode_number)
            params["episode_optimize_mode"] = mode
            params["episode_optimize_error"] = str(exc)[:500]
            params["episode_optimize_assets_created"] = 0
            params["episode_optimize_assets_reused"] = 0
            script.params = params
            await db.commit()
            logger.exception(
                "单集剧本失败 project_id=%s episode_number=%s mode=%s err=%s",
                project_id,
                episode_number,
                mode,
                exc,
            )
            return {"ok": False, "error": str(exc)[:500]}


# ---------- episode fragment plan (LLM) ----------


async def run_episode_fragment_plan_job(
    episode_id: int,
    *,
    fallback_rules: bool = True,
    subtitle_enabled: bool | None = None,
    force: bool = False,
) -> dict[str, Any]:
    # Worker：LLM 规划本集分镜并落库；失败可选回退规则切分
    from app.services.drama.build_fragments import build_fragments_from_episode_body
    from app.services.drama.fragment_plan import plan_fragments_with_llm
    from app.services.drama.llm import DramaLlmUnavailableError
    from app.services.drama.seed import (
        _episode_bodies,
        _fragment_is_protected,
        replace_episode_fragments_with_drafts,
        resolve_episode_script_body,
    )

    logger.info("开始单集 LLM 分镜 episode_id=%s", episode_id)
    async with AsyncSessionLocal() as db:
        episode = await db.get(
            DramaEpisode,
            episode_id,
            options=[
                selectinload(DramaEpisode.fragments).selectinload(
                    DramaEpisodeFragment.asset_references
                ),
                selectinload(DramaEpisode.project).selectinload(DramaProject.script),
            ],
        )
        if not episode or not episode.project:
            logger.warning("单集分镜失败：缺少分集 episode_id=%s", episode_id)
            return {"ok": False, "error": "missing_episode"}

        project = episode.project
        script = project.script
        body = resolve_episode_script_body(script.episode_content if script else None, episode)
        if not (body or "").strip():
            params = dict(episode.params or {})
            params["fragment_plan_status"] = "failed"
            params["fragment_plan_error"] = "本集剧本正文为空，无法分镜"
            episode.params = params
            await db.commit()
            return {"ok": False, "error": "empty_body"}

        assets_result = await db.execute(
            select(DramaAsset).where(DramaAsset.project_id == project.id)
        )
        assets = list(assets_result.scalars().all())

        # 本剧更早分集已介绍角色（跨集去重）
        from app.services.drama.build_fragments import collect_series_introduced_names

        siblings_result = await db.execute(
            select(DramaEpisode)
            .where(DramaEpisode.project_id == project.id)
            .options(selectinload(DramaEpisode.fragments))
        )
        siblings = list(siblings_result.scalars().all())
        ep_params = episode.params if isinstance(episode.params, dict) else {}
        raw_subtitles = (
            subtitle_enabled
            if subtitle_enabled is not None
            else (
                False
                if ep_params.get("subtitleMode") == "post"
                else True if ep_params.get("subtitleMode") == "model" else ep_params.get("subtitleEnabled", False)
            )
        )
        if isinstance(raw_subtitles, str):
            normalized = raw_subtitles.strip().lower()
            include_subtitles = normalized not in {"0", "false", "no", "off", ""}
        elif isinstance(raw_subtitles, (int, float)):
            include_subtitles = raw_subtitles != 0
        else:
            include_subtitles = raw_subtitles is not False
        from app.services.drama.build_seedance_generate_body import (
            resolve_episode_character_intro,
        )

        include_character_intro = resolve_episode_character_intro(ep_params)
        ep_no = int(ep_params.get("episodeNumber") or 0) or None
        from app.services.agent.compose import parse_skill_ids

        skill_ids = (
            parse_skill_ids(ep_params.get("fragment_plan_skill_ids"))
            if "fragment_plan_skill_ids" in ep_params
            else None
        )
        already_introduced = collect_series_introduced_names(
            siblings,
            before_episode_number=ep_no,
            exclude_episode_id=episode.id,
        )

        # force：覆盖本集全部分镜；否则锁定已有视频/手改分镜并续拆
        from app.services.drama.build_fragments import extract_introduced_names_from_content

        protected_frags: list[DramaEpisodeFragment] = []
        locked_summaries: list[str] = []
        if not force:
            protected_frags = sorted(
                [f for f in (episode.fragments or []) if _fragment_is_protected(f)],
                key=lambda f: int(f.sort_order or 0),
            )
            for frag in protected_frags:
                for name in extract_introduced_names_from_content(frag.content or ""):
                    already_introduced.add(name)
                # 摘要：去掉 cue 行后取前几行画面/对白
                narr: list[str] = []
                for raw in (frag.content or "").replace("\r\n", "\n").split("\n"):
                    line = raw.strip()
                    if not line or line.startswith("@") or line.startswith("【"):
                        continue
                    narr.append(line)
                    if len(narr) >= 3:
                        break
                locked_summaries.append("；".join(narr) if narr else f"分镜#{frag.sort_order}")

        mode_used = "llm"
        summary = script.summary if script and isinstance(script.summary, dict) else {}
        from app.services.drama.character_intro_llm import prepare_character_intro_overrides

        all_bodies = _episode_bodies(script.episode_content if script else None)
        if body and body not in all_bodies:
            all_bodies.append(body)
        character_assets = [a for a in assets if getattr(a, "type", "") == "character"]
        intro_overrides = (
            await prepare_character_intro_overrides(
                character_assets,
                summary=summary,
                episode_bodies=all_bodies,
                story_type=str(summary.get("storyType") or "") or None,
            )
            if include_character_intro
            else {}
        )
        continuation = bool(locked_summaries) and not force
        try:
            drafts = await plan_fragments_with_llm(
                episode_name=episode.name or "",
                episode_body=body,
                assets=assets,
                episode_number=ep_no,
                project_title=project.title or "",
                story_type=str(summary.get("storyType") or "") or None,
                one_line_story=str(summary.get("oneLineStory") or "") or None,
                synopsis=str(summary.get("synopsis") or "") or None,
                core_hook=str(summary.get("coreHook") or "") or None,
                already_introduced=already_introduced,
                summary=summary,
                episode_bodies=all_bodies,
                intro_overrides=intro_overrides,
                locked_summaries=locked_summaries or None,
                db=db,
                user_id=project.user_id,
                skill_ids=skill_ids,
                include_subtitles=include_subtitles,
                include_character_intro=include_character_intro,
            )
        except (DramaLlmUnavailableError, RuntimeError, Exception) as exc:  # noqa: BLE001
            logger.exception("LLM 分镜失败 episode_id=%s err=%s", episode_id, exc)
            if not fallback_rules:
                params = dict(episode.params or {})
                params["fragment_plan_status"] = "failed"
                params["fragment_plan_error"] = str(exc)[:500]
                episode.params = params
                await db.commit()
                return {"ok": False, "error": str(exc)[:500]}
            drafts = build_fragments_from_episode_body(
                body,
                assets,
                already_introduced=already_introduced,
                summary=summary,
                episode_bodies=all_bodies,
                intro_overrides=intro_overrides,
                include_subtitles=include_subtitles,
                include_character_intro=include_character_intro,
            )
            mode_used = "rules_fallback"
            continuation = False

        await replace_episode_fragments_with_drafts(
            db,
            episode,
            body,
            assets,
            drafts,
            preserve_protected=not force,
            continuation=continuation,
        )
        # 重新加载 params（replace 会写 fingerprint）
        params = dict(episode.params or {})
        params["fragment_plan_status"] = "completed"
        params["fragment_plan_mode"] = mode_used
        params.pop("fragment_plan_error", None)
        params["fragment_plan_count"] = len(protected_frags) + len(drafts)
        params["fragment_plan_preserved"] = len(protected_frags)
        episode.params = params
        user = await db.get(User, project.user_id)
        if user and mode_used == "llm":
            await record_line(
                db,
                user_id=user.id,
                project_id=None,
                drama_project_id=project.id,
                billing_key="llm_chat",
                model=get_settings().model_llm,
                estimated=True,
                domain="drama",
            )
        await db.commit()
        logger.info(
            "单集分镜完成 episode_id=%s mode=%s new=%s preserved=%s continuation=%s",
            episode_id,
            mode_used,
            len(drafts),
            len(protected_frags),
            continuation,
        )
        return {
            "ok": True,
            "mode": mode_used,
            "count": len(protected_frags) + len(drafts),
            "preserved": len(protected_frags),
        }


# ---------- episode video (task platform) ----------

# 任务平台（NIO）：Worker 短生命周期 — prepare → submit → 注册 awaiting_poll，由 Selector 轮询。
async def submit_fragment_video_task(task: TaskRun) -> dict[str, Any]:
    from app.services.tasks.service import append_task_event, get_task_for_runtime, set_task_step_state

    payload = task.payload if isinstance(task.payload, dict) else {}
    nio_phase = str(payload.get("nio_phase") or "prepare")
    fragment_ids = payload.get("fragment_ids") or []
    fragment_id = int(task.fragment_id or (fragment_ids[0] if fragment_ids else 0))
    episode_id = int(task.episode_id or payload.get("episode_id") or 0)
    user_id = int(task.requested_by)
    if fragment_id <= 0 or episode_id <= 0:
        raise ValueError("任务缺少 episode_id / fragment_id")

    async with AsyncSessionLocal() as db:
        task_row = await get_task_for_runtime(db, task.id)
        if not task_row:
            return {"ok": False, "error": "missing_task"}
        ep = await db.get(
            DramaEpisode,
            episode_id,
            options=[selectinload(DramaEpisode.project).selectinload(DramaProject.script)],
        )
        if not ep or not ep.project:
            raise ValueError("分集或项目不存在")
        project = ep.project
        user = await db.get(User, user_id)
        if not user:
            raise ValueError("用户不存在")
        frag = await db.get(
            DramaEpisodeFragment,
            fragment_id,
            options=[
                selectinload(DramaEpisodeFragment.asset_references).selectinload(
                    DramaFragmentAssetRef.asset
                )
            ],
        )
        if not frag or frag.episode_id != episode_id:
            raise ValueError("分镜不存在")

        if _is_episode_video_cancelled(episode_id):
            params = dict(frag.params or {})
            params.pop("generation_attempts", None)
            params["generation"] = {"status": "cancelled", "error": "任务已取消"}
            frag.params = params
            await db.commit()
            return {"ok": False, "cancelled": True}

        gen = frag.params.get("generation") if isinstance(frag.params, dict) else None
        # 仅统计「同一次任务」内 prepare 被重新拉起的次数（中断重入等），
        # 用户再次点生成 / 任务重试会清零 generation_attempts。
        persisted_attempts = int((frag.params or {}).get("generation_attempts") or 0)
        prev_attempts = persisted_attempts
        if isinstance(gen, dict):
            # queued 态不应继承上次失败的 attempts 展示值
            if str(gen.get("status") or "") in {"queued", "idle", "cancelled", "done"}:
                prev_attempts = persisted_attempts
            else:
                prev_attempts = max(prev_attempts, int(gen.get("attempts") or 0))
        max_attempts = max(1, int(get_settings().drama_fragment_max_attempts or 3))
        attempts = prev_attempts + 1 if nio_phase == "prepare" else int(payload.get("generation_attempts") or prev_attempts + 1)
        if nio_phase == "prepare" and attempts > max_attempts:
            params = dict(frag.params or {})
            # raise 用纯超限文案；展示拼接交给 build_failed_generation_params / _fail_task
            limit_msg = f"分镜内部自动重试超过上限（{max_attempts} 次）"
            params["generation"] = build_failed_generation_params(
                gen if isinstance(gen, dict) else None,
                limit_msg,
                attempts=prev_attempts,
                attempt_limit=max_attempts,
            )
            frag.params = params
            await db.commit()
            raise RuntimeError(limit_msg)

        if nio_phase == "prepare":
            params = dict(frag.params or {})
            params["generation_attempts"] = attempts
            params["generation"] = {
                "status": "running",
                "phase": "assets",
                "attempts": attempts,
                "attempt_limit": max_attempts,
            }
            frag.params = params
            task_row.progress_percent = max(int(task_row.progress_percent or 0), 10)
            task_row.current_step_status = "preparing"
            await db.commit()

            prepared = await prepare_fragment_video_for_submit(
                db,
                user,
                project,
                frag,
                model_id=(payload.get("model_id") or None),
            )
            now = datetime.now(UTC)
            next_payload = dict(payload)
            next_payload["nio_phase"] = "submit"
            next_payload["generation_attempts"] = attempts
            next_payload["attempt_limit"] = max_attempts
            next_payload["prepared"] = serialize_fragment_video_prepared(prepared)
            task_row.status = "pending"
            task_row.progress_percent = 25
            task_row.current_step_status = "prepared"
            task_row.payload = next_payload
            task_row.next_action_at = now
            task_row.lease_token = None
            task_row.lease_until = None
            step = task_row.steps[0] if task_row.steps else None
            set_task_step_state(task_row, step, status="prepared", now=now)
            await append_task_event(
                db,
                task_row.id,
                event_type="task.prepared",
                status=task_row.status,
                phase=task_row.current_step_key,
                message="参考资源就绪，重新入队提交",
            )
            await db.commit()
            return {"deferred": True, "nio_phase": "submit"}

        # nio_phase == submit：仅 HTTP 注册上游，立即释放 Worker
        prepared_raw = payload.get("prepared")
        if not isinstance(prepared_raw, dict):
            prepared = await prepare_fragment_video_for_submit(
                db,
                user,
                project,
                frag,
                model_id=(payload.get("model_id") or None),
            )
        else:
            prepared = deserialize_fragment_video_prepared(prepared_raw)

        params = dict(frag.params or {})
        params["generation"] = {
            "status": "running",
            "phase": "submit",
            "attempts": attempts,
            "attempt_limit": max_attempts,
        }
        frag.params = params
        task_row.progress_percent = max(int(task_row.progress_percent or 0), 30)
        task_row.current_step_status = "submitting"
        await db.commit()

        provider_task_id = await submit_prepared_fragment_video(prepared, project_id=project.id)
        poll_interval = max(1.0, float(get_settings().ark_video_poll_interval or 8.0))
        now = datetime.now(UTC)
        # 提交成功后立刻写成 running/polling，避免前端长期停在「排队」
        params = dict(frag.params or {})
        params["generation"] = {
            "status": "running",
            "phase": "polling",
            "attempts": attempts,
            "attempt_limit": max_attempts,
            "message": "上游生成中",
            "provider_task_id": provider_task_id,
        }
        frag.params = params
        task_row.status = "awaiting_poll"
        task_row.provider_task_id = provider_task_id
        task_row.progress_percent = 40
        task_row.current_step_status = "polling"
        task_row.next_action_at = now + timedelta(seconds=poll_interval)
        task_row.lease_token = None
        task_row.lease_until = None
        next_payload = dict(payload)
        next_payload.pop("prepared", None)
        next_payload["nio_phase"] = "poll"
        next_payload["generation_attempts"] = attempts
        next_payload["attempt_limit"] = max_attempts
        task_row.payload = next_payload
        step = task_row.steps[0] if task_row.steps else None
        set_task_step_state(task_row, step, status="polling", now=now)
        await append_task_event(
            db,
            task_row.id,
            event_type="task.registered",
            status=task_row.status,
            phase=task_row.current_step_key,
            message="已注册上游，Selector 非阻塞轮询",
            payload={"provider_task_id": provider_task_id},
        )
        await db.commit()
        return {"awaiting_poll": True, "provider_task_id": provider_task_id}


# 分镜视频收尾认领窗口：期内其它 poller 不得再入下载；需覆盖整段下载+OSS（常达数分钟）。
_FRAGMENT_FINALIZE_CLAIM_TTL = timedelta(minutes=10)


# 统一解析 TaskRun.next_action_at 的时区，便于与 now 比较。
def _aware_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


# 分镜是否已落成片（崩溃恢复时可跳过重复下载）。
def _fragment_video_already_applied(frag: DramaEpisodeFragment | None) -> bool:
    if frag is None or not (frag.video or "").strip():
        return False
    params = frag.params if isinstance(frag.params, dict) else {}
    gen = params.get("generation") if isinstance(params.get("generation"), dict) else {}
    return str(gen.get("status") or "").strip().lower() == "done"


# 成片已 done 但任务仍 awaiting_poll：立刻补 complete（避免 UI 长期「生成中」）
async def reconcile_applied_fragment_video_tasks(
    db: AsyncSession,
    tasks: list[TaskRun],
) -> int:
    fixed = 0
    for task in tasks:
        if getattr(task, "task_type", None) != "fragment_video":
            continue
        if str(getattr(task, "status", "") or "") != "awaiting_poll":
            continue
        fid = getattr(task, "fragment_id", None)
        if fid is None:
            continue
        frag = await db.get(DramaEpisodeFragment, int(fid))
        if not _fragment_video_already_applied(frag):
            continue
        payload = task.payload if isinstance(task.payload, dict) else {}
        ok = await _recover_complete_fragment_video(
            db,
            int(task.id),
            fragment_id=int(fid),
            batch_key=task.batch_key,
            batch_index=int(payload.get("batch_index", 0)),
        )
        if ok:
            fixed += 1
    if fixed:
        logger.info("已补完成成片已落盘的分镜任务 count=%s", fixed)
    return fixed


# 行锁后补完成分镜视频任务；已非 awaiting_poll 则跳过，避免并发双 complete。
async def _recover_complete_fragment_video(
    db: AsyncSession,
    task_id: int,
    *,
    fragment_id: int,
    batch_key: str | None,
    batch_index: int,
    recovered: bool = True,
) -> bool:
    from app.services.billing.settlement import _lock_task
    from app.services.tasks.executor import _complete_task
    from app.services.tasks.service import activate_next_sequential_task

    locked = await _lock_task(db, int(task_id))
    if not locked or locked.status != "awaiting_poll":
        return False
    # 异步会话下 steps 懒加载会 MissingGreenlet，补完成前显式加载
    await db.refresh(locked, attribute_names=["steps"])
    # 先 complete（commit 后锁释放），再激活后续；避免 activate 提前 commit 导致并发双 complete
    locked.progress_percent = 100
    result_payload: dict[str, Any] = {"ok": True, "fragment_id": int(fragment_id)}
    if recovered:
        result_payload["recovered"] = True
    await _complete_task(db, locked, result_payload)
    await activate_next_sequential_task(db, batch_key, batch_index)
    payload = locked.payload if isinstance(locked.payload, dict) else {}
    if payload.get("sequential") and locked.drama_project_id:
        from app.services.tasks.service import rebalance_project_fragment_video_queue

        await rebalance_project_fragment_video_queue(
            db,
            int(locked.drama_project_id),
            sequential=True,
            user_id=int(locked.requested_by),
        )
    return True


async def _settle_cancelled_after_finalized(db: AsyncSession, task_id: int) -> bool:
    """取消在 finalizing 窗口内生效、但成片已下载落盘：按实际用量结算，终态保持 cancelled。

    若不收敛，usage_events 会永久 settled=False、冻结额被 _mark_cancelled 全额退回，
    形成钱货两失。settle_task 对 frozen 任务按 events 多退少补，对已结算任务幂等。
    不激活后续顺序任务（用户取消应阻断队列）。
    """
    from app.services.billing.settlement import _lock_task, settle_task
    from app.services.tasks.service import append_task_event, clear_finalizing_window

    locked = await _lock_task(db, task_id)
    if not locked:
        return False
    locked.payload = clear_finalizing_window(locked.payload)
    locked.status = "cancelled"
    locked.cancel_requested = True
    locked.current_step_status = "done"
    locked.progress_percent = 100
    locked.finished_at = datetime.now(UTC)
    locked.next_action_at = None
    locked.lease_token = None
    locked.lease_until = None
    # frozen：按已落账用量退差额；已 settled（竞态中先被结算）：幂等对齐
    await settle_task(db, task_id)
    await append_task_event(
        db,
        task_id,
        event_type="task.cancelled",
        status="cancelled",
        phase="fragment_video",
        message="取消在成片收尾窗口内生效，成片已交付，按实际用量结算",
    )
    await db.commit()
    return True


# 任务平台：轮询 awaiting_poll 的分镜视频任务。
async def poll_fragment_video_task(task_id: int) -> None:
    from app.services.ark import get_ark
    from app.services.billing.context import billing_scope
    from app.services.billing.settlement import _lock_task
    from app.services.tasks.executor import _fail_task
    from app.services.tasks.service import get_task_for_runtime

    async with billing_scope(task_id):
        async with AsyncSessionLocal() as db:
            task = await get_task_for_runtime(db, task_id)
            if not task or task.status != "awaiting_poll" or not task.provider_task_id:
                return
            payload = task.payload if isinstance(task.payload, dict) else {}
            fragment_ids = payload.get("fragment_ids") or []
            fragment_id = int(task.fragment_id or (fragment_ids[0] if fragment_ids else 0))
            episode_id = int(task.episode_id or payload.get("episode_id") or 0)
            user_id = int(task.requested_by)
            attempts = int(payload.get("generation_attempts") or 1)
            attempt_limit = int(payload.get("attempt_limit") or get_settings().drama_fragment_max_attempts or 3)
            poll_interval = max(1.0, float(get_settings().ark_video_poll_interval or 8.0))
            now = datetime.now(UTC)

            frag_probe = await db.get(DramaEpisodeFragment, fragment_id) if fragment_id > 0 else None
            if fragment_id <= 0 or frag_probe is None:
                await _fail_task(db, task, RuntimeError("分镜已变更，请重新生成"))
                return

            # 成片已落盘：优先补完成，不被 finalizing 认领窗口挡住
            if _fragment_video_already_applied(frag_probe):
                await _recover_complete_fragment_video(
                    db,
                    int(task.id),
                    fragment_id=fragment_id,
                    batch_key=task.batch_key,
                    batch_index=int(payload.get("batch_index", 0)),
                )
                return

            # 收尾认领窗口未到期：跳过，避免并发下载双记费
            if (task.current_step_status or "") == "finalizing":
                na = _aware_utc(task.next_action_at)
                if na is not None and na > now:
                    return

            if task.cancel_requested or _is_episode_video_cancelled(episode_id):
                await _fail_task(db, task, RuntimeError("任务已取消"))
                return

            if str(payload.get("video_provider") or "") == "kie":
                await _fail_task(db, task, RuntimeError("已改为 TokenFree 通道，请重新生成本镜视频"))
                return

            result = await get_ark().fetch_task_once(task.provider_task_id)
            if result.status == "running":
                task.next_action_at = now + timedelta(seconds=poll_interval)
                task.progress_percent = min(95, int(task.progress_percent or 40) + 3)
                task.current_step_status = "polling"
                await db.commit()
                return
            if result.status != "succeeded":
                frag = await db.get(DramaEpisodeFragment, fragment_id)
                if frag:
                    params = dict(frag.params or {})
                    prev_gen = params.get("generation") if isinstance(params.get("generation"), dict) else None
                    params["generation"] = build_failed_generation_params(
                        prev_gen if isinstance(prev_gen, dict) else None,
                        str(result.error or "上游生成失败"),
                        attempts=attempts,
                        attempt_limit=attempt_limit,
                    )
                    frag.params = params
                await _fail_task(db, task, RuntimeError(result.error or "上游生成失败"))
                return

            ep = await db.get(DramaEpisode, episode_id, options=[selectinload(DramaEpisode.project)])
            user = await db.get(User, user_id)
            frag = await db.get(DramaEpisodeFragment, fragment_id)
            if not ep or not ep.project or not user or not frag:
                await _fail_task(db, task, RuntimeError("分镜已变更，请重新生成"))
                return

            # 行锁认领：仅第一个收尾者进入下载；窗口内其余看到 finalizing 后退出
            locked = await _lock_task(db, int(task.id))
            if not locked or locked.status != "awaiting_poll":
                return
            if (locked.current_step_status or "") == "finalizing":
                na = _aware_utc(locked.next_action_at)
                if na is not None and na > now:
                    return
            # 等锁期间用户可能已取消：放弃下载，交由 executor 按未交付全额退款
            if locked.cancel_requested or _is_episode_video_cancelled(episode_id):
                await _fail_task(db, locked, RuntimeError("任务已取消"))
                return
            # 认领前后成片已在：行锁后只补完成（避免 apply 后异常释放认领再二次下载）
            if _fragment_video_already_applied(frag):
                await _recover_complete_fragment_video(
                    db,
                    int(locked.id),
                    fragment_id=fragment_id,
                    batch_key=locked.batch_key,
                    batch_index=int(payload.get("batch_index", 0)),
                )
                return
            # 置 finalizing 并写窗口截止：_mark_cancelled 在窗口内不做全额退款，
            # 防止下载/落账与取消并发造成 usage 悬空、钱货两失
            finalizing_until = now + _FRAGMENT_FINALIZE_CLAIM_TTL
            final_payload = dict(locked.payload if isinstance(locked.payload, dict) else {})
            final_payload["finalizing_until"] = finalizing_until.isoformat()
            locked.payload = final_payload
            locked.current_step_status = "finalizing"
            locked.progress_percent = max(int(locked.progress_percent or 0), 90)
            locked.next_action_at = finalizing_until
            await db.commit()

            try:
                local_video, local_last_frame = await get_ark().save_video_assets_from_result(
                    result,
                    project_id=ep.project.id,
                    shot_no=fragment_id,
                )
                await apply_fragment_video_assets(
                    db,
                    user,
                    ep.project,
                    frag,
                    local_video=local_video,
                    local_last_frame=local_last_frame,
                    attempts=attempts,
                    attempt_limit=attempt_limit,
                    task_result=result,
                    provider_task_id=task.provider_task_id,
                )
                # apply 已 commit：行锁复查。下载期间用户可能已取消（status=cancel_requested），
                # 此时不能走常规 complete，也不能放任 frozen 全额退款，按实际用量结算为 cancelled。
                async with AsyncSessionLocal() as recheck_db:
                    rechecked = await _lock_task(recheck_db, int(task.id))
                    was_cancelled = bool(
                        rechecked
                        and (
                            rechecked.cancel_requested
                            or rechecked.status in ("cancel_requested", "cancelled")
                        )
                    )
                if was_cancelled:
                    async with AsyncSessionLocal() as cancel_db:
                        await _settle_cancelled_after_finalized(cancel_db, int(task.id))
                    return
                # 未取消：立刻把 next_action 拉回现在，complete 失败时也能马上被 Selector 捞到
                async with AsyncSessionLocal() as nudge_db:
                    nudged = await nudge_db.get(TaskRun, int(task_id))
                    if nudged and nudged.status == "awaiting_poll":
                        nudged.next_action_at = datetime.now(UTC)
                        await nudge_db.commit()
                # 与恢复路径同一套行锁 complete，避免 apply 后并发双 complete
                await _recover_complete_fragment_video(
                    db,
                    int(task_id),
                    fragment_id=fragment_id,
                    batch_key=task.batch_key,
                    batch_index=int(payload.get("batch_index", 0)),
                    recovered=False,
                )
            except BaseException:
                # 含 CancelledError：poller wait_for 超时会取消协程，必须释放认领，否则 next_action 卡数小时
                from app.services.tasks.service import clear_finalizing_window

                async with AsyncSessionLocal() as release_db:
                    stalled = await _lock_task(release_db, int(task_id))
                    if (
                        stalled
                        and stalled.status == "awaiting_poll"
                        and (stalled.current_step_status or "") == "finalizing"
                    ):
                        frag_done = await release_db.get(DramaEpisodeFragment, fragment_id)
                        finalized = _fragment_video_already_applied(frag_done)
                        if finalized and stalled.cancel_requested:
                            # 成片已落盘且用户在窗口内取消：按实结算（与成功路径同一收敛）
                            await _settle_cancelled_after_finalized(release_db, int(task.id))
                        elif finalized:
                            # 成片已落盘：只补 complete，勿退回 polling 以免误伤
                            stalled.payload = clear_finalizing_window(stalled.payload)
                            stalled.next_action_at = datetime.now(UTC)
                            await release_db.commit()
                        else:
                            # 未交付：退回 polling 并清窗口标记，取消可立即走全额退款
                            stalled.payload = clear_finalizing_window(stalled.payload)
                            stalled.current_step_status = "polling"
                            stalled.next_action_at = datetime.now(UTC) + timedelta(seconds=poll_interval)
                            await release_db.commit()
                raise


# ---------- asset image ----------


async def dispatch_asset_image_job(
    db: AsyncSession,
    user: User,
    project_id: int,
    user_id: int,
    prompt: str,
    asset_id: int | None = None,
    name: str | None = None,
    kind: str = "character",
    *,
    image_style_id: str | None = None,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
) -> int:
    """入队资产生图任务。"""
    task_id = await _enqueue_drama_task(
        db,
        user,
        task_type="asset_image",
        project_id=project_id,
        dedupe_suffix=f"{project_id}:asset:{asset_id or 0}",
        asset_id=asset_id,
        payload={
            "project_id": project_id,
            "user_id": user_id,
            "prompt": prompt,
            "asset_id": asset_id,
            "name": name,
            "kind": kind,
            "image_style_id": image_style_id,
            "model_id": model_id,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
        },
        commit=False,
    )
    logger.info("dispatch 资产生图 → task_id=%s project_id=%s asset_id=%s", task_id, project_id, asset_id)
    return task_id


async def run_asset_image_job(
    project_id: int,
    user_id: int,
    prompt: str,
    asset_id: int | None = None,
    name: str | None = None,
    kind: str = "character",
    *,
    image_style_id: str | None = None,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
) -> dict[str, Any]:
    logger.info(
        "开始资产生图 project_id=%s asset_id=%s kind=%s name=%s style=%s model=%s",
        project_id,
        asset_id,
        kind,
        name,
        image_style_id,
        model_id,
    )
    async with AsyncSessionLocal() as db:
        project = (
            await db.execute(
                select(DramaProject)
                .where(DramaProject.id == project_id)
                .options(selectinload(DramaProject.script))
            )
        ).scalar_one_or_none()
        user = await db.get(User, user_id)
        if not project or not user:
            return {"ok": False, "error": "missing"}
        asset = None
        if asset_id:
            asset = await db.get(DramaAsset, asset_id)
            if not asset or asset.project_id != project_id:
                return {"ok": False, "error": "asset_not_found"}
            params = dict(asset.params or {})
            gen = dict(params.get("generation") or {})
            gen["status"] = "generating"
            gen["message"] = "生图中"
            params["generation"] = gen
            asset.params = params
            await db.commit()
        try:
            resolved_prompt = prompt
            if asset:
                resolved_prompt = await resolve_visual_prompt_for_asset(asset, project, prompt, db=db)
                params = dict(asset.params or {})
                params["visualPrompt"] = resolved_prompt
                if not str(params.get("visualImage") or "").strip():
                    params["visualImage"] = resolved_prompt
                asset.params = params
                await db.commit()
                await db.refresh(asset)
                logger.info(
                    "资产生图提示词已解析 project_id=%s asset_id=%s len=%s",
                    project_id,
                    asset_id,
                    len(resolved_prompt),
                )
            asset = await generate_asset_image(
                db,
                user,
                project,
                resolved_prompt,
                asset=asset,
                name=name,
                kind=kind,
                image_style_id=image_style_id,
                model_id=model_id,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
            )
            params = dict(asset.params or {})
            gen = dict(params.get("generation") or {})
            gen["status"] = "done"
            params["generation"] = gen
            asset.params = params
            await db.commit()
            logger.info(
                "资产生图完成 project_id=%s asset_id=%s url=%s",
                project_id,
                asset.id,
                (asset.url or asset.cover or "")[:80],
            )
            return {"ok": True, "asset_id": asset.id}
        except Exception as exc:  # noqa: BLE001
            from app.services.exc_format import format_exception_message

            err_text = format_exception_message(exc, fallback="生图失败", limit=500)
            if asset_id:
                asset = await db.get(DramaAsset, asset_id)
                if asset:
                    params = dict(asset.params or {})
                    params["generation"] = {"status": "failed", "error": err_text[:400]}
                    asset.params = params
                    await db.commit()
            logger.exception(
                "资产生图失败 project_id=%s asset_id=%s err=%s",
                project_id,
                asset_id,
                err_text,
            )
            return {"ok": False, "error": err_text}


# ---------- asset video ----------


async def dispatch_asset_video_job(
    db: AsyncSession,
    user: User,
    project_id: int,
    user_id: int,
    prompt: str,
    asset_id: int,
    *,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    duration_sec: int | None = None,
    image_style_id: str | None = None,
    reference_asset_ids: list[int] | None = None,
) -> int:
    """入队资产生视频任务。"""
    task_id = await _enqueue_drama_task(
        db,
        user,
        task_type="asset_video",
        project_id=project_id,
        dedupe_suffix=f"{project_id}:asset:{asset_id}",
        asset_id=asset_id,
        payload={
            "project_id": project_id,
            "user_id": user_id,
            "prompt": prompt,
            "asset_id": asset_id,
            "model_id": model_id,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "duration_sec": duration_sec,
            "image_style_id": image_style_id,
            "reference_asset_ids": reference_asset_ids or [],
        },
        commit=False,
    )
    logger.info("dispatch 资产生视频 → task_id=%s asset_id=%s", task_id, asset_id)
    return task_id


async def run_asset_video_job(
    project_id: int,
    user_id: int,
    prompt: str,
    asset_id: int,
    *,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    duration_sec: int | None = None,
    image_style_id: str | None = None,
    reference_asset_ids: list[int] | None = None,
) -> dict[str, Any]:
    logger.info(
        "开始资产生视频 project_id=%s asset_id=%s model=%s duration=%s",
        project_id,
        asset_id,
        model_id,
        duration_sec,
    )
    async with AsyncSessionLocal() as db:
        project = (
            await db.execute(
                select(DramaProject)
                .where(DramaProject.id == project_id)
                .options(selectinload(DramaProject.script))
            )
        ).scalar_one_or_none()
        user = await db.get(User, user_id)
        asset = await db.get(DramaAsset, asset_id)
        if not project or not user:
            return {"ok": False, "error": "missing"}
        if not asset or asset.project_id != project_id:
            return {"ok": False, "error": "asset_not_found"}
        try:
            params = dict(asset.params or {})
            params["visualPrompt"] = (prompt or "").strip()
            asset.params = params
            await db.commit()
            await db.refresh(asset)
            asset = await generate_asset_video(
                db,
                user,
                project,
                asset,
                prompt,
                model_id=model_id,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                duration_sec=duration_sec,
                image_style_id=image_style_id,
                reference_asset_ids=reference_asset_ids,
            )
            logger.info(
                "资产生视频完成 project_id=%s asset_id=%s url=%s",
                project_id,
                asset.id,
                (asset.url or "")[:80],
            )
            return {"ok": True, "asset_id": asset.id}
        except Exception as exc:  # noqa: BLE001
            from app.services.exc_format import format_exception_message

            err_text = format_exception_message(exc, fallback="生视频失败", limit=500)
            asset = await db.get(DramaAsset, asset_id)
            if asset:
                params = dict(asset.params or {})
                params["generation"] = {"status": "failed", "error": err_text[:400]}
                if (prompt or "").strip():
                    params["visualPrompt"] = prompt.strip()
                asset.params = params
                await db.commit()
            logger.exception(
                "资产生视频失败 project_id=%s asset_id=%s err=%s",
                project_id,
                asset_id,
                err_text,
            )
            return {"ok": False, "error": err_text}


# ---------- seed assets from script ----------


async def run_seed_assets_job(
    project_id: int,
    *,
    refresh_prompts: bool = False,
    reextract_props: bool = False,
) -> dict[str, Any]:
    """从剧本抽取/刷新资产（含 LLM 提示词刷新）。"""
    from app.services.drama.seed import seed_assets_from_script

    logger.info(
        "开始抽取漫剧资产 project_id=%s refresh=%s reextract=%s",
        project_id,
        refresh_prompts,
        reextract_props,
    )
    async with AsyncSessionLocal() as db:
        project = await db.get(
            DramaProject,
            project_id,
            options=[selectinload(DramaProject.script)],
        )
        if not project:
            return {"ok": False, "error": "project_not_found"}
        params = dict(project.params or {}) if isinstance(project.params, dict) else {}
        try:
            result = await seed_assets_from_script(
                db,
                project,
                refresh_prompts=refresh_prompts,
                reextract_props=reextract_props,
            )
            params["assets_seed_status"] = "done"
            params.pop("assets_seed_error", None)
            params.pop("assets_seed_generating_at", None)
            params["assets_seed_created"] = result.created_count
            params["assets_seed_refreshed"] = result.prompts_refreshed
            params["assets_seed_props_updated"] = result.props_updated
            if result.llm_errors:
                params["assets_seed_llm_errors"] = result.llm_errors[:20]
            else:
                params.pop("assets_seed_llm_errors", None)
            project.params = params
            user = await db.get(User, project.user_id)
            if user:
                await record_seed_assets_llm_usage(db, user, project.id, result)
            await db.commit()
            return {
                "ok": True,
                "created_count": result.created_count,
                "prompts_refreshed": result.prompts_refreshed,
                "props_updated": result.props_updated,
                "llm_errors": result.llm_errors,
            }
        except Exception as exc:  # noqa: BLE001
            params["assets_seed_status"] = "failed"
            params["assets_seed_error"] = str(exc)[:500]
            params.pop("assets_seed_generating_at", None)
            project.params = params
            await db.commit()
            logger.exception("抽取漫剧资产失败 project_id=%s", project_id)
            return {"ok": False, "error": str(exc)[:500]}


async def dispatch_seed_assets_job(
    db: AsyncSession,
    user: User,
    project_id: int,
    *,
    refresh_prompts: bool = False,
    reextract_props: bool = False,
) -> int:
    """入队抽取漫剧资产任务。"""
    task_id = await _enqueue_drama_task(
        db,
        user,
        task_type="seed_assets",
        project_id=project_id,
        dedupe_suffix=str(project_id),
        payload={
            "project_id": project_id,
            "refresh_prompts": refresh_prompts,
            "reextract_props": reextract_props,
        },
    )
    logger.info("dispatch 抽取资产 → task_id=%s project_id=%s", task_id, project_id)
    return task_id
