# IMAGE_MANIFEST

Every photograph the NOVAFILM interface shows, where it came from, what it was
resized to, what it cost, and what is still wrong.

Nothing here was downloaded from the internet. Nothing here is a hand-drawn SVG
standing in for a photograph. All 21 source frames were already in this
repository at `frontend/public/image-styles/`, inherited from PRINTFILM; the 19
files in `frontend/public/img/` are mechanical resizes of those frames.

- Source library and licensing status: [`../NOTICE`](../NOTICE)
  (item 2, "视觉风格样图"). **Read that item before shipping anything.**
- Resize procedure and the tool that did it: [`../src/styles/media.css`](../src/styles/media.css)
  header, and this file's section 7.

---

## 1. The source library

21 frames, **12.52 MB** in total. 20 JPEG at 2560x1440, plus one 1024x1024 PNG.

```
frontend/public/image-styles/
  90s-realistic-film.jpg             667 KB   2560x1440
  90s-rural-china-film.jpg           623 KB   2560x1440
  american-retro-hollywood.jpg       379 KB   2560x1440
  ancient-chinese-mythology.jpg      668 KB   2560x1440
  ancient-romance-soft.jpg           274 KB   2560x1440
  cgi-3d-animation.png             1288 KB   1024x1024
  chinese-urban-realistic.jpg        873 KB   2560x1440
  domestic-suspense-cold.jpg         330 KB   2560x1440
  ghibli-handdrawn-anime.jpg        2776 KB   1672x941
  japanese-daily-natural.jpg         349 KB   2560x1440
  japanese-youth-film.jpg            536 KB   2560x1440
  korean-urban-soft.jpg              268 KB   2560x1440
  neon-cyberpunk-film.jpg            535 KB   2560x1440
  palace-intrigue-cold.jpg           237 KB   2560x1440
  pixel-art.jpg                      478 KB   2560x1440
  retro-narrative-film.jpg           552 KB   2560x1440
  retro-sci-fi-atompunk.jpg          532 KB   2560x1440
  shadow-puppet-illustration.jpg     303 KB   2560x1440
  shanghai-animation.jpg             569 KB   2560x1440
  tezuka-era-cartoon.jpg             235 KB   2560x1440
  wuxia-realistic-photo.jpg          338 KB   2560x1440
```

Alongside each frame there is a matching **`.svg` of about 1 KB**. Those are
upstream's last-resort fallback — `getDramaImageStylePreviewCandidates` tries
jpg, then png, then the backend static path, then svg — and they are exactly the
kind of "hand-drawn placeholder pretending to be a picture" this pass was told
to replace. They are left in place because they are a network-failure fallback,
not a displayed state: if the jpg 404s the user gets a flat vector rather than a
broken image box. **No new SVG was created here**, and none of them is used by
any surface described in section 2.

### Licensing status — the one thing a designer cannot decide

Upstream's NOTICE describes these as visual-style sample images ("视觉风格样图")
and says the repository does **not** restate the license terms for them. That is
not the same as a grant. Their provenance is not recorded anywhere in this
repo, and I did not go looking on the open internet, because this task forbids
downloading images and because a licence cannot be established by inspection
anyway.

**This must be resolved by a human before public launch.** Concretely:

1. Ask upstream (`github.com/yi1108/printfilm`) who made these frames and under
   what terms.
2. If they are AI-generated, the remaining question is the model provider's
   terms and whether they permit commercial redistribution.
3. If any frame turns out to be a third-party photograph, it comes out and gets
   replaced with a frame of known provenance.

Until that is answered, treat the image layer as **interim art**. Nothing in the
CSS depends on a specific frame, so replacing one is a one-line change: a custom
property in `media.css` section 1.

---

## 2. What each frame is used for, and why

The rule that drove every assignment: **an image's meaning comes from its slot,
not from its prettiness.** A "no cover yet" tile and a hero band want opposite
kinds of picture, so reusing one frame across both would read as a template.

