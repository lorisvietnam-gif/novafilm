/** Xem trước video của tập: bộ công cụ thanh thời gian chung xuyên suốt các cảnh */
import type { DramaFragment } from '../api/drama'

// DramaEpisodeVideoTimelineSegment khoảng của một cảnh trên thanh thời gian của tập
export type DramaEpisodeVideoTimelineSegment = {
  fragmentId: number
  index: number
  durationSec: number
  startSec: number
  endSec: number
  hasVideo: boolean
}

// Cộng các @duration trong nội dung cảnh
function sumFragmentContentDuration(content: string): number {
  const re = /@duration:(\d+)/g
  let total = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content || ''))) {
    const sec = Number(m[1])
    if (sec > 0) total += sec
  }
  return total
}

// Tính thời lượng của một cảnh trên thanh thời gian (giây)
function resolveEpisodeFragmentTimelineDuration(fragment: DramaFragment): number {
  const fromTags = sumFragmentContentDuration(fragment.content)
  if (fromTags > 0) return Math.min(15, Math.max(4, fromTags))
  const fallback = fragment.duration_sec && fragment.duration_sec > 0 ? fragment.duration_sec : 8
  return Math.min(15, Math.max(4, fallback))
}

// Dựng các đoạn của thanh thời gian từ toàn bộ cảnh trong tập
export function buildEpisodeVideoTimelineSegments(
  fragments: DramaFragment[],
): DramaEpisodeVideoTimelineSegment[] {
  let cursor = 0

  return fragments.flatMap((fragment, index) => {
    const durationSec = resolveEpisodeFragmentTimelineDuration(fragment)

    if (durationSec <= 0) {
      return []
    }

    const startSec = cursor
    const endSec = cursor + durationSec

    cursor = endSec

    return [
      {
        fragmentId: fragment.id,
        index,
        durationSec,
        startSec,
        endSec,
        hasVideo: Boolean(fragment.video),
      },
    ]
  })
}

// Tính tổng thời lượng của thanh thời gian tập
export function resolveEpisodeVideoTimelineTotalDuration(
  segments: DramaEpisodeVideoTimelineSegment[],
): number {
  if (segments.length === 0) {
    return 0
  }

  return segments[segments.length - 1]?.endSec ?? 0
}

// Ánh xạ thời gian phát trong một cảnh sang vị trí trên thanh thời gian chung
export function resolveGlobalTimeFromFragmentPlayback(
  segment: DramaEpisodeVideoTimelineSegment,
  localTimeSec: number,
  localDurationSec: number,
): number {
  if (localDurationSec <= 0) {
    return segment.startSec
  }

  const ratio = Math.min(1, Math.max(0, localTimeSec / localDurationSec))

  return segment.startSec + ratio * segment.durationSec
}

// Ánh xạ vị trí trên thanh thời gian chung sang thời gian phát trong một cảnh
export function resolveFragmentPlaybackFromGlobalTime(
  segments: DramaEpisodeVideoTimelineSegment[],
  globalTimeSec: number,
): {
  segment: DramaEpisodeVideoTimelineSegment
  localTimeSec: number
} | null {
  if (segments.length === 0) {
    return null
  }

  const clampedGlobalTime = Math.min(
    Math.max(0, globalTimeSec),
    resolveEpisodeVideoTimelineTotalDuration(segments),
  )

  const segment =
    segments.find(
      (item) => clampedGlobalTime >= item.startSec && clampedGlobalTime < item.endSec,
    ) ?? segments[segments.length - 1]

  if (!segment) {
    return null
  }

  const localTimeSec = Math.min(
    segment.durationSec,
    Math.max(0, clampedGlobalTime - segment.startSec),
  )

  return {
    segment,
    localTimeSec,
  }
}

// Tìm chỉ số của cảnh chứa thời gian chung hiện tại
export function resolveEpisodeVideoTimelineSegmentIndex(
  segments: DramaEpisodeVideoTimelineSegment[],
  globalTimeSec: number,
): number {
  if (segments.length === 0) {
    return 0
  }

  const matched = segments.find(
    (segment) => globalTimeSec >= segment.startSec && globalTimeSec < segment.endSec,
  )

  return matched?.index ?? segments[segments.length - 1]?.index ?? 0
}

// Tính tỉ lệ đã phát trong một đoạn cảnh (0–1)
export function resolveEpisodeTimelineSegmentFillRatio(
  segment: DramaEpisodeVideoTimelineSegment,
  globalTimeSec: number,
): number {
  if (globalTimeSec >= segment.endSec) {
    return 1
  }

  if (globalTimeSec <= segment.startSec) {
    return 0
  }

  const span = segment.endSec - segment.startSec

  if (span <= 0) {
    return 0
  }

  return (globalTimeSec - segment.startSec) / span
}

// Định dạng số giây thành mm:ss
export function formatVideoTimelineClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainSeconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`
}

// Ánh xạ tỉ lệ bấm trên thanh tiến độ sang thời gian phát chung
export function resolveVideoTimelineSeekTime(ratio: number, totalDurationSec: number): number {
  if (totalDurationSec <= 0) {
    return 0
  }

  const clampedRatio = Math.min(1, Math.max(0, ratio))

  return clampedRatio * totalDurationSec
}

// Tìm id của cảnh kế tiếp có video phát được
export function resolveNextPlayableFragmentId(
  segments: DramaEpisodeVideoTimelineSegment[],
  currentFragmentId: number,
): number | null {
  const currentIndex = segments.findIndex((segment) => segment.fragmentId === currentFragmentId)

  if (currentIndex < 0) {
    return null
  }

  for (let index = currentIndex + 1; index < segments.length; index += 1) {
    const segment = segments[index]

    if (segment?.hasVideo) {
      return segment.fragmentId
    }
  }

  return null
}
