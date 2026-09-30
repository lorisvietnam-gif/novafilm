/** Dàn ý: cột trái là danh sách tập, cột phải là ý tưởng / tóm tắt / kịch bản của tập đang chọn (bám theo ảnh chụp màn hình) */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Lightbulb,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Maximize2,
  Pencil,
} from 'lucide-react'
import { dramaApi, resolveDramaMediaUrl, type DramaEpisode, type DramaEpisodeBody, type DramaProject, type DramaScript } from '../../api/drama'
import { FragmentPlanSkillModal } from '../../components/drama/FragmentPlanSkillModal'
import { dialog } from '../../lib/dialog'
import {
  buildEpisodeContentUpdate,
  buildOutlineDirectory,
  episodeBodyCharLen,
  isSubstantialEpisodeBody,
  isSubstantialEpisodeCreative,
  mergeDirectoryEpisodeBodies,
  MIN_EPISODE_BODY_CHARS,
  MIN_EPISODE_CREATIVE_CHARS,
  parseEpisodeBodies,
} from './dramaWorkspaceUtils'
import { sumFragmentContentDuration } from './dramaEpisodeEditUtils'
import { OutlineScriptParseModal, OutlineScriptPreview } from './outlineScriptPreview'

type SectionKey = 'creative' | 'summary' | 'body'

/** Cụm tổng thời lượng cảnh quay hiển thị trong danh sách tập */
function formatOutlineShotDuration(sec: number): string {
  if (sec <= 0) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} phút ${s} giây` : `${m} phút`
}

type OutlineEpisodePanelProps = {
  projectId: number
  script: DramaScript | null
  episodeCount: number
  summaryReady: boolean
  episodeGenerating: boolean
  imageStyleLabel?: string
  storyType?: string
  onScriptChange: (script: DramaScript) => void
  onProjectChange: (project: DramaProject) => void
  onError: (msg: string) => void
  onOpenEpisodes: () => void
  children?: (parts: { directory: ReactNode; bodies: ReactNode }) => ReactNode
}

type SectionCardProps = {
  sectionKey: SectionKey
  icon: ReactNode
  title: string
  subtitle: string
  text: string
  editing: boolean
  draft: string
  open: boolean
  busy: boolean
  /** Khoá nút "Tạo"; vẫn sửa được tập này khi tập khác đang tạo */
  generateBusy?: boolean
  placeholder: string
  regenerateLabel: string
  onToggle: () => void
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  onDraftChange: (v: string) => void
  onRegenerate: () => void
  onCopy: () => void
  /** Khu vực kịch bản: xem trước sau khi phân tích + sửa theo từng đoạn */
  scriptPreview?: ReactNode
}

// Thẻ khu vực: tiêu đề có biểu tượng + sửa / tạo / nhân bản / thu gọn
function SectionCard({
  sectionKey,
  icon,
  title,
  subtitle,
  text,
  editing,
  draft,
  open,
  busy,
  generateBusy,
  placeholder,
  regenerateLabel,
  onToggle,
  onEdit,
  onCancel,
  onSave,
  onDraftChange,
  onRegenerate,
  onCopy,
  scriptPreview,
}: SectionCardProps) {
  const genBusy = generateBusy ?? busy
  return (
    <article className={`drama-outline-section${open ? ' is-open' : ''}`}>
      <header className="drama-outline-section-head">
        <div className="drama-outline-section-title">
          <span className={`drama-outline-section-icon is-${sectionKey}`} aria-hidden>
            {icon}
          </span>
          <div>
            <strong>{title}</strong>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="drama-outline-section-actions">
          <button type="button" className="drama-outline-text-btn" disabled={busy} onClick={onEdit}>
            <Pencil size={14} strokeWidth={2} />
            Sửa
          </button>
          <button type="button" className="drama-outline-text-btn" disabled={genBusy} onClick={onRegenerate}>
            <RefreshCw size={14} strokeWidth={2} />
            {regenerateLabel}
          </button>
          <button type="button" className="drama-outline-text-btn" onClick={onCopy}>
            <Copy size={14} strokeWidth={2} />
            Nhân bản
          </button>
          <button
            type="button"
            className="drama-outline-text-btn drama-outline-text-btn-icon"
            onClick={onToggle}
            aria-label={sectionKey === 'body' ? 'Mở cửa sổ phân tích' : open ? 'Thu gọn' : 'Mở rộng'}
          >
            {sectionKey === 'body' ? (
              <Maximize2 size={14} strokeWidth={2} />
            ) : open ? (
              <ChevronUp size={14} strokeWidth={2} />
            ) : (
              <ChevronDown size={14} strokeWidth={2} />
            )}
            {sectionKey === 'body' ? 'Xem trước phân tích' : open ? 'Thu gọn' : 'Mở rộng'}
          </button>
        </div>
      </header>
      {open ? (
        <div className="drama-outline-section-body">
          {editing ? (
            <>
              <textarea
                className="drama-ep-section-textarea"
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                rows={sectionKey === 'body' ? 14 : 8}
                placeholder={placeholder}
                disabled={busy}
              />
              <div className="drama-ep-section-edit-actions">
                <button type="button" className="drama-btn-ghost" disabled={busy} onClick={onCancel}>
                  Huỷ
                </button>
                <button type="button" className="drama-btn-primary" disabled={busy} onClick={onSave}>
                  Lưu
                </button>
              </div>
            </>
          ) : scriptPreview ? (
            scriptPreview
          ) : (
            <p className="drama-pre drama-outline-section-text">{text.trim() || placeholder}</p>
          )}
        </div>
      ) : null}
    </article>
  )
}
// Danh sách tập + ba thẻ của tập đang chọn
export function OutlineEpisodePanel({
  projectId,
  script,
  episodeCount,
  summaryReady,
  episodeGenerating,
  imageStyleLabel,
  storyType,
  onScriptChange,
  onProjectChange,
  onError,
  onOpenEpisodes,
  children,
}: OutlineEpisodePanelProps) {
  const navigate = useNavigate()
  const [activeEpisodeNumber, setActiveEpisodeNumber] = useState(1)
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    () => new Set(['creative', 'summary', 'body']),
  )
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null)
  const [sectionDraft, setSectionDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [generatingMode, setGeneratingMode] = useState<string | null>(null)
  const [generatingEpisodeNumber, setGeneratingEpisodeNumber] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [enterSkillOpen, setEnterSkillOpen] = useState(false)
  const [localError, setLocalError] = useState('')
  const [localNotice, setLocalNotice] = useState('')
  const [scriptModalOpen, setScriptModalOpen] = useState(false)
  const [episodeCovers, setEpisodeCovers] = useState<Record<number, string>>({})
  const [episodeShotStats, setEpisodeShotStats] = useState<
    Record<number, { fragmentCount: number; totalSec: number }>
  >({})

  const episodeBodies = parseEpisodeBodies(script)
  const directoryEpisodes = buildOutlineDirectory(episodeBodies, episodeCount)
  const displayEpisodes = mergeDirectoryEpisodeBodies(directoryEpisodes, episodeBodies)
  const selected =
    displayEpisodes.find((ep) => ep.episodeNumber === activeEpisodeNumber) || displayEpisodes[0] || null

  useEffect(() => {
    if (!selected) return
    if (!displayEpisodes.some((ep) => ep.episodeNumber === activeEpisodeNumber) && displayEpisodes[0]) {
      setActiveEpisodeNumber(displayEpisodes[0].episodeNumber || 1)
    }
  }, [displayEpisodes, activeEpisodeNumber, selected])

  useEffect(() => {
    setEditingSection(null)
    setSectionDraft('')
    setTitleDraft(selected?.title || '')
    setLocalError('')
    setLocalNotice('')
    setScriptModalOpen(false)
  }, [selected?.episodeNumber])

  // Lấy các tập đã chia, dùng ảnh bìa / clip của cảnh quay đầu làm ảnh nhỏ cho danh sách
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let rows: DramaEpisode[] = await dramaApi.listEpisodes(projectId)
        if (!rows.length) {
          try {
            rows = await dramaApi.seedEpisodes(projectId, false)
          } catch {
            rows = []
          }
        }
        if (cancelled) return
        const map: Record<number, string> = {}
        const shotMap: Record<number, { fragmentCount: number; totalSec: number }> = {}
        for (const ep of rows) {
          const epNo = Number(ep.params?.episodeNumber) || 0
          if (!epNo) continue
          const frags = [...(ep.fragments || [])].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
          )
          if (frags.length > 0) {
            const totalSec = frags.reduce((sum, f) => {
              const stored = Number(f.duration_sec)
              if (Number.isFinite(stored) && stored > 0) return sum + Math.round(stored)
              return sum + sumFragmentContentDuration(f.content || '')
            }, 0)
            shotMap[epNo] = { fragmentCount: frags.length, totalSec }
          }
          const first = frags.find((f) => (f.cover || '').trim() || (f.video || '').trim())
          if (!first) continue
          const raw = (first.cover || first.video || '').trim()
          if (raw) map[epNo] = resolveDramaMediaUrl(raw)
        }
        setEpisodeCovers(map)
        setEpisodeShotStats(shotMap)
      } catch {
        if (!cancelled) {
          setEpisodeCovers({})
          setEpisodeShotStats({})
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, script?.id, episodeCount])

  const selectedGenerating =
    Boolean(generatingMode) && generatingEpisodeNumber === (selected?.episodeNumber ?? null)
  const anyEpisodeGenerating = Boolean(generatingMode)
  const effectiveCreative =
    editingSection === 'creative' ? sectionDraft : selected?.creative || ''
  const effectiveSummary =
    editingSection === 'summary' ? sectionDraft : selected?.summary || ''
  const canGenerateBody =
    episodeBodyCharLen(effectiveCreative) >= 10 || episodeBodyCharLen(effectiveSummary) >= 40
  const canAdd =
    summaryReady &&
    !episodeGenerating &&
    !adding &&
    !anyEpisodeGenerating &&
    !confirming &&
    directoryEpisodes.length < 120

  // Chỉ khoá đúng tập đang tạo; tập khác vẫn xem/sửa được (tác vụ một tập chạy tuần tự nên cấm bấm tạo song song)
  const busy = episodeGenerating || selectedGenerating || confirming || saving || adding
  const generateBusy = episodeGenerating || anyEpisodeGenerating || confirming || saving || adding

  async function pollOptimize(tokenEpisode: number) {
    const started = Date.now()
    let lastErr: Error | null = null
    while (Date.now() - started < 8 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        const cur = await dramaApi.getScript(projectId)
        onScriptChange(cur)
        lastErr = null
        const st = String((cur.params || {}).episode_optimize_status || '')
        const num = Number((cur.params || {}).episode_optimize_number || 0)
        if (num === tokenEpisode && st === 'completed') return cur
        if (num === tokenEpisode && st === 'failed') {
          throw new Error(String((cur.params || {}).episode_optimize_error || 'Tạo thất bại'))
        }
        if (st !== 'generating') return cur
      } catch (err) {
        // Lỗi mạng tạm thời không ngắt vòng poll, tránh "Failed to fetch" làm giao diện kẹt ở "Đang tạo"
        lastErr = err instanceof Error ? err : new Error('Poll thất bại')
      }
    }
    throw lastErr || new Error('Tạo quá thời gian, vui lòng tải lại sau')
  }

  async function saveBodies(nextBodies: DramaEpisodeBody[]) {
    const updated = await dramaApi.updateScript(projectId, {
      episode_content: buildEpisodeContentUpdate(script, nextBodies),
    })
    onScriptChange(updated)
    return updated
  }

  async function handleAddEpisode() {
    if (!canAdd) return
    setAdding(true)
    setLocalError('')
    try {
      const res = await dramaApi.addEpisode({ project_id: projectId })
      onScriptChange(res.script)
      const p = await dramaApi.getProject(projectId)
      onProjectChange(p)
      setActiveEpisodeNumber(res.episode_number)
      setEditingSection('creative')
      setSectionDraft('')
      onOpenEpisodes()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Thêm tập thất bại'
      setLocalError(msg)
      onError(msg)
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveSection(section: SectionKey) {
    if (!selected?.episodeNumber) return
    setSaving(true)
    setLocalError('')
    try {
      const num = selected.episodeNumber
      const next = displayEpisodes.map((ep) => {
        if (ep.episodeNumber !== num) return ep
        if (section === 'creative') return { ...ep, creative: sectionDraft, title: titleDraft || ep.title }
        if (section === 'summary') return { ...ep, summary: sectionDraft, title: titleDraft || ep.title }
        return { ...ep, body: sectionDraft, title: titleDraft || ep.title }
      })
      await saveBodies(next)
      setEditingSection(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lưu thất bại'
      setLocalError(msg)
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerate(mode: 'summary' | 'body' | 'full' | 'brief') {
    if (!selected?.episodeNumber) return
    const creative = editingSection === 'creative' ? sectionDraft : selected.creative || ''
    const summary = editingSection === 'summary' ? sectionDraft : selected.summary || ''
    if ((mode === 'summary' || mode === 'full') && !isSubstantialEpisodeCreative(creative)) {
      setLocalError(`Ý tưởng gốc của tập này cần ít nhất ${MIN_EPISODE_CREATIVE_CHARS} ký tự`)
      return
    }
    // Khớp với run_episode_body_from_brief ở backend: ý tưởng ≥10 hoặc tóm tắt ≥40
    if (mode === 'body' && episodeBodyCharLen(creative) < 10 && episodeBodyCharLen(summary) < 40) {
      setLocalError('Vui lòng nhập ý tưởng hoặc tóm tắt cho tập này trước khi tạo nội dung kịch bản')
      return
    }
    if (mode === 'brief' && !isSubstantialEpisodeBody(selected.body)) {
      setLocalError(`Nội dung kịch bản cần đủ ${MIN_EPISODE_BODY_CHARS} ký tự trước khi bổ sung ý tưởng và tóm tắt`)
      return
    }
    if (mode === 'full') {
      const ok = await dialog.confirm({
        title: 'Tạo lại toàn bộ tập',
        message:
          'Sẽ viết lại tóm tắt và nội dung kịch bản dựa trên ý tưởng của tập này. Nếu tập đã vào storyboard, việc chia storyboard lại sẽ ghi đè và xoá các cảnh quay đã tạo. Bạn có muốn tiếp tục không?',
        confirmText: 'Tạo lại',
        tone: 'danger',
      })
      if (!ok) return
    }
    const targetEpisode = selected.episodeNumber
    setGeneratingMode(mode)
    setGeneratingEpisodeNumber(targetEpisode)
    setLocalError('')
    setLocalNotice('')
    try {
      // Lưu ý tưởng / tóm tắt / tiêu đề trước khi tạo, tránh chế độ body đọc trống từ DB
      if (
        editingSection === 'creative' ||
        editingSection === 'summary' ||
        titleDraft !== selected.title
      ) {
        const next = displayEpisodes.map((ep) =>
          ep.episodeNumber === targetEpisode
            ? {
                ...ep,
                creative: editingSection === 'creative' ? sectionDraft : ep.creative,
                summary: editingSection === 'summary' ? sectionDraft : ep.summary,
                title: titleDraft || ep.title,
              }
            : ep,
        )
        await saveBodies(next)
        setEditingSection(null)
      }
      await dramaApi.episodeScript({
        project_id: projectId,
        episode_number: targetEpisode,
        generate_mode: mode,
        creative: creative || undefined,
        title: titleDraft || selected.title,
      })
      const cur = await pollOptimize(targetEpisode)
      const created = Number((cur.params || {}).episode_optimize_assets_created || 0)
      if ((mode === 'body' || mode === 'full') && created > 0) {
        setLocalNotice(`Đã tạo ${created} nhân vật/bối cảnh mới và đưa vào thư viện tài nguyên`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tạo thất bại'
      setLocalError(msg)
      onError(msg)
    } finally {
      setGeneratingMode(null)
      setGeneratingEpisodeNumber(null)
    }
  }

  async function handleConfirmEnter() {
    if (!selected?.episodeNumber) return
    if (!isSubstantialEpisodeBody(selected.body)) {
      setLocalError(`Nội dung kịch bản cần đủ ${MIN_EPISODE_BODY_CHARS} ký tự trước khi vào storyboard`)
      return
    }
    setLocalError('')
    setConfirming(true)
    try {
      // Tập này đã có storyboard: vào thẳng, không bật Skill hay chia lại
      const rows = await dramaApi.listEpisodes(projectId)
      const existing = rows.find(
        (ep) => Number(ep.params?.episodeNumber) === Number(selected.episodeNumber),
      )
      if (existing && (existing.fragments || []).length > 0) {
        navigate(`/drama/projects/${projectId}/episodes/${existing.id}`)
        return
      }
      setEnterSkillOpen(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Vào storyboard thất bại'
      setLocalError(msg)
      onError(msg)
    } finally {
      setConfirming(false)
    }
  }

  // Lần đầu vào: xác nhận kịch bản + chia storyboard bằng AI theo các Skill đã chọn
  async function startEnterWithSkills(skillIds: number[]) {
    if (!selected?.episodeNumber) return
    setEnterSkillOpen(false)
    setConfirming(true)
    setLocalError('')
    try {
      const res = await dramaApi.confirmEpisodeFromScript({
        project_id: projectId,
        episode_number: selected.episodeNumber,
      })
      const episodeId = res.episode.id
      try {
        await dramaApi.planEpisodeFragments(episodeId, {
          force: true,
          fallback_rules: true,
          skill_ids: skillIds,
        })
      } catch (planErr) {
        onError(planErr instanceof Error ? planErr.message : 'AI tạo storyboard vào hàng đợi thất bại, đã chuyển sang chia cảnh quay theo quy tắc')
      }
      navigate(`/drama/projects/${projectId}/episodes/${episodeId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Vào storyboard thất bại'
      setLocalError(msg)
      onError(msg)
    } finally {
      setConfirming(false)
    }
  }

  async function handleSaveScenes(nextBody: string) {
    if (!selected?.episodeNumber) return
    setSaving(true)
    setLocalError('')
    try {
      const num = selected.episodeNumber
      const next = displayEpisodes.map((ep) =>
        ep.episodeNumber === num ? { ...ep, body: nextBody, title: titleDraft || ep.title } : ep,
      )
      await saveBodies(next)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lưu thất bại'
      setLocalError(msg)
      onError(msg)
      throw err
    } finally {
      setSaving(false)
    }
  }

  function toggleSection(key: SectionKey) {
    if (key === 'body') {
      setScriptModalOpen(true)
      setOpenSections((prev) => new Set(prev).add('body'))
      return
    }
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function startEdit(section: SectionKey) {
    if (!selected) return
    setEditingSection(section)
    setSectionDraft(
      section === 'creative'
        ? selected.creative || ''
        : section === 'summary'
          ? selected.summary || ''
          : selected.body || '',
    )
    setOpenSections((prev) => new Set(prev).add(section))
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text || '')
    } catch {
      setLocalError('Nhân bản thất bại')
    }
  }

  const metaTags = useMemo(() => {
    const tags: string[] = []
    if (storyType) tags.push(storyType)
    if (selected?.origin === 'manual') tags.push('Thêm thủ công')
    else if (selected?.body) tags.push('Tạo tự động')
    return tags
  }, [storyType, selected])

  const bodyReady = isSubstantialEpisodeBody(selected?.body)
  const charHint = selected
    ? [
        selected.creative ? `Ý tưởng ${episodeBodyCharLen(selected.creative)} ký tự` : null,
        selected.summary ? `Tóm tắt ${episodeBodyCharLen(selected.summary)} ký tự` : null,
        selected.body ? `Kịch bản ${episodeBodyCharLen(selected.body)} ký tự` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const directory = (
    <aside className="drama-outline-sidebar">
      <div className="drama-outline-sidebar-head">
        <div>
          <h3>Danh sách tập</h3>
          <p>Tổng {directoryEpisodes.length} tập</p>
        </div>
        {summaryReady ? (
          <button
            type="button"
            className="drama-outline-add-btn"
            disabled={!canAdd}
            onClick={() => void handleAddEpisode()}
          >
            <Plus size={14} strokeWidth={2.5} />
            {adding ? 'Đang thêm' : 'Thêm tập'}
          </button>
        ) : null}
      </div>
      <ul className="drama-outline-ep-list">
        {directoryEpisodes.map((ep) => {
          const body = displayEpisodes.find((x) => x.episodeNumber === ep.episodeNumber)
          const ready = isSubstantialEpisodeBody(body?.body)
          const active = activeEpisodeNumber === ep.episodeNumber
          const shot = episodeShotStats[ep.episodeNumber || 0]
          const statusLabel = shot && shot.fragmentCount > 0 && shot.totalSec > 0
            ? `${shot.fragmentCount} cảnh quay · ${formatOutlineShotDuration(shot.totalSec)}`
            : ready
              ? 'Nội dung đã sẵn sàng'
              : body?.creative
                ? 'Chờ tạo kịch bản'
                : 'Chờ nhập ý tưởng'
          return (
            <li key={ep.episodeNumber}>
              <button
                type="button"
                className={`drama-outline-ep-card${active ? ' is-active' : ''}`}
                onClick={() => {
                  onOpenEpisodes()
                  setActiveEpisodeNumber(ep.episodeNumber)
                }}
              >
                <span className="drama-outline-ep-thumb" aria-hidden>
                  {(() => {
                    const cover = episodeCovers[ep.episodeNumber || 0]
                    if (!cover) return ep.episodeNumber
                    if (/\.(mp4|webm|mov)(\?|$)/i.test(cover)) {
                      return <video src={cover} muted playsInline preload="metadata" />
                    }
                    return <img src={cover} alt="" />
                  })()}
                </span>
                <span className="drama-outline-ep-meta">
                  <strong>Tập {ep.episodeNumber}</strong>
                  <small>{ep.title || 'Chưa đặt tên'}</small>
                  <em className={shot && shot.fragmentCount > 0 ? 'is-shot' : undefined}>
                    {statusLabel}
                  </em>
                </span>
                <span className="drama-outline-ep-more" aria-hidden>
                  <MoreHorizontal size={16} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )

  const bodies = !selected ? (
    <div className="drama-outline-detail-empty">
      <p>{summaryReady ? 'Chưa có tập nào, hãy bấm "Thêm tập" hoặc chờ tạo tự động.' : 'Vui lòng hoàn tất ý tưởng toàn phim và tóm tắt kịch bản trước.'}</p>
    </div>
  ) : (
    <section className="drama-outline-detail">
      <header className="drama-outline-detail-head">
        <div className="drama-outline-detail-title">
          {editingSection ? (
            <input
              className="drama-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Tên tập"
            />
          ) : (
            <h2>
              Tập {selected.episodeNumber}
              {selected.title ? `: ${selected.title}` : ''}
            </h2>
          )}
          {imageStyleLabel ? <span className="drama-outline-style-badge">{imageStyleLabel}</span> : null}
          <div className="drama-outline-detail-meta">
            {charHint ? <span>{charHint}</span> : <span>Chưa nhập nội dung cho tập này</span>}
            {metaTags.map((tag) => (
              <span key={tag} className="drama-outline-tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="drama-outline-detail-actions">
          <span className={`drama-outline-saved${bodyReady ? ' is-ready' : ''}`}>
            <Check size={14} strokeWidth={2.5} />
            {bodyReady ? 'Vào storyboard được' : saving ? 'Đang lưu' : 'Đã đồng bộ'}
          </span>
          {bodyReady &&
          (!isSubstantialEpisodeCreative(selected.creative) ||
            episodeBodyCharLen(selected.summary) < 40) ? (
            <button
              type="button"
              className="drama-btn-ghost"
              disabled={generateBusy}
              onClick={() => void handleGenerate('brief')}
            >
              {selectedGenerating && generatingMode === 'brief' ? 'Đang bổ sung…' : 'Bổ sung ý tưởng & tóm tắt'}
            </button>
          ) : null}
          <button
            type="button"
            className="drama-outline-regen-btn"
            disabled={generateBusy || !isSubstantialEpisodeCreative(selected.creative)}
            onClick={() => void handleGenerate('full')}
          >
            <RefreshCw size={15} strokeWidth={2.25} />
            {selectedGenerating && generatingMode === 'full' ? 'Đang tạo…' : 'Tạo lại toàn bộ tập'}
          </button>
          <button
            type="button"
            className="drama-btn-ghost"
            disabled={busy || !bodyReady}
            onClick={() => void handleConfirmEnter()}
          >
            {confirming ? 'Đang vào…' : 'Vào storyboard'}
          </button>
        </div>
      </header>

      {localError ? <p className="drama-error">{localError}</p> : null}
      {localNotice ? <p className="drama-outline-notice">{localNotice}</p> : null}
      {episodeGenerating ? <p className="drama-loader">Đang tạo kịch bản toàn bộ tập, bạn có thể xem những tập đã xong…</p> : null}
      {selectedGenerating ? (
        <p className="drama-loader">Đang tạo tập này ({generatingMode})…</p>
      ) : anyEpisodeGenerating && generatingEpisodeNumber ? (
        <p className="drama-loader">
          Tập {generatingEpisodeNumber} đang tạo, bạn có thể xem/sửa tập này (hãy chờ tập đó xong rồi hãy tạo)
        </p>
      ) : null}

      <div className="drama-outline-sections">
        <SectionCard
          sectionKey="creative"
          icon={<Lightbulb size={18} strokeWidth={1.9} />}
          title="Ý tưởng gốc"
          subtitle="Điểm khởi đầu câu chuyện và xung đột chính của tập"
          text={selected.creative || ''}
          editing={editingSection === 'creative'}
          draft={sectionDraft}
          open={openSections.has('creative')}
          busy={busy}
          generateBusy={generateBusy}
          placeholder={`Nhập ý tưởng cho tập này (ít nhất ${MIN_EPISODE_CREATIVE_CHARS} ký tự)`}
          regenerateLabel={
            selectedGenerating && generatingMode === 'brief'
              ? 'Đang bổ sung…'
              : selectedGenerating && generatingMode === 'summary'
                ? 'Đang tạo…'
                : isSubstantialEpisodeCreative(selected.creative)
                  ? 'Tạo tóm tắt'
                  : 'Bổ sung ý tưởng & tóm tắt'
          }
          onToggle={() => toggleSection('creative')}
          onEdit={() => startEdit('creative')}
          onCancel={() => setEditingSection(null)}
          onSave={() => void handleSaveSection('creative')}
          onDraftChange={setSectionDraft}
          onRegenerate={() =>
            void handleGenerate(
              isSubstantialEpisodeCreative(selected.creative) ? 'summary' : 'brief',
            )
          }
          onCopy={() => void copyText(selected.creative || '')}
        />
        <SectionCard
          sectionKey="summary"
          icon={<BookOpen size={18} strokeWidth={1.9} />}
          title="Tóm tắt nội dung"
          subtitle="Nhân vật, xung đột, bước ngoặt và câu móc cuối tập"
          text={selected.summary || ''}
          editing={editingSection === 'summary'}
          draft={sectionDraft}
          open={openSections.has('summary')}
          busy={busy}
          generateBusy={generateBusy}
          placeholder="Tóm tắt nội dung của tập này"
          regenerateLabel={
            selectedGenerating && generatingMode === 'brief'
              ? 'Đang bổ sung…'
              : selectedGenerating && generatingMode === 'summary'
                ? 'Đang tạo…'
                : isSubstantialEpisodeCreative(selected.creative)
                  ? 'Tạo lại'
                  : 'Bổ sung ý tưởng & tóm tắt'
          }
          onToggle={() => toggleSection('summary')}
          onEdit={() => startEdit('summary')}
          onCancel={() => setEditingSection(null)}
          onSave={() => void handleSaveSection('summary')}
          onDraftChange={setSectionDraft}
          onRegenerate={() =>
            void handleGenerate(
              isSubstantialEpisodeCreative(selected.creative) ? 'summary' : 'brief',
            )
          }
          onCopy={() => void copyText(selected.summary || '')}
        />
        <SectionCard
          sectionKey="body"
          icon={<FileText size={18} strokeWidth={1.9} />}
          title="Nội dung kịch bản"
          subtitle="Bản quay gồm thoại và mô tả hình ảnh (phân tích theo từng cảnh, sửa được theo đoạn)"
          text={selected.body || ''}
          editing={editingSection === 'body'}
          draft={sectionDraft}
          open={openSections.has('body')}
          busy={busy}
          generateBusy={generateBusy || !canGenerateBody}
          placeholder={`Nội dung kịch bản quay (cần đủ ${MIN_EPISODE_BODY_CHARS} ký tự để vào storyboard)`}
          regenerateLabel={selectedGenerating && generatingMode === 'body' ? 'Đang tạo…' : 'Tạo kịch bản'}
          onToggle={() => toggleSection('body')}
          onEdit={() => startEdit('body')}
          onCancel={() => setEditingSection(null)}
          onSave={() => void handleSaveSection('body')}
          onDraftChange={setSectionDraft}
          onRegenerate={() => void handleGenerate('body')}
          onCopy={() => void copyText(selected.body || '')}
          scriptPreview={
            <OutlineScriptPreview
              text={selected.body || ''}
              empty={`Nội dung kịch bản quay (cần đủ ${MIN_EPISODE_BODY_CHARS} ký tự để vào storyboard)`}
              busy={busy}
              shotStats={episodeShotStats[selected.episodeNumber || 0] || null}
              onSaveScenes={handleSaveScenes}
            />
          }
        />
      </div>
      <OutlineScriptParseModal
        open={scriptModalOpen}
        onClose={() => setScriptModalOpen(false)}
        title={`Tập ${selected.episodeNumber} · Phân tích kịch bản`}
        text={selected.body || ''}
      />
    </section>
  )

  if (children) {
    return (
      <>
        {children({ directory, bodies })}
        <FragmentPlanSkillModal
          open={enterSkillOpen}
          title="Vào storyboard"
          message="Sẽ xác nhận kịch bản của tập này rồi chia cảnh quay. Bạn có thể chọn Skill dùng cho lần này; sau khi xác nhận, storyboard cùng các cảnh quay đã tạo của tập (nếu có) sẽ bị ghi đè."
          confirmText={confirming ? 'Đang vào…' : 'Bắt đầu chia cảnh quay'}
          onCancel={() => {
            if (!confirming) setEnterSkillOpen(false)
          }}
          onConfirm={(skillIds) => void startEnterWithSkills(skillIds)}
        />
      </>
    )
  }
  return (
    <div className="drama-outline drama-outline-v2">
      {directory}
      <div className="drama-outline-main">{bodies}</div>
      <FragmentPlanSkillModal
        open={enterSkillOpen}
        title="Vào storyboard"
        message="Sẽ xác nhận kịch bản của tập này rồi chia cảnh quay. Bạn có thể chọn Skill dùng cho lần này; sau khi xác nhận, storyboard cùng các cảnh quay đã tạo của tập (nếu có) sẽ bị ghi đè."
        confirmText={confirming ? 'Đang vào…' : 'Bắt đầu chia cảnh quay'}
        onCancel={() => {
          if (!confirming) setEnterSkillOpen(false)
        }}
        onConfirm={(skillIds) => void startEnterWithSkills(skillIds)}
      />
    </div>
  )
}
