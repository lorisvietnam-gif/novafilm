# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

Read [`docs/STANDARDS.md`](docs/STANDARDS.md) §9 before opening a pull request, and
[`docs/OPERATIONS.md`](docs/OPERATIONS.md) before touching billing, routing, the task
platform, or deployment.

---

## Project overview

**Novafilm** is a template-driven AI short-video (explainer) and AI episodic-drama
creation platform. Two product lines share one set of AI capabilities:

- **Explainer short video** — topic / narration → template shot breakdown → shot
  images → (optional) video → narration → FFmpeg compose. State machine
  `SCRIPTING → IMAGING → VIDEOING/AUDIOING → COMPOSING → DONE`
- **Drama** — project → story summary / episodes → asset library (characters,
  scenes, props, voices) → episode storyboard → React Flow canvas
- **Tool centre** (t2i / i2p / t2v and friends), **open API** (`/api/v1`), **admin
  console**, and **optional wallet billing** (epay)

Three processes plus two containerised middleware: FastAPI (`:8000`), user Vite
(`:5173`), admin Vite (`:5174`), PostgreSQL (`:15432`), Redis (`:16379`). Python
3.12 / FastAPI / SQLAlchemy (asyncpg) / React 19 / TypeScript 6 / Vite 8. FFmpeg
must be on `PATH`.

### Naming: `ai_movie`, `printfilm`, `PRINTFILM`

Internal identifiers, file names, the compose project name, the PostgreSQL role, and
many user-facing strings still say `printfilm` / `ai_movie` / `PRINTFILM`. This repo
is `novafilm` (remote `github.com/lorisvietnam-gif/novafilm`), forked from
`github.com/yi1108/printfilm`.

**Do not rename these opportunistically.** Most are infrastructure, and renaming them
churns volumes and infrastructure for no legal benefit. The product-facing renames
that *are* wanted are itemised in
[`docs/OPEN_SOURCE_CHECKLIST.md`](docs/OPEN_SOURCE_CHECKLIST.md) §2 — work that list,
do not improvise. `docs/OPEN_SOURCE_CHECKLIST.md` §2.1 and §2.2 touch
`frontend/src/i18n/locales/**` and `frontend/src/lib/{legalContent,methodLanding}.ts`,
which belong to another lane.

---

## Common commands

```bash
# Middleware only (copy deploy/.env.prod.example -> deploy/.env.prod, change the password)
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d

# Backend (from backend/; copy .env.example -> .env first)
uvicorn app.main:app --reload --port 8000

# User app / admin console (each in its own directory)
npm install && npm run dev      # 5173 / 5174
npm run lint                    # oxlint
npm run build                   # tsc -b && vite build
```

Tests (from `backend/`, needs `pip install -r requirements-dev.txt`; `pytest.ini` sets
`asyncio_mode=auto` and `pythonpath=.`):

```bash
pytest                                  # full suite
pytest tests/test_kepu_continuity.py    # one file
pytest tests/test_x.py::test_name       # one test
```

Tests using the `db_session` fixture are integration tests and **need PostgreSQL
running** (per-test rollback, nothing persisted). The rest are pure unit tests.
`conftest.py` stubs upstream price-list network calls automatically.

Health: `/api/health` (includes `task_runtime`, `db_pool`, `models`). OpenAPI: `/docs`.

**There is no CI pipeline.** Everything above runs locally only.

---

## Architecture notes

These are the things you cannot get from a single file.

### The unified task platform — read before you touch anything async

There is **no separate worker process**. Celery is a vestigial dependency:
`celery==5.5.1` is still pinned at `backend/requirements.txt:12` but nothing imports
it, `USE_CELERY` is read by no code, and `workers/` does not exist. The real runtime
is three asyncio loops started by the FastAPI lifespan
(`app/services/tasks/`, started at `app/main.py:114`):

- `scheduler.py` — 1 s tick loop; leases tasks (`pending → leased`) under a global
  slot cap `TASK_RUNTIME_MAX_CONCURRENCY` and a per-user cap
  `TASK_USER_MAX_CONCURRENCY`; recovers orphans
- `executor.py` — runs one task: freeze → handler → converge to a terminal status
- `poller.py` — non-blocking selector over `awaiting_poll` upstream jobs, bounded by
  `TASK_POLL_MAX_CONCURRENCY`; settles billing on completion
- `runtime.py` — start/stop façade plus the watchdog, which soft-restarts a dead or
  stale scheduler/poller loop every `TASK_RUNTIME_WATCHDOG_INTERVAL_SEC`

`TaskRun` statuses, steps, events and targets are in `models_tasks.py`. **A new task
type must be registered in the `HANDLERS` table in `tasks/handlers.py` for
`(domain, task_type)`** — otherwise `create_task` raises outright. Some types are
registered as `_noop_ephemeral`: those execute inline inside the request and the
`TaskRun` row exists only for billing and audit. The admin task centre at `/queues`
reads these tables directly.

**Run uvicorn with `--workers 1`.** Two workers means two schedulers, two pollers and
two watchdogs over the same rows, and progress SSE silently degrades to a
per-process queue (`services/progress.py:15-16`).

