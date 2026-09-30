/** Shared helpers for drama project workspace steps. */
import type { DramaEpisodeBody, DramaProject, DramaScript } from '../../api/drama'

/** Căn cứ MIN_EPISODE_CONTENT_CHARS của backend: nội dung quá ngắn bị coi là chưa hoàn thành */
export const MIN_EPISODE_BODY_CHARS = 500
export const MIN_EPISODE_CREATIVE_CHARS = 20

export type OutlineDirectoryEpisode = {
  episodeNumber: number
  title: string
  creative?: string
  summary?: string
  body?: string
  origin?: string
}

// Phân tích episode_content thành mảng tập
export function parseEpisodeBodies(script: DramaScript | null | undefined): DramaEpisodeBody[] {
  const raw = script?.episode_content
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.episodes)) return raw.episodes
  return []
}

// Số ký tự nội dung sau khi đã bỏ khoảng trắng
export function episodeBodyCharLen(text: string | undefined): number {
  return (text || '').replace(/\s/g, '').length
}

// Tập thêm thủ công (chờ người dùng dán kịch bản) sẽ không được quy trình tự động lấp đầy
export function isManualEpisode(ep: DramaEpisodeBody | undefined): boolean {
  return ep?.origin === 'manual'
}

// Nội dung đã đủ dài để sang bước tiếp theo chưa
export function isSubstantialEpisodeBody(body: string | undefined): boolean {
  return episodeBodyCharLen(body) >= MIN_EPISODE_BODY_CHARS
}

export function isSubstantialEpisodeCreative(creative: string | undefined): boolean {
  return episodeBodyCharLen(creative) >= MIN_EPISODE_CREATIVE_CHARS
}

// Đã có ít nhất một tập có nội dung dùng được chưa
export function hasSubstantialEpisode(bodies: DramaEpisodeBody[]): boolean {
  return bodies.some((ep) => isSubstantialEpisodeBody(ep.body))
}

// Số tập quy trình tự động còn thiếu (bỏ qua tập thủ công trống)
export function autoMissingEpisodeCount(bodies: DramaEpisodeBody[], target: number): number {
  const byNumber = new Map<number, DramaEpisodeBody>()
  for (const ep of bodies) {
    const num = ep.episodeNumber || 0
    if (num >= 1) byNumber.set(num, ep)
  }
  let missing = 0
  const total = Math.max(target, 0)
  for (let num = 1; num <= total; num += 1) {
    const ep = byNumber.get(num)
    if (!ep) {
      missing += 1
      continue
    }
    if (isSubstantialEpisodeBody(ep.body)) continue
    if (isManualEpisode(ep)) continue
    missing += 1
  }
  return missing
}

// Lấp đầy mục lục theo số tập mục tiêu
export function buildOutlineDirectory(
  bodies: DramaEpisodeBody[],
  episodeCount: number,
): OutlineDirectoryEpisode[] {
  const byNumber = new Map(
    bodies.map((ep, i) => {
      const num = ep.episodeNumber || i + 1
      return [num, ep] as const
    }),
  )
  const total = Math.max(episodeCount, bodies.length, 0)
  if (total <= 0) return []
  return Array.from({ length: total }, (_, i) => {
    const episodeNumber = i + 1
    const ep = byNumber.get(episodeNumber)
    return {
      episodeNumber,
      title: ep?.title || `Tập ${episodeNumber}`,
      creative: ep?.creative,
      summary: ep?.summary,
      body: ep?.body,
      origin: ep?.origin,
    }
  })
}

// Gộp mục mục lục với nội dung (giữ creative / summary)
export function mergeDirectoryEpisodeBodies(
  directory: OutlineDirectoryEpisode[],
  bodies: DramaEpisodeBody[],
): DramaEpisodeBody[] {
  const byNumber = new Map(bodies.map((ep, i) => [ep.episodeNumber || i + 1, ep] as const))
  return directory.map((item) => {
    const found = byNumber.get(item.episodeNumber)
    return {
      episodeNumber: item.episodeNumber,
      title: found?.title || item.title,
      creative: found?.creative || item.creative || '',
      summary: found?.summary || item.summary || '',
      body: found?.body || item.body || '',
      origin: found?.origin || (item.origin as 'auto' | 'manual' | undefined),
    }
  })
}

// Đọc trạng thái tóm tắt
export function getSummaryStatus(script: DramaScript | null | undefined): string {
  return String((script?.params || {}).summary_status || (script?.summary ? 'completed' : 'pending'))
}

// Đọc trạng thái kịch bản từng tập
export function getEpisodeContentStatus(script: DramaScript | null | undefined): string {
  return String((script?.params || {}).episode_content_status || 'pending')
}

// Đọc ID phong cách hình ảnh
export function getImageStyleId(
  script: DramaScript | null | undefined,
  project: DramaProject | null,
): string {
  const fromScript = (script?.params || {}).image_style_id
  const fromProject = (project?.params || {}).image_style_id
  return String(fromScript || fromProject || '')
}

// Giữ nguyên cấu trúc cũ khi ghi lại nội dung tập (mảng hoặc { episodes })
export function buildEpisodeContentUpdate(
  script: DramaScript | null | undefined,
  bodies: DramaEpisodeBody[],
): DramaScript['episode_content'] {
  const raw = script?.episode_content
  if (Array.isArray(raw)) return bodies
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>), episodes: bodies }
  }
  return { episodes: bodies }
}
