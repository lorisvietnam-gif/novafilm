# novafilm design tokens

Single source of truth for colour, type, space, radius, elevation, motion and
focus. Defined in [`tokens.css`](./tokens.css); global interaction guarantees in
[`base.css`](./base.css). Component stylesheets must consume variables and never
hard-code a colour literal.

**Every ratio in this document is measured, not estimated.** Each one is a WCAG
2.2 relative-luminance computation over the token values as they resolve in that
theme, including alpha compositing where a colour sits on a photograph or a
translucent surface. Where a figure was used to make a decision, the sweep it
came from is included, so the decision can be re-derived rather than trusted.

- Image placement, licences and loading: [`../../../../docs/IMAGE_MANIFEST.md`](../../../../docs/IMAGE_MANIFEST.md)

**Brand accent: `#f2c94c`.**

---

## 1. The one rule that matters most

`#f2c94c` has a relative luminance of **0.6117**. On `#ffffff` that is a
contrast ratio of **1.60:1** — it fails WCAG 2.2 AA (4.5:1 for body text, 3:1 for
large text and UI components) by a wide margin.

So the accent is a **fill only**. Four companion tokens exist so that text never
has to use the raw accent:

| Token | Light | Dark | Purpose | Ratio |
|---|---|---|---|---|
| `--pf-accent` | `#f2c94c` | `#f2c94c` | fill: primary buttons, selected chips, highlight bands | — |
| `--pf-on-accent` | `#1c1c1a` | `#0e0e11` | text **on** an accent fill | **10.76:1** / **12.15:1** |
| `--pf-accent-ink` | `#6a5116` (800) | `#f8dc87` (300) | accent-toned text on a surface | **7.50:1** / **13.39:1** |
| `--pf-accent-ink-soft` | `#926f16` (700) | `#f2c94c` (400) | large text and non-essential accents only | 4.66:1 / 9.80:1 |

`#1c1c1a` is near-black, not `#000`. Pure black on a bright yellow measures
higher but reads harsh and vibrates against the fill; near-black keeps the AA
result with far less visual fatigue.

### 1a. The focus ring on an accent fill — a defect this pass found

The dark-mode focus ring is `--pf-accent-300` `#f8dc87`. The dark-mode accent
fill is `--pf-accent-400` `#f2c94c`. Those are two steps apart on the same ramp,
and the ratio is **1.18:1**. A keyboard user tabbing through a dark-theme gold
button had an effectively invisible focus indicator, which is a WCAG 2.4.7
failure that no amount of correct palette maths elsewhere would have caught —
because every other cell in this document was measured against a *neutral*
surface, and this one needed the accent.

The ring on an accent-filled control is therefore drawn from
`--pf-focus-ring-on-fill`, which resolves to `--pf-on-accent`:

| | Light | Dark |
|---|---|---|
| `--pf-focus-ring` on the accent fill | 4.72:1 | **1.18:1 — was broken** |
| `--pf-focus-ring-on-fill` on the accent fill | **10.76:1** | **12.15:1** |

Rule: **a focus ring never uses the same hue as the thing it is outlining.**

---

## 2. Accent ramp

Anchored on `#f2c94c` at step 400 (hue 45°, sat 86%). The ramp has **two halves,
and only one of them flips with the theme**:

| Half | Role | Dark value |
|---|---|---|
| 50–200 | **surface tints** — the only steps whose job is to sit *behind* text | inverts to a dark amber wash |
| 300–500 | **ink and fill** — read *on* a surface | held at the light values |
| 600–900 | **shades** — read *on* the yellow fill, and used as strokes | held |

This split is the whole reason the ramp has to be re-threaded rather than merely
restated. A step declared in one theme-space and not the other is invisible
until a human reads a light literal in dark mode.

| Token | Light | Dark | Text role | On light surfaces | On dark surfaces |
|---|---|---|---|---|---|
| `--pf-accent-50` | `#fffbf0` | `#2a2415` | surface tint | 16.51:1 | 14.16:1 |
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
None of them is a legal dark-mode text colour, and the token layer reaches for
300 and 400 instead.

`--pf-accent-rgb` (`242 201 76` light / `248 220 135` dark) exists for alpha
compositing, e.g. `rgb(var(--pf-accent-rgb) / 0.28)`. Because it is a token it
retints automatically in dark mode.

### 2a. Which accent steps are legal as *text*

| Step | on `#ffffff` | on `#f7f8fa` | on `#16161a` | on `#0e0e11` | on `#232329` |
|---|---|---|---|---|---|
| 300 `#f8dc87` | 1.35 | 1.27 | **13.39** | **14.30** | **11.59** |
| 400 `#f2c94c` | 1.59 | 1.49 | **11.37** | **12.15** | **9.85** |
| 500 `#ebb81e` | 1.84 | 1.73 | **9.80** | **10.47** | **8.49** |
| 600 `#c19315` | 2.82 | 2.65 | **6.40** | **6.84** | **5.54** |
| 700 `#926f16` | **4.66** | 4.38 | 3.87 | 4.14 | 3.35 |
| 800 `#6a5116` | **7.50** | **7.05** | 2.41 | 2.57 | 2.08 |
| 900 `#493813` | **11.30** | **10.63** | 1.60 | 1.71 | 1.38 |

Which named token points at which step, per theme:

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

The table splits cleanly: **300–500 are dark-mode inks, 700–900 are light-mode
inks, and 600 is the only step that clears 3:1 on both** — which is why
`--pf-accent-stroke` is pinned to it.

### 2b. Fill states

| State | Fill | On-accent ink | Light | Dark |
|---|---|---|---|---|
| base (400) | `#f2c94c` | `#1c1c1a` / `#0e0e11` | 10.76:1 | 12.15:1 |
| hover (500) | `#ebb81e` | `#1c1c1a` / `#0e0e11` | 9.27:1 | 10.47:1 |
| active (600) | `#c19315` | `#1c1c1a` / `#0e0e11` | 6.06:1 | 6.84:1 |

Hover **deepens** rather than brightens. A yellow fill that gets lighter on hover
glares on a dark UI, and 300 is where the dark ink lives, so a brightening hover
also collides with the ink end of the same ramp.

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

### 2d. Why a fixed `color-mix` percentage is the same bug in disguise

`color-mix(in srgb, var(--pf-accent) N%, var(--pf-surface))` looks theme-aware
because both operands are tokens, but the *percentage* is a constant, so the mix
lands in the middle of the ramp in one theme and near an end in the other.

The rule: a percentage low enough to stay near the surface is safe. A percentage
high enough to be recognisably yellow is a mid-tone, and **a mid-tone is a colour
that is illegible with *something***. Use a ramp step instead of a percentage.
`.pf-pricing-hero-feature-icon` was rebuilt on that basis.

---

## 3. The neutral ramp — what dark mode actually is

Dark mode is **not `:root` painted black**. There is one neutral ramp,
`--pf-n-*`, which does not flip with the theme, and every surface, edge and
divider in both themes is a step on it. Dark mode is the *same* ramp read
through a different window. That is why the two themes have the same number of
surfaces and the same depth order:

| Depth | Light | Dark |
|---|---|---|
| page | `n-50` `#f7f8fa` | `n-975` `#0e0e11` |
| sunken | `n-100` `#f1f2f5` | `n-1000` `#08080a` |
| card | `n-0` `#ffffff` | `n-950` `#16161a` |
| bar (glass over) | `n-0` | `n-925` `#1b1b20` |
| raised | `n-0` | `n-925` `#1b1b20` |
| float | `n-0` | `n-900` `#232329` |
| overlay | `n-0` | `n-900` `#232329` |
| well | `n-100` | `#0b0b0e` |
| media (no artwork) | `n-150` `#e9eaee` | `n-925` |

The full ramp is `n-0 … n-1000` in twenty steps (`tokens.css` section 1b). Each
step against the theme's body ink:

| Light step | Value | vs ink | Dark step | Value | vs ink |
|---|---|---|---|---|---|
| n-0 | `#ffffff` | 17.07 | n-1000 | `#08080a` | 18.38 |
| n-25 | `#fcfcfd` | 16.65 | n-975 | `#0e0e11` | 17.70 |
| n-50 | `#f7f8fa` | 16.06 | n-950 | `#16161a` | 16.57 |
| n-100 | `#f1f2f5` | 15.25 | n-925 | `#1b1b20` | 15.75 |
| n-150 | `#e9eaee` | 14.20 | n-900 | `#232329` | 14.35 |
| n-200 | `#e4e5e9` | 13.56 | n-875 | `#2a2a32` | 13.07 |

---

## 4. Surfaces × inks, both themes

**Read a cell as: background × foreground.** Anything at or below 4.49 is an AA
text failure; 3.0–4.49 is fine for large text and UI components only.

| Surface | Light | ink | ink-2 | ink-3 | accent-ink | Dark | ink | ink-2 | ink-3 | accent-ink |
|---|---|---|---|---|---|---|---|---|---|---|
| `--pf-bg` | `#f7f8fa` | 16.06 | 6.88 | 5.55 | 7.05 | `#0e0e11` | 17.70 | 8.33 | 6.63 | 14.30 |
| `--pf-surface` | `#ffffff` | 17.07 | 7.31 | 5.90 | 7.50 | `#16161a` | 16.57 | 7.80 | 6.21 | 13.39 |
| `--pf-surface-raised` | `#ffffff` | 17.07 | 7.31 | 5.90 | 7.50 | `#1b1b20` | 15.75 | 7.42 | 5.90 | 12.73 |
| `--pf-surface-float` | `#ffffff` | 17.07 | 7.31 | 5.90 | 7.50 | `#232329` | 14.35 | 6.76 | 5.38 | 11.59 |
| `--pf-surface-overlay` | `#ffffff` | 17.07 | 7.31 | 5.90 | 7.50 | `#232329` | 14.35 | 6.76 | 5.38 | 11.59 |
| `--pf-surface-well` | `#f1f2f5` | 15.25 | 6.53 | 5.27 | 6.70 | `#0b0b0e` | 18.05 | 8.50 | 6.76 | 14.58 |
| `--pf-surface-sunken` | `#f1f2f5` | 15.25 | 6.53 | 5.27 | 6.70 | `#08080a` | 18.38 | 8.65 | 6.88 | 14.84 |
| `--pf-surface-media` | `#e9eaee` | 14.20 | 6.08 | 4.90 | 6.24 | `#1b1b20` | 15.75 | 7.42 | 5.90 | 12.73 |
| `--pf-accent-soft` (100) | `#fef6dc` | 15.79 | 6.77 | 5.46 | 6.94 | `#363229` | 11.72 | 5.52 | **4.39** | 9.47 |
| `--pf-accent-soft-strong` (200) | `#fceab6` | 14.29 | 6.12 | 4.94 | 6.28 | `#484232` | 9.18 | **4.32** | **3.44** | 7.42 |

**The two bold cells are the constraint that set the dark tint values.**
`--pf-ink-tertiary` drops below 4.5:1 on 100 and 200, and `--pf-ink-secondary`
drops below on 200. That is why the dark ramp tops out at `#484232` rather than
going brighter for a "stronger" wash. Do not put secondary or tertiary ink on a
200 tint in dark mode.

`--pf-ink-tertiary` was re-cut during this pass, from `#6b6c74` to `#64655d` in
light and from `#8d8e97` to `#96979f` in dark, because the old values measured
**4.34:1** on the new sunken step. It is now ≥4.90:1 on every surface it lands
on, in both themes.

---

## 5. Borders

| Token | Light | Dark | Role |
|---|---|---|---|
| `--pf-line-hairline` | `#e4e5e9` | `#2a2a32` | decorative separator — 1.26:1, **not** meaningful |
| `--pf-line` | `#dcdee2` | `#32323b` | decorative border — 1.35:1 |
| `--pf-line-strong` | `#b3b5bd` | `#45454f` | scrollbar thumbs, secondary borders |
| `--pf-line-control` | `#82838b` | `#787986` | **the only border allowed on a form control** — 3.77 / 3.55 / **3.37:1** light, 4.19 / 4.48 / **4.65:1** dark |
| `--pf-ink` | `#1c1c1a` | `#f5f5f7` | body text |
| `--pf-ink-secondary` | `#55565c` | `#a9aab2` | supporting text |
| `--pf-ink-tertiary` | `#64655d` | `#96979f` | metadata, helper text — 5.90 / 6.21:1, real copy, AA body |
| `--pf-ink-disabled` | `#8b8c94` | `#666773` | **inactive controls only**, 3.35:1 light / **3.22:1** dark — clears 1.4.11 for the border |
| `--pf-ink-inverse` | `#ffffff` | `#0e0e11` | text on an inverse surface |
| `--pf-scrim-rgb` | `17 19 24` | `17 19 24` | scrims and media overlays — fixed dark in both themes |
| `--pf-on-media` | `rgb(255 255 255 / 0.92)` | same | text on top of an image or video |

### 5a. The one 1.4.11 failure, fixed on main and kept here

A form control's border is the only thing identifying it when it is empty, so it
needs 3:1 (WCAG 1.4.11 Non-text Contrast) against every surface a control lands
on. Both themes were below that:

| | was | on the sunken surface | now | on the sunken surface |
|---|---|---|---|---|
| light | `#8b8c94` | **2.99:1** | `#82838b` | **3.37:1** |
| dark | `#6a6b78` | **2.97:1** | `#787986` | **4.65:1** |

`main` re-cut the light value to `#84858d` (3.28:1 on sunken) in a later pass.
That is legal, but `#82838b` measures 3.37:1 on the same surface and 3.77:1 on
white against main's 3.28 and 3.67, so the darker step is kept: the fix from
`main` stands and the headroom on the surface that actually matters is larger.
The difference is small, but "wins on every surface" is a decidable rule and
"wins on two of three" is not.

Full sweep of the shipped values:

| Against | light | dark |
|---|---|---|
| `--pf-surface` | 3.77 | 4.19 |
| `--pf-bg` | 3.55 | 4.48 |
| `--pf-surface-well` | 3.37 | 4.57 |
| `--pf-surface-sunken` | 3.37 | 4.65 |
| `--pf-surface-media` | 3.14 | 3.98 |
| `--pf-surface-raised` | 3.77 | 3.98 |
| `--pf-surface-overlay` | 3.77 | 3.63 |

`--pf-ink-disabled` stays below 4.5:1 on purpose. WCAG 1.4.3 exempts inactive
controls, and a disabled control that looks enabled is worse than one that looks
disabled. It must never reach live copy. It is, however, used for disabled
control *borders*, which get no 1.4.3 exemption and are governed by 1.4.11 —
which is why the dark value was raised to `#666773` (3.22:1) rather than left at
`#5c5d6a` (2.77:1). See section 12a.

### 3a. Text over photography — the veil tokens

A still can be any brightness, so text sitting on an image is carried by an
explicit darkening wash rather than by the surface ramp. The foreground is
always `--pf-on-media`; the washes behind it are these three steps.

`main` introduced a three-step `--pf-veil-*` ladder. This document's own
section 7 had measured a five-step `--pf-media-scrim-*` ladder over the worst
case (pure white), and found the veil's two lower rungs — 0.34 and 0.56 — do not
reach 4.5:1. So the light-theme veil tokens are **aliases of the measured
ladder**, not the original values: `--pf-veil` is `--pf-media-scrim` at 0.66
(5.40:1), not 0.56. The dark-theme values are kept as `main` wrote them,
because there the photograph underneath is already dark and a heavier wash buys
no contrast.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--pf-veil-soft` | `→ --pf-media-scrim-soft` 0.42 | `rgb(6 7 10 / 0.42)` | a large decorative image behind a heading; content stays on `--pf-surface` |
| `--pf-veil` | `→ --pf-media-scrim` 0.66 | `rgb(6 7 10 / 0.62)` | **default for any text over media** — the level at which `--pf-on-media` holds ≥4.5:1 across the whole tonal range of the still |
| `--pf-veil-strong` | `→ --pf-media-scrim-strong` 0.78 | `rgb(6 7 10 / 0.8)` | text over a bright still, or a caption strip that must not compete with the picture |
| `--pf-on-media-chip` | `rgb(9 12 20 / 0.62)` | `rgb(6 7 10 / 0.68)` | the small pill that labels a placeholder image; paired with `--pf-on-media`, not with `--pf-ink` |

Rule: **never put an empty-state label directly on an un-veiled image.** Pick a
veil first. `drama.css` uses `--pf-veil` for every still it introduces, which is
why the asset cards, the episode empty state and the canvas waiting frame read
at the same weight as each other.

---

## 6. Glass — measured, and why the alpha is 0.86

Glass is for surfaces that float **above flat or gently-graded content**: nav
bar, popover, modal, toolbar, floating card. **Glass is never for text that sits
over a photograph.** A blurred, moving background makes contrast unmeasurable,
which is a different problem from a hard-to-read one, and it is why section 5b
exists as the tool for imagery instead.

The alpha is the interesting number. A translucent bar has to stay legible over
whatever scrolls under it, so the worst case is the most extreme backdrop that
can pass underneath: **pure black under a white bar, pure white under a dark
bar.**

| alpha | Light worst case | ink | ink-2 | Dark worst case | ink | ink-2 |
|---|---|---|---|---|---|---|
| 0.72 | `#b8b8b8` | 8.60 | **3.69** | `#57575a` | 6.61 | **3.11** |
| 0.78 | `#c7c7c7` | 10.10 | **4.33** | `#49494c` | 8.24 | **3.88** |
| 0.82 | `#d1d1d1` | 11.18 | 4.79 | `#404043` | 9.49 | **4.47** |
| **0.86** | `#dbdbdb` | **12.33** | **5.28** | `#37373a` | **10.90** | **5.13** |
| 0.90 | `#e6e6e6` | 13.68 | 5.86 | `#2d2d31` | 12.60 | 5.93 |
| 0.94 | `#f0f0f0` | 14.98 | 6.42 | `#242428` | 14.20 | 6.69 |

**0.72 is the fashionable value and it fails.** Secondary ink drops to 3.11:1
in dark mode. 0.86 is the first alpha where secondary ink clears 4.5:1 in the
dark worst case, so that is what ships.

Every glass element also carries a 1px edge, so the material has a real boundary
rather than relying on the blur to define it, and `base.css` supplies an
`@supports` fallback that swaps in an opaque surface on engines without
`backdrop-filter`.

| Token | Light | Dark |
|---|---|---|
| `--pf-glass-bg` | `rgb(255 255 255 / 0.86)` | `rgb(22 22 26 / 0.86)` |
| `--pf-glass-edge` | `rgb(17 19 24 / 0.14)` | `rgb(255 255 255 / 0.14)` |
| `--pf-glass-edge-soft` | `rgb(17 19 24 / 0.08)` | `rgb(255 255 255 / 0.08)` |
| `--pf-glass-blur` | `20px` | `20px` |
| `--pf-glass-sat` | `180%` | `180%` |
| `--pf-glass-fallback` | `#ffffff` | `#1b1b20` |

---

## 7. Text on media — the only sanctioned way to put text on a photograph

A photograph has no background colour, so the only way to guarantee AA over one
is to guarantee it over **pure white**, the brightest pixel a JPEG can hold. All
figures: `--pf-on-media` (white at 0.92) on `rgb(17 19 24 / a)` composited over
`#ffffff`.

| alpha | Token | Composite | Ratio | Verdict |
|---|---|---|---|---|
| 0.42 | `--pf-media-scrim-soft` | `#9b9c9e` | **2.56:1** | decorative only, **never text** |
| 0.52 | — | `#838487` | 3.43:1 | decorative only |
| 0.60 | — | `#707174` | 4.44:1 | large text only, and only just |
| **0.66** | `--pf-media-scrim` | `#626367` | **5.40:1** | **the floor for body text** |
| 0.78 | `--pf-media-scrim-strong` | `#45474b` | **8.17:1** | small UI chips over busy imagery |
| 0.86 | `--pf-media-scrim-full` | `#323438` | **10.85:1** | captions, badges, timestamp chips |
| 0.92 | — | `#24262a` | 13.04:1 | the very worst case |

**There is no safe thin scrim.** Anything lighter than 0.66 fails over a bright
region, and a photograph always has bright regions.

Two chips were sitting at 0.72 (3.43:1) and were moved to 0.78 (8.17:1):

- `.pf-drama-card-cover-badge`
- `.pf-style-opt-ratio`

### 7a. The opposite treatment, and why it is not an inconsistency

`.pf-drama-card-cover` is **pale**, where every other plate in the product is
dark. Its fallback writes the drama title vertically in `--pf-ink-secondary`, so
it needs a light field. A white wash at 0.5–0.68 over the ink-wash plate keeps
the darkest region near `#c6c6c6`, where `--pf-ink-secondary` measures **5.2:1**.

A system that produced one treatment everywhere would be a system that could not
place text in two different orientations. Dark here, pale there, measured
separately, is the correct answer.

### 7b. The one place the decorative rung is legal

`.pf-scene-item .ph` is 56x36. There is no way to put text on a photograph at
that size and keep it AA, so the label is set to `color: transparent` and the
tile carries only the plate. That is a deliberate trade: the chip is decorative,
the accessible name lives on the button.

---

## 8. Status palette

Deliberately disjoint from the accent hue. Yellow means "brand / selected" and
is never used for an error, a warning or a success, because a user who cannot
distinguish "this is highlighted" from "this failed" will misread the state.

| Token pair | Light on white | Light on its soft fill | Dark on bg | Dark on its soft fill |
|---|---|---|---|---|
| `--pf-danger` / `-soft` | 6.54 | 5.72 | 7.07 | 6.12 |
| `--pf-warning` / `-soft` | 6.33 | 5.75 | 10.81 | 8.73 |
| `--pf-success` / `-soft` | 6.48 | 5.72 | 11.06 | 9.22 |
| `--pf-info` / `-soft` | 6.70 | 5.77 | 7.65 | 6.56 |

All status text clears AA on both its own soft fill and the app surface, in both
themes.

### 8a. Colour is never the only signal

WCAG 1.4.1. Every status badge carries a **shape glyph** in addition to its
colour, so the state survives greyscale, colour-blindness and forced-colours
mode:

| Token | Glyph | Pairing |
|---|---|---|
| `--pf-shape-glyph-error` | `■` | error |
| `--pf-shape-glyph-warning` | `▲` | warning |
| `--pf-shape-glyph-success` | `●` | success |
| `--pf-shape-glyph-info` | `◆` | info |
| `--pf-shape-glyph-brand` | `★` | brand / selected |

Implemented as `.pf-badge.ok::before` and the `.is-*` variants in `media.css`
section 4. `.pf-badge.ok` was also accent-yellow on a green fill — semantically
wrong even where it passed — and is now the success ink.

---

## 9. Focus

| Token | Light | Dark |
|---|---|---|
| `--pf-focus-ring` | `#6a5116` (accent 800) | `#f8dc87` (accent 300) |
| `--pf-focus-ring-on-fill` | `#1c1c1a` | `#0e0e11` |
| `--pf-focus-ring-width` | `2px` | `2px` |
| `--pf-focus-ring-offset` | `2px` | `2px` |

| Against | Light | Dark |
|---|---|---|
| `--pf-surface` `#ffffff` | 7.50 | 13.39 |
| `--pf-bg` `#f7f8fa` | 7.05 | 14.30 |
| `--pf-surface-well` `#f1f2f5` | 6.70 | 14.58 |
| `--pf-surface-sunken` `#f1f2f5` | 6.70 | 14.84 |
| `--pf-surface-media` `#e9eaee` | 6.24 | 12.73 |
| accent-50 `#fffbf0` | 7.25 | 11.44 |
| accent-100 `#fef6dc` | 6.94 | 9.47 |
| accent-200 `#fceab6` | 6.28 | 7.42 |
| **accent fill `#f2c94c`** | **4.72** | **1.18 — see section 1a** |

`#6a5116` was chosen in light over a brighter accent step because it is the only
value that clears 3:1 against **every** surface a control lands on. `--pf-accent-700`
was rejected: 4.66:1 on white but only 2.94:1 against the accent fill.

**Why `base.css` repeats the pseudo-class.** `printfilm.css` sets
`outline: none` on five controls. A bare `input:focus-visible` scores (0,1,1)
and loses to `.pf-field-input:focus` at (0,2,0), so the re-assertions use
`:focus-visible:focus-visible` to reach (0,2,1)/(0,3,0). This keeps the
guarantee without `!important` and without depending on stylesheet order — which
matters because `drama.css` is imported by eight different page components and
lands after `printfilm.css` by an order that is not stable.

---

## 10. Elevation — a shadow AND a hairline, in both themes

Every `--pf-elev-N` is a pair. In light the soft shadow does the work and a thin
dark ring closes the edge. In dark the shadow is cut to roughly a third of its
light strength **on purpose**, because a black shadow on a near-black surface is
invisible, and pretending otherwise is why dark UIs look flat. What separates one
dark surface from the next is the **ramp step** plus a **light** hairline ring,
the way a physical bevel catches light on its upper edge.

The ring is the load-bearing part in dark. Its measured strength:

| Edge | vs `--pf-surface-raised` `#1b1b20` | vs `--pf-surface-overlay` `#232329` |
|---|---|---|
| `#45454f` | 1.81 | 1.65 |
| `#52525e` | 2.23 | 2.03 |
| `#5c5d69` | 2.63 | 2.40 |

These are below 3:1 **deliberately**: an elevation ring is decorative. A control
border must clear 3:1 (section 5); a card's edge only has to be *perceptible*.
The light-mode equivalents (`#dcdee2` at 1.35:1, `#e4e5e9` at 1.26:1) are in the
same category.

Prefer `--pf-elev-N` over `--pf-shadow-N`: the composite values are the only
ones that carry the hairline, so a component looks correct in both themes
without a second rule.

---

## 11. Type, space, radius, motion

**Type.** `--pf-font-sans` puts `'Noto Sans'` ahead of `'Noto Sans SC'`: the
latter is CJK-first and its Vietnamese coverage is incidental rather than
designed. `--pf-font-serif` does the same for `'Noto Serif'` ahead of
`'Noto Serif SC'`, because Vietnamese text in a serif context used to fall
through to `Georgia` — which has no precomposed `ệ / ộ / ầ / ằ / ễ / ữ / đ` — and
then to generic `serif`, breaking the serif texture mid-line. `--pf-font-display`
is Space Grotesk.

**The scale is fifteen steps, not ten.** The previous ten forced roughly forty
distinct sizes in use across the app; the scale was the thing too small to map
literals onto, which is why 294 `px` values and ~250 off-scale `rem` values
survived. `--pf-text-2xs` 0.6875rem … `--pf-text-6xl` 4.5rem, plus
`--pf-text-display: clamp(2.25rem, 1.35rem + 4.2vw, 4.25rem)`, which is clamped
so it can never fall under `--pf-text-4xl` on a 360px screen.

**Leading** runs `--pf-leading-tight` 1.2 → `--pf-leading-relaxed` 1.65, with two
extra steps that exist only for the serif voice: `--pf-leading-display` 1.08 and
`--pf-leading-prose` 1.72. Serif reads smaller than sans at the same size, so it
needs more air.

**Tracking** is a token too (`--pf-tracking-tightest` −0.035em through
`--pf-tracking-caps-wide` 0.16em). Large type needs negative tracking; small
uppercase labels need positive. Every `letter-spacing` in the app should come
from here.

**The serif voice is the editorial layer, and it is bounded.** Hero headline,
section title, pull quote, lede. Never UI chrome, never data, never a number.
`base.css` section 10 defines the utilities (`.pf-display`, `.pf-title-serif`,
`.pf-lede`, `.pf-prose`, `.pf-quote`, `.pf-kicker`) and the rules that use them
are in `printfilm.css`. A product where everything is the same sans weight
reads as a wireframe; a product where everything is a display serif reads as a
wedding invitation. The boundary is the design.

**Space.** `--pf-space-0` … `--pf-space-32` on 8pt steps, with the half-steps
(`0-5`, `1-5`, `2-5`, `3-5`, `5-5`, `7-5`) that the dense UI actually needs, plus
`--pf-rhythm-section`, `--pf-rhythm-block`, `--pf-gutter`. Spacing is the least
tokenised part of the system: `padding` / `gap` / `margin` values are still
literals in most rules, and `--pf-space-*` exists so they can be mapped without
changing the value.

**Radius.** `2xs` 4px, `xs` 6px, `sm` 10px, `md` 14px, `lg` 20px, `xl` 28px,
`2xl` 36px, `pill` 999px.

**Motion.** `--pf-dur-instant` 80ms → `--pf-dur-slower` 320ms;
`--pf-ease-standard` cubic-bezier(0.2, 0, 0, 1), `--pf-ease-emphasis`
cubic-bezier(0.32, 0.72, 0, 1), `--pf-ease-out` cubic-bezier(0.16, 1, 0.3, 1),
`--pf-ease-spring` cubic-bezier(0.34, 1.32, 0.64, 1). Three composed
transitions — `--pf-transition-color`, `--pf-transition-surface`,
`--pf-transition-lift` — so a component picks a response instead of writing four
declarations. `base.css` collapses all animation and transition to 0.01ms under
`@media (prefers-reduced-motion: reduce)`, which now also covers the skeleton
shimmer.

**Breakpoints.** Documented in `tokens.css` section 15 because CSS cannot read a
custom property in a media query: 360 / 390 / 430 phone, 768 tablet, 1024 small
desktop, 1440 large desktop. `base.css` and `printfilm.css` must not introduce a
width that is not on that list; `520` and `560` exist in this file as narrow-phone
corrections and are the only additions.

---

## 12. Dark mode

Token overrides live in three blocks and **nowhere else** — no component rule may
set a dark value:

1. `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`
2. `:root[data-theme='dark']`
3. `@media (prefers-color-scheme: dark) :root[data-theme='light']` — the
   explicit light opt-out, so a user can force light on a dark OS.

Setting `data-theme` on `<html>` is enough to switch themes; there is no
JavaScript in the token layer.

**The invariant: every block declares every colour token.** When you add a colour
token, add it to all three in the same commit. A step declared in one
theme-space and not the other is invisible until a human reads a light literal in
dark mode, which is how the accent ramp shipped broken the first time.

**The trap this layer exists to prevent.** A text token and its background token
must come from the same theme-space, or one of the two themes inverts the
contrast. Three patterns account for every break found so far:

- *Self-flipping pairs are safe.* `background: var(--pf-ink); color: var(--pf-surface);`
  inverts as a unit and keeps its ratio in both themes.
- *Mixed-space pairs break.* `background: rgb(var(--pf-ink-rgb) / 0.75); color: var(--pf-surface);`
  looks fine in light and turns into dark-on-dark in dark. Use
  `--pf-scrim-rgb` + `--pf-on-media` for anything on media, and
  `--pf-accent` + `--pf-on-accent` for anything on the accent.
- *Fixed mixes break in one direction only.* See section 2c.

---

## 12a. Re-measurement after the Wave 2 token changes — two real failures fixed

`main` added this pass. Re-running the measurement over `tokens.css` found
**two cells that the prose in this document asserted but the values did not
deliver.** One of the two fixes is adopted here and one is not; the reasoning
is in section 5a.

| Pair | Before | On `main` | Shipped here | Threshold |
|---|---|---|---|---|
| `--pf-line-control` on `--pf-surface-sunken` (light) | `#8b8c94` → **2.99:1** | `#84858d` → 3.28:1 | `#82838b` → **3.37:1** | 3:1 — WCAG 1.4.11 non-text |
| `--pf-ink-disabled` on `--pf-surface` (dark) | `#5c5d6a` → **2.77:1** | `#666773` → **3.22:1** | `#666773` → **3.22:1** | 3:1 — WCAG 1.4.11 non-text |

The first is the more interesting failure, because the token's own comment
claimed it "clears 3:1 against surface and surface-sunken". It cleared surface
(3.35:1) and missed sunken by 0.01:1. `#f1f2f5` is the surface used for wells,
table stripes and empty states, which is precisely where an input's border ends
up — so this was a live failure, not a theoretical one, and it was invisible
because `#8b8c94` looks fine on white at a glance.

`main`'s replacement, `#84858d`, was found by walking the same hue down in 1%
steps and taking the first value that clears 3:1 on the *worst* of the three
light surfaces. It works, but it is the first value to clear the bar, not the
best value in the neighbourhood:

| On | `#8b8c94` (before) | `#84858d` (main) | `#82838b` (shipped) |
|---|---|---|---|
| `#ffffff` `--pf-surface` | 3.55 | 3.67 | **3.77** |
| `#f7f8fa` `--pf-bg` | 3.35 | 3.45 | **3.55** |
| `#f1f2f5` `--pf-surface-sunken` | **2.99** | 3.28 | **3.37** |

`#82838b` clears 1.4.11 on all three surfaces with the largest margin of the
three, so it wins. The rule applied throughout this merge is stated once: when
two values both pass, the one that passes with more headroom on the *worst*
surface wins, and a token must not win on two surfaces and lose on the third.

The second fix is a deliberate trade rather than a straight repair, and it is
adopted as `main` wrote it. `--pf-ink-disabled` is a *disabled* token, and WCAG
1.4.3 exempts inactive components from contrast minimums — so the original
2.77:1 was defensible as written (see section 8). It was raised anyway because
the token is also used for disabled control **borders**, which fall under
1.4.11 and get no exemption. The new `#666773` still reads clearly as inactive
against `--pf-ink-tertiary` (6.21:1, a clear drop from 16.57:1 body ink), so the
state is preserved while the component stops failing.

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

## 12b. Remaining contrast issues in `printfilm.css`

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

## 13. What is deliberately not a token

| Value | Why it stays literal |
|---|---|
| `.pf-ink-wash`, `.auth-visual` accent bloom | decorative, never carries meaning |
| `.pf-pricing-wallet-dark` — **removed** | was a fixed `#243041 → #151c26 → #111820` gradient reading as a dark island. It is now `--pf-surface-overlay`; the class name is unchanged so the component and the media queries that reference it keep their meaning. |
| `--pf-scrim-rgb`, `--pf-highlight-rgb`, `--pf-on-media-rgb` | fixed light (or fixed dark) **in both themes** by design: they draw on media and on deliberately dark islands, so flipping them would break the thing they exist for |
| `--pf-n-rgb` | mid neutral channel for compositing that must not flip |
| `--pf-hairline: 0.5px` | device-pixel artefact, not a colour |

---

## 14. Open items, highest value first

1. **`srcset` on component previews.** `DramaImageStylePreviewImg` loads 2560px
   originals into ~200px boxes. CSS cannot add `srcset` to an `<img src>`. The
   derivatives already exist in `public/img/`. This is outside this lane's files
   and is the largest remaining defect in the product's image handling — see
   `docs/IMAGE_MANIFEST.md` section 8.
2. **Spacing is still partly tokenised.** Colours, radii, easings and elevations
   are converted; `padding` / `gap` / `margin` remain literals in most rules.
   The tokens exist; the mapping is unstarted.
3. **`px` type literals.** 294 declarations compute to an exact token at a 16px
   root, but `px → rem` changes how they respond to a user's browser font-size
   setting. That is a behaviour change, not a refactor, and it needs eyes on the
   fixed-size canvas UI.
4. **`--pf-surface-media` in dark** is `n-925`, the same as `--pf-surface-raised`.
   A placeholder tile and a raised card are therefore indistinguishable in dark.
   One step apart would be better; it was left alone rather than introduce a
   surface with no measured contrast data yet.
5. **Forced-colours mode** is handled in `base.css` (system colours restored,
   backgrounds and shadows stripped), but it has not been screenshot-verified on
   Windows High Contrast.

---

## 15. How to re-derive any number in this document

Every ratio is a WCAG 2.2 relative-luminance computation:

```
L = 0.2126 R + 0.7152 G + 0.0722 B,   R,G,B linearised by
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4
ratio = (L_lighter + 0.05) / (L_darker + 0.05)
```

Translucent pairs are composited first — a foreground over a background at alpha
`a` is `fg * a + bg * (1 - a)` — which is how the glass sweep and the media
ladder were produced. The worst case for anything translucent is the most
extreme backdrop it can have, not the average one.