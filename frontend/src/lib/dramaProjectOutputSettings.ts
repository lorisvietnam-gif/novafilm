/** Thông số đầu ra video của AI Drama (khung hình / độ phân giải): ưu tiên params của tập, lùi về project.params */
export const DRAMA_RATIO_OPTIONS = ['9:16', '16:9', '1:1'] as const
export const DRAMA_RES_OPTIONS = ['480p', '720p', '1080p'] as const

export type DramaAspectRatio = (typeof DRAMA_RATIO_OPTIONS)[number]
export type DramaResolution = (typeof DRAMA_RES_OPTIONS)[number]

// Đọc khung hình từ project.params, giá trị không hợp lệ thì rơi về 9:16
export function readProjectAspectRatio(
  params: Record<string, unknown> | null | undefined,
): DramaAspectRatio {
  const ratio = String(params?.aspect_ratio || '').trim()
  if ((DRAMA_RATIO_OPTIONS as readonly string[]).includes(ratio)) {
    return ratio as DramaAspectRatio
  }
  return '9:16'
}

// Đọc độ phân giải từ project.params, giá trị không hợp lệ thì rơi về 480p
export function readProjectResolution(
  params: Record<string, unknown> | null | undefined,
): DramaResolution {
  const res = String(params?.resolution || '').trim()
  if ((DRAMA_RES_OPTIONS as readonly string[]).includes(res)) {
    return res as DramaResolution
  }
  return '480p'
}

// Lấy khung hình hợp lệ đầu tiên trong chuỗi params lồng nhau
export function pickDramaAspectRatio(
  ...sources: Array<Record<string, unknown> | null | undefined>
): DramaAspectRatio {
  for (const params of sources) {
    const ratio = String(params?.aspect_ratio || '').trim()
    if ((DRAMA_RATIO_OPTIONS as readonly string[]).includes(ratio)) {
      return ratio as DramaAspectRatio
    }
  }
  return '9:16'
}

// Lấy độ phân giải hợp lệ đầu tiên trong chuỗi params lồng nhau
export function pickDramaResolution(
  ...sources: Array<Record<string, unknown> | null | undefined>
): DramaResolution {
  for (const params of sources) {
    const res = String(params?.resolution || '').trim()
    if ((DRAMA_RES_OPTIONS as readonly string[]).includes(res)) {
      return res as DramaResolution
    }
  }
  return '480p'
}

// Khung hình của tập: episode.params → project.params → mặc định
export function readEpisodeAspectRatio(
  episodeParams: Record<string, unknown> | null | undefined,
  projectParams?: Record<string, unknown> | null | undefined,
): DramaAspectRatio {
  return pickDramaAspectRatio(episodeParams, projectParams)
}

// Độ phân giải của tập: episode.params → project.params → mặc định
export function readEpisodeResolution(
  episodeParams: Record<string, unknown> | null | undefined,
  projectParams?: Record<string, unknown> | null | undefined,
): DramaResolution {
  return pickDramaResolution(episodeParams, projectParams)
}

// Thông số của một cảnh: params ghi lúc tạo cảnh → của tập → của dự án
export function readFragmentVideoDimensions(
  fragmentParams: Record<string, unknown> | null | undefined,
): { w: number; h: number } | null {
  const gen = fragmentParams?.generation
  const genObj =
    gen && typeof gen === 'object' && !Array.isArray(gen)
      ? (gen as Record<string, unknown>)
      : null
  const w = Number(fragmentParams?.video_width ?? genObj?.video_width)
  const h = Number(fragmentParams?.video_height ?? genObj?.video_height)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { w: Math.round(w), h: Math.round(h) }
  }
  return null
}

// Suy ra khung hình chuẩn từ số pixel; nếu không chuẩn thì trả về "rộng×cao"
export function inferAspectRatioFromPixels(width: number, height: number): string {
  if (width <= 0 || height <= 0) return '9:16'
  const ratio = width / height
  const candidates: Array<[string, number]> = [
    ['9:16', 9 / 16],
    ['16:9', 16 / 9],
    ['1:1', 1],
  ]
  let best = candidates[0]
  let bestDiff = Math.abs(ratio - best[1])
  for (const item of candidates.slice(1)) {
    const diff = Math.abs(ratio - item[1])
    if (diff < bestDiff) {
      best = item
      bestDiff = diff
    }
  }
  if (bestDiff <= 0.08) return best[0]
  return `${width}×${height}`
}

export function readFragmentOutputLabel(
  fragmentParams: Record<string, unknown> | null | undefined,
  episodeParams?: Record<string, unknown> | null | undefined,
  projectParams?: Record<string, unknown> | null | undefined,
): string {
  const resolution = pickDramaResolution(fragmentParams, episodeParams, projectParams)
  const dims = readFragmentVideoDimensions(fragmentParams)
  if (dims) {
    return formatProjectOutputLabel(inferAspectRatioFromPixels(dims.w, dims.h), resolution)
  }
  return formatProjectOutputLabel(
    pickDramaAspectRatio(fragmentParams, episodeParams, projectParams),
    resolution,
  )
}

// Định dạng văn bản hiển thị ở thanh trên
export function formatProjectOutputLabel(aspectRatio: string, resolution: string): string {
  return `${aspectRatio} · ${resolution}`
}
