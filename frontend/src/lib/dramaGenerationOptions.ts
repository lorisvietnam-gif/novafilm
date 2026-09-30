/** Tạo ảnh cho AI Drama: lựa chọn mô hình / tỉ lệ / độ phân giải (danh sách mô hình và tham số lấy từ danh mục TokenFree ở backend) */

import type { MediaModelOption, MediaModelsCatalog } from '../api'
import { localized, type LocalizedText } from './localeStrings'

/** Nhãn hiển thị; `id` bên cạnh là giá trị gửi API nên giữ nguyên. */
const COPY: Record<string, LocalizedText> = {
  auto: { zh: '自动', en: 'Auto', vi: 'Tự động' },
  imageModel: { zh: '图片模型', en: 'Image model', vi: 'Mô hình tạo ảnh' },
}

export type ImageGenerationModelId = string

export type GenerationAspectRatioId =
  | 'auto'
  | '16:9'
  | '21:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '3:2'
  | '2:3'
  | '1:1'

export type GenerationResolution = '1K' | '2K' | '3K' | '4K'

export type ImageGenerationOptions = {
  image_style_id?: string
  model_id: ImageGenerationModelId
  aspect_ratio: GenerationAspectRatioId
  resolution: GenerationResolution
}

/** Danh sách độ phân giải đầy đủ (thực tế hiển thị sẽ lọc theo allowed_resolutions của mô hình) */
export const GENERATION_RESOLUTION_OPTIONS: GenerationResolution[] = ['1K', '2K', '3K', '4K']
/** Mức dự phòng khi danh mục chưa tới (khớp Pro / gpt-image ở backend) */
export const SAFE_IMAGE_RESOLUTION_OPTIONS: GenerationResolution[] = ['1K', '2K']

/** Danh sách tỉ lệ khung hình */
export const GENERATION_ASPECT_RATIO_OPTIONS: Array<{
  id: GenerationAspectRatioId
  label: string
}> = [
  { id: 'auto', get label() { return localized(COPY.auto) } },
  { id: '16:9', label: '16:9' },
  { id: '21:9', label: '21:9' },
  { id: '9:16', label: '9:16' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '3:2', label: '3:2' },
  { id: '2:3', label: '2:3' },
  { id: '1:1', label: '1:1' },
]

/** Mô hình tạo ảnh do /api/media-models cung cấp; ở đây chỉ để trỏ chỗ cho id mặc định */
export const IMAGE_GENERATION_MODELS: Array<{
  id: ImageGenerationModelId
  label: string
  description: string
}> = []

/** Lựa chọn mặc định khi tạo ảnh (nhân vật thiên về khung dọc; độ phân giải mặc định 2K để Pro không bị hạ âm thầm) */
export const DEFAULT_IMAGE_GENERATION_OPTIONS: ImageGenerationOptions = {
  model_id: '',
  aspect_ratio: '3:4',
  resolution: '2K',
}

/** Bối cảnh thì mặc định khung ngang */
export function defaultOptionsForAssetKind(kind: string | undefined | null): ImageGenerationOptions {
  const k = String(kind || '').toLowerCase()
  if (k === 'scene') {
    return { model_id: DEFAULT_IMAGE_GENERATION_OPTIONS.model_id, aspect_ratio: '16:9', resolution: '2K' }
  }
  return { ...DEFAULT_IMAGE_GENERATION_OPTIONS }
}

/** Định dạng văn bản mô tả tỉ lệ · độ phân giải */
export function formatOutputSettingsLabel(
  aspectRatio: GenerationAspectRatioId,
  resolution: GenerationResolution,
): string {
  if (aspectRatio === 'auto') return `${localized(COPY.auto)} · ${resolution}`
  return `${aspectRatio} · ${resolution}`
}

/** Lấy tên hiển thị của mô hình (không có danh mục thì lùi về id) */
export function getImageModelLabel(modelId: string | undefined | null): string {
  const id = (modelId || '').trim()
  return id || localized(COPY.imageModel)
}

/** Bất kỳ chuỗi không rỗng nào cũng làm được id mô hình tạo ảnh */
export function isImageGenerationModelId(id: string): id is ImageGenerationModelId {
  return Boolean((id || '').trim())
}

function findImageModelRow(
  modelId: string | undefined | null,
  catalog: MediaModelsCatalog | null | undefined,
  imageModels?: MediaModelOption[],
): MediaModelOption | undefined {
  const id = (modelId || '').trim()
  const models = imageModels ?? catalog?.image_models ?? []
  return id ? models.find((m) => m.id === id) : undefined
}

/** Các độ phân giải mô hình hiện tại cho phép */
export function resolutionsForImageModel(
  modelId: string | undefined | null,
  catalog?: MediaModelsCatalog | null,
  imageModels?: MediaModelOption[],
): GenerationResolution[] {
  const row = findImageModelRow(modelId, catalog, imageModels)
  const raw = row?.allowed_resolutions
  if (Array.isArray(raw) && raw.length > 0) {
    const filtered = raw.filter((r): r is GenerationResolution =>
      GENERATION_RESOLUTION_OPTIONS.includes(r as GenerationResolution),
    )
    if (filtered.length) return filtered
  }
  return [...SAFE_IMAGE_RESOLUTION_OPTIONS]
}

/** Các tỉ lệ mô hình hiện tại cho phép */
export function aspectRatiosForImageModel(
  modelId: string | undefined | null,
  catalog?: MediaModelsCatalog | null,
  imageModels?: MediaModelOption[],
): GenerationAspectRatioId[] {
  const row = findImageModelRow(modelId, catalog, imageModels)
  const allIds = GENERATION_ASPECT_RATIO_OPTIONS.map((o) => o.id)
  const raw = row?.allowed_aspect_ratios
  if (Array.isArray(raw) && raw.length > 0) {
    const filtered = raw.filter((r): r is GenerationAspectRatioId =>
      allIds.includes(r as GenerationAspectRatioId),
    )
    if (filtered.length) return filtered
  }
  return [...allIds]
}

/** Kẹp độ phân giải vào danh sách mô hình cho phép */
export function clampImageResolutionForModel(
  modelId: string | undefined | null,
  resolution: string | undefined | null,
  catalog?: MediaModelsCatalog | null,
  imageModels?: MediaModelOption[],
): GenerationResolution {
  const allowed = resolutionsForImageModel(modelId, catalog, imageModels)
  const raw = String(resolution || '').trim() as GenerationResolution
  if (allowed.includes(raw)) return raw
  return allowed[allowed.length - 1] || '2K'
}

/** Kẹp tỉ lệ vào danh sách mô hình cho phép */
export function clampImageAspectRatioForModel(
  modelId: string | undefined | null,
  aspectRatio: string | undefined | null,
  catalog?: MediaModelsCatalog | null,
  imageModels?: MediaModelOption[],
): GenerationAspectRatioId {
  const allowed = aspectRatiosForImageModel(modelId, catalog, imageModels)
  const raw = String(aspectRatio || '').trim() as GenerationAspectRatioId
  if (allowed.includes(raw)) return raw
  return allowed.includes('3:4') ? '3:4' : allowed[0] || '3:4'
}
