# OPERATIONS

Operations runbook for this repository. Every statement below was read out of the
code in this tree; every claim carries a `path:line` citation so it can be
re-checked. Where the code does not settle a question, the doc says so instead of
guessing.

Terminology note: this repository is a fork of PRINTFILM. Internal identifiers,
compose project names, and Postgres role names still say `printfilm` / `ai_movie`.
That is intentional for now — see `docs/OPEN_SOURCE_CHECKLIST.md` §2.7.

---

## Table of contents

1. [Architecture](#1-architecture)
2. [Running each component](#2-running-each-component)
3. [Configuration](#3-configuration)
4. [Task lifecycle](#4-task-lifecycle)
5. [Billing](#5-billing)
6. [Model routing](#6-model-routing)
7. [Payments](#7-payments)
8. [Data and media](#8-data-and-media)
9. [Deployment](#9-deployment)
10. [Troubleshooting](#10-troubleshooting)
11. [Known traps](#11-known-traps)

---

## 1. Architecture

### 1.1 Components

| Component | Runtime | Default port | Source |
|-----------|---------|--------------|--------|
| FastAPI API | Python 3.12 process | 8000 | `backend/app/main.py` |
| User web app | Vite dev server / static build | 5173 dev, 8080 container | `frontend/` |
| Admin console | Vite dev server / static build | 5174 dev, 8081 container | `admin/` |
| PostgreSQL 16 | Docker container | 15432 host → 5432 | `deploy/docker-compose.yml:8-23` |
| Redis 7 | Docker container | 16379 host → 6379 | `deploy/docker-compose.yml:26-37` |
| FFmpeg / FFprobe | Host binary, on `PATH` | — | `backend/app/config.py:160-161` |

Port 5432 and 6379 are deliberately avoided by `deploy/docker-compose.yml:2-3` so
this project's containers do not collide with another project on the same host.
The container names are `ai-movie-pg` and `ai-movie-redis`
(`deploy/docker-compose.yml:10, 27`), and the compose project name is
`ai-movie-infra` (`deploy/docker-compose.yml:5`) — deliberately distinct from the
full-stack compose project name `printfilm` (`docker-compose.yml:5`).

### 1.2 Process model — read this before you look for a worker

**There is no external worker process.** The task platform runs *inside* the FastAPI
process as asyncio tasks, started by the application lifespan hook.

- Startup: `backend/app/main.py:114` — `await start_task_runtime()`, the last
  statement of `on_startup()` (`main.py:97-98`).
- Shutdown: `backend/app/main.py:122` — `await stop_task_runtime()`, before
  `dispose_engine()` at `main.py:123`.
- `start_task_runtime()` (`backend/app/services/tasks/runtime.py:35-38`) starts three
  things in order: `start_scheduler()`, `start_poller()`, `start_watchdog()`.
  Shutdown is the reverse (`runtime.py:42-45`).

Celery is a **vestigial dependency**:

- `celery==5.5.1` is pinned at `backend/requirements.txt:12` but never imported.
- `USE_CELERY` appears in `backend/.env.example:28` and
  `deploy/.env.prod.example:31` as a live-looking setting, and no code reads it.
  `CLAUDE.md:46` states this outright.
- The `workers/` directory does not exist.
- Neither `docker-compose.yml` nor `docker-compose.full.yml` defines a worker
  service. `backend/Dockerfile:28` pins `--workers 1`.
- `docs/STANDARDS.md:136` still tells contributors that long jobs go through
  Celery. This is wrong; see `docs/OPEN_SOURCE_CHECKLIST.md` §6.1.

**Consequence:** `--workers 2` is not a scaling strategy here, it is a bug. Two
uvicorn workers means two schedulers, two pollers, and two watchdogs racing over
the same rows. The lease claim is a conditional `UPDATE` so it is *safe*, but
every job runs twice as often as intended in aggregate and the watchdog in one
worker can restart loops the other worker is already using. Run one worker.

### 1.3 Module map

```
backend/app/
  main.py           FastAPI app, lifespan, /api/health, _apply_schema_patches()
  config.py         pydantic Settings + DB overlay, get_settings() lru_cache
  database.py       async engine (asyncpg) + sync engine (psycopg2), get_db()
  deps.py           auth dependencies: get_current_user, get_current_admin
  models*.py        ORM, split by domain (see §8.1)
  schemas*.py       Pydantic request/response, split by domain
  api/              HTTP routers, mounted at /api
  services/
    tasks/          the in-process task platform (§4)
    billing/        pre-hold, usage, settlement, alerts, estimates (§5)
    drama/          episodic-drama domain, split into 30+ small files
    tokenfree_*.py  the single upstream provider implementation (§6)
    storage.py oss.py oss_queue.py   media storage (§8.2)
    epay.py         third-party payment gateway (§7)
    ffmpeg_compose.py  final video assembly
  logging_setup.py  log format, CJK-safe handler
frontend/src/       user app. i18n in i18n/, styles in styles/printfilm.css
admin/src/          admin console. Tailwind v4, no i18n layer at all
deploy/             infra-only compose, env examples, maintenance scripts
docs/               this file and its siblings
```

---

## 2. Running each component

### 2.1 Middleware only (Postgres + Redis)

```bash
cp deploy/.env.prod.example deploy/.env.prod     # change POSTGRES_PASSWORD first
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod ps
```

`POSTGRES_PASSWORD` uses compose's required-variable syntax
(`deploy/docker-compose.yml:16`: `${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in
deploy/.env.prod}`), so compose refuses to start without it. This is the only
truly required env var in the whole system.

Both containers map to `0.0.0.0` (`deploy/docker-compose.yml:13, 31`) for local
debugging. Both have healthchecks with 20 retries (`deploy/docker-compose.yml:20-23,
35-38`).

### 2.2 Backend

```bash
cd backend
python -m venv .venv
# Windows: .\.venv\Scripts\activate
# Linux:   source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then edit it
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`--reload` is fine for development, `--workers 1` is the production form. Startup
runs, in order (`main.py:97-114`):

1. `init_db()` (`main.py:99`) — `create_all`. See §8.3 for why this is a problem in
   multi-worker setups.
2. `_apply_schema_patches()` (`main.py:100`) — hand-written additive DDL for columns
   `create_all` cannot add to an existing table.
3. `load_model_settings_cache()` (`main.py:104`) — reads routing config from the DB.
4. `seed_templates()` (`main.py:105`) — inserts missing templates only, never
   overwrites admin edits.
5. built-in Skill seed, and `ADMIN_BOOTSTRAP_EMAILS` privilege grant
   (`CLAUDE.md:78`).
6. `start_task_runtime()` (`main.py:114`).

**Font prerequisite.** `services/ffmpeg_compose.py` burns subtitles with FFmpeg
`drawtext`. Without a CJK-capable font, every subtitle renders as a row of tofu
boxes. `deploy/README.md:43-51` documents the Ubuntu install:

```bash
sudo apt-get install -y fonts-wqy-zenhei fonts-wqy-microhei fontconfig
```

`FRAMECUT_FONT` is read straight from the environment, *not* through `Settings`
(`backend/app/services/ffmpeg_compose.py:365`). If neither `FRAMECUT_FONT` nor a
system CJK font is available, composition fails at runtime
(`ffmpeg_compose.py:1111`). Already-composed films are not retroactively fixed —
you must re-run composition.

### 2.3 Frontend and admin

```bash
cd frontend && npm install && npm run dev     # 5173
cd admin    && npm install && npm run dev     # 5174
```

`npm run build` runs `tsc -b && vite build` in both
(`frontend/package.json:8`, `admin/package.json:8`). `npm run lint` is oxlint.

API base resolution differs between the two apps, and getting it wrong is a common
source of confusing CORS errors:

- `frontend/` has **no Vite proxy** (`CLAUDE.md:86`). If `VITE_API_BASE` is unset,
  the app targets `current-host:8000`. If `VITE_API_BASE` is set to the **empty
  string**, it targets the current origin and relies on nginx to proxy `/api`.
  `frontend/.env.production:1` documents the production case.
- `admin/` **does** proxy `/api` and `/static` to `:8000` (`CLAUDE.md:87`).

---

## 3. Configuration

### 3.1 How configuration is actually resolved

This is the single most important thing to understand before debugging settings.

```
.env / environment  →  Settings  →  get_settings()  →  DB overlay  →  effective value
                       (lru_cache)   (model_copy(update=overlay))
```

- `Settings` is a `pydantic_settings.BaseSettings` subclass at
  `backend/app/config.py:10-188`. It reads `backend/.env` if that file exists,
  otherwise `".env"` relative to the working directory
  (`config.py:6-15`). `extra="ignore"`, so unknown keys are tolerated.
- There is **no `env_prefix`** (`config.py` has none), so the variable name is just
  the uppercased attribute name: `secret_key` → `SECRET_KEY`.
- `get_settings()` is `@lru_cache` (`config.py:191-202`) and layers the DB overlay
  on top via `model_copy(update=overlay)`. **Any exception while reading the
  overlay is swallowed** (`config.py:200-201`) — a broken `app_settings` row
  therefore degrades to plain env values with no log line.
- `reload_settings()` (`config.py:205-213`) clears the cache and calls
  `oss.reset_oss_client()`. The admin UI calls this after saving.

**113 settings fields total.** 88 of them are admin-overridable through the DB
overlay; the whitelist is `model_config_field_names()` at
`backend/app/schemas_settings.py:276-367`. The remaining 25 are env-only.

### 3.2 Required vs optional

**Nothing raises at load time.** Every field has a default
(`config.py:17-188`). Fields that are functionally mandatory raise at *use*:

| Condition | Raised at | Exception |
|-----------|-----------|-----------|
| `DATABASE_URL` does not start with `postgresql` | import of `app.database` | `RuntimeError` (`database.py:19-25, 39`) |
| `openai_api_key` empty → any text generation | `llm_client.py:25-32` | `LlmUnavailableError` |
| `epay_pid` or `epay_key` empty → create order | `epay.py:58-59` → HTTP 503 (`api/billing.py:163-164`) | `ValueError` |
| `oss_enabled=true` but bucket/AK/SK incomplete | `oss.py:26-28` | `RuntimeError` |
| Redis unreachable → password reset | `password_reset.py:67-69` | `RedisUnavailableError` (no in-memory fallback) |
| No `FRAMECUT_FONT` and no CJK font | `ffmpeg_compose.py:1111` | compose failure |

**Production minimum set:** `SECRET_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD`, plus
whichever provider keys the deployment actually uses.

`SECRET_KEY` is load-bearing twice over: it signs JWTs
(`backend/app/services/auth.py:26, 31`) and it derives the Fernet key that encrypts
every secret stored in the database — `sha256(secret_key)` → urlsafe base64 →
`Fernet` (`backend/app/services/model_settings.py:60-64`). **Rotating `SECRET_KEY`
silently invalidates every stored API key**: decryption returns `""` with a warning
(`model_settings.py:82-84`) and the next request fails as if no key were configured.

### 3.3 Environment variables read outside `Settings`

One: `FRAMECUT_FONT`, at `backend/app/services/ffmpeg_compose.py:365`. It appears in
no `.example` file as an active assignment. It is also absent from
`backend/.env.example` entirely, which is how the tofu-subtitle problem usually
reaches production.

### 3.4 Env-var hygiene problems in the shipped examples

`backend/.env.example` (97 lines) contains four variables that no code reads:

| Var | Line | Problem |
|-----|------|---------|
| `USE_CELERY` | 28 | No `Settings` field, no reader. See §1.2 |
| `DB_POOL_SIZE_CELERY` | 12 (commented) | No field, no reader |
| `DB_MAX_OVERFLOW_CELERY` | 13 (commented) | No field, no reader |
| `PRINTFILM_DB_ROLE` | 8 (comment only) | No field, no reader |

Conversely, roughly 50 `Settings` fields appear **nowhere** in
`backend/.env.example`, including every `TASK_*` concurrency knob, every
`BILLING_EST_*` estimate, all seven `SMTP_*`, and `FFMPEG_PATH` / `FFPROBE_PATH`.
The task knobs are mentioned only in prose at `deploy/README.md:87`. An operator
reading `.env.example` has no way to discover the concurrency settings that
actually control throughput.

### 3.5 Dead settings

| Var | Where | Note |
|-----|-------|------|
| `DEFAULT_PREVIEW_RESOLUTION` | `config.py:102` | Declared, never read |
| `OSS_UPLOAD_QUEUE` | `config.py:181` | Declared, never read |
| `TOS_ENDPOINT` / `TOS_BUCKET` / `TOS_ACCESS_KEY` / `TOS_SECRET_KEY` / `CDN_BASE` | `config.py:163-167` | Five settings for a Volcengine TOS + CDN integration that does not exist. No service file reads them. Two of them are flagged secret in `schemas_settings.py:377-378`, so they show up as encrypted fields in the admin UI that do nothing |
| `BILLING_MARKUP` | `config.py:109` | Declared, never applied. `billing/pricing.py:59-63` documents that it is compatibility-only |

**Also note `backend/app/database.py:12, 44`:** the module snapshots
`get_settings()` at import time and builds the engine once. So `DATABASE_URL` and
the pool settings are **not** reloadable through the admin overlay — a restart is
required. Editing them in the admin UI appears to save and has no effect.

### 3.6 Production environment differences

`deploy/.env.prod.example` sets four things that must not be left at dev defaults:

| Var | Dev (`.env.example`) | Prod (`.env.prod.example`) |
|-----|----------------------|---------------------------|
| `CORS_ORIGINS` | localhost 5173/5174 | real domains (`:19`) |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:8000` | `https://your-site.example.com` (`:18`) |
| `BILLING_ENABLED` | `false` (`:32`) | `true` (`:34`) |
| `MODEL_LLM` | empty (`:26`) | `kimi-k2.6` (`:29`) |

`deploy/.env.docker.example:28-29` additionally sets `MODEL_IMAGE=seedream-5-0-pro`
and `MODEL_VIDEO=seedance-2-5`, which differ from the `config.py` defaults. That
difference matters — see §11.1.

---

## 4. Task lifecycle

### 4.1 File inventory

`backend/app/services/tasks/`:

| File | Lines | Role |
|------|------:|------|
| `service.py` | 1261 | `create_task`, cancel/list/get, sequential-batch activation, stale reconciliation, rebalance |
| `scheduler.py` | 293 | 1 s tick loop, lease claim, in-process job dict, orphan recovery |
| `executor.py` | 324 | Runs one task: freeze → handler → terminal. Owns the billing calls |
| `handlers.py` | 293 | `(domain, task_type)` registry, 24 entries |
| `poller.py` | 304 | NIO selector over `awaiting_poll` rows |
| `runtime.py` | 117 | Start/stop façade + watchdog |

ORM in `backend/app/models_tasks.py` (136 lines), request schemas in
`backend/app/schemas_tasks.py`.

### 4.2 The chain, one hop per line

```
create_task                         service.py:95
  └─ balance probe (no hold)        service.py:121  → ensure_balance_for_task
  └─ INSERT TaskRun status="pending"                service.py:129
_scheduler_loop (1 s tick)          scheduler.py:123
  └─ _tick                          scheduler.py:142
      ├─ orphan recovery            scheduler.py:147
      ├─ billing reconcile          scheduler.py:150
      ├─ sequential batch activation scheduler.py:154
      └─ candidate SELECT           scheduler.py:173
  └─ CAS UPDATE → status="leased"   scheduler.py:199-206
  └─ asyncio.create_task(_run_one)  scheduler.py:228
execute_task_run                    executor.py:19
  └─ freeze_for_task                executor.py:51   → settlement.py:169
  └─ status="running", lease_until=NULL   executor.py:73-76
  └─ async with billing_scope(task_id)     executor.py:89
  └─ handler.executor(task)         executor.py:95
       └─ (fragment_video) submit_fragment_video_task        drama/jobs.py:1041
            └─ status="awaiting_poll", provider_task_id set drama/jobs.py:1201
_poller_loop (ark_video_poll_interval) poller.py:107
  └─ _select_and_poll_due           poller.py:126
  └─ _poll_one_task                 poller.py:166
       └─ poll_fragment_video_task  drama/jobs.py:1359
            ├─ finalizing claim     drama/jobs.py:1464
            └─ apply_fragment_video_assets → record usage   generation.py:1797
  └─ _complete_task                 executor.py:132
       └─ status="succeeded" + settle_task   executor.py:136, 152
```

### 4.3 Status values

`TaskRun.status` literals, with the write site for each:

| Status | Written at | Terminal? |
|--------|-----------|-----------|
| `pending` | `service.py:129`, `ephemeral.py:48`, `executor.py:312`, `scheduler.py:277`, `jobs.py:1142` | no |
| `leased` | `scheduler.py:198` | no |
| `running` | `executor.py:73`, `ephemeral.py:129`, `ephemeral.py:231` | no |
| `awaiting_poll` | `jobs.py:1201`, `ephemeral.py:249` | no |
| `cancel_requested` | `service.py:1000, 1069, 1164`, `scheduler.py:198, 277` | no |
| `awaiting_review` | **never written** | declared `service.py:27`, read `drama/generation.py:735, 759` |
| `succeeded` | `executor.py:136`, `ephemeral.py:144, 366` | **yes** |
| `failed` | `executor.py:29, 163, 194`, `poller.py:174, 260`, `ephemeral.py:120, 156, 223, 263, 379` | **yes** |
| `cancelled` | `executor.py:136, 271`, `service.py:244, 334`, `jobs.py:1336` | **yes** |

Canonical sets: `TERMINAL_TASK_STATUSES = {"succeeded", "failed", "cancelled"}`
(`service.py:21`); `ACTIVE_TASK_STATUSES` is the other six
(`service.py:22-29`). Both are duplicated in
`backend/app/services/billing/settlement.py:20-29, 358`.

`awaiting_review` is declared in two modules and never written. It is dead
surface, not a bug — but do not build a query on it expecting rows.

**Do not confuse the two status axes.** `TaskRun.status` is the table above.
`TaskRun.current_step_status` / `TaskStep.status` are a separate, finer set:
`pending`, `submitting`, `prepared`, `polling`, `finalizing`, `done`, `failed`,
`cancelled` (`service.py:1252-1261`, `jobs.py:1126, 1144, 1184, 1204, 1468`).

### 4.4 The two columns that matter

| Column | Line | Meaning |
|--------|------|---------|
| `next_action_at` | `models_tasks.py:33` | **The real scheduling column.** `NULL` means "deferred, do not lease" and is the signal `reconcile_sequential_batches` (`service.py:531-668`) uses to activate a batch |
| `lease_until` | `models_tasks.py:35` | Set to `now + 10 min` at `scheduler.py:205`. **Nulled the moment the task reaches `running`** (`executor.py:76`) |

There is no `SELECT … FOR UPDATE` and no `SKIP LOCKED` in the scheduler. Mutual
exclusion is optimistic: a conditional `UPDATE … WHERE id = ? AND status = ?`
followed by a `rowcount == 1` check (`scheduler.py:199-210`).

### 4.5 Concurrency model

Everything is asyncio. No threads, no processes, no external worker.

| Component | Mechanism | Concurrency control |
|-----------|-----------|--------------------|
| Scheduler | `asyncio.Task` named `task-scheduler`, created `scheduler.py:45` | **Counter**, not a semaphore: `max(1, task_runtime_max_concurrency)` global slots (`scheduler.py:165`) and `max(1, task_user_max_concurrency)` per user (`scheduler.py:166, 194`) |
| Poller | `asyncio.Task` named `task-poller`, created `poller.py:42` | `asyncio.Semaphore(task_poll_max_concurrency)` — `_selector_sem`, `poller.py:39`, acquired `poller.py:155` |
| Ephemeral poller | same task, second call per cycle | **none** — a serial `for` loop at `poller.py:234-237` that does not take `_selector_sem` |
| Executor | one `asyncio.Task` per run, created `scheduler.py:228`, tracked in `_running_jobs` (`scheduler.py:29`) | inherits the scheduler counter |
| Watchdog | `asyncio.Task` named `task-runtime-watchdog`, created `runtime.py:55` | none |

Loop bodies:

- Scheduler: `scheduler.py:123-138`. Sleep 1.0 s. Each tick is wrapped in
  `asyncio.wait_for(..., timeout=max(20, task_runtime_tick_stale_sec - 10))` =
  50 s at defaults (`scheduler.py:127-129`). A tick that overruns is logged, not
  fatal.
- Poller: `poller.py:107-122`. Sleep `max(1.0, ark_video_poll_interval)` = 8 s
  (`poller.py:109`).
- Watchdog: `runtime.py:81-100`. Sleep
  `max(2.0, task_runtime_watchdog_interval_sec)` = 5 s (`runtime.py:89`).

Because handlers are plain coroutines with no isolation, **any blocking call in a
handler stalls the whole event loop** — including the scheduler and poller. This is
why a slow synchronous call shows up as "all tasks stuck", not as "one task stuck".

### 4.6 Recovery — three different mechanisms

These are routinely confused. They act on different objects.

**A. Orphan recovery — `recover_orphaned_tasks()`** (`scheduler.py:249-293`)

- Act**s on**: DB rows in `leased` or `running`.
- Selects: `leased` AND (`updated_at < now - grace` OR `lease_until < now`); or
  `running` AND `updated_at < now - grace` (`scheduler.py:256-271`).
  `grace = max(5, task_runtime_recover_grace_sec)` = **30 s** (`scheduler.py:251`).
- **Guard**: `_job_alive(task.id)` (`scheduler.py:275`, defined `scheduler.py:117-119`)
  checks the in-process `_running_jobs` dict. If a local coroutine is still alive,
  the row is left alone. This is what keeps a genuinely long-running job from being
  reset every 30 s.
- Act**s**: status → `pending` (or `cancel_requested`), `next_action_at = now`, both
  lease columns `NULL`, event `task.recovered` (`scheduler.py:277-288`).
- Effect: the task **re-executes from the top**.
- Cadence: every `task_runtime_orphan_check_sec` = 30 s (`scheduler.py:147`).

**B. Watchdog soft restart** (`runtime.py:94-100`)

- Act**s on**: the loop coroutine itself (`_scheduler_task`, `_poller_task`). Not on
  any task row.
- Triggers when `status() != "running"` (the asyncio task ended) or the tick is
  stale: scheduler `max(15, task_runtime_tick_stale_sec)` = 60 s
  (`scheduler.py:112`); poller `max(30.0, task_poll_stale_sec, poll_interval * 4)`,
  widened to `max(stale_sec, 720.0)` only while `_poll_inflight` is non-empty
  (`poller.py:99-103`).
- Act**s**: set stop event, `cancel()` the loop task, await it, **then
  `recover_orphaned_tasks()`** (`scheduler.py:81`), clear the event, create a fresh
  task (`scheduler.py:84`).
- **Lossless for in-flight jobs.** `_running_jobs` is deliberately left alone —
  see the comment at `scheduler.py:68`. Contrast `stop_scheduler`
  (`scheduler.py:49-65`), which does cancel every job.
- Both restart paths no-op when `_intentionally_stopped`
  (`scheduler.py:71-72`, `poller.py:61-62`), and both `*_tick_stale()` return
  `False` in that state (`scheduler.py:110-111`, `poller.py:96-97`) — so shutdown
  is never fought by the watchdog.
- Cadence: every `task_runtime_watchdog_interval_sec` = 5 s (`runtime.py:89`).

**C. Billing reconcile — `reconcile_terminal_frozen_tasks()`**
(`billing/settlement.py:361-391`, called `scheduler.py:150`)

- Act**s on**: billing state, not scheduling.
- Selects `billing_status == "frozen"` AND terminal status AND
  `finished_at < now - 120` (`TERMINAL_FROZEN_RECONCILE_GRACE_SEC`,
  `settlement.py:356`).
- The 120 s grace exists because every terminal writer sets the status *first* and
  settles *after* (`settlement.py:354-355`).

| Symptom | Mechanism | Row reset? | Running job killed? |
|---------|-----------|-----------|---------------------|
| `running` row, `updated_at` older than 30 s, process alive | none — `_job_alive` suppresses | no | no |
| `running`/`leased` row stale, no local job | A | **yes** | already gone |
| Scheduler heartbeat older than 60 s | B | no | **no** |
| Poller heartbeat older than 600 s (720 s while downloading) | B | no | no |
| terminal + `frozen` older than 120 s | C | billing only | no |

### 4.7 Retry, backoff, timeouts

**There is no exponential backoff anywhere.** Every retry delay is a flat
`ark_video_poll_interval` (default 8 s).

| Delay | Value | Source |
|-------|-------|--------|
| Scheduler tick sleep | 1.0 s | `scheduler.py:138` |
| Poller tick sleep | `ark_video_poll_interval` = 8 s | `poller.py:109` |
| Poller backoff while upstream reports `running` | `now + poll_interval` | `jobs.py:1413` |
| Poller backoff after a poll exception | `now + poll_interval`, unless `finalizing` | `poller.py:204-206` |
| Ephemeral backoff while `{"", "running", "queued"}` | `now + poll_interval` | `poller.py:287-289` |
| prepare → submit re-queue | immediate | `jobs.py:1146` |
| Orphan requeue / interrupted requeue | immediate | `scheduler.py:278`, `executor.py:313` |

Attempt limits: `max_attempts = max(1, drama_fragment_max_attempts or 3)`
(`jobs.py:1099, 1377`; default at `config.py:77`). The counter lives in
`frag.params["generation_attempts"]` (`jobs.py:1091, 1117`) — **not** in
`TaskStep.attempt_count`, which the platform declares (`models_tasks.py:88`) but
never writes.

Timeouts:

| Bound | Value | Source |
|-------|-------|--------|
| api/studio poll hard timeout | `ark_video_poll_timeout` = 900 s, measured from `started_at or created_at` | `poller.py:216, 256` |
| Timeout outcome | `failed`, `error_code="poll_timeout"`, message `视频轮询超时，预扣已退回`, then `settle_task` | `poller.py:260-276` |
| Drama finalizing claim TTL | 10 min | `jobs.py:1230` |
| Finalizing over-claim escape | a `polling` task whose claim has more than 12 min left is reset to `next_action_at = now` | `service.py:398, 409-430` |

**`fragment_video` has no wall-clock timeout.** `poll_fragment_video_task` loops
indefinitely as long as the upstream keeps answering `running`. Only
`drama_fragment_max_attempts` and a terminal upstream failure bound it.

### 4.8 Handler registry

`TASK_HANDLERS: dict[tuple[str, str], TaskHandler]` at `handlers.py:263-288`,
looked up by `get_task_handler(domain, task_type)` (`handlers.py:292-293`). Five
domains: `drama`, `kepu`, `tools`, `api`, `studio` (`schemas_tasks.py:25`).

**14 real handlers** — executed by the scheduler:

| Domain | task_type | Line |
|--------|-----------|------|
| drama | `script_summary` | `handlers.py:264` |
| drama | `episode_script` | `:265` |
| drama | `fragment_plan` | `:266` |
| drama | `fragment_video` | `:267` |
| drama | `asset_image` | `:268` |
| drama | `asset_video` | `:269` |
| drama | `seed_assets` | `:270` |
| kepu | `project_pipeline` | `:281` |
| kepu | `shot_regen_image` | `:282` |
| kepu | `shot_regen_video` | `:283` |
| kepu | `shot_regen_audio` | `:284` |
| kepu | `project_regen_audio` | `:285` |
| kepu | `project_compose_only` | `:286` |
| tools | `mock_delay` | `:287` |

**10 ephemeral placeholders** — `_noop_ephemeral` (`handlers.py:252-253`): drama
`agent_chat`, `skill_optimize`, `voice_prompt`, `voice_synthesis`; kepu
`content_expand`; api `v1_image`, `v1_video`, `v1_seedance`; studio `tool_image`,
`tool_video` (`handlers.py:271-280`).

These still get a `TaskRun` row for billing and audit, but the real work runs
inline in the request via `run_billed_ephemeral` (`ephemeral.py:84-176`) or
`run_billed_ephemeral_deferred` (`ephemeral.py:187-282`). Deferred ones
(`v1_video`, `v1_seedance`, `tool_video`) are picked up later by the poller via
`settle_deferred_video_poll` (`ephemeral.py:285-391`).

**Registering a new task type is not optional.** `create_task` raises
`ValueError("当前任务类型尚未接入任务平台")` at `service.py:106` when the lookup
misses. A `(domain, task_type)` pair that is not in `HANDLERS` cannot be created at
all — not queued, not failed, rejected.

**Registration order is not grouped by real-vs-ephemeral.** The kepu real handlers
(`handlers.py:281-286`) and `tools/mock_delay` (`:287`) come *after* the api/studio
ephemeral block. Group by domain, not by line position.

### 4.9 A task in `awaiting_poll` does not hold a slot

`count_user_active_runtime_tasks` (`service.py:848-853`) counts only
`("leased", "running")`. So a task waiting on an upstream video render occupies
neither a global slot nor a per-user slot, and the scheduler will keep starting new
work while it waits.

It **is** still counted by `count_user_inflight_fragment_video_tasks` against
`DRAMA_USER_VIDEO_JOB_LIMIT` (default 12, `config.py:75`), used at `service.py:206,
566, 643, 715, 815`. That is the throttle that actually bounds video concurrency.

### 4.10 Two-phase prepare/submit

`("drama", "fragment_video")` re-enters itself once, via `payload["nio_phase"]`
(`jobs.py:1045`):

1. **`prepare`** (`jobs.py:1115-1160`) — persists attempt counters into
   `frag.params` (`:1117-1124`), calls `prepare_fragment_video_for_submit` (`:1129`),
   stores the serialized preparation in the payload (`:1137-1141`), then sets its
   own row back to `status="pending"` with both lease columns `NULL`
   (`:1142-1148`) and returns `{"deferred": True}`. The executor sees `deferred` and
   returns without writing a terminal state (`executor.py:100-102`).
2. **`submit`** (`jobs.py:1162-1226`) — submits upstream (`:1187`), then writes
   `status="awaiting_poll"`, `provider_task_id`, `progress_percent = 40`,
   `next_action_at = now + poll_interval` (`:1201-1207`).

The executor refuses to overwrite `awaiting_poll` with a terminal state
(`executor.py:100-105`).

---

## 5. Billing

### 5.1 Unit and shape

The wallet unit is the **fen** (1/100 CNY). `users.balance_fen` and
`users.frozen_fen` (`backend/app/models.py:44-45`). Every mutation goes through
`_ledger` (`billing/settlement.py:39-60`), which writes a `wallet_ledger` row
carrying `delta` and the post-transaction `balance_after`, and locks the user row
with `SELECT … FOR UPDATE` + `populate_existing=True` (`settlement.py:63-72`).

There is **no function named `pre_hold` anywhere in the repository.** The pre-hold
is `freeze_for_task`. The pre-queue *check* is `ensure_balance_for_task`.

### 5.2 Flow

**Step 1 — check (no mutation).** `create_task` builds an unattached `TaskRun`
named `balance_probe` (`service.py:109-120`) and calls `ensure_balance_for_task`
(`service.py:121` → `settlement.py:111-132`). It locks the user, sums existing
`pending_commitment`, and raises `ValueError` if
`balance < pending_commitment + need` (`settlement.py:125-131`). **Nothing is
frozen.** Batch variant: `ensure_balance_for_task_batch` (`settlement.py:135-166`),
called at `api/billing.py:88`.

**Step 2 — freeze.** `freeze_for_task(db, task)` (`settlement.py:169-205`):

- Idempotent via an early return on `billing_status == "frozen"`
  (`settlement.py:178-179`).
- `user.frozen_fen += need` (`:192`), `task.billing_estimate_fen = need` (`:193`),
  `task.billing_status = "frozen"` (`:194`), and a
  `WalletLedger(kind="freeze", delta=-need)` row (`:195-203`).
- If billing is globally off, sets `billing_status = "skipped"` with a zero estimate
  (`:182-186`).

Three call sites: `tasks/executor.py:51`, `billing/ephemeral.py:118`,
`billing/ephemeral.py:221`.

Insufficient balance → `_fail_task_before_start(error_code="insufficient_balance")`
(`executor.py:52-57`). Any other freeze exception → the same helper with
`error_code=type(exc).__name__` (`executor.py:58-70`). The comment at
`executor.py:59` explains why: letting the exception escape would strand the task in
`leased` until the 30 s orphan sweep.

**Step 3 — usage rows.** `record_line(...)` at `billing/usage.py:16-84` is the
**only** writer of `usage_events` (module docstring `usage.py:2`). Task attribution
is implicit, via the `ContextVar` set by `billing_scope`
(`billing/context.py:9, 20-26`), which the executor opens at `executor.py:89` and
the poller at `jobs.py:1366`.

For fragment video the row is written during the poller's finalizing window, inside
`apply_fragment_video_assets` at `generation.py:1797` — i.e. **before** the terminal
status, by design.

**Step 4 — settle.** `settle_task(db, task_id)` (`settlement.py:208-351`):

- `charged = sum(e.charge_fen for e in unsettled events)` (`:277`), then marks them
  `settled` (`:278-279`).
- `frozen_for_task = task.billing_estimate_fen` (`:301`);
  `user.frozen_fen = max(0, frozen_fen - frozen_for_task)` (`:302`).
- **Overage** — `extra = max(0, charged - frozen)` → a
  `WalletLedger(kind="settle", delta=-extra, note="settle_overage")` row, plus a
  `logger.warning` (`:306-322`). **The balance is allowed to go negative here**;
  there is no second check.
- **Refund** — `refund = max(0, frozen - charged)` → a
  `WalletLedger(kind="unfreeze", delta=+refund, note="refund_unused_freeze")` row
  (`:323-332`).
- A final zero-delta `settle` row recording the arithmetic
  (`:337-345`), then `billing_status = "settled"` (`:336`).
- `process_billing_alerts_after_charge` fires afterwards (`:347-350`).

Idempotency, in layers:

| Guard | Where |
|-------|-------|
| `billing_status == "settled"` → return the recorded numbers | `settlement.py:213-217` |
| `frozen` but an `unfreeze`/`settle` ledger row already exists → only align `UsageEvent.settled` and status; **no second refund** | `settlement.py:220-246` |
| `frozen` with no events but `billing_charged_fen > 0` (interrupted mid-settle) → align to settled, do not treat the whole hold as a refund | `settlement.py:256-266` |
| `skipped` with no events → mark settled, no wallet touch | `settlement.py:267-275` |
| `skipped` with events → record charged, no wallet touch | `settlement.py:282-286` |
| Not `frozen` but events exist (e.g. `none`) → record usage only, never touch the wallet | `settlement.py:289-299` |

14 call sites, listed in §5.6.

### 5.3 Cost model

Prices are per **upstream token**, resolved in this order:

1. **Real upstream cost, if the response carries it.**
   `parse_upstream_cost_fen` (`billing/pricing.py`) looks for any of
   `cost_fen`, `cost_cents`, `cost`, `total_cost`, `amount`, `cost_yuan`,
   `total_cost_yuan`, `creditsConsumed`, `quota`, `quota_consumed`,
   `consumed_quota` in the `usage` block (`billing/display.py:22-34`). For New API,
   `quota` is converted at `TOKENFREE_QUOTA_PER_USD = 500_000`
   (`tokenfree_gateway.py:15`) and then at `BILLING_USD_CNY` (default 7.0,
   `config.py:121`).
2. **Local conservative estimate.** Only when step 1 finds nothing. Inputs:
   `BILLING_EST_LLM_TOKENS` 80 000, `BILLING_EST_SEEDREAM_TOKENS` 45 000,
   `BILLING_EST_TTS_TOKENS` 5 000 (`config.py:123, 125, 126`),
   `BILLING_EST_SEEDANCE_TOKENS_PER_SEC` 32 000 (`config.py:127`).
   Unit prices: `BILLING_LLM_PER_M` 5.0, `BILLING_SEEDREAM_PER_M` 8.0,
   `BILLING_TTS_PER_M` 2.0, `BILLING_SEEDANCE_VIDEO0` 46.0,
   `BILLING_SEEDANCE_VIDEO1` 28.0 (`config.py:113-117`).
3. `BILLING_ESTIMATE_BUFFER` 1.2 (`config.py:111`) inflates estimates.

Official upstream pricing is fetched and cached by `tokenfree_pricing.py`
(`RECOMMENDED_MODELS` at `:70-148`; video settlement reference prices
`VENDOR_VIDEO_YUAN_5S_BY_RES` at `:32-36`; `MINIMAX_H3_USD_PER_SEC_720P = 0.08` at
`:38`).

`BILLING_MARKUP` (`config.py:109`) is **not applied** — see `billing/pricing.py:59-63`.

### 5.4 `billing_basis`

`billing_basis` is a **display facet derived on read**, not a stored column. It
answers "how do we know this number?".

Resolved by `resolve_billing_basis(estimated, raw_usage_json)` at
`billing/display.py:37-55`. Four values:

| Value | Label (`display.py:15-20`) | Condition |
|-------|--------------------------|-----------|
| `estimate` | 估算 | `UsageEvent.estimated` is true |
| `upstream_cost` | 实测(费用) | Not estimated, and `parse_upstream_cost_fen` finds a cost key |
| `upstream_usage` | 实测(token) | Not estimated, no cost key, but `total_tokens > 0` |
| `unknown` | 实测(未分类) | Not estimated, no cost key, no token count |

SQL filter counterparts in `billing_basis_sql_filter` (`display.py:79-99`), used by
`api/admin/usage.py:96-98` and `api/admin/tasks.py:40-52`. Note the filter accepts
`upstream` as an alias for "not estimated" (`display.py:84-85`), a value the
resolver never returns.

### 5.5 Ledger kinds

`wallet_ledger.kind` values in use: `topup` (`settlement.py:405`), `grant`,
`adjust`, `freeze` (`:195-203`), `unfreeze` (`:323-332`), `settle` (`:306-322`,
`:337-345`), `refund`.

`refund` is declared in the admin label map (`admin/src/lib/statusLabels.ts:47`) but
the settlement path uses `unfreeze` for refunds. `grant` and `adjust` come from
manual admin actions, not from the automatic path.

### 5.6 Every `settle_task` call site

| # | Site | Trigger |
|---|------|---------|
| 1 | `tasks/executor.py:152` | `_complete_task` — success, or cancel-on-success |
| 2 | `tasks/executor.py:181` | `_fail_task_before_start` — freeze-phase failure |
| 3 | `tasks/executor.py:249` | `_fail_task` — handler exception or `ok: False` |
| 4 | `tasks/executor.py:284` | `_mark_cancelled` — explicit cancel |
| 5 | `tasks/poller.py:187` | `missing_provider_task_id` |
| 6 | `tasks/poller.py:273` | `poll_timeout` |
| 7 | `tasks/service.py:270` | `fail_remaining_sequential_batch`, guarded by `billing_status == "frozen"` |
| 8 | `tasks/service.py:355` | `_mark_task_cancelled_stale`, same guard |
| 9 | `drama/jobs.py:1345` | `_settle_cancelled_after_finalized` — cancel landed inside the finalizing window |
| 10 | `billing/settlement.py:384` | `reconcile_terminal_frozen_tasks` — the >120 s background repair |
| 11 | `billing/ephemeral.py:167` | `run_billed_ephemeral` — exception branch |
| 12 | `billing/ephemeral.py:172` | `run_billed_ephemeral` — success branch |
| 13 | `billing/ephemeral.py:274` | `run_billed_ephemeral_deferred` — submit exception |
| 14 | `billing/ephemeral.py:391` | `settle_deferred_video_poll` — poller-driven terminal |

**Ordering invariant, in every case:** terminal status first, then `settle_task`,
then `commit`. That is exactly why the 120 s reconcile grace exists.

Sites 1–4, 7–9, 13, 14 wrap `settle_task` in `try/except` + `logger.exception` so a
DB blip during settlement does not lose the terminal write. Site 10 is the safety
net for the cases where even that failed.

### 5.7 The money trap

If a cancel arrives while usage is still being written, `_mark_cancelled`
**deliberately does nothing** — `executor.py:262-267` returns early when
`task_finalizing_window_open(task)` (`service.py:44-63`, reading
`payload["finalizing_until"]`). The window opens at `jobs.py:1464-1466` with a
10-minute TTL (`jobs.py:1230`) and closes via `clear_finalizing_window`
(`service.py:66-70`).

Rationale, in the code's own terms (`service.py:45-49`, `executor.py:257-259`):
refunding first would leave `usage_events` orphaned at `settled = 0` — money lost
and goods delivered. The compensating path is `jobs.py:1491-1505` →
`_settle_cancelled_after_finalized` (`jobs.py:1322-1355`), with a
`BaseException` release at `jobs.py:1521-1548` as a last resort so the claim can
never strand for hours.

**Operator consequence:** a task that looks "cancelled" in the UI can legitimately
be charged. This is correct behaviour, not a leak. Do not "fix" it by refunding
from the admin panel.

### 5.8 Misconfiguration risks

| Misconfiguration | Consequence | Cited |
|------------------|-------------|-------|
| `TOKENFREE_QUOTA_PER_USD` wrong | Every charge wrong, silently. It is a code constant, not a setting | `tokenfree_gateway.py:15` |
| `BILLING_USD_CNY` wrong | Same, at the FX step | `config.py:121` |
| `BILLING_EST_*` left at defaults while the upstream returns no cost fields | Every charge becomes a guess, and `billing_basis` reads `estimate`. Users are billed from a table nobody calibrated | `config.py:123-127` |
| `BILLING_ESTIMATE_BUFFER` too low | Under-charges, or over-charges once the buffer is applied twice across nested estimates | `config.py:111` |
| `BILLING_SEEDANCE_VIDEO0/1` stale after a vendor price change | Video is the most expensive line item and the most likely to drift | `config.py:113-114` |
| `BILLING_ENABLED` flipped on without `BILLING_SIGNUP_GRANT_FEN` | New users start at zero and cannot create a task at all (`ensure_balance_for_task` raises) | `config.py:129`, `settlement.py:125-131` |
| `BILLING_USER_ALERT_INTERVAL_FEN` too low | Alert spam; the alert mail is sent inline after every charge | `config.py:133`, `settlement.py:347-350` |
| `DRAMA_FRAGMENT_MAX_ATTEMPTS` too high | A systematically failing shot burns real upstream quota before the limit trips | `config.py:77`, `jobs.py:1099` |
| `BILLING_ADMIN_COST_ALERT_ENABLED=true` with a zero threshold and no emails | Silent no-op, or an alert storm | `config.py:136-139` |

---

## 6. Model routing

### 6.1 Logical vs physical

| Concept | Type | Where |
|---------|------|-------|
| **Physical channel** — a real gateway | `SystemModelChannel` / table `system_model_channels` | `schemas_routing.py:56-70`, `models_settings.py:25-43` |
| **Logical model** — what the user picks | `LogicalModel`, stored inside `app_settings.config_json`, not its own table | `schemas_routing.py:26-33` |
| **Binding** — logical model to a channel, with failover weight | `LogicalModelBinding` | `schemas_routing.py:15-23` |
| **Resolved route** — the final answer | `ResolvedModelRoute` (frozen) | `schemas_routing.py:113-126` |

A logical model has N bindings across M channels. The router walks them in order.
The mapping is configured in the DB, not in env, and the admin UI is the only
editor (`api/admin/settings.py:41-119`).

### 6.2 Where the config lives

Two tables:

- `system_model_channels` — one row per physical gateway. The API key is stored
  Fernet-encrypted in `api_key_ciphertext`, prefixed `enc:`
  (`model_settings.py:45`); legacy plaintext passes through
  (`model_settings.py:77-78`).
- `app_settings` — a single row `id="default"` whose `config_json` holds three
  keys: `"flat"` (the 88-field settings overlay), `"logical_models"`, and
  `"default_models"` (`model_settings.py:98-108, 365, 815`).

There is **no `logical_models` table.** 27 tables exist in total (§8.1); none is
named that.

**Env is only the first-import seed.** `_bootstrap_channels_from_env`
(`model_settings.py:126-142`) builds one channel from
`openai_api_key or ark_api_key` plus the `MODEL_*` ids, then
`load_model_settings_cache` (`:519-542`) recomposes the runtime state on every
startup and writes back any healed config. `CLAUDE.md:65` states it: the DB overlay
wins at runtime; `.env` is imported once.

### 6.3 The lock

The upstream is pinned to exactly one provider. `tokenfree_gateway.py:1` says so in
its docstring. Enforcement, not just documentation:

| Location | What it does |
|----------|--------------|
| `tokenfree_gateway.py:9-15` | `TOKENFREE_CHANNEL_ID`, `TOKENFREE_BASE_URL = "https://www.tokenfree.com/v1"`, `TOKENFREE_QUOTA_PER_USD` |
| `model_settings.py:372-420` (`_ensure_tokenfree_channel`) | Forces base URL, `api_format="openai"`, `protocol="auto"`, `enabled=True`, `sort_order=0`, `advanced_config=None`; **disables every other channel row** (`:417-419`) |
| `model_settings.py:699-740` (`patch_admin_routing_settings`) | Repeats the lock on every admin save and **discards the admin's model selection** — `models` is overwritten with `all_preset_channel_models()` (`:721`) |
| `model_settings.py:592-597` | Filters the returned channel list to the TokenFree row, so the UI cannot display an alternative |
| `tokenfree_gateway.py:79-91` (`apply_tokenfree_flat_overlay`) | Forces the Settings overlay's `openai_base_url` and `ark_base_url` to the same constant, and copies the channel key into both `openai_api_key` and `ark_api_key` |

`git grep -il tokenfree backend/app` returns 20 files and 427 mentions. See
`docs/OPEN_SOURCE_CHECKLIST.md` §5 for the full vendor-lock analysis and the
effort to abstract it.

### 6.4 Resolution order

`resolve_logical_model_candidates(capability, requested_model_id, ...)` at
`logical_model_router.py:45-114` returns an ordered failover list:

1. Snapshot from the in-process cache (`get_routing_snapshot`, `model_settings.py:57`).
2. Empty `requested_model_id` → the default model for that capability
   (`logical_model_router.py:53-55`).
3. **Exact logical-model match**, case-insensitive, `enabled` and capability-matched
   (`:57-76`). Non-empty result returns immediately.
4. **Direct upstream match** — the user named a raw upstream model id that exists in
   the channel's list; do not silently substitute a different logical model
   (`:78-87`).
5. **Same-capability fallback** — first resolvable model in stored order, skipping
   the already-tried id (`:89-102`).
6. **No logical models configured** → `[]` (`:104-114`).

Binding order inside `_routes_for_logical_model` (`:15-41`):

```python
sorted(bindings, key=lambda b: (
    0 if preferred_channel_id and b.channel_id == preferred_channel_id else 1,
    b.priority,
    -(b.weight or 100),
    b.id,
))
```

Each binding is then filtered: the channel must exist and be
`channel_connection_ready` (`model_routing_config.py:77-85`), must actually offer
the model (`channel_supports_model`, `:89-99`), and `_build_route` must succeed.

**A channel with an empty API key is silently dropped** — `_build_route` returns
`None` at `logical_model_router.py:206-207`. So a key that fails to decrypt (§3.2)
does not produce a "bad key" error; it produces "no routes", which surfaces as a
generic model-not-found further downstream.

Convenience wrappers: `resolve_logical_model` returns `candidates[0]`
(`:147-158`); `resolve_logical_model_id` maps frontend aliases
(`:162-171`, alias table `:250-268`); `resolve_upstream_model` adds legacy and bare
env fallbacks (`:175-196`).

Protocol auto-selection — `_auto_protocol` (`:222-237`): `audio` → `openai`;
image/video on the TokenFree channel (by id or by host substring) → `openai`;
image/video elsewhere → `ark`; default → `openai`. Only applied when
`channel.protocol == "auto"`.

### 6.5 The preset catalogue

`PRESET_MODELS` at `media_model_presets.py:11-87` is the enforced whitelist.
`all_preset_channel_models()` (`:171-182`) flattens it into the channel `models`
array. Mapping is 1:1 identity — logical id equals upstream model string.

| Capability | Logical id | Line | Note |
|-----------|-----------|------:|------|
| text | `kimi-k2.6` | `:14` | default script/storyboard |
| text | `deepseek-v4-pro` | `:20` | |
| text | `gpt-5.5` | `:26` | |
| image | `seedream-5-0-pro` | `:34` | best character consistency |
| image | `gpt-image-2` | `:41` | |
| video | `seedance-2-0` | `:50` | max 720p |
| video | `seedance-2-0-mini` | `:57` | max 720p, cheaper |
| video | `seedance-2-5` | `:64` | up to 1080p |
| video | `MiniMax-H3` | `:71` | 4–15 s, 720p only, ~$0.08/s |
| audio | `gemini-3.1-flash-tts` | `:80` | |

Two friendly aliases are merged on top: `seedance-2.5` and `seedance-2`
(`model_settings.py:488, 773`, via `_merge_friendly_alias_models` at `:181-218`).

**Namespace collision to watch:** aliases are dotted (`seedance-2.5`) while presets
are hyphenated (`seedance-2-5`). `PRESET_MODEL_ALIASES`
(`media_model_presets.py:112-126`) and `canonicalize_channel_model_id`
(`tokenfree_pricing.py:348-363`) translate between them, and the router keeps both
in sync. If you add a model, register it in both places.

Per-model generation whitelists — `model_generation_options`
(`media_model_presets.py:231-291`):

| Model | Resolutions | Duration |
|-------|------------|----------|
| any image | `1K`, `2K` (`:102`) | — |
| `seedance-*-mini` | `480p`, `720p` (`:250-257`) | 4–30 s |
| `MiniMax-H3` | `720p` only (`:258-265`) | 4–15 s |
| Seedance 2.5 | `480p`, `720p`, `1080p` (`:267-274`) | 4–30 s |
| other Seedance 2.0 | `480p`, `720p` (`:275-282`) | 4–30 s |

Config-time validation — `model_routing_validation_errors`
(`model_routing_config.py:279-315`) catches duplicate logical ids, missing
bindings, dangling `channel_id`, channels that do not offer the bound model, and
unresolvable defaults. Surfaced as HTTP 400 (`api/admin/settings.py:59-60`).

### 6.6 Where the key and base URL come from

```
logical model id
  → binding order (§6.4)
  → channel row (base_url forced to TOKENFREE_BASE_URL, key Fernet-decrypted)
  → ResolvedModelRoute {base_url, api_key, upstream_model, protocol, api_format}
```

Consumers:

| Path | Code |
|------|------|
| Text | `llm_client.chat_completions` (`llm_client.py:66-123`): resolves via `resolve_logical_model`, else falls back to `resolve_llm_api_key()` + `settings.model_llm`; POSTs to `{base}/chat/completions` |
| Image / video | `ark.py`: `_resolve_ark_route` (`:466-469`), `_route_headers` (`:471-477`), `_route_url` (`:479-491`), `_video_json` (`:493-501`) |
| Key fallback | `resolve_tokenfree_api_key` (`tokenfree_gateway.py:26-40`): channel key, else `openai_api_key or ark_api_key` |
| ARK key fallback | `ark.py:431-446`: enabled TokenFree channel, then any enabled channel with a key, then `settings.ark_api_key` |

`base_url` is not user-editable, by design (§6.3). Keys are entered in the admin UI
and encrypted into `system_model_channels.api_key_ciphertext`
(`model_settings.py:726`); a blank field on save preserves the previous key
(`:713-719`), and `clear_api_key` wipes it (`:716-717`).

Upstream catalogue pull: `list_upstream_models` (`upstream_model_catalog.py:122-163`).
`volc_tts` protocol raises (`:140-141`); anything matching `kie` / `ark` /
`volces.com` / `kie.ai` is forced to TokenFree (`:143-152`); otherwise
`GET {base}/models` with a Bearer header.

Mock mode: `ARK_MOCK=true` (`config.py:83`) uses local mock assets and needs no key.

---

## 7. Payments

Third-party gateway: 易支付 (epay) at `pay.gitcc.com` by default
(`config.py:153`).

### 7.1 SKU catalogue

Hard-coded in `billing/pricing.py:10-15`, no DB. `ORDER_EXPIRE_SECONDS = 300`
(`pricing.py:17`).

| id | amount_fen | credit_fen | note |
|----|-----------:|-----------:|------|
| `topup_10` | 10000 | 10000 | |
| `topup_49` | 49000 | 49000 | |
| `topup_99` | 99000 | **104000** | `recommended: true` |
| `topup_199` | 199000 | **220000** | |

Served by `GET /api/billing/skus` (`api/billing.py:53-59`).

### 7.2 Order flow

**Create** — `POST /api/billing/orders` (`api/billing.py:123-180`):

1. `close_expired_pending_orders(db, user_id)` (`:131`).
2. `sku_by_id`, else HTTP 400 (`:132-134`).
3. `out_trade_no = f"PF{int(time.time())}{user.id:04d}{uuid4().hex[:8]}"`
   (`:135`).
4. Insert `Order(status="pending", pay_type)` and **commit before** calling upstream
   (`:136-146`).
5. `epay.create_mapi_payment` → `POST {EPAY_API_URL}/mapi.php` with `device="pc"`,
   `clientip` from `X-Forwarded-For[0]` → `X-Real-IP` → `request.client.host` →
   `127.0.0.1` (`api/billing.py:110-120`), timeout 30 s (`epay.py:140`).
6. Response must carry `code == 1` (`epay.py:152-154`), else `ValueError` → HTTP 503
   (`api/billing.py:163-164`). HTTP 403 or a body containing `防火墙` produces a
   specific hint about the notify URL (`epay.py:147-150`).
7. `pay_mode` is `"qr"` with a `qr_payload`, or `"redirect"` with a `payurl`
   (`epay.py:160-186`). `_is_epay_cashier_url` (`epay.py:92-101`) rejects a cashier
   `/submit/` page masquerading as a QR payload.
8. `submit_url` for the fallback form post (`epay.py:104-107`).

**Callback** — `api/billing.py:399-464`, accepts both form-POST and query-GET
(`:401-405`).

1. `epay.verify(params)` (`epay.py:36-41`). Failure → `fail` + HTTP 400
   (`api/billing.py:407-409`).
2. `_notify_success` (`:393-396`) requires `trade_status` or `status`, uppercased,
   in `{TRADE_SUCCESS, SUCCESS, 1}`. Anything else returns `success` + HTTP 200 —
   i.e. "stop retrying", with nothing credited.
3. `SELECT … FOR UPDATE` on the order (`:422-424`) — this is the replay defence.
   See §7.3.
4. Amount check: `int(round(float(money) * 100)) != order.amount_fen` → `fail` +
   HTTP 400 with an `ERROR` log (`:430-442`).
5. `order.status == "paid"` → `success`, no second credit (`:444-445`).
6. Set `paid`, `trade_no`, `paid_at`; `billing.credit_topup` (`:451-461`).
7. `credit_topup` (`settlement.py:394-409`) locks the user and writes a
   `WalletLedger(kind="topup", delta=+credit_fen)` row with the post-transaction
   balance.

### 7.3 Duplicate and replayed callbacks

epay re-sends the same notification multiple times. Three independent defences:

1. `SELECT … WHERE out_trade_no = ?` **with `FOR UPDATE`** (`api/billing.py:422-424`)
   serialises concurrent callbacks for the same order. The comment at
   `api/billing.py:420-421` states the intent.
2. `if order.status == "paid": return success` (`:444-445`).
3. `credit_topup` itself re-locks the user row (`settlement.py:63-72`).

The race is closed by defence 1: two concurrent callbacks serialise, the second
reads `paid` after the lock releases.

**Unknown `out_trade_no` returns HTTP 404** (`:426-428`) with a warning. epay will
keep retrying, so a typo in the order table becomes a retry storm rather than a
silent drop.

### 7.4 The notify-URL constraint

**`EPAY_NOTIFY_URL` must not contain `/api/`.** epay's WAF blocks those payloads.
This is stated in three places: `epay.py:62-63`, `deploy/.env.prod.example:40`, and
`CLAUDE.md:71`.

nginx rewrites the clean path to the internal route — `frontend/nginx.conf:9-15`
and `deploy/nginx.local.conf:33-39` map `/epay/notify` →
`/api/billing/epay/notify`. Without that rewrite, every payment silently fails at
the WAF and returns HTTP 403 with the `防火墙` body.

Defaults if unset: notify falls back to `{public_base_url}/epay/notify`
(`epay.py:63-64`) and return to `{public_base_url}/pricing?paid=1` (`epay.py:65-66`).

### 7.5 Sku and money

`orders.status` ∈ `pending | paid | closed` (`models.py:275`), `pay_type` ∈
`alipay | wxpay` (`:274`). Wallet unit is fen throughout; the gateway receives
`money_yuan = f"{fen/100:.2f}"` (`epay.py:110-111`).

---

## 8. Data and media

### 8.1 PostgreSQL schema

27 tables, split across six ORM files.

**`models.py` — core**

| Table | Line | Purpose |
|-------|-----:|---------|
| `users` | 36 | accounts, `balance_fen`, `frozen_fen`, `quota_left`, `is_admin` |
| `billing_alert_notifications` | 62 | dedupe for balance/cost alert mails |
| `templates` | 75 | pipeline templates, category, `sort_order` |
| `projects` | 98 | a kepu project; `pipeline_mode` ∈ `full` \| `image_text` |
| `shots` | 149 | per-shot prompts and media URLs |
| `pipeline_jobs` | 178 | kepu stage records |
| `works` | 193 | published works |
| `usage_events` | 209 | **the billing ledger of record**; `estimated`, `raw_usage_json`, `charge_fen`, `settled` |
| `upstream_usage_daily` | 239 | upstream quota rollup for the admin cost view |
| `wallet_ledger` | 252 | every balance mutation |
| `orders` | 266 | epay top-up orders |
| `tool_runs` | 284 | single-shot tool centre runs |

**`models_tasks.py` — task platform:** `task_runs` (16), `task_steps` (81),
`task_events` (109), `task_targets` (125).

**`models_drama.py` — episodic drama (7):** `drama_projects` (16),
`drama_scripts` (42), `drama_episodes` (64), `drama_fragments` (93),
`drama_assets` (117), `drama_asset_refs` (142), `drama_voice_profiles` (159).

**`models_settings.py` — runtime config (2):** `app_settings` (16),
`system_model_channels` (28).

**`models_agent.py` — director Skills (1):** `agent_skills` (16).

**`models_api.py` — open API keys (1):** `api_keys` (12).

**No migration tool.** Not Alembic. `init_db()` runs `create_all` at startup
(`main.py:99`), and new columns must be hand-written into
`_apply_schema_patches()` in `main.py` (`main.py:100`), additive PostgreSQL DDL
only. The test schema in `backend/tests/conftest.py` must be kept in sync by hand.
`CLAUDE.md:77` states the consequence: run a single uvicorn worker in production to
avoid a `create_all` race.

### 8.2 Media storage

**Local disk is authoritative for the pipeline. OSS is a distribution layer.**

Everything lands under `backend/static/generated/` first
(`storage.py:32-33`), because FFmpeg only reads local files
(`storage.py:6`, `CLAUDE.md:82`):

```
backend/static/generated/
  p{project_id}/…        project media          storage.py:36-39
  users/u{user_id}/…     per-user uploads       storage.py:42-45
```

`publish_local(path, sync=False)` (`storage.py:244-287`) decides what URL to return:

| Condition | Behaviour |
|-----------|-----------|
| OSS disabled | return the `/static/...` URL (`:261-262`) |
| Kepu intermediate and `sync=False` | return local URL, do not enqueue (`:265-267`) |
| `oss_upload_async` true and not `sync` | `enqueue_oss_upload(local_url)`, return local URL immediately (`:274-280`) |
| enqueue raised | fall back to synchronous upload (`:280-281`) |
| synchronous upload failed after retries | log an error, **return the local URL anyway** (`:285-287`) — the pipeline never fails because of OSS |

`skip_oss_intermediates()` (`storage.py:190-197`) is a `ContextVar` that suppresses
intermediate uploads for the kepu pipeline; only `final.mp4` still goes to OSS
(`_KEPU_FINAL_NAMES`, `storage.py:26`). Wrap a kepu entry point in
`without_intermediate_oss` (`storage.py:203-211`).

`OSS_UPLOAD_ASYNC` (`config.py:180`, default true) selects async. The queue is
`oss_queue.py`, keyed by a content digest with a 2-hour TTL
(`oss_queue.py:18-19`), and it backfills the DB URL afterwards — the params keys it
rewrites are `voiceAudio`, `cover`, `url`, `image`, `video`
(`oss_queue.py:22`).

`is_local_static_url` (`storage.py:159-187`) is the predicate that decides whether a
URL points at local disk. Its host allowlist (`storage.py:174-177`) is
`www.printfilm.com`, `printfilm.com`, `kepu.printfilm.com`, and
**`kepu.printtfilm.com` — with a typo, three `t`s** (`:176`). Anything starting
`http://` or `https://` is otherwise treated as remote (`:185-186`). Getting this
predicate wrong in either direction breaks FFmpeg input resolution or causes a mass
re-upload. See `docs/OPEN_SOURCE_CHECKLIST.md` §2.4.

`local_path_from_url` (`storage.py:58-86`) resolves OSS URLs back to local paths by
matching the `/{oss_folder}/` marker, falling back to `/generated/`.

Switch: `OSS_ENABLED` (`config.py:170`) plus `OSS_BUCKET`, `OSS_ACCESS_KEY_ID`,
`OSS_ACCESS_KEY_SECRET` (`:173, 175-176`). `oss_enabled()` raises `RuntimeError` if
enabled and incomplete (`oss.py:26-28`). Object prefix: `OSS_FOLDER` (default `kepu`,
`config.py:174`); `OSS_PUBLIC_BASE` (`config.py:178`) supplies a custom CDN domain.

**No signed URLs and no expiry anywhere.** Everything is either a relative
`/static/...` path or a public OSS URL. `public_base_url` (`config.py:159`) is
prefixed by `to_public_url` (`storage.py:48-55`).

Download resilience: `download_to` (`storage.py:98-132`) streams to a `.part` file,
verifies against `Content-Length` (`:120-123`), and atomically renames (`:124`).
Timeouts are split so a long read is not cut by a short overall budget
(`_download_timeout`, `:89-94`).

### 8.3 Redis

Used for three things. **Not** a task queue.

| Use | Where | Fallback |
|-----|-------|----------|
| Progress pub/sub for SSE | `services/progress.py:1`, consumed at `api/projects.py:43` | **in-process `asyncio.Queue` per project id** (`progress.py:15-16`). Works single-process, silently broken across multiple workers |
| OSS upload dedupe queue | `services/oss_queue.py:10` | none |
| Password-reset rate limiting | `services/password_reset.py:57` | none — `RedisUnavailableError` at `:67-69` |

Single-process assumption in the progress fallback is another reason not to run
`--workers 2`.

Server config: `redis:7-alpine`, `--appendonly yes`, `--maxmemory 512mb`,
`--maxmemory-policy allkeys-lru` (`deploy/docker-compose.yml:32`). **With
`allkeys-lru`, Redis may evict the OSS dedupe keys** — which is safe (the upload
just happens twice) — but any future use of Redis for durable state will not be.

### 8.4 FFmpeg

`FFMPEG_PATH` / `FFPROBE_PATH` (`config.py:160-161`, both default to the bare
command name, so they resolve from `PATH`). Composition lives in
`ffmpeg_compose.py`; SIGTERM interruption has an automatic retry
(`CLAUDE.md:57`). Font prerequisite in §2.2.

---

## 9. Deployment

### 9.1 Three supported shapes

| Shape | File | Use |
|-------|------|-----|
| Full stack, public images | `docker-compose.yml` | self-host, no local build |
| Full stack, local build | `docker-compose.full.yml` | development, or when ACR is unreachable |
| Middleware only | `deploy/docker-compose.yml` | run API and web on the host behind nginx |

**Full stack from public images** (`docker-compose.yml`):

```bash
cp deploy/.env.docker.example deploy/.env.docker     # edit POSTGRES_PASSWORD, SECRET_KEY, ARK_API_KEY
docker compose --env-file deploy/.env.docker up -d
```

| Service | Image | Host port | Lines |
|---------|-------|----------:|-------|
| `postgres` | `postgres:16-alpine` | 15432 | `:8-23` |
| `redis` | `redis:7-alpine` | 16379 | `:25-37` |
| `api` | `gcc-registry.cn-hangzhou.cr.aliyuncs.com/gcc/printfilm-api:latest` | 8000 | `:39-68` |
| `web` | `…/printfilm-web:latest` | 8080 | `:70-77` |
| `admin-web` | `…/printfilm-admin-web:latest` | 8081 | `:79-86` |

The ACR namespace `gcc` is public, so `docker pull` needs no login
(`docker-compose.yml:1-2`). The `api` service injects `DATABASE_URL`,
`DATABASE_URL_SYNC`, and `REDIS_URL` itself, overriding any values in the env file
(`:45-47`) — this is why `DATABASE_URL` is absent from
`deploy/.env.docker.example`. It mounts a named volume at
`/app/static/generated` (`:49`) and `depends_on` both databases with
`condition: service_healthy` (`:50-54`).

Health check: `api` probes `http://127.0.0.1:8000/api/health` (`:56-66`), 15 s
interval, 40 s start period. `web` and `admin-web` wait for `api` to be healthy
(`:73-75`, `:82-84`), so the ~30 s first-boot delay is by design.

**Middleware only** (`deploy/docker-compose.yml`): Postgres + Redis with hardcoded
container names `ai-movie-pg` / `ai-movie-redis` (`:10, 27`) and volumes
`ai_movie_pgdata` / `ai_movie_redisdata` (`:19, 34`). `POSTGRES_PASSWORD` uses
compose's required form (`:16`). Then run the API and the two front-ends on the
host, fronted by nginx.

**Local build** (`docker-compose.full.yml`): same services, images built from
source, images named `printfilm-api` / `printfilm-web` / `printfilm-admin-web`
(`:41, 75, 87`).

### 9.2 What must be set in production

Beyond §3.6:

| Requirement | Why |
|-------------|-----|
| `POSTGRES_PASSWORD` non-default | compose `:16` in the infra file; default in the full-stack file |
| `SECRET_KEY` long and random | JWT signing **and** DB secret encryption (§3.2). Rotating it later destroys stored keys |
| `PUBLIC_BASE_URL` = real https origin | prefixes every media URL (`storage.py:55`) and is the epay fallback (§7.4) |
| `CORS_ORIGINS` = real front-end domains only | `config.py:183-186` defaults to localhost |
| `ADMIN_BOOTSTRAP_EMAILS` = our admin addresses | `config.py:188`; **requires a restart** — it is read at startup only (`CLAUDE.md:78`), and it only *promotes existing users*, never creates them |
| `BILLING_ENABLED=true` | and then all of §5.8 becomes live |
| `EPAY_PID`, `EPAY_KEY` | else order creation returns HTTP 503 |
| `EPAY_NOTIFY_URL` without `/api/` | §7.4 — the single most common payment failure |
| nginx `/epay/notify` rewrite | `frontend/nginx.conf:9-15` |
| A CJK font installed | §2.2 — otherwise every subtitle is tofu |
| `MODEL_IMAGE` / `MODEL_VIDEO` as catalogue ids | §11.1 |
| uvicorn `--workers 1` | §1.2 |

### 9.3 Maintenance scripts

| Script | Purpose |
|--------|---------|
| `deploy/scripts/migrate_media_to_oss.py` | bulk-move existing local media to OSS |
| `deploy/scripts/upload_oss_image_styles.py` | upload style-preview assets |
| `deploy/scripts/upload_oss_web.py` | upload the built front-end |
| `deploy/scripts/up-infra.ps1` / `.sh` | bring up the middleware compose |

`deploy/scripts/deploy_kepu*.py` is deliberately gitignored
(`.gitignore:39-41`) and absent. `deploy/README.md:5` is emphatic: **do not**
replace a site deployment by uploading SPA `dist` to OSS. The public repo does not
contain the live release runbook — it is kept on the maintainer's machine
(`docs/STANDARDS.md:171-172`).

### 9.4 nginx

`frontend/nginx.conf` and `deploy/nginx.local.conf` serve the built front-end,
proxy `/api`, and rewrite `/epay/notify` →
`/api/billing/epay/notify` (`frontend/nginx.conf:9-15`,
`deploy/nginx.local.conf:33-39`).

---

## 10. Troubleshooting

### 10.1 Tasks stuck

| Symptom | Check | Likely cause |
|---------|-------|-------------|
| Tasks stuck in `pending` forever | `SELECT status, next_action_at, count(*) FROM task_runs GROUP BY 1, 2;` | `next_action_at IS NULL` means deferred — a sequential-batch predecessor never completed. Check `batch_key` (`service.py:531-668`) |
| Everything stuck, no new tasks start | `/api/health` → `task_runtime` | Scheduler loop dead or the tick is blocked. A blocking call inside a handler stalls the whole loop (§4.5). Watchdog restarts the loop within ~5 s but the same handler will block it again |
| One task stuck in `running` | `SELECT status, updated_at, lease_until FROM task_runs WHERE id = ?;` | If `updated_at` is older than 30 s **and** the process is alive, `_job_alive` is suppressing recovery (`scheduler.py:275`) — a genuinely long job. If the process was restarted, orphan recovery re-queues it within 30 s |
| Task re-runs from the beginning repeatedly | `SELECT count(*) FROM task_events WHERE task_run_id = ? AND event_type = 'task.recovered';` | Recovery loop. Usually a handler that never commits, so `updated_at` never advances |
| Task in `awaiting_poll` for hours | `SELECT started_at, provider_task_id, current_step_status FROM task_runs WHERE id = ?;` | **Expected for `fragment_video`** — there is no wall-clock timeout (§4.7). The 900 s bound applies only to api/studio ephemeral tasks |
| Task in `awaiting_poll`, `current_step_status = 'finalizing'` | Age of `finalizing_until` | A crash during download. `service.py:398-430` resets claims with more than 12 min left; the `BaseException` release at `jobs.py:1521-1548` is the fast path |
| `poll_timeout` errors | `ARK_VIDEO_POLL_TIMEOUT` | Only for api/studio ephemeral tasks. `poller.py:260-276` |
| Tasks never start after a DB migration | Check `main.py:100` `_apply_schema_patches()` output | `create_all` cannot add columns to existing tables; additive DDL must be hand-written |
| Scheduler logs `task scheduler tick timed out` | — | Tick exceeded `max(20, task_runtime_tick_stale_sec - 10)` = 50 s (`scheduler.py:127-131`). Harmless if transient; a sign of a slow query if frequent |

### 10.2 Billing problems

| Symptom | Check | Likely cause |
|---------|-------|-------------|
| User's balance frozen, never released | `SELECT billing_status, status, finished_at FROM task_runs WHERE requested_by = ? AND billing_status = 'frozen';` | Settle crashed. The reconciler repairs rows older than 120 s (`settlement.py:361-391`, `settlement.py:356`). If rows persist beyond that, the reconciler itself is failing — read its `logger.exception` |
| Charged more than expected | `SELECT billing_basis, charge_fen FROM usage_events WHERE task_run_id = ?;` then the admin usage view (`api/admin/usage.py:32-50`) | If `billing_basis = 'estimate'`, the upstream returned no cost fields and we guessed. Check the `BILLING_EST_*` and `BILLING_*_PER_M` values (§5.3) |
| Charged on a cancelled task | `SELECT kind, delta, note FROM wallet_ledger WHERE ref_type = 'task_run' AND ref_id = ?;` | **Probably correct.** The finalizing window suppresses cancellation while usage is being written (§5.7). Look for `note = 'settle_overage'` |
| Wallet does not match the ledger | `SELECT SUM(delta) FROM wallet_ledger WHERE user_id = ?;` vs `users.balance_fen` | They must be equal. If not, something wrote the balance outside `_ledger` (`settlement.py:39-60`) |
| Everything is free | `BILLING_ENABLED` | Default is `false` (`config.py:108`) |
| `ValueError: 当前任务类型尚未接入任务平台` | `handlers.py:263-288` | `(domain, task_type)` is not registered. See §4.8 |
| Users blocked with "insufficient balance" | `users.balance_fen` and pending commitments | `ensure_balance_for_task` (`settlement.py:125-131`). With `BILLING_ENABLED=true` and no signup grant, new users start at zero and cannot create anything |
| Admin balance edits vanished after restart | — | `SECRET_KEY` changed, so the encrypted values no longer decrypt (`model_settings.py:82-84`) |

### 10.3 Media and OSS

| Symptom | Check | Likely cause |
|---------|-------|-------------|
| Subtitles render as tofu boxes | `fc-list :lang=zh` on the host | No CJK font. Install per §2.2 and **re-compose**; existing films are not fixed retroactively |
| FFmpeg fails with a font error | `backend/app/services/ffmpeg_compose.py:1111` | Neither `FRAMECUT_FONT` nor a discoverable CJK font |
| Media 404s after a domain change | `is_local_static_url` host allowlist (`storage.py:174-177`) | Old hosts no longer match. **Note the typo at `storage.py:176`**: `kepu.printtfilm.com` |
| OSS upload silently not happening | `SELECT … FROM usage_events` no; check logs for `OSS enqueue failed` | Falls back to synchronous upload, then to a local URL with only an `ERROR` log (`storage.py:285-287`) |
| `RuntimeError` on startup with OSS enabled | `oss.py:26-28` | `OSS_BUCKET`, `OSS_ACCESS_KEY_ID`, or `OSS_ACCESS_KEY_SECRET` incomplete |
| Keystone intermediate uploads missing from OSS | `skip_oss_intermediates` (`storage.py:190-197`) | By design. Only `final.mp4` is uploaded (`storage.py:26`) |
| Download truncated / partial files | `storage.py:120-123` | Byte count differs from `Content-Length`; the `.part` file is removed and the error raised |
| `RedisUnavailableError` on password reset | `REDIS_URL` | No in-memory fallback (`password_reset.py:67-69`) |

### 10.4 Redis and Postgres

| Symptom | Check | Likely cause |
|---------|-------|-------------|
| Progress bar stuck in the browser | Redis reachable? | Falls back to in-process queues (`progress.py:15-16`). **Broken across multiple uvicorn workers** — see §8.3 |
| `RuntimeError` at import of `app.database` | `DATABASE_URL` | Must start with `postgresql` (`database.py:19-25, 39`) |
| Postgres connection refused | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod ps` | Container not up, or the host port is 5432 not 15432 |
| compose refuses to start the infra file | — | `POSTGRES_PASSWORD` unset; compose's `:?` form (`deploy/docker-compose.yml:16`) |
| `Connection pool` exhaustion | `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | Defaults 5 + 5 (`config.py:27-28`). Note these are read at import (`database.py:12, 44`), so admin changes need a restart |
| `pool_recycle` / `pool_timeout` floors | — | Minimum 60 s and 5 s respectively (`database.py:28-36`) |
| Table or column missing after a deploy | `main.py:100` | No Alembic. Additive DDL must be hand-written into `_apply_schema_patches()` |

### 10.5 Model and generation

| Symptom | Check | Likely cause |
|---------|-------|-------------|
| "Model not found" for every request | `/api/health` → `models`; admin → routing | The channel's API key failed to decrypt or is empty. `_build_route` returns `None` (`logical_model_router.py:206-207`) and the failure surfaces as model-not-found, not bad-key |
| 404 on a model id | Model id vs `PRESET_MODELS` (`media_model_presets.py:11-87`) | See §11.1 |
| `ark_mock: true` in health | `ARK_MOCK` (`config.py:83`) | Expected in mock mode; unset for real generation |
| 401 / quota exceeded | Upstream provider console | Key disabled or out of credit |
| Text generation raises `LlmUnavailableError` | `llm_client.py:25-32` | `openai_api_key` empty. Remember the overlay is authoritative (§3.1) |
| Seedance duration out of range | `media_model_presets.py:231-291` | Per-model whitelists. `MiniMax-H3` is 4–15 s at 720p only |
| Seedance audio missing | `KEPU_SEEDANCE_NATIVE_AUDIO` (`config.py:79`, default true), `KEPU_SEEDANCE_SFX_AUDIO` (`:81`) | Both default on; `pipeline.py:180-198` is the consumer |
| Dubbing falls back to edge-tts | `VOLC_TTS_*` (`config.py:51-60`) | Unset. Note these are a **different** key from `ARK_API_KEY` (`CLAUDE.md:67`) |
| Upstream catalogue pull returns TokenFree regardless of channel | `upstream_model_catalog.py:143-152` | Any `ark` / `kie` / `volces.com` / `kie.ai` base URL is forced to TokenFree |
| Admin model checkboxes do not persist | `model_settings.py:721` | By design — the channel `models` list is forced to `all_preset_channel_models()` |

---

## 11. Known traps

### 11.1 The default model ids in `config.py` are not catalogue ids

`config.py:40` defaults `MODEL_IMAGE = "doubao-seedream-5-0-260128"` and
`config.py:43` defaults `MODEL_VIDEO = "doubao-seedance-2-5-260628"`. These are
Volcengine ARK endpoint ids, not TokenFree catalogue ids.

- Video survives by accident: `canonicalize_channel_model_id`
  (`tokenfree_pricing.py:348-363`) matches the substring `seedance`, which
  `doubao-seedance-…` contains.
- **Image does not survive.** `canonicalize_channel_model_id` has no Seedream
  branch, and `_TOKENFREE_IMAGE_IDS` (`model_settings.py:222-229`) matches only
  `seedream-5.0` / `seedream-5` / `5.0` and `seedream-4.5` / `seedream-4` / `4.5`.
  `doubao-seedream-5-0-260128` matches nothing.

A fresh env-only bootstrap therefore creates a logical model literally named
`doubao-seedream-5-0-260128`, which 404s on TokenFree.

`deploy/.env.docker.example:28-29` already uses the correct ids
(`seedream-5-0-pro`, `seedance-2-5`). Anyone bootstrapping from
`backend/.env.example`, or relying on the `config.py` defaults, hits this.

### 11.2 `lease_token` and `lease_until` do not protect a running task

`lease_until` is set to `now + 10 min` at claim time (`scheduler.py:205`) and
nulled the instant the task reaches `running` (`executor.py:76`). A crashed process
leaves a `running` row with no lease at all — recovery falls back to the
`updated_at < now - 30s` arm (`scheduler.py:256-271`). And `lease_token` is written
but never read back anywhere.

**Practical rule: treat `updated_at` as the heartbeat, not the lease.**

### 11.3 A task in `awaiting_poll` frees its slot

§4.9. Consequence: with `TASK_RUNTIME_MAX_CONCURRENCY=4`, four tasks waiting on
slow video renders leave the scheduler free to start four *more*. Video concurrency
is bounded only by `DRAMA_USER_VIDEO_JOB_LIMIT` (12), and the ephemeral poller is
**serial** (`poller.py:234-237`), so 12 waiting api/studio videos are polled one at
a time regardless of `TASK_POLL_MAX_CONCURRENCY`.

### 11.4 `get_settings()` failures are silent

`config.py:200-201` swallows any exception while reading the DB overlay. A corrupt
`app_settings.config_json` degrades to plain env values with no log line. If admin
settings "do not save", check the row first.

### 11.5 Database settings need a restart

`database.py:12` snapshots settings at import and `database.py:44` builds the engine
once. `DATABASE_URL`, `DB_POOL_SIZE`, and `DB_MAX_OVERFLOW` are not overlay-aware.
Editing them in the admin UI appears to succeed and does nothing.

### 11.6 Billing can push a balance negative

`settle_task` computes `extra = max(0, charged - frozen)` and writes a negative
`settle` ledger row with no balance check (`settlement.py:303-322`). Combined with
§5.7 — a cancel inside the finalizing window does not refund — a user can end a
task holding a negative balance. That is a deliberate design choice, but any code
that assumes `balance_fen >= 0` will be wrong.

### 11.7 `awaiting_review` is dead surface

Declared in `service.py:27` and `settlement.py:26`, read in
`drama/generation.py:735, 759`, never written. Do not build queries or dashboards
on it.

### 11.8 `TaskStep.attempt_count` is never written

Declared at `models_tasks.py:88`. Fragment-video attempt tracking lives in
`frag.params["generation_attempts"]` (`jobs.py:1091, 1117`). A dashboard reading
`task_steps.attempt_count` shows zeros forever.

### 11.9 Overage logs are the only signal

Nothing raises when a task costs more than estimated — `settlement.py:307-313`
emits a `logger.warning` and charges it. There is no threshold, no alert, and no
metric. To detect systematic under-estimation, query:

```sql
SELECT task_run_id, billing_estimate_fen, billing_charged_fen,
       billing_charged_fen::numeric / NULLIF(billing_estimate_fen, 0) AS ratio
FROM task_runs
WHERE billing_status = 'settled' AND billing_estimate_fen > 0
ORDER BY ratio DESC
LIMIT 50;
```

### 11.10 `TASK_*` knobs are invisible in the example env

Roughly 50 settings fields — including every concurrency control — appear nowhere
in `backend/.env.example` (§3.4). `deploy/README.md:87` mentions two of them in
prose. Copy this table from §4.5 instead of hunting.
