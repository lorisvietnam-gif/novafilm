import { createContext } from 'react'
import type { Locale } from './detect'
import type { Messages } from './messages'
import type { TVars } from './lookup'

export type TFunction = (path: string, vars?: TVars) => string

export type I18nValue = {
  locale: Locale
  setLocale: (next: Locale) => void
  t: TFunction
  m: Messages
}

/**
 * Context tách riêng khỏi provider và hook.
 *
 * `I18nProvider` (thành phần) và `useI18n` (hàm) không cùng nằm trong một file
 * .tsx: quy tắc `only-export-components` sẽ bắt, và bảng admin cần giữ nguyên
 * số cảnh báo lint nền.
 */
export const I18nContext = createContext<I18nValue | null>(null)
