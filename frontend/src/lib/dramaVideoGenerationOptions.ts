/** Lựa chọn tạo video cho canvas / tập của AI Drama (danh sách mô hình lấy từ danh mục TokenFree ở backend) */
import type { MediaModelOption, MediaModelsCatalog } from '../api'
import { localized, type LocalizedText } from './localeStrings'

/** Nhãn dự phòng khi chưa có danh mục mô hình. */
const VIDEO_MODEL_FALLBACK: LocalizedText = {
  zh: '视频模型',
  en: 'Video model',
  vi: 'Mô hình tạo video',
}

export type VideoGenerationModelId = string

export type VideoAspectRatio = '9:16' | '16:9' | '1:1'
export type VideoResolution = '480p' | '720p' | '1080p'

export type VideoGenerationOptions = {
  image_style_id?: string
  model_id: VideoGenerationModelId
  aspect_ratio: VideoAspectRatio
  resolution: VideoResolution
  duration_sec: number
}

export const VIDEO_ASPECT_RATIO_OPTIONS: VideoAspectRatio[] = ['9:16', '16:9', '1:1']
export const VIDEO_RESOLUTION_OPTIONS: VideoResolution[] = ['480p', '720p', '1080p']
/** Mức dự phòng khi danh mục chưa tới hoặc gặp mô hình lạ (khớp SAFE ở backend) */
export const SAFE_VIDEO_RESOLUTION_OPTIONS: VideoResolution[] = ['480p', '720p']
export const VIDEO_DURATION_PRESETS = [5, 8, 10, 15] as const
export const VIDEO_DURATION_MIN = 4
export const VIDEO_DURATION_MAX = 30

export const DEFAULT_VIDEO_GENERATION_OPTIONS: VideoGenerationOptions = {
  model_id: '',
  aspect_ratio: '9:16',
  resolution: '720p',
  duration_sec: 8,
}

function findVideoModelRow(
  modelId: string | undefined | null,
  catalog: MediaModelsCatalog | null | undefined,
  videoModels?: MediaModelOption[],
): MediaModelOption | undefined {
  const id = (modelId || '').trim()
  const models = videoModels ?? catalog?.video_models ?? []
  return id ? models.find((m) => m.id === id) : undefined
}

/** Giới hạn trên dưới của thời lượng theo mô hình hiện tại */
export function durationBoundsForModel(
  modelId: string | undefined | null,
  catalog?: MediaModelsCatalog | null,
  videoModels?: MediaModelOption[],
): { min: number; max: number } {
  const row = findVideoModelRow(modelId, catalog, videoModels)
  const min = Math.max(1, Number(row?.duration_min) || VIDEO_DURATION_MIN)
  const max = Math.max(min, Number(row?.duration_max) || VIDEO_DURATION_MAX)
  return { min, max }
}

/** Kẹp thời lượng vào khoảng mô hình cho phép */
export function clampVideoDuration(
  sec: number,
  modelId?: string | null,
  catalog?: MediaModelsCatalog | null,
  videoModels?: MediaModelOption[],
) {
  const { min, max } = durationBoundsForModel(modelId, catalog, videoModels)
  const n = Math.round(Number(sec) || DEFAULT_VIDEO_GENERATION_OPTIONS.duration_sec)
  return Math.min(max, Math.max(min, n))
}

/** Các tỉ lệ mô hình hiện tại cho phép */
export function aspectRatiosForVideoModel(
  modelId: string | undefined | null,
  catalog?: MediaModelsCatalog | null,
  videoModels?: MediaModelOption[],
): VideoAspectRatio[] {
  const row = findVideoModelRow(modelId, catalog, videoModels)
  const raw = row?.allowed_aspect_ratios
  if (Array.isArray(raw) && raw.length > 0) {
    const filtered = raw.filter((r): r is VideoAspectRatio =>
      VIDEO_ASPECT_RATIO_OPTIONS.includes(r as VideoAspectRatio),
    )
    if (filtered.length) return filtered
  }
  return [...VIDEO_ASPECT_RATIO_OPTIONS]
}

/** Kẹp tỉ lệ vào danh sách mô hình cho phép */
export function clampVideoAspectRatioForModel(
  modelId: string | undefined | null,
  aspectRatio: string | undefined | null,
  catalog?: MediaModelsCatalog | null,
  videoModels?: MediaModelOption[],
): VideoAspectRatio {
  const allowed = aspectRatiosForVideoModel(modelId, catalog, videoModels)
  const raw = String(aspectRatio || '').trim() as VideoAspectRatio
  if (allowed.includes(raw)) return raw
  return allowed[0] || '9:16'
}

/** Định dạng tỉ lệ · độ phân giải */
export function formatVideoOutputLabel(
  aspectRatio: VideoAspectRatio,
  resolution: VideoResolution,
) {
  return `${aspectRatio} · ${resolution}`
}

/** Lấy tên hiển thị của mô hình (không có danh mục thì lùi về id) */
export function getVideoModelLabel(modelId: string | undefined | null) {
  const id = (modelId || '').trim()
  return id || localized(VIDEO_MODEL_FALLBACK)
}

/** Bất kỳ chuỗi không rỗng nào cũng làm được id mô hình video (danh mục TokenFree ở backend) */
export function isVideoGenerationModelId(id: string): id is VideoGenerationModelId {
  return Boolean((id || '').trim())
}

/** Danh sách độ phân giải mô hình hiện tại cho phép (ưu tiên dòng trong danh mục; mô hình lạ thì dùng hai mức dự phòng, chỉ để hiển thị, không tự lưu âm thầm) */
export function resolutionsForModel(
  modelId: string | undefined | null,
  catalog: MediaModelsCatalog | null | undefined,
  videoModels?: MediaModelOption[],
): VideoResolution[] {
  const row = findVideoModelRow(modelId, catalog, videoModels)
  const raw = row?.allowed_resolutions
  if (Array.isArray(raw) && raw.length > 0) {
    const filtered = raw.filter((r): r is VideoResolution =>
      VIDEO_RESOLUTION_OPTIONS.includes(r as VideoResolution),
    )
    if (filtered.length) return filtered
  }
  return [...SAFE_VIDEO_RESOLUTION_OPTIONS]
}

/** Danh mục đã tải và có dòng mô hình video kèm danh sách độ phân giải cho phép */
export function hasKnownVideoModelResolutions(
  modelId: string | undefined | null,
  catalog: MediaModelsCatalog | null | undefined,
  videoModels?: MediaModelOption[],
): boolean {
  if (!catalog) return false
  const row = findVideoModelRow(modelId, catalog, videoModels)
  const raw = row?.allowed_resolutions
  return Array.isArray(raw) && raw.length > 0
}

/** Kẹp độ phân giải vào danh sách mô hình cho phép; giá trị lạ thì lấy mức cao nhất trong danh sách */
export function clampVideoResolutionForModel(
  modelId: string | undefined | null,
  resolution: string | undefined | null,
  catalog?: MediaModelsCatalog | null,
  videoModels?: MediaModelOption[],
): VideoResolution {
  const allowed = resolutionsForModel(modelId, catalog, videoModels)
  const raw = String(resolution || '').trim() as VideoResolution
  if (allowed.includes(raw)) return raw
  return allowed[allowed.length - 1] || '720p'
}

/** Khôi phục lựa chọn video từ data của node */
export function readVideoGenerationOptions(raw: unknown): VideoGenerationOptions {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const modelId = String(row.model_id || '').trim()
  const aspect = String(row.aspect_ratio || '')
  const resolution = String(row.resolution || '')
  return {
    image_style_id: typeof row.image_style_id === 'string' ? row.image_style_id : undefined,
    model_id: modelId || DEFAULT_VIDEO_GENERATION_OPTIONS.model_id,
    aspect_ratio: VIDEO_ASPECT_RATIO_OPTIONS.includes(aspect as VideoAspectRatio)
      ? (aspect as VideoAspectRatio)
      : DEFAULT_VIDEO_GENERATION_OPTIONS.aspect_ratio,
    resolution: VIDEO_RESOLUTION_OPTIONS.includes(resolution as VideoResolution)
      ? (resolution as VideoResolution)
      : DEFAULT_VIDEO_GENERATION_OPTIONS.resolution,
    duration_sec: clampVideoDuration(Number(row.duration_sec), modelId),
  }
}
