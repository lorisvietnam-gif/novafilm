import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, defaultsFromTemplate } from '../../api'
import type { Template } from '../../api'
import ErrorNotice from '../../components/errors/ErrorNotice'
import AppShell from '../../components/layout/AppShell'
import Stepper from '../../components/ui/Stepper'
import PillTabs from '../../components/ui/PillTabs'
import { IconChevronLeft, IconRefresh, IconSparkles } from '../../components/ui/Icons'
import { useI18n, type Messages } from '../../i18n'
import { CATEGORY_ORDER, homeCategoryLabel } from '../../lib/categories'
import { kepuStepIndex, kepuSteps } from '../../lib/status'
import { templateDescription, templateName } from '../../lib/templateLabels'
import { DramaImageStylePreviewImg } from '../../components/drama/DramaImageStylePreviewImg'
import './studio.css'

type Inspiration = Messages['studio']['create']['inspiration'][number]

/** Tab nhập nội dung dùng khoá ổn định, nhãn hiển thị lấy từ gói i18n */
type InputTab = 'theme' | 'script'
const INPUT_TABS: InputTab[] = ['theme', 'script']

/** Khoá nhóm lọc ổn định; hai khoá này không phải danh mục do API trả về */
const ALL_CATEGORY = '__all'
const FEATURED_CATEGORY = '__featured'
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  [ALL_CATEGORY]: 'studio.create.catAll',
  [FEATURED_CATEGORY]: 'studio.create.catFeatured',
}

const PAGE_SIZE = 6

/** Tên doạn trước khi Việt hoá vẫn được coi là "chưa đặt tên" */
const LEGACY_UNTITLED = '未命名作品'

function isDefaultTitle(value: string, untitled: string) {
  const t = value.trim()
  return !t || t === untitled || t === LEGACY_UNTITLED
}

