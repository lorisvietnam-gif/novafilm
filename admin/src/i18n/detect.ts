/**
 * Phát hiện ngôn ngữ cho bảng quản trị, đồng bộ thuộc tính `lang` của html,
 * và cấp `localized()` cho các bảng nhãn nằm ngoài cây React.
 *
 * Khoá lưu khác khoá của frontend (`novafilm.admin.locale` vs `novafilm.locale`)
 * để lựa chọn ở bảng admin không đè lên lựa chọn ở trang sản phẩm.
 */

export type Locale = 'zh' | 'en' | 'vi'

/** Ngôn ngữ được hỗ trợ; 'vi' là ngôn ngữ người vận hành dùng nên đứng đầu */
export const LOCALES: Locale[] = ['vi', 'zh', 'en']

/** Ngôn ngữ dự phòng khi không khớp ngôn ngữ nào được hỗ trợ */
export const DEFAULT_LOCALE: Locale = 'vi'

export const LOCALE_STORAGE_KEY = 'novafilm.admin.locale'

export const LOCALE_HTML: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en',
  vi: 'vi',
}

export const LOCALE_DATE: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  vi: 'vi-VN',
}

// Ngôn ngữ đang dùng, để các hàm tiện ích ngoài React đọc được
let activeLocale: Locale = DEFAULT_LOCALE

// Kiểm tra một giá trị có phải mã ngôn ngữ được hỗ trợ không
export function isLocale(value: unknown): value is Locale {
  return value === 'zh' || value === 'en' || value === 'vi'
}

// Ánh xạ navigator / Accept-Language sang ngôn ngữ được hỗ trợ.
// Mọi giá trị không phải zh/en rơi về 'vi' (gồm vi, vi-VN, vi_vn…)
export function localeFromBrowser(lang?: string): Locale {
  const raw = (lang || '').trim().toLowerCase()
  if (raw.startsWith('zh')) return 'zh'
  if (raw.startsWith('en')) return 'en'
  return DEFAULT_LOCALE
}

// Đọc lựa chọn thủ công của người vận hành; không có thì trả null
export function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(raw) ? raw : null
  } catch {
    return null
  }
}

// Lần đầu vào bảng admin: ưu tiên lựa chọn thủ công, nếu không thì theo trình duyệt
export function detectLocale(): Locale {
  const stored = typeof window === 'undefined' ? null : readStoredLocale()
  if (stored) return stored
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const hint = navigator.language || navigator.languages?.[0] || ''
  return localeFromBrowser(hint)
}

export function getActiveLocale(): Locale {
  return activeLocale
}

// Ghi thuộc tính lang của html; chỉ lưu localStorage khi persist
export function applyLocale(locale: Locale, persist: boolean): void {
  activeLocale = locale
  if (persist) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      /* bỏ qua khi hết quota hoặc cửa sổ ẩn danh */
    }
  }
  if (typeof document !== 'undefined') {
    // Mã lạ thì rơi về mặc định để html lang không bị lệch
    const next = isLocale(locale) ? locale : DEFAULT_LOCALE
    document.documentElement.lang = LOCALE_HTML[next]
  }
}

// Định dạng ngày giờ theo ngôn ngữ hiện tại
export function formatDateTime(value?: string | Date | null, locale: Locale = activeLocale): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(LOCALE_DATE[locale], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Văn bản có mặt ở cả ba ngôn ngữ.
 *
 * `i18n/locales/**` là nhà của văn bản trong thành phần, nhưng vài module `lib/`
 * giữ bảng nhãn riêng và được thành phần dùng trực tiếp. Chúng không đọc cây
 * pack được mà không tạo vòng phụ thuộc, nên bảng nhãn nằm ở đây.
 *
 * Cùng bất đối xứng như `messages.ts`: một *ngôn ngữ* thiếu cũng là lỗi kiểu, vì
 * mọi thành viên đều bắt buộc. Không ngôn ngữ nào rơi về tiếng Trung trong im lặng.
 */
export type LocalizedText = { zh: string; en: string; vi: string }

/** Chọn ngôn ngữ đang dùng, hoặc ngôn ngữ truyền vào khi người gọi đã có sẵn. */
export function localized(value: LocalizedText, locale: Locale = getActiveLocale()): string {
  return value[locale]
}
