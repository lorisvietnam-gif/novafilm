/** Tạo ảnh cho tài nguyên AI Drama: POST xong là poll ngay, thành công thì hiện lại bằng URL mới (không xếp hàng khi gửi) */
import { dramaApi, type DramaAsset } from '../api/drama'
import type { ImageGenerationOptions } from './dramaGenerationOptions'
import { syncImageJobToUnified } from './dramaGenQueue'
import { localized, type LocalizedText } from './localeStrings'

/** Thông báo lỗi người dùng đọc. `资产不存在` bên dưới cũng do backend trả về. */
const COPY: Record<string, LocalizedText> = {
  assetMissing: { zh: '资产不存在', en: 'That asset no longer exists', vi: 'Tài nguyên này không còn tồn tại' },
  cancelled: { zh: '生图已取消', en: 'Image generation was cancelled', vi: 'Đã huỷ tạo ảnh' },
  failed: { zh: '生图失败', en: 'Image generation failed', vi: 'Tạo ảnh thất bại' },
  timedOut: {
    zh: '生图超时，请刷新后重试',
    en: 'Image generation timed out. Reload and try again.',
    vi: 'Tạo ảnh đã hết thời gian chờ. Hãy tải lại trang rồi thử lại.',
  },
  unnamedAsset: { zh: '资产', en: 'Asset', vi: 'Tài nguyên' },
}

export type DramaImageGenStatus = 'queued' | 'running' | 'done' | 'failed'

export type DramaImageGenJob = {
  id: string
  projectId: number
  assetId: number
  assetName: string
  assetType: string
  prompt: string
  options: Partial<ImageGenerationOptions>
  status: DramaImageGenStatus
  error?: string
  createdAt: number
  finishedAt?: number
}

type EnqueueInput = {
  projectId: number
  assetId: number
  assetName?: string
  assetType?: string
  prompt: string
  options?: Partial<ImageGenerationOptions>
  /** Chỉ khôi phục việc poll (backend đã generating, không POST lại) */
  resumeOnly?: boolean
  /** Ghi trạng thái ngược vào tài nguyên khi vào hàng đợi hoặc đổi trạng thái (để UI hiện generating / ảnh mới ngay) */
  onAssetUpdate?: (asset: DramaAsset) => void
}

type InternalJob = DramaImageGenJob & {
  resumeOnly: boolean
  taskId?: number
  baselineUrl: string
  onAssetUpdate?: (asset: DramaAsset) => void
  resolve: (asset: DramaAsset) => void
  reject: (err: Error) => void
}

/* Poll chạy song song nhiều luồng; gửi không còn giới hạn, bấm là POST luôn */
const MAX_POLL_CONCURRENT = 12
const DONE_RETENTION_MS = 45_000
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 10 * 60 * 1000

/** Nhãn để hiển thị ra ngoài */
export const DRAMA_IMAGE_GEN_MAX_CONCURRENT = MAX_POLL_CONCURRENT

/*
 * jobs         hàng đợi cục bộ (UI + poll)
 * cachedSnapshot ảnh chụp cho useSyncExternalStore
 * listeners    các subscriber
 * pollingCount số lượng đang chờ waitForAssetImage
 * pumping     poll pump đã được hẹn hay chưa
 */
let jobs: InternalJob[] = []
const EMPTY_SNAPSHOT: DramaImageGenJob[] = []
let cachedSnapshot: DramaImageGenJob[] = EMPTY_SNAPSHOT
const listeners = new Set<() => void>()
let pollingCount = 0
let pumping = false

// Đổi job nội bộ sang cấu trúc đưa ra ngoài
function toPublicJob(job: InternalJob): DramaImageGenJob {
  return {
    id: job.id,
    projectId: job.projectId,
    assetId: job.assetId,
    assetName: job.assetName,
    assetType: job.assetType,
    prompt: job.prompt,
    options: job.options,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  }
}

// Hai ảnh chụp có cùng nội dung không
function snapshotsEqual(a: DramaImageGenJob[], b: DramaImageGenJob[]): boolean {
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
      syncImageJobToUnified({
        assetId: job.assetId,
        projectId: job.projectId,
        assetName: job.assetName,
        assetType: job.assetType,
        status: job.status,
        taskId: job.taskId,
        error: job.error,
      })
    }
  }
}

// Đọc ảnh chụp của hàng đợi
export function getDramaImageGenQueue(): DramaImageGenJob[] {
  refreshSnapshot()
  return cachedSnapshot
}

// Tài nguyên này có đang bận không
export function isDramaAssetImageBusy(assetId: number): boolean {
  return jobs.some(
    (job) =>
      job.assetId === assetId && (job.status === 'queued' || job.status === 'running'),
  )
}

// Số mục đang chờ cộng đang chạy
export function getDramaImageGenActiveCount(): number {
  return jobs.filter((job) => job.status === 'queued' || job.status === 'running').length
}

// Đăng ký theo dõi thay đổi của hàng đợi
export function subscribeDramaImageGenQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Sinh id tác vụ cục bộ
function makeJobId() {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Đọc trạng thái generation của tài nguyên
function readGenerationStatus(asset: DramaAsset): string {
  const gen = (asset.params || {}).generation as { status?: string } | undefined
  return String(gen?.status || '')
}

// URL xem trước hiện tại của tài nguyên
function assetMediaUrl(asset: DramaAsset): string {
  return String(asset.url || asset.cover || '').trim()
}

/**
 * Poll cho tới khi lần tạo ảnh này thực sự kết thúc.
 * Khi đã có ảnh cũ thì phải thấy queued/generating, hoặc URL có đổi so với mốc ban đầu, tránh lấy lại ảnh cũ làm kết quả.
 * Phải kiểm tra failed/cancelled trước: khi retry hỏng thì url/cover cũ vẫn còn, không được coi là thành công.
 */
async function waitForAssetImage(
  projectId: number,
  assetId: number,
  baselineUrl: string,
  onRemoteStatus?: (status: string) => void,
  onAssetUpdate?: (asset: DramaAsset) => void,
): Promise<DramaAsset> {
  const started = Date.now()
  let sawInFlight = false
  let lastNotifiedUrl = baselineUrl

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const list = await dramaApi.listAssets(projectId)
    const latest = list.find((a) => a.id === assetId)
    if (!latest) throw new Error(localized(COPY.assetMissing))

    const status = readGenerationStatus(latest)
    const currentUrl = assetMediaUrl(latest)
    onRemoteStatus?.(status)

    if (status === 'queued' || status === 'generating') {
      sawInFlight = true
      if (currentUrl !== lastNotifiedUrl) {
        lastNotifiedUrl = currentUrl
        onAssetUpdate?.(latest)
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      continue
    }

    if (status === 'failed' || status === 'cancelled') {
      const gen = (latest.params || {}).generation as { error?: string } | undefined
      const raw = String(gen?.error || '').trim()
      throw new Error(raw || (status === 'cancelled' ? localized(COPY.cancelled) : localized(COPY.failed)))
    }

    const urlChanged = Boolean(currentUrl) && currentUrl !== baselineUrl
    const finishedFresh =
      status === 'done' &&
      Boolean(currentUrl) &&
      (sawInFlight || urlChanged || !baselineUrl)

    if (finishedFresh) {
      onAssetUpdate?.(latest)
      return latest
    }

    // Vẫn là ảnh cũ và chưa từng vào in-flight: chờ tiếp (sau POST, trạng thái có thể chưa hiện)
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(localized(COPY.timedOut))
}

const waitingPoll: InternalJob[] = []

// Poll kết quả ở backend với số luồng song song có giới hạn
async function pollJob(job: InternalJob) {
  pollingCount += 1
  try {
    const asset = await waitForAssetImage(
      job.projectId,
      job.assetId,
      job.baselineUrl,
      (remoteStatus) => {
        if (remoteStatus === 'generating' && job.status !== 'running') {
          job.status = 'running'
          emit()
        }
        if (remoteStatus === 'queued' && job.status === 'running') {
          job.status = 'queued'
          emit()
        }
      },
      job.onAssetUpdate,
    )
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
    pumpPoll()
    emit()
  }
}

// Lên lịch cho một slot poll
function pumpPoll() {
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

// POST vào hàng đợi ngay (không giới hạn), rồi mới poll
async function submitJob(job: InternalJob) {
  try {
    if (!job.resumeOnly) {
      const resp = await dramaApi.generateImage({
        project_id: job.projectId,
        asset_id: job.assetId,
        prompt: job.prompt,
        name: job.assetName || undefined,
        asset_type_kind: job.assetType,
        image_style_id: job.options.image_style_id,
        model_id: job.options.model_id,
        aspect_ratio: job.options.aspect_ratio,
        resolution: job.options.resolution,
      })
      job.taskId = resp.task_id != null ? Number(resp.task_id) : undefined
      const queuedAsset = (resp as { asset?: DramaAsset }).asset
      if (queuedAsset) {
        job.onAssetUpdate?.(queuedAsset)
      }
    }
    if (job.status === 'queued') {
      job.status = 'running'
    }
    waitingPoll.push(job)
    pumpPoll()
  } catch (err) {
    const message = err instanceof Error ? err.message : localized(COPY.failed)
    job.status = 'failed'
    job.error = message
    job.finishedAt = Date.now()
    emit()
    job.reject(err instanceof Error ? err : new Error(message))
  } finally {
    emit()
  }
}

/**
 * Cho tạo ảnh tài nguyên vào hàng đợi: POST ngay tới backend, rồi poll kết quả ở máy.
 * Nếu tài nguyên đã được xếp hoặc đang tạo thì dùng lại cùng một Promise (tránh gọi upstream hai lần).
 */
export function enqueueDramaImageGen(input: EnqueueInput): Promise<DramaAsset> {
  const existing = jobs.find(
    (job) =>
      job.assetId === input.assetId &&
      (job.status === 'queued' || job.status === 'running'),
  )
  if (existing) {
    if (input.onAssetUpdate) {
      const prev = existing.onAssetUpdate
      existing.onAssetUpdate = (asset) => {
        prev?.(asset)
        input.onAssetUpdate?.(asset)
      }
    }
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
      assetType: input.assetType || 'character',
      prompt: input.prompt,
      options: input.options || {},
      status: 'queued',
      createdAt: Date.now(),
      resumeOnly: Boolean(input.resumeOnly),
      baselineUrl: '',
      onAssetUpdate: input.onAssetUpdate,
      resolve,
      reject,
    }
    jobs = [...jobs, job]
    emit()
    // Lấy ảnh hiện tại làm mốc trước, rồi mới gửi/poll, tránh ảnh cũ bị coi là thành công
    void (async () => {
      try {
        const list = await dramaApi.listAssets(input.projectId)
        const current = list.find((a) => a.id === input.assetId)
        job.baselineUrl = current ? assetMediaUrl(current) : ''
      } catch {
        job.baselineUrl = ''
      }
      if (job.resumeOnly) {
        waitingPoll.push(job)
        pumpPoll()
        return
      }
      void submitJob(job)
    })()
  })
}

/**
 * Khôi phục các tác vụ "backend vẫn đang generating" từ danh sách tài nguyên (gọi sau khi tải lại trang).
 * Không POST lại, chỉ nối lại poll và UI hàng đợi.
 */
export function resumeDramaImageGensFromAssets(
  projectId: number,
  assets: DramaAsset[],
  onAssetUpdate?: (asset: DramaAsset) => void,
): void {
  for (const asset of assets) {
    if (asset.project_id !== projectId) continue
    /* Tài nguyên video đi qua hàng đợi Seedance, tránh POST tạo ảnh nhầm sau khi tải lại trang */
    if ((asset.type || '').toLowerCase() === 'video') continue
    const status = readGenerationStatus(asset)
    if (status !== 'generating' && status !== 'queued') continue
    if (isDramaAssetImageBusy(asset.id)) continue
    void enqueueDramaImageGen({
      projectId,
      assetId: asset.id,
      assetName: asset.name || undefined,
      assetType: asset.type,
      prompt: '',
      resumeOnly: true,
      onAssetUpdate,
    }).catch(() => {
      /* Panel sẽ hiện lỗi; tầng trang có thể toast thêm */
    })
  }
}

// Xoá các mục đã kết thúc
export function clearFinishedDramaImageGenJobs() {
  jobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running')
  emit()
}
