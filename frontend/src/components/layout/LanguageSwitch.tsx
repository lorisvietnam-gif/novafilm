import { LOCALES, type Locale } from '../../i18n/detect'
import { useI18n } from '../../i18n'

/** 顶栏语言切换：点击后写入偏好，覆盖浏览器语言。选项由 LOCALES 驱动 */
export default function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()

  // 每个语言在 shell 里带一个 lang* 短标签（vi 另有 langVi）
  const labelFor = (code: Locale): string => {
    const key = code === 'zh' ? 'nav.langZh' : code === 'en' ? 'nav.langEn' : 'nav.langVi'
    const label = t(key)
    // 当前文案包里没有该键时 t() 会回显 key，此时退回语言代码
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
