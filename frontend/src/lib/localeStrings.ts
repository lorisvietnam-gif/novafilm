/**
 * Text that exists in every interface language.
 *
 * The `i18n/locales/**` trees are the home for site chrome, but a handful of
 * `lib/` modules own their own copy and are consumed directly by shared
 * components. Those modules cannot read the locale packs without creating a
 * cycle — `status.ts` already reaches into `messages` for exactly this reason —
 * so their strings live here.
 *
 * Contract, deliberately the same asymmetry as `i18n/messages.ts`:
 *
 * - A missing **key** is a type error, so `tsc` fails. That is the good case:
 *   `t()` returns the key path, which is visible in the UI.
 * - A missing **language** is a type error too, because every member of
 *   `LocalizedText` is required. No locale can silently fall back to Chinese.
 *
 * `localized()` reads `getActiveLocale()`, so callers outside React get the
 * active language without threading it through. Pass an explicit locale when
 * you have one in hand and want a stable value.
 */

import { getActiveLocale, type Locale } from '../i18n/detect'

export type LocalizedText = { zh: string; en: string; vi: string }

/** Pick the active language, or an explicit one when the caller knows it. */
export function localized(value: LocalizedText, locale: Locale = getActiveLocale()): string {
  return value[locale]
}

/**
 * Turn localized entries into a plain `string[]` whose elements resolve on read.
 *
 * Some exported constants are consumed by pages we do not own, which iterate
 * them and render each item as text. Widening those constants to
 * `LocalizedText[]` would render `[object Object]` over there, so the public
 * type stays `string[]` and only the values behind the indices are swapped.
 * Reading an element therefore returns the language active *at that moment*,
 * which is what a re-render on locale change needs.
 */
export function localizedList(values: LocalizedText[]): string[] {
  const out = values.map(() => '')
  values.forEach((value, i) => {
    Object.defineProperty(out, i, {
      get: () => localized(value),
      enumerable: true,
      configurable: true,
    })
  })
  return out
}
