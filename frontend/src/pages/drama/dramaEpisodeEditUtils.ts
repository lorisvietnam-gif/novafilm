/** Tiện ích trang sửa tập: phân loại tài nguyên, tra tham chiếu, chữ nhãn */
import type { DramaAsset, DramaFragment } from '../../api/drama'
import {
  DRAMA_RATIO_OPTIONS,
  DRAMA_RES_OPTIONS,
  readEpisodeAspectRatio,
  readEpisodeResolution,
  readProjectAspectRatio,
  readProjectResolution,
} from '../../lib/dramaProjectOutputSettings'

export type AssetScope = 'episode' | 'series'
export type AssetTab = 'character' | 'scene' | 'prop'

export const ASSET_TABS: Array<{ key: AssetTab; label: string }> = [
  { key: 'character', label: 'Nhân vật' },
  { key: 'scene', label: 'Bối cảnh' },
  { key: 'prop', label: 'Đạo cụ' },
]

export const RATIO_OPTIONS = DRAMA_RATIO_OPTIONS
export const RES_OPTIONS = DRAMA_RES_OPTIONS
export { readProjectAspectRatio, readProjectResolution, readEpisodeAspectRatio, readEpisodeResolution }

// Trích @asset:id từ nội dung storyboard
export function extractAssetIds(content: string): number[] {
  const ids: number[] = []
  const re = /@asset:(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    ids.push(Number(m[1]))
  }
  return ids
}

// Gộp @asset trong nội dung với asset_ids, bỏ trùng và giữ thứ tự
export function collectFragmentAssetIds(frag: DramaFragment | null | undefined): number[] {
  if (!frag) return []
  const seen = new Set<number>()
  const out: number[] = []
  for (const id of [...extractAssetIds(frag.content || ''), ...(frag.asset_ids || [])]) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export type FragmentRefStripItem = {
  assetId: number
  name: string
  type: string
  previewUrl: string
  isCharacter?: boolean
  voiceLabel?: string
  voiceUrl?: string
}

// Dựng dải tài nguyên liên kết của cảnh hiện tại
export function buildFragmentRefStripItems(
  frag: DramaFragment | null | undefined,
  assets: DramaAsset[],
  resolveUrl: (url: string | null | undefined) => string,
  readVoice?: (asset: DramaAsset) => { label: string; url: string } | null,
): FragmentRefStripItem[] {
  const byId = new Map(assets.map((a) => [a.id, a]))
  return collectFragmentAssetIds(frag).map((assetId) => {
    const asset = byId.get(assetId)
    const preview = asset ? resolveUrl(asset.cover || asset.url) : ''
    const isCharacter = asset ? normalizeAssetTab(asset.type) === 'character' : false
    const voice = asset && readVoice ? readVoice(asset) : null
    return {
      assetId,
      name: asset?.name || `Tài nguyên ${assetId}`,
      type: asset?.type || '',
      previewUrl: preview,
      isCharacter,
      voiceLabel: voice?.label,
      voiceUrl: voice?.url,
    }
  })
}

// Chuẩn hoá phân loại tài nguyên
export function normalizeAssetTab(type: string): AssetTab | null {
  const t = (type || '').toLowerCase()
  if (t === 'character' || t === '角色') return 'character'
  if (t === 'scene' || t === '场景') return 'scene'
  if (t === 'prop' || t === '道具') return 'prop'
  return null
}

// Cộng tổng số giây @duration trong nội dung storyboard (khớp fragment_content_duration ở backend)
export function sumFragmentContentDuration(content: string): number {
  const re = /@duration:(\d+)/g
  let total = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content || ''))) {
    const sec = Number(m[1])
    if (sec > 0) total += sec
  }
  return total
}

// Đọc trạng thái tạo của cảnh (ưu tiên params.generation hơn video đã có, hỗ trợ tạo lại)
export function readFragmentGenerationStatus(
  frag: DramaFragment,
): { status: string; error?: string; message?: string; phase?: string } {
  const gen = frag.params?.generation
  if (gen && typeof gen === 'object') {
    const row = gen as Record<string, unknown>
    const status = typeof row.status === 'string' ? row.status : 'idle'
    if (['queued', 'running', 'generating', 'failed', 'cancelled'].includes(status)) {
      const surface = typeof row.error === 'string' ? row.error : undefined
      const root = typeof row.root_error === 'string' ? row.root_error.trim() : ''
      const error =
        status === 'failed' &&
        root &&
        (!surface || /重试超过|超过重试/.test(surface))
          ? root
          : surface
      return {
        status,
        error,
        message: typeof row.message === 'string' ? row.message : undefined,
        phase: typeof row.phase === 'string' ? row.phase : undefined,
      }
    }
    if (status === 'done') {
      return {
        status: 'done',
        message: typeof row.message === 'string' ? row.message : undefined,
      }
    }
  }
  if (frag.video) return { status: 'done' }
  return { status: 'idle' }
}

// Có đang xếp hàng / đang tạo không
export function isFragmentGenerationBusy(status: string): boolean {
  return ['queued', 'running', 'generating', 'pending', 'leased', 'awaiting_poll', 'awaiting_review'].includes(
    status,
  )
}

export type FragmentVideoVersion = {
  id: string
  video: string
  cover?: string
  lastFrameUrl?: string | null
  createdAt?: string
  source?: string
}

// Đọc các phiên bản bản dựng cũ của cảnh
export function readFragmentVideoVersions(frag: DramaFragment | null | undefined): FragmentVideoVersion[] {
  if (!frag?.params || typeof frag.params !== 'object') return []
  const raw = (frag.params as Record<string, unknown>).video_versions
  if (!Array.isArray(raw)) return []
  const out: FragmentVideoVersion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const video = typeof row.video === 'string' ? row.video.trim() : ''
    if (!id || !video) continue
    out.push({
      id,
      video,
      cover: typeof row.cover === 'string' ? row.cover : '',
      lastFrameUrl: typeof row.lastFrameUrl === 'string' ? row.lastFrameUrl : null,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
      source: typeof row.source === 'string' ? row.source : undefined,
    })
  }
  return out
}

// Chữ trên huy hiệu hàng đợi của cảnh
export function fragmentQueueBadgeLabel(status: string): string {
  if (status === 'queued' || status === 'pending' || status === 'leased') return 'Xếp hàng'
  if (status === 'running' || status === 'generating' || status === 'awaiting_poll') return 'Đang tạo'
  if (status === 'failed') return 'Lỗi'
  return ''
}

// Trước khi lưu: nếu có chip @duration thì lấy tổng làm duration_sec
export function resolveFragmentDurationSec(
  content: string,
  durationSec: number | null | undefined,
): number {
  const fromTags = sumFragmentContentDuration(content)
  if (fromTags > 0) return Math.min(15, Math.max(4, fromTags))
  const fallback = durationSec && durationSec > 0 ? durationSec : 8
  return Math.min(15, Math.max(4, fallback))
}

// Định dạng nhãn cảnh
export function formatFragLabel(index: number, durationSec: number | null | undefined) {
  const n = String(index + 1).padStart(2, '0')
  const sec = durationSec && durationSec > 0 ? durationSec : 8
  return `Cảnh quay ${n} · ${sec}s`
}

// Lọc tài nguyên theo phạm vi tập này / toàn phim và theo phân loại
export function filterEpisodeAssets(
  assets: DramaAsset[],
  scope: AssetScope,
  tab: AssetTab | null,
  referencedIds: Set<number>,
): DramaAsset[] {
  let list = assets.filter((a) => normalizeAssetTab(a.type))
  if (scope === 'episode') {
    list = list.filter((a) => referencedIds.has(a.id))
  }
  if (tab) {
    list = list.filter((a) => normalizeAssetTab(a.type) === tab)
  }
  return list
}
