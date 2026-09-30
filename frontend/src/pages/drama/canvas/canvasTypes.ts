/** Định nghĩa loại nút canvas và các lựa chọn */
import type { LucideIcon } from 'lucide-react'
import {
  AudioLines,
  Image as ImageIcon,
  Landmark,
  PlaySquare,
  Text,
  UserRound,
} from 'lucide-react'

export type CanvasNodeKind = 'character' | 'scene' | 'video' | 'image' | 'text' | 'audio'

export type CanvasNodeOption = {
  id: CanvasNodeKind
  label: string
  icon: LucideIcon
}

export type CanvasAssetNodeData = {
  kind: CanvasNodeKind
  label: string
  assetId?: number
  mediaUrl?: string | null
  textContent?: string
  generating?: boolean
  /** Tham số tạo Seedance của nút video */
  videoOptions?: Record<string, unknown>
  [key: string]: unknown
}

/** Các loại nút hỗ trợ tải ảnh lên từ máy */
export const CANVAS_UPLOADABLE_KINDS = new Set<CanvasNodeKind>([
  'character',
  'scene',
  'image',
  'video',
])

/** Các loại nút hỗ trợ prompt + tạo bằng AI */
export const CANVAS_GENERATABLE_KINDS = new Set<CanvasNodeKind>([
  'character',
  'scene',
  'image',
  'video',
])

/** asset_type của Drama tương ứng với loại nút */
export function canvasKindToAssetType(kind: CanvasNodeKind): string {
  if (kind === 'video') return 'video'
  if (kind === 'audio') return 'audio'
  if (kind === 'text') return 'text'
  return 'image'
}

/** Lựa chọn tạo nhanh giữa canvas trống (thứ tự khớp bản thiết kế) */
export const CANVAS_NODE_OPTIONS: CanvasNodeOption[] = [
  { id: 'character', label: 'Nhân vật', icon: UserRound },
  { id: 'scene', label: 'Bối cảnh', icon: Landmark },
  { id: 'video', label: 'Video', icon: PlaySquare },
  { id: 'image', label: 'Ảnh', icon: ImageIcon },
  { id: 'text', label: 'Văn bản', icon: Text },
  { id: 'audio', label: 'Âm thanh', icon: AudioLines },
]

/** Lựa chọn cho bảng thêm nút bên trái */
export const ADD_NODE_OPTIONS: CanvasNodeOption[] = [
  { id: 'character', label: 'Nhân vật', icon: UserRound },
  { id: 'scene', label: 'Bối cảnh', icon: Landmark },
  { id: 'text', label: 'Văn bản', icon: Text },
  { id: 'image', label: 'Ảnh', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: PlaySquare },
  { id: 'audio', label: 'Âm thanh', icon: AudioLines },
]

export const CANVAS_NODE_OPTION_BY_KIND = Object.fromEntries(
  CANVAS_NODE_OPTIONS.map((option) => [option.id, option]),
) as Record<CanvasNodeKind, CanvasNodeOption>

/** Tên hiển thị mặc định của từng loại */
export const CANVAS_NODE_DEFAULT_LABEL: Record<CanvasNodeKind, string> = {
  character: 'Nhân vật mới',
  scene: 'Bối cảnh mới',
  video: 'Video mới',
  image: 'Ảnh mới',
  text: 'Văn bản',
  audio: 'Âm thanh mới',
}

/**
 * Sinh tên không trùng cho node canvas mới.
 * Backend sẽ tái dùng asset khi cùng loại và trùng tên, gây đụng `asset-{id}` và ghi đè node cũ.
 */
export function nextCanvasNodeLabel(
  kind: CanvasNodeKind,
  existing: Array<{ data: { kind: CanvasNodeKind; label?: string } }>,
): string {
  const base = CANVAS_NODE_DEFAULT_LABEL[kind]
  const used = new Set(
    existing
      .filter((n) => n.data.kind === kind)
      .map((n) => (typeof n.data.label === 'string' ? n.data.label.trim() : '')),
  )
  if (!used.has(base)) return base
  let i = 2
  while (used.has(`${base} ${i}`)) i += 1
  return `${base} ${i}`
}

/** Kích thước thẻ nút (rộng × cao, dùng để canh giữa điểm đặt; tính cả footer khoảng +40) */
export const CANVAS_NODE_SIZE: Record<CanvasNodeKind, { width: number; height: number }> = {
  character: { width: 200, height: 280 },
  scene: { width: 200, height: 280 },
  video: { width: 160, height: 240 },
  image: { width: 160, height: 240 },
  text: { width: 280, height: 140 },
  audio: { width: 200, height: 100 },
}

/** Kích thước mặc định của vùng xem trước (không tính footer; không có media thì dùng khung dọc) */
export const CANVAS_MEDIA_BODY_SIZE: Record<
  Exclude<CanvasNodeKind, 'text' | 'audio'>,
  { width: number; height: number }
> = {
  character: { width: 200, height: 240 },
  scene: { width: 200, height: 240 },
  video: { width: 160, height: 220 },
  image: { width: 160, height: 220 },
}

/**
 * Tính kích thước khung xem trước theo tỉ lệ media: khung ngang thì rộng ra, khung dọc thì giữ dọc.
 * aspect = naturalWidth / naturalHeight
 */
export function canvasMediaFrameSize(
  kind: CanvasNodeKind,
  aspect: number | null | undefined,
): { width: number; height: number } {
  if (kind === 'text') return { width: 280, height: 100 }
  if (kind === 'audio') return { width: 200, height: 72 }
  const fallback = CANVAS_MEDIA_BODY_SIZE[kind]
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return { ...fallback }

  const a = Math.min(Math.max(aspect, 9 / 21), 21 / 9)
  const shortSide = kind === 'character' || kind === 'scene' ? 200 : 160
  const maxLong = kind === 'character' || kind === 'scene' ? 320 : 280

  if (a >= 1) {
    // Ngang / vuông: lấy cạnh ngắn làm chiều cao
    const height = shortSide
    const width = Math.min(maxLong, Math.round(height * a))
    return { width, height: Math.max(120, Math.round(width / a)) }
  }
  // Dọc: lấy cạnh ngắn làm chiều rộng
  const width = shortSide
  const height = Math.min(maxLong, Math.round(width / a))
  return { width, height: Math.max(140, height) }
}

/** Bước lưới */
export const CANVAS_SNAP_GRID: [number, number] = [20, 20]

/** Debounce tự động lưu (ms) */
export const CANVAS_AUTO_SAVE_MS = 2000

/** Độ sâu tối đa của ngăn lịch sử */
export const MAX_CANVAS_HISTORY = 50
