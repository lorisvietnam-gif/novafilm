"""Đo nghiệm thu qua HTTP: đúng đường người dùng đi (API → task → executor → settle).

Bản job trực tiếp (`verify_episode_locale_vi.py`) đo được 0 ký tự Hán. Bản này đo
**sau** khi hệ thống tự sinh `summary`, và đó là chỗ khác biệt: `SCRIPT_SUMMARY_SYSTEM_PROMPT`
trong `app/services/drama/script_summary_prompt.py` vẫn viết cứng tiếng Trung
(`:20` `4–16 个汉字`, `:24` `一段完整中文叙述`, `:25` `语言统一使用简体中文`), nên `summary`
sinh ra toàn chữ Trung và kéo `episode_content` theo.

Cách chạy (backend phải đang chạy; mặc định :8020):
    cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8020
    cd backend && python scripts/verify_episode_locale_vi_http.py

Script tự đăng ký một tài khoản dùng một lần (`bunny4-accept-http@novafilm.probe`); nó
KHÔNG đổi mật khẩu của tài khoản nào có sẵn.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8020"
CJK_RE = re.compile(r"[\u4e00-\u9fff]")

CREATIVE = (
    "Một cô gái giao đồ ăn đêm ở Hà Nội phát hiện món ăn của khách quen luôn giống "
    "hệt món mà bố mất tích biến mất năm mười lăm tuổi trước. Cô truy đuổi về một "
    "con ngõ cũ và gặp một bà cụ đang giữ bí mật của cả gia đình."
)
SUMMARY = {
    "episodeCount": 1,
    "seriesTitle": "Giao đồ đêm",
    "storyType": "đô thị",
    "targetAudience": "Đại chúng",
    "coreHook": "tra cứu",
    "oneLineStory": "Cô gái giao đồ đêm lần theo món ăn cũ đến bí mật của gia đình.",
    "characters": [
        {
            "name": "Linh",
            "title": "shipper đêm",
            "roleType": "nữ chính",
            "visualImage": "cô gái Việt Nam hai mươi lăm tuổi",
            "coreTags": "nhanh nhẹn",
            "identityBackground": "sinh ra ở Hà Nội",
            "growthExperience": "làm việc đêm ba năm",
            "personality": "kiên định",
            "relationships": "bà cụ hàng xóm",
            "growthArc": "sợ sự thật -> đối mặt",
        }
    ],
    "synopsis": "Linh làm giao đồ ăn đêm và bắt gặp một món ăn quen thuộc.",
}


def call(method: str, path: str, body=None, token: str = ""):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:400]


async def wait_task(task_id: int, *, timeout_s: int = 300):
    """Chờ task kết thúc rồi trả về hàng của `task_runs`."""
    from sqlalchemy import text

    from app.database import AsyncSessionLocal

    for _ in range(timeout_s // 3):
        await asyncio.sleep(3)
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


async def main() -> None:
    from sqlalchemy import text

    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text("select id, email from users order by id"))).all()
        print("users:", [(r[0], r[1]) for r in rows])
        if not rows:
            print("no user; cannot run the HTTP acceptance")
            sys.exit(2)

    status, health = call("GET", "/api/health")
    print(f"GET /api/health -> {status} llm={health.get('models', {}).get('llm')}")

    # DB dùng chung không có mật khẩu demo nào (đó là lý do `test_admin_stats` skip).
    # Không đổi mật khẩu của ai; tự tạo một tài khoản mới để chạy.
    email = "bunny4-accept-http@novafilm.probe"
    password = "Accept-2026-10-03!"
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
    if not token:
        sys.exit(3)

    before = call("GET", "/api/billing/wallet", token=token)
    print("wallet before:", json.dumps(before[1], ensure_ascii=False)[:300])

    code, project = call(
        "POST",
        "/api/drama/projects",
        {
            "title": "HTTP acceptance locale vi",
            "description": "acceptance 2026-10-03",
            "source": CREATIVE,
            "episode_count": 1,
            "workflow": "script",
            "params": {"locale": "vi", "episode_count": 1},
        },
        token=token,
    )
    print(f"POST /api/drama/projects -> {code} {json.dumps(project, ensure_ascii=False)[:300]}")
    if code != 200:
        sys.exit(4)
    project_id = int(project["id"])

    code, summary_out = call(
        "POST",
        f"/api/drama/agents/script_summary",
        {"project_id": project_id},
        token=token,
    )
    print(f"POST agents/script_summary -> {code} {json.dumps(summary_out, ensure_ascii=False)[:200]}")
    summary_task = summary_out.get("task_id") if isinstance(summary_out, dict) else None
    if summary_task:
        row = await wait_task(int(summary_task))
        print(f"  summary task {summary_task} -> {row[0] if row else 'timeout'}")

    code, dispatch = call(
        "POST",
        "/api/drama/agents/episode_script",
        {"project_id": project_id, "force": True},
        token=token,
    )
    print(f"POST episode-script -> {code} {json.dumps(dispatch, ensure_ascii=False)[:300]}")
    task_id = dispatch.get("task_id") if isinstance(dispatch, dict) else None

    if task_id:
        row = await wait_task(int(task_id))
        if row:
            print(f"\ntask {task_id}: status={row[0]} billing={row[1]}")
            print(f"  estimate={row[2]} charged={row[3]} refunded={row[4]}")
            print(f"  error={str(row[5])[:200]!r}")
        else:
            print(f"\ntask {task_id}: timed out")

    after = call("GET", "/api/billing/wallet", token=token)
    print("wallet after :", json.dumps(after[1], ensure_ascii=False)[:300])

    code, detail = call("GET", f"/api/drama/projects/{project_id}", token=token)
    content = (detail or {}).get("script", {}).get("episode_content") if isinstance(detail, dict) else None
    episodes = ((content or {}).get("episodes") if isinstance(content, dict) else None) or []
    print(f"\n== MEASURED episode_content over HTTP (project {project_id}) ==")
    if not episodes:
        print("  no episodes written - measurement is VOID, not a pass")
        sys.exit(5)
    from app.services.drama.agents import count_translatable_cjk, find_chinese_prose_lines

    total = 0
    for e in episodes:
        body = str(e.get("body") or e.get("content") or "")
        n = count_translatable_cjk(body)
        total += n
        print(f"  ep{e.get('episodeNumber')} cjk_total={len(CJK_RE.findall(body))} cjk_prose={n} "
              f"nospace={len(''.join(body.split()))} title={str(e.get('title'))!r}")
        for line in find_chinese_prose_lines(body):
            print(f"     still Chinese: {line}")
    print(f"\nACCEPTANCE 0-CJK in prose over HTTP: {'PASS' if total == 0 else 'FAIL'}")


asyncio.run(main())