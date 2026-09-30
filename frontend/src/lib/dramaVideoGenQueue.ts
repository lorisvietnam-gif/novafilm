/** Hàng đợi tạo video cho tài nguyên trên canvas của AI Drama: vào hàng đợi là gửi Seedance Worker ngay, tải lại trang vẫn khôi phục được từ trạng thái tài nguyên */
import { dramaApi, type DramaAsset } from '../api/drama'
import type { VideoGenerationOptions } from './dramaVideoGenerationOptions'
import { syncAssetVideoJobToUnified } from './dramaGenQueue'
import { localized, type LocalizedText } from './localeStrings'

/** Thông báo lỗi người dùng đọc. `资产不存在` bên dưới cũng do backend trả về. */
const COPY: Record<string, LocalizedText> = {
  assetMissing: { zh: '资产不存在', en: 'That asset no longer exists', vi: 'Tài nguyên này không còn tồn tại' },
  failed: { zh: '生视频失败', en: 'Video generation failed', vi: 'Tạo video thất bại' },
  timedOut: {
    zh: '生视频超时，请刷新后重试',
    en: 'Video generation timed out. Reload and try again.',
    vi: 'Tạo video đã hết thời gian chờ. Hãy tải lại trang rồi thử lại.',
  },
  unnamedAsset: { zh: '视频', en: 'Video', vi: 'Video' },
}

export type DramaVideoGenStatus = 'queued' | 'running' | 'done' | 'failed'

export type DramaVideoGenJob = {
  id: string
  projectId: number
  assetId: number
  assetName: string
  prompt: string
  options: Partial<VideoGenerationOptions>
  referenceAssetIds: number[]
  status: DramaVideoGenStatus
  error?: string
  createdAt: number
  finishedAt?: number
}

type EnqueueInput = {
  projectId: number
  assetId: number
  assetName?: string
  prompt: string
  options?: Partial<VideoGenerationOptions>
  referenceAssetIds?: number[]
  /** Chỉ khôi phục việc poll (backend đã generating, không POST lại) */
  resumeOnly?: boolean
}

type InternalJob = DramaVideoGenJob & {
  resumeOnly: boolean
  resolve: (asset: DramaAsset) => void
  reject: (err: Error) => void
}

/*
 * MAX_POLL_CONCURRENT số luồng poll đồng thời
 * POLL_TIMEOUT_MS thời gian chờ tối đa cho Seedance
 */
const MAX_POLL_CONCURRENT = 4
const DONE_RETENTION_MS = 45_000
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 15 * 60 * 1000
const VIDEO_URL_RE = /\.(mp4|webm|mov)(\?|$)/i

let jobs: InternalJob[] = []
const EMPTY_SNAPSHOT: DramaVideoGenJob[] = []
let cachedSnapshot: DramaVideoGenJob[] = EMPTY_SNAPSHOT
const listeners = new Set<() => void>()
let pollingCount = 0
let pumping = false
const waitingPoll: InternalJob[] = []

// Đổi job nội bộ sang cấu trúc đưa ra ngoài
function toPublicJob(job: InternalJob): DramaVideoGenJob {
  return {
    id: job.id,
    projectId: job.projectId,
    assetId: job.assetId,
    assetName: job.assetName,
    prompt: job.prompt,
    options: job.options,
    referenceAssetIds: job.referenceAssetIds,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  }
}

// Hai ảnh chụp có cùng nội dung không
function snapshotsEqual(a: DramaVideoGenJob[], b: DramaVideoGenJob[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (
      left.id !== right.id ||
      left.status !== right.status ||
      left.error !== right.error ||
      left.finishedAt !== right.finishedAt
    ) {
      return false
    }
  }
  return true
}

// Dọn các mục đã xong quá hạn
function pruneFinished() {
  const now = Date.now()
  jobs = jobs.filter((job) => {
    if (job.status === 'queued' || job.status === 'running') return true
    if (!job.finishedAt) return true
    return now - job.finishedAt < DONE_RETENTION_MS
  })
}

// Dựng lại và cache ảnh chụp đưa ra ngoài
function refreshSnapshot() {
  pruneFinished()
  const next = jobs.length === 0 ? EMPTY_SNAPSHOT : jobs.map((job) => toPublicJob(job))
  if (!snapshotsEqual(cachedSnapshot, next)) {
    cachedSnapshot = next
  }
}

// Báo các subscriber, đồng thời đồng bộ sang hàng đợi tạo thống nhất
function emit() {
  refreshSnapshot()
  listeners.forEach((listener) => listener())
  for (const job of jobs) {
    if (job.status === 'queued' || job.status === 'running' || job.finishedAt) {
      syncAssetVideoJobToUnified({
        assetId: job.assetId,
        projectId: job.projectId,
        assetName: job.assetName,
        status: job.status,
        error: job.error,
      })
    }
  }
}

// Tài nguyên này có đang tạo video không
export function isDramaAssetVideoBusy(assetId: number): boolean {
  return jobs.some(
    (job) =>
      job.assetId === assetId && (job.status === 'queued' || job.status === 'running'),
  )
}

// Đọc trạng thái generation của tài nguyên
function readGenerationStatus(asset: DramaAsset): string {
  const gen = (asset.params || {}).generation as { status?: string } | undefined
  return String(gen?.status || '')
}

// URL của phim đã phải là tệp video chưa
function isVideoMediaUrl(url: string | null | undefined): boolean {
  return Boolean(url && VIDEO_URL_RE.test(url))
}

// Poll tới khi tạo video của tài nguyên kết thúc (phải chờ tới mp4, không được coi ảnh bìa cũ là xong)
async function waitForAssetVideo(projectId: number, assetId: number): Promise<DramaAsset> {
  const started = Date.now()
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const list = await dramaApi.listAssets(projectId)
    const latest = list.find((a) => a.id === assetId)
    if (!latest) throw new Error(localized(COPY.assetMissing))
    const status = readGenerationStatus(latest)
    if (status === 'failed') {
      const gen = (latest.params || {}).generation as { error?: string } | undefined
      throw new Error(String(gen?.error || localized(COPY.failed)))
    }
    if (status === 'done' && latest.url) {
      return latest
    }
    if (status !== 'generating' && isVideoMediaUrl(latest.url)) {
      return latest
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(localized(COPY.timedOut))
}

// Poll kết quả ở backend với số luồng song song có giới hạn
async function pollJob(job: InternalJob) {
  pollingCount += 1
  try {
    const asset = await waitForAssetVideo(job.projectId, job.assetId)
    job.status = 'done'
    job.finishedAt = Date.now()
    emit()
    job.resolve(asset)
  } catch (err) {
    const message = err instanceof Error ? err.message : localized(COPY.failed)
    job.status = 'failed'
    job.error = message
    job.finishedAt = Date.now()
    emit()
    job.reject(err instanceof Error ? err : new Error(message))
  } finally {
    pollingCount -= 1
    pump()
    emit()
  }
}

// Lên lịch cho một slot poll
function pump() {
  if (pumping) return
  pumping = true
  queueMicrotask(() => {
    pumping = false
    while (pollingCount < MAX_POLL_CONCURRENT && waitingPoll.length > 0) {
      const next = waitingPoll.shift()
      if (!next) break
      if (next.status === 'failed' || next.status === 'done') continue
      void pollJob(next)
    }
    emit()
  })
}

// Gửi backend xong thì bắt đầu poll
function startJob(job: InternalJob) {
  void (async () => {
    try {
      if (!job.resumeOnly) {
        await dramaApi.generateVideo({
          project_id: job.projectId,
          asset_id: job.assetId,
          prompt: job.prompt,
          model_id: job.options.model_id,
          aspect_ratio: job.options.aspect_ratio,
          resolution: job.options.resolution,
          duration_sec: job.options.duration_sec,
          image_style_id: job.options.image_style_id,
          reference_asset_ids: job.referenceAssetIds,
        })
      }
      job.status = 'running'
      emit()
      waitingPoll.push(job)
      pump()
    } catch (err) {
      const message = err instanceof Error ? err.message : localized(COPY.failed)
      job.status = 'failed'
      job.error = message
      job.finishedAt = Date.now()
      emit()
      job.reject(err instanceof Error ? err : new Error(message))
    }
  })()
}

// Sinh id tác vụ cục bộ
function makeJobId() {
  return `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Cho tạo video tài nguyên trên canvas vào hàng đợi: POST ngay tới Worker của backend, rồi poll kết quả ở máy.
 * Nếu tài nguyên đã được xếp hoặc đang tạo thì dùng lại cùng một Promise.
 */
export function enqueueDramaVideoGen(input: EnqueueInput): Promise<DramaAsset> {
  const existing = jobs.find(
    (job) =>
      job.assetId === input.assetId &&
      (job.status === 'queued' || job.status === 'running'),
  )
  if (existing) {
    return new Promise((resolve, reject) => {
      const prevResolve = existing.resolve
      const prevReject = existing.reject
      existing.resolve = (asset) => {
        prevResolve(asset)
        resolve(asset)
      }
      existing.reject = (err) => {
        prevReject(err)
        reject(err)
      }
    })
  }

  return new Promise<DramaAsset>((resolve, reject) => {
    const job: InternalJob = {
      id: makeJobId(),
      projectId: input.projectId,
      assetId: input.assetId,
      assetName: (input.assetName || '').trim() || `${localized(COPY.unnamedAsset)} ${input.assetId}`,
      prompt: input.prompt,
      options: input.options || {},
      referenceAssetIds: input.referenceAssetIds || [],
      status: 'queued',
      createdAt: Date.now(),
      resumeOnly: Boolean(input.resumeOnly),
      resolve,
      reject,
    }
    jobs = [...jobs, job]
    emit()
    startJob(job)
  })
}

/**
 * Khôi phục các tác vụ video "backend vẫn đang generating" từ danh sách tài nguyên.
 */
export function resumeDramaVideoGensFromAssets(
  projectId: number,
  assets: DramaAsset[],
): void {
  for (const asset of assets) {
    if (asset.project_id !== projectId) continue
    if ((asset.type || '').toLowerCase() !== 'video') continue
    const status = readGenerationStatus(asset)
    if (status !== 'generating') continue
    if (isDramaAssetVideoBusy(asset.id)) continue
    void enqueueDramaVideoGen({
      projectId,
      assetId: asset.id,
      assetName: asset.name || undefined,
      prompt: '',
      resumeOnly: true,
    }).catch(() => {
      /* Panel sẽ hiện lỗi */
    })
  }
}
