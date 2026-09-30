/**
 * Bản React của `localized()` trong `localeStrings.ts`.
 *
 * `localized()` đọc locale đang hoạt động ở thời điểm gọi, nên nó đúng cho mọi
 * hàm chạy ngoài React (vòng poll nền, tiện ích trong `lib/`). Nhưng một
 * component chỉ gọi nó lúc render thì sẽ không tự render lại khi người dùng đổi
 * ngôn ngữ. Hook này đọc locale từ `I18nProvider` nên đảm bảo điều đó.
 */

import { useCallback } from 'react'
import { useI18n } from '../i18n'
import type { LocalizedText } from './localeStrings'

/** Trả về hàm dịch một `LocalizedText` theo ngôn ngữ đang hoạt động. */
export function useLocalizedText(): (value: LocalizedText) => string {
  const { locale } = useI18n()
  return useCallback((value: LocalizedText) => value[locale], [locale])
}