| Frame | Where | Slot means | Why this frame |
|---|---|---|---|
| `retro-narrative-film` | `.pf-land-hero`, full-bleed | the product's promise | Night exterior, wet asphalt, one car under a canopy. **The composition decides the layout**: the subject sits right of centre and the left third is unlit trees, so the scrim is weighted left and the copy column is the left one. Nothing overlaps a face. |
| `retro-narrative-film` | `.pf-dialog-veil`, `.modal-backdrop` | depth behind a dialog | Same frame at 640px, blurred 8px. An identifiable photograph behind a dialog competes with the dialog; a blurred one reads as depth. Only fetched while a dialog is open. |
| `ghibli-handdrawn-anime` | `.pf-land-close`, full-bleed | the exhale after the hero | The only warm daylight frame in the set. The closing band is the last thing on the landing page, so it changes the light rather than stacking another dark slab. |
| `neon-cyberpunk-film` | `.pf-pricing-hero-band` | the science-explainer product | The loudest frame we own, which is honest for a paid explainer-video tool. Replaces a cyan-and-lime radial wash, the most template-looking surface in the product. |
| `neon-cyberpunk-film` | `.auth-visual` | the sign-in wall | The flattest surface in the product was a generated accent/teal gradient occupying half the login page. The accent bloom is kept as light falling on the frame, not as the subject. |
| `wuxia-realistic-photo` | `.pf-ws-hero`, `.pf-home-hero` | the workspace | Deliberately a *different* frame from the landing hero, so a workspace page never looks like the landing page re-skinned. |
| `domestic-suspense-cold` | `.pf-empty-illust` | nothing generated yet | Dark, so the icon goes white on a scrim. An empty list is the one screen a user is guaranteed to look at. |
| `ancient-chinese-mythology` | `.pf-drama-card-cover` | a drama with no cover | **PALE, where every other plate is dark.** The fallback writes the title vertically in `--pf-ink-secondary`, so it needs a light field. Two opposite treatments in one system is a decision, not an inconsistency. |
| `ancient-chinese-mythology` | `.pf-help-page-hero` | a calm utility page | A long document should not compete with the product. Ink-wash landscape behind a surface-coloured wash. |
| `shanghai-animation` | `.pf-legal-hero` | terms and privacy | Same reasoning, one step quieter, on a different frame so the two are not the same page. |
| `90s-realistic-film` | `.pf-project-thumb .ph` | "your work" | Warm and human — a woman with a bicycle outside a shop. This slot means *your work*, not *nothing selected*, so it does not get the neutral plate. The 168x94 box is 16:9 and the frame is 16:9, so nothing is cropped away. |
| `chinese-urban-realistic` | `.pf-style-opt .ph`, `.pf-style-opt-media .ph` | "no style chosen" | Cool, desaturated, undecided. Grey read as unfinished; this reads as a choice not yet made. |
| `korean-urban-soft` | `.pf-scene-item .ph` | a 56x36 scene chip | Decorative only. The label is set to `color: transparent`, because at 56px there is no way to put text on a photograph and keep it AA — see section 3. |
| `american-retro-hollywood` | `.pf-asset-thumb.is-voice` | a narration asset | Warm bokeh for sound. The play control stays the brightest thing in the tile so it still reads as the target. |
| `palace-intrigue-cold` | derivative generated, not placed | — | Was the obvious candidate for the empty drama cover, since the Drama product card already uses it as its art. It lost to the pale ink-wash plate on legibility grounds. Kept at 512px, 17KB, because it is the cheapest insurance for a future dark plate. |

**Nine frames are used by the style picker only**, never by the interface
chrome: `cgi-3d-animation`, `japanese-youth-film`, `japanese-daily-natural`,
`ancient-romance-soft`, `90s-rural-china-film`, `retro-sci-fi-atompunk`,
`pixel-art`, `tezuka-era-cartoon`, `shadow-puppet-illustration`. That is a
legitimate use — the user is picking a look — and it is not "unused".

`shadow-puppet-illustration` deserves a note: its orange is the only hue in the
library that harmonises with the champagne accent `#f2c94c` without competing
with it. It is worth considering for a decorative band once the layout system
has somewhere to put one.

---

## 3. Contrast is measured, not hoped for

A photograph has no background colour, so the only way to guarantee AA over one
is to guarantee it over **pure white** — the brightest pixel a JPEG can hold.
Every figure below is `--pf-on-media` (white at 0.92) on `rgb(17 19 24 / a)`
composited over `#ffffff`:

| Scrim alpha | Ratio | Verdict |
|---|---|---|
| 0.42 (`--pf-media-scrim-soft`) | **2.57:1** | decorative only, never text |
| 0.52 | 3.42:1 | decorative only |
| 0.60 | 4.40:1 | large text only, and only just |
| **0.66** (`--pf-media-scrim`) | **5.38:1** | **the floor for body text** |
| 0.78 (`--pf-media-scrim-strong`) | 8.19:1 | small UI chips over busy imagery |
| 0.86 (`--pf-media-scrim-full`) | 10.80:1 | captions, badges, timestamp chips |

Two chips were failing before this pass and are now fixed:

| Site | Was | Now |
|---|---|---|
| `.pf-drama-card-cover-badge` | 0.72 scrim → **3.42:1** | 0.78 → 8.19:1 |
| `.pf-style-opt-ratio` | 0.72 scrim → **3.42:1** | 0.78 → 8.19:1 |

The pale drama-cover plate needed the opposite treatment: a white wash at
0.5–0.68 keeps the darkest part of the ink-wash near `#c6c6c6`, where
`--pf-ink-secondary` measures **5.2:1**.

**Glass is never used on a photograph.** A blurred, moving background makes
contrast unmeasurable, which is a different problem from a hard-to-read one.
Glass belongs to surfaces floating over flat content — nav, popover, modal,
toolbar. The full argument is in
[`DESIGN_TOKENS.md`](../frontend/src/styles/DESIGN_TOKENS.md) section 5b.

---

## 4. Derivatives, and what each one cost

`frontend/public/img/` — 19 JPEG files, **1.78 MB total**, produced with the
.NET imaging codec (`System.Drawing`) in Windows PowerShell. Quality 78 for card
art, 82 for the two hero-band images. One-step `HighQualityBicubic` downscale,
which filters correctly for large reductions and avoids the aliasing a two-step
resize gives. Never upscaled.

| File | Size | Pixels | Source | Saved |
|---|---|---|---|---|
| `retro-narrative-film-640.jpg` | 47 KB | 640x360 | 552 KB | 91% |
| `retro-narrative-film-1280.jpg` | 157 KB | 1280x720 | 552 KB | 72% |
| `retro-narrative-film-1920.jpg` | 317 KB | 1920x1080 | 552 KB | 43% |
| `wuxia-realistic-photo-640.jpg` | 39 KB | 640x360 | 338 KB | 88% |
| `wuxia-realistic-photo-1280.jpg` | 108 KB | 1280x720 | 338 KB | 68% |
| `neon-cyberpunk-film-1280.jpg` | 140 KB | 1280x720 | 535 KB | 74% |
| `ghibli-handdrawn-anime-1280.jpg` | 210 KB | 1280x720 | 2776 KB | 92% |
| `ancient-chinese-mythology-1024.jpg` | 111 KB | 1024x576 | 668 KB | 83% |
| `shanghai-animation-1024.jpg` | 107 KB | 1024x576 | 569 KB | 81% |
| `domestic-suspense-cold-512.jpg` | 19 KB | 512x288 | 330 KB | 94% |
| `domestic-suspense-cold-1024.jpg` | 59 KB | 1024x576 | 330 KB | 82% |
| `american-retro-hollywood-512.jpg` | 21 KB | 512x288 | 379 KB | 94% |
| `american-retro-hollywood-1024.jpg` | 62 KB | 1024x576 | 379 KB | 84% |
| `chinese-urban-realistic-512.jpg` | 41 KB | 512x288 | 873 KB | 95% |
| `chinese-urban-realistic-1024.jpg` | 145 KB | 1024x576 | 873 KB | 83% |
| `90s-realistic-film-512.jpg` | 39 KB | 512x288 | 667 KB | 94% |
| `90s-realistic-film-1024.jpg` | 119 KB | 1024x576 | 667 KB | 82% |
| `palace-intrigue-cold-512.jpg` | 17 KB | 512x288 | 237 KB | 93% |
| `korean-urban-soft-512.jpg` | 20 KB | 512x288 | 268 KB | 93% |

The case the brief describes, made concrete: a `.pf-tools-card-media` box is
about 300x200 CSS px and was loading a 2560px frame into it. The worst instance
in the library is `ghibli-handdrawn-anime` at **2.76 MB into a 300px box**. The
same frame at band width is now 210KB, and the 512px plates cost 17–41KB.

### How the browser picks

Every derivative is declared through `image-set()` in `media.css` section 1:

```css
--pf-media-plate-city: image-set(
  url('/img/chinese-urban-realistic-512.jpg') 1x,
  url('/img/chinese-urban-realistic-1024.jpg') 2x
);
```

`image-set()` takes **resolution descriptors, not width descriptors** — CSS has
no width form of `srcset` for backgrounds. That is why the hero declares 1280 at
1x and 1920 at 2x rather than 640/1280: a 1440px band at 1x needs at least 1440
device pixels, and the browser takes the largest candidate at or above the
requirement. `-webkit-image-set` is declared first for older engines; custom
properties are unvalidated, so the standard declaration simply wins where both
are understood.

### Why JPEG and not WebP or AVIF

The only image encoder reachable from this repository's toolchain is the .NET
imaging codec, which writes JPEG and PNG and nothing else. There is no `cwebp`,
no ImageMagick and no ffmpeg on this machine, and adding a native dependency or a
build-time encoder step is a decision for the coordinator, not a side effect of a
design pass.

`image-set()` accepts `type("image/webp")` entries, so the migration is one line
per frame when a WebP path exists. It has not been written speculatively here,
because a WebP branch with no way to verify it locally would be worse than a
known-good JPEG. **Expected saving, for whoever does it: roughly 30–40% at
quality 75–80 for this kind of photographic gradient content.**

---

## 5. Layout shift

Every image box reserves its space before the bytes arrive:

- `.pf-land-frame` — `aspect-ratio: 9/16`
- `.pf-drama-card-cover` — `aspect-ratio: 16/10`
- `.pf-tools-card-media` — `aspect-ratio: 5/2`
- `.pf-media-box` and its variants in `base.css` — `16/10`, `9/16`, `1`, `21/9`

That is why swapping a grey plate for a photograph caused no reflow in the
before/after screenshots.

---

## 6. Loading strategy

`frontend/index.html` preloads **exactly one image**: the hero, at 1x and 2x,
with `sizes="100vw"` so the browser can choose before layout.

Deliberately not preloaded:

- **The other photographs.** They are CSS background-images, so the browser only
  requests them once the element that uses them is styled. Preloading would
  spend bandwidth on art the visitor may never scroll to.
- **Fonts.** Three families at five weights cannot be fetched in parallel with
  the app bundle without making LCP worse, and `display=swap` already covers the
  gap. Measure a font preload on a real connection before adding one.

---

## 7. Reproducing a resize

```powershell
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path 'public/image-styles/<id>.jpg'))
$w = 512
$h = [int][math]::Round($src.Height * $w / $src.Width)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CompositingQuality = 'HighQuality'
$g.InterpolationMode = 'HighQualityBicubic'
$g.SmoothingMode = 'HighQuality'
$g.DrawImage($src, 0, 0, $w, $h)
$g.Dispose()
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality, 78)
$bmp.Save('public/img/<id>-<w>.jpg', $jpeg, $ep)
$src.Dispose(); $bmp.Dispose()
```

Skip any candidate wider than the source. Never upscale.

---

## 8. Known gaps, and who owns them

| Gap | Where it lives | Why it is not fixed here |
|---|---|---|
| **No `srcset` on component `<img>` previews.** `DramaImageStylePreviewImg` loads 2560px originals into ~200px boxes. It sets `loading="lazy"` but has no `sizes`/`srcset`, and CSS cannot add either to an `<img src>`. | `src/components/drama/DramaImageStylePreviewImg.tsx`, `src/lib/dramaImageStylePreviews.ts` | `frontend/src/components/**` and `frontend/src/lib/**` are outside this lane's files. The fix is a `srcset` pointing at the derivatives in section 4. **The highest-value remaining image work in the repo** — it affects the style picker, the tool grid and every project row. |
| **No `width`/`height` on those `<img>` elements.** The wrappers reserve space so CLS is contained, but the element itself carries no intrinsic size. | same component | same reason |
| **Licence unresolved.** | [`../NOTICE`](../NOTICE) item 2 | Needs a human conversation with upstream. See section 1. |
| **CSS background images are not lazy.** The browser requests a background-image once its element is styled, so a below-the-fold band is still fetched. | inherent to CSS backgrounds | The derivatives are 17–210KB, which makes this an acceptable cost. A real fix needs `<img loading="lazy">`, i.e. the component change above. |
| **Hero plate is 1280 at 1x**, so it is scaled to about 0.89x on a 1440px desktop. | `media.css` section 1 | A deliberate trade: 157KB instead of 552KB. Under the gradient scrim the softness is not visible. Raise it to 1920 at 1x if a design review objects. |
| **`retro-sci-fi-atompunk` is used as the "AI Short Video" product art** by `HomePage.tsx`, which is another lane's file. It therefore gets no derivative and no card treatment from this pass. | `src/pages/HomePage.tsx` | `frontend/src/pages/**` is out of scope. The 96px thumbnail there loads a 532KB original. |