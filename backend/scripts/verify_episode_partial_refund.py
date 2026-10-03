"""Đo phần hoàn tiền: một vòng sinh **không ra tập** thì phải không thu được tiền nào.

Vì sao script này **bịt** `drama_chat_json`: điều đang kiểm là *số tiền*, mà số tiền
chỉ quyết định ở `record_line` → `settle_task`. Câu trả lời của LLM là **đầu vào** của
phép kiểm, không phải phần đang kiểm — nên bịt nó là cách duy nhất để chạy đúng nhánh
lỗi mỗi lần thay vì chờ may rủi. Mọi thứ còn lại — job thật, `record_line` thật,
`freeze_for_task` thật, `settle_task` thật, ví thật trên Postgres thật — đều là production.

Bằng chứng trên **LLM thật** cho cùng lỗi nằm ở
`docs/analysis/case-episode-user-message-and-partial-refund-b4.md`: task 826
(project 42, 2026-10-03) bị chính chốt chặn này bắn, dòng `usage_events` bằng 0, và
người dùng không mất đồng nào — bản chạy đó dùng model `mimo-v2.6-flash-free` thật.

Chạy (cần backend deps, không cần backend đang chạy):
    cd backend && python scripts/verify_episode_partial_refund.py
"""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402

CREATIVE = (
    "Một người lạ tìm thấy mảnh giấy trong chuyến xe hoa tốc và lần theo bí mật của "
    "một gia đình mà không ai muốn nói ra."
)
LONG_BODY = "Linh cúi xuống mảnh giấy, ngón tay hơi run. " * 20
SHORT_BODY = "Linh cúi xuống mảnh giấy."


