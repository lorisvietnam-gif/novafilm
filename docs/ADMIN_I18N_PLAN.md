# Admin i18n plan

Why the admin console needs its own i18n work rather than a two-file patch, what the
design system allows, and a sequenced plan.

**Status: plan only. No admin content was changed in this wave.** See
["What was deliberately not done"](#8-what-was-deliberately-not-done).

All counts were measured on branch `bunny/3`. Method: per-file CJK line count
(`[一-鿿㐀-䶿]`) over `admin/src/**/*.{ts,tsx,css}`.

---

## 1. Findings before any plan

### 1.1 Verified: the two label files map English API values to Chinese text

`admin/src/lib/statusLabels.ts` (154 lines, **70 CJK lines**) and
`admin/src/lib/dramaLabels.ts` (45 lines, **30 CJK lines**) are display-mapping
tables only. The keys are the contract, the values are the UI:

| File | Key examples | Value examples |
|------|--------------|----------------|
| `statusLabels.ts:2-103` | `DRAFT`, `pending`, `succeeded`, `failed`, `cancel_requested`, `awaiting_poll`, `leased`, `frozen`, `settled`, `none`, `topup`, `unfreeze`, `topup_10`, `alipay`, `wxpay`, `boy`, `girl`, `general` | 草稿, 生成中, 已完成, 失败, 取消中, 上游生成中, 已领取, 预扣中, 已结算, 未预扣, 充值, 解冻, 未命名作品, 支付宝, 微信支付 |
| `dramaLabels.ts:13-21, 33-43` | `script`, `canvas`, `pending`, `processing`, `processing_image`, `processing_video`, `processing_voice`, `failed`, `character`, `scene`, `prop`, `voice_profile` | 大纲分集, 自由画布, 排队中, 处理中, 生图中, 视频生成中, 配音中, 失败, 角色, 场景, 道具, 音色 |

**Conclusion: only the right-hand side is ever user-facing.** These are textbook
"translate the display value, never the key" tables, exactly as
`docs/STANDARDS.md` §4.1 requires. Converting them is mechanical and low-risk *in
isolation* — which is precisely the problem, because isolation is not an option here.

### 1.2 Verified: admin has no i18n layer

`git grep -in "i18n\|locale" -- admin/src` returns **0 real matches** (the 38 counted
matches are all false positives: `res.text()`, `setHeader`, `encodeURIComponent`, and
identifiers ending in `t(`). There is no provider, no message catalogue, no
`Locale` type, no `t()` function, no locale storage, and no language switcher.

`admin/src` is 28 page files plus 11 shadcn components in `components/ui/`:

```
App.tsx  main.tsx  index.css
pages/           28 .tsx files (Dashboard, Orders, Queues, Projects, Settings,
                 Templates, Users, Works, FinanceList, Login, DramaProjects,
                 plus 17 under pages/dashboard/ and pages/drama/)
components/ui/   badge button card dialog input label page select switch table tabs
components/      admin/ layout/ settings/ tasks/ templates/ users/ works/ finance/
```

### 1.3 Verified: 1,268 CJK lines across 71 files, and `index.css` is not the problem

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

**Correction to the earlier recon: `admin/src/index.css` has 1 CJK line in 3,975
lines (79,452 bytes).** The "79" figure was the byte size, not the line count. The
stylesheet needs no translation work at all.

### 1.4 Verified: the fonts are Latin-only

`admin/src/index.css:26-27`:

```css
--font-display: "Anybody", ui-sans-serif, system-ui, sans-serif;
--font-sans: "Figtree", ui-sans-serif, system-ui, sans-serif;
```

Neither family is loaded from `@font-face` in the repo, and neither carries CJK
coverage. **All 1,268 CJK lines are currently rendering through the system fallback
chain.** That is not a pre-existing visual bug — the console has always been
Chinese-only, so the fallback is what it was designed against. It becomes a bug the
moment anyone adds a Latin-Extended or Vietnamese string, because the fallback
metrics differ from the intended ones.

---

## 2. Why a two-file patch is the wrong move

Translating `statusLabels.ts` and `dramaLabels.ts` on their own, which is the
cheapest possible admin i18n work, produces this state:

| Surface | Language after the patch |
|---------|-------------------------|
| Status badges, drama asset types, payment methods | Vietnamese |
| `OrdersPage.tsx` — 93 CJK lines of column headers, filters, and status prose | Chinese |
| `DashboardPage.tsx` — 75 CJK lines of KPI labels and insight prose | Chinese |
| `TaskDetailDialog.tsx` — 91 CJK lines of task detail fields | Chinese |
| `QueuesPage.tsx` — 67 CJK lines | Chinese |

An operator using the console can no longer assume the interface language. Today
that assumption holds and is safe. After the patch it does not, and the console has
no language indicator to correct the mistake — the badge says *Thất bại* while the
error text next to it is Chinese, with nothing signalling that two languages are in
play.

The failure mode is worse than the status quo because the inconsistency is silent.
This is the whole argument for doing admin i18n as one project.

---

## 3. Design system: the answer on the accent question

**Question asked:** if `#f2c94c` were added as an accent for admin, would it conflict
with the design system Bunny 2 is building?

**Answer: yes, on two independent axes. Do not add it.**

### 3.1 Admin's tokens are a neutral grayscale system with a forest-green identity

`admin/src/index.css:1-28` is a Tailwind v4 `@theme inline` block:

```css
--color-primary:            oklch(0.205 0 0);   /* near-black  */
--color-primary-foreground: oklch(0.98 0 0);
--color-secondary:          oklch(0.97 0 0);
--color-accent:             oklch(0.97 0 0);   /* near-white  */
--color-accent-foreground:  oklch(0.205 0 0);
--color-destructive:        oklch(0.577 0.245 27.325);
--color-border:             oklch(0.922 0 0);
--color-ring:               oklch(0.708 0 0);
```

Every chromatic value is a pure greyscale (`C = 0` in oklch) except
`--color-destructive`. **There is no accent hue in the admin system at all.** The
most-used hex values in `index.css` are `#909399` (19×), `#606266` (13×),
`#303133` (7×) — all neutral greys.

Admin's only chromatic identity is the login shell's forest green:

```css
--forest:      #1f5c48;   /* index.css:47 */
--forest-deep: #163f33;   /* index.css:48 */
```

plus `#4caf82` and `#3d9a72` as supporting greens.

### 3.2 The frontend accent is lime, not yellow

`frontend/src/index.css:2-8`:

```css
--pf-lime: #b6ff00;
--pf-bg:   #f7f8fa;
--pf-ink:  #111318;
```

`#f2c94c` is **not the frontend accent** and appears nowhere in either app
(`git grep -in "f2c94c" -- frontend admin` → 0 matches). It is a third hue family
unrelated to both.

### 3.3 Three concrete conflicts

**Conflict 1 — semantic.** In shadcn/Tailwind v4, `--color-accent` is already
defined (`oklch(0.97 0 0)`) and is the conventional hover / subtle-background token
(`accent`, `accent-foreground`, `hover:bg-accent`). Repurposing "accent" to mean
yellow silently changes every existing `bg-accent` / `hover:bg-accent` usage in the
console. A grep of `index.css` and the components would be needed to size this, but
the risk is structural, not cosmetic: the token name means one thing today and
would mean another after.

**Conflict 2 — palette.** Admin is greyscale + forest green. Adding a saturated
yellow introduces a hue that appears in no other admin surface. Result: three
unrelated identities across the product — lime (user app), forest green (admin
login), yellow (proposed admin accent). A shared design language usually means the
two apps agree; here it would mean they agree on nothing.

**Conflict 3 — contrast.** Measured WCAG 2.1 ratios:

| Foreground | Background | Ratio | Verdict |
|-----------|-----------|------:|---------|
| `#111318` ink | `#b6ff00` lime (frontend CTA fill) | **15.30** | AA text ✓ |
| `#111318` ink | `#f2c94c` proposed fill | **11.71** | AA text ✓ |
| `#f2c94c` | `#ffffff` | **1.59** | **fails AA** (3.0) |
| `#b6ff00` lime | `#f7f8fa` bg (frontend) | **1.14** | **fails AA** |
| `#1f5c48` forest | `#faf9f6` admin paper | **7.43** | AA text ✓ |
| `#ffffff` | `#1f5c48` forest | **7.83** | AA text ✓ |
| `#909399` | `#fafbfc` | **2.97** | **fails AA** for text (3.0 for UI only) |

Two findings worth acting on independently of this decision:

1. **Lime is a fill-only colour.** `#b6ff00` on the app background is 1.14:1 and
   `#f2c94c` on white is 1.59:1. Neither can be used for text or for a thin border
   that must be perceivable. Both are only valid as a **background fill with dark
   text on it**, which is exactly how the frontend uses it
   (`#111318` on `#b6ff00` = 15.3:1). Any admin accent must follow the same rule,
   and any use of it as text or as a hairline needs a different token.
2. **`#909399` at 2.97:1 already fails AA for body text.** It appears 19 times in
   `index.css`, the most-used value in the file. It is fine for decorative borders
   and disabled states, and it is very likely being used for secondary text where it
   is not fine. Worth a separate audit pass — this is a pre-existing issue in the
   admin design system, not something this i18n work introduces.

### 3.4 Recommendation

**Do not add `#f2c94c` to admin.** If the goal is a shared visual identity between
the two apps, the honest version of that goal is a decision, not a token: *should
admin adopt the frontend's lime accent?* The answer is probably no, for three
reasons: the admin console's whole point is to be visually distinct from the
user-facing product, the login shell's forest green is already an identity that
works, and lime fails contrast as anything other than a fill.

What **is** worth sharing is the token *naming discipline* and the contrast rules,
not the hue. Concretely: add a comment block above `admin/src/index.css:1-28`
recording that `--color-accent` is a neutral hover token and is not a brand accent,
and that any future chromatic accent must ship with a measured contrast ratio for
both its fill and its text-on-fill pair. That prevents the same question being
re-litigated in the next wave.

---

## 4. Plan

### 4.1 Shape: does admin need its own i18n layer?

**Yes.** Three reasons, in order of weight:

1. **Different design system, different delivery.** Admin is Tailwind v4 + shadcn;
   the user app is a hand-built CSS system. The frontend i18n lives in
   `frontend/src/i18n/` and its components are written against `pf-*` semantic
   classes. Reusing it would mean either sharing a directory across two build
   configs with different bundler aliases, or duplicating the code and letting them
   drift. Neither is worth it for a provider, a lookup function, and a `t()` hook.

2. **Different audiences and a different risk profile.** The admin console is
   used by operators reading money and error text, where a mistranslation of
   "settled" or "refunded" has a real cost. It deserves its own review pass and its
   own change discipline, not shared keys with the marketing surface.

3. **The shared part is small.** What is genuinely shareable is the *shape*: the
   `Locale` type, the `LOCALE_HTML` / `LOCALE_DATE` maps, and the storage-key
   convention. That is about 30 lines. Everything else is app-specific.

**Do not extract a shared `packages/i18n`.** It would be a monorepo restructure
attached to a copy-translation task. Keep two small independent layers and let them
converge only if a third consumer appears.

### 4.2 Should admin share tokens with the frontend?

**No, and this is already true.** Admin uses Tailwind utility classes and
`@theme inline`; the frontend uses `pf-*` semantic classes in a hand-written
stylesheet. They share nothing today, and forcing a shared token file would mean
either a Tailwind plugin or a build-time CSS variable bridge, for two applications
that are deliberately meant to look different.

The one thing worth aligning is the **contrast policy**, recorded as a comment in
each stylesheet rather than enforced by shared code. That is §3.4.

### 4.3 What to do instead of slicing

Sequenced so every commit leaves the console in one consistent language. **Each
step is shippable and consistent; there is no mixed-language state at any point.**

| # | Step | Files | Effort | Gate |
|---|------|-------|--------|------|
| 0 | Fix the contrast debt in admin, separately | `index.css` | 0.5 d | `npm run build` |
| 1 | Add the i18n layer, dark, with Chinese as the only complete locale | new: `i18n/detect.ts`, `i18n/messages.ts`, `i18n/context.tsx`, `i18n/lookup.ts`, `i18n/locales/zh.ts`; delete nothing | 1 d | `npm run build`; **zero visible change** |
| 2 | Migrate `lib/statusLabels.ts` + `lib/dramaLabels.ts` into `i18n/locales/zh/labels.ts`, keys unchanged | 2 files | 0.5 d | `tsc` clean; **zero visible change** |
| 3 | Migrate the two shadcn surfaces: `AdminLayout.tsx`, `components/ui/*` | 2 + 11 files | 0.5 d | **zero visible change** |
| 4 | Migrate the simple pages: `LoginPage`, `FinanceListPage`, `UsersPage`, `TemplatesPage`, `WorksPage`, `ProjectsPage` | 6 files, ~150 CJK lines | 1.5 d | **zero visible change** |
| 5 | Migrate the settings panels (no `vi` yet, Chinese only) | 4 files, ~150 CJK lines | 1.5 d | **zero visible change** |
| 6 | Migrate the hard ones: `DashboardPage` + `pages/dashboard/*`, `OrdersPage`, `QueuesPage`, `TaskDetailDialog`, `TaskDetailTabs` | 8 files, ~330 CJK lines | 3 d | **zero visible change** |
| 7 | Load a CJK-capable font for admin; confirm the current Chinese still looks right | `index.css` | 0.5 d | visual check |
| 8 | **Now** add `vi` and `en` locales, one page at a time, and add the language switcher | `i18n/locales/vi/*`, `en/*`, `layout/AdminLocaleSwitcher.tsx` | 4 d | operator review of every money string |
| 9 | Add the Vietnamese font | `index.html` + `index.css` | 0.5 d | tone-mark check |

**Steps 1–7 are pure refactors with no visible change.** They are individually
reviewable, individually revertable, and they cannot break a mixed-language state
because there is no second language until step 8. This is the whole point of
sequencing it this way: the expensive, risky part (translation review of money
strings) happens *after* the mechanical part, on a stable base.

**Steps 1–7 total: 7 days. Step 8: 4 days. Step 9: 0.5 days. Overall: ~11.5 days.**

### 4.4 Step 1: the layer itself

Mirror the frontend's structure so contributors find it in the same place, with the
differences that admin needs:

```
admin/src/i18n/
  detect.ts        type Locale; LOCALES; LOCALE_HTML; LOCALE_DATE; isLocale;
                   readStoredLocale; detectLocale; applyLocale
  messages.ts      messages: Record<Locale, Messages>
  context.tsx      I18nProvider, useI18n, t
  lookup.ts        nested key lookup
  locales/
    zh.ts  zh/{shell,labels,pages}.ts
    vi.ts  vi/{shell,labels,pages}.ts     (step 8)
    en.ts  en/{shell,labels,pages}.ts     (step 8)
```

**`Messages` must NOT be derived from `zh`.** The frontend's `Messages = typeof zh`
makes `zh` the source of truth for the message shape, which quietly obliges the
project to keep translating into Chinese — the opposite of the goal. See
`docs/VI_BACKLOG.md` §8, last row. Admin is the right place to get this right:
derive `Messages` from a hand-written interface and let each locale be partial
during migration.

```ts
// admin/src/i18n/messages.ts
export interface Messages {
  shell:   { appName: string; nav: Record<NavKey, string>; ... }
  labels:  { taskStatus: Record<string, string>; projectStatus: Record<string, string>; ... }
  actions: Record<string, string>
  pages:   { dashboard: {...}; orders: {...}; ... }
}
export const messages: Record<Locale, Messages> = { zh, /* vi, en in step 8 */ }
```

With an interface rather than `typeof zh`, steps 1–7 can migrate page by page and
step 8 can fill in `vi` and `en` without a single "missing key" failure. That is
what makes a 7-day refactor followed by a 4-day translation possible at all.

**Keys, not values, for anything machine-driven.** `labels.taskStatus` is keyed by
API status, so a status the backend adds tomorrow renders as the raw key rather than
breaking. Add a dev-mode warning for unknown keys — cheap, and it catches typos that
would otherwise ship as visible English fragments in a Vietnamese console.

**Storage key:** `novafilm.admin.locale`, not `printfilm.locale`. The admin console
is a different surface with a different audience; sharing the key would make a
user's browser preference silently change the operator console's language. See
`docs/OPEN_SOURCE_CHECKLIST.md` §2.9 for why the frontend key rename is its own
decision.

### 4.5 Locale set for admin

`zh`, `vi`, `en` — the same three as the frontend, for the same reason: `zh` is
retained because the data and some templates are Chinese, and the operator needs to
see the data as it is stored.

**Not** a per-user locale. The console is operated by a small known team. Put the
choice in `localStorage` and default to `zh` in step 1, then change the default to
`vi` in step 8 once `vi` is complete. A half-translated default locale is the exact
failure this plan exists to avoid.

---

## 5. What must not be translated

Identical rule to `docs/STANDARDS.md` §4.1, and the same reason.

| Category | Example | Why |
|----------|---------|-----|
| API status values | `awaiting_poll`, `frozen`, `settled`, `processing_video` | Stored in `task_runs.status`, `usage_events`, `wallet_ledger.kind`. They are the database contract |
| `wallet_ledger.kind` | `topup`, `freeze`, `unfreeze`, `settle`, `grant`, `adjust` | Financial audit trail. Never localise |
| `orders.status` / `pay_type` | `pending`, `paid`, `closed`, `alipay`, `wxpay` | Payment reconciliation |
| Model ids | `seedream-5-0-pro`, `seedance-2-5`, `kimi-k2.6` | Must match `PRESET_MODELS` in the backend |
| `system_model_channels` fields | base URLs, protocol values `openai` / `ark` / `auto`, `api_format` | Config, not copy |
| Template content | `templates.name`, `description`, `style_prefix`, `category` | Seeded data; `category` is matched literally by `CATEGORY_ORDER` in the frontend |
| IDs, URLs, env var names, code identifiers, CSS classes | `EPAY_NOTIFY_URL`, `/api/admin/users`, `page_size` | — |

The `labels.*` tables are exactly the right home for the display values of the
first five rows. That is the whole design: **keys = API values, values = display
text, and the boundary is a directory, not a convention.**

---

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A translated money string is wrong ("refunded" shown as "settled") | Medium | High — an operator misreads the ledger | Step 8 requires an explicit operator review of every string in `labels.*` and the billing pages. Do not batch-translate them |
| Migration step 6 introduces a regression in the task or finance views | Medium | Medium | Steps 1–7 are zero-visible-change refactors; the diff per step is reviewable and revertable. Run `npm run build` + a manual walk of each migrated page at every step |
| A key is renamed during migration, silently changing meaning | Low | High | Keys move verbatim; only values are localised. A rename shows up as a `-`/`+` pair on a key line in the diff, which is reviewable |
| Unknown API status added while `labels` is static | Medium | Low | Render the raw key and warn in dev mode. Already in §4.4 |
| Vietnamese is too long for table headers and buttons | High | Medium | 20–40% expansion is normal. Audit the tables with fixed-width columns (`table.tsx`) and the KPI cards in `pages/dashboard/`. Truncate with a tooltip, never clip |
| Vietnamese tone marks clip at tight line-height | Medium | Medium | The frontend has the same risk and is fixing it in `index.html` (Bunny 2). Apply the same font and the same line-height floor in admin |
| Admin diverges from the frontend's i18n implementation | Medium | Low | Accept it. They are separate applications. Keep a note in each `messages.ts` pointing at the other |
| A contributor starts piecemeal translation anyway | Medium | High | This document, plus a `docs/VI_BACKLOG.md` entry, plus the `Messages`-is-an-interface design that makes a half-translated locale obvious at build time |

---

## 7. Acceptance criteria for step 8

The point at which admin is considered localised:

- [ ] Every one of the 1,268 CJK lines is either behind `t()` or on the
      "must not be translated" list in §5, with a comment saying which
- [ ] `git grep -c "[\u4e00-\u9fff]" -- admin/src` returns only §5 lines plus the
      `zh` locale tree
- [ ] `npm run build` clean; `npm run lint` introduces no new findings
- [ ] A language switcher in the admin header, persisted, defaulting to `vi`
- [ ] `vi` and `en` both complete — no key present in `vi` and missing in `en`
- [ ] Vietnamese renders with a Latin-Extended font; tone marks do not clip in a
      table cell at the narrowest column
- [ ] `labels.*` reviewed by an operator, specifically: `taskStatus`,
      `projectStatus`, `ledgerKind`, `payType`, `pipelineMode`
- [ ] No Vietnamese string longer than its Chinese original overflows a fixed-width
      column without a tooltip
- [ ] `zh` still selectable and still complete

---

## 8. What was deliberately not done

Recorded so this is not re-opened casually.

| Not done | Why |
|----------|-----|
| Translated `statusLabels.ts` / `dramaLabels.ts` | The only reason they are not done is that doing them alone makes the console worse (§2). They are step 2 of a sequence whose first step is the layer itself |
| Added `#f2c94c` to admin | Conflicts with the neutral + forest-green system on three counts, and `#f2c94c` on white is 1.59:1 (§3) |
| Extracted a shared `packages/i18n` | Two consumers do not justify a monorepo restructure. Share the shape, not the code (§4.1) |
| Shared CSS tokens between admin and frontend | They already share nothing and are meant to look different. Share the contrast policy as a comment, not tokens (§4.2) |
| Made admin's default locale `vi` immediately | There is no `vi` bundle yet. A `vi` default with a `zh` catalogue is the exact failure mode this plan avoids |
| Fixed the `#909399` 2.97:1 contrast debt inside the i18n work | It is a pre-existing accessibility defect in 19 places, unrelated to localisation. Bundling it into an 11-day copy task makes both harder to review. Step 0, separate commit (§4.3) |
| Translated template names, descriptions, or categories shown in the admin template editor | Seeded content, and `category` is an enum matched by `CATEGORY_ORDER` in the frontend. The editor shows the DB row, so it should keep showing exactly what is stored |
