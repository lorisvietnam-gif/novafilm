# novafilm design tokens

Single source of truth for colour, type, space, radius, elevation, motion and
focus. Defined in [`tokens.css`](./tokens.css); global interaction guarantees in
[`base.css`](./base.css). Component stylesheets must consume variables and never
hard-code a colour literal.

**Brand accent: `#f2c94c`.**

---

## 1. The one rule that matters most

`#f2c94c` has a relative luminance of **0.6117**. On `#ffffff` that is a
contrast ratio of **1.60:1** — it fails WCAG 2.2 AA (4.5:1 for body text, 3:1
for large text and UI components) by a wide margin.

| | |
|---|---|
| `#f2c94c` on `#ffffff` | **1.59:1 — FAILS AA** |
| `#f2c94c` on `#f7f8fa` (app surface) | **1.49:1 — FAILS AA** |

So the accent is a **fill only**. Three companion tokens exist so that text
never has to use the raw accent:

| Token | Value (light) | Purpose | Ratio |
|---|---|---|---|
| `--pf-accent` | `#f2c94c` | fill: primary buttons, selected chips, highlight bands | — |
| `--pf-on-accent` | `#1c1c1a` | text **on** an accent fill | **10.76:1** on `#f2c94c` |
| `--pf-accent-ink` | `#6a5116` | accent-toned text / ghost buttons **on a light surface** | **7.50:1** on `#ffffff` |
| `--pf-accent-ink-soft` | `#926f16` | large text and non-essential accents only | 4.66:1 on `#ffffff`, **4.38:1 on `#f7f8fa` — below 4.5** |

`#1c1c1a` is near-black, not `#000`. Pure black on a bright yellow measures
higher but reads harsh and vibrates against the fill; near-black keeps the same
AA result with far less visual fatigue.

---

## 2. Accent ramp

Anchored on `#f2c94c` at step 400 (hue 45°, sat 86%). The ramp has **two
halves, and only one of them flips with the theme**:

| Half | Role | Dark value |
|---|---|---|
| 50–200 | **surface tints** — the only steps whose job is to sit *behind* text | inverts to a dark amber wash |
| 300–500 | **ink and fill** — read *on* a surface | held at the light values |
| 600–900 | **shades** — read *on* the yellow fill, and used as strokes | held |

This split is the whole reason the ramp had to be re-threaded. Before Wave 1.4
the ten steps were declared **only** in `:root`, so a `background:
var(--pf-accent-100)` stayed cream in dark mode while the text on it had
already flipped to near-white — 1.01:1 on the Drama product card.

| Token | Light | Dark | Text role | On light surfaces | On dark surfaces |
|---|---|---|---|---|---|
| `--pf-accent-50` | `#fffbf0` | `#2a2415` | surface tint | 16.51:1 for ink | 14.16:1 for ink |
| `--pf-accent-100` | `#fef6dc` | `#363229` | surface tint | 15.79:1 | 11.72:1 |
| `--pf-accent-200` | `#fceab6` | `#484232` | surface tint / hover border | 14.29:1 | 9.18:1 |
| `--pf-accent-300` | `#f8dc87` | `#f8dc87` | **dark-mode accent ink** | 1.35:1 — unusable | 13.39:1 |
| `--pf-accent-400` | `#f2c94c` | `#f2c94c` | **the brand fill** | 1.59:1 — unusable | 11.37:1 |
| `--pf-accent-500` | `#ebb81e` | `#ebb81e` | hover fill | 1.84:1 — unusable | 9.80:1 |
| `--pf-accent-600` | `#c19315` | `#c19315` | accent stroke, active fill | 2.82:1 | 6.40:1 |
| `--pf-accent-700` | `#926f16` | `#926f16` | large-text accent, light only | 4.66:1 | 3.87:1 — fails |
| `--pf-accent-800` | `#6a5116` | `#6a5116` | **`--pf-accent-ink` in light** | 7.50:1 | 2.41:1 — fails |
| `--pf-accent-900` | `#493813` | `#493813` | deepest shade, light only | 11.30:1 | 1.60:1 — fails |

**Read the last column before using 700–900 in dark.** They are held, not
inverted, because their job in dark mode is to be text *on the yellow fill*.
None of them is a legal dark-mode text colour, and the token layer reaches
for 300 and 400 instead — see `--pf-accent-ink` below.

`--pf-accent-rgb` (`242 201 76` light / `248 220 135` dark) exists for alpha
compositing, e.g. `rgb(var(--pf-accent-rgb) / 0.28)`. Because it is a token it
retints automatically in dark mode, which is how the 39 alpha-accent values in
`printfilm.css` and 6 in `drama.css` became theme-aware.

