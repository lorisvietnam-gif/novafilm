from pathlib import Path
import logging
import sys
import time

# Bắt buộc: mọi ký tự tiếng Việt phải in được.
#
# Console Windows mặc định dùng codec `cp1252`, in ra chữ `ợ` (U+1EE3) là ném
# UnicodeEncodeError. Điều đó làm **mọi request trả về tiếng Việt đều hỏng với 502** — vì
# nội dung sinh ra từ model phải đi qua log hoặc stdout trước khi tới trình duyệt.
# Sản phẩm này sinh nội dung tiếng Việt, nên đây không phải chuyện "cho đẹp log": nó là
# điều kiện để sản phẩm chạy được trên máy Windows.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text

from app.api import auth, billing, projects, tasks, templates, tools, wizard
from app.api import api_keys as user_api_keys
from app.api import oauth as auth_oauth
from app.api.v1 import router as v1_router
from app.api.admin import router as admin_router
from app.api.drama import router as drama_router
from app.config import get_settings
from app.database import AsyncSessionLocal, engine, init_db
from app.logging_setup import configure_logging
from app.models import Template, User
from app.services import oauth as oauth_svc
from app.services.oauth_providers import RedirectUriError
from app.services.tasks.runtime import runtime_summary, start_task_runtime, stop_task_runtime
from app.services.templates_seed import TEMPLATES

settings = get_settings()
# Business logs at INFO; DEBUG=true no longer turns the root logger into DEBUG (avoids SQL driver flooding)
configure_logging(level="INFO", sql_echo=settings.sql_echo)
logger = logging.getLogger("app.http")

# Fail before the first request, not after a full provider round-trip: a callback URL the
# provider would reject cannot be registered, so it is a deployment error worth shouting
# about at import time (uvicorn, celery and every script all load this module).
try:
    oauth_svc.validate_configuration(settings)
except RedirectUriError as exc:
    raise RuntimeError(f"OAuth callback URL không hợp lệ: {exc}") from exc

