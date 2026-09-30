import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, defaultsFromTemplate } from '../../api'
import type { Project, Shot, Template } from '../../api'
import AppShell from '../../components/layout/AppShell'
import Stepper from '../../components/ui/Stepper'
import {
  IconChevronLeft,
  IconDownload,
  IconEdit,
  IconImage,
  IconMonitor,
  IconPlay,
  IconRefresh,
  IconSliders,
  IconTrash,
} from '../../components/ui/Icons'
import { scenePromptForDisplay } from '../../promptDisplay'
import { dialog } from '../../lib/dialog'
import { handleBillingError } from '../../lib/billingError'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import {
  effectiveStatus,
  formatMmSs,
  isRunning,
  kepuBillingPhase,
  kepuPhaseHint,
  kepuStepIndex,
  kepuSteps,
  isProjectWideBusy,
  isShotGenerating,
  shotsByNo,
  shotDisplayDone,
  shotDisplayKind,
  shotDisplayLabel,
  statusLabel,
} from '../../lib/status'
import {
  SEGMENT_SCRIPT_PLACEHOLDER,
  SHOT_DURATION_MAX,
  firstVisualFromScript,
  narrationFromScript,
  parseSegmentScript,
  replaceFirstVisualInScript,
  replaceNarrationInScript,
  shotDisplayDurationSec,
  sumDuration,
  validateSegmentScriptDuration,
} from '../../lib/segmentDuration'
import { getDramaImageStylePreviewUrl } from '../../lib/dramaImageStylePreviews'
import type { ImageStyleId } from '../../lib/dramaImageStyles'
import './studio.css'

const IMAGE_TEXT_LABEL = 'Ảnh tĩnh'
const FULL_LABEL = 'AI video'

/** Ảnh trang trí cho các ô trống, đổi theo ngữ cảnh */
const EMPTY_ART: Record<'cover' | 'shot' | 'board', ImageStyleId> = {
  cover: 'ghibli-handdrawn-anime',
  shot: 'wuxia-realistic-photo',
  board: 'pixel-art',
}

function csvEscape(value: string | number | null | undefined) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadStoryboardCsv(project: Project) {
  const header = ['Số cảnh', 'Lời dẫn', 'Mô tả hình ảnh', 'Thời lượng (giây)', 'Trạng thái', 'Tiêu đề cảnh quay']
  const rows = (project.shots || [])
    .slice()
    .sort((a, b) => a.shot_no - b.shot_no)
    .map((s) =>
      [
        s.shot_no,
        s.narration,
        scenePromptForDisplay(s.img_prompt || s.video_prompt || ''),
        shotDisplayDurationSec(s),
        shotDisplayLabel(shotDisplayKind(s, { pipelineMode: project.pipeline_mode })),
        s.overlay_title || '',
      ]
        .map(csvEscape)
        .join(','),
    )
  const bom = '\uFEFF'
  const blob = new Blob([bom + [header.join(','), ...rows].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${project.title || `project_${project.id}`}_storyboard.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

type PreviewState =
  | {
      kind: 'shot'
      shotNo: number
      imageUrl: string | null
      videoUrl: string | null
      audioUrl: string | null
      caption: string
    }
  | { kind: 'final'; url: string; title: string; bust?: string }
  | null

function shotCaption(shot: Shot) {
  if (shot.overlay_title) {
    return `${shot.overlay_title}${
      shot.overlay_subtitle ? ` · ${shot.overlay_subtitle}` : ''
    }${shot.narration ? `｜Lời dẫn: ${shot.narration}` : ''}`
  }
  return shot.narration
}

function hasActiveUnifiedTasks(project: Project | null): boolean {
  const activeStatuses = ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review']
  return Boolean(
    project?.active_tasks?.some(
      (task) => !task.cancel_requested && activeStatuses.includes(task.status),
    ),
  )
}

/** Có dữ liệu từ nền tảng tác vụ thì tin active_tasks; COMPOSING mà không có tác vụ coi là rác của lần ghép lỗi, thử lại được */
function isProjectBusy(project: Project | null): boolean {
  if (!project) return false
  if (hasActiveUnifiedTasks(project)) return true
  if (Array.isArray(project.active_tasks) && project.active_tasks.length === 0) {
    return false
  }
  return isRunning(project.status)
}

export default function StoryboardPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const nav = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [template, setTemplate] = useState<Template | null>(null)
  const [busy, setBusy] = useState(false)
  // busyShotIds là số cảnh đang gửi yêu cầu tạo ảnh/video riêng lẻ, chạy song song được; finally chỉ xoá key của mình
  const [busyShotIds, setBusyShotIds] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Shot | null>(null)
  const [editFocus, setEditFocus] = useState<string>('')
  /** Lối vào bảng: cột Lời dẫn / cột Storyboard theo đoạn / nút Sửa trong cột thao tác */
  const [editMode, setEditMode] = useState<'full' | 'narration' | 'segment'>('full')
  const [promptEdit, setPromptEdit] = useState<{
    style_prompt: string
    character_prompt: string
    extra_prompt: string
  } | null>(null)
  const [preview, setPreview] = useState<PreviewState>(null)
  const [menuShotId, setMenuShotId] = useState<number | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchSelected, setBatchSelected] = useState<number[]>([])
  const [batchDuration, setBatchDuration] = useState('')
  const [batchRegenAudio, setBatchRegenAudio] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    if (!projectId) {
      nav('/studio/new')
      return
    }
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p)
        return api.templates().then((list) => {
          setTemplate(list.find((t) => t.id === p.template_id) || null)
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Không tải được dự án.'))
  }, [nav, projectId])

  useEffect(() => {
    if (!project) return
    // Chỉ thăm dò khi pipeline đang chạy thật — các mốc dừng
    // (IMAGE_READY / VIDEO_READY / SCRIPT_READY) không được quay vô hạn.
    if (!isProjectBusy(project)) return
    const timer = setInterval(() => {
      api
        .getProject(project.id)
        .then(setProject)
        .catch(() => undefined)
    }, 1500)
    return () => clearInterval(timer)
  }, [project?.id, project?.status, project?.active_tasks])

  useEffect(() => {
    if (menuShotId == null) return
    function onDoc() {
      setMenuShotId(null)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [menuShotId])

  const running = isProjectBusy(project)
  const step = project ? kepuStepIndex('board', project) : 2
  const totalDuration = useMemo(
    () => (project?.shots || []).reduce((s, x) => s + shotDisplayDurationSec(x), 0),
    [project?.shots],
  )

  // editScriptText: kịch bản storyboard theo đoạn đang sửa trong hộp thoại
  const editScriptText = editing?.segment_script || editing?.video_prompt || ''
  // editDurationCheck: kết quả kiểm tra thời lượng của kịch bản trong hộp thoại
  const editDurationCheck = useMemo(
    () => validateSegmentScriptDuration(editScriptText),
    [editScriptText],
  )

  const shots = useMemo(() => shotsByNo(project?.shots), [project?.shots])
  /** Khi trường của dự án rỗng thì hiện giá trị mặc định của mẫu (khớp với _effective_* ở backend) */
  const promptDefaults = useMemo(
    () => (template ? defaultsFromTemplate(template) : null),
    [template],
  )
  const displayPrompts = useMemo(() => {
    if (!project) {
      return { style_prompt: '', character_prompt: '', extra_prompt: '' }
    }
    return {
      style_prompt: (project.style_prompt || '').trim() || promptDefaults?.style_prompt || '',
      character_prompt:
        (project.character_prompt || '').trim() || promptDefaults?.character_prompt || '',
      extra_prompt: (project.extra_prompt || '').trim() || promptDefaults?.extra_prompt || '',
    }
  }, [project, promptDefaults])
  const isFullPipeline = project?.pipeline_mode !== 'image_text'
  /**
   * Pipeline đầy đủ: cần video AI trước khi ghép.
   * VIDEO_READY trở đi nghĩa là đã xong bước video (kể cả các cảnh bị bỏ qua vì riêng tư mà không có video_url).
   * Chế độ ảnh tĩnh bỏ qua hoàn toàn bước video.
   */
  const phase = project ? kepuBillingPhase(project) : 'script'
  const readyToCompose = phase === 'compose'
  const needsVideos = phase === 'videos'
  const needsScriptConfirm = phase === 'assets'
  const hasFinal = Boolean(project?.final_video_url)
  /** Nút chính: duyệt kịch bản → tạo → (video) → ghép → xem */
  const primaryAction: 'generate' | 'compose' | 'preview' | 'busy' = running
    ? 'busy'
    : hasFinal
      ? 'preview'
      : readyToCompose
        ? 'compose'
        : 'generate'

  const BUSY_LABEL = 'Đang tạo…'
  const generateLabel = running
    ? BUSY_LABEL
    : shots.length === 0
      ? 'Đi tới trang phong cách để tạo storyboard'
      : needsScriptConfirm
        ? 'Duyệt storyboard, tạo ảnh và lồng tiếng từng cảnh'
        : needsVideos
          ? 'Tạo video từng cảnh'
          : 'Tiếp tục tạo'

  // Tiến độ bàn làm việc: chế độ đầy đủ cần video từng cảnh + TTS ngoài; chế độ ảnh tĩnh chỉ cần lồng tiếng rồi ghép
  const progressItems = useMemo(() => {
    if (!project) return []
    const list = project.shots || []
    const imgs = list.filter((s) => s.image_url).length
    const auds = list.filter((s) => s.audio_url).length
    const vids = list.filter((s) => s.video_url).length
    const full = project.pipeline_mode !== 'image_text'
    const stage = effectiveStatus(project)
    type ProgressItem = { label: string; done: boolean; run?: boolean; pct?: number }
    const items: ProgressItem[] = [
      { label: 'Phân tích chủ đề', done: true },
      { label: 'Kịch bản storyboard', done: list.length > 0 || !['DRAFT', 'SCRIPTING'].includes(project.status) },
      {
        label: `Tạo ảnh (${imgs}/${list.length || 0})`,
        done: list.length > 0 && imgs === list.length,
      },
    ]
    if (full) {
      items.push({
        label: `Video từng cảnh (${vids}/${list.length || 0})`,
        done:
          list.length > 0 &&
          (vids === list.length ||
            ['VIDEO_READY', 'COMPOSING', 'AUDITING', 'DONE'].includes(stage)),
        run: stage === 'VIDEOING',
        pct: stage === 'VIDEOING' ? project.progress : undefined,
      })
    }
    items.push({
      label: `Lồng tiếng (${auds}/${list.length || 0})`,
      done: list.length > 0 && auds === list.length,
      run: stage === 'AUDIOING',
      pct: stage === 'AUDIOING' ? project.progress : undefined,
    })
    items.push({
      label: full ? 'Ghép các cảnh lại' : 'Dựng phim',
      done: Boolean(project.final_video_url) || project.status === 'DONE',
      run: stage === 'COMPOSING',
      pct: stage === 'COMPOSING' ? project.progress : undefined,
    })
    return items
  }, [project])

  function openFinalPreview() {
    if (!project?.final_video_url) return
    setPreview({
      kind: 'final',
      url: api.assetUrl(project.final_video_url, project.updated_at),
      title: project.title,
      bust: project.updated_at,
    })
  }

  async function continueGenerate() {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      setProject(await api.generate(project.id))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không tiếp tục tạo được.'
      if (msg.includes('合成成片')) {
        try {
          setError('')
          setProject(await api.compose(project.id))
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : 'Không ghép được phim.')
        }
        return
      }
      setError(msg)
      await handleBillingError(err, nav)
    } finally {
      setBusy(false)
    }
  }

  async function restartGenerate() {
    if (!project) return
    const ok = await dialog.confirm({
      title: 'Làm lại từ đầu',
      message: 'Xoá storyboard và tư liệu hiện tại, rồi chia lại các cảnh quay. Sau khi tạo bạn vẫn có thể duyệt rồi mới tiếp tục.',
      confirmText: 'Làm lại',
      cancelText: 'Để sau',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      setProject(await api.generate(project.id, { restart: true }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không làm lại được.'
      setError(msg)
      await handleBillingError(err, nav)
    } finally {
      setBusy(false)
    }
  }

  async function deleteProject() {
    if (!project) return
    const ok = await dialog.confirm({
      title: 'Xoá dự án',
      message: 'Xoá dự án này? Tư liệu và phim hoàn chỉnh sẽ mất luôn, thao tác này không hoàn tác được.',
      confirmText: 'Xoá',
      cancelText: 'Huỷ',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await api.deleteProject(project.id)
      nav('/history')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xoá dự án thất bại.')
    } finally {
      setBusy(false)
    }
  }

  async function composeOnly() {
    if (!project) return
    setBusy(true)
    try {
      setProject(await api.compose(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không ghép được phim.')
    } finally {
      setBusy(false)
    }
  }

  async function onCoverFile(file: File | null) {
    if (!project || !file) return
    setBusy(true)
    setError('')
    try {
      setProject(await api.uploadCover(project.id, file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải ảnh bìa lên thất bại.')
    } finally {
      setBusy(false)
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  async function useFirstShotCover() {
    if (!project) return
    const first = [...(project.shots || [])]
      .sort((a, b) => a.shot_no - b.shot_no)
      .find((s) => s.image_url)
    if (!first?.image_url) {
      setError('Chưa có cảnh quay nào có hình để làm ảnh bìa.')
      return
    }
    setBusy(true)
    setError('')
    try {
      setProject(await api.updateProject(project.id, { cover_url: first.image_url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đặt ảnh bìa thất bại.')
    } finally {
      setBusy(false)
    }
  }

  function openBatchAdjust() {
    if (!project) return
    setBatchSelected((project.shots || []).map((s) => s.id))
    setBatchDuration('')
    setBatchRegenAudio(false)
    setBatchOpen(true)
  }

  async function applyBatchAdjust() {
    if (!project || batchSelected.length === 0) return
    const durationVal = batchDuration.trim() === '' ? null : Number(batchDuration)
    if (durationVal != null && (!Number.isFinite(durationVal) || durationVal <= 0)) {
      setError('Hãy nhập thời lượng hợp lệ (giây).')
      return
    }
    if (durationVal == null && !batchRegenAudio) {
      setError('Hãy đặt thời lượng, hoặc tích lồng tiếng lại.')
      return
    }
    setBusy(true)
    setError('')
    try {
      for (const shotId of batchSelected) {
        if (durationVal != null) {
          await api.updateShot(project.id, shotId, { duration: durationVal })
        }
        if (batchRegenAudio) {
          await api.regenAudio(project.id, shotId)
        }
      }
      setProject(await api.getProject(project.id))
      setBatchOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chỉnh hàng loạt thất bại.')
      try {
        setProject(await api.getProject(project.id))
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (!project) return
    setBusy(true)
    try {
      await api.publish(project.id)
      nav('/history')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Phát hành thất bại.')
    } finally {
      setBusy(false)
    }
  }

  // Đánh dấu yêu cầu của riêng cảnh này đang chạy, không ghi đè cảnh khác
  function markShotBusy(shotId: number) {
    setBusyShotIds((ids) => new Set(ids).add(shotId))
  }

  // Chỉ xoá key của mình, tránh các yêu cầu song song giẫn khoá của nhau
  function markShotIdle(shotId: number) {
    setBusyShotIds((ids) => {
      const next = new Set(ids)
      next.delete(shotId)
      return next
    })
  }

  async function regenImage(shot: Shot) {
    if (!project) return
    markShotBusy(shot.id)
    try {
      setProject(await api.regenImage(project.id, shot.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo ảnh thất bại.')
    } finally {
      markShotIdle(shot.id)
    }
  }

  async function regenVideo(shot: Shot) {
    if (!project) return
    markShotBusy(shot.id)
    try {
      setProject(await api.regenVideo(project.id, shot.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo video thất bại.')
    } finally {
      markShotIdle(shot.id)
    }
  }

  async function regenAudio(shot: Shot) {
    if (!project) return
    // Lồng tiếng lại sẽ viết lại toàn bộ lời dẫn của phim, khoá cả bảng để hai luồng không tranh nhau
    setBusy(true)
    try {
      setProject(await api.regenAudio(project.id, shot.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lồng tiếng lại thất bại.')
    } finally {
      setBusy(false)
    }
  }

  function openShotEdit(shot: Shot, focus = '') {
    setEditFocus(focus)
    if (focus === 'narration') setEditMode('narration')
    else if (focus === 'segment_script') setEditMode('segment')
    else setEditMode('full')
    setEditing({ ...shot })
    setMenuShotId(null)
  }

  function closeShotEdit() {
    setEditing(null)
    setEditFocus('')
    setEditMode('full')
  }

  // Sửa lời dẫn thì ghi luôn vào đoạn lời dẫn trong kịch bản
  function patchEditingNarration(value: string) {
    if (!editing) return
    const script = editing.segment_script || editing.video_prompt || ''
    const next = replaceNarrationInScript(script, value)
    setEditing({
      ...editing,
      narration: value,
      segment_script: next,
      video_prompt: next,
    })
  }

  // Sửa khung hình mở đầu thì ghi luôn vào đoạn visual đầu tiên trong kịch bản
  function patchEditingVisual(value: string) {
    if (!editing) return
    const script = editing.segment_script || editing.video_prompt || ''
    const next = replaceFirstVisualInScript(script, value)
    setEditing({
      ...editing,
      img_prompt: value,
      segment_script: next,
      video_prompt: next,
    })
  }

  // Sửa kịch bản thì điền lại lời dẫn và khung hình mở đầu, đồng thời đặt thời lượng bằng tổng @duration
  function patchEditingScript(value: string) {
    if (!editing) return
    const tagged = sumDuration(value)
    setEditing({
      ...editing,
      segment_script: value,
      video_prompt: value,
      narration: narrationFromScript(value),
      img_prompt: firstVisualFromScript(value) || editing.img_prompt,
      duration: tagged > 0 ? tagged : editing.duration,
    })
  }

  async function saveShot() {
    if (!project || !editing) return
    // scriptText: kịch bản storyboard theo đoạn đang sửa
    const scriptText = editing.segment_script || editing.video_prompt || ''
    // durationCheck: kết quả kiểm tra thời lượng
    const durationCheck = validateSegmentScriptDuration(scriptText)
    if (!durationCheck.valid) {
      setError(durationCheck.message || 'Thời lượng storyboard không hợp lệ.')
      return
    }
    setBusy(true)
    try {
      await api.updateShot(project.id, editing.id, {
        narration: editing.narration,
        overlay_title: editing.overlay_title,
        overlay_subtitle: editing.overlay_subtitle,
        img_prompt: editing.img_prompt,
        video_prompt: editing.video_prompt,
        segment_script: editing.segment_script,
        duration: durationCheck.total > 0 ? durationCheck.total : Number(editing.duration) || 4,
        camera: editing.camera,
      })
      closeShotEdit()
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu thất bại.')
    } finally {
      setBusy(false)
    }
  }

  // Lưu prompt của dự án; giống mẫu ở trang quản trị thì xoá lớp ghi đè
  async function saveProjectPrompts() {
    if (!project || !promptEdit) return
    setBusy(true)
    try {
      const d = promptDefaults
      const styleOut = promptEdit.style_prompt.trim()
      const charOut = promptEdit.character_prompt.trim()
      const extraOut = promptEdit.extra_prompt.trim()
      const updated = await api.updateProject(project.id, {
        style_prompt: d && styleOut === d.style_prompt ? '' : styleOut,
        character_prompt: d && charOut === d.character_prompt ? '' : charOut,
        extra_prompt: d && extraOut === d.extra_prompt ? '' : extraOut,
      })
      setProject(updated)
      setPromptEdit(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu prompt thất bại.')
    } finally {
      setBusy(false)
    }
  }

  // Xoá lớp ghi đè của dự án, các lần tạo sau sẽ theo mẫu ở trang quản trị
  async function restoreTemplatePrompts() {
    if (!project) return
    setBusy(true)
    try {
      const updated = await api.updateProject(project.id, {
        style_prompt: '',
        character_prompt: '',
        extra_prompt: '',
      })
      setProject(updated)
      setPromptEdit(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không khôi phục được mẫu.')
    } finally {
      setBusy(false)
    }
  }

  if (!project && !error) {
    return (
      <AppShell active="studio">
        <p className="pf-muted">Đang tải…</p>
      </AppShell>
    )
  }

  if (!project) {
    return (
      <AppShell active="studio">
        <BillingErrorNotice message={error} />
      </AppShell>
    )
  }

  const structure = (project.shots || []).slice(0, 5).map((s, i) => {
    const labels = ['Mở đầu', 'Phát triển', 'Bước ngoặt', 'Đỉnh cao', 'Kết']
    return { label: labels[i] || `Đoạn ${i + 1}`, text: s.narration || s.overlay_title || '—' }
  })

  return (
    <AppShell active="studio" wide>
      <header className="pf-page-head studio-scoped">
        <div className="pf-page-head-row">
          <div>
            <button type="button" className="pf-back" onClick={() => nav(`/studio/${project.id}/style`)}>
              <IconChevronLeft size={18} />
              AI tạo storyboard / Bàn dựng storyboard
            </button>
            <h1 className="pf-page-title">{project.title}</h1>
          </div>
          <div className="pf-toolbar">
            {primaryAction === 'preview' ? (
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-sm pf-btn-icon"
                disabled={busy || !hasFinal}
                onClick={openFinalPreview}
              >
                <IconMonitor size={14} />
                Xem phim
              </button>
            ) : primaryAction === 'compose' ? (
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-sm pf-btn-icon"
                disabled={busy || running}
                onClick={composeOnly}
              >
                <IconPlay size={14} />
                Ghép phim
              </button>
            ) : (
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-sm pf-btn-icon"
                disabled={busy || running}
                onClick={() =>
                  shots.length === 0 ? nav(`/studio/${project.id}/style`) : void continueGenerate()
                }
              >
                <IconPlay size={14} />
                {generateLabel}
              </button>
            )}
            <button
              type="button"
              className="pf-btn-text"
              disabled={busy || running || shots.length === 0}
              onClick={openBatchAdjust}
            >
              <IconSliders size={15} />
              Chỉnh hàng loạt
            </button>
            <button
              type="button"
              className="pf-btn-text"
              disabled={busy || running}
              onClick={restartGenerate}
            >
              <IconRefresh size={15} />
              Làm lại từ đầu
            </button>
            {primaryAction !== 'preview' && hasFinal ? (
              <button type="button" className="pf-btn-text" onClick={openFinalPreview}>
                <IconMonitor size={15} />
                Xem phim
              </button>
            ) : null}
            {primaryAction === 'preview' && readyToCompose ? (
              <button
                type="button"
                className="pf-btn-text"
                disabled={busy || running}
                onClick={composeOnly}
                title="Ghép lại bằng các cảnh quay hiện tại"
              >
                Ghép lại
              </button>
            ) : null}
            {primaryAction !== 'generate' && !readyToCompose ? (
              <button
                type="button"
                className="pf-btn-text"
                disabled={busy || running}
                onClick={continueGenerate}
              >
                {generateLabel === BUSY_LABEL ? 'Tiếp tục tạo' : generateLabel}
              </button>
            ) : null}
            <button
              type="button"
              className="pf-btn pf-btn-outline pf-btn-sm pf-btn-icon"
              onClick={() => nav(`/studio/${project.id}/editor`)}
            >
              <IconEdit size={14} />
              Mở trình soạn thảo
            </button>
          </div>
        </div>
        <Stepper
          steps={kepuSteps(project.pipeline_mode)}
          current={step}
          doneThrough={Math.max(0, step - 1)}
        />
        <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0.55rem 0 0' }}>
          {kepuPhaseHint(project)}
        </p>
      </header>

      {error ? <BillingErrorNotice message={error} /> : null}
      {project.error_msg ? <p className="pf-error">{project.error_msg}</p> : null}

      <div className="pf-board studio-scoped">
        <aside className="pf-create-col">
          <h3>Thiết lập dự án</h3>
          {project.cover_url || template?.preview_cover ? (
            <img
              className="studio-cover"
              src={api.assetUrl(project.cover_url || template?.preview_cover)}
              alt=""
              style={{ width: '100%', borderRadius: 12, aspectRatio: '16/10', objectFit: 'cover' }}
            />
          ) : (
            <div className="studio-still studio-still--placeholder studio-cover-empty">
              <img src={getDramaImageStylePreviewUrl(EMPTY_ART.cover)} alt="" />
              <span className="studio-still-note">Chưa có ảnh bìa cho dự án</span>
            </div>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(e) => onCoverFile(e.target.files?.[0] || null)}
          />
          <div className="pf-side-actions">
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
              disabled={busy || running}
              onClick={() => coverInputRef.current?.click()}
            >
              <IconImage size={14} />
              Đổi ảnh bìa
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
              disabled={busy || running || !shots.some((s) => s.image_url)}
              onClick={useFirstShotCover}
              title="Lấy cảnh quay đầu tiên có hình làm ảnh bìa"
            >
              <IconImage size={14} />
              Dùng ảnh cảnh đầu
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
              disabled={shots.length === 0}
              onClick={() => downloadStoryboardCsv(project)}
            >
              <IconDownload size={14} />
              Xuất nháp
            </button>
          </div>
          <ul className="pf-meta-list" style={{ marginTop: '0.85rem' }}>
            <li>
              <span>Tên dự án</span>
              <span>{project.title}</span>
            </li>
            <li>
              <span>Trạng thái</span>
              <span>{statusLabel(project)}</span>
            </li>
            <li>
              <span>Tiến độ</span>
              <span>{project.progress}%</span>
            </li>
            <li>
              <span>Thời lượng</span>
              <span>
                {Math.floor(totalDuration / 60)
                  .toString()
                  .padStart(2, '0')}
                :
                {Math.floor(totalDuration % 60)
                  .toString()
                  .padStart(2, '0')}
              </span>
            </li>
            <li>
              <span>Tỉ lệ khung hình</span>
              <span>
                {project.output_ratio || (project.pipeline_mode === 'image_text' ? '9:16' : '16:9')}
              </span>
            </li>
            <li>
              <span>Cách dựng phim</span>
              <span>{project.pipeline_mode === 'image_text' ? IMAGE_TEXT_LABEL : FULL_LABEL}</span>
            </li>
            <li>
              <span>Phong cách</span>
              <span>{template?.name || project.template_id}</span>
            </li>
          </ul>
          <button
            type="button"
            className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm"
            onClick={() => nav(`/studio/${project.id}/style`)}
            disabled={running}
          >
            Sửa thiết lập dự án
          </button>
          <div className="pf-prompt-panel">
            <h4>Prompt tích hợp</h4>
            <p className="pf-muted" style={{ fontSize: '0.72rem', margin: '0 0 0.45rem' }}>
              Phong cách hình ảnh đến từ mẫu. Có nhân vật xuất hiện hay không do AI quyết theo mẫu và
              chủ đề; chỉ khi bạn sửa ở đây thì dự án này mới dùng bản riêng.
            </p>
            {(
              [
                ['Phong cách', displayPrompts.style_prompt],
                ['Nhân vật', displayPrompts.character_prompt],
                ['Bổ sung', displayPrompts.extra_prompt],
              ] as const
            ).map(([label, value]) => (
              <button
                key={label}
                type="button"
                className="pf-prompt-chip"
                disabled={busy || running}
                onClick={() =>
                  setPromptEdit({
                    style_prompt: displayPrompts.style_prompt,
                    character_prompt: displayPrompts.character_prompt,
                    extra_prompt: displayPrompts.extra_prompt,
                  })
                }
              >
                <strong>{label}</strong>
                <span>{(value || '').trim() || '(trống — bấm để sửa)'}</span>
              </button>
            ))}
          </div>
          <p className="pf-muted" style={{ fontSize: '0.75rem', marginTop: '0.75rem' }}>
            Nội dung do AI tạo ra, hãy kiểm tra lại độ chính xác trước khi dùng.
          </p>
        </aside>

        <div className="pf-board-main">
          <div className="pf-outline-grid">
            <article className="pf-create-col">
              <h3>Dàn ý do AI tạo</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.65 }}>
                {project.source_text}
              </p>
              <div className="pf-tags">
                <span>Chủ đề chính</span>
                <span>{project.source_type === 'script' ? 'Lời dẫn đầy đủ' : 'Chủ đề một câu'}</span>
              </div>
            </article>
            <article className="pf-create-col">
              <h3>Tóm tắt cấu trúc</h3>
              <ul className="pf-meta-list">
                {structure.length ? (
                  structure.map((s) => (
                    <li key={s.label}>
                      <span>{s.label}</span>
                      <span style={{ maxWidth: '60%', textAlign: 'right' }}>{s.text.slice(0, 36)}</span>
                    </li>
                  ))
                ) : (
                  <li>
                    <span>Chờ storyboard</span>
                    <span>—</span>
                  </li>
                )}
              </ul>
            </article>
          </div>

          <section className="pf-shot-card">
            <div className="pf-shot-card-head">
              <h3>Danh sách storyboard (tổng {project.shots.length} cảnh)</h3>
              <div className="pf-toolbar">
                {project.status === 'DONE' && hasFinal ? (
                  <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" disabled={busy} onClick={publish}>
                    Phát hành
                  </button>
                ) : null}
                {hasFinal ? (
                  <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={openFinalPreview}>
                    Xem phim
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pf-btn pf-btn-ghost pf-btn-sm"
                    disabled={busy || running || !readyToCompose}
                    onClick={composeOnly}
                  >
                    Ghép phim
                  </button>
                )}
              </div>
            </div>
            {project.shots.length === 0 ? (
              <div className="studio-board-empty">
                <span className="studio-board-art" aria-hidden>
                  <img src={getDramaImageStylePreviewUrl(EMPTY_ART.board)} alt="" />
                </span>
                <p className="pf-muted">
                  {running
                    ? 'Đang chia các cảnh quay…'
                    : 'Chưa có storyboard. Bắt đầu tạo ở trang cấu hình phong cách, duyệt và sửa xong bạn mới bấm tạo ảnh.'}
                </p>
              </div>
            ) : needsScriptConfirm ? (
              <p className="pf-muted" style={{ margin: '0 0 1rem' }}>
                Storyboard đã sẵn sàng. Bấm cột “Lời dẫn” để sửa lời đọc (kịch bản sẽ đồng bộ và
                ảnh hưởng tới lồng tiếng cả phim), bấm cột “Storyboard theo đoạn” để chỉnh nhịp hình
                và @duration. Duyệt xong hãy bấm: phí trừ theo từng bước — ảnh + lồng tiếng → video
                từng cảnh → ghép phim.
              </p>
            ) : null}
            {project.shots.length === 0 ? null : (
              <div className="pf-shot-table-wrap">
                <table className="pf-shot-table">
                  <thead>
                    <tr>
                      <th className="col-no">Cảnh</th>
                      <th className="col-thumb">Hình ảnh</th>
                      <th className="col-narr">Lời dẫn / thoại</th>
                      <th className="col-seg">Storyboard theo đoạn</th>
                      <th className="col-dur">Thời lượng</th>
                      <th className="col-status">Trạng thái</th>
                      <th className="col-ops">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shots.map((shot) => {
                      /*
                       * localBusy yêu cầu của riêng cảnh này đã gửi, tác vụ chưa ghi kết quả
                       * shotGenerating tác vụ của cảnh này hoặc đang gửi ở cục bộ
                       * pipelineLocked cả pipeline/lồng tiếng của cả phim đang chiếm
                       * displayKind / done / failed hiển thị theo độ đầy đủ của tư liệu
                       */
                      const localBusy = busyShotIds.has(shot.id)
                      const shotGenerating = isShotGenerating(project, shot.id) || localBusy
                      const pipelineLocked = isProjectWideBusy(project)
                      const rowBusy = busy || pipelineLocked || shotGenerating
                      const displayKind = shotDisplayKind(shot, {
                        pipelineMode: project.pipeline_mode,
                        generating: shotGenerating,
                      })
                      const done = shotDisplayDone(displayKind)
                      const failed = displayKind === 'failed'
                      const sceneTitle =
                        shot.overlay_title?.trim() || `Cảnh ${String(shot.shot_no).padStart(2, '0')}`
                      const narration = (shot.narration || '').trim()
                      const script = shot.segment_script || shot.video_prompt || ''
                      const { cues, beats } = parseSegmentScript(script)
                      const desc = scenePromptForDisplay(shot.img_prompt).trim()
                      return (
                        <tr key={shot.id}>
                          <td className="col-no">{String(shot.shot_no).padStart(2, '0')}</td>
                          <td className="col-thumb">
                            <button
                              type="button"
                              className="pf-shot-thumb-btn"
                              aria-label={`Xem trước ${sceneTitle}`}
                              onClick={() =>
                                setPreview({
                                  kind: 'shot',
                                  shotNo: shot.shot_no,
                                  imageUrl: shot.image_url,
                                  videoUrl: shot.video_url,
                                  audioUrl: shot.audio_url,
                                  caption: shotCaption(shot),
                                })
                              }
                            >
                              {shot.image_url ? (
                                <img
                                  className="pf-shot-thumb"
                                  src={api.assetUrl(shot.image_url, shot.version)}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <span
                                  className={[
                                    'studio-still studio-still--placeholder',
                                    'pf-shot-thumb empty',
                                    shotGenerating ? 'is-busy' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                >
                                  <img
                                    src={getDramaImageStylePreviewUrl(EMPTY_ART.shot)}
                                    alt=""
                                    loading="lazy"
                                  />
                                  <span className="studio-still-note">
                                    {shotGenerating ? 'Đang tạo' : 'Chờ tạo ảnh'}
                                  </span>
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="col-narr">
                            <button
                              type="button"
                              className="pf-shot-narration pf-shot-editable"
                              disabled={rowBusy}
                              title="Bấm để sửa lời dẫn và tiêu đề"
                              onClick={() => openShotEdit(shot, 'narration')}
                            >
                              <span className="title">{sceneTitle}</span>
                              <span className="line">
                                {narration ? `“${narration}”` : '—'}
                              </span>
                            </button>
                          </td>
                          <td className="col-seg">
                            <button
                              type="button"
                              className="pf-shot-desc pf-shot-editable"
                              disabled={rowBusy}
                              title="Bấm để sửa kịch bản storyboard theo từng đoạn"
                              onClick={() => openShotEdit(shot, 'segment_script')}
                              style={{ textAlign: 'left', width: '100%' }}
                            >
                              {cues.length > 0 ? (
                                <span className="pf-muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                                  {cues[0]?.replace(/^【|】$/g, '').slice(0, 28)}
                                  {cues[1]
                                    ? ` · ${cues[1].replace(/^【BGM：|】$/g, '').slice(0, 16)}`
                                    : ''}
                                </span>
                              ) : null}
                              {beats.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                                  {beats.slice(0, 4).map((b, i) => (
                                    <span key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                      {b.duration > 0 ? (
                                        <span
                                          style={{
                                            flex: '0 0 auto',
                                            fontSize: '0.72rem',
                                            background: '#111',
                                            color: '#fff',
                                            borderRadius: 4,
                                            padding: '1px 5px',
                                          }}
                                        >
                                          {b.duration}s
                                        </span>
                                      ) : null}
                                      <span style={{ fontSize: '0.82rem' }}>
                                        {b.text.length > 42 ? `${b.text.slice(0, 42)}…` : b.text}
                                      </span>
                                    </span>
                                  ))}
                                  {beats.length > 4 ? (
                                    <span className="pf-muted" style={{ fontSize: '0.75rem' }}>
                                      Còn {beats.length - 4} đoạn…
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                desc || '(bấm để điền storyboard theo đoạn)'
                              )}
                            </button>
                          </td>
                          <td className="col-dur">{formatMmSs(shotDisplayDurationSec(shot))}</td>
                          <td className="col-status">
                            <span
                              className={[
                                'pf-shot-status',
                                failed ? 'bad' : done ? '' : 'warn',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {done && !failed ? <span className="mark">✓</span> : null}
                              {shotDisplayLabel(displayKind)}
                            </span>
                          </td>
                          <td className="col-ops">
                            <div className="pf-shot-ops">
                              <button
                                type="button"
                                className="op"
                                disabled={rowBusy}
                                onClick={() => openShotEdit(shot)}
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                className="op"
                                disabled={rowBusy}
                                onClick={() => regenImage(shot)}
                              >
                                {shot.image_url ? 'Vẽ lại ảnh' : 'Tạo ảnh'}
                              </button>
                              {isFullPipeline ? (
                                <button
                                  type="button"
                                  className="op op-video"
                                  disabled={rowBusy || !shot.image_url}
                                  title={!shot.image_url ? 'Hãy tạo ảnh cho cảnh này trước' : undefined}
                                  onClick={() => regenVideo(shot)}
                                >
                                  {shot.video_url ? 'Tạo lại video' : 'Tạo video'}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="more"
                                aria-label="Thao tác khác"
                                disabled={rowBusy}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMenuShotId((id) => (id === shot.id ? null : shot.id))
                                }}
                              >
                                ⋮
                              </button>
                              {menuShotId === shot.id ? (
                                <div className="pf-shot-menu" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    disabled={rowBusy}
                                    onClick={() => {
                                      setMenuShotId(null)
                                      regenAudio(shot)
                                    }}
                                  >
                                    Lồng tiếng lại
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pf-shot-footer">
              <span className="pf-muted" style={{ fontSize: '0.82rem' }}>
                Tổng thời lượng: {formatMmSs(totalDuration)} | Ảnh: {project.shots.length} | Âm
                thanh: {project.shots.filter((s) => s.audio_url).length} đoạn | Độ phân giải: xem
                trước
              </span>
              <div className="pf-toolbar">
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
                  disabled={shots.length === 0}
                  onClick={() => downloadStoryboardCsv(project)}
                >
                  <IconDownload size={15} />
                  Xuất kịch bản storyboard
                </button>
                <button
                  type="button"
                  className="pf-btn-text"
                  disabled={busy || running}
                  onClick={deleteProject}
                >
                  <IconTrash size={15} />
                  Xoá dự án
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="pf-create-col pf-board-settings">
          <h3>Tiến độ tạo</h3>
          <ul className="pf-progress-list">
            {progressItems.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <span>
                  {item.done ? (
                    <span className="pf-check">✓</span>
                  ) : item.run ? (
                    `${item.pct ?? 0}%`
                  ) : (
                    '…'
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="pf-meter" style={{ marginTop: '1rem' }}>
            <i style={{ width: `${Math.min(100, project.progress)}%` }} />
          </div>
          <p className="pf-muted" style={{ fontSize: '0.82rem' }}>
            {statusLabel(project)}
          </p>
        </aside>
      </div>

      {batchOpen && project ? (
        <div className="modal-backdrop" onClick={() => !busy && setBatchOpen(false)}>
          <div className="modal studio-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Chỉnh hàng loạt storyboard</h3>
            <p className="pf-muted" style={{ marginTop: 0 }}>
              Đã chọn {batchSelected.length} / {project.shots.length} cảnh quay
            </p>
            <div className="studio-pick-list">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={batchSelected.length === project.shots.length && project.shots.length > 0}
                  onChange={(e) =>
                    setBatchSelected(e.target.checked ? project.shots.map((s) => s.id) : [])
                  }
                />
                Chọn tất cả
              </label>
              {project.shots
                .slice()
                .sort((a, b) => a.shot_no - b.shot_no)
                .map((s) => (
                  <label
                    key={s.id}
                    style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}
                  >
                    <input
                      type="checkbox"
                      checked={batchSelected.includes(s.id)}
                      onChange={(e) =>
                        setBatchSelected((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                    />
                    Cảnh quay {String(s.shot_no).padStart(2, '0')} ·{' '}
                    {formatMmSs(shotDisplayDurationSec(s))}
                  </label>
                ))}
            </div>
            <label>
              Thời lượng đồng nhất (giây, để trống nếu không đổi)
              <input
                type="number"
                min={1}
                step={0.5}
                placeholder="Ví dụ 6"
                value={batchDuration}
                onChange={(e) => setBatchDuration(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={batchRegenAudio}
                onChange={(e) => setBatchRegenAudio(e.target.checked)}
              />
              Lồng tiếng lại cho các cảnh đã chọn
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="pf-btn pf-btn-lime"
                disabled={busy || batchSelected.length === 0}
                onClick={applyBatchAdjust}
              >
                Áp dụng
              </button>
              <button
                type="button"
                className="pf-btn pf-btn-ghost"
                disabled={busy}
                onClick={() => setBatchOpen(false)}
              >
                Huỷ
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="modal-backdrop" onClick={closeShotEdit}>
          <div
            className={[
              'modal',
              'pf-prompt-modal',
              editMode === 'narration' ? 'pf-prompt-modal--narration' : '',
              editMode === 'segment' ? 'pf-prompt-modal--segment' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>
              {editMode === 'narration'
                ? `Sửa cảnh quay ${editing.shot_no} · Lời dẫn và tiêu đề`
                : editMode === 'segment'
                  ? `Sửa cảnh quay ${editing.shot_no} · Storyboard theo đoạn`
                  : `Sửa cảnh quay ${editing.shot_no} · Toàn bộ prompt`}
            </h3>
            <div className="pf-prompt-modal-scroll">
              {editMode === 'narration' || editMode === 'full' ? (
                <>
                  <label>
                    Tiêu đề cảnh quay
                    <input
                      autoFocus={editFocus === 'title' || editMode === 'narration'}
                      value={editing.overlay_title || ''}
                      onChange={(e) => setEditing({ ...editing, overlay_title: e.target.value })}
                    />
                    <span className="pf-muted pf-prompt-hint">
                      Tên hiển thị trong danh sách storyboard; chế độ ảnh tĩnh sẽ đè lên đầu khung
                      hình
                    </span>
                  </label>
                  <label>
                    Tiêu đề phụ
                    <input
                      value={editing.overlay_subtitle || ''}
                      onChange={(e) => setEditing({ ...editing, overlay_subtitle: e.target.value })}
                    />
                    <span className="pf-muted pf-prompt-hint">
                      Dòng chữ đè trong chế độ ảnh tĩnh; chế độ AI video không khắc dòng này, nó chỉ
                      làm ghi chú cho storyboard
                    </span>
                  </label>
                  <label>
                    Lời dẫn
                    <textarea
                      autoFocus={editFocus === 'narration'}
                      value={editing.narration}
                      onChange={(e) => patchEditingNarration(e.target.value)}
                      rows={editMode === 'narration' ? 6 : 3}
                    />
                    <span className="pf-muted pf-prompt-hint">
                      Đồng bộ vào đoạn lời dẫn của kịch bản và ảnh hưởng tới lồng tiếng cả phim (sửa
                      xong cần tạo lại lồng tiếng hoặc ghép lại phim)
                    </span>
                  </label>
                </>
              ) : null}
              {editMode === 'full' ? (
                <label>
                  Prompt hình ảnh (khung mở đầu)
                  <textarea
                    autoFocus={editFocus === 'img_prompt'}
                    value={editing.img_prompt}
                    onChange={(e) => patchEditingVisual(e.target.value)}
                    rows={3}
                  />
                  <span className="pf-muted pf-prompt-hint">
                    Đồng bộ vào đoạn hình ảnh đầu tiên của kịch bản; cả tạo ảnh lẫn tạo video đều
                    dùng đoạn này
                  </span>
                </label>
              ) : null}
              {editMode === 'segment' || editMode === 'full' ? (
                <>
                  <label>
                    Kịch bản storyboard theo đoạn (nhịp hình và @duration)
                    <textarea
                      className="pf-prompt-segment"
                      autoFocus={editFocus === 'segment_script' || editMode === 'segment'}
                      value={editing.segment_script || editing.video_prompt || ''}
                      onChange={(e) => patchEditingScript(e.target.value)}
                      rows={editMode === 'segment' ? 8 : 5}
                      placeholder={SEGMENT_SCRIPT_PLACEHOLDER}
                    />
                  </label>
                  <div className="pf-chips pf-prompt-duration-chips">
                    {editDurationCheck.durations.length > 0 ? (
                      editDurationCheck.durations.map((sec, i) => (
                        <span key={`${sec}-${i}`} className="pf-chip" style={{ cursor: 'default' }}>
                          {sec}s
                        </span>
                      ))
                    ) : (
                      <span className="pf-muted" style={{ fontSize: '0.8rem' }}>
                        Chưa có nhãn @duration nào
                      </span>
                    )}
                    <span
                      className="pf-muted"
                      style={{
                        fontSize: '0.8rem',
                        marginLeft: 'auto',
                        color: editDurationCheck.valid ? undefined : 'var(--pf-danger, #c0392b)',
                      }}
                    >
                      Tổng {editDurationCheck.total}s / {SHOT_DURATION_MAX}s
                    </span>
                  </div>
                  {!editDurationCheck.valid && editDurationCheck.message ? (
                    <p className="pf-error pf-prompt-duration-error">{editDurationCheck.message}</p>
                  ) : null}
                  <label>
                    Ghi chú cử động máy
                    <input
                      value={editing.camera || ''}
                      onChange={(e) => setEditing({ ...editing, camera: e.target.value })}
                    />
                  </label>
                  <div className="pf-prompt-modal-row">
                    <label>
                      Thời lượng (giây, sau khi lưu sẽ tính lại theo @duration)
                      <input
                        type="number"
                        value={editing.duration}
                        onChange={(e) => setEditing({ ...editing, duration: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                </>
              ) : null}
            </div>
            <div className="pf-prompt-modal-foot">
              {editMode !== 'segment' ? (
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm"
                  onClick={() => {
                    setEditMode('segment')
                    setEditFocus('segment_script')
                  }}
                >
                  Storyboard theo đoạn…
                </button>
              ) : null}
              {editMode !== 'narration' ? (
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm"
                  onClick={() => {
                    setEditMode('narration')
                    setEditFocus('narration')
                  }}
                >
                  Lời dẫn và tiêu đề…
                </button>
              ) : null}
              {editMode !== 'full' ? (
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm"
                  onClick={() => {
                    setEditMode('full')
                    setEditFocus('')
                  }}
                >
                  Toàn bộ trường
                </button>
              ) : null}
              <span className="pf-prompt-modal-foot-spacer" />
              <button
                type="button"
                className="pf-btn pf-btn-lime"
                disabled={busy || !editDurationCheck.valid}
                onClick={saveShot}
              >
                Lưu
              </button>
              <button type="button" className="pf-btn pf-btn-ghost" onClick={closeShotEdit}>
                Huỷ
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {promptEdit ? (
        <div className="modal-backdrop" onClick={() => setPromptEdit(null)}>
          <div className="modal pf-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Prompt tích hợp của dự án</h3>
            <p className="pf-muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
              Mặc định theo mẫu ở trang quản trị. Lưu nội dung trùng với mẫu sẽ tự xoá lớp ghi đè;
              các cảnh đã tạo phải bấm tạo lại mới cập nhật.
            </p>
            <label>
              Prompt phong cách
              <textarea
                value={promptEdit.style_prompt}
                onChange={(e) => setPromptEdit({ ...promptEdit, style_prompt: e.target.value })}
                rows={3}
              />
            </label>
            <label>
              Prompt nhân vật
              <textarea
                autoFocus
                value={promptEdit.character_prompt}
                onChange={(e) => setPromptEdit({ ...promptEdit, character_prompt: e.target.value })}
                rows={3}
              />
            </label>
            <label>
              Yêu cầu bổ sung
              <textarea
                value={promptEdit.extra_prompt}
                onChange={(e) => setPromptEdit({ ...promptEdit, extra_prompt: e.target.value })}
                rows={2}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="pf-btn pf-btn-lime"
                disabled={busy}
                onClick={saveProjectPrompts}
              >
                Lưu
              </button>
              <button
                type="button"
                className="pf-btn pf-btn-ghost"
                disabled={busy}
                onClick={() => void restoreTemplatePrompts()}
              >
                Khôi phục mẫu gốc
              </button>
              <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setPromptEdit(null)}>
                Huỷ
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>
                {preview.kind === 'final' ? preview.title : `Cảnh quay ${preview.shotNo}`}
              </h3>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => setPreview(null)}>
                Đóng
              </button>
            </div>
            {preview.kind === 'final' ? (
              <video className="preview-media" src={preview.url} controls autoPlay />
            ) : preview.videoUrl ? (
              <video
                className="preview-media"
                src={api.assetUrl(preview.videoUrl)}
                poster={preview.imageUrl ? api.assetUrl(preview.imageUrl) : undefined}
                controls
                autoPlay
              />
            ) : preview.imageUrl ? (
              <img className="preview-media" src={api.assetUrl(preview.imageUrl)} alt="" />
            ) : (
              <div className="studio-still studio-still--placeholder studio-preview-none">
                <img src={getDramaImageStylePreviewUrl(EMPTY_ART.shot)} alt="" />
                <span className="studio-still-note">Cảnh này chưa có hình để xem trước</span>
              </div>
            )}
            {preview.kind === 'shot' && preview.audioUrl ? (
              <audio src={api.assetUrl(preview.audioUrl)} controls style={{ width: '100%' }} />
            ) : null}
            {preview.kind === 'shot' ? <p className="pf-muted">{preview.caption}</p> : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}
