/**
 * Kiểm tra kịch bản storyboard của một tập (khớp docs/EPISODE_RULES.md §3 / §9)
 * Dùng để cảnh báo trước khi tạo: thời lượng, cảnh không lời bị gắn nhầm thành đối
 * thoại, tài nguyên thiếu ảnh / thiếu giọng đọc.
 *
 * RANH GIỚI — token và regex giữ nguyên tiếng Trung:
 *
 * `DRAMA_SUBTITLE_CUE`, `VISUAL_PREFIX`, `DIALOGUE_PREFIX`, `DRAMA_NARRATION_PREFIX`
 * và `VISUAL_SHOT_LABEL_RE` phải khớp chính xác với phía backend và với prompt mà
 * mô hình đọc. Dịch chúng thì mọi kiểm tra trượt và mọi kịch bản người dùng viết
 * bằng tiếng Trung (cách duy nhất được parser chấp nhận) sẽ bị từ chối. Vì vậy chỉ
 * `message` và chú thích mới dịch.
 */
import type { DramaAsset, DramaFragment } from '../api/drama'
import {
  DRAMA_SEGMENT_DURATION_HARD_MAX,
  DRAMA_SEGMENT_DURATION_MAX,
  DRAMA_SEGMENT_DURATION_MIN,
  DRAMA_SHOT_DURATION_HARD_MAX,
  FRAGMENT_CONTENT_DURATION_MAX,
} from './dramaEpisodePromptEditor'
import { extractDurations, sumDuration } from './segmentDuration'
import { DRAMA_VOICE_BINDING_ENABLED } from './dramaVoiceBinding'
import { localized, type LocalizedText } from './localeStrings'

/** Cue phụ đề của AI Drama (giống DRAMA_SUBTITLE_CUE ở backend) */
export const DRAMA_SUBTITLE_CUE = '【字幕：底部居中·简体中文·逐句轮换·与口播同步】'

/** Tiền tố cho cảnh không có lời thoại */
export const VISUAL_PREFIX = '【画面·无配音仅环境音】'

/** Tiền tố cho đối thoại */
export const DIALOGUE_PREFIX = '【对白·慢速清晰·同步字幕】'

/** Tiền tố cho lời dẫn */
export const DRAMA_NARRATION_PREFIX = '【旁白·慢速清晰·同步字幕】'

// Nhãn cảnh quay / cỡ cảnh (khớp VISUAL_SHOT_LABEL_RE ở backend)
const VISUAL_SHOT_LABEL_RE =
  /^(?:空镜|画面|远景|近景|中景|全景|特写|大特写|跟拍|俯拍|仰拍|航拍|推镜|拉镜|摇镜|环境|镜头|动作|转场|闪回|建立镜头|气氛镜头)\s*[：:]/

const VOICE_CUE_PREFIX_RE = /^【(?:对白|旁白|内心独白)[^】]*】\s*/

export type DramaScriptIssue = {
  level: 'error' | 'warn'
  message: string
}

/** Văn bản hiển thị cho người dùng; tiếng Trung chỉ để phục vụ locale zh. */
const COPY: Record<string, LocalizedText> = {
  emptyShotMislabeled: {
    zh: '检测到「空镜/景别」被标成对白或旁白（会口播并烧字幕）。请改为「【画面·无配音仅环境音】」或「空镜：…」纯画面行',
    en: 'Found a plain visual shot labelled as dialogue or narration (it would be spoken aloud and get burned-in subtitles). Change it to 【画面·无配音仅环境音】 or a plain visual line such as 空镜：…',
    vi: 'Phát hiện cảnh không lời bị gắn thành đối thoại hoặc lời dẫn (sẽ bị đọc to và ghi phụ đề vào hình). Hãy đổi thành 【画面·无配音仅环境音】 hoặc một dòng thuần hình ảnh như 空镜：…',
  },
  mustFix: { zh: '【须先修复】', en: '[Must fix first]', vi: '[Phải sửa trước]' },
  shouldHandle: {
    zh: '【建议处理，仍可继续】',
    en: '[Worth handling, you can still continue]',
    vi: '[Nên xử lý, vẫn làm tiếp được]',
  },
}

/** Thay {list} bằng danh sách tài nguyên đã ghép. */
function withList(value: LocalizedText, list: string): string {
  return localized(value).replace('{list}', list)
}

// Bỏ tiền tố đối thoại / lời dẫn
function stripVoiceCuePrefix(line: string): string {
  return (line || '').replace(VOICE_CUE_PREFIX_RE, '').trim()
}

