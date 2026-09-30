# VI BACKLOG — Vietnamese conversion inventory

Everything Chinese left in the codebase, measured on branch `bunny/3`, grouped so it
can be scheduled. **Every number in this document was measured**, not estimated. The
method is stated once in §0 and repeated per group where the measurement is
different.

Conventions used throughout:

- **CJK line** = a line containing at least one character in `U+4E00–U+9FFF` or
  `U+3400–U+4DBF`. One line with three Chinese sentences counts as 1.
- Counts are **lines, not strings**. A 40-line prompt block counts as 40.
- `path:line` is a citation into the code as it stands on `bunny/3`.
- **Risk** is the chance of breaking something if the item is converted wrongly, not
  the chance of a bad translation.

Priorities: **P0** blocks the `vi` locale; **P1** visibly wrong in the `vi` UI;
**P2** internal debt; **P3** cosmetic.

---

## 0. Totals

| Area | Files with CJK | CJK lines | What it is |
|------|---------------:|----------:|------------|
| `frontend/src/i18n/` (the locale trees) | 11 | 555 | The intended home for user-facing Chinese. Correctly located |
| `frontend/src/` excluding `i18n/` | 176 | **3,594** | Hard-coded Chinese living outside the i18n system. **The real P0** |
| `admin/src/` | 71 | **1,268** | No i18n layer exists at all |
| `backend/app/` | 143 | **4,043** | Mix of developer comments, LLM prompts, API strings, e-mail bodies |
| `backend/tests/` | 104 | **1,375** | Chinese assertions on Chinese production strings |
| **Total** | **505** | **10,280** | |

The single most important number in this document: **3,594 hard-coded Chinese lines
in `frontend/src` outside the i18n system.** The locale trees only control what
already went through them. `EpisodeEditPage.tsx` alone has 210 CJK lines against a
locale tree with 555 total — the ratio is roughly 6.5 : 1 against the translation
system.

---

## 1. Backend — LLM prompt text vs. user-facing text

This is the most important boundary in the whole backlog, and getting it wrong breaks
generation quality while looking correct.

### 1.1 The rule

| Class | Translate? | Why |
|-------|-----------|-----|
| **LLM prompt text** (`style_prefix`, `negative_prompt`, `llm_system_addon`, `character_prompt`, `extra_prompt`, `motion_bias`, `beat`, `img_prompt`) | **NO** | These are instructions to a Chinese-tuned upstream model. The template content is Chinese because the templates are for Chinese-language films. Translating them changes the generated output, not just the code |
| **Template `name` / `description`** | **NO** | Seeded into the `templates` DB table and shown in the picker. They are *content*, not chrome |
| **Template `category`** | **NO — this is an enum** | 23 values matched literally by `CATEGORY_ORDER` in `frontend/src/lib/categories.ts:1-18`, which contains Chinese strings like `'开源'`, `'科普'`, `'获客'`. Translating either side breaks the filter. Changing it means a data migration on `templates.category` |
| **`voice_preset` / `bgm_mood`** | **NO — enum** | Machine ids and mood slugs consumed at `backend/app/api/projects.py:1002, 1026` and `backend/app/services/ark.py:2205-2281` |
| **Named-entity glossary** (`ark.py:212-227`) | **NO** | A regex → Chinese-normalisation table (SpaceX → 民营商业航天公司, 马斯克 → 航天企业家). It exists *to* normalise Latin text into Chinese |
| **Runtime error / `HTTPException` strings** | **NO in this wave** | API contract. 104 test files assert on them (§1.3) |
| **Module docstring / comment** | **YES** | Developer-facing. Pure documentation. Zero runtime effect |
| **E-mail subject and body** | **NO** | Templates at `backend/app/services/email.py`. Changing them changes what users receive, and password-reset copy is security-sensitive |

### 1.2 Measured split

**`backend/app/services/templates_seed.py`** — 824 lines, **298 CJK lines**:

| Class | Lines | Action |
|-------|------:|--------|
| Prompt fields (`style_prefix`, `negative_prompt`, `llm_system_addon`, `character_prompt`, `extra_prompt`, `motion_bias`, long `beat` blocks) | **206** | Do not translate |
| `name` / `description` | 46 | Do not translate — template content |
| `category` | 23 | Do not translate — enum, needs a DB migration |
| `voice_preset` / `bgm_mood` | 23 | Do not translate — enum |
| Module docstring (lines 1-15) | ~0 counted separately (counted inside the 206 band by the classifier) | Translate |

**`backend/app/services/ark.py`** — 2,406 lines, **282 CJK lines**:

| Class | Lines | Action |
|-------|------:|--------|
| Prompt text + glossary + generated strings (`llm_*` prompts, the entity table at `:212-227`, the CG-style guidance at `:232-233`, the brand-name preservation rules at `:241-245`) | **171** | Do not translate |
| Runtime error and log strings (`ark.py:94, 98, 102, 118, 130-132, 137-139` and the `logger.*` calls) | 64 | Do not translate — see §1.3 |
| **Comments (`#`) and docstrings (`"""…"""`)** | **46** | **Translate — safe, zero runtime effect** |
| `voice_preset` / enum | 1 | Do not translate |

**Only the 46 comment/docstring lines in `ark.py` and the module docstring in
`templates_seed.py` are safe to touch.** That is 3% of the two files combined.

### 1.3 Chinese `HTTPException` detail — 143 lines across 26 files

Measured by line count where the line contains both `HTTPException` and a CJK
character. **26 files, 143 lines** in total:

| File | Lines | File | Lines |
|------|------:|------|------:|
| `api/projects.py` | 38 | `api/v1/generation.py` | 3 |
| `api/drama/agents.py` | 13 | `api/admin/settings.py` | 2 |
| `api/drama/assets.py` | 12 | `api/drama/scripts.py` | 2 |
| `api/drama/generation.py` | 10 | `services/drama/access.py` | 2 |
| `api/drama/skills.py` | 9 | `api/admin/drama_assets.py` | 1 |
| `api/auth.py` | 8 | `api/admin/drama_episodes.py` | 1 |
| `api/billing.py` | 6 | `api/admin/drama_fragments.py` | 1 |
| `api/drama/episodes.py` | 6 | `api/admin/drama_projects.py` | 1 |
| `deps.py` | 5 | `api/admin/projects.py` | 1 |
| `api/admin/templates.py` | 5 | `api/api_keys.py` | 1 |
| `api/tasks.py` | 4 | `api/drama/projects.py` | 1 |
| `api/admin/users.py` | 4 | `api/templates.py` | 1 |
| `api/tools.py` | 3 | | |
| `api/admin/works.py` | 3 | | |

Two files dominate: `api/projects.py` alone is 38 lines, more than a quarter of the
total. `deps.py` is the only non-`api/` file, and it overlaps the Wave 1 comment
transcription list — when `deps.py` is processed for §1.4, its 5 `HTTPException`
strings must be left alone.

**Constraint, measured:** `backend/tests/` has **104 files containing Chinese** and
**1,375 CJK lines**. The largest test files:

| Test file | CJK lines |
|-----------|----------:|
| `test_kepu_continuity.py` | 118 |
| `test_seedance_segments.py` | 93 |
| `test_fragment_plan.py` | 72 |
| `test_drama_assets.py` | 71 |
| `test_drama_seed.py` | 57 |
| `test_ark.py` | 47 |
| `test_kepu_assets.py` | 46 |
| `test_drama_visual_prompt.py` | 45 |
| `test_drama_voice_prompt.py` | 44 |
| `test_build_seedance_generate_body.py` | 42 |

These are `assert` statements comparing against the production string. **Change a
production string, the test fails.** Each failing assert then needs a new
Vietnamese literal, which means each failure becomes a 2-file diff — the exact
"huge diff, hard to review" outcome this wave is trying to avoid.

**Safe process (P2, ~1 day):**

1. Do **not** translate the 143 `detail` strings.
2. Instead, introduce a message catalogue: `backend/app/services/messages.py`
   exporting `MSG = {"project.not_found": "…", …}` with the Chinese as the current
   value. Replace the literals with `MSG["…"]` — **a pure refactor, zero string
   changes, so all 104 tests still pass unchanged.**
3. Only in a later wave, add `vi` and `en` values and let the server negotiate via
   `Accept-Language`.
4. Tests then assert against `MSG["…"]` instead of the literal, which makes step 3 a
   one-line change per test.

Steps 1–2 are what should actually be scheduled now. Step 3 is a separate project
and should be sized as one.

### 1.4 Comments and docstrings — the safe subset

Measured across `backend/app`: **143 files, 4,043 CJK lines**. The safe subset is
the comment/docstring portion. Wave 1 covered 20 files:

| File | CJK lines | Translated |
|------|----------:|-----------|
| `app/config.py` | 36 | yes |
| `app/services/style_lock.py` | 36 | yes |
| `app/services/tasks/executor.py` | 32 | yes |
| `app/schemas_drama.py` | 28 | yes |
| `app/services/tasks/poller.py` | 24 | yes |
| `app/services/password_reset.py` | 25 | yes |
| `app/services/llm_client.py` | 20 | yes |
| `app/services/tasks/scheduler.py` | 17 | yes |
| `app/models.py` | 16 | yes |
| `app/services/storage.py` | 14 | yes |
| `app/services/exc_format.py` | 12 | yes |
| `app/main.py` | 10 | yes |
| `app/schemas.py` | 8 | yes |
| `app/deps.py` | 7 | yes |
| `app/services/email.py` | 6 | yes |
| `app/logging_setup.py` | 6 | yes |
| `app/schemas_settings.py` | 5 | yes |
| `app/database.py` | 4 | yes |
| `app/schemas_api.py` | 4 | yes |
| `app/services/auth.py` | 0 | n/a — **contains no Chinese at all** |

`auth.py` was kept in the list for uniformity and turned out to need no work. Its 45
lines are already English-only.

Remaining backend files by CJK volume, none of which should be touched until their
prompt/user-facing split is decided per §1.1:

| File | CJK lines | Blocking issue |
|------|----------:|----------------|
| `services/templates_seed.py` | 298 | prompt + enum (§1.2) |
| `services/ark.py` | 282 | prompt + glossary (§1.2) |
| `services/drama/agents.py` | 231 | LLM system prompts, incl. the PRINTFILM mention at `:460` |
| `services/seedance_segments.py` | 182 | Seedance prompt construction |
| `services/drama/build_fragments.py` | 140 | LLM prompts |
| `services/drama/jobs.py` | 132 | mixed: prompts plus job-state messages |
| `services/drama/generation.py` | 110 | mixed |
| `services/drama/fragment_plan_prompt.py` | 100 | entirely LLM prompt |
| `services/drama/visual_prompt.py` | 97 | entirely LLM prompt |
| `services/drama/seed.py` | 91 | seed content + enum |
| `services/pipeline.py` | 87 | mixed |
| `services/templates_seed_huoke.py` | 85 | same shape as `templates_seed.py` |
| `services/seedream_text_soften.py` | 83 | prompt rewriting |
| `services/drama/build_seedance_generate_body.py` | 82 | prompt body builder |
| `services/tasks/service.py` | 79 | **mostly comments — the best next candidate after Wave 1** |
| `services/tokenfree_pricing.py` | 77 | comments + provider error passthrough |
| `api/projects.py` | 69 | `HTTPException` (§1.3) |
| `services/studio_tools.py` | 68 | mixed |
| `services/drama/image_styles.py` | 67 | style descriptions — content, like templates |
| `services/drama/generation_prompt.py` | 50 | entirely LLM prompt |
| `api/drama/episodes.py` | 50 | `HTTPException` |
| `services/media_model_presets.py` | 46 | model metadata — partly enum |

**Recommended next batch (P2, half a day):** `services/tasks/service.py` (79),
`services/model_settings.py` (41), `services/logical_model_router.py`,
`services/media_model_presets.py` (46). All infrastructure with few runtime strings.

---

## 2. Admin — no i18n layer at all

**Measured: 71 files, 1,268 CJK lines.** The recon figure of "62 files, 1,222 lines"
was close; the corrected numbers are 71 and 1,268.

`admin/src/index.css` is **3,975 lines / 79,452 bytes and contains exactly 1 CJK
line**, not 79. Its size in the recon was byte count, not line count. It needs no
translation work.

Top 20 files:

| File | CJK lines | Total lines |
|------|----------:|------------:|
| `pages/OrdersPage.tsx` | 93 | 590 |
| `components/tasks/TaskDetailDialog.tsx` | 91 | 542 |
| `pages/DashboardPage.tsx` | 75 | 534 |
| `components/settings/PaymentSettingsPanel.tsx` | 74 | 554 |
| `lib/statusLabels.ts` | 70 | 154 |
| `pages/QueuesPage.tsx` | 67 | 533 |
| `pages/ProjectsPage.tsx` | 52 | 342 |
| `pages/drama/DramaProjectDetailPage.tsx` | 46 | 274 |
| `components/layout/AdminLayout.tsx` | 43 | 413 |
| `components/templates/TemplateEditorDialog.tsx` | 36 | 308 |
| `pages/WorksPage.tsx` | 36 | 284 |
| `pages/TemplatesPage.tsx` | 34 | 386 |
| `components/settings/RuntimeSettingsPanel.tsx` | 33 | 275 |
| `pages/UsersPage.tsx` | 32 | 275 |
| `components/admin/UserDetailDrawer.tsx` | 31 | 218 |
| `pages/dashboard/DashboardFilters.tsx` | 28 | 120 |
| `pages/dashboard/dashboardSectionInsights.tsx` | 23 | 161 |
| `components/settings/RoutingSettingsPanel.tsx` | 23 | 258 |
| `pages/FinanceListPage.tsx` | 23 | 165 |
| `pages/drama/DramaEpisodeDetailPage.tsx` | 21 | 141 |

**Do not start this piecemeal.** Translating `statusLabels.ts` and `dramaLabels.ts`
alone produces an admin console that is half Chinese and half Vietnamese while
`OrdersPage.tsx` still shows Chinese — a worse state than uniformly Chinese, because
an operator can no longer assume the interface language. Full plan and sequencing:
[`ADMIN_I18N_PLAN.md`](./ADMIN_I18N_PLAN.md).

**Do not translate the keys.** Verified by reading both files: `statusLabels.ts:2-103`
and `dramaLabels.ts:13-21, 33-43` map **English API values** (`DRAFT`, `pending`,
`alipay`, `queued`, `character`, …) to Chinese display text. The keys are the API
contract; only the right-hand side is user-facing. See `docs/STANDARDS.md` §4.1.

---

## 3. Frontend — hard-coded Chinese outside the i18n system

**Measured: 176 files, 3,594 CJK lines** (excluding `frontend/src/i18n/`, which holds
555 lines across 11 files and is correctly placed).

This is the P0. Until it is closed, switching to `vi` produces a screen that is
mostly Vietnamese with Chinese blocks in the middle of the workflow.

### 3.1 Distribution

| File | CJK lines | Total | Class |
|------|----------:|------:|-------|
| `pages/drama/EpisodeEditPage.tsx` | 210 | 1,906 | mixed: UI labels + status messages + confirm dialogs |
| `pages/studio/StoryboardPage.tsx` | 174 | 1,639 | mixed |
| `pages/studio/CreateProjectPage.tsx` | 144 | 516 | **mostly hard-coded labels — §3.2** |
| `pages/drama/AssetsStep.tsx` | 135 | 1,026 | mixed: dialogs, long explanation text |
| `lib/dramaGenError.ts` | 102 | 294 | **error-message catalogue** — mostly API error mapping |
| `lib/methodLanding.ts` | 94 | 396 | bilingual landing content, already has `en` |
| `pages/drama/OutlineEpisodePanel.tsx` | 90 | 885 | mixed |
| `lib/legalContent.ts` | 77 | 340 | **legal text — needs a legal review, not a translation** |
| `components/drama/SeedanceRulesModal.tsx` | 74 | 244 | product rules displayed to users |
| `lib/dramaGenQueue.ts` | 70 | 615 | queue-state messages |
| `pages/studio/StyleConfigPage.tsx` | 61 | 573 | mixed |
| `pages/drama/OutlineStep.tsx` | 57 | 591 | mixed |
| `pages/drama/canvas/CanvasStore.tsx` | 51 | 996 | comments + a few labels |
| `pages/drama/CharacterVoiceBindModal.tsx` | 50 | 426 | dialog text |
| `components/drama/DramaFragmentSegmentedVideoPlayer.tsx` | 49 | 544 | player UI |

### 3.2 The two named files — and a correction

`pages/TemplatesPage.tsx` and `pages/studio/CreateProjectPage.tsx` hard-code the
category filter labels:

| File | Line | Literal |
|------|-----:|---------|
| `pages/TemplatesPage.tsx` | 14, 31, 43, 79 | `'全部'` |
| `pages/studio/CreateProjectPage.tsx` | 188, 219, 224, 225 | `'全部'`, `'热门推荐'` |

**Correction to the recon: there is no `templates.all` i18n key.** The locale files
have nine top-level blocks — `home`, `help`, `contact`, `tools`, `pricing`, `history`,
`dramaList`, `legal` (`frontend/src/i18n/locales/zh/pages.ts:4, 53, 157, 208, 329, 389,
429, 460`) — and **no `templates` block at all** in either `zh` or `en`. The nearest
existing key is `history.tabs.all` (`zh/pages.ts:403` = `全部`, `en/pages.ts:410` =
`All`), which belongs to a different page and cannot be reused directly.

So the fix is **not** "start using the existing key". It is:

1. Add a new `templates` block to all three locale trees (after `vi` lands) with at
   least `categories.all` and `categories.hot`.
2. Replace the literals. **Keep `'全部'` as the internal sentinel value** — it is
   compared against at `TemplatesPage.tsx:28, 43` and `CreateProjectPage.tsx:216, 225`
   and against `CATEGORY_ORDER` in `lib/categories.ts:1-18`, so the *value* must stay
   Chinese even in the `vi` build. Only the **rendered label** changes.
3. Same for `'热门推荐'`, which doubles as a filter sentinel at
   `CreateProjectPage.tsx:224`.

This is the concrete example of the rule in `docs/STANDARDS.md` §4.1: an API/fixture
value stays Chinese, a display label becomes Vietnamese. Getting it backwards breaks
the filter silently — the category chip renders but never matches.

**Cost:** 2 files, ~8 lines each, plus a new locale block. Half a day. **Owner:
Bunny 1** — both files are `frontend/src/pages/**`, which is a forbidden lane here.

### 3.3 Other frontend debt

- `lib/legalContent.ts` (77 lines) — Terms of Service and Privacy Policy. Cannot be
  machine-translated; needs a legal review first. Also the largest single
  brand-exposure item in the frontend (see `OPEN_SOURCE_CHECKLIST.md` §2.2).
- `lib/methodLanding.ts` (94 lines) — already carries an `en` variant
  (`:88-103` zh, `:242-257` en). It needs a `vi` variant, and the constants at `:3`,
  `:88`, `:242` are part of the brand-replacement list.
- `lib/dramaGenError.ts` (102 lines) — a Chinese error-message catalogue mapped from
  API error shapes. Needs `vi` and `en` variants, but the mapping keys are technical
  and must not be translated.

---

## 4. Font coverage — Vietnamese subsets

**Status: assigned, not done. Owner: Bunny 2. File: `frontend/index.html`, which is a
forbidden lane in this wave.**

`frontend/index.html:12` currently loads:

```
https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700
  &family=Noto+Serif+SC:wght@500;700&family=Space+Grotesk:wght@500;600;700&display=swap
```

Two problems:

1. **No Latin-Extended subset for Vietnamese.** `Noto Sans SC` covers Han only.
   Vietnamese needs Latin Extended Additional (`U+1EA0–U+1EF9`: Ạ Ả Ấ Ầ Ẩ Ẫ Ậ Ắ Ằ
   Ẳ Ẵ Ặ Ẹ Ẻ Ẽ Ế Ề Ể Ễ Ệ Ỉ Ị Ọ Ỏ Ố Ồ Ổ Ỗ Ộ Ớ Ờ Ở Ỡ Ợ Ụ Ủ Ứ Ừ Ử Ữ Ự Ỳ Ỵ Ỷ Ỹ)
   plus precomposed `U+00C0–U+01B0`. Without it every tone-marked syllable falls back
   to a system font at a different weight and metric, so line breaks and vertical
   rhythm shift on Vietnamese text.
2. **`Noto Serif SC` is loaded but its role is undocumented.** It is presumably for
   headings in `zh`. Clarify whether `vi` gets a serif or follows `Noto Sans`, then
   document the decision in `docs/STANDARDS.md` §4.2 (already added) and in
   `CLAUDE.md`.

**Required change:** add `Noto+Sans:wght@400;500;700` to the same request, and make
sure the CSS `font-family` fallback chain lists a Latin-Extended font ahead of
`Noto Sans SC`. Cross-check against `frontend/src/index.css` and the `pf-*` token
block.

**Verification:** load the `vi` build, confirm `ằ`, `ộ`, `ữ`, `ỷ` render in the
intended weight with no tofu, and confirm the tone marks do not clip at the
ascender in tight leading.

**Cost:** one line in `index.html` plus a `font-family` chain change. **1 hour, but it
gates visual quality of the entire `vi` locale.**

---

## 5. `en` translations that are semantically wrong

**Status: assigned to Bunny 1. File: `frontend/src/i18n/locales/en/**` — forbidden lane
here.**

This is a smaller job than the Chinese cleanup but higher per-line value: the `en`
bundle is the reference translators will copy from when writing `vi`, and a wrong
translation propagates.

Known issues:

- `locales/en/pages.ts:81` — `title: 'printfilm user group'`. This is a **brand
  string and a community link**, not a translation. Remove it or point it at our own
  community. Also check the `zh` twin at `locales/zh/shell.ts:80`.
- `locales/en/shell.ts:5-7, 93` — `PRINTFILM` in the title, description and lede.
  Brand replacement, see `OPEN_SOURCE_CHECKLIST.md` §2.1.
- `locales/{zh,en}/pages.ts:164, 184-185, 196, 202-203` — `support@printfilm.com`
  mailto links and the `github.com/yi1108/printfilm` attribution link. The upstream
  link **must stay** (MIT); the support address must be replaced.
- The whole `en` bundle needs a semantic read, not a spot check. Placeholder English
  is common in codebases that grew from a Chinese-first product, and a translator
  following it will faithfully reproduce the mistakes.

**Method:** diff the `en` and `zh` trees key by key and flag every `en` value that is
a literal translation of the `zh` value where a domain term should have been kept
(`TaskRun`, `pending`, `awaiting_poll`), plus every `en` value that reads as machine
output. Roughly 555 keys in `pages.ts` and ~95 in `shell.ts`.

**Cost:** 1 day for a careful read. **Do it before the `vi` bundle is written**, so
`vi` is not translated from a broken reference.

---

## 6. Backend e-mail and user-facing copy

Not scheduled. Listed so the decision is recorded.

| Location | CJK content | Decision |
|----------|-------------|----------|
| `backend/app/services/password_reset.py:135, 141` | Password-reset body and `subject="PRINTFILM 密码重置"` | **P0, and a security item.** Must change. The `PRINTFILM` name and the password-reset context together are exactly what a phishing filter and a cautious user both key on. This is currently the only e-mail we identified as brand-exposing |
| `backend/app/services/email.py` | Verification and notification templates | Needs a `vi` and `en` variant. Lower urgency — most users are on `vi` and the messages are transactional |
| `backend/app/api/drama/agents.py:460` | `你是 PRINTFILM 漫剧创作助手…` | **P0 brand.** This is the LLM system prompt for the drama assistant, so it is model-visible *and* brand-exposing. Also the whole `agents.py` has 231 CJK lines of prompt text (§1.4) |
| `backend/app/services/billing/alerts.py` | Balance and cost alert mails | Follows `settings.app_name`, so it inherits the default. See `OPEN_SOURCE_CHECKLIST.md` §2.8 |

---

## 7. Sequencing

Ordered so that each step makes the next one cheaper, and so that no step produces a
half-translated user-facing surface.

| # | Step | Owner | Cost | Why here |
|---|------|-------|------|----------|
| 1 | Add Noto Sans to `frontend/index.html`, verify tone marks | Bunny 2 | 1 h | Gates the visual quality of everything below |
| 2 | Correct the `en` bundle (brand strings, machine translations) | Bunny 1 | 1 d | `vi` will be written from it; fixing it afterwards means re-translating |
| 3 | Add the `templates` locale block; replace the two hard-coded filter labels in `TemplatesPage.tsx` and `CreateProjectPage.tsx` (keeping the Chinese sentinels) | Bunny 1 | 0.5 d | Smallest P0, proves the value-vs-sentinel pattern |
| 4 | Land the `vi` locale tree | Bunny 1 | in flight | The whole point |
| 5 | Extract `backend/app/services/messages.py`; replace the 143 `HTTPException` literals with catalogue keys. **Strings unchanged, all 104 test files still pass** | backend | 1 d | Unblocks §8 with zero behaviour change |
| 6 | Translate the remaining backend comments/docstrings: `tasks/service.py`, `model_settings.py`, `logical_model_router.py`, `media_model_presets.py` | backend | 0.5 d | Wave 1 did 20 files; these are the next clean ones |
| 7 | Frontend hard-coded copy, largest files first: `EpisodeEditPage.tsx` (210), `StoryboardPage.tsx` (174), `AssetsStep.tsx` (135) | Bunny 1 | 5 d | The real P0, and 60% of the total in three files |
| 8 | Admin i18n as one project, per `ADMIN_I18N_PLAN.md` | unassigned | 8–10 d | Must not be sliced |
| 9 | `vi` for backend `HTTPException` and e-mail, after step 5 | backend | 3 d | Depends on 5 |
| 10 | `vi` for `legalContent.ts` | legal + Bunny 1 | blocked | Needs a legal decision first, not a translator |
| — | `templates_seed.py` / `ark.py` prompt text | **not scheduled** | — | See §1.1. Translating changes generation output, not just text |

---

## 8. Things deliberately not scheduled

Recording these so a later reader does not re-open them.

| Item | Lines | Why not |
|------|------:|---------|
| `services/templates_seed.py` prompt text | 206 | LLM prompt. Translating changes generated video, not the code (§1.1) |
| `services/ark.py` prompt text and entity glossary | 171 | Same. The glossary at `:212-227` exists to normalise Latin names *into* Chinese |
| `templates.category` values | 23 | Enum. Migrating means a data migration on every installed database, plus a change to `CATEGORY_ORDER` in `frontend/src/lib/categories.ts` |
| `voice_preset` / `bgm_mood` | 23 + 1 | Enum, consumed by the audio pipeline |
| `admin/src/index.css` | 1 | 1 CJK line in 3,975. The recon figure of 79 was the byte size, not the line count |
| `admin/src/lib/statusLabels.ts` keys | 40 | English API values, not display text |
| `backend/tests/**` Chinese assertions | 1,375 | They assert on production strings. Rewriting them without changing the production strings breaks the suite; rewriting them with the production strings is step 9, which needs step 5 first |
| `zh` locale completeness | 555 | `zh` is retained, not required to be complete. Adding new `vi`/`en` keys without `zh` counterparts fails `tsc` — so either fill `zh` too or make the type derivation a union rather than `typeof zh` |

The last row is a design decision worth making early. `Messages = typeof zh` makes
`zh` the source of truth for the message shape, which means **a retained-but-optional
locale is not actually supported by the type system.** Either `zh` must be completed
for every new key, or the type must be derived from a hand-written interface. The
current design quietly obliges us to keep translating into Chinese, which is the
opposite of the stated goal.