app = FastAPI(title=settings.app_name, version="0.2.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
# Allow LAN devices (phone/tablet) hitting Vite on private IPs
_LAN_ORIGIN_RE = (
    r"https?://("
    r"localhost|127\.0\.0\.1|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_origin_regex=_LAN_ORIGIN_RE,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Readable per-request business log (skips static assets; high-frequency polls stay silent by default)
    path = request.url.path
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    if path.startswith("/static"):
        return response
    # High-frequency polling: stay silent when it succeeds and is fast, so it cannot drown out the business log
    is_poll = (
        path.endswith("/generate_status")
        or (request.method == "GET" and path.startswith("/api/drama/scripts/"))
        or (request.method == "GET" and path.startswith("/api/drama/assets"))
        or (request.method == "GET" and path.startswith("/api/projects/") and path.count("/") == 3)
        or (request.method == "GET" and "/api/tools/tasks/" in path)
    )
    msg = f"{request.method} {path} → {response.status_code} ({elapsed_ms:.0f}ms)"
    if response.status_code >= 400:
        logger.warning(msg)
    elif elapsed_ms >= 3000:
        logger.warning("SLOW %s", msg)
    elif is_poll and elapsed_ms < 800:
        return response
    else:
        logger.info(msg)
    return response

static_dir = Path(__file__).resolve().parent.parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
(static_dir / "templates").mkdir(exist_ok=True)
(static_dir / "mock").mkdir(exist_ok=True)
(static_dir / "generated").mkdir(exist_ok=True)
(static_dir / "site").mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

app.include_router(auth.router, prefix="/api")
app.include_router(auth_oauth.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(user_api_keys.router, prefix="/api")
app.include_router(wizard.router, prefix="/api")
app.include_router(v1_router, prefix="/api")
app.include_router(drama_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.on_event("startup")
async def on_startup() -> None:
    await init_db()
    await _apply_schema_patches()
    async with AsyncSessionLocal() as db:
        from app.services.model_settings import load_model_settings_cache

        await load_model_settings_cache(db)
    await seed_templates()
    await bootstrap_admins()
    await seed_agent_skills()
    try:
        from app.services import oss as oss_svc

        oss_svc.ensure_browser_cors()
    except Exception:  # noqa: BLE001
        pass
    await start_task_runtime()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Release Postgres pool on uvicorn worker exit."""
    from app.database import dispose_engine

    await stop_task_runtime()
    await dispose_engine()


async def _pg_columns(conn, table: str) -> set[str]:
    """Read column names from information_schema."""
    result = await conn.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :table"
        ),
        {"table": table},
    )
    return {row[0] for row in result.fetchall()}


async def _apply_schema_patches() -> None:
    """Lightweight additive migrations (PostgreSQL only)."""
    async with engine.begin() as conn:
        scols = await _pg_columns(conn, "shots")
        if "segment_script" not in scols:
            await conn.execute(text("ALTER TABLE shots ADD COLUMN segment_script TEXT DEFAULT ''"))
        if "last_frame_url" not in scols:
            await conn.execute(text("ALTER TABLE shots ADD COLUMN last_frame_url VARCHAR(1024)"))
        if "video_skip_reason" not in scols:
            await conn.execute(text("ALTER TABLE shots ADD COLUMN video_skip_reason VARCHAR(32)"))

        pcols = await _pg_columns(conn, "projects")
        if "pipeline_mode" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN pipeline_mode VARCHAR(32) DEFAULT 'full'"))
        if "output_ratio" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN output_ratio VARCHAR(16) DEFAULT ''"))
        if "voice_id" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN voice_id VARCHAR(128) DEFAULT ''"))
        if "character_bible" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN character_bible TEXT DEFAULT ''"))
        if "bgm_lock" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN bgm_lock TEXT DEFAULT ''"))
        if "subtitle_preset" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN subtitle_preset VARCHAR(32) DEFAULT ''"))
        if "style_prompt" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN style_prompt TEXT DEFAULT ''"))
        if "character_prompt" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN character_prompt TEXT DEFAULT ''"))
        if "extra_prompt" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN extra_prompt TEXT DEFAULT ''"))
        if "image_model" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN image_model VARCHAR(64) DEFAULT ''"))
        if "video_model" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN video_model VARCHAR(64) DEFAULT ''"))

        # User billing columns
        ucols = await _pg_columns(conn, "users")
        # An older database may predate create_all and be missing this column (the model has it, a patch had missed it)
        if "quota_left" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN quota_left INTEGER DEFAULT 5"))
        if "balance_fen" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN balance_fen INTEGER DEFAULT 0"))
        if "frozen_fen" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN frozen_fen INTEGER DEFAULT 0"))
        if "plan" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN plan VARCHAR(32) DEFAULT 'free'"))
        if "role" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(16) DEFAULT 'user'"))
        if "avatar_url" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) DEFAULT ''"))
        if "phone" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(32) DEFAULT ''"))
        if "billing_alert_last_milestone_fen" not in ucols:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN billing_alert_last_milestone_fen INTEGER DEFAULT 0")
            )

        # OAuth identities: `subject` is renamed to `subject_id` (the real identity key),
        # `email` becomes nullable because providers such as TikTok hand out no email at
        # all, and `needs_setup` marks an account still waiting for its own email and
        # password. Existing rows keep their values.
        aocols = await _pg_columns(conn, "oauth_accounts")
        if "subject" in aocols and "subject_id" not in aocols:
            await conn.execute(text("ALTER TABLE oauth_accounts RENAME COLUMN subject TO subject_id"))
        if "email" in aocols:
            await conn.execute(text("ALTER TABLE oauth_accounts ALTER COLUMN email DROP NOT NULL"))
        if "needs_setup" not in aocols:
            await conn.execute(
                text("ALTER TABLE oauth_accounts ADD COLUMN needs_setup BOOLEAN DEFAULT FALSE")
            )

        # UsageEvent.drama_project_id for drama module billing
        uecols = await _pg_columns(conn, "usage_events")
        if "drama_project_id" not in uecols:
            await conn.execute(text("ALTER TABLE usage_events ADD COLUMN drama_project_id INTEGER"))
        if "task_run_id" not in uecols:
            await conn.execute(text("ALTER TABLE usage_events ADD COLUMN task_run_id INTEGER"))
        if "domain" not in uecols:
            await conn.execute(text("ALTER TABLE usage_events ADD COLUMN domain VARCHAR(32)"))
        if "capability" not in uecols:
            await conn.execute(text("ALTER TABLE usage_events ADD COLUMN capability VARCHAR(16)"))

        # Task platform additive columns
        trcols = await _pg_columns(conn, "task_runs")
        if "dedupe_key" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN dedupe_key VARCHAR(128)"))
        if "batch_key" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN batch_key VARCHAR(128)"))
        if "current_step_key" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN current_step_key VARCHAR(64)"))
        if "current_step_status" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN current_step_status VARCHAR(32)"))
        if "scheduled_at" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN scheduled_at TIMESTAMP"))
        if "next_action_at" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN next_action_at TIMESTAMP"))
        if "lease_token" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN lease_token VARCHAR(64)"))
        if "lease_until" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN lease_until TIMESTAMP"))
        if "billing_estimate_fen" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN billing_estimate_fen INTEGER DEFAULT 0"))
        if "billing_charged_fen" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN billing_charged_fen INTEGER DEFAULT 0"))
        if "billing_refunded_fen" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN billing_refunded_fen INTEGER DEFAULT 0"))
        if "billing_status" not in trcols:
            await conn.execute(text("ALTER TABLE task_runs ADD COLUMN billing_status VARCHAR(16) DEFAULT 'none'"))

        # Drop leftover worker-era columns that block the new task platform.
        legacy_task_run_cols = (
            "execution_phase",
            "queue_name",
            "worker_task_id",
            "group_key",
            "next_poll_at",
            "lease_owner",
            "lease_expires_at",
            "attempt_count",
            "attempt_limit",
        )
        for col in legacy_task_run_cols:
            if col not in trcols:
                continue
            await conn.execute(text(f"DROP INDEX IF EXISTS ix_task_runs_{col}"))
            await conn.execute(text(f"ALTER TABLE task_runs DROP COLUMN {col}"))


async def bootstrap_admins() -> None:
    # Promote matching emails to admin (does not create users)
    raw = (settings.admin_bootstrap_emails or "").strip()
    if not raw:
        return
    emails = [e.strip().lower() for e in raw.split(",") if e.strip()]
    if not emails:
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email.in_(emails)))
        users = list(result.scalars().all())
        changed = False
        for user in users:
            if (user.role or "user") != "admin":
                user.role = "admin"
                changed = True
        if changed:
            await db.commit()


async def seed_agent_skills() -> None:
    """Sync the built-in director Skills into the database at startup."""
    from app.services.agent.store import seed_builtin_skills

    async with AsyncSessionLocal() as db:
        await seed_builtin_skills(db)


def _publish_template_cover(cover: str, log: logging.Logger) -> str:
    """Push the /static cover art to OSS; on failure the original path is still returned."""
    from app.services import storage

    if not cover.startswith("/static/"):
        return cover
    local = storage.STATIC_ROOT / cover.removeprefix("/static/")
    if not local.is_file():
        log.warning("template cover missing on disk: %s", local)
        return cover
    try:
        return storage.publish_local(local, sync=True)
    except Exception:  # noqa: BLE001
        log.exception("template cover OSS publish failed: %s", local)
        return cover


async def seed_templates() -> None:
    """Insert only the missing built-in templates; existing rows stay as the admin UI left them, so startup never overwrites copy or config."""
    log = logging.getLogger("app.seed")
    async with AsyncSessionLocal() as db:
        for item in TEMPLATES:
            data = dict(item)
            existing = await db.get(Template, data["id"])
            cover = (data.get("preview_cover") or "").strip()
            if existing:
                # Never overwrite the admin's config for an existing template; only push to OSS when the cover is still a local path
                current = (existing.preview_cover or "").strip()
                if not current.startswith(("http://", "https://")):
                    published = _publish_template_cover(current or cover, log)
                    if published.startswith(("http://", "https://")) and published != current:
                        existing.preview_cover = published
                continue
            data["preview_cover"] = _publish_template_cover(cover, log)
            db.add(Template(**data))
        await db.commit()


@app.get("/api/health")
async def health() -> dict:
    from app.config import reload_settings

    s = reload_settings()
    from app.database import pool_status

    runtime = runtime_summary()
    runtime_ok = bool(runtime.get("healthy"))
    return {
        "ok": runtime_ok,
        "ark_mock": s.ark_mock,
        "db_pool": pool_status(),
        "task_runtime": runtime,
        "models": {
            "llm": s.model_llm,
            "image": s.model_image,
            "video": s.model_video,
            "audio": s.model_audio,
        },
        "quality": {
            "image_size": s.ark_image_size,
            "video_resolution": s.ark_video_resolution,
        },
        "app": s.app_name,
    }
