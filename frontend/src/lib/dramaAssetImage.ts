/** Tài nguyên AI Drama đã có ảnh hình chưa (do AI tạo hay tải lên) */
import type { DramaAsset } from '../api/drama'
import { localized, type LocalizedText } from './localeStrings'

const COPY: Record<string, LocalizedText> = {
  regenerate: { zh: '重新生成形象', en: 'Regenerate the art', vi: 'Tạo lại ảnh' },
  generate: { zh: '生成形象', en: 'Generate the art', vi: 'Tạo ảnh' },
}

// Đọc URL xem trước có sẵn trong params (do canvas đồng bộ ghi vào)
function readParamsMediaUrl(asset: DramaAsset): string {
  const params = asset.params
  if (!params || typeof params !== 'object') return ''
  const record = params as Record<string, unknown>
  for (const key of ['mediaUrl', 'previewUrl', 'imageUrl']) {
    const value = String(record[key] || '').trim()
    if (value) return value
  }
  const gen = record.generation
  if (gen && typeof gen === 'object') {
    const g = gen as Record<string, unknown>
    for (const key of ['cover', 'url', 'imageUrl']) {
      const value = String(g[key] || '').trim()
      if (value) return value
    }
  }
  return ''
}

// Tài nguyên đã có ảnh hình dùng được hay chưa
export function dramaAssetHasImage(asset: DramaAsset): boolean {
  if ((asset.cover || '').trim() || (asset.url || '').trim()) return true
  return Boolean(readParamsMediaUrl(asset))
}

// Có còn cần tạo ảnh không (chưa có ảnh và không phải tài nguyên thuần âm thanh thì mới cho vào hàng đợi hàng loạt)
export function dramaAssetNeedsImageGeneration(asset: DramaAsset): boolean {
  const kind = (asset.type || '').toLowerCase()
  if (['voice', 'video', 'audio', 'text'].includes(kind)) return false
  return !dramaAssetHasImage(asset)
}

// Văn bản nút tạo ảnh trên card/popup (queueLabel là văn bản ở trạng thái đang xếp hàng, ưu tiên nếu có)
export function dramaAssetImageGenButtonLabel(
  asset: DramaAsset,
  queueLabel: string | null,
): string {
  if (queueLabel) return queueLabel
  return localized(dramaAssetHasImage(asset) ? COPY.regenerate : COPY.generate)
}