Full walkthrough: `docs/OPERATIONS.md` §4, including the trap that
`lease_until` is nulled the moment a task starts `running` (§11.2) and that
`awaiting_poll` tasks hold no concurrency slot (§11.3).

### The kepu pipeline and staged billing share one readiness definition

`services/pipeline.py` (~1,850 lines, a historical large file — put new logic in a
new file) is the explainer orchestrator. `pipeline_mode` is `full` (image + video +
compose) or `image_text` (stills + narration). The key convention:
**`services/kepu_stages.py` → `resolve_kepu_billing_phase()` (`script` | `assets` |
`videos` | `compose`) is the single source of truth for "next stage", shared by both
billing pre-hold and pipeline resumption.** Change a readiness rule and both sides
must agree semantically. Continuity (first/last frame, reference images) lives in
`kepu_continuity.py`; FFmpeg assembly in `ffmpeg_compose.py` (SIGTERM interruption
retries automatically).

### The drama module is an independent package

`api/drama/` + `services/drama/` (30+ small files, split by
jobs/fragment/voice/asset) + `models_drama.py`
(projects → scripts → episodes → fragments → asset_refs). A fragment video is one
`TaskRun` per shot (`fragment_video`) with a budget, a max-attempt count, and a
queueing limit (`DRAMA_*` config). Product rules: `docs/EPISODE_RULES.md`,
`docs/SHOT_SPLITTING.md`.

### Model routing is locked to a single upstream