async def main() -> None:
    from app.services.billing.context import billing_scope
    from app.services.billing.settlement import freeze_for_task, settle_task
    from app.services.drama import jobs as drama_jobs
    from app.services.model_settings import load_model_settings_cache

    async with AsyncSessionLocal() as db:
        await load_model_settings_cache(db)
        from app.models import User  # noqa: F401  (dùng ở block bên dưới)

    scenario = sys.argv[1] if len(sys.argv) > 1 else "short-first"
    if scenario not in {"short-first", "short-second", "all-good"}:
        print(f"unknown scenario {scenario!r}")
        sys.exit(2)

    async with AsyncSessionLocal() as db:
        # Mỗi lượt chạy dùng **một tài khoản riêng** với số dư riêng. Dùng chung tài
        # khoản cũ thì lượt trước làm cạn ví và lượt sau hỏng với lý do không liên quan
        # (`余额不足`) — đo sai nguyên nhân, đúng cái bài học trong `AGENTS.md` về cờ
        # billing: phải đọc lại cờ trước mỗi lần đo tiền.
        import uuid

        from app.models import User
        from app.models_tasks import TaskRun
        from app.models_drama import DramaProject, DramaScript

        user = User(
            email=f"bunny4-refund-{uuid.uuid4().hex[:10]}@novafilm.probe",
            hashed_password="not-used-here",
            balance_fen=100_000,
        )
        db.add(user)
        await db.flush()

        project = DramaProject(
            user_id=user.id,
            title=f"bunny4 refund acceptance {scenario}",
            description="wave 2: per-episode refund, real billing rows",
            params={"episode_count": 3, "locale": "vi", "workflow": "script"},
        )
        db.add(project)
        await db.flush()
        script = DramaScript(
            project_id=project.id,
            source=CREATIVE,
            summary={"logline": "test", "episodeCount": 3},
            episode_content={
                "episodes": [
                    {"episodeNumber": n, "title": f"Tập {n}", "body": ""} for n in (1, 2, 3)
                ]
            },
            params={"episode_count": 3, "locale": "vi"},
        )
        db.add(script)
        await db.flush()

        balance_before = int(user.balance_fen or 0)
        task = TaskRun(
            domain="drama",
            task_type="episode_script",
            status="running",
            requested_by=user.id,
            payload={"project_id": project.id, "force": True, "total": 3},
            drama_project_id=project.id,
        )
        db.add(task)
        await db.flush()
        user_id = int(user.id)
        await db.commit()
        frozen = await freeze_for_task(db, task)
        await db.commit()
        task_id = int(task.id)
        project_id = int(project.id)
        print(f"scenario={scenario}  project_id={project_id}  task_id={task_id}")
        print(f"  frozen={frozen}  wallet before={balance_before}")

    # ---- chỉ bịt đầu vào LLM; phần tiền là production ----
    calls: list[int] = []
    real_llm = drama_jobs.run_episode_script_batch

    async def fake_batch(_summary, existing, **_kwargs):
        from app.services.drama.agents import auto_missing_episode_numbers

        want = auto_missing_episode_numbers(existing, 3)[0]
        calls.append(want)
        if scenario == "short-first":
            body = SHORT_BODY
        elif scenario == "short-second":
            body = LONG_BODY if want == 1 else SHORT_BODY
        else:
            body = LONG_BODY
        return [{"episodeNumber": want, "title": f"Tập {want}", "body": body}]

    drama_jobs.run_episode_script_batch = fake_batch
    async with AsyncSessionLocal() as db:
        async with billing_scope(task_id):
            result = await drama_jobs.run_episode_scripts_job(
                project_id=project_id, force=True, task_id=task_id
            )
        settled = await settle_task(db, task_id)
        await db.commit()
        rows = (
            await db.execute(
                text(
                    "select id, charge_fen, billing_key from usage_events"
                    " where task_run_id = :t order by id"
                ),
                {"t": task_id},
            )
        ).all()
        fresh = (
            await db.execute(
                text("select episode_content from drama_scripts where project_id = :p"),
                {"p": project_id},
            )
        ).first()[0]
        user = await db.get(User, user_id)
        balance_after = int(user.balance_fen or 0)
    drama_jobs.run_episode_script_batch = real_llm

    episodes = (fresh or {}).get("episodes") or []
    kept = {
        int(e.get("episodeNumber") or 0): len("".join(str(e.get("body") or "").split()))
        for e in episodes
    }
    charged = sum(int(r[1] or 0) for r in rows)

    print(f"\n== MEASURED ==")
    print(f"  requested episodes per round : {calls}")
    print(f"  job result                  : {result}")
    print(f"  usage_events rows           : {len(rows)} {[int(r[1] or 0) for r in rows]}")
    print(f"  episode_content kept        : {kept}")
    print(f"  settle_task charged         : {settled['charged']}")
    print(f"  settle_task refunded        : {settled['refunded']} (frozen {frozen})")
    print(f"  wallet {balance_before} -> {balance_after} (delta {balance_before - balance_after})")

    checks = {
        "no usage row for a round that wrote nothing": charged == settled["charged"],
        "wallet only ever loses what was charged": (
            balance_before - balance_after == settled["charged"]
        ),
        "frozen money accounted for": (
            settled["charged"] + settled["refunded"] == frozen
        ),
    }
    if scenario == "short-first":
        checks["nothing delivered => nothing charged"] = settled["charged"] == 0
        checks["full refund"] = settled["refunded"] == frozen
        checks["task failed loudly"] = result.get("ok") is False
    elif scenario == "short-second":
        # 40 分 là tiền của **tập 1** — tập đã giao thật và vẫn còn trong database.
        checks["only episode 1 was charged for"] = settled["charged"] == 40
        checks["failing round refunded"] = settled["refunded"] == frozen - 40
        checks["episode 1 kept in the database"] = kept.get(1, 0) > 0
        checks["task failed loudly"] = result.get("ok") is False
    else:
        checks["three delivered episodes all charged"] = settled["charged"] == 120
        # Phần hoàn là **phần đóng băng không dùng tới**, vì `billing_estimate_buffer`
        # đóng băng nhiều hơn giá dự tính. Không phải "không hoàn gì cả".
        checks["unused frozen buffer refunded"] = settled["refunded"] == frozen - 120
        checks["task succeeded"] = result.get("ok") is True
        checks["nothing left empty"] = all(v > 0 for v in kept.values())

    print("\n== ACCEPTANCE ==")
    for name, ok in checks.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    failed = [n for n, ok in checks.items() if not ok]
    print("RESULT:", "PASS" if not failed else f"FAIL -> {failed}")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    asyncio.run(main())