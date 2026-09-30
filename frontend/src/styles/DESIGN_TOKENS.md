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

Anchored on `#f2c94c` at step 400 (hue 45°, sat 86%). Steps 50–300 are tints for
fills and washes; 400 is the brand fill; 500–900 are strokes and the dark-mode
text end of the ramp.

| Token | Light | Dark | On `#ffffff` | On `#0e0e11` | Use |
|---|---|---|---|---|---|
| `--pf-accent-50` | `#fffbf0` | — | 1.03 | 18.64 | page-level accent wash |
| `--pf-accent-100` | `#fef6dc` | — | 1.08 | 17.83 | selected row, active chip |
| `--pf-accent-200` | `#fceab6` | — | 1.19 | 16.14 | hover on a 100 |
| `--pf-accent-300` | `#f8dc87` | `#f8dc87` | 1.35 | 14.30 | dark-mode accent text |
| `--pf-accent-400` | `#f2c94c` | `#f2c94c` | 1.60 | 12.15 | **the brand fill** |
| `--pf-accent-500` | `#ebb81e` | — | 1.84 | 10.47 | light-mode hover |
| `--pf-accent-600` | `#c19315` | — | 2.82 | 6.84 | accent stroke on light |
| `--pf-accent-700` | `#926f16` | — | 4.66 | 4.14 | large-text accent only |
| `--pf-accent-800` | `#6a5116` | — | 7.50 | 2.57 | **`--pf-accent-ink` in light** |
| `--pf-accent-900` | `#493813` | — | 11.30 | 1.71 | deepest accent tint |

`--pf-accent-rgb` (`242 201 76` light / `248 220 135` dark) exists for alpha
compositing, e.g. `rgb(var(--pf-accent-rgb) / 0.28)`. Because it is a token it
retints automatically in dark mode, which is how the 39 alpha-accent values in
`printfilm.css` and 6 in `drama.css` became theme-aware.

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
| `--pf-line-control` | `#8b8c94` | `#6a6b78` | **the only border allowed on a form control** — 3.35:1 / 3.66:1 |
| `--pf-ink` | `#1c1c1a` | `#f5f5f7` | body text |
| `--pf-ink-secondary` | `#55565c` | `#a9aab2` | supporting text |
| `--pf-ink-tertiary` | `#6b6c74` | `#8d8e97` | metadata, helper text |
| `--pf-ink-disabled` | `#8b8c94` | `#5c5d6a` | **inactive controls only**, 3.35:1 |
| `--pf-ink-inverse` | `#ffffff` | `#0e0e11` | text on an inverse surface |
| `--pf-scrim-rgb` | `17 19 24` | `17 19 24` | scrims and media overlays — fixed dark in both themes |
| `--pf-on-media` | `rgb(255 255 255 / 0.92)` | same | text on top of an image or video |

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

**The trap this layer exists to prevent.** A text token and its background token
must come from the same theme-space, or one of the two themes inverts the
contrast. Two patterns account for every break found in Wave 1:

- *Self-flipping pairs are safe.* `background: var(--pf-ink); color: var(--pf-surface);`
  inverts as a unit and keeps its ratio in both themes.
- *Mixed-space pairs break.* `background: rgb(var(--pf-ink-rgb) / 0.75); color: var(--pf-surface);`
  looks fine in light and turns into dark-on-dark in dark. Use
  `--pf-scrim-rgb` + `--pf-on-media` for anything sitting on media, and
  `--pf-accent` + `--pf-on-accent` for anything sitting on the accent.

---

## 8. Remaining contrast issues in `printfilm.css`

Listed, **not fixed** in Wave 1. None of these block AA for the flows audited;
they are the known tail.

| Where | Pair | Ratio | Note |
|---|---|---|---|
| `printfilm.css` `.pf-nav-github:hover` | `--pf-accent` at 0.28 over `--pf-surface` | text is `--pf-accent-ink`, 7.50:1 | fixed in Wave 1 |
| `drama.css` `.drama-ep-ref-voice-badge.bound` | `--pf-accent` on `rgb(var(--pf-scrim-rgb) / 0.82)` | **8.8:1** | **intentional** — accent on a dark scrim is the allowed pattern; an automated pass that assumes a light background will flag this as a false positive |
| `drama.css` `:disabled` button labels | `--pf-ink-disabled` | 2.48–3.35:1 | WCAG 1.4.3 exempts inactive UI components. Left as-is deliberately |
| `printfilm.css` `.pf-land-*` gradient panels | accent tints behind `--pf-ink` | 14–16:1 | pass; a future refinement would add a hairline so the panel edge reads in dark mode |
| `printfilm.css` `.pf-pricing-wallet-dark` | fixed `#243041 → #151c26 → #111820` gradient | text uses `--pf-on-media` | a deliberately dark island in both themes; the gradient is intentionally not a token |
| `printfilm.css` `.pf-wx-fab-btn` | `#07c160` WeChat green | text is `--pf-on-accent`, 7.16:1 | **was `#fff` at 2.38:1 — an AA failure fixed in Wave 1** |

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
