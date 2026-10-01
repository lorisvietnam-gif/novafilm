import { getActiveLocale } from '../i18n/detect'
import { messages } from '../i18n/messages'
import { localized, type LocalizedText } from './localeStrings'

export const RUNNING = new Set([
  'SCRIPTING',
  'IMAGING',
  'VIDEOING',
  'AUDIOING',
  'COMPOSING',
  'AUDITING',
  'PARALLEL_ASSETS',
])

// Lấy nhãn trạng thái theo ngôn ngữ giao diện hiện tại (giữ tương thích với cách gọi cũ STATUS_CN[code])
export const STATUS_CN: Record<string, string> = new Proxy(
  {},
  {
    get(_target, prop: string) {
      const map = messages[getActiveLocale()].status as Record<string, string>
      return map[prop] || prop
    },
  },
)

export function isRunning(status: string) {
  return RUNNING.has(status)
}

export function hasActiveTasks(project: {
  active_tasks?: Array<{ status: string; cancel_requested?: boolean | null }> | null
}) {
  const activeStatuses = ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review']
  return Boolean(
    project.active_tasks?.some(
      (task) => !task.cancel_requested && activeStatuses.includes(task.status),
    ),
  )
}

/**
 * Ưu tiên suy ra giai đoạn từ tư liệu của từng cảnh khi trạng thái vẫn còn là SCRIPTING
 * (ví dụ nút tiếp tục tạo bị gắn nhãn sai trong chốc lát, hoặc worker chậm).
 */
export function effectiveStatus(project: {
  status: string
  pipeline_mode?: string | null
  shots?: Array<{ image_url?: string | null; audio_url?: string | null; video_url?: string | null }>
}): string {
  const status = project.status
  const shots = project.shots || []
  if (status !== 'SCRIPTING' || shots.length === 0) return status

  const full = project.pipeline_mode !== 'image_text'
  const imgs = shots.filter((s) => s.image_url).length
  const auds = shots.filter((s) => s.audio_url).length
  const vids = shots.filter((s) => s.video_url).length
  const n = shots.length
  // Ở pipeline full, phần lồng tiếng do mô hình video đảm nhiệm nên không cần audio_url của TTS
  const assetsOk = full ? imgs === n : imgs === n && auds === n

  if (assetsOk) {
    if (full && vids < n) return 'VIDEOING'
    if (full && vids === n) return 'COMPOSING'
    if (!full) return 'COMPOSING'
  }
  if (imgs > 0 || auds > 0) return 'IMAGING'
  return status
}

export function statusLabel(projectOrStatus: string | Parameters<typeof effectiveStatus>[0]) {
  const status = typeof projectOrStatus === 'string' ? projectOrStatus : effectiveStatus(projectOrStatus)
  return STATUS_CN[status] || status
}

export function statusTone(status: string): 'ok' | 'bad' | 'run' | 'idle' {
  if (status === 'DONE') return 'ok'
  if (status === 'FAILED' || status === 'REJECTED' || status === 'CANCELLED') return 'bad'
  if (isRunning(status)) return 'run'
  return 'idle'
}

/** Trạng thái của từng cảnh, lấy từ pipeline */
export const SHOT_STATUS_CN: Record<string, string> = new Proxy(
  {},
  {
    get(_target, prop: string) {
      const map = messages[getActiveLocale()].shotStatus as Record<string, string>
      return map[prop] || STATUS_CN[prop] || prop
    },
  },
)

// Giữ tương thích với cách gọi cũ: dịch trực tiếp shot.status
export function shotStatusLabel(status: string) {
  return SHOT_STATUS_CN[status] || STATUS_CN[status] || status
}

// Phép đánh giá «trạng thái cuối của cảnh» theo cách cũ; bảng storyboard nên dùng shotDisplayDone
export function shotIsDone(status: string) {
  return ['AUDIO_READY', 'VIDEO_READY', 'DONE', 'IMAGE_READY'].includes(status)
}

/** Bảng storyboard hiển thị theo độ đầy đủ của tư liệu, không tin mù quáng vào shot.status (AUDIO_READY chỉ nói về lồng tiếng) */
export type ShotDisplayKind =
  | 'failed'
  | 'generating'
  | 'wait_image'
  | 'wait_video'
  | 'image_ready'
  | 'video_ready'

export type ShotAssetLike = {
  status?: string | null
  image_url?: string | null
  video_url?: string | null
}

/*
 * SHOT_TASK_ACTIVE các trạng thái đang chạy ở trung tâm tác vụ
 * PROJECT_WIDE_TASKS tác vụ chiếm cả phim, tạo từng cảnh cần tránh
 */
const SHOT_TASK_ACTIVE = [
  'pending',
  'leased',
  'running',
  'awaiting_poll',
  'awaiting_review',
  'cancel_requested',
]
const PROJECT_WIDE_TASKS = new Set([
  'project_pipeline',
  'project_compose_only',
  'project_regen_audio',
  'shot_regen_audio',
])

/** Suy ra trạng thái hiển thị của một cảnh từ việc ảnh / video đã đủ hay chưa */
export function shotDisplayKind(
  shot: ShotAssetLike,
  opts?: { pipelineMode?: string | null; generating?: boolean },
): ShotDisplayKind {
  if (opts?.generating) return 'generating'
  if (shot.status === 'FAILED') return 'failed'
  if (!shot.image_url) return 'wait_image'
  const full = opts?.pipelineMode !== 'image_text'
  if (full && !shot.video_url) return 'wait_video'
  if (full) return 'video_ready'
  return 'image_ready'
}

/** Tư liệu của cảnh đã đủ chưa (chế độ ảnh thì xem ảnh, pipeline đầy đủ thì xem video) */
export function shotDisplayDone(kind: ShotDisplayKind) {
  return kind === 'image_ready' || kind === 'video_ready'
}

/** Văn bản trạng thái tư liệu dùng cho bảng storyboard / CSV */
export function shotDisplayLabel(kind: ShotDisplayKind) {
  const key = {
    failed: 'FAILED',
    generating: 'GENERATING',
    wait_image: 'WAIT_IMAGE',
    wait_video: 'WAIT_VIDEO',
    image_ready: 'IMAGE_READY',
    video_ready: 'VIDEO_READY',
  }[kind]
  return SHOT_STATUS_CN[key] || key
}

type TaskLike = {
  status: string
  task_type?: string | null
  shot_id?: number | null
  cancel_requested?: boolean | null
}

/** Pipeline cả phim / ghép phim / lồng tiếp toàn phim đang chạy */
export function isProjectWideBusy(project: {
  status?: string
  active_tasks?: TaskLike[] | null
}) {
  const tasks = project.active_tasks
  if (Array.isArray(tasks)) {
    return tasks.some(
      (task) =>
        SHOT_TASK_ACTIVE.includes(task.status) && PROJECT_WIDE_TASKS.has(task.task_type || ''),
    )
  }
  return isRunning(project.status || '')
}

/** Cảnh này có tác vụ tạo riêng đang chạy hay không */
export function isShotGenerating(
  project: { active_tasks?: TaskLike[] | null } | null | undefined,
  shotId: number,
) {
  return Boolean(
    project?.active_tasks?.some(
      (task) => task.shot_id === shotId && SHOT_TASK_ACTIVE.includes(task.status),
    ),
  )
}

export function formatMmSs(seconds: number) {
  const s = Math.max(0, Math.round(seconds || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/** Các bước của chuỗi kiến thức phổ thông: dùng chung cho tạo dự án / phong cách / bàn storyboard */
const KEPU_STEP_LABELS: Record<string, LocalizedText> = {
  topic: { zh: '选题', en: 'Topic', vi: 'Chủ đề' },
  style: { zh: '风格', en: 'Style', vi: 'Phong cách' },
  confirm: { zh: '确认分镜', en: 'Confirm boards', vi: 'Duyệt storyboard' },
  assets: { zh: '画面与配音', en: 'Stills and voice', vi: 'Hình ảnh và lồng tiếng' },
  videos: { zh: '镜头视频', en: 'Shot clips', vi: 'Video từng cảnh' },
  compose: { zh: '合成预览', en: 'Compose preview', vi: 'Xem bản ghép' },
}

type KepuStep = { key: string; label: string }

function kepuStep(key: string): KepuStep {
  return {
    key,
    get label() {
      return localized(KEPU_STEP_LABELS[key] || KEPU_STEP_LABELS.topic)
    },
  }
}

export const KEPU_STEPS: KepuStep[] = [
  kepuStep('topic'),
  kepuStep('style'),
  kepuStep('confirm'),
  kepuStep('assets'),
  kepuStep('videos'),
  kepuStep('compose'),
]

export const CREATE_STEPS = KEPU_STEPS
export const BOARD_STEPS = KEPU_STEPS

/** Pipeline ảnh tĩnh bỏ qua bước «Video từng cảnh» */
export function kepuSteps(pipelineMode?: string | null) {
  if (pipelineMode === 'image_text') {
    return KEPU_STEPS.filter((s) => s.key !== 'videos')
  }
  return KEPU_STEPS
}

export type KepuWizardPage = 'create' | 'style' | 'board'

export type KepuBillingPhase = 'script' | 'assets' | 'videos' | 'compose'

/** Khớp với resolve_kepu_billing_phase của backend (frontend không tự dò tệp gần như im lặng). */
export function kepuBillingPhase(project: {
  pipeline_mode?: string | null
  shots?: Array<{ image_url?: string | null; audio_url?: string | null; video_url?: string | null }>
}): KepuBillingPhase {
  const shots = project.shots || []
  if (!shots.length) return 'script'
  const full = project.pipeline_mode !== 'image_text'
  const needImages = shots.some((s) => !s.image_url)
  const needAudio = !full && shots.some((s) => !s.audio_url)
  if (needImages || needAudio) return 'assets'
  if (full && shots.some((s) => !s.video_url)) return 'videos'
  return 'compose'
}

export function shotsByNo<T extends { shot_no: number }>(shots: T[] | null | undefined): T[] {
  return [...(shots || [])].sort((a, b) => a.shot_no - b.shot_no)
}

/**
 * Chỉ số của bước hiện tại; bàn storyboard khớp với script / assets / videos / compose.
 */
export function kepuStepIndex(
  page: KepuWizardPage,
  project?: {
    status: string
    pipeline_mode?: string | null
    final_video_url?: string | null
    shots?: Array<{ image_url?: string | null; audio_url?: string | null; video_url?: string | null }>
  } | null,
): number {
  const steps = kepuSteps(project?.pipeline_mode)
  const idx = (key: string) => {
    const n = steps.findIndex((s) => s.key === key)
    return n >= 0 ? n : 0
  }
  if (page === 'create') return idx('topic')
  if (page === 'style') return idx('style')
  if (!project) return idx('confirm')
  const status = effectiveStatus(project)
  const shots = project.shots || []
  if (isRunning(status)) {
    if (status === 'VIDEOING') return idx('videos')
    if (['IMAGING', 'AUDIOING', 'PARALLEL_ASSETS'].includes(status)) return idx('assets')
    if (['COMPOSING', 'AUDITING'].includes(status)) return idx('compose')
  }
  if (project.final_video_url && status === 'DONE') return idx('compose')
  const phase = kepuBillingPhase(project)
  if (phase === 'compose') return idx('compose')
  if (phase === 'videos') return idx('videos')
  if (phase === 'assets') return idx('assets')
  if (status === 'DRAFT' && shots.length === 0) return idx('style')
  return idx('confirm')
}

/** Cạnh nút chính ở bàn storyboard: bước này làm gì, có tạm trừ trước hay không */
export function kepuPhaseHint(project: {
  status: string
  pipeline_mode?: string | null
  shots?: Array<{ image_url?: string | null; audio_url?: string | null; video_url?: string | null }>
}): string {
  if (isRunning(effectiveStatus(project))) {
    return localized({
      zh: '生成进行中，可在右侧查看各阶段进度。',
      en: 'Generation is running; stage progress is on the right.',
      vi: 'Đang tạo, bạn có thể xem tiến độ từng giai đoạn ở bên phải.',
    })
  }
  const phase = kepuBillingPhase(project)
  if (phase === 'script') {
    // Câu này hiện ngay dưới thanh điều hướng, là câu đầu tiên người dùng đọc ở
    // bước này — nên nó phải nói **làm gì trước**, không phải giải thích luồng.
    // Bản cũ dùng từ chuyên ngành ("tạm trừ phí") và câu bị dài, đọc như văn bản dịch máy.
    return localized({
      zh: '先到风格页点「生成故事板」把剧本拆成镜头。这一步只产生文字模型的费用，还不会出图或出视频。',
      en: 'Open the style page and press "Generate storyboard" to split the script into shots. This step only costs the text model — no images or clips yet.',
      vi: 'Sang trang phong cách và bấm «Tạo storyboard» để tách kịch bản thành cảnh. Bước này mới tính phí mô hình văn bản, chưa tạo ảnh hay video.',
    })
  }
  if (phase === 'assets') {
    return localized({
      zh: '确认旁白与画面后开始生成：按镜头依次出图（后镜参考上一镜）+ 整片配音。',
      en: 'Confirm narration and stills, then generate: images shot by shot (each referencing the previous one) plus full voice.',
      vi: 'Duyệt lời dẫn và hình ảnh rồi bắt đầu tạo: ảnh ra theo thứ tự cảnh (cảnh sau tham chiếu cảnh trước) cộng lồng tiếng toàn phim.',
    })
  }
  if (phase === 'videos') {
    return localized({
      zh: '画面与配音已齐。下一步按镜头依次出视频，后镜参考上一镜尾帧。',
      en: 'Stills and voice are ready. Next, video shot by shot, each referencing the tail frame of the previous one.',
      vi: 'Hình ảnh và lồng tiếng đã đủ. Bước sau tạo video theo thứ tự cảnh, cảnh sau tham chiếu khung hình cuối của cảnh trước.',
    })
  }
  return localized({
    zh: '素材已齐。拼接成片走后期合成（叠旁白字幕与配乐，扣费很少）。',
    en: 'All assets are ready. The final film is composed in post (laying in narration subtitles and music, at low cost).',
    vi: 'Tư liệu đã đủ. Ghép phim hoàn chỉnh ở bước hậu kỳ (chồng phụ đề lời dẫn và nhạc nền, phí rất nhỏ).',
  })
}
