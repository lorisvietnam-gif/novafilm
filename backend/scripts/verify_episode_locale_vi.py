"""Đo nghiệm thu: sinh tập thật với `locale=vi`, đo ký tự Trung trong `episode_content`.

Tiêu chí (brief case-episode-locale-and-silent-charge-b4):
  - `episode_content` phải có **0 ký tự Trung trong phần văn xuôi** (marker Seedance
    là tiếng Trung theo hợp đồng ở mọi locale — xem `count_translatable_cjk`)
  - marker Seedance phải còn nguyên

Chạy job trực tiếp (không qua HTTP) để phép đo không lẫn với hàng đợi task, nhưng đi
đúng `run_episode_scripts_job` — cùng đường worker task gọi. Bản HTTP nằm ở
`verify_episode_locale_vi_http.py`; chạy cả hai, vì chúng khác nhau ở một chỗ quan
trọng: script này **nạp sẵn summary tiếng Việt**, còn bản HTTP thì để hệ thống tự
sinh summary — mà `SCRIPT_SUMMARY_SYSTEM_PROMPT` vẫn viết cứng tiếng Trung, nên bản
HTTP đo được chữ Hán sót lại. Xem docs/reports/ cho số đo của cả hai.

Cách chạy (cần backend deps nhưng KHÔNG cần backend đang chạy):
    cd backend && python scripts/verify_episode_locale_vi.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models_drama import DramaProject, DramaScript  # noqa: E402

# Dùng đúng bộ đo của production, không tự viết bản thứ hai trong script đo.
from app.services.drama.agents import (  # noqa: E402
    count_translatable_cjk,
    find_chinese_prose_lines,
)

CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
VIET_RE = re.compile(r"[ăâđêôơưĂÂĐÊÔƠƯ]|[àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]", re.IGNORECASE)

# Marker Seedance: hợp đồng máy↔máy, phải còn nguyên tiếng Trung.
MARKERS = ("### 场", "出场人物：", "△", "【空镜：")

PROJECT_TITLE = "Kiem chung locale episode vi 20261003"
CREATIVE = (
    "Một cô gái giao đồ ăn đêm ở Hà Nội phát hiện món ăn của khách quen luôn "
    "giống hệt món mà bố mất tích biến mất năm mười lăm tuổi trước. Cô truy đuổi "
    "về một con ngõ cũ và gặp một bà cụ đang giữ bí mật của cả gia đình."
)
SUMMARY = {
    "episodeCount": 1,
    "seriesTitle": "Giao đồ đêm",
    "storyType": "đô thị+giải trinh",
    "targetAudience": "Đại chúng",
    "coreHook": "tra cứu+nghịch lý",
    "oneLineStory": "Cô gái giao đồ đêm lần theo món ăn cũ đến bí mật của gia đình.",
    "characters": [
        {
            "name": "Linh",
            "title": "shipper đêm",
            "roleType": "nữ chính",
            "visualImage": "cô gái Việt Nam hai mươi lăm tuổi, tóc buộc ngắn",
            "coreTags": "nhanh nhẹn",
            "identityBackground": "sinh ra ở Hà Nội",
            "growthExperience": "làm việc đêm ba năm",
            "personality": "kiên định",
            "relationships": "bà cụ hàng xóm",
            "growthArc": "sợ sự thật -> đối mặt",
        },
        {
            "name": "Bà Tuyết",
            "title": "hàng xóm",
            "roleType": "trưởng hợp",
            "visualImage": "bà cụ Việt Nam bảy mươi tuổi",
            "coreTags": "bí ẩn",
            "identityBackground": "sống ở ngõ cũ",
            "growthExperience": "giữ bí mật ba mươi năm",
            "personality": "cứng lòng nhưng có lương tâm",
            "relationships": "biết cha của Linh",
            "growthArc": "giữ bí mật -> thú tội",
        },
    ],
    "synopsis": "Linh làm giao đồ ăn đêm và bắt gặp một món ăn quen thuộc.",
}


async def main() -> None:
    from app.services.drama.jobs import run_episode_scripts_job
    from app.services.model_settings import load_model_settings_cache

    # Standalone script: không có lifespan của FastAPI nên phải nạp overlay từ DB,
    # nếu không `get_routing_snapshot()` rỗng ⇒ không resolve được model nào.
    async with AsyncSessionLocal() as db:
        await load_model_settings_cache(db)
    print("routing loaded")

    async with AsyncSessionLocal() as db:
        owner = (
            await db.execute(text("select id from users order by id limit 1"))
        ).first()
        if not owner:
            print("no user in database; cannot run acceptance")
            sys.exit(2)
        project = DramaProject(
            user_id=int(owner[0]),
            title=PROJECT_TITLE,
            description="acceptance for locale=vi episode script",
            params={"episode_count": 1, "image_style_id": "", "locale": "vi", "workflow": "script"},
        )
        db.add(project)
        await db.flush()
        script = DramaScript(
            project_id=project.id,
            source=CREATIVE,
            summary=SUMMARY,
            episode_content=None,
            params={"episode_count": 1, "locale": "vi"},
        )
        db.add(script)
        await db.commit()
        project_id = project.id
        print(f"project_id = {project_id}  locale = vi")

    print("running run_episode_scripts_job ... (real LLM, this takes a minute)")
    result = await run_episode_scripts_job(project_id=project_id, force=True)
    print("result:", result)

    async with AsyncSessionLocal() as db:
        content = (
            await db.execute(
                text("select episode_content, params from drama_scripts where project_id = :p"),
                {"p": project_id},
            )
        ).first()
    rows = content[0]
    if isinstance(rows, str):
        rows = json.loads(rows)
    episodes = (rows or {}).get("episodes") or []

    print("\n== MEASURED episode_content ==")
    if not episodes:
        print("  NO EPISODES WRITTEN - acceptance is VOID, not a pass")
        sys.exit(3)
    total_cjk = 0
    total_prose_cjk = 0
    marker_report: list[list[str]] = []
    for e in episodes:
        body = str(e.get("body") or e.get("content") or "")
        cjk = len(CJK_RE.findall(body))
        prose_cjk = count_translatable_cjk(body)
        total_cjk += cjk
        total_prose_cjk += prose_cjk
        title = str(e.get("title") or "")
        print(
            f"  ep{e.get('episodeNumber')} cjk_total={cjk} cjk_prose={prose_cjk} "
            f"chars={len(body)} nospace={len(''.join(body.split()))} "
            f"viet_diacritics={len(VIET_RE.findall(body))} title={title!r}"
        )
        present = [m for m in MARKERS if m in body]
        marker_report.append(present)
        print(f"      markers present: {present}")
    print(f"\n  TOTAL CJK in episode bodies      = {total_cjk}  (gồm cả marker)")
    print(f"  TOTAL CJK in translatable prose  = {total_prose_cjk}  <- phép đo nghiệm thu")

    print("\n== first 12 lines of episode 1 ==")
    if episodes:
        for line in str(episodes[0].get("body") or "").splitlines()[:12]:
            print("   ", line)

    markers_ok = all(len(p) == len(MARKERS) for p in marker_report)
    print(f"\n  markers intact in every episode: {markers_ok} (want all of {MARKERS})")
    for e in episodes:
        body = str(e.get("body") or e.get("content") or "")
        for line in find_chinese_prose_lines(body):
            print(f"    still Chinese: {line}")
    print(f"ACCEPTANCE 0-CJK in prose: {'PASS' if total_prose_cjk == 0 else 'FAIL'}")
    print(f"ACCEPTANCE markers intact: {'PASS' if markers_ok else 'FAIL'}")


asyncio.run(main())