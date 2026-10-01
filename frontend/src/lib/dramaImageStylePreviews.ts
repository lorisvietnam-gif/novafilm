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

/**
 * Bề rộng của các bản thu nhỏ trong `public/img/` cho từng style (đo 2026-10-01).
 *
 * Bản gốc trong `public/image-styles/` là 2560x1440, nặng 234KB-2.8MB. Bản thu nhỏ
 * là 512x288 và 1024x576, nặng 16-161KB. Ô nào cũng nhỏ hơn 1024px, nên lưới này là
 * đủ cho mọi ô phong cách trong sản phẩm.
 *
 * Style nào không nằm trong bảng thì dùng `STILL_WIDTHS_BASE`.
 */
const STILL_WIDTHS_BASE: readonly number[] = [512, 1024]
const STILL_WIDTHS: Partial<Record<ImageStyleId, readonly number[]>> = {}

/**
 * Style duy nhất trong 21 style **không** có bản thu nhỏ nào trong `public/img/` —
 * kho chỉ có một file PNG gốc 1024x1024 nặng 1.26MB. Nó rơi về đường dẫn gốc và không
 * có `srcSet`.
 */
const WITHOUT_DERIVATIVE: ReadonlySet<ImageStyleId> = new Set<ImageStyleId>(['cgi-3d-animation'])

function stillWidths(id: ImageStyleId): readonly number[] {
  return STILL_WIDTHS[id] ?? STILL_WIDTHS_BASE
}

/**
 * `srcSet` của bản thu nhỏ. Trả `undefined` cho style không có bản thu nhỏ, để
 * `<img>` rơi về `src` gốc chứ không sinh ra một danh sách toàn 404.
 */
export function getDramaImageStyleStillSrcSet(id: ImageStyleId): string | undefined {
  if (WITHOUT_DERIVATIVE.has(id)) return undefined
  const pub = publicBase()
  return stillWidths(id).map((w) => `${pub}img/${id}-${w}.jpg ${w}w`).join(', ')
}

/** URL bản thu nhỏ nhỏ nhất, dùng làm `src` kèm `srcSet`. */
export function getDramaImageStyleStillSrc(id: ImageStyleId): string | undefined {
  if (WITHOUT_DERIVATIVE.has(id)) return undefined
  return `${publicBase()}img/${id}-${stillWidths(id)[0]}.jpg`
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
