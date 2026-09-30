/** URL ảnh xem trước phong cách hình ảnh của Drama (jpg/png trong public → static của backend → svg dự phòng) */
import type { ImageStyleId } from './dramaImageStyles'

// Trả về đường dẫn gốc `public` của frontend
function publicBase(): string {
  return import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
}

// Trả về đường dẫn gốc của API (dùng cho ảnh xem trước ở `/static/…`)
function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/\/$/, '')
  }
  return ''
}

// Trả về danh sách URL ứng viên cho ảnh xem trước, theo thứ tự ưu tiên
export function getDramaImageStylePreviewCandidates(styleId: ImageStyleId): string[] {
  const pub = publicBase()
  const urls = [
    `${pub}image-styles/${styleId}.jpg`,
    `${pub}image-styles/${styleId}.png`,
  ]
  const api = apiBase()
  if (api) {
    urls.push(`${api}/static/drama/image-styles/${styleId}.png`)
    urls.push(`${api}/static/drama/image-styles/${styleId}.jpg`)
  }
  urls.push(`${pub}image-styles/${styleId}.svg`)
  return urls
}

// Trả về URL ảnh xem trước của phong cách (ưu tiên jpg)
export function getDramaImageStylePreviewUrl(styleId: ImageStyleId): string {
  return getDramaImageStylePreviewCandidates(styleId)[0]
}

// Trả về SVG dự phòng cho ảnh xem trước của phong cách
export function getDramaImageStylePreviewFallbackUrl(styleId: ImageStyleId): string {
  const candidates = getDramaImageStylePreviewCandidates(styleId)
  return candidates[candidates.length - 1]
}
