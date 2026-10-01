/** Trang chủ Agent Drama: AI sinh kịch bản / toan vẽ tự do + dự án của tôi (xoá nhiều mục) */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen,
  LayoutGrid,
  Library,
  PenLine,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import AppShell from '../../components/layout/AppShell'
import Button from '../../components/ui/Button'
import PillFilter, { type PillOption } from '../../components/ui/PillFilter'
import { dramaApi, resolveDramaMediaUrl, type DramaProjectListItem } from '../../api/drama'
import { dialog } from '../../lib/dialog'
import { type ImageStyleId } from '../../lib/dramaImageStyles'
import { formatDramaUsageBrief } from '../../lib/dramaUsage'
import {
  dramaProjectEntryPath,
  formatDramaCardMeta,
  isCanvasWorkflow,
} from '../../lib/dramaWorkflow'
import RequireAuth from './RequireAuth'
import { useI18n } from '../../i18n'
import { DramaEpisodeCountPopover } from './DramaEpisodeCountPopover'
import { DramaImageStyleModal } from './DramaImageStyleModal'
import { DramaProjectCardMenu } from './DramaProjectCardMenu'
import './drama.css'

const CREATIVE_MIN_LENGTH = 20
const CREATIVE_MAX_LENGTH = 2000
const CANVAS_PLACEHOLDER =
  'Dự án sáng tạo tự do trên canvas, sau sẽ hoàn thiện cốt truyện và tư liệu ngay trên canvas.'

type AgentTab = 'ai' | 'canvas'

// Định dạng thời gian cập nhật
function formatUpdatedAt(raw?: string) {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Chữ trên ảnh bìa khi chưa có ảnh xem trước.
//
// Hàm này từng bỏ HẾT khoảng trắng rồi cắt còn 12 ký tự, vì nó cấp cho
// `writing-mode: vertical-rl`: dọc thì dấu cách chỉ là một khoảng trống vô nghĩa.
// Bìa thì nay đặt chữ ngang ở chân ảnh, nên bỏ khoảng trắng là phá huỷ đúng thứ
// cần đọc — "Kiểm thu Drama" ra "KiemthuDrama", một từ không tồn tại. Cắt chuỗi
// cũng bỏ: dải chữ tự giới hạn 2 dòng bằng `-webkit-line-clamp`, và tên đầy đủ
// vẫn còn trong `aria-label` của nút bìa lẫn `.pf-drama-card-title` ngay dưới.
function coverTitleLabel(name: string): string {
  return (name || '').replace(/\s+/g, ' ').trim()
}

type ProjectFilter = 'all' | 'running' | 'done' | 'draft'

const FILTER_KEYS: ProjectFilter[] = ['all', 'running', 'done', 'draft']

export default function DramaListPage() {
  return (
    <RequireAuth>
      <DramaListInner />
    </RequireAuth>
  )
}

// Nội dung trang chủ Agent
function DramaListInner() {
  const navigate = useNavigate()
  const { t, m } = useI18n()
  const filterOptions = useMemo<PillOption<ProjectFilter>[]>(
    () =>
      FILTER_KEYS.map((value) => ({
        value,
        label: m.dramaList.filters[value],
      })),
    [m],
  )
  /*
   * storyText ý tưởng câu chuyện do AI sáng tạo
   * episodeCount số tập mục tiêu
   * imageStyleId phong cách hình ảnh
   * items danh sách dự án của tôi
   * loading đang tải danh sách
   * busy đang tạo
   * canvasBusy đang tạo toan vẽ
   * error thông báo lỗi
   * selected các id đang chọn
   * deleting đang xoá hàng loạt
   * filter bộ lọc danh sách
   * query từ khoá tìm kiếm
   * showCreate có mở panel tạo mới không
   */
  const [storyText, setStoryText] = useState('')
  const [episodeCount, setEpisodeCount] = useState(12)
  const [imageStyleId, setImageStyleId] = useState<ImageStyleId | ''>('')
  const [items, setItems] = useState<DramaProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [canvasBusy, setCanvasBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // Tải danh sách dự án
  async function loadProjects() {
    const rows = await dramaApi.listProjects()
    setItems(rows)
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id))
      return new Set([...prev].filter((id) => ids.has(id)))
    })
  }

  useEffect(() => {
    setLoading(true)
    loadProjects()
      .catch((err) => setError(err instanceof Error ? err.message : 'Tải thất bại'))
      .finally(() => setLoading(false))
  }, [])

  // AI tạo ngay: tạo dự án rồi vào bước dàn ý
  async function handleGenerate() {
    const source = storyText.trim()
    if (source.length < CREATIVE_MIN_LENGTH) {
      setError(`Nội dung câu chuyện phải có ít nhất ${CREATIVE_MIN_LENGTH} ký tự`)
      return
    }
    if (source.length > CREATIVE_MAX_LENGTH) {
      setError(`Nội dung câu chuyện không nên vượt quá ${CREATIVE_MAX_LENGTH} ký tự`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const project = await dramaApi.createProject({
        source,
        episode_count: episodeCount,
        image_style_id: imageStyleId || undefined,
        title: source.slice(0, 40),
      })
      navigate(`/drama/projects/${project.id}`, { state: { activeStep: 'outline' } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo thất bại')
    } finally {
      setBusy(false)
    }
  }

  // Toan vẽ tự do: tạo dự án ý tưởng giữ chỗ rồi vào toan vẽ
  async function handleEnterCanvas() {
    if (canvasBusy) return
    setCanvasBusy(true)
    setError('')
    try {
      const project = await dramaApi.createProject({
        source: CANVAS_PLACEHOLDER,
        episode_count: 1,
        title: 'Dự án canvas tự do',
        workflow: 'canvas',
      })
      navigate(`/drama/projects/${project.id}/canvas`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo dự án toan vẽ thất bại')
    } finally {
      setCanvasBusy(false)
    }
  }

  // Đổi tab; tab toan vẽ tạo dự án luôn rồi chuyển trang
  function handleTabClick(next: AgentTab) {
    if (next === 'canvas') {
      void handleEnterCanvas()
    }
  }

  const selectionMode = selected.size > 0
  const storyLen = storyText.trim().length
  const canGenerate = storyLen >= CREATIVE_MIN_LENGTH && storyLen <= CREATIVE_MAX_LENGTH && !busy
  const charCountClass =
    storyLen > CREATIVE_MAX_LENGTH
      ? ' is-over'
      : storyLen >= CREATIVE_MIN_LENGTH
        ? ' is-ok'
        : ''

  const filteredItems = items.filter((item) => {
    const canvas = isCanvasWorkflow(item)
    if (filter === 'draft') {
      if (canvas) return (item.asset_count || 0) === 0
      if (item.has_script) return false
    }
    if (filter === 'running') {
      if (canvas) return (item.asset_count || 0) > 0
      if (!(item.has_script && (item.episode_count || 0) > 0)) return false
    }
    if (filter === 'done') {
      if (canvas) return false
      if (!(item.has_script && (item.episode_count || 0) >= 8)) return false
    }
    const q = query.trim().toLowerCase()
    if (q && !(item.title || '').toLowerCase().includes(q)) return false
    return true
  })

  // Đổi trạng thái chọn
  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Mở dự án: toan vẽ tự do vào toan vẽ, dự án thường vào không gian làm việc
  function openProject(item: DramaProjectListItem) {
    if (selectionMode) {
      toggleSelect(item.id)
      return
    }
    navigate(dramaProjectEntryPath(item))
  }

  // Đổi tên
  async function handleRename(item: DramaProjectListItem) {
    const name = await dialog.prompt({
      title: t('dramaList.renameTitle'),
      message: t('dramaList.renameMessage'),
      defaultValue: item.title,
      confirmText: t('common.save'),
    })
    if (!name?.trim() || name.trim() === item.title) return
    try {
      await dramaApi.updateProject(item.id, { title: name.trim() })
      await loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dramaList.renameFailed'))
    }
  }

  // Xoá một dự án
  async function handleDeleteOne(item: DramaProjectListItem) {
    const ok = await dialog.confirm({
      title: t('dramaList.deleteTitle'),
      message: t('dramaList.deleteOne', { title: item.title }),
      confirmText: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    try {
      await dramaApi.deleteProject(item.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
      await loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dramaList.deleteFailed'))
    }
  }

  // Xoá hàng loạt
  async function handleDeleteSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    const ok = await dialog.confirm({
      title: t('dramaList.deleteTitle'),
      message: t('dramaList.deleteMany', { count: ids.length }),
      confirmText: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    try {
      await Promise.all(ids.map((id) => dramaApi.deleteProject(id)))
      setSelected(new Set())
      await loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dramaList.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AppShell active="drama">
      <div className="drama-page drama-agent-page pf-drama-list">
        <header className="pf-drama-list-head">
          <div className="pf-drama-list-title-row">
            <h1>{t('dramaList.title')}</h1>
            <div className="pf-drama-list-actions">
              <Button variant="ghost" size="sm" to="/drama/assets">
                <Library size={15} strokeWidth={1.75} aria-hidden />
                {t('dramaList.assets')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={canvasBusy}
                onClick={() => handleTabClick('canvas')}
              >
                <LayoutGrid size={15} strokeWidth={1.75} aria-hidden />
                {canvasBusy ? t('dramaList.creating') : t('dramaList.canvas')}
              </Button>
              <Button
                variant="lime"
                size="sm"
                onClick={() => {
                  setShowCreate(true)
                  handleTabClick('ai')
                }}
              >
                {t('dramaList.newProject')}
              </Button>
            </div>
          </div>

          <div className="pf-drama-list-toolbar">
            <PillFilter<ProjectFilter>
              options={filterOptions}
              value={filter}
              onChange={setFilter}
              ariaLabel={t('dramaList.filterAria')}
            />
            <label className="pf-drama-search">
              <Search size={16} strokeWidth={2} aria-hidden />
              <span className="sr-only">{t('dramaList.searchAria')}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('dramaList.searchPlaceholder')}
              />
            </label>
          </div>
        </header>

        {showCreate ? (
          <section className="drama-agent-panel pf-drama-create-panel" aria-label={t('dramaList.createAria')}>
            <div className="drama-agent-panel-head">
              <div className="drama-agent-tabs" role="tablist">
                <button type="button" role="tab" aria-selected className="active">
                  <PenLine size={15} strokeWidth={1.75} aria-hidden />
                  {t('dramaList.aiScript')}
                </button>
              </div>
              <button type="button" className="pf-link pf-drama-collapse" onClick={() => setShowCreate(false)}>
                {t('dramaList.collapse')}
              </button>
            </div>
            <div className="drama-agent-tips" role="note">
              <Sparkles size={15} strokeWidth={1.75} aria-hidden />
              <span>
                {t('dramaList.tipRest', {
                  a: t('dramaList.tipStrong1'),
                  b: t('dramaList.tipStrong2'),
                  c: t('dramaList.tipStrong3'),
                })}
              </span>
            </div>
            <div className="drama-agent-ai">
              <label className="drama-agent-ai-label" htmlFor="drama-agent-story">
                {t('dramaList.storyLabel')}
              </label>
              <div className={`drama-agent-ai-field${storyText.trim() ? ' has-value' : ''}`}>
                <textarea
                  id="drama-agent-story"
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value.slice(0, CREATIVE_MAX_LENGTH + 50))}
                  disabled={busy}
                  placeholder="Viết ở đây ý tưởng câu chuyện của bạn: bối cảnh, đặc điểm nhân vật chính, diễn biến cốt truyện, kết cục…"
                  rows={7}
                  maxLength={CREATIVE_MAX_LENGTH + 50}
                />
                <span
                  className={`drama-agent-char-count${charCountClass}`}
                  aria-live="polite"
                >
                  {storyLen}
                  <span className="drama-agent-char-sep">/</span>
                  {CREATIVE_MAX_LENGTH}
                </span>
              </div>
              <div className="drama-agent-ai-footer">
                <div className="drama-agent-ai-options">
                  <DramaImageStyleModal value={imageStyleId} onChange={setImageStyleId} disabled={busy} />
                  <span className="drama-agent-opt-divider" aria-hidden />
                  <DramaEpisodeCountPopover value={episodeCount} onChange={setEpisodeCount} disabled={busy} />
                </div>
                <Button
                  variant="lime"
                  size="md"
                  className="drama-agent-generate-btn"
                  disabled={!canGenerate}
                  onClick={() => void handleGenerate()}
                >
                  <Sparkles size={16} strokeWidth={1.75} aria-hidden />
                  {busy ? 'Đang tạo…' : 'Tạo ngay'}
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {error ? <BillingErrorNotice message={error} className="drama-error drama-agent-error" /> : null}

        {loading ? (
          <div className="pf-drama-card-grid" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="pf-drama-card is-skeleton" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="pf-empty-state">
            <div className="pf-empty-illust" aria-hidden>
              <FolderOpen size={48} strokeWidth={1.2} />
            </div>
            <h2>Chưa có dự án nào</h2>
            <p className="pf-muted">Dùng AI sinh kịch bản hoặc toan vẽ tự do để làm bộ Drama đầu tiên của bạn</p>
            <Button
              variant="lime"
              onClick={() => {
                setShowCreate(true)
                handleTabClick('ai')
              }}
            >
              Tạo dự án
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="pf-empty-state is-compact">
            <p className="pf-muted">Không có dự án nào khớp bộ lọc</p>
            <Button variant="ghost" size="sm" onClick={() => { setFilter('all'); setQuery('') }}>
              Xoá bộ lọc
            </Button>
          </div>
        ) : (
          <div className="pf-drama-card-grid">
            <button
              type="button"
              className="pf-drama-card pf-drama-card-new"
              onClick={() => {
                setShowCreate(true)
                handleTabClick('ai')
              }}
            >
              <span className="pf-drama-card-plus" aria-hidden>
                +
              </span>
              <strong>Tạo dự án</strong>
            </button>
            {filteredItems.map((item) => {
              const isSelected = selected.has(item.id)
              const coverSrc = item.cover_url ? resolveDramaMediaUrl(item.cover_url) : ''
              const canvas = isCanvasWorkflow(item)
              return (
                <article
                  key={item.id}
                  className={`pf-drama-card${isSelected ? ' is-selected' : ''}${canvas ? ' is-canvas' : ''}`}
                >
                  <button
                    type="button"
                    className="pf-drama-card-cover"
                    onClick={() => openProject(item)}
                    aria-label={`Mở ${item.title}`}
                  >
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt=""
                        className="pf-drama-card-cover-img"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="pf-drama-card-cover-fallback">{coverTitleLabel(item.title)}</span>
                    )}
                    {canvas ? <span className="pf-drama-card-cover-badge is-canvas">Toan vẽ tự do</span> : null}
                    {!canvas && item.cover_pending ? (
                      <span className="pf-drama-card-cover-badge">Đang tạo bìa</span>
                    ) : null}
                    {!canvas && !coverSrc && !item.cover_pending && item.asset_count > 0 ? (
                      <span className="pf-drama-card-cover-badge is-muted">Chờ tạo ảnh</span>
                    ) : null}
                    <label
                      className={`drama-project-row-check${isSelected || selectionMode ? ' is-visible' : ''}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} />
                    </label>
                  </button>
                  <div className="pf-drama-card-body">
                    <div className="pf-drama-card-top">
                      <button type="button" className="pf-drama-card-title" onClick={() => openProject(item)}>
                        {item.title}
                      </button>
                      <DramaProjectCardMenu
                        onRename={() => void handleRename(item)}
                        onDelete={() => void handleDeleteOne(item)}
                      />
                    </div>
                    <p className="pf-drama-card-meta">{formatDramaCardMeta(item)}</p>
                    <p className="pf-drama-card-usage" title="Tổng chi phí và số lần tạo của bộ phim này">
                      {formatDramaUsageBrief(item.usage)}
                    </p>
                    <p className="pf-drama-card-time">{formatUpdatedAt(item.updated_at || item.created_at)}</p>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {selected.size > 0 ? (
          <div className="drama-project-selection-bar">
            <div className="drama-project-selection-inner">
              <span>Đã chọn {selected.size} dự án</span>
              <button
                type="button"
                className="drama-project-selection-cancel"
                disabled={deleting}
                onClick={() => setSelected(new Set())}
              >
                Bỏ chọn
              </button>
              <button
                type="button"
                className="drama-project-selection-delete"
                disabled={deleting}
                onClick={() => void handleDeleteSelected()}
              >
                <Trash2 size={16} strokeWidth={1.8} />
                {deleting ? 'Đang xoá…' : 'Xoá'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}
