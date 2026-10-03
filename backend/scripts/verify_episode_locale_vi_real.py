"""Đo nghiệm thu: locale=vi trên đường thật, đo thẳng từ database.

Đây là phép đo **không tin unit test**. Nó đi đúng đường người dùng đi:

    HTTP -> task queue -> worker -> run_script_summary_job / run_episode_scripts_job
         -> record_line -> settle_task

rồi đọc `drama_scripts.episode_content` bằng SQL thay vì tin vào giá trị mà script
trả về. Bốn con số được in ra là bốn điều kiện nghiệm thu của brief
`case-episode-user-message-and-partial-refund-b4`:

  1. `>= 3` tập được yêu cầu sinh và **không tập nào rỗng**
  2. **0 ký tự Trung trong phần văn xuôi** của `body` (marker Seedance là tiếng Trung
     theo hợp đồng ở mọi locale — xem `count_translatable_cjk`)
  3. Marker Nhóm D **còn nguyên**: `### 场`, `出场人物：`, `△`, `【空镜：`
  4. `charged_fen` = 0 khi có tập rỗng (hoàn tiền), `charged_fen > 0` khi sinh đủ

Cách chạy (backend của lane này phải đang chạy):
    cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8020
    cd backend && python scripts/verify_episode_locale_vi_real.py --base http://127.0.0.1:8020

Script tự đăng ký một tài khoản dùng một lần; KHÔNG đổi mật khẩu của tài khoản nào
có sẵn. Số tiền nạp cho tài khoản đó lấy từ `billing_signup_grant_fen`, không đụng
ví của người thật.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
VIET_RE = re.compile(
    r"[ăâđêôơưĂÂĐÊÔƠƯ]|[àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩị"
    r"òóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]",
    re.IGNORECASE,
)

# Marker Nhóm D: hợp đồng máy<->máy với Seedance, phải còn nguyên ở **mọi** locale.
GROUP_D_MARKERS = ("### 场", "出场人物：", "△", "【空镜：")

CREATIVE = (
    "Hà Nội mùa thu. Một cô gái giao đồ ăn đêm phát hiện món ăn của khách quen luôn "
    "giống hệt món mà bố mất tích biến mất năm mười lăm tuổi trước. Cô lần theo về một "
    "con ngõ cũ, gặp một bà cụ đang giữ bí mật của cả gia đình, và buộc phải chọn giữa "
    "sự thật với người cha mất."
)

BASE = "http://127.0.0.1:8020"


def call(method: str, path: str, body=None, token: str = "", timeout: int = 120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:600]


async def wait_task(task_id: int, *, timeout_s: int = 1800):
    from sqlalchemy import text

    from app.database import AsyncSessionLocal

    started = time.time()
    while time.time() - started < timeout_s:
        await asyncio.sleep(4)
        async with AsyncSessionLocal() as db:
            row = (
                await db.execute(
                    text(
                        "select status, billing_status, billing_estimate_fen, "
                        "billing_charged_fen, billing_refunded_fen, error_message "
                        "from task_runs where id = :t"
                    ),
                    {"t": task_id},
                )
            ).first()
        if row and row[0] in ("succeeded", "failed", "cancelled"):
            return row
    return None


async def read_episodes(project_id: int) -> list[dict]:
    from sqlalchemy import text

    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        raw, params = (
            await db.execute(
                text(
                    "select episode_content, params from drama_scripts where project_id = :p"
                ),
                {"p": project_id},
            )
        ).first()
    if isinstance(raw, str):
        raw = json.loads(raw or "{}")
    episodes = (raw or {}).get("episodes") if isinstance(raw, dict) else None
    return list(episodes or []), (params or {})


def report(episodes: list[dict], requested: int) -> dict:
    from app.services.drama.agents import (
        MIN_EPISODE_CONTENT_CHARS,
        count_translatable_cjk,
        find_chinese_prose_lines,
    )

    print(f"\n== MEASURED episode_content (project {requested}) ==")
    if not episodes:
        print("  NO EPISODES AT ALL - the measurement is VOID, not a pass")
        return {"episodes": 0}

    total_prose_cjk = 0
    total_cjk = 0
    empty: list[int] = []
    markers_ok = True
    for e in episodes:
        num = e.get("episodeNumber")
        body = str(e.get("body") or e.get("content") or "")
        nospace = len("".join(body.split()))
        prose_cjk = count_translatable_cjk(body)
        cjk = len(CJK_RE.findall(body))
        total_cjk += cjk
        total_prose_cjk += prose_cjk
        present = [m for m in GROUP_D_MARKERS if m in body]
        markers_ok = markers_ok and len(present) == len(GROUP_D_MARKERS)
        if nospace < MIN_EPISODE_CONTENT_CHARS:
            empty.append(int(num or 0))
        print(
            f"  ep{num} nospace={nospace} cjk_total={cjk} cjk_prose={prose_cjk} "
            f"viet={len(VIET_RE.findall(body))} "
            f"markers={len(present)}/{len(GROUP_D_MARKERS)} title={str(e.get('title'))!r}"
        )
        for line in find_chinese_prose_lines(body):
            print(f"      still Chinese: {line}")

    print(f"  episodes written          = {len(episodes)} (requested >= {requested})")
    print(f"  episodes below quality bar= {empty or 'none'} "
          f"(bar = {MIN_EPISODE_CONTENT_CHARS} non-space chars)")
    print(f"  CJK total (incl. markers) = {total_cjk}")
    print(f"  CJK in translatable prose = {total_prose_cjk}  <- acceptance number")
    print(f"  Group D markers intact    = {markers_ok}")
    return {
        "episodes": len(episodes),
        "empty": empty,
        "prose_cjk": total_prose_cjk,
        "markers_ok": markers_ok,
    }


async def main() -> None:
    global BASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=BASE)
    ap.add_argument("--episodes", type=int, default=3)
    ap.add_argument("--locale", default="vi")
    ap.add_argument("--email", default="")
    args = ap.parse_args()
    BASE = args.base.rstrip("/")

    print(f"backend = {BASE}   locale = {args.locale}   episodes = {args.episodes}")

    code, health = call("GET", "/api/health")
    print(f"GET /api/health -> {code} llm={health.get('models', {}).get('llm')}")

    stamp = time.strftime("%H%M%S")
    email = args.email or f"bunny4-real-{stamp}@novafilm.probe"
    password = "Real-2026-10-03!"
    code, payload = call("POST", "/api/auth/register", {"email": email, "password": password})
    if code == 200 and isinstance(payload, dict) and payload.get("access_token"):
        token = str(payload["access_token"])
        print(f"registered + logged in as {email}")
    else:
        code, payload = call("POST", "/api/auth/login", {"email": email, "password": password})
        if code != 200:
            print(f"register/login failed: {code} {payload}")
            sys.exit(3)
        token = str(payload["access_token"])
        print(f"logged in as {email}")

    _, wallet_before = call("GET", "/api/billing/wallet", token=token)
    balance_before = int((wallet_before or {}).get("balance_fen") or 0)
    print(f"wallet before: balance_fen={balance_before} "
          f"billing_enabled={(wallet_before or {}).get('billing_enabled')}")

    code, project = call(
        "POST",
        "/api/drama/projects",
        {
            "title": f"bunny4 real acceptance {stamp}",
            "description": "wave 2 acceptance: locale + per-episode refund",
            "source": CREATIVE,
            "episode_count": args.episodes,
            "workflow": "script",
            "params": {
                "locale": args.locale,
                "episode_count": args.episodes,
                "workflow": "script",
            },
        },
        token=token,
    )
    print(f"POST /api/drama/projects -> {code} {json.dumps(project, ensure_ascii=False)[:240]}")
    if code != 200:
        sys.exit(4)
    project_id = int(project["id"])

    # --- 1) summary: để hệ thống tự sinh, đây là chỗ từng kéo nội dung về tiếng Trung ---
    code, out = call(
        "POST", "/api/drama/agents/script_summary", {"project_id": project_id}, token=token
    )
    print(f"POST agents/script_summary -> {code} {json.dumps(out, ensure_ascii=False)[:200]}")
    if code != 200:
        sys.exit(5)
    summary_task = int(out["task_id"])
    row = await wait_task(summary_task)
    print(f"  summary task {summary_task} -> {row[0] if row else 'timeout'} "
          f"charged={row[3] if row else '?'} refunded={row[4] if row else '?'}")

    # --- 2) episode scripts ---
    code, out = call(
        "POST",
        "/api/drama/agents/episode_script",
        {"project_id": project_id, "force": True},
        token=token,
    )
    print(f"POST agents/episode_script -> {code} {json.dumps(out, ensure_ascii=False)[:240]}")
    if code != 200:
        sys.exit(6)
    task_id = int(out["task_id"])

    episodes, params = [], {}
    deadline = time.time() + 2400
    while time.time() < deadline:
        row = await wait_task(task_id, timeout_s=60)
        episodes, params = await read_episodes(project_id)
        if row and row[0] in ("succeeded", "failed", "cancelled"):
            break
        if row is None and params.get("episode_content_status") in ("failed", "completed"):
            break
        print(f"  ... still running, {len(episodes)} episode rows, "
              f"status={params.get('episode_content_status')}", flush=True)

    print(f"\ntask {task_id}: status={row[0] if row else 'timeout'} "
          f"billing={row[1] if row else '?'} estimate={row[2] if row else '?'} "
          f"charged={row[3] if row else '?'} refunded={row[4] if row else '?'}")
    print(f"  error = {str(row[5])[:300] if row else '?'}")
    print(f"  episode_content_status = {params.get('episode_content_status')}")

    _, wallet_after = call("GET", "/api/billing/wallet", token=token)
    balance_after = int((wallet_after or {}).get("balance_fen") or 0)
    print(f"wallet after : balance_fen={balance_after} "
          f"(delta = {balance_before - balance_after} fen)")

    measured = report(episodes, args.episodes)

    charged = int(row[3]) if row else 0
    print("\n== ACCEPTANCE ==")
    checks = {
        "episodes >= requested": measured["episodes"] >= args.episodes,
        "no episode below the quality bar": not measured["empty"],
        "0 CJK in translatable prose": measured["prose_cjk"] == 0,
        "Group D markers intact": measured["markers_ok"],
        "task succeeded": bool(row) and row[0] == "succeeded",
        "charged only when every episode was written": (
            charged == 0 if measured["empty"] else charged > 0
        ),
    }
    for name, ok in checks.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    print(f"\nproject_id={project_id} task_ids={summary_task},{task_id}")
    failed = [n for n, ok in checks.items() if not ok]
    print("RESULT:", "PASS" if not failed else f"FAIL -> {failed}")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    asyncio.run(main())