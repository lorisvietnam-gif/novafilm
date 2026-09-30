# OPEN SOURCE CHECKLIST

Audit of this repository before it is distributed publicly. Every section states a
**status** and, where the status is not `GO`, the decision a human still has to make
with the supporting evidence.

Status legend:

| Status | Meaning |
|--------|---------|
| `GO` | Verified, nothing more to do |
| `NO-GO` | Blocks public distribution. Must be fixed first |
| `NEEDS DECISION` | Legal/product call. Cannot be resolved by an engineer without a human |

Measurement method: all counts below were taken on branch `bunny/3` with
`git grep -il` over tracked files and with a per-file CJK line count
(`[一-鿿㐀-䶿]`) over file contents. Where a number could not be established
mechanically it is marked *unverified* and the manual check is named.

---

## 0. Summary

| # | Area | Status |
|---|------|--------|
| 1 | LICENSE / NOTICE / attribution | `GO` |
| 2 | Trademarks and brand marks | `NO-GO` |
| 3 | Media asset provenance | `NO-GO` |
| 4 | Secrets committed to the repository | `NEEDS DECISION` (finding: none found) |
| 5 | Third-party provider lock-in | `NEEDS DECISION` |
| 6 | Third-party dependency licences | `NEEDS DECISION` |
| 7 | Missing standard documents | `NEEDS DECISION` |

Nothing on this list is a reason to keep the repository private. Items 2 and 3 are
the two that must be closed before money changes hands or a public repo goes up.

---

## 1. LICENSE / NOTICE / attribution — `GO`

| Check | Result |
|-------|--------|
| Root licence file | `LICENSE`, MIT, `Copyright (c) 2026 PRINTFILM` |
| Licence modified? | No. Not touched by this fork |
| Attribution file | `NOTICE` added at repo root |
| Upstream URL recorded | `https://github.com/yi1108/printfilm` in `NOTICE`, `LICENSE` context, `README.md`, `frontend/src/lib/siteLinks.ts:3` |
| Derivative-work statement | `NOTICE` section "Major changes made by this fork" |

The MIT permission notice and copyright notice remain in `LICENSE` unmodified, as
required. `NOTICE` states explicitly that the MIT grant does not extend to
trademarks and that the upstream logo may not be presented as ours.

**Decisions taken, no further input needed:** keep `LICENSE` byte-identical to
upstream forever; keep `NOTICE` in the repo root so it ships with any copy.

---

## 2. Trademarks and brand marks — `NO-GO`

`git grep -il printfilm` over tracked files returns **58 files**. The wordmark is
still printed in user-facing surfaces, e-mail, file names, and documentation.

### 2.1 User-visible UI strings — MUST change

| File | Line(s) | What it prints |
|------|---------|----------------|
| `frontend/index.html` | 7, 8 | `<title>PRINTFILM · AI短视频平台</title>`, meta `description` |
| `frontend/src/components/BrandMark.tsx` | 11 | `<span className="brand-word">PRINTFILM</span>` — the primary wordmark |
| `frontend/src/pages/HomePage.tsx` | 42, 219, 236 | kicker, `<strong>PRINTFILM</strong>`, footer `© … PRINTFILM` |
| `frontend/src/pages/PricingPage.tsx` | 323, 334 | footer link, `© … PRINTFILM` |
| `frontend/src/pages/MethodPage.tsx` | 14, 68, 69, 85 | `PAGE_URL` on `www.printfilm.com`, JSON-LD `author` / `publisher`, `<strong>` |
| `frontend/src/components/layout/AppShell.tsx` | 36 | footer `© … PRINTFILM. All rights reserved.` |
| `frontend/src/i18n/locales/zh/shell.ts` | 5, 6, 80, 92 | title, description, user-group link, lede |
| `frontend/src/i18n/locales/en/shell.ts` | 5, 7, 81, 93 | same four, English |
| `admin/index.html` | 7 | `<title>PRINTFILM 管理后台</title>` |
| `admin/src/components/layout/AdminLayout.tsx` | 245, 359 | sidebar brand name, topbar crumb |
| `admin/src/components/settings/SiteSettingsPanel.tsx` | 72 | placeholder `https://www.printfilm.com` |

The `zh` and `en` locale files are Bunny 1's lane and are not edited in this wave.
They are listed here so the item is not lost.

### 2.2 Legal text — MUST change

`frontend/src/lib/legalContent.ts` — 10 occurrences (lines 23, 28, 46, 83, 93, 151,
164, 169, 187, 224, 234, 292) naming PRINTFILM as the contracting party, plus
`mailto:support@printfilm.com` at 316, 317, 328. Also `frontend/src/lib/methodLanding.ts`
— 17 occurrences (lines 88, 90, 103, 124, 153, 178, 200, 234, 237, 238, 242, 244, 257,
278, 306, 307, 332, 354, 389, 392, 393). Both files are Bunny 1's lane.

**Blocking reason:** the Terms of Service and Privacy Policy currently name a third
party as the party bound by them. We cannot publish a click-through agreement that
assigns our users' data to somebody else's company. This is the single hardest
`NO-GO` on the list.

### 2.3 E-mail — MUST change

`backend/app/services/password_reset.py`:

- line 135 — body `您正在重置 PRINTFILM 账号密码。`
- line 141 — `subject="PRINTFILM 密码重置"`

Password-reset mail is the one place where a wrong brand name is a security
incident, not a cosmetic bug: a user who receives a password-reset mail naming a
vendor they do not recognise should not trust it.

### 2.4 Domains and hosts in code — MUST change (behavioural)

These are not strings, they are routing and storage rules. Changing them is a
code change with a data-migration tail:

| File | Lines | What |
|------|-------|------|
| `backend/app/services/oss.py` | 83–91 | CORS / allowed-host list: `www.printfilm.com`, `printfilm.com`, `admin.printfilm.com`, `kepu.printfilm.com`, `admin.kepu.printfilm.com` (https + http) |
| `backend/app/services/storage.py` | 174–177 | `is_local_static_url()` host allowlist: `www.printfilm.com`, `printfilm.com`, `kepu.printfilm.com`, `kepu.printtfilm.com` |
| `backend/app/services/storage.py` | 176 | also contains a **typo** domain `kepu.printtfilm.com` (three `t`) |
| `deploy/.env.prod.example` | 41, 42 | `EPAY_NOTIFY_URL=https://www.printfilm.com/epay/notify`, `EPAY_RETURN_URL=https://www.printfilm.com/pricing?paid=1` |
| `frontend/src/lib/methodLanding.ts` | 3 | `METHOD_START_URL = 'https://www.printfilm.com/studio/new'` |
| `frontend/src/lib/methodLanding.ts` | 88, 242 | canonical `metaTitle` values |
| `frontend/src/pages/MethodPage.tsx` | 14 | `PAGE_URL = 'https://www.printfilm.com/method'` |
| `frontend/src/lib/siteLinks.ts` | 3 | `GITHUB_REPO_URL = 'https://github.com/yi1108/printfilm'` |
| `frontend/src/i18n/locales/{zh,en}/pages.ts` | 164, 184, 185, 196, 202, 203 | contact mailto, `github.com/yi1108/printfilm` attribution link (Bunny 1) |

**Risk if changed carelessly:** `is_local_static_url()` decides whether a media URL
points at the local disk. Wrong entries in either direction break FFmpeg input
resolution or make the system re-upload every asset to OSS on every republish. The
host lists must be changed together with the actual production domains, and the
existing rows in `static.generated` in production must be re-pointed.

`METHOD_START_URL` and `METHOD_START_TITLE` exist because Bunny 1 is rebuilding
those pages behind an i18n key. Do not edit `methodLanding.ts` in another lane;
coordinate.

### 2.5 Support e-mail address — MUST change

`support@printfilm.com` at: `legalContent.ts` 83, 151, 224, 292, 316, 317, 328;
`ContactPage.tsx` 32, 33, 129; `locales/{zh,en}/pages.ts` 164, 184, 185, 196.
A support address we do not control means every support ticket is delivered to a
third party.

### 2.6 Logos and favicons — MUST change

| File | Size | Finding |
|------|------|---------|
| `frontend/public/logo.png` | 860,866 B | 1024×1024 PNG, abstract camera/aperture mark. **No wordmark rendered.** Is an upstream asset by provenance, not by content |
| `frontend/public/logo.svg` | 457 B | 7-line abstract mark, **byte-identical to `favicon.svg`** (MD5 `C3702B7431…`) |
| `frontend/public/favicon.svg` | 457 B | same as above |
| `admin/public/favicon.svg` | 9,522 B | **This is the Vite logo** (`#863bff` bolt, `viewBox="0 0 48 46"`). A Vite scaffold leftover, not ours and not upstream's. It is a *different* licence situation from the rest and should be deleted, not rebranded |
| `frontend/src/components/BrandMark.tsx` | — | Renders the wordmark as HTML text, so it is a code change, not an asset swap |

`logo.png` and `logo.svg` are a *different* mark from the `PRINTFILM` wordmark
printed in `BrandMark.tsx`. So replacing the logo file alone does **not** clear the
trademark issue — the wordmark is in JSX, in `index.html`, and in both locale
trees.

### 2.7 Code identifiers and infrastructure names — MAY keep

These are internal, not user-visible, and renaming them has a migration cost with
no legal benefit:

- `backend/app/__init__.py:1` — `"""PRINTFILM platform backend."""` (docstring, not user-visible)
- `backend/app/config.py:17` — `app_name: str = "PRINTFILM"` — **but see 2.9**
- `backend/app/config.py:24, 25` — Postgres role/database name `printfilm`
- `backend/app/api/drama/agents.py:460` — LLM system prompt naming PRINTFILM. **MUST change** — it is model-visible user-facing copy
- `backend/app/models_drama.py:15` — `# One drama series owned by a PRINTFILM user` (comment)
- `backend/.env.example:6, 7, 8`; `deploy/.env.prod.example:2, 4, 9, 10, 11`; `deploy/.env.docker.example:6, 8`; `deploy/docker-compose.yml:15, 17, 21`
- `docker-compose.yml:1, 5, 12, 14, 16, 18, 30, 40, 45, 46, 49, 71, 80, 89, 90, 91`
- `docker-compose.full.yml:1, 6, 13, 15, 17, 19, 31, 41, 49, 50, 53, 75, 87, 99, 100, 101`
- `deploy/.env.prod.example:41, 42` — see 2.4
- `frontend/.env.production:1` — comment mentioning `www.printfilm.com`
- `frontend/src/styles/printfilm.css`, `frontend/src/pages/drama/drama.css:1`, `frontend/src/pages/method/method.css:1`, `frontend/src/App.css:2`, `frontend/src/App.tsx:30` — file names and comments
- `frontend/src/i18n/detect.ts:7` — `LOCALE_STORAGE_KEY = 'printfilm.locale'`. **Keep.** Renaming it silently discards every user's stored locale preference
- `frontend/src/lib/clientDownload.ts:74` — ZIP filename prefix `printfilm_videos_…`. **MUST change** — it lands in the user's Downloads folder
- `backend/tests/conftest.py:4`, `backend/tests/test_billing_alerts.py:110`, `backend/tests/test_oss_queue_backfill.py:71`, `backend/tests/test_password_reset.py:112` — tests
- `docs/**` — 13 files. These are our own documentation; upstream attribution links are required by MIT and must stay

**Recommendation (human call):** rename the *product-facing* strings and hosts
(2.1–2.6) and keep the *infrastructure* names (2.7). Renaming the compose project,
volume names, and Postgres role is pure churn with a real chance of orphaning a
production volume.

### 2.8 `APP_NAME` in config — `NEEDS DECISION`

`backend/app/config.py:17` defaults `app_name = "PRINTFILM"`. It is admin-overridable
via the `app_settings` overlay, and `backend/tests/test_billing_alerts.py:110`
asserts on it. It is consumed at
`backend/app/services/billing/alerts.py` for platform cost-alert e-mail bodies, and
the admin e-mail templates are the only consumer. Leaving the *default* as PRINTFILM
means any environment that forgets to set the overlay sends our own cost reports
naming the vendor.

**Decision needed:** change the default to the new product name, or accept the
default and add a startup warning. Changing the default is a one-line change but
touches `backend/app/config.py`, which is in this lane's Việc 7 comment-translation
list — coordinate so the two edits land in one commit or two clean ones.

### 2.9 Local storage key `printfilm.locale` — `NO-GO` for shipping, `GO` for renaming

`frontend/src/i18n/detect.ts:7`. If the product is renamed, the key must follow, or
returning users keep the old preference. **But** this is Bunny 1's lane and it is the
i18n core. Report, do not edit. Suggested fix for Bunny 1: read both keys, write only
the new one, with a migration note in `detect.ts`.

---

## 3. Media asset provenance — `NO-GO`

Four asset families ship in the repository. MD5 comparison across
`frontend/public/image-styles/`, `backend/static/drama/image-styles/`,
`backend/static/templates/covers/`, `frontend/public/char-presets/`,
`frontend/public/mode-presets/`, and `frontend/public/payment/` found **28
content-identical groups**, i.e. the same bytes are stored 2–3 times under different
names.

### 3.1 `frontend/public/image-styles/` — 42 files (21 `.jpg` + 21 `.svg`)

These are style-preview thumbnails shown in the template picker. Verdict: came from
the upstream repository, so they are covered by the MIT grant as part of the source
distribution. **No separate licence is required.**

Two problems remain, and they are not licence problems:

- **Duplication.** Every `.jpg` is byte-identical to
  `backend/static/drama/image-styles/<same name>.png` (18 confirmed pairs, e.g.
  `90s-realistic-film.jpg` = `90s-realistic-film.png`, MD5 `C598926343…`). The
  frontend serves the preview; the backend serves the pipeline. ~7 MB of the repo is
  the same pixels twice.
- **Content risk inside the images.** Visual inspection of
  `frontend/public/image-styles/90s-realistic-film.jpg` shows a photoreal AI
  illustration of a real-seeming person in a shop whose shelves carry recognisable
  third-party product packaging (branded cans and boxes, one with a red
  cola-style wordmark). The remaining 20 files were **not** individually inspected —
  they are stylistically the same family and very likely share the problem.

  This is a trademark and likeness exposure that MIT does not cover, and it is the
  most likely thing to draw an actual complaint. **Decision needed:** regenerate or
  replace all 21 previews, or crop/blur the packaging, before any public launch.
  A cheaper interim: keep them for internal self-hosting only and accept the
  exposure never reaching the public.

### 3.2 `backend/static/drama/image-styles/` — 21 files

Same 21 images, `.png` extension instead of `.jpg`. Same verdict, same
content risk, same duplication.

### 3.3 `backend/static/templates/covers/` — 27 files

Template cover art. All shipped with upstream, MIT-covered. Note 8 of them are
duplicates of each other or of other families:

- `covers/anim_3d.png` = `drama/image-styles/cgi-3d-animation.png` = `frontend/public/image-styles/cgi-3d-animation.png` (MD5 `0CC54F669B…`)
- `covers/photo_realism.png` = `covers/live_product_desk.png` (MD5 `FB1CC0A43F…`)
- `covers/live_person.png` = `covers/live_street_interview.png` = `covers/huoke_douyin_hook.png` (MD5 `6748671B1E…`)
- `covers/magazine_collage.png` = `covers/huoke_xhs_recommend.png` (MD5 `3C4AD254BD…`)
- `covers/docu_warm.png` = `covers/huoke_soft_invite.png` (MD5 `17315B54F1…`)
- `covers/chalk_whiteboard.png` = `covers/huoke_review_facts.png` (MD5 `4033F50F06…`)
- `covers/opensource_showcase.png` = `covers/opensource_live_work.png` (MD5 `A69890A6DF…`)

These names encode what the art was originally for (`huoke_*` = 获客 lead-gen
templates). After a rebrand, half of them are misnamed. Low legal risk, high
maintenance cost.

### 3.4 `frontend/public/char-presets/` — 4 files (`anime.jpg`, `none.jpg`, `real.jpg`, `sil.jpg`)

Character-reference presets fed to the image model. Shipped with upstream, MIT-covered.
Not individually inspected for third-party content.

### 3.5 `frontend/public/hero.jpg` — 1,671,150 B

Marketing hero on the landing page. Inspected: a bright AI-rendered interior with a
camera on a desk, film-strip props, and molecular models. **No third-party mark and
no wordmark visible.** The one large marketing asset that is clean. It is also the
largest single file in the repository and a generic stock-style image, so it is the
strongest candidate for a rebrand pass.

### 3.6 `frontend/public/mode-presets/`, `frontend/public/payment/` — unverified

`mode-presets/` (2 files) and `payment/` (`alipay.svg` 934 B, `unionpay.svg` 417 B,
`wechatpay.svg` 1,183 B) were **not** visually inspected.

`payment/*.svg` needs attention: these are payment-provider marks. Alipay, WeChat
Pay, and UnionPay each restrict use of their logos — normally to certified
merchants. Shipping them in an open-source repo invites a trademark complaint from
the payment networks and signals a relationship we do not have.
**Decision needed:** obtain merchant approval, or replace with neutral text labels
("Alipay", "WeChat Pay") and drop the logo files.

### 3.7 Summary table

| Family | Files | From upstream? | Separate licence? | Content risk | Verdict |
|--------|------:|----------------|-------------------|--------------|---------|
| `frontend/public/image-styles/*` | 42 | Yes (implied) | No | **Yes — third-party packaging in the pixels** | `NO-GO` |
| `backend/static/drama/image-styles/*` | 21 | Yes (implied) | No | Same images | `NO-GO` |
| `backend/static/templates/covers/*` | 27 | Yes (implied) | No | Not inspected individually | `GO` w/ note |
| `frontend/public/char-presets/*` | 4 | Yes (implied) | No | Not inspected | `GO` w/ note |
| `frontend/public/hero.jpg` | 1 | Yes (implied) | No | Inspected — clean | `GO` |
| `frontend/public/logo.png` / `.svg` | 2 | Yes (implied) | No | No wordmark in the art | `GO` w/ note |
| `admin/public/favicon.svg` | 1 | **No — Vite scaffold** | Vite MIT | None | `NO-GO` — delete |
| `frontend/public/mode-presets/*` | 2 | Unverified | ? | Not inspected | `NEEDS DECISION` |
| `frontend/public/payment/*.svg` | 3 | Unverified | ? | Payment-network marks | `NO-GO` |

"Implied" means: these files were already in the upstream repository and were not
added by this fork. Git history for this repository does not contain the upstream
commit, so provenance was inferred from the file set and the duplicate structure,
not proven from `git log`. **If a hard provenance record is required, the upstream
`git log` must be checked separately.**

---

## 4. Secrets committed to the repository — `NEEDS DECISION`

The instruction for this audit named `frontend/.env.production` as the top-priority
item, on the grounds that it is committed while `.gitignore` carries a
negating `!frontend/.env.production` rule.

**Finding: the file contains no secret.** Full contents:

```
# Production / same-origin builds: empty = nginx proxies /api on www.printfilm.com
VITE_API_BASE=
```

Two lines. `VITE_API_BASE` is empty, which means "same origin, let nginx proxy
`/api`" — the correct production setting. There is no key, no token, no password, no
endpoint, and no private host. The `!` negation in `.gitignore` is deliberate and
necessary: Vite only reads `.env.production` from the build environment, and an
ignoring rule would make the production build silently fall back to a dev API base.

Recorded conclusion: **not a leak.** The risk on this file is not confidentiality,
it is that the committed default is now part of the public API contract — a
downstream fork that changes nothing will build against same-origin and get a
confusing CORS failure rather than a clear "you forgot to set the API base" error.

Full secret sweep performed, all clean:

| Check | Result |
|-------|--------|
| Tracked `*.env*` files | Only `backend/.env.example` and `deploy/.env.{prod,docker,secrets.local}.example` |
| Any real `.env` tracked | None |
| `deploy/.env.secrets.local.example` | 3 lines, both values empty (`DEPLOY_SSH_PASSWORD=`, `DEPLOY_PG_PASSWORD=`). Neither is read by any code in the repo; they belong to a release script that is itself gitignored |
| API keys, `sk-` literals | None in tracked files |
| Private keys, PEM blocks | None in tracked files |
| `SECRET_KEY` in `.env.example` | Placeholder value only |

**Decision needed (why this is not plain `GO`):** the file is safe today, but the
`!` negation is an invitation. A future contributor who adds a real
`VITE_SOME_SECRET=` to this file and commits it gets no `.gitignore` protection,
because the file is force-included. **Recommendation:** keep the file and the
negation, but add a guard — a CI secret scan, or a comment in the file itself
stating that only non-sensitive build flags belong here. Do not delete the file; the
Vite production build depends on it.

---

## 5. Third-party provider lock-in — `NEEDS DECISION`

The upstream release is hard-locked to exactly one upstream AI provider.
`backend/app/services/tokenfree_gateway.py:1` states the intent in its module
docstring: the open-source build is fixed to TokenFree New API with no way to switch.

The lock is enforced in four places, and it is enforced *hostile to abstraction*:

| Location | Mechanism |
|----------|-----------|
| `backend/app/services/tokenfree_gateway.py:9–15` | `TOKENFREE_CHANNEL_ID = "tokenfree"`, `TOKENFREE_BASE_URL = "https://www.tokenfree.com/v1"`, `TOKENFREE_QUOTA_PER_USD = 500_000` |
| `backend/app/services/model_settings.py:372–420` (`_ensure_tokenfree_channel`) | Forces `base_url`, `api_format="openai"`, `protocol="auto"`, `enabled=True`, `sort_order=0`, `advanced_config=None`; **and disables every other channel row** |
| `backend/app/services/model_settings.py:699–740` (`patch_admin_routing_settings`) | Repeats the lock on every admin save, and **discards the admin's model selection** — `models` is overwritten with `all_preset_channel_models()` |
| `backend/app/services/model_settings.py:592–597` (`get_admin_routing_settings`) | Filters the returned channel list down to the TokenFree row, so the UI cannot even display an alternative |

Scale of the coupling: `git grep -il tokenfree backend/app` returns **20 files** and
**427 mentions**. The six files in the `tokenfree_*` group are
`tokenfree_audio.py`, `tokenfree_gateway.py`, `tokenfree_image.py`,
`tokenfree_pricing.py`, `tokenfree_usage.py`, `tokenfree_video.py`.

The provider name is additionally baked into a pricing constant that is a business
rule, not a technical one: `TOKENFREE_QUOTA_PER_USD = 500_000` — New API's internal
quota-to-USD conversion. Billing multiplies by it. If that constant is wrong, every
customer is charged the wrong amount, and nothing in the type system says so.

**To treat this as our own open-source code, the following is required:**

1. Extract a provider interface. Minimum viable shape: a `ModelProvider` protocol
   with `generate_text`, `generate_image`, `generate_video`, `generate_audio`, and
   `quota_to_currency`. `tokenfree_*.py` becomes one implementation of it.
2. Move the 427 references behind that interface. Realistic estimate: **20 files**,
   the `tokenfree_*` group in full, plus `ark.py` (2,406 lines),
   `model_settings.py` (823), `tokenfree_pricing.py` (733), `logical_model_router.py`,
   `media_model_presets.py`, and the three admin settings panels that assume a
   single channel.
3. Replace the forced-lock calls in `model_settings.py` with a provider registry.
   The routing model (`LogicalModel` → `LogicalModelBinding` → `SystemModelChannel`
   in `backend/app/schemas_routing.py:10–70`) is already close to the right shape
   and is worth keeping — the problem is the code that refuses to use it.
4. Move the quota conversion out of a constant and into per-channel configuration,
   so a provider with a different accounting unit does not require a code change.
5. Add a second provider implementation to prove the seam is real. A test double
   is enough for CI; a real second provider is needed to prove it in production.

**Effort:** 2–3 engineer-weeks for steps 1–4, plus step 5. This is the largest
single engineering item in the whole open-source effort.

**Decision needed:** is this fork meant to be a *fork that happens to ship one
provider*, or a *general-purpose platform*? If the former, the honest answer is to
keep the lock and say so clearly in the README — a hard dependency on a single
upstream vendor is a legitimate distribution choice, and the code already documents
itself that way. If the latter, budget the 2–3 weeks.

**Operational risk, independent of the above:** the README currently tells users to
register at `https://www.tokenfree.com` and paste the key into the admin UI
(`README.md` §"配置 TokenFree API Key"). Our users' keys and billing depend on a
third-party site we do not control. If that site disappears, every fork of this
software loses image and video generation entirely. Say this plainly in the README
rather than letting users discover it.

---

## 6. Third-party dependency licences — `NEEDS DECISION`

No dependency licence audit file exists in the repository. Licences were not
verified for any dependency; the list below is the inventory that must be checked.
Most of these are unambiguously permissive, but "unambiguously permissive" is a
claim someone has to make on the record, and one of them is a problem.

### 6.1 Python — `backend/requirements.txt` (19 pinned + 1 optional)

| Package | Version | Expected licence | Action |
|---------|---------|------------------|--------|
| fastapi | 0.115.12 | MIT | Record |
| uvicorn[standard] | 0.34.2 | BSD-3-Clause | Record |
| sqlalchemy | 2.0.40 | MIT | Record |
| asyncpg | 0.30.0 | Apache-2.0 | Record |
| psycopg2-binary | 2.9.10 | LGPL-3.0 (with exceptions) | Record; note the exception clause |
| pydantic | 2.11.3 | MIT | Record |
| pydantic-settings | 2.9.1 | MIT | Record |
| python-jose[cryptography] | 3.4.0 | MIT | **Review.** Maintained less actively than `pyjwt`, which is the better-maintained choice for JWT signing and verification. `SECRET_KEY` signs every session token through this library (`backend/app/services/auth.py:26, 31`), so a swap is a security decision, not a chore |
| passlib[bcrypt] | 1.7.4 | MIT | Record |
| bcrypt | 4.3.0 | Apache-2.0 | Record |
| python-multipart | 0.0.20 | Apache-2.0 | Record |
| celery | 5.5.1 | BSD-3-Clause | **Review.** Installed but **never imported** — see below |
| redis | 5.2.1 | MIT | Record |
| httpx | 0.28.1 | BSD-3-Clause | Record |
| sse-starlette | 2.2.1 | BSD-3-Clause | Record |
| python-dotenv | 1.1.0 | BSD-3-Clause | Record |
| email-validator | 2.2.1 | MIT | Record |
| edge-tts | 7.2.3 | LGPL-3.0 | Record |
| oss2 | 2.19.1 | MIT | Record; Aliyun SDK, keep vendor attribution |
| volcengine-python-sdk[ark] | optional, not pinned | Apache-2.0 | Only if installed |

**`celery` is dead weight.** `CLAUDE.md:46` states plainly: Celery is a leftover
dependency, the `USE_CELERY` env var is not read by any code, and the `workers/`
directory does not exist. Yet `celery==5.5.1` is pinned in `requirements.txt:12`.
`USE_CELERY` also appears in `backend/.env.example:28`, `deploy/.env.prod.example:31`,
and `deploy/README.md:38` as a *live-looking* setting, which actively misleads
operators into thinking a worker must be running. Remove the pin and all three env
references. `docs/STANDARDS.md:136` also tells contributors that long jobs go through
Celery, which is wrong and needs correcting in the same pass.

### 6.2 Frontend — `frontend/package.json` (9 runtime, 9 dev)

| Package | Expected licence | Action |
|---------|------------------|--------|
| `@xyflow/react` | MIT | Record |
| `jszip` | MIT/GPL-3.0 dual | **Review.** We must ship the MIT option. Check no `jszip.min.js` bundle is vendored |
| `lucide-react` | ISC | Record |
| `mp4cat` | MPL-2.0 | Record. MPL is file-level copyleft: our modifications to their files must stay open. We do not modify their files, so fine — but do not vendor a patched copy |
| `qrcode` | MIT | Record |
| `react`, `react-dom` | MIT | Record |
| `react-router-dom` | MIT | Record |
| `@types/*`, `@vitejs/plugin-react`, `@vitejs/plugin-legacy`, `oxlint`, `typescript`, `vite` | MIT / Apache-2.0 | Record |

### 6.3 Admin — `admin/package.json` (18 runtime, 9 dev)

All MIT (`@radix-ui/*`, `class-variance-authority`, `clsx`, `lucide-react`, `react`,
`react-dom`, `react-router-dom`, `recharts`, `sonner`, `tailwind-merge`) except
`@tailwindcss/vite` and `tailwindcss` (MIT). Note `recharts` pulls in
`victory-vendor@^37.0.2` (confirmed in `admin/package-lock.json`); its licence must be
recorded too. **Fonts** — `admin/src/index.css:26-27`
declares `--font-display: "Anybody"` and `--font-sans: "Figtree"`. Where are these
loaded from? If from a CDN, the font licence (usually SIL OFL) must be recorded. If
from a package, that package's licence applies. **Unverified.**

### 6.4 Not a dependency but a licensing item: images and fonts

Covered in §3 (images) and see `docs/VI_BACKLOG.md` for the font-subset issue. Web
fonts loaded from Google Fonts (`frontend/index.html:12`: Noto Sans SC, Noto Serif
SC,
Space Grotesk) are SIL OFL 1.1, which permits redistribution provided the licence
accompanies the font. Linking from Google's CDN rather than self-hosting means the
licence is Google's to satisfy, not ours — acceptable, and worth one line in the
README so a self-hosting user knows they inherit the obligation.

### 6.5 Decision needed

**Should we ship a machine-readable SBOM / third-party notice file?**
`NOTICE` currently covers upstream PRINTFILM only. If this repository goes public,
a `THIRD_PARTY_NOTICES.md` generated from the lockfiles would be the expected
artefact and would close most of §6 mechanically. The licence texts themselves must
be fetched and read by a human, not inferred from memory — the table above is an
inventory with expected licences, not a verification.

---

## 7. Missing standard documents — `NEEDS DECISION`

What exists in `docs/`, and what an open-source project is normally expected to have.

| Document | Present? | Notes |
|----------|----------|-------|
| `LICENSE` | Yes | MIT, unmodified |
| `NOTICE` | Yes | Added by this wave |
| `README.md` | Yes | Rewritten by this wave; upstream attribution retained |
| `CONTRIBUTING.md` | **No** | `README.md` §贡献 has a four-line stub. A real guide needs: how to run the three apps, how to run the tests, the commit-message convention, the PR gate, and the rule that `.env` must never be committed |
| `CODE_OF_CONDUCT.md` | **No** | Needed before taking public issues |
| `SECURITY.md` | **No** | **Highest priority of the four.** There is no way to report a vulnerability, and the security surface here is real: JWT auth, a wallet with real balance, an OSS upload path, a payment webhook, and a third-party-provider API key. Without this, a finder will post credentials in a public issue |
| `CHANGELOG.md` | **No** | Upstream tracked releases as `docs/releases/` and `docs/DEPLOY.md`, both explicitly kept off the repository (`docs/STANDARDS.md:155, 171-172`). So the public repository has *no* release history at all |
| `docs/OPEN_SOURCE_CHECKLIST.md` | Yes | This file |
| `docs/OPERATIONS.md` | Yes | Added by this wave |
| `docs/VI_BACKLOG.md` | Yes | Added by this wave |
| `docs/ADMIN_I18N_PLAN.md` | Yes | Added by this wave |
| CI configuration | **No** | No `.github/workflows/`. No test runner in CI, no lint gate, no secret scan. §4's recommendation depends on this |
| Issue / PR templates | **No** | `docs/PLACEHOLDER_BACKLOG.md` exists as a product backlog, not a template |
| Test coverage report | **No** | `backend/tests/` has 104 files with 1,375 CJK lines, so tests are extensive. There is no coverage measurement and no threshold |
| `docs/DEPLOY.md` | **No** (by design) | Deliberately excluded from the public repo. Replaced for public readers by `docs/OPERATIONS.md` |

**Decisions needed:**

1. `SECURITY.md` — write it. Do this before the repository goes public, not after.
2. `CHANGELOG.md` — decide whether to reconstruct release history from
   `docs/releases/` (which exists only on the maintainer's machine) or to start the
   changelog from the date the repository goes public. Reconstructing is nicer;
   starting clean is honest and cheaper.
3. `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` — needed only if outside contributions
   are actually wanted. If not, say so in the README instead of leaving them absent.
4. CI — the minimum viable set is: `frontend` build, `admin` build, `backend`
   pytest, and a secret scan. All four are already runnable locally today; wiring
   them into CI is a half-day of work and it is what makes §4's conclusion
   enforceable rather than advisory.

---

## 8. What must happen before the repository goes public

Ordered by how much damage each item causes if missed.

1. Replace the wordmark in every user-facing surface — §2.1, §2.6, §2.7
   (`clientDownload.ts`), and `config.py:17` (§2.8).
2. Rewrite `legalContent.ts` so the Terms and Privacy Policy name us — §2.2.
3. Replace `support@printfilm.com` everywhere — §2.5.
4. Change the password-reset e-mail subject and body — §2.3.
5. Decide on the payment-network logos in `frontend/public/payment/` — §3.6.
6. Regenerate or replace the 21 image-style previews — §3.1, §3.2.
7. Delete `admin/public/favicon.svg` (Vite logo) and ship our own — §2.6.
8. Write `SECURITY.md` — §7.
9. Re-point the domain allowlists in `oss.py` and `storage.py`, with a data
   migration for existing media rows — §2.4.
10. Generate `THIRD_PARTY_NOTICES.md` from the lockfiles; actually read the licence
    texts — §6.5.

Items 1–4 are tracked in `docs/VI_BACKLOG.md` where they overlap with the
Vietnamese-locale effort. Item 5 is a decision, not a task. Item 6 is the one with
no deadline pressure if we self-host only.