// Nhân vật đã gắn audio tham chiếu có thể gửi đi chưa
function assetHasVoiceBinding(asset: DramaAsset): boolean {
  const params = (asset.params || {}) as Record<string, unknown>
  const raw = params.voiceAudio
  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>
    const url =
      typeof data.url === 'string'
        ? data.url
        : typeof data.previewUrl === 'string'
          ? data.previewUrl
          : ''
    if (url.trim()) return true
  }
  const canvas = params.canvas
  if (canvas && typeof canvas === 'object') {
    const voiceAudio = (canvas as Record<string, unknown>).voiceAudio
    if (voiceAudio && typeof voiceAudio === 'object') {
      const url = (voiceAudio as Record<string, unknown>).url
      if (typeof url === 'string' && url.trim()) return true
    }
  }
  return false
}

// Gộp các @asset trong nội dung với asset_ids
function listFragmentAssetIds(frag: DramaFragment): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  const re = /@asset:(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(frag.content || ''))) {
    const id = Number(m[1])
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const id of frag.asset_ids || []) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

// Nội dung có phải chỉ là mô tả hình ảnh / cảnh không lời không
export function isVisualDescriptionBody(text: string): boolean {
  let body = stripVoiceCuePrefix((text || '').trim())
  body = body.replace(/^【(?:画面|空镜)[^】]*】\s*/, '').trim()
  if (!body) return false
  if (VISUAL_SHOT_LABEL_RE.test(body)) return true
  if (body.startsWith('空镜') || body.startsWith('△') || body.startsWith('Δ')) return true
  return false
}

// Kịch bản có thật sự cần lời đọc không (loại trừ nhãn cảnh không lời)
function scriptLikelyNeedsVoice(content: string): boolean {
  for (const raw of (content || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('@duration:')) continue
    if (
      line.startsWith('【字幕') ||
      line.startsWith('【BGM') ||
      line.startsWith('【人物介绍') ||
      line.startsWith('【片头') ||
      line.startsWith('【背景介绍')
    ) {
      continue
    }
    if (line.startsWith('【对白') || line.startsWith('【旁白') || line.startsWith('【内心独白')) {
      if (!isVisualDescriptionBody(line)) return true
      continue
    }
    if (isVisualDescriptionBody(line)) continue
    if (/^[^：:\n]{1,16}[：:]/.test(line) && !VISUAL_SHOT_LABEL_RE.test(line)) {
      return true
    }
  }
  return false
}

// Kiểm tra kịch bản của một cảnh: thời lượng + cảnh không lời bị gắn nhầm
export function validateDramaFragmentScript(content: string): DramaScriptIssue[] {
  const issues: DramaScriptIssue[] = []
  const durations = extractDurations(content || '')
  const total = sumDuration(content || '')

  const badSegment = durations.find(
    (value) =>
      !Number.isFinite(value) ||
      value < DRAMA_SEGMENT_DURATION_MIN ||
      value > DRAMA_SEGMENT_DURATION_HARD_MAX,
  )
  if (badSegment != null) {
    issues.push({
      level: 'error',
      message: localized({
        zh: `单个 @duration 需在 ${DRAMA_SEGMENT_DURATION_MIN}–${DRAMA_SEGMENT_DURATION_HARD_MAX} 秒之间`,
        en: `A single @duration must be between ${DRAMA_SEGMENT_DURATION_MIN} and ${DRAMA_SEGMENT_DURATION_HARD_MAX} seconds`,
        vi: `Một @duration đơn lẻ phải nằm trong khoảng ${DRAMA_SEGMENT_DURATION_MIN}–${DRAMA_SEGMENT_DURATION_HARD_MAX} giây`,
      }),
    })
  } else if (durations.some((value) => value > DRAMA_SEGMENT_DURATION_MAX)) {
    issues.push({
      level: 'warn',
      message: localized({
        zh: `部分 @duration 超过新分镜建议 ${DRAMA_SEGMENT_DURATION_MAX}s，旧稿可继续生成`,
        en: `Some @duration values exceed the ${DRAMA_SEGMENT_DURATION_MAX}s suggested for new shots. Older scripts can still be generated.`,
        vi: `Một số @duration vượt quá ${DRAMA_SEGMENT_DURATION_MAX}s mà bản storyboard mới khuyến nghị. Bản cũ vẫn tạo được.`,
      }),
    })
  }

  if (total > DRAMA_SHOT_DURATION_HARD_MAX) {
    issues.push({
      level: 'error',
      message: localized({
        zh: `本镜 @duration 合计 ${total}s，超过 Seedance 上限 ${DRAMA_SHOT_DURATION_HARD_MAX}s`,
        en: `This shot totals ${total}s of @duration, over the Seedance limit of ${DRAMA_SHOT_DURATION_HARD_MAX}s`,
        vi: `Cảnh này cộng @duration lên ${total}s, vượt giới hạn ${DRAMA_SHOT_DURATION_HARD_MAX}s của Seedance`,
      }),
    })
  } else if (total > FRAGMENT_CONTENT_DURATION_MAX) {
    issues.push({
      level: 'warn',
      message: localized({
        zh: `本镜 @duration 合计 ${total}s，超过新分镜建议 ${FRAGMENT_CONTENT_DURATION_MAX}s（旧稿可继续生成）`,
        en: `This shot totals ${total}s of @duration, over the ${FRAGMENT_CONTENT_DURATION_MAX}s suggested for new shots (older scripts can still be generated).`,
        vi: `Cảnh này cộng @duration lên ${total}s, vượt ${FRAGMENT_CONTENT_DURATION_MAX}s mà bản storyboard mới khuyến nghị (bản cũ vẫn tạo được).`,
      }),
    })
  }

  for (const raw of (content || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('@duration:')) continue
    if (line.startsWith('【字幕') || line.startsWith('【BGM') || line.startsWith('【人物介绍')) {
      continue
    }
    if (VOICE_CUE_PREFIX_RE.test(line) && isVisualDescriptionBody(line)) {
      issues.push({
        level: 'error',
        message: localized(COPY.emptyShotMislabeled),
      })
      break
    }
  }

  return issues
}

// Kiểm tra tài nguyên của cảnh: thiếu ảnh / nhân vật nói thiếu giọng (mức cảnh báo, vẫn tạo được)
export function validateDramaFragmentAssets(
  frag: DramaFragment | null | undefined,
  assets: DramaAsset[],
): DramaScriptIssue[] {
  const issues: DramaScriptIssue[] = []
  if (!frag) return issues

  const byId = new Map(assets.map((a) => [a.id, a]))
  const ids = listFragmentAssetIds(frag)
  const needsVoice = scriptLikelyNeedsVoice(frag.content || '')

  const missingImage: string[] = []
  const missingVoice: string[] = []

  for (const id of ids) {
    const asset = byId.get(id)
    if (!asset) {
      missingImage.push(`#${id}`)
      continue
    }
    const kind = (asset.type || '').toLowerCase()
    const hasImage = Boolean((asset.cover || asset.url || '').trim())
    if ((kind === 'character' || kind === 'scene' || kind === 'prop') && !hasImage) {
      missingImage.push(asset.name || `#${id}`)
    }
    if (DRAMA_VOICE_BINDING_ENABLED && kind === 'character' && needsVoice && !assetHasVoiceBinding(asset)) {
      missingVoice.push(asset.name || `#${id}`)
    }
  }

  if (missingImage.length > 0) {
    issues.push({
      level: 'warn',
      message: withList(
        {
          zh: '以下资产缺少参考图，生成时可能自动补图或效果不稳定：{list}',
          en: 'These assets have no reference image, so the system may have to fill one in or the result may be unstable: {list}',
          vi: 'Các tài nguyên sau chưa có ảnh tham chiếu, nên lúc tạo hệ thống có thể phải tự bổ ảnh hoặc kết quả không ổn định: {list}',
        },
        `${missingImage.slice(0, 5).join('、')}${missingImage.length > 5 ? '…' : ''}`,
      ),
    })
  }

  if (missingVoice.length > 0) {
    issues.push({
      level: 'warn',
      message: withList(
        {
          zh: '脚本含对白，但以下角色尚未绑定音色：{list}',
          en: 'The script has dialogue, but these characters have no voice bound yet: {list}',
          vi: 'Kịch bản có đối thoại, nhưng các nhân vật sau chưa gắn giọng đọc: {list}',
        },
        `${missingVoice.slice(0, 5).join('、')}${missingVoice.length > 5 ? '…' : ''}`,
      ),
    })
  }

  return issues
}

// Gộp vấn đề của kịch bản và của tài nguyên; có error thì không được tạo thẳng
export function collectDramaGenerateGateIssues(
  frag: DramaFragment | null | undefined,
  assets: DramaAsset[],
): { blocking: DramaScriptIssue[]; warnings: DramaScriptIssue[] } {
  const scriptIssues = validateDramaFragmentScript(frag?.content || '')
  const assetIssues = validateDramaFragmentAssets(frag, assets)
  const all = [...scriptIssues, ...assetIssues]
  return {
    blocking: all.filter((i) => i.level === 'error'),
    warnings: all.filter((i) => i.level === 'warn'),
  }
}

// Ghép danh sách vấn đề thành văn bản cho hộp xác nhận
export function formatDramaGateMessage(
  blocking: DramaScriptIssue[],
  warnings: DramaScriptIssue[],
  baseMessage: string,
): string {
  const parts = [baseMessage]
  if (blocking.length > 0) {
    parts.push('', localized(COPY.mustFix), ...blocking.map((i) => `· ${i.message}`))
  }
  if (warnings.length > 0) {
    parts.push('', localized(COPY.shouldHandle), ...warnings.map((i) => `· ${i.message}`))
  }
  return parts.join('\n')
}
