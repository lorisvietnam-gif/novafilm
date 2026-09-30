/**
 * Phân tích, kiểm tra và xem trước các đoạn @duration trong kịch bản storyboard
 * Hằng số khớp với seedance_segments ở backend (mỗi đoạn 3–12s, tổng một cảnh ≤30s)
 */

import { localized } from './localeStrings'

/** Thời lượng nhỏ nhất của một đoạn (giây) */
export const SEGMENT_DURATION_MIN = 3

/** Thời lượng lớn nhất của một đoạn (giây) */
export const SEGMENT_DURATION_MAX = 12

/** Tổng @duration tối đa trong một cảnh (giây) */
export const SHOT_DURATION_MAX = 30

/** Các mốc thời lượng chọn nhanh (giây) */
export const SEGMENT_DURATION_PRESETS = [4, 6, 8, 10, 12] as const

/** Cue phụ đề khớp với backend (đóng sau, không phải mô hình tự viết) */
export const SUBTITLE_CUE = '【字幕：后期叠旁白字幕，简体中文逐句同步】'

/** Tiền tố lời dẫn khớp với backend (nhịp tự nhiên; bản cũ dùng "慢速清晰" vẫn nhận ra được) */
export const NARRATION_PREFIX = '【旁白·自然语速·同步字幕】'

/** Văn bản gợi ý trong ô soạn kịch bản */
export const SEGMENT_SCRIPT_PLACEHOLDER = `${SUBTITLE_CUE}\n【BGM：后期混音 · 轻快专业，音量低于人声】\n@duration:4\n过肩工位操作画面…\n@duration:8\n${NARRATION_PREFIX}口播内容…`

const DURATION_TOKEN_PATTERN = /@duration:(\d+)/g

export type SegmentBeatView = { duration: number; text: string }

/**
 * Lấy toàn bộ số giây @duration trong kịch bản (giữ nguyên thứ tự)
 * @param content văn bản kịch bản storyboard từng đoạn
 */
export function extractDurations(content: string): number[] {
  const durations: number[] = []
  for (const match of content.matchAll(DURATION_TOKEN_PATTERN)) {
    const seconds = Number(match[1])
    if (Number.isFinite(seconds) && seconds > 0) {
      durations.push(seconds)
    }
  }
  return durations
}

/**
 * Cộng tổng số giây @duration trong kịch bản
 * @param content văn bản kịch bản storyboard từng đoạn
 */
export function sumDuration(content: string): number {
  return extractDurations(content).reduce((sum, value) => sum + value, 0)
}

/**
 * Thời lượng dùng để hiển thị trong danh sách cảnh: ưu tiên tổng @duration trong kịch bản, không có thì lùi về shot.duration
 * (lúc tạo, trường duration của LLM thường lệch với nhãn từng đoạn, danh sách nên khớp với nhãn 3s/4s mà người dùng thấy)
 */
export function shotDisplayDurationSec(shot: {
  duration?: number | null
  segment_script?: string | null
  video_prompt?: string | null
}): number {
  const script = String(shot.segment_script || shot.video_prompt || '')
  const tagged = sumDuration(script)
  if (tagged > 0) return tagged
  const stored = Number(shot.duration)
  return Number.isFinite(stored) && stored > 0 ? stored : 0
}

/**
 * Kiểm tra một thời lượng có nằm trong khoảng hợp lệ của một đoạn không
 * @param seconds thời lượng tính bằng giây
 */
export function isValidSegmentDuration(seconds: number): boolean {
  return (
    Number.isFinite(seconds) &&
    seconds >= SEGMENT_DURATION_MIN &&
    seconds <= SEGMENT_DURATION_MAX
  )
}

/**
 * Kiểm tra các nhãn thời lượng trong kịch bản: phạm vi từng đoạn + tổng không vượt trần của một cảnh
 * @param content văn bản kịch bản storyboard từng đoạn
 */
export function validateSegmentScriptDuration(content: string): {
  valid: boolean
  total: number
  durations: number[]
  message?: string
} {
  const durations = extractDurations(content)
  const total = durations.reduce((sum, value) => sum + value, 0)

  if (durations.length === 0) {
    return { valid: true, total: 0, durations }
  }

  if (durations.some((value) => !isValidSegmentDuration(value))) {
    return {
      valid: false,
      total,
      durations,
      message: localized({
        zh: `单个 @duration 需在 ${SEGMENT_DURATION_MIN}–${SEGMENT_DURATION_MAX} 秒之间`,
        en: `A single @duration must be between ${SEGMENT_DURATION_MIN} and ${SEGMENT_DURATION_MAX} seconds`,
        vi: `Một @duration đơn lẻ phải nằm trong khoảng ${SEGMENT_DURATION_MIN}–${SEGMENT_DURATION_MAX} giây`,
      }),
    }
  }

  if (total > SHOT_DURATION_MAX) {
    return {
      valid: false,
      total,
      durations,
      message: localized({
        zh: `镜头时长合计不能超过 ${SHOT_DURATION_MAX} 秒（当前 ${total}s）`,
        en: `The clip cannot run longer than ${SHOT_DURATION_MAX} seconds (currently ${total}s)`,
        vi: `Tổng thời lượng của một cảnh không được vượt quá ${SHOT_DURATION_MAX} giây (hiện là ${total}s)`,
      }),
    }
  }

  return { valid: true, total, durations }
}

/**
 * Tách kịch bản thành các cue phụ đề / BGM và các đoạn nội dung kèm thời lượng (dùng để xem trước trong danh sách)
 * @param script kịch bản storyboard từng đoạn
 */
export function parseSegmentScript(script: string | undefined | null): {
  cues: string[]
  beats: SegmentBeatView[]
} {
  /*
   * cues  các dòng phụ đề / BGM
   * beats các đoạn nội dung kèm duration
   * pendingDur giá trị @duration của đoạn trước
   */
  const cues: string[] = []
  const beats: SegmentBeatView[] = []
  let pendingDur = 0

  const lines = String(script || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    if (line.startsWith('【字幕') || line.startsWith('【BGM')) {
      cues.push(line)
      continue
    }
    const m = line.match(/^@duration:(\d+)/)
    if (m) {
      pendingDur = Number(m[1]) || 0
      continue
    }
    if (pendingDur > 0 || beats.length === 0) {
      beats.push({ duration: pendingDur || 0, text: line })
      pendingDur = 0
    } else {
      beats.push({ duration: 0, text: line })
    }
  }

  return { cues, beats }
}

const NARRATION_LINE_PREFIX = /^【旁白[^】]*】/

/** Dòng kịch bản có phải lời dẫn không (cue phụ đề chứa chữ 旁白 thì không tính) */
export function isNarrationScriptLine(line: string): boolean {
  const stripped = line.trim()
  if (stripped.startsWith('【字幕') || stripped.startsWith('【BGM')) return false
  return NARRATION_LINE_PREFIX.test(stripped)
}

/** Bỏ tiền tố lời dẫn để lấy phần nội dung đọc được */
export function stripNarrationPrefix(line: string): string {
  return line.trim().replace(NARRATION_LINE_PREFIX, '').trim()
}

/** Lấy nội dung lời dẫn từ kịch bản (ghép nhiều đoạn) */
export function narrationFromScript(script: string | undefined | null): string {
  const parts: string[] = []
  for (const line of String(script || '').replace(/\r\n/g, '\n').split('\n')) {
    if (isNarrationScriptLine(line)) {
      const text = stripNarrationPrefix(line)
      if (text) parts.push(text)
    }
  }
  return parts.join('')
}

/** Lấy dòng hình ảnh đầu tiên từ kịch bản (không phải lời dẫn, không phải cue) */
export function firstVisualFromScript(script: string | undefined | null): string {
  for (const line of String(script || '').replace(/\r\n/g, '\n').split('\n')) {
    const stripped = line.trim()
    if (
      !stripped ||
      stripped.startsWith('@duration:') ||
      stripped.startsWith('【字幕') ||
      stripped.startsWith('【BGM') ||
      isNarrationScriptLine(stripped)
    ) {
      continue
    }
    return stripped.replace(/^【[^】]*】/, '').trim() || stripped
  }
  return ''
}

/** Ghi lại lời dẫn từ popup vào đoạn lời dẫn của kịch bản */
export function replaceNarrationInScript(script: string, narration: string): string {
  const text = narration.trim()
  const lines = String(script || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let replaced = false
  for (const raw of lines) {
    const stripped = raw.trim()
    if (text && isNarrationScriptLine(stripped) && !replaced) {
      const prefix = stripped.match(NARRATION_LINE_PREFIX)?.[0] || NARRATION_PREFIX
      out.push(`${prefix}${text}`)
      replaced = true
      continue
    }
    out.push(raw.replace(/\s+$/, ''))
  }
  if (text && !replaced) {
    out.push('@duration:6')
    out.push(`${NARRATION_PREFIX}${text}`)
  }
  return out.join('\n').trim()
}

/** Ghi lại hình ảnh khung hình đầu từ popup vào đoạn visual đầu tiên */
export function replaceFirstVisualInScript(script: string, visual: string): string {
  const text = visual.trim()
  if (!text) return String(script || '').trim()
  const lines = String(script || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let replaced = false
  let cueEnd = 0
  for (let i = 0; i < lines.length; i += 1) {
    const stripped = lines[i].trim()
    if (stripped.startsWith('【字幕') || stripped.startsWith('【BGM') || !stripped) {
      cueEnd = i + 1
      continue
    }
    break
  }
  for (const raw of lines) {
    const stripped = raw.trim()
    if (
      !replaced &&
      stripped &&
      !stripped.startsWith('@duration:') &&
      !stripped.startsWith('【字幕') &&
      !stripped.startsWith('【BGM') &&
      !isNarrationScriptLine(stripped)
    ) {
      out.push(text)
      replaced = true
      continue
    }
    out.push(raw.replace(/\s+$/, ''))
  }
  if (!replaced) {
    const extra = [`@duration:${SEGMENT_DURATION_MIN}`, text]
    return [...out.slice(0, cueEnd), ...extra, ...out.slice(cueEnd)].join('\n').trim()
  }
  return out.join('\n').trim()
}
