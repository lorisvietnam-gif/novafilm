/** Dò ngôn ngữ trình duyệt, ghi đè thủ công và đồng bộ thuộc tính lang của html */

export type Locale = 'zh' | 'en' | 'vi'

/** Các ngôn ngữ được hỗ trợ; 'vi' là ngôn ngữ mặc định của sản phẩm nên đứng đầu */
export const LOCALES: Locale[] = ['vi', 'zh', 'en']

/** Ngôn ngữ dự phòng khi không khớp ngôn ngữ nào được hỗ trợ */
export const DEFAULT_LOCALE: Locale = 'vi'

export const LOCALE_STORAGE_KEY = 'novafilm.locale'

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

// Ngôn ngữ đang dùng (để các hàm tiện ích ngoài React đọc)
let activeLocale: Locale = DEFAULT_LOCALE

// Kiểm tra xem giá trị có phải mã ngôn ngữ được hỗ trợ không
export function isLocale(value: unknown): value is Locale {
  return value === 'zh' || value === 'en' || value === 'vi'
}

// Ánh xạ Accept-Language / navigator sang ngôn ngữ được hỗ trợ.
// Chỉ nhận diện zh và en; mọi giá trị khác rơi về 'vi' (gồm vi, vi-VN, vi_vn…)
export function localeFromBrowser(lang?: string): Locale {
  const raw = (lang || '').trim().toLowerCase()
  if (raw.startsWith('zh')) return 'zh'
  if (raw.startsWith('en')) return 'en'
  return DEFAULT_LOCALE
}

// Đọc lựa chọn thủ công của người dùng; không có thì trả null (theo trình duyệt)
export function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(raw) ? raw : null
  } catch {
    return null
  }
}

// Lần đầu vào site: ưu tiên lựa chọn thủ công, nếu không thì theo trình duyệt
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

// Áp dụng ngôn ngữ: ghi thuộc tính lang của html; chỉ lưu localStorage khi persist
export function applyLocale(locale: Locale, persist: boolean): void {
  activeLocale = locale
  if (persist) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      /* ignore quota / private mode */
    }
  }
  if (typeof document !== 'undefined') {
    // Mã ngôn ngữ lạ thì rơi về ngôn ngữ mặc định để html lang không bị lệch
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
