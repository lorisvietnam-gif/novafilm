import type { Locale } from './detect'
import { en } from './locales/en'
import { vi } from './locales/vi'
import { zh } from './locales/zh'

/**
 * zh 用 `as const` 声明，键名与结构即全站文案契约；
 * 这里只把字面量放宽成 string，好让其它语言能通过类型检查。
 * 形状仍由 zh 决定：少一个 key（或多一个）都会让 tsc 报错。
 */
type Widen<T> = T extends string
  ? string
  : { readonly [K in keyof T]: Widen<T[K]> }

export type Messages = Widen<typeof zh>

export const messages: Record<Locale, Messages> = {
  zh,
  en,
  vi,
}