function deriveTitle(text: string, untitled: string) {
  const line = text
    .trim()
    .split(/\n/)[0]
    .replace(/["""'']/g, '')
    .replace(/[。！？!?：:].*$/, '')
    .trim()
  if (!line) return untitled
  return line.slice(0, 18)
}

export default function CreateProjectPage() {
  const nav = useNavigate()
  const { t, m } = useI18n()
  const [params] = useSearchParams()
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState(params.get('template') || '')
  const [category, setCategory] = useState(ALL_CATEGORY)
  const [q, setQ] = useState('')
  const [inputTab, setInputTab] = useState<InputTab>('theme')
  const [sourceText, setSourceText] = useState(m.studio.create.inspiration[0].theme)
  const [title, setTitle] = useState(m.studio.create.inspiration[0].title)
  const [titleTouched, setTitleTouched] = useState(false)
  const [inspPage, setInspPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [error, setError] = useState('')

  const untitled = t('studio.shared.untitled')
  const inspirationPool = m.studio.create.inspiration

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    api.me().catch(() => nav('/auth'))
    api.templates().then((list) => {
      setTemplates(list)
      const fromUrl = params.get('template') || ''
      setTemplateId((prev) => prev || fromUrl || list[0]?.id || '')
    })
  }, [nav, params])

  const categories = useMemo(() => {
    const found = new Set<string>()
    for (const tpl of templates) {
      for (const c of tpl.category || []) {
        if (CATEGORY_ORDER.includes(c)) found.add(c)
      }
    }
    return [ALL_CATEGORY, FEATURED_CATEGORY, ...CATEGORY_ORDER.filter((c) => found.has(c))]
  }, [templates])

  // PillTabs dùng chính chuỗi nhãn làm value, nên phải dịch nhãn rồi tra ngược về khoá.
  // Khoá danh mục do API trả về là tiếng Trung, nên phải qua homeCategoryLabel —
  // nếu in thẳng `key` thì chip sẽ hiện tiếng Trung ở cả `en` lẫn `vi`.
  const categoryOptions = useMemo(
    () =>
      categories.slice(0, 6).map((key) => ({
        key,
        label: CATEGORY_LABEL_KEYS[key] ? t(CATEGORY_LABEL_KEYS[key]) : homeCategoryLabel(key),
      })),
    [categories, t],
  )

  const filtered = useMemo(() => {
    let list = templates
    if (category === FEATURED_CATEGORY)
      list = [...templates].sort((a, b) => a.sort_order - b.sort_order).slice(0, 8)
    else if (category !== ALL_CATEGORY) list = list.filter((t) => (t.category || []).includes(category))
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      // Tìm trên cả tên gốc lẫn tên đang hiển thị: tên gốc tiếng Trung không ai gõ, nhưng
      // mẫu cũ trong DB vẫn còn tên gốc nên không bỏ hẳn đi cũng không.
      list = list.filter(
        (t) =>
          templateName(t.id, t.name).toLowerCase().includes(s) ||
          t.name.toLowerCase().includes(s),
      )
    }
    return list
  }, [templates, category, q])

  const selected = templates.find((t) => t.id === templateId)
  const sourceType = inputTab === 'script' ? 'script' : 'theme'
  const inspTotal = Math.ceil(inspirationPool.length / PAGE_SIZE)
  const inspirations = inspirationPool.slice(
    inspPage * PAGE_SIZE,
    inspPage * PAGE_SIZE + PAGE_SIZE,
  )

  // Đổ gợi ý mẫu vào ô chủ đề/lời dẫn và đồng bộ tên ngắn
  function applyInspiration(item: Inspiration) {
    if (sourceType === 'script') {
      setInputTab('script')
      setSourceText(item.script.slice(0, 8000))
    } else {
      setInputTab('theme')
      setSourceText(item.theme.slice(0, 100))
    }
    setTitle(item.title.slice(0, 24))
    setTitleTouched(false)
    setError('')
  }

  function shuffleInspirations() {
    setInspPage((p) => (p + 1) % inspTotal)
  }

  async function aiExpand() {
    const seed = sourceText.trim() || title.trim() || t('studio.create.aiSeed')
    setAiBusy(true)
    setError('')
    try {
      const mode = sourceType === 'script' ? 'script' : 'theme'
      const result = await api.expandContent(seed, mode)
      setSourceText(result.content.slice(0, mode === 'theme' ? 100 : 8000))
      if (!titleTouched || isDefaultTitle(title, untitled)) {
        setTitle(result.title.slice(0, 24))
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('studio.create.aiExpandFailed'),
      )
    } finally {
      setAiBusy(false)
    }
  }

  async function next() {
    if (!templateId || !sourceText.trim()) {
      setError(t('studio.create.needTemplateAndText'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const tpl = templates.find((t) => t.id === templateId)
      const d = tpl ? defaultsFromTemplate(tpl) : undefined
      const modeParam = params.get('mode')
      const pipeline_mode: 'full' | 'image_text' =
        modeParam === 'image_text' || modeParam === 'full' ? modeParam : 'full'
      const finalTitle =
        title.trim() || deriveTitle(sourceText, untitled) || sourceText.trim().slice(0, 24) || untitled
      const project = await api.createProject({
        template_id: templateId,
        title: finalTitle,
        source_type: sourceType,
        source_text: sourceText.trim(),
        resolution_mode: 'preview',
        pipeline_mode,
        output_ratio: d?.output_ratio || '16:9',
        voice_id: d?.voice_id,
      })
      nav(`/studio/${project.id}/style`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('studio.create.createFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell active="studio" wide>
      <header className="pf-page-head studio-scoped">
        <div className="pf-page-head-row">
          <div>
            <button type="button" className="pf-back" onClick={() => nav('/')}>
              <IconChevronLeft size={18} />
              {t('studio.create.back')}
            </button>
            <h1 className="pf-page-title">{t('studio.create.title')}</h1>
          </div>
          <Stepper steps={kepuSteps()} current={kepuStepIndex('create')} doneThrough={-1} />
        </div>
      </header>

      <div className="pf-create studio-scoped">
        <aside className="pf-create-col">
          <h3>{t('studio.create.pickTemplate')}</h3>
          <div className="pf-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('studio.create.searchPlaceholder')}
              aria-label={t('studio.create.searchAria')}
            />
          </div>
          <PillTabs
            items={categoryOptions.map((c) => c.label)}
            value={categoryOptions.find((c) => c.key === category)?.label ?? ''}
            onChange={(label) => {
              const hit = categoryOptions.find((c) => c.label === label)
              if (hit) setCategory(hit.key)
            }}
            ariaLabel={t('studio.create.categoryAria')}
          />
          <div className="pf-tpl-list" style={{ marginTop: '0.75rem' }}>
            {filtered.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={templateId === tpl.id ? 'pf-tpl-mini selected' : 'pf-tpl-mini'}
                onClick={() => setTemplateId(tpl.id)}
              >
                <img src={api.assetUrl(tpl.preview_cover)} alt="" loading="lazy" />
                <div>
                  <strong>{templateName(tpl.id, tpl.name)}</strong>
                  <span>
                    {tpl.default_ratio} ·{' '}
                    {tpl.category?.length
                      ? homeCategoryLabel(tpl.category[0])
                      : t('studio.shared.categoryGeneral')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="pf-create-col">
          <h3>{t('studio.create.contentHeading')}</h3>
          <div className="pf-input-tabs">
            {INPUT_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={['pf-pill', inputTab === tab ? 'lime active' : ''].join(' ')}
                onClick={() => setInputTab(tab)}
              >
                {tab === 'theme' ? t('studio.create.tabTheme') : t('studio.create.tabScript')}
              </button>
            ))}
          </div>

          <label className="pf-field">
            <span className="pf-field-label">{t('studio.create.nameLabel')}</span>
            <input
              className="pf-field-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
              onBlur={() => {
                if (isDefaultTitle(title, untitled) && sourceText.trim()) {
                  setTitle(deriveTitle(sourceText, untitled))
                  setTitleTouched(false)
                }
              }}
              placeholder={t('studio.create.namePlaceholder')}
            />
          </label>

          <div className="pf-textarea-wrap">
            <div className="pf-textarea-toolbar">
              <button
                type="button"
                className="pf-btn pf-btn-ai pf-btn-sm pf-btn-icon"
                disabled={aiBusy || busy}
                onClick={aiExpand}
              >
                <IconSparkles size={14} />
                {aiBusy
                  ? t('studio.create.aiWorkingShort')
                  : sourceType === 'script'
                    ? t('studio.create.aiExpandScript')
                    : t('studio.create.aiExpandTheme')}
              </button>
              <span className="pf-muted" style={{ fontSize: '0.75rem' }}>
                {sourceType === 'script'
                  ? t('studio.create.aiHintScript')
                  : t('studio.create.aiHintTheme')}
              </span>
            </div>
            <textarea
              value={sourceText}
              onChange={(e) => {
                const next = e.target.value.slice(0, sourceType === 'theme' ? 100 : 8000)
                setSourceText(next)
                if (!titleTouched || isDefaultTitle(title, untitled)) {
                  setTitle(deriveTitle(next, untitled))
                }
              }}
              placeholder={
                sourceType === 'theme'
                  ? t('studio.create.themePlaceholder')
                  : t('studio.create.scriptPlaceholder')
              }
            />
            {sourceType === 'theme' ? (
              <span className="pf-char-count">{sourceText.length}/100</span>
            ) : (
              <span className="pf-char-count">
                {t('studio.create.charCount', { count: sourceText.length })}
              </span>
            )}
          </div>

          <div className="pf-inspire">
            <div className="pf-inspire-head">
              <strong>{t('studio.create.inspireTitle')}</strong>
              <button
                type="button"
                className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
                onClick={shuffleInspirations}
              >
                <IconRefresh size={14} />
                {t('studio.create.inspireShuffle')}
              </button>
            </div>
            <div className="pf-chips">
              {inspirations.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className="pf-chip"
                  title={sourceType === 'script' ? item.script.slice(0, 80) : item.theme}
                  onClick={() => applyInspiration(item)}
                >
                  {item.title}
                </button>
              ))}
            </div>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0.55rem 0 0' }}>
              {sourceType === 'script'
                ? t('studio.create.inspireHintScript')
                : t('studio.create.inspireHintTheme')}
            </p>
          </div>

          <div className="pf-hint" style={{ marginTop: '1rem' }}>
            {t('studio.create.hint')}
          </div>
          {error ? <ErrorNotice error={error} onDismiss={() => setError('')} /> : null}
        </section>

        <aside className="pf-create-col">
          <h3>{t('studio.create.summaryHeading')}</h3>
          {selected ? (
            <figure className="studio-summary-figure">
              <img src={api.assetUrl(selected.preview_cover)} alt="" />
              <figcaption>
                <strong>{templateName(selected.id, selected.name)}</strong>
                <p className="pf-muted">{templateDescription(selected.id, selected.description)}</p>
              </figcaption>
            </figure>
          ) : (
            <div className="studio-pick-hint">
              <span className="studio-pick-art" aria-hidden>
                {/* Số đo (perf-audit.mjs): bản gốc 2560x1440 nặng 569KB cho một ô
                    266px. Bản thu nhỏ 512 là 37KB — cùng khung hình, 15 lần nhẹ hơn. */}
                <DramaImageStylePreviewImg
                  styleId="shanghai-animation"
                  alt=""
                  sizes="(max-width: 900px) 92vw, 400px"
                />
              </span>
              <p className="pf-muted">{t('studio.create.noTemplate')}</p>
            </div>
          )}
          <div className="pf-summary-row">
            <span>{t('studio.create.summaryName')}</span>
            <span>{title.trim() || untitled}</span>
          </div>
          <div className="pf-summary-row">
            <span>{t('studio.create.summaryMode')}</span>
            <span>
              {selected?.default_ratio === '9:16'
                ? t('studio.create.summaryModePortrait')
                : t('studio.create.summaryModeLandscape')}
            </span>
          </div>
          <div className="pf-summary-row">
            <span>{t('studio.create.summaryDuration')}</span>
            <span>{t('studio.shared.durationShort')}</span>
          </div>
          <div className="pf-summary-row">
            <span>{t('studio.create.summaryLanguage')}</span>
            <span>{t('studio.create.summaryLanguageValue')}</span>
          </div>
          <div className="pf-summary-row">
            <span>{t('studio.create.summaryInput')}</span>
            <span>
              {inputTab === 'theme' ? t('studio.create.tabTheme') : t('studio.create.tabScript')}
            </span>
          </div>
          <button
            type="button"
            className="pf-btn pf-btn-lime pf-btn-block pf-btn-lg pf-btn-icon"
            style={{ marginTop: '1.25rem' }}
            disabled={busy || aiBusy || !templateId || !sourceText.trim()}
            onClick={next}
          >
            {busy ? t('studio.create.creating') : t('studio.create.nextStep')}
            {!busy ? <span aria-hidden>→</span> : null}
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm pf-btn-icon"
            style={{ marginTop: '0.55rem' }}
            disabled={aiBusy || busy}
            onClick={aiExpand}
          >
            <IconSparkles size={14} />
            {aiBusy ? t('studio.create.aiWorkingLong') : t('studio.create.aiWriteForMe')}
          </button>
          <p className="pf-muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
            {t('studio.create.footNote')}
          </p>
        </aside>
      </div>
    </AppShell>
  )
}
