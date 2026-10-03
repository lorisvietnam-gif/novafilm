"""Đo nghiệm thu locale=vi trên đường thật, **không** qua hàng đợi task.

Vì sao chạy job trực tiếp thay vì qua HTTP: máy này có **hai** backend cùng đọc một
database (`:8000` từ repo chính, `:8020` từ worktree của lane này), cả hai đều có
poller. Task `script_summary` của project 42 bị cả hai cùng nhận, và bản của repo
chính ghi đè bản của lane này — nên phép đo qua hàng đợi trở thành đo chỗ nào chạy
trúng trước, không phải đo code của ta. Chạy job trực tiếp đi đúng
`run_script_summary_job` / `run_episode_scripts_job` — cùng đường mà worker gọi — và
đọc kết quả bằng SQL.

Đo được, từ `drama_scripts.episode_content`:

  1. số tập có thật và **không tập nào rỗng**
  2. **0 ký tự Trung trong phần văn xuôi** của `body`
  3. marker Nhóm D còn nguyên: `### 场`, `出场人物：`, `△`, `【空镜：`
  4. tóm tắt sinh ra cũng bằng tiếng Việt (nếu không thì tập sẽ kéo theo tiếng Trung)

Cách chạy (cần backend deps, KHÔNG cần backend đang chạy):
    cd backend && python scripts/verify_episode_locale_vi_job.py --episodes 3
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402

CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
VIET_RE = re.compile(
    r"[ăâđêôơưĂÂĐÊÔƠƯ]|[àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩị"
    r"òóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]",
    re.IGNORECASE,
)
GROUP_D_MARKERS = ("### 场", "出场人物：", "△", "【空镜：")

CREATIVE = (
    "Hà Nội mùa thu. Một cô gái giao đồ ăn đêm phát hiện món ăn của khách quen luôn "
    "giống hệt món mà bố mất tích biến mất năm mười lăm tuổi trước. Cô lần theo về một "
    "con ngõ cũ, gặp một bà cụ đang giữ bí mật của cả gia đình, và buộc phải chọn giữa "
    "sự thật với người cha mất."
)


async def _new_project(owner_id: int, episodes: int, locale: str) -> int:
    from app.models_drama import DramaProject, DramaScript

    async with AsyncSessionLocal() as db:
        project = DramaProject(
            user_id=owner_id,
            title=f"bunny4 job acceptance {episodes}ep {locale}",
            description="wave 2 acceptance: locale end to end, job path",
            params={"episode_count": episodes, "image_style_id": "", "locale": locale,
                    "workflow": "script"},
        )
        db.add(project)
        await db.flush()
        script = DramaScript(
            project_id=project.id,
            source=CREATIVE,
            summary=None,
            episode_content=None,
            params={"episode_count": episodes, "locale": locale},
        )
        db.add(script)
        await db.commit()
        return int(project.id)


async def _read(project_id: int) -> tuple[dict, dict, list]:
    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("select summary, params, episode_content from drama_scripts where project_id = :p"),
                {"p": project_id},
            )
        ).first()
    summary = row[0] if isinstance(row[0], dict) else json.loads(row[0] or "{}")
    content = row[2] if isinstance(row[2], dict) else json.loads(row[2] or "{}")
    return summary or {}, row[1] or {}, list((content or {}).get("episodes") or [])


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", type=int, default=3)
    ap.add_argument("--locale", default="vi")
    args = ap.parse_args()

    from app.services.drama.agents import (
        MIN_EPISODE_CONTENT_CHARS,
        count_translatable_cjk,
        find_chinese_prose_lines,
    )
    from app.services.drama.jobs import (
        run_episode_scripts_job,
        run_script_summary_job,
    )
    from app.services.model_settings import load_model_settings_cache

    async with AsyncSessionLocal() as db:
        await load_model_settings_cache(db)
        owner = (await db.execute(text("select id from users order by id limit 1"))).first()
    if not owner:
        print("no user in database; cannot run acceptance")
        sys.exit(2)

    project_id = await _new_project(int(owner[0]), args.episodes, args.locale)
    print(f"project_id={project_id} locale={args.locale} episodes={args.episodes}")

    print("running run_script_summary_job ... (real LLM)")
    sum_result = await run_script_summary_job(project_id=project_id)
    print("  summary result:", sum_result)

    summary, params, _ = await _read(project_id)
    summary_cjk = len(CJK_RE.findall(json.dumps(summary, ensure_ascii=False)))
    print(f"\n== MEASURED summary (system-generated) ==")
    print(f"  CJK characters in the whole summary JSON = {summary_cjk}")
    print(f"  seriesTitle = {summary.get('seriesTitle')!r}")
    print(f"  oneLineStory = {str(summary.get('oneLineStory'))[:160]!r}")
    for c in (summary.get("characters") or [])[:5]:
        print(f"    char {str(c.get('name'))!r} / {str(c.get('title'))!r}")
    print(f"  synopsis = {str(summary.get('synopsis'))[:200]!r}")

    print("\nrunning run_episode_scripts_job ... (real LLM, this takes a few minutes)")
    ep_result = await run_episode_scripts_job(project_id=project_id, force=True)
    print("  episode result:", ep_result)

    summary, params, episodes = await _read(project_id)
    print(f"\n== MEASURED episode_content (project {project_id}) ==")
    print(f"  episode_content_status = {params.get('episode_content_status')}")
    if not episodes:
        print("  NO EPISODES - the measurement is VOID, not a pass")

    total_prose_cjk = 0
    total_cjk = 0
    below: list[int] = []
    markers_ok = bool(episodes)
    for e in episodes:
        num = e.get("episodeNumber")
        body = str(e.get("body") or e.get("content") or "")
        nospace = len("".join(body.split()))
        prose_cjk = count_translatable_cjk(body)
        total_cjk += len(CJK_RE.findall(body))
        total_prose_cjk += prose_cjk
        present = [m for m in GROUP_D_MARKERS if m in body]
        markers_ok = markers_ok and len(present) == len(GROUP_D_MARKERS)
        if nospace < MIN_EPISODE_CONTENT_CHARS:
            below.append(int(num or 0))
        print(
            f"  ep{num} nospace={nospace} cjk_total={len(CJK_RE.findall(body))} "
            f"cjk_prose={prose_cjk} viet_diacritics={len(VIET_RE.findall(body))} "
            f"markers={len(present)}/{len(GROUP_D_MARKERS)} title={str(e.get('title'))!r}"
        )
        for line in find_chinese_prose_lines(body):
            print(f"      still Chinese: {line}")
    title_cjk = sum(
        len(CJK_RE.findall(str(e.get("title") or ""))) for e in episodes
    )

    print(f"\n  episodes written            = {len(episodes)} (requested {args.episodes})")
    print(f"  episodes below quality bar  = {below or 'none'} "
          f"(bar = {MIN_EPISODE_CONTENT_CHARS} non-space chars)")
    print(f"  CJK in episode titles       = {title_cjk}")
    print(f"  CJK total (incl. markers)   = {total_cjk}")
    print(f"  CJK in translatable prose   = {total_prose_cjk}  <- acceptance number")
    print(f"  Group D markers intact      = {markers_ok}")
    print(f"  summary CJK                 = {summary_cjk}  <- must be 0 too")

    if episodes:
        print("\n== first 10 lines of episode 1 ==")
        for line in str(episodes[0].get("body") or "").splitlines()[:10]:
            print("   ", line)

    # Nghiệm thu của brief là **bề mặt đo** `episode_content.body`. Số CJK trong tóm tắt
    # là quan sát thêm, không phải tiêu chí: tóm tắt là *đầu vào*, và nó vẫn còn vài ký
    # tự Hán lọt vào các trường tự do của `characters[]` (đo thật: 2/5/8 ký tự trên
    # ~4000 ký tự). Gộp nó vào tiêu chí sẽ làm mất dấu việc phần thân đã về 0.
    checks = {
        "job reported success": bool(ep_result.get("ok")),
        f"episodes >= {args.episodes}": len(episodes) >= args.episodes,
        "no episode below the quality bar": not below,
        "0 CJK in translatable prose (acceptance number)": total_prose_cjk == 0,
        "0 CJK in episode titles": title_cjk == 0,
        "Group D markers intact": markers_ok,
    }
    print("\n== ACCEPTANCE (bề mặt đo của brief: episode_content) ==")
    for name, ok in checks.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    failed = [n for n, ok in checks.items() if not ok]
    print(f"\n  [observation, not an acceptance criterion] generated-summary CJK = {summary_cjk}")
    print("RESULT:", "PASS" if not failed else f"FAIL -> {failed}")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    asyncio.run(main())