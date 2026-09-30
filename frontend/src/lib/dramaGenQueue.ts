/**
 * Hàng đợi sinh toàn cục của AI Drama: ảnh / video và các tác vụ khác dùng chung
 * một chỗ để hiển thị và để khôi phục.
 */
import { useSyncExternalStore } from 'react'
import type { DramaTaskBrief } from '../api/drama'
import { localized, type LocalizedText } from './localeStrings'

export type DramaGenJobKind = 'image' | 'video'

export type DramaGenJobStatus = 'queued' | 'running' | 'done' | 'failed'

export type DramaGenJob = {
  id: string
  kind: DramaGenJobKind
  projectId: number
  /** id của tài nguyên hoặc id của storyboard */
  targetId: number
  episodeId?: number
  /** task_runs.id của nền tảng tác vụ thống nhất, dùng để mở chi tiết */
  taskId?: number
  title: string
  /**
   * Nhãn phụ kiểu: nhân vật / bối cảnh / video storyboard…
   *
   * Đây là **giá trị so sánh**, không phải chữ hiển thị. `EpisodeEditPage.tsx`
   * (ngoài lane này) cũng gán đúng hai token dưới đây, nên chúng phải giữ nguyên
   * bằng tiếng Trung. Muốn hiển thị tiếng Việt thì dùng `dramaGenSubtypeLabel()`.
   */
  subtype: string
  status: DramaGenJobStatus
  message?: string
  error?: string
  createdAt: number
  finishedAt?: number
}

/**
 * Hai token phụ kiểu dưới đây là **hợp đồng dữ liệu**, không phải chữ hiển thị:
 * `pages/drama/EpisodeEditPage.tsx` (ngoài lane này) gán đúng hai giá trị này vào
 * `subtype`, và panel của ta tự so sánh với chúng. Giữ nguyên tiếng Trung; chữ hiển
 * thị lấy qua `dramaGenSubtypeLabel`.
 */
export const FRAGMENT_VIDEO_SUBTYPE = '分镜视频'
export const CANVAS_VIDEO_SUBTYPE = '画布视频'

const SUBTYPE_LABEL: Record<string, LocalizedText> = {
  [FRAGMENT_VIDEO_SUBTYPE]: { zh: '分镜视频', en: 'Storyboard clip', vi: 'Video storyboard' },
  [CANVAS_VIDEO_SUBTYPE]: { zh: '画布视频', en: 'Canvas clip', vi: 'Video trên canvas' },
}

/** Dịch token `subtype` sang chữ hiển thị. Token lạ thì trả về nguyên văn. */
export function dramaGenSubtypeLabel(subtype: string): string {
  const known = SUBTYPE_LABEL[subtype]
  return known ? localized(known) : subtype
}

/** Thông báo trạng thái do ta tự viết — tiếng Trung chỉ để giữ đúng khi chạy ở locale zh. */
const MESSAGE: Record<string, LocalizedText> = {
  renderingImage: { zh: '生图中', en: 'Rendering image', vi: 'Đang tạo ảnh' },
  renderingVideo: { zh: '生视频中', en: 'Rendering video', vi: 'Đang tạo video' },
  queued: { zh: '排队中', en: 'Queued', vi: 'Đang chờ' },
  generating: { zh: '生成中', en: 'Generating', vi: 'Đang tạo' },
  renderingRefs: { zh: '生成参考图…', en: 'Rendering reference images…', vi: 'Đang tạo ảnh tham chiếu…' },
  enqueued: { zh: '已入队', en: 'Added to queue', vi: 'Đã thêm vào hàng đợi' },
  cancelled: { zh: '已取消', en: 'Cancelled', vi: 'Đã huỷ' },
  interrupted: {
    zh: '任务已中断，请重新生成',
    en: 'The task was interrupted. Please generate it again.',
    vi: 'Tác vụ đã bị gián đoạn, vui lòng tạo lại.',
  },
  imageAsset: { zh: '资产', en: 'Asset', vi: 'Tài nguyên' },
  videoAsset: { zh: '视频', en: 'Video', vi: 'Video' },
  shot: { zh: '片段', en: 'Shot', vi: 'Cảnh' },
  fragmentClip: { zh: '分镜视频', en: 'Storyboard clip', vi: 'Video storyboard' },
}

type Listener = () => void

const DONE_RETENTION_MS = 10 * 60 * 1000
const EMPTY: DramaGenJob[] = []

/*
 * jobs       danh sách tác vụ thống nhất
 * cachedSnapshot  ảnh chụp bên ngoài
 * listeners  các subscriber
 */
let jobs: DramaGenJob[] = []
let cachedSnapshot: DramaGenJob[] = EMPTY
const listeners = new Set<Listener>()
// Người dùng đã tự xoá thì tác vụ đó không bị ghi lại bởi vòng poll hay đồng bộ trạng thái
const dismissedJobIds = new Set<string>()

// Khi tác vụ vào hàng đợi lại thì bỏ cờ "đã bị xoá"
function undismissJob(jobId: string): void {
  dismissedJobIds.delete(jobId)
}

// Có bỏ qua việc ghi lại mục đã xong không (chưa theo dõi, hoặc người dùng đã xoá)
function shouldSkipFinishedResync(
  jobId: string,
  rawStatus: string,
  existing: DramaGenJob | undefined,
  hasActiveTask: boolean,
): boolean {
  if (dismissedJobIds.has(jobId) && !['queued', 'running', 'generating'].includes(rawStatus)) {
    return true
  }
  if (existing || hasActiveTask) return false
  return ['done', 'failed', 'cancelled', 'idle'].includes(rawStatus)
}

// Hai ảnh chụp có tương đương không
function snapshotsEqual(a: DramaGenJob[], b: DramaGenJob[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.message !== y.message ||
      x.error !== y.error ||
      x.finishedAt !== y.finishedAt ||
      x.title !== y.title ||
      x.taskId !== y.taskId
    ) {
      return false
    }
  }
  return true
}

// Dọn mục đã xong / đã lỗi quá hạn (mục đang chạy thì không bao giờ bị dọn)
function pruneFinished() {
  const now = Date.now()
  jobs = jobs.filter((job) => {
    if (job.status === 'queued' || job.status === 'running') return true
    if (!job.finishedAt) return true
    return now - job.finishedAt < DONE_RETENTION_MS
  })
}

// Làm mới ảnh chụp rồi báo các subscriber
function emit() {
  pruneFinished()
  const next = jobs.length === 0 ? EMPTY : [...jobs]
  if (snapshotsEqual(cachedSnapshot, next)) return
  cachedSnapshot = next
  listeners.forEach((fn) => fn())
}

// Đọc ảnh chụp
export function getDramaGenQueue(): DramaGenJob[] {
  pruneFinished()
  if (jobs.length === 0) {
    cachedSnapshot = EMPTY
    return EMPTY
  }
  if (!snapshotsEqual(cachedSnapshot, jobs)) {
    cachedSnapshot = [...jobs]
  }
  return cachedSnapshot
}

// Đăng ký subscriber
export function subscribeDramaGenQueue(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Hook
export function useDramaGenQueue(): DramaGenJob[] {
  return useSyncExternalStore(subscribeDramaGenQueue, getDramaGenQueue, getDramaGenQueue)
}

// Số tác vụ đang chạy (con số trên nút tròn)
export function getDramaGenActiveCount(): number {
  return jobs.filter((j) => j.status === 'queued' || j.status === 'running').length
}

// Hai tác vụ có các trường hiển thị giống nhau không
function jobDisplayEqual(a: DramaGenJob, b: DramaGenJob): boolean {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.projectId === b.projectId &&
    a.targetId === b.targetId &&
    a.episodeId === b.episodeId &&
    a.title === b.title &&
    a.subtype === b.subtype &&
    a.status === b.status &&
    a.message === b.message &&
    a.error === b.error &&
    a.finishedAt === b.finishedAt &&
    a.taskId === b.taskId
  )
}

// Ghi hoặc cập nhật một tác vụ; khi silent thì chỉ sửa bộ nhớ, emit do caller lo
export function upsertDramaGenJob(
  patch: Omit<DramaGenJob, 'createdAt' | 'finishedAt'> & {
    createdAt?: number
    finishedAt?: number
  },
  options?: { silent?: boolean },
): void {
  if (dismissedJobIds.has(patch.id)) {
    if (patch.status === 'queued' || patch.status === 'running') {
      undismissJob(patch.id)
    } else {
      return
    }
  }
  const idx = jobs.findIndex((j) => j.id === patch.id)
  const prev = idx >= 0 ? jobs[idx] : null
  const status = patch.status
  const finishedAt =
    status === 'done' || status === 'failed'
      ? patch.finishedAt ?? prev?.finishedAt ?? Date.now()
      : undefined
  const next: DramaGenJob = {
    id: patch.id,
    kind: patch.kind,
    projectId: patch.projectId,
    targetId: patch.targetId,
    episodeId: patch.episodeId,
    taskId: patch.taskId ?? prev?.taskId,
    title: patch.title,
    subtype: patch.subtype,
    status,
    message: patch.message,
    error: patch.error,
    createdAt: patch.createdAt ?? prev?.createdAt ?? Date.now(),
    finishedAt,
  }
  if (prev && jobDisplayEqual(prev, next)) return
  if (idx >= 0) {
    jobs = jobs.map((j, i) => (i === idx ? next : j))
  } else {
    jobs = [...jobs, next]
  }
  if (!options?.silent) emit()
}

// id của tác vụ tạo ảnh
export function imageJobId(assetId: number): string {
  return `image:${assetId}`
}

// id của tác vụ tạo video storyboard
export function videoJobId(fragmentId: number): string {
  return `video:${fragmentId}`
}

// Đồng bộ tác vụ tạo ảnh tài nguyên vào hàng đợi thống nhất (gọi từ dramaImageGenQueue)
export function syncImageJobToUnified(input: {
  assetId: number
  projectId: number
  assetName: string
  assetType: string
  status: DramaGenJobStatus
  taskId?: number
  error?: string
}): void {
  upsertDramaGenJob({
    id: imageJobId(input.assetId),
    kind: 'image',
    projectId: input.projectId,
    targetId: input.assetId,
    title: input.assetName || `${localized(MESSAGE.imageAsset)} ${input.assetId}`,
    subtype: input.assetType || 'image',
    status: input.status,
    taskId: input.taskId,
    error: input.error,
    message:
      input.status === 'running'
        ? localized(MESSAGE.renderingImage)
        : input.status === 'queued'
          ? localized(MESSAGE.queued)
          : undefined,
  })
}

// id của tác vụ tạo video tài nguyên trên canvas (khác với video:{fragmentId} của storyboard)
export function assetVideoJobId(assetId: number): string {
  return `video-asset:${assetId}`
}

// Đồng bộ tác vụ tạo video tài nguyên trên canvas vào hàng đợi thống nhất
export function syncAssetVideoJobToUnified(input: {
  assetId: number
  projectId: number
  assetName: string
  status: DramaGenJobStatus
  error?: string
}): void {
  upsertDramaGenJob({
    id: assetVideoJobId(input.assetId),
    kind: 'video',
    projectId: input.projectId,
    targetId: input.assetId,
    title: input.assetName || `${localized(MESSAGE.videoAsset)} ${input.assetId}`,
    subtype: CANVAS_VIDEO_SUBTYPE,
    status: input.status,
    error: input.error,
    message:
      input.status === 'running'
        ? localized(MESSAGE.renderingVideo)
        : input.status === 'queued'
          ? localized(MESSAGE.queued)
          : undefined,
  })
}

type FragmentStatusItem = {
  fragment_id: number
  status: string
  message?: string
  phase?: string
  error?: string
  video?: string
  cover?: string
}

// Suy ra số thứ tự hiển thị của storyboard; khi không chắc thì trả null để vòng
// poll không ghi đè tiêu đề thành "Cảnh 01" một cách bừa bãi
function resolveFragmentLabel(
  fragId: number,
  fragments: Array<{ id: number; sort_order?: number }>,
): string | null {
  const frag = fragments.find((f) => f.id === fragId)
  if (frag && typeof frag.sort_order === 'number' && frag.sort_order >= 0) {
    return `${localized(MESSAGE.shot)} ${String(frag.sort_order + 1).padStart(2, '0')}`
  }
  // Chỉ khi danh sách đã có sort_order đáng tin thì mới cho phép dùng chỉ số làm dự phòng
  const hasAnySortOrder = fragments.some((f) => typeof f.sort_order === 'number' && f.sort_order >= 0)
  if (!hasAnySortOrder) return null
  const idx = fragments.findIndex((f) => f.id === fragId)
  if (idx < 0) return null
  return `${localized(MESSAGE.shot)} ${String(idx + 1).padStart(2, '0')}`
}

// Dựng tiêu đề cho hàng đợi: có số thứ tự cảnh đáng tin thì ghi/correct nó, ngược lại giữ tiêu đề cũ
function resolveVideoJobTitle(
  existing: DramaGenJob | undefined,
  episodeName: string | undefined,
  fragmentLabel: string | null,
): string {
  if (fragmentLabel) {
    const prefix = (episodeName || '').trim()
    if (prefix) return `${prefix} · ${fragmentLabel}`
    if (existing?.title) {
      const sep = existing.title.indexOf(' · ')
      if (sep >= 0) return `${existing.title.slice(0, sep)} · ${fragmentLabel}`
    }
    return fragmentLabel
  }
  if (existing?.title) return existing.title
  const prefix = (episodeName || '').trim()
  const fallback = localized(MESSAGE.fragmentClip)
  return prefix ? `${prefix} · ${fallback}` : fallback
}

type FragmentTaskItem = DramaTaskBrief

export type EpisodeGenerateStatusPayload = {
  episode_id: number
  done: number
  failed: number
  running: number
  total: number
  tasks: DramaTaskBrief[]
  fragments: FragmentStatusItem[]
}
export function syncEpisodeVideoJobs(input: {
  projectId: number
  episodeId: number
  episodeName?: string
  fragments: Array<{ id: number; sort_order?: number; content?: string }>
  statusItems: FragmentStatusItem[]
  taskItems?: FragmentTaskItem[]
}): void {
  const fragLabel = (fragId: number) => resolveFragmentLabel(fragId, input.fragments)

  const activeTaskByFragmentId = new Map<number, FragmentTaskItem>()
  // Mỗi storyboard lấy tác vụ nền tảng mới nhất (kể cả đã lỗi), phục vụ việc gắn taskId / văn bản lỗi
  const latestTaskByFragmentId = new Map<number, FragmentTaskItem>()
  for (const task of input.taskItems || []) {
    if (task.task_type !== 'fragment_video') continue
    if (typeof task.fragment_id !== 'number') continue
    const prev = latestTaskByFragmentId.get(task.fragment_id)
    if (!prev || (task.id || 0) > (prev.id || 0)) {
      latestTaskByFragmentId.set(task.fragment_id, task)
    }
    if (task.cancel_requested) continue
    if (!['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(task.status))
      continue
    activeTaskByFragmentId.set(task.fragment_id, task)
  }

  for (const item of input.statusItems) {
    const raw = String(item.status || 'idle')
    const jobId = videoJobId(item.fragment_id)
    const existing = jobs.find((j) => j.id === jobId)
    const activeTask = activeTaskByFragmentId.get(item.fragment_id)
    const latestTask = latestTaskByFragmentId.get(item.fragment_id)
    const boundTaskId = activeTask?.id ?? latestTask?.id ?? existing?.taskId
    if (shouldSkipFinishedResync(jobId, raw, existing, Boolean(activeTask))) {
      continue
    }
    // idle: server không có tác vụ nào. Nếu đã vào hàng đợi kiểu lạc quan mà giờ bị gián đoạn thì gỡ khỏi "Đang tạo"
    if (raw === 'idle') {
      if (activeTask) {
        upsertDramaGenJob(
          {
            id: videoJobId(item.fragment_id),
            kind: 'video',
            projectId: input.projectId,
            targetId: item.fragment_id,
            episodeId: input.episodeId,
            taskId: activeTask.id,
            title: resolveVideoJobTitle(existing, input.episodeName, fragLabel(item.fragment_id)),
            subtype: FRAGMENT_VIDEO_SUBTYPE,
            status: activeTask.status === 'pending' || activeTask.status === 'leased' ? 'queued' : 'running',
            message:
              activeTask.current_step_key === 'assets'
                ? localized(MESSAGE.renderingRefs)
                : activeTask.status === 'pending' || activeTask.status === 'leased'
                  ? localized(MESSAGE.queued)
                  : localized(MESSAGE.generating),
          },
          { silent: true },
        )
        continue
      }
      if (existing && (existing.status === 'queued' || existing.status === 'running')) {
        upsertDramaGenJob(
          {
            id: existing.id,
            kind: existing.kind,
            projectId: existing.projectId,
            targetId: existing.targetId,
            episodeId: existing.episodeId,
            taskId: boundTaskId,
            title: existing.title,
            subtype: existing.subtype,
            status: 'failed',
            error: latestTask?.error_message || localized(MESSAGE.interrupted),
          },
          { silent: true },
        )
      }
      continue
    }
    let status: DramaGenJobStatus = 'running'
    if (raw === 'done') status = 'done'
    else if (raw === 'failed' || raw === 'cancelled') status = 'failed'
    else if (activeTask) {
      // Khi tác vụ đã được đẩy lên upstream thì không tin `queued` còn vướng trong params của storyboard
      status =
        activeTask.status === 'pending' || activeTask.status === 'leased' ? 'queued' : 'running'
    } else if (raw === 'queued') status = 'queued'
    else status = 'running'

    const errText =
      item.error ||
      (raw === 'cancelled' || status === 'failed'
        ? latestTask?.error_message || undefined
        : undefined) ||
      (raw === 'cancelled' ? localized(MESSAGE.cancelled) : undefined)

    const messageFromTask =
      activeTask && status === 'running'
        ? activeTask.current_step_key === 'assets'
          ? localized(MESSAGE.renderingRefs)
          : item.message ||
            (item.phase === 'assets' ? localized(MESSAGE.renderingRefs) : localized(MESSAGE.generating))
        : item.message ||
          (item.phase === 'assets' ? localized(MESSAGE.renderingRefs) : undefined)

    upsertDramaGenJob(
      {
        id: videoJobId(item.fragment_id),
        kind: 'video',
        projectId: input.projectId,
        targetId: item.fragment_id,
        episodeId: input.episodeId,
        taskId: boundTaskId,
        title: resolveVideoJobTitle(existing, input.episodeName, fragLabel(item.fragment_id)),
        subtype: FRAGMENT_VIDEO_SUBTYPE,
        status,
        message: status === 'queued' ? item.message || localized(MESSAGE.queued) : messageFromTask,
        error: errText,
      },
      { silent: true },
    )
  }
  emit()
  ensureEpisodeVideoStatusPoll()
}

// Ghi vào hàng đợi ngay lúc vào (hiển thị kiểu lạc quan, không phụ thuộc vòng poll đầu)
export function enqueueEpisodeVideoJobs(input: {
  projectId: number
  episodeId: number
  episodeName?: string
  fragments: Array<{ id: number; sort_order?: number }>
  fragmentIds: number[]
}): void {
  for (const fid of input.fragmentIds) {
    undismissJob(videoJobId(fid))
  }
  const idSet = new Set(input.fragmentIds)
  const items = input.fragments
    .filter((f) => idSet.has(f.id))
    .map((f) => ({
      fragment_id: f.id,
      status: 'queued',
      message: localized(MESSAGE.enqueued),
    }))
  syncEpisodeVideoJobs({
    projectId: input.projectId,
    episodeId: input.episodeId,
    episodeName: input.episodeName,
    fragments: input.fragments,
    statusItems: items,
  })
  requestOpenDramaGenQueue()
  ensureEpisodeVideoStatusPoll()
}

/** Chu kỳ poll generate_status theo tập (duy nhất toàn cục, tránh trang sửa gọi trùng) */
export const GENERATE_STATUS_POLL_MS = 8000

type GenerateStatusSubscriber = (episodeId: number, status: EpisodeGenerateStatusPayload) => void

/*
 * videoPollTimer          vẫn poll generate_status sau khi rời trang tập
 * videoPollInFlight       tránh hai request chồng nhau
 * generateStatusSubscribers  các bên sử dụng (ví dụ trang sửa) đồng bộ UI
 */
let videoPollTimer = 0
let videoPollInFlight = false
const generateStatusSubscribers = new Set<GenerateStatusSubscriber>()

// Nhận kết quả poll generate_status theo tập (dùng chung một request với ensureEpisodeVideoStatusPoll)
export function subscribeEpisodeGenerateStatus(listener: GenerateStatusSubscriber): () => void {
  generateStatusSubscribers.add(listener)
  return () => generateStatusSubscribers.delete(listener)
}

// Poll nền cho các video storyboard đang chạy (không chặn trang sửa)
export function ensureEpisodeVideoStatusPoll(): void {
  if (typeof window === 'undefined') return
  if (videoPollTimer) return
  videoPollTimer = window.setInterval(() => {
    void pollActiveEpisodeVideoJobs()
  }, GENERATE_STATUS_POLL_MS)
  void pollActiveEpisodeVideoJobs()
}

// Lấy trạng thái theo tập rồi ghi ngược vào hàng đợi
async function pollActiveEpisodeVideoJobs(): Promise<void> {
  if (videoPollInFlight) return
  const active = jobs.filter(
    (job) =>
      job.kind === 'video' &&
      job.subtype === FRAGMENT_VIDEO_SUBTYPE &&
      (job.status === 'queued' || job.status === 'running') &&
      typeof job.episodeId === 'number',
  )
  if (active.length === 0) {
    if (videoPollTimer) {
      window.clearInterval(videoPollTimer)
      videoPollTimer = 0
    }
    return
  }
  videoPollInFlight = true
  try {
    const { dramaApi } = await import('../api/drama')
    const episodeIds = [...new Set(active.map((job) => job.episodeId as number))]
    await Promise.all(
      episodeIds.map(async (episodeId) => {
        const epJobs = active.filter((job) => job.episodeId === episodeId)
        const st = await dramaApi.generateStatus(episodeId)
        // Storyboard đã có trong hàng đợi của tập này (kể cả đã xong), giữ thứ tự cảnh và
        // tránh vòng poll chỉ mang về tập con đang chạy
        const tracked = jobs.filter(
          (job) =>
            job.kind === 'video' &&
            job.subtype === FRAGMENT_VIDEO_SUBTYPE &&
            job.episodeId === episodeId,
        )
        const trackedIds = new Set(tracked.map((job) => job.targetId))
        const named = tracked.find((job) => job.title.includes(' · '))
        const episodeName = named?.title.split(' · ')[0]
        syncEpisodeVideoJobs({
          projectId: epJobs[0].projectId,
          episodeId,
          episodeName,
          // Không truyền sort_order: vòng poll không biết chắc thứ tự cảnh, tránh tiêu đề bị đổi hàng loạt thành "Cảnh 01"
          fragments: tracked.map((job) => ({ id: job.targetId })),
          // Chỉ đồng bộ storyboard đã vào hàng đợi của tập này, tránh generate_status cả tập
          // đẩy các cảnh không liên quan vào hàng đợi rồi đổi tên
          statusItems: st.fragments.filter((row) => trackedIds.has(row.fragment_id)),
          taskItems: st.tasks,
        })
        generateStatusSubscribers.forEach((fn) => {
          try {
            fn(episodeId, st)
          } catch {
            /* subscriber lỗi không được làm hỏng vòng poll */
          }
        })
      }),
    )
  } catch {
    /* poll lỗi thì thử lại ở vòng sau */
  } finally {
    videoPollInFlight = false
  }
}

// Yêu cầu mở panel hàng đợi ở góc phải dưới
let openRequestSeq = 0
const openListeners = new Set<() => void>()

export function requestOpenDramaGenQueue(): void {
  openRequestSeq += 1
  openListeners.forEach((fn) => fn())
}

export function subscribeDramaGenQueueOpen(listener: () => void): () => void {
  openListeners.add(listener)
  return () => openListeners.delete(listener)
}

export function getDramaGenQueueOpenRequestSeq(): number {
  return openRequestSeq
}

// Xoá các mục đã kết thúc (xong + lỗi), đồng thời nhớ id để vòng poll không ghi lại
export function clearFinishedDramaGenJobs(): void {
  for (const job of jobs) {
    if (job.status === 'done' || job.status === 'failed') {
      dismissedJobIds.add(job.id)
    }
  }
  jobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running')
  emit()
}

// Đánh dấu các tác vụ video đang chạy / đang chờ là đã huỷ (đồng bộ hàng đợi cục bộ)
export function markVideoJobsCancelled(fragmentIds?: number[]): void {
  const idSet = fragmentIds ? new Set(fragmentIds.map((id) => videoJobId(id))) : null
  jobs = jobs.map((job) => {
    if (job.kind !== 'video') return job
    if (idSet && !idSet.has(job.id)) return job
    if (job.status !== 'queued' && job.status !== 'running') return job
    return {
      ...job,
      status: 'failed' as const,
      error: localized(MESSAGE.cancelled),
      finishedAt: Date.now(),
    }
  })
  emit()
}