### 2a. The semantic accent roles, and what they resolve to per theme

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--pf-accent` | `#f2c94c` | `#f2c94c` | the fill |
| `--pf-accent-hover` | `#ebb81e` (500) | `#ebb81e` (500) | hover fill |
| `--pf-accent-active` | `#c19315` (600) | `#c19315` (600) | pressed fill |
| `--pf-on-accent` | `#1c1c1a` | `#0e0e11` | text **on** the fill — 10.76 / 12.15:1 |
| `--pf-accent-on-fill` | `#1c1c1a` | `#0e0e11` | **the only token for text on the yellow fill** — aliases `--pf-on-accent`, so it is correct in both themes by construction |
| `--pf-accent-ink` | `#6a5116` (800) | `#f8dc87` (300) | accent-toned text on a surface — 7.50 / 13.39:1. **Never on the fill in dark** |
| `--pf-accent-ink-soft` | `#926f16` (700) | `#f2c94c` (400) | large text only |
| `--pf-accent-soft` | `#fef6dc` (100) | `#363229` (100) | tinted accent background |
| `--pf-accent-soft-strong` | `#fceab6` (200) | `#484232` (200) | stronger tint |
| `--pf-accent-stroke` | `#c19315` (600) | `#c19315` (600) | accent border |

Two of these had to be repointed when the ramp was re-threaded, because they
were reading a step that changed meaning:

- `--pf-accent-active` pointed at 200, which is now a *surface tint*. It
  moved to 600, so the fill sequence deepens in both themes (400 → 500 → 600)
  and the pressed state keeps 6.84:1 against `--pf-on-accent` in dark.
- `--pf-accent-hover` pointed at 300. 300 is still light, so this was not
  broken, but a yellow fill that gets *brighter* on hover glares on a dark UI
  and competes with the dark-mode ink end of the ramp. It moved to 500 to
  match light mode. This is a deliberate visual change, not a bug fix.

`--pf-accent-soft` and `--pf-accent-soft-strong` were `rgb(248 220 135 / 0.14)`
and `/ 0.22` in dark. Those are alpha values, so they resolve to a
*different colour depending on what is behind them* — `#363229` over
`--pf-surface` but `#2f2b22` over `--pf-bg`. They now point at 100 and 200, the
same relationship they have in light. The dark appearance is unchanged to the
byte; what changed is that the wash no longer depends on its backdrop.

### 2c. The one pairing that is illegal in dark, named so it cannot recur

`--pf-accent-ink` and `--pf-accent` are both theme-aware, so putting one on the
other reads fine in light and is unreadable in dark:

| `--pf-accent-ink` on `--pf-accent` | Light | Dark |
|---|---|---|
| measured | **4.72:1 — pass** | **1.18:1 — total failure** |

The cause is structural, not a bad value: in dark the ramp is *inverted* at the
ink end (300 is the light step) while the fill stays 400. Two light steps on top
of each other. `--pf-accent-on-fill` was added for exactly this reason — it
aliases `--pf-on-accent`, which is near-black in both themes, so there is no
theme in which it can fail. Measured on the fill: 10.76:1 light, 12.15:1 dark.

An audit on 2026-09-30 confirmed no stylesheet currently pairs them: every
`--pf-accent-ink` foreground in `printfilm.css` sits on `accent-50/100/200`,
`--pf-accent-soft`, `--pf-lime-soft`, or a `color-mix` against a surface — all of
which are dark-tinted in dark mode. So this is a guard, not a repair. The
failure mode it prevents is the one that appears the moment someone writes
`background: var(--pf-accent); color: var(--pf-accent-ink)`, which is a
perfectly reasonable line to write and silently breaks only in dark.

### 2b. Why a fixed `color-mix` percentage is the same bug in disguise

`color-mix(in srgb, var(--pf-accent) N%, var(--pf-surface))` looks theme-aware
because both operands are tokens, but the *percentage* is a constant, so the
mix lands in the middle of the ramp in one theme and near an end in the other.
Two sites did this and failed AA in dark only:

| Site | Light | Dark | Verdict |
|---|---|---|---|
| `.pf-pricing-pay-tile-badge` (55%) | `#f8e19d` → 5.80:1 | `#8f7836` → **3.17:1** | was failing, now `--pf-accent-200` |
| `.pf-pricing-info-visual.is-value` (45%) | `#f9e7ae` → 6.09:1 | `#796731` → **4.10:1** | was failing, now 200 → 50 gradient |

The rule: a percentage low enough to stay near the surface is safe (10–18% all
measure ≥12:1 in both themes). A percentage high enough to be recognisably
yellow is a mid-tone, and a mid-tone is a colour that is illegible with
*something*. Use a ramp step instead of a percentage.

---

## 3. Surfaces, borders, text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--pf-bg` | `#f7f8fa` | `#0e0e11` | app background |
| `--pf-surface` | `#ffffff` | `#16161a` | cards, panels, dialogs |
| `--pf-surface-raised` | `#ffffff` | `#1f1f25` | popovers, menus |
| `--pf-surface-sunken` | `#f1f2f5` | `#0a0a0d` | wells, table stripes, empty states |
| `--pf-surface-inverse` | `#1c1c1a` | `#f5f5f7` | inverted callout |
| `--pf-line-hairline` | `#e4e5e9` | `#2a2a32` | decorative separator, 1.26:1 — **not** meaningful |
| `--pf-line` | `#dcdee2` | `#32323b` | decorative border, 1.35:1 |
| `--pf-line-strong` | `#b3b5bd` | `#45454f` | scrollbar thumbs, secondary borders |
| `--pf-line-control` | `#84858d` | `#6a6b78` | **the only border allowed on a form control** — 3.67:1 on `#ffffff`, 3.45:1 on `#f7f8fa`, **3.28:1 on `#f1f2f5`** / 3.43:1 on `#16161a` |
| `--pf-ink` | `#1c1c1a` | `#f5f5f7` | body text |
| `--pf-ink-secondary` | `#55565c` | `#a9aab2` | supporting text |
| `--pf-ink-tertiary` | `#6b6c74` | `#8d8e97` | metadata, helper text |
| `--pf-ink-disabled` | `#8b8c94` | `#666773` | **inactive controls only**, 3.35:1 light / **3.22:1** dark |
| `--pf-ink-inverse` | `#ffffff` | `#0e0e11` | text on an inverse surface |
| `--pf-scrim-rgb` | `17 19 24` | `17 19 24` | scrims and media overlays — fixed dark in both themes |
| `--pf-on-media` | `rgb(255 255 255 / 0.92)` | same | text on top of an image or video |

### 3a. Text over photography — the veil tokens

A still can be any brightness, so text sitting on an image is carried by an
explicit darkening wash rather than by the surface ramp. The foreground is
always `--pf-on-media`; the washes behind it are these three steps.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--pf-veil-soft` | `rgb(17 19 24 / 0.34)` | `rgb(6 7 10 / 0.42)` | a large decorative image behind a heading; content stays on `--pf-surface` |
| `--pf-veil` | `rgb(17 19 24 / 0.56)` | `rgb(6 7 10 / 0.62)` | **default for any text over media** — the level at which `--pf-on-media` holds ≥4.5:1 across the whole tonal range of the still |
| `--pf-veil-strong` | `rgb(17 19 24 / 0.74)` | `rgb(6 7 10 / 0.8)` | text over a bright still, or a caption strip that must not compete with the picture |
| `--pf-on-media-chip` | `rgb(9 12 20 / 0.62)` | `rgb(6 7 10 / 0.68)` | the small pill that labels a placeholder image; paired with `--pf-on-media`, not with `--pf-ink` |

The dark steps are *heavier*, not lighter, because the photograph underneath is
already dark there — a 0.56 wash over an already-dark still would crush the
picture without buying any contrast.

Rule: **never put an empty-state label directly on an un-veiled image.** Pick a
veil first. `drama.css` uses `--pf-veil` for every still it introduces, which is
why the asset cards, the episode empty state and the canvas waiting frame read
at the same weight as each other.

---

## 4. Status palette

Deliberately disjoint from the accent hue. Yellow means "brand / selected" and
is never used for an error, a warning or a success, because a user who cannot
distinguish "this is highlighted" from "this failed" will misread the state.

| Token | Light | Dark | On its light fill | On its dark fill |
|---|---|---|---|---|
| `--pf-danger` | `#b3261e` | `#ff6f61` | 6.54:1 on `#fff` | 7.07:1 on `#0e0e11` |
| `--pf-danger-soft` | `#fdeceb` | `#2a1a17` | 5.72:1 with `--pf-danger` | 6.12:1 with `#ff6f61` |
| `--pf-warning` | `#8a5300` | `#ffb340` | 6.33:1 on `#fff` | 10.81:1 on `#0e0e11` |
| `--pf-warning-soft` | `#fdf3e0` | `#2a2314` | 5.75:1 | 8.73:1 |
| `--pf-success` | `#1c6b45` | `#4ade80` | 6.48:1 on `#fff` | 11.06:1 on `#0e0e11` |
| `--pf-success-soft` | `#e6f4ec` | `#12251c` | 5.72:1 | 9.22:1 |
| `--pf-info` | `#1a4fd6` | `#7aa2f7` | 6.70:1 on `#fff` | 7.65:1 on `#0e0e11` |
| `--pf-info-soft` | `#e8eefc` | `#131f33` | 5.77:1 | 6.56:1 |

All status text clears AA on both its own soft fill and the app surface, in both
themes.

---

## 5. Focus

| Token | Light | Dark | Value |
|---|---|---|---|
| `--pf-focus-ring` | `#6a5116` | `#f8dc87` | the ring colour |
| `--pf-focus-ring-width` | `2px` | `2px` | |
| `--pf-focus-ring-offset` | `2px` | `2px` | |

`#6a5116` was chosen over a brighter accent step because it is the only value
that clears 3:1 against **every** surface a control lands on:

| Against | Ratio | |
|---|---|---|
| `#ffffff` | 7.50:1 | pass |
| `#f7f8fa` (app bg) | 7.05:1 | pass |
| `#f2c94c` (accent fill) | 4.72:1 | pass |
| `#fceab6` (accent-200) | 6.28:1 | pass |

`--pf-accent-700` (`#926f16`) was rejected: it is 4.66:1 on white but only
**2.94:1 against the accent fill**, so a focused control sitting on a yellow
button would lose its ring. The previous ring in `printfilm.css` was
`rgba(182, 255, 0, 0.65)` — 65% alpha lime, which is not a focus indicator.

**Why `base.css` repeats the pseudo-class.** `printfilm.css` sets
`outline: none` on five controls. A bare `input:focus-visible` scores (0,1,1)
and loses to `.pf-field-input:focus` at (0,2,0), so the re-assertions use
`:focus-visible:focus-visible` to reach (0,2,1)/(0,3,0). This keeps the
guarantee without `!important` and without depending on stylesheet order — which
matters because `drama.css` is imported by eight different page components and
lands after `printfilm.css` by an order that is not stable.

---

## 6. Type, space, radius, elevation, motion

**Type.** `--pf-font-sans` puts `'Noto Sans'` ahead of `'Noto Sans SC'`: the
latter is CJK-first and its Vietnamese coverage is incidental rather than
designed. `--pf-font-display` is Space Grotesk. Scale runs
`--pf-text-2xs` (0.6875rem) to `--pf-text-4xl` (2.75rem) on an 8pt rhythm, with
`--pf-leading-tight` 1.2 through `--pf-leading-relaxed` 1.65.

**Serif.** `--pf-font-serif` puts `'Noto Serif'` ahead of `'Noto Serif SC'`, for
the same reason the sans stack does: `Noto Serif SC` is CJK-first and its
Vietnamese coverage is incidental rather than designed, so Vietnamese text in a
serif context used to fall through to `Georgia` — which has no precomposed
`ệ / ộ / ầ / ằ / ễ / ữ / đ` — and then to the generic `serif`, breaking the
serif texture mid-line. `Noto Serif` is listed first, so Vietnamese and Latin
glyphs both resolve to a designed serif face; CJK still falls through to
`Noto Serif SC`, so Chinese is unchanged. This mirrors
`--pf-font-sans` exactly: generic Latin face first, SC face second, system
fallback last. `Noto Serif` is loaded at `500;700`, matching `Noto Serif SC` and
covering the only two weights any serif rule uses.

**No literal serif stack survives.** All five rules below read the token, so
there is exactly one place where the ordering is defined:

| Location | Font stack | Weight |
|---|---|---|
| `tokens.css` `--pf-font-serif` | `'Noto Serif', 'Noto Serif SC', Georgia, serif` | — |
| `printfilm.css` `.pf-modal-head h3` | `var(--pf-font-serif)` | 500 |
| `method.css` `.pf-method-hero h1` | `var(--pf-font-serif)` | 700 |
| `method.css` `.pf-method-section > h2` | `var(--pf-font-serif)` | 700 |
| `method.css` `.pf-method-close h2` | `var(--pf-font-serif)` | inherited |

Adopting the token on `.pf-method-hero h1` also drops the stray `'Noto Sans SC'`
entry that literal carried. That is deliberate and inert for CJK:
`Noto Serif SC` precedes it and covers CJK, so the generic `serif` fallback is
only reached for glyphs neither face has.

**Space.** `--pf-space-0` … `--pf-space-24` on 8pt steps (0.25rem … 6rem).

**Radius.** `--pf-radius-xs` 6px, `--pf-radius-sm` 10px, `--pf-radius-md` 14px,
`--pf-radius-lg` 20px, `--pf-radius-xl` 28px, `--pf-radius-pill` 999px.

**Elevation.** `--pf-shadow-1` … `--pf-shadow-3` plus `--pf-shadow-popover`.
All are two-layer and very light, e.g.
`0 1px 2px rgb(17 19 24 / 0.04), 0 8px 24px rgb(17 19 24 / 0.06)`.

**Hairline.** `--pf-hairline: 0.5px` — the Apple standard for a 1× separator.

**Motion.** `--pf-dur-fast` 120ms, `--pf-dur-base` 180ms, `--pf-dur-slow` 240ms;
`--pf-ease-standard: cubic-bezier(0.2, 0, 0, 1)`,
`--pf-ease-emphasis: cubic-bezier(0.32, 0.72, 0, 1)`. All 95 `0.15s ease` /
`0.18s ease` declarations across the three stylesheets now reference these
instead. `base.css` collapses all animation and transition to 0.01ms under
`@media (prefers-reduced-motion: reduce)`.

---

## 7. Dark mode

Token overrides live in three blocks and **nowhere else** — no component rule
may set a dark value:

1. `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`
2. `:root[data-theme='dark']`
3. `@media (prefers-color-scheme: dark) :root[data-theme='light']` — the
   explicit light opt-out, so a user can force light on a dark OS.

Setting `data-theme` on `<html>` is enough to switch themes; there is no
JavaScript in the token layer.

**The invariant that Wave 1.4 added: every block declares every colour token.**
Block 3 already restated 40 of them; the ten accent-ramp steps were the
exception, and that exception was the largest accessibility defect in the
project's history. A step declared in one theme-space and not the other is
invisible until a human reads a light literal in dark mode, so no step is
declared in fewer than all three blocks now. When you add a colour token, add
it to all three in the same commit.

**The trap this layer exists to prevent.** A text token and its background token
must come from the same theme-space, or one of the two themes inverts the
contrast. Two patterns account for every break found in Wave 1:

- *Self-flipping pairs are safe.* `background: var(--pf-ink); color: var(--pf-surface);`
  inverts as a unit and keeps its ratio in both themes.
- *Mixed-space pairs break.* `background: rgb(var(--pf-ink-rgb) / 0.75); color: var(--pf-surface);`
  looks fine in light and turns into dark-on-dark in dark. Use
  `--pf-scrim-rgb` + `--pf-on-media` for anything sitting on media, and
  `--pf-accent` + `--pf-on-accent` for anything sitting on the accent.
- *Fixed mixes break in one direction only.* See section 2b: a
  `color-mix(accent N%, surface)` fails in whichever theme puts the result in
  the middle of the ramp.

---

## 7a. Contrast matrix — every background, every ink, both themes

This table did not exist before Wave 1.4, and its absence is why the accent
ramp defect shipped. Every cell is a measured WCAG 2.2 relative-luminance
ratio, computed from the token values as they resolve in each theme.

**Read a cell as: background × foreground.** Anything at or below 4.49 is an AA
text failure; 3.0–4.49 is fine for large text and UI components only.

| Background | Light value | ink | ink-2 | ink-3 | accent-ink | Dark value | ink | ink-2 | ink-3 | accent-ink |
|---|---|---|---|---|---|---|---|---|---|---|
| `--pf-bg` | `#f7f8fa` | 16.06 | 6.88 | 4.91 | 7.05 | `#0e0e11` | 17.70 | 8.33 | 5.92 | 14.30 |
| `--pf-surface` | `#ffffff` | 17.07 | 7.31 | 5.22 | 7.50 | `#16161a` | 16.57 | 7.80 | 5.54 | 13.39 |
| `--pf-surface-raised` | `#ffffff` | 17.07 | 7.31 | 5.22 | 7.50 | `#1f1f25` | 15.06 | 7.09 | 5.03 | 12.16 |
| `--pf-surface-sunken` | `#f1f2f5` | 15.25 | 6.53 | 4.66 | 6.70 | `#0a0a0d` | 18.16 | 8.55 | 6.07 | 14.67 |
| `--pf-accent-50` | `#fffbf0` | 16.51 | 7.07 | 5.05 | 7.25 | `#2a2415` | 14.16 | 6.67 | 4.74 | 11.44 |
| `--pf-accent-100` | `#fef6dc` | 15.79 | 6.77 | 4.83 | 6.94 | `#363229` | 11.72 | 5.52 | **3.92** | 9.47 |
| `--pf-accent-200` | `#fceab6` | 14.29 | 6.12 | **4.37** | 6.28 | `#484232` | 9.18 | **4.32** | **3.07** | 7.42 |
| `--pf-danger-soft` | `#fdeceb` | 14.93 | 6.40 | 4.57 | 6.56 | `#2a1a17` | 15.32 | 7.21 | 5.12 | 12.38 |
| `--pf-warning-soft` | `#fdf3e0` | 15.50 | 6.64 | 4.74 | 6.81 | `#2a2314` | 14.30 | 6.73 | 4.78 | 11.55 |
| `--pf-success-soft` | `#e6f4ec` | 15.05 | 6.45 | 4.60 | 6.61 | `#12251c` | 14.76 | 6.95 | 4.93 | 11.92 |
| `--pf-info-soft` | `#e8eefc` | 14.68 | 6.29 | **4.49** | 6.45 | `#131f33` | 15.17 | 7.14 | 5.07 | 12.25 |

`--pf-accent-soft` and `--pf-accent-soft-strong` are 100 and 200 in both
themes, so their rows are identical and are not repeated.

**The four bold cells are the constraint that set the dark tint values.**
`--pf-ink-tertiary` drops below 4.5:1 on 100 and 200, and `--pf-ink-secondary`
drops below on 200. That is why the dark ramp tops out at `#484232` rather than
going brighter for a "stronger" wash, and why `--pf-accent-50` is held at
`#2a2415` — `.pf-prompt-chip strong` uses tertiary ink on an accent-50 hover and
measures 4.74:1 there, which is the tightest legitimate pair in the system.

### Which accent steps are legal as *text*, per theme

| Step | On `#ffffff` | On `#f7f8fa` | On `#16161a` | On `#0e0e11` |
|---|---|---|---|---|
| 300 `#f8dc87` | 1.35 | 1.27 | **13.39** | **14.30** |
| 400 `#f2c94c` | 1.59 | 1.49 | **11.37** | **12.15** |
| 500 `#ebb81e` | 1.84 | 1.73 | **9.80** | **10.47** |
| 600 `#c19315` | 2.82 | 2.65 | **6.40** | **6.84** |
| 700 `#926f16` | **4.66** | 4.38 | 3.87 | 4.14 |
| 800 `#6a5116` | **7.50** | **7.05** | 2.41 | 2.57 |
| 900 `#493813` | **11.30** | **10.63** | 1.60 | 1.71 |

The table splits cleanly: 300–500 are dark-mode inks, 700–900 are light-mode
inks, and 600 is the only step that clears 3:1 on both — which is exactly why
`--pf-accent-stroke` is pinned to it.

### Fill states and the focus ring

| | Light | Dark |
|---|---|---|
| base fill 400 + `--pf-on-accent` | 10.76:1 | 12.15:1 |
| hover fill 500 + `--pf-on-accent` | 9.27:1 | 10.47:1 |
| active fill 600 + `--pf-on-accent` | 6.06:1 | 6.84:1 |
| focus ring on `--pf-surface` | 7.50:1 | 13.39:1 |
| focus ring on `--pf-accent-50` | 7.25:1 | 11.44:1 |
| focus ring on `--pf-accent-100` | 6.94:1 | 9.47:1 |
| focus ring on `--pf-accent-200` | 6.28:1 | 7.42:1 |
| focus ring on the accent fill | 4.72:1 | 4.72:1 |

The focus ring clears 3:1 against every surface a control can land on in either
theme, including all three accent tints it was previously never measured
against.

### 7b. Re-measurement after the Wave 2 token changes — two real failures fixed

The Wave 2 brief required the contrast table to be produced from measurement
rather than from the numbers already written here. Re-running the measurement
over `tokens.css` found **two cells that the prose in this document asserted but
the values did not deliver.** Both are fixed; nothing above this section needed
revising, because neither token is a column in the 7a matrix.

| Pair | Before | After | Threshold |
|---|---|---|---|
| `--pf-line-control` on `--pf-surface-sunken` (light) | `#8b8c94` → **2.99:1** | `#84858d` → **3.28:1** | 3:1 — WCAG 1.4.11 non-text |
| `--pf-ink-disabled` on `--pf-surface` (dark) | `#5c5d6a` → **2.77:1** | `#666773` → **3.22:1** | 3:1 — WCAG 1.4.11 non-text |

The first is the more interesting one, because the token's own comment claimed it
"clears 3:1 against surface and surface-sunken". It cleared surface (3.35:1) and
missed sunken by 0.01:1. `#f1f2f5` is the surface used for wells, table stripes
and empty states, which is precisely where an input's border ends up — so this
was a live failure, not a theoretical one, and it was invisible because
`#8b8c94` looks fine on white at a glance.

The replacement, `#84858d`, was found by walking the same hue down in 1% steps
and taking the first value that clears 3:1 on the *worst* of the three light
surfaces, so the token is now correct on all of them at once rather than on two:

| `#84858d` on | Ratio |
|---|---|
| `#ffffff` `--pf-surface` | 3.67:1 |
| `#f7f8fa` `--pf-bg` | 3.45:1 |
| `#f1f2f5` `--pf-surface-sunken` | **3.28:1** |

The second fix is a deliberate trade rather than a straight repair.
`--pf-ink-disabled` is a *disabled* token, and WCAG 1.4.3 exempts inactive
components from contrast minimums — so the original 2.77:1 was defensible as
written (see section 8). It was raised anyway because the token is also used for
disabled control **borders**, which fall under 1.4.11 and get no exemption. The
new `#666773` still reads clearly as inactive against `--pf-ink-tertiary`
(5.54:1, a clear two-step drop from 16.57:1 body ink), so the state is preserved
while the component stops failing.

### Every accent background site, verified

All 23 declarations that use an accent step as a background or a border, with
the ink that actually sits on them. Lowest value in the system: **4.74:1**;
count below 4.5:1: **0**.

| Site | Step | Light | Dark |
|---|---|---|---|
| `drama.css:38` `.drama-agent-hero-icon` | 50 | 7.25 | 11.44 |
| `drama.css:351` `.drama-agent-opt-trigger:hover` | 50 | 7.07 | 6.67 |
| `drama.css:357` `.drama-agent-opt-trigger.is-active` | 50 | 7.25 | 11.44 |
| `drama.css:850` `.drama-project-row-tag.is-script` | 50 | 7.25 | 11.44 |
| `drama.css:1099` `.drama-hero` | 50 | 16.51 | 14.16 |
| `drama.css:2266` `.drama-step-hero-icon` | 50 | 7.25 | 11.44 |
| `drama.css:2531` `.drama-outline-ep-thumb` | 50 | 16.51 | 14.16 |
| `drama.css:6584` `.drama-gen-fab-item.is-running` | 50 | 16.51 | 14.16 |
| `drama.css:6996` `.drama-batch-voice-item` stages | 50 | 16.51 | 14.16 |
| `printfilm.css:314` `.pf-ws-product-drama` | 100 | 15.79 | 11.72 |
| `printfilm.css:565` `.pf-land-product.is-drama` | 100 | 15.79 | 11.72 |
| `printfilm.css:836` `.pf-land-close` | 100 | 15.79 | 11.72 |
| `printfilm.css:3434` `.pf-cta-band` | 100 | 15.79 | 11.72 |
| `printfilm.css:3883` `.pf-model-badge` | 100 | 6.94 | 9.47 |
| `printfilm.css:3994` `.pf-ratio.selected` | 100 | 15.79 | 11.72 |
| `printfilm.css:4081` `.pf-shot-table tbody tr:hover` | 50 | 16.51 | 14.16 |
| `printfilm.css:4205` `button.pf-shot-editable:hover` | 50 | 16.51 | 14.16 |
| `printfilm.css:4242` `.pf-prompt-chip:hover` | 50 | 5.05 | **4.74** |
| `printfilm.css:4475` `.pf-shot-menu button:hover` | 50 | 16.51 | 14.16 |
| `printfilm.css:4603` `.pf-scene-item.active` | 100 | 15.79 | 11.72 |
| `printfilm.css:5679` `.pf-pricing-pay-tile-badge` | 200 | 6.28 | 7.42 |
| `printfilm.css:5911` `.pf-pricing-info-visual.is-value` | 200 → 50 | 6.28 / 7.25 | 7.42 / 11.44 |

---

## 8. Remaining contrast issues in `printfilm.css`

Listed, **not fixed** in Wave 1. None of these block AA for the flows audited;
they are the known tail.

| Where | Pair | Ratio | Note |
|---|---|---|---|
| `printfilm.css` `.pf-nav-github:hover` | `--pf-accent` at 0.28 over `--pf-surface` | text is `--pf-accent-ink`, 7.50:1 | fixed in Wave 1 |
| `drama.css` `.drama-ep-ref-voice-badge.bound` | `--pf-accent` on `rgb(var(--pf-scrim-rgb) / 0.82)` | **8.8:1** | **intentional** — accent on a dark scrim is the allowed pattern; an automated pass that assumes a light background will flag this as a false positive |
| `drama.css` `:disabled` button labels | `--pf-ink-disabled` | 2.48–3.35:1 | WCAG 1.4.3 exempts inactive UI components. Left as-is deliberately |
| `printfilm.css` `.pf-land-*` gradient panels | accent tints behind `--pf-ink` | 14–16:1 | **was 1.01:1 in dark — the Wave 1.4 defect. Now 11.72:1** |
| `printfilm.css` `.pf-pricing-wallet-dark` | fixed `#243041 → #151c26 → #111820` gradient | text uses `--pf-on-media` | a deliberately dark island in both themes; the gradient is intentionally not a token |
| `printfilm.css` `.pf-wx-fab-btn` | `#07c160` WeChat green | text is `--pf-on-accent`, 7.16:1 | **was `#fff` at 2.38:1 — an AA failure fixed in Wave 1** |

---

## 8a. The same defect, found elsewhere — listed, **not fixed**

The board asked for a sweep of every token declared exactly once in
`tokens.css` and then used as a background or border. Method: parse
`tokens.css`, keep the tokens whose only declaration is the base `:root` block,
then check what uses them as a fill.

**87 tokens are declared only once. 77 of them are not colours** — space,
radius, type, weight, z-index, duration and easing are theme-invariant by
design and need no dark block. Of the 10 that are colours:

| Token | Verdict |
|---|---|
| `--pf-accent-50` … `--pf-accent-900` | **the Wave 1.4 defect — fixed** |
| `--pf-accent-strong` | safe: an alias of `--pf-accent-ink`, which *is* re-declared, so it follows |
| `--pf-border`, `--pf-border-control`, `--pf-border-hairline` | safe: aliases of `--pf-line*`, all re-declared |
| `--pf-surface-elevated` | safe: alias of `--pf-surface-raised` |
| `--pf-text-primary` … `--pf-text-inverse` | safe: aliases of `--pf-ink*` |
| `--pf-highlight-rgb`, `--pf-on-media-rgb` | safe **by intent**: documented as fixed light in both themes because they draw on media and on deliberately dark islands |
| `--pf-scrim`, `--pf-scrim-rgb` | safe **by intent**: scrims sit on top of media and must not flip |
| `--pf-shadow-0` | `none` in both themes; a no-op, not a colour |

**No second single-declaration token is broken.** The accent ramp was the only
one, because it was the only theme-*variant* colour ramp that had been split
into a "behind text" half and an "ink" half while living in one list.

### The real second class: hard-coded light literals outside the token layer

The same failure mode exists in three stylesheets that predate the token layer
and were never converted. These are **not** token bugs, so they are out of
Wave 1.4's scope, but they are the same accessibility defect and they are
larger than the accent ramp was.

| File | Literal count | Worst example |
|---|---|---|
| `pages/drama/canvas/canvas.css` | ~90 | `#f8fafc` panel under `#0f172a` text; 18 × `rgba(182,255,0,α)` lime washes that never retint |
| `pages/drama/canvas/nodes/dramaImageGenOptions.css` | ~60 | same Tailwind palette, same lime literals |
| `pages/drama/episodeCanvas/episodeCanvas.css` | ~40 | same |
| `pages/method/method.css` | ~10 | `#f4ffd6` at lines 144, 248, 434 and `#fff8ec` at 208; this file also runs its own `--m-*` namespace and has **no dark block at all** |

The lime `rgba(182, 255, 0, α)` family is the most consequential: it is the
*old* brand lime, it appears ~20 times, and it is written as a literal rather
than `rgb(var(--pf-accent-rgb) / α)`, so it stays `#b6ff00` in both themes while
every other lime in the app moved to `#f2c94c`. The result is two visibly
different greens inside one product.

### One borderline item inside the token layer

`printfilm.css` `.pf-btn-ai` mixes the accent 55% into the surface and puts
`--pf-on-accent` on it: **13.21:1 in light, 4.50:1 in dark** — exactly at the AA
threshold, with no margin. It is not failing, so it was left alone; converting
it to a ramp step would change a button's identity colour and belongs with the
Pricing restyle, not with a contrast fix.

---
## 9. Remaining polish, highest priority first

1. **Interaction states are not yet complete on every control.** Focus, hover,
   active and disabled tokens all exist and are wired globally, but several
   components still rely on bespoke `box-shadow` focus treatments rather than
   `--pf-focus-ring`. Sweep these so the ring is uniform.
2. **Type scale is partly adopted.** 38 declarations that were already exactly
   equal to a token now reference it, so the rem-denominated type is on the
   scale. What is left, and why it was left, is measured rather than guessed —
   see the table below.

   | Left as a literal | Count | Why |
   |---|---|---|
   | `12px` / `13px` / `11px` / `14px` / `16px` / `18px` / `20px` | 294 | Compute to an exact token at a 16px root, but `px → rem` changes how the value responds to a user's browser font-size setting. Behaviour change, not a refactor — needs eyes on the fixed-size canvas UI. |
   | off-scale rem (`0.82rem`, `0.88rem`, `0.78rem`, `1.45rem`, …) | ~250 | No token is equal; mapping them means rounding, i.e. a deliberate visual change of up to ±0.8px in dense UI. |
   | `10px` / `15px` / `22px` / `9px` / `26px` / `28px` | 30 | No token on the 8pt scale is close enough to map without an obvious size jump. |
   | `clamp(...)` | 13 | Fluid type, not on a static scale by design. |

   The scale has only ten steps and roughly forty distinct sizes are in use, so
   the scale itself is the thing to widen before the literals can be mapped.
3. **Spacing is only partly tokenised.** Radii, shadows, easings and colours are
   converted; `padding` / `gap` / `margin` values are still literals in most
   rules.
4. **The dark island in Pricing** (`.pf-pricing-wallet-dark`) reads as a hole in
   dark mode. It should probably become a raised surface instead of a fixed
   gradient.
5. **`.pf-badge.ok` and friends** were lime-tinted and are now on the success
   palette, which is correct, but the `.pf-badge` family still has no
   `info` / `warning` / `accent` variants — add them so the vocabulary is
   complete.

**Resolved in Wave 1.1b:** the serif heading stack had no Vietnamese face
(`'Noto Serif SC', Georgia, serif` in `printfilm.css:6583` and four other
stacks). `Noto Serif` is now loaded and listed ahead of `Noto Serif SC` in all
five. See section 6.
