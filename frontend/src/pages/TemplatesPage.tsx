import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Template } from '../api'
import BillingErrorNotice from '../components/billing/BillingErrorNotice'
import AppShell from '../components/layout/AppShell'
import PillTabs from '../components/ui/PillTabs'
import EmptyState from '../components/ui/EmptyState'
import { ALL_CATEGORY_KEY, CATEGORY_ORDER, homeCategoryLabel } from '../lib/categories'
import { templateDescription, templateName } from '../lib/templateLabels'
import { useLocalizedText } from '../lib/useLocalizedText'
import type { LocalizedText } from '../lib/localeStrings'

const COPY: Record<string, LocalizedText> = {
  title: { zh: '模板库', en: 'Template library', vi: 'Thư viện template' },
  lede: {
    zh: '为科普与知识短片挑选画面语言',
    en: 'Pick a visual language for explainers and short knowledge videos',
    vi: 'Chọn ngôn ngữ hình ảnh cho video giải thích và video kiến thức ngắn',
  },
  search: { zh: '搜索模板名称或描述', en: 'Search templates by name or description', vi: 'Tìm template theo tên hoặc mô tả' },
  ariaLabel: { zh: '模板分类', en: 'Template categories', vi: 'Các mục template' },
  empty: { zh: '没有匹配的模板。', en: 'No templates match.', vi: 'Không có template nào khớp.' },
}

export default function TemplatesPage() {
  const nav = useNavigate()
  const lt = useLocalizedText()
  const [templates, setTemplates] = useState<Template[]>([])
  const [error, setError] = useState('')
  // Khoá danh mục, không phải nhãn: giữ nguyên tiếng Trung vì khớp với CATEGORY_ORDER
  const [category, setCategory] = useState(ALL_CATEGORY_KEY)
  const [q, setQ] = useState('')

  useEffect(() => {
    api
      .templates()
      .then(setTemplates)
      .catch((e) => setError(String(e.message || e)))
  }, [])

  const categoryKeys = useMemo(() => {
    const found = new Set<string>()
    for (const t of templates) {
      for (const c of t.category || []) {
        if (CATEGORY_ORDER.includes(c)) found.add(c)
      }
    }
    return [ALL_CATEGORY_KEY, ...CATEGORY_ORDER.filter((c) => found.has(c))]
  }, [templates])

  const categoryLabels = categoryKeys.map((k) => homeCategoryLabel(k))
  const labelToKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const k of categoryKeys) m.set(homeCategoryLabel(k), k)
    return m
  }, [categoryKeys])

  const filtered = useMemo(() => {
    let list = templates
    if (category !== ALL_CATEGORY_KEY) {
      list = list.filter((t) => (t.category || []).includes(category))
    }
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(
        (t) =>
          templateName(t.id, t.name).toLowerCase().includes(s) ||
          templateDescription(t.id, t.description).toLowerCase().includes(s) ||
          t.name.toLowerCase().includes(s) ||
          t.description.toLowerCase().includes(s),
      )
    }
    return list
  }, [templates, category, q])

  function openTemplate(t: Template) {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    nav(`/studio/new?template=${t.id}`)
  }

  return (
    <AppShell active="templates">
      <div className="pf-section-head">
        <div>
          <h2>{lt(COPY.title)}</h2>
          <p>{lt(COPY.lede)}</p>
        </div>
      </div>
      <div className="pf-search" style={{ maxWidth: 420, marginBottom: '1rem' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={lt(COPY.search)}
        />
      </div>
      <PillTabs
        items={categoryLabels}
        value={homeCategoryLabel(category)}
        onChange={(label) => setCategory(labelToKey.get(label) || ALL_CATEGORY_KEY)}
        ariaLabel={lt(COPY.ariaLabel)}
      />
      {error ? <BillingErrorNotice message={error} /> : null}
      <div className="pf-template-grid" style={{ marginTop: '1rem' }}>
        {filtered.map((t) => (
          <button key={t.id} type="button" className="pf-template-card" onClick={() => openTemplate(t)}>
            <img src={api.assetUrl(t.preview_cover)} alt="" />
            <div className="body">
              <h3>{templateName(t.id, t.name)}</h3>
              <p>{templateDescription(t.id, t.description)}</p>
              <div className="pf-tags">
                {t.category.map((c) => (
                  <span key={c}>{homeCategoryLabel(c)}</span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState imageStyle="shanghai-animation" className="pf-templates-empty">
          <p>{lt(COPY.empty)}</p>
        </EmptyState>
      ) : null}
    </AppShell>
  )
}