The open-source build allows **only** the TokenFree New API (OpenAI-compatible
`https://www.tokenfree.com/v1`, shared by text and image/video), enforced by
`services/tokenfree_gateway.py` (channel base URL and protocol are not editable) and
by `model_settings.py` (`_ensure_tokenfree_channel` disables every other channel row;
`patch_admin_routing_settings` overwrites the admin's model selection). Keys and
models are configured in **admin → System settings → Models**, stored in
`system_model_channels` / `app_settings`. At startup and after every save,
`model_settings.py` builds the overlay and `config.get_settings()` (`lru_cache`)
applies it over env with `model_copy(update=overlay)` — so **the DB overlay wins at
runtime and `.env` is only the first-import seed**. Logical-model → channel binding
(priority / weight / failover) resolves in `logical_model_router.py`. No key yet? Set
`ARK_MOCK=true` for local mock assets.

Text goes through `llm_client.py`; image/video through `ark.py` plus
`tokenfree_image.py` / `tokenfree_video.py`; dubbing uses Doubao openspeech
(`VOLC_TTS_*` — a *different* key from `ARK_API_KEY`) and falls back to edge-tts when
unconfigured.

**The `config.py` default `MODEL_IMAGE=doubao-seedream-5-0-260128` is not a catalogue
id and 404s.** Use `seedream-5-0-pro` / `seedance-2-5`. See
`docs/OPERATIONS.md` §11.1.

Making the provider pluggable is a scoped 2–3 week project analysed in
`docs/OPEN_SOURCE_CHECKLIST.md` §5 — not a small refactor.

### Billing: every TaskRun runs pre-hold → usage rows → settlement

The wallet unit is the **fen** (`users.balance_fen` / `frozen_fen`).
`services/billing/`: on task creation `ensure_balance_for_task` checks the balance
without mutating, then `freeze_for_task` holds the estimate, execution writes
`usage_events` through the single entry point `record_line`, and the poller or
executor calls `settle_task` to charge the real amount and release the remainder.
Real upstream cost is preferred; local conservative estimates are the fallback, with
official pricing fetched and cached by `tokenfree_pricing.py`. `BILLING_ENABLED`
defaults to `false`.

There is **no function called `pre_hold`** — the pre-hold is `freeze_for_task`.
Settlement is idempotent through three guards and a 120 s background reconciler, and
it deliberately does **not** refund a cancel that lands while usage is still being
written. Read `docs/OPERATIONS.md` §5.7 before touching it.

The production epay callback URL **must not contain `/api/`** (the gateway's WAF
blocks it) — use `/epay/notify` plus an nginx rewrite
(`frontend/nginx.conf:9-15`).

### Data layer and how "migrations" work

- Async engine asyncpg (`AsyncSessionLocal`, everything async); the psycopg2 sync
  engine is used in a few places only
- ORM split by domain: `models.py` (users/projects/shots/templates/billing/orders/
  tool_runs), `models_drama.py`, `models_tasks.py`, `models_api.py` (API keys),
  `models_agent.py` (director Skills), `models_settings.py`. 27 tables in total
- **No Alembic-style migration tool.** Startup runs `init_db()` → `create_all`, and
  **a new column must be hand-written into `_apply_schema_patches()` in `main.py`**
  (additive PostgreSQL DDL only). The test schema in `conftest.py` must be kept in
  sync by hand. Run a single uvicorn worker in production to avoid a `create_all` race
- Startup also runs: template seed (inserts missing only, never overwrites admin
  edits), built-in Skill seed, and `ADMIN_BOOTSTRAP_EMAILS` privilege grant
  (promotes registered users only, never creates them, **requires a restart**)

### Media and object storage

All film and shot media is written to `backend/static/generated/p{id}/` first —
FFmpeg only reads local files. With OSS enabled, uploads are queued asynchronously
via `oss_queue.py` and the database URLs are backfilled (`storage.py`, `oss.py`).
Deleting a project must cascade to its media and dependent `works` rows.

`is_local_static_url()` (`storage.py:159-187`) decides whether a URL points at local
disk, and its host allowlist is a rebranding item with a historical typo at
`storage.py:176`. No media URLs are signed or expiring.

### The two front-ends differ in ways that matter

- `frontend/` — **no Vite proxy**. API base: `VITE_API_BASE` unset → `current-host:8000`
  (dev); set to the **empty string** → same origin, nginx proxies `/api` (prod), see
  `frontend/.env.production`. Requests go through `src/api.ts` and `src/api/*`. The
  style system is `styles/printfilm.css` plus `pf-*` semantic classes, with core
  tokens in `src/index.css:2-6` (`--pf-lime: #b6ff00`, `--pf-ink: #111318`,
  `--pf-bg: #f7f8fa`). **Do not introduce Tailwind here**
- `admin/` — Tailwind v4 + Radix/shadcn-style components, `@` → `src`, Vite proxies
  `/api` and `/static` to `:8000`, use `cn()`, and lists must be server-paginated
  (`page` / `page_size` / `meta.total`, reuse `PaginationBar`)

Shared pure helpers go in `lib/` — the user app already has many `drama*` helpers, so
search before writing.

### i18n: `vi` / `en` / `zh`

- **`vi` is the default locale; `en` is the secondary locale; `zh` is retained** for
  environments that still need Chinese. The `Messages` type is derived from the `zh`
  tree, so **every locale must carry every `zh` key with the same shape** — a missing
  key is a `tsc` error and must not be worked around with `as any`
- Structure: `frontend/src/i18n/{detect.ts, messages.ts, context.tsx, lookup.ts,
  locales/<loc>/{shell,pages}.ts}`. Adding a locale means touching `detect.ts`
  (`Locale`, `LOCALES`, `LOCALE_HTML`, `LOCALE_DATE`, `isLocale`, the
  `localeFromBrowser` fallback) **and** `components/layout/LanguageSwitch.tsx`
- **API enum values are never translated.** Statuses, pipeline modes, ledger kinds,
  model ids, task types stay exactly as the server sends them; user-facing text exists
  only in display-mapping tables. See `docs/STANDARDS.md` §4.1
- **Fonts per locale**: `frontend/index.html:12` loads Space Grotesk (brand
  English), **Noto Sans (Vietnamese — the default locale, needs Latin Extended
  diacritics, must be a separate subset from Noto Sans SC)**, and Noto Sans SC /
  Noto Serif SC (Chinese only). `frontend/index.html` belongs to the font-subset work
  stream; do not edit it as a side effect of an unrelated change
- `admin/` has **no i18n layer at all** and renders in Chinese only, with
  `Anybody` + `Figtree` (Latin-only fonts, no CJK subset). Do not start translating
  it piecemeal — that produces a half-Chinese, half-Vietnamese console, which is worse
  than the current state. Plan: `docs/ADMIN_I18N_PLAN.md`

---

## Repository conventions (summary of docs/STANDARDS.md)

- **Comments and docstrings** in `vi` or `en`; do not add new Chinese comments.
  Translate only comments and docstrings — never a runtime string literal
- Every function / component / hook gets a top-of-body comment (parameters and return
  value when non-trivial); grouped state gets a block comment
- Files under ~500 lines where practical; `api/` does auth/validation/service calls
  only, business logic lives in `services/`, front-end pages never assemble request
  details by hand
- Server-side pagination and filtering everywhere; loading / empty / error states all
  present; destructive actions require confirmation
- Never commit: `.env` (only `*.example`; `frontend/.env.production` is the one
  deliberate exception and must hold non-sensitive build flags only),
  `deploy/scripts/deploy_kepu*.py`, `.tmp/`, generated media, `dist/`
- **Never modify `LICENSE`.** Add derivative-work notes to `NOTICE`
- Conventional Commits, English message
- If you change billing, routing, the task platform, or deployment, update
  `docs/OPERATIONS.md` in the same commit. If you change branding, asset provenance,
  or dependency licensing, update `docs/OPEN_SOURCE_CHECKLIST.md`. If you retire an
  item of Vietnamese-conversion debt, update `docs/VI_BACKLOG.md`

Specialised docs: `docs/OPERATIONS.md`, `docs/OPEN_SOURCE_CHECKLIST.md`,
`docs/VI_BACKLOG.md`, `docs/ADMIN_I18N_PLAN.md`, `docs/BILLING.md`,
`docs/SEEDANCE_2_5.md`. The live production release runbook (`docs/DEPLOY.md`,
`docs/releases/`) is intentionally kept off this repository.
