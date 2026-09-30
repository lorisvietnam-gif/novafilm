import { LOCALES, type Locale } from '../../i18n/detect'
import { useI18n } from '../../i18n'

/** Bộ chuyển ngôn ngữ trên thanh trên cùng: bấm là ghi lựa chọn, đè lên ngôn ngữ trình duyệt. Danh sách lấy từ LOCALES */
export default function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()

  // Mỗi ngôn ngữ có một nhãn ngắn lang* trong shell của chính nó
  const labelFor = (code: Locale): string => {
    const key = code === 'zh' ? 'nav.langZh' : code === 'en' ? 'nav.langEn' : 'nav.langVi'
    const label = t(key)
    // Khi bộ văn bản thiếu khóa, t() sẽ trả về chính khóa đó; lúc đó lùi về mã ngôn ngữ
    return label === key ? code.toUpperCase() : label
  }

  return (
    <div className="pf-nav-lang" role="group" aria-label={t('nav.language')}>
      {LOCALES.map((code: Locale) => (
        <button
          key={code}
          type="button"
          className={locale === code ? 'is-active' : undefined}
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
        >
          {labelFor(code)}
        </button>
      ))}
    </div>
  )
}
