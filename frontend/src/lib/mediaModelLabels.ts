/**
 * Display labels for the media-model catalog and the voice presets.
 *
 * Both come from the backend with Chinese `label` / `description` /
 * `pricing_hint` / `eta_hint` and the API has no locale parameter, so that text
 * reaches every interface language. The wire values (`id`, `speaker`, `gender`,
 * durations) are never touched — only the rendered strings are translated.
 *
 * Same shape and same reasoning as `templateLabels.ts`: a plain
 * `Record<string, LocalizedText>` read through a function, never spread, so no
 * getter can be evaluated before its table is initialised (`AGENTS.md` §7).
 */

import { localized, type LocalizedText } from './localeStrings'

type ModelText = {
  description: LocalizedText
  pricing_hint: LocalizedText
  eta_hint: LocalizedText
}

const MODEL_LABELS: Record<string, ModelText> = {
  'seedream-5-0-pro': {
    description: {
      zh: '角色一致性好，适合漫剧定妆与分镜静帧',
      en: 'Strong character consistency, good for comic-drama look sheets and storyboard stills',
      vi: 'Tính nhất quán nhân vật tốt, hợp với ảnh tạo hình nhân vật và khung hình storyboard',
    },
    pricing_hint: {
      zh: '清晰度越高越贵',
      en: 'Costs more at higher resolution',
      vi: 'Độ phân giải càng cao càng tốn hơn',
    },
    eta_hint: {
      zh: '约 20–60 秒/张',
      en: 'About 20–60 s per image',
      vi: 'Khoảng 20–60 giây mỗi ảnh',
    },
  },
  'gpt-image-2': {
    description: {
      zh: '细节与文字表现好，适合海报与精细静帧',
      en: 'Good detail and text rendering, good for posters and fine stills',
      vi: 'Chi tiết và chữ hiển thị tốt, hợp với poster và khung hình tinh tế',
    },
    pricing_hint: {
      zh: '清晰度越高越贵',
      en: 'Costs more at higher resolution',
      vi: 'Độ phân giải càng cao càng tốn hơn',
    },
    eta_hint: {
      zh: '约 30–90 秒/张',
      en: 'About 30–90 s per image',
      vi: 'Khoảng 30–90 giây mỗi ảnh',
    },
  },
  'seedance-2-0': {
    description: {
      zh: '标准成片，运镜较稳；最高 720p',
      en: 'Standard result, steady camera work; up to 720p',
      vi: 'Kết quả tiêu chuẩn, camera ổn định; tối đa 720p',
    },
    pricing_hint: {
      zh: '清晰度越高越贵',
      en: 'Costs more at higher resolution',
      vi: 'Độ phân giải càng cao càng tốn hơn',
    },
    eta_hint: {
      zh: '约 2–5 分钟/镜',
      en: 'About 2–5 min per shot',
      vi: 'Khoảng 2–5 phút mỗi cảnh',
    },
  },
  'seedance-2-0-mini': {
    description: {
      zh: '更快更省，适合草稿与批量；最高 720p',
      en: 'Faster and cheaper, good for drafts and batches; up to 720p',
      vi: 'Nhanh hơn và rẻ hơn, hợp với bản nháp và hàng loạt; tối đa 720p',
    },
    pricing_hint: {
      zh: '更省 · 清晰度越高越贵',
      en: 'Cheaper · costs more at higher resolution',
      vi: 'Rẻ hơn · độ phân giải càng cao càng tốn hơn',
    },
    eta_hint: {
      zh: '约 1–3 分钟/镜',
      en: 'About 1–3 min per shot',
      vi: 'Khoảng 1–3 phút mỗi cảnh',
    },
  },
  'seedance-2-5': {
    description: {
      zh: '成片首选，画质更好；支持到 1080p',
      en: 'First choice for finished films, better image quality; supports up to 1080p',
      vi: 'Lựa chọn hàng đầu cho phim hoàn chỉnh, chất lượng hình tốt hơn; hỗ trợ tới 1080p',
    },
    pricing_hint: {
      zh: '相对更贵 · 清晰度越高越贵',
      en: 'Costs more · costs more at higher resolution',
      vi: 'Tốn hơn · độ phân giải càng cao càng tốn hơn',
    },
    eta_hint: {
      zh: '约 3–8 分钟/镜',
      en: 'About 3–8 min per shot',
      vi: 'Khoảng 3–8 phút mỗi cảnh',
    },
  },
  'minimax-h3': {
    description: {
      zh: '节奏感强、人物生动；4–15 秒，仅 720p',
      en: 'Punchy pacing, lively characters; 4–15 s, 720p only',
      vi: 'Nhịp điệu mạnh, nhân vật sinh động; 4–15 giây, chỉ 720p',
    },
    pricing_hint: {
      zh: '出片偏慢',
      en: 'Slower to render',
      vi: 'Ra hình chậm hơn',
    },
    eta_hint: {
      zh: '偏慢，4s 约 15 分钟起',
      en: 'Slow, roughly 15 min at 4 s',
      vi: 'Chậm, khoảng 15 phút với 4 giây',
    },
  },
}

/** Model ids are matched case-insensitively: the catalog ships `MiniMax-H3`. */
function modelKey(id: string | undefined | null): string {
  return (id || '').toLowerCase()
}

/** Localized model description, falling back to the backend string. */
export function mediaModelDescription(id: string | undefined | null, fallback = ''): string {
  const entry = MODEL_LABELS[modelKey(id)]
  return entry ? localized(entry.description) : fallback
}

/** Localized pricing hint. Returns `''` when the backend sends none. */
export function mediaModelPricingHint(id: string | undefined | null, fallback = ''): string {
  const entry = MODEL_LABELS[modelKey(id)]
  if (!entry) return fallback
  const text = localized(entry.pricing_hint)
  return text || fallback
}

/** Localized turnaround hint. Returns `''` when the backend sends none. */
export function mediaModelEtaHint(id: string | undefined | null, fallback = ''): string {
  const entry = MODEL_LABELS[modelKey(id)]
  if (!entry) return fallback
  const text = localized(entry.eta_hint)
  return text || fallback
}

const VOICE_LABELS: Record<string, LocalizedText> = {
  zh_female_cancan_uranus_bigtts: {
    zh: '灿灿 · 女声旁白',
    en: 'Cancan · Female narrator',
    vi: 'Cancan · Nữ giọng dẫn chuyện',
  },
  zh_female_tianmeixiaoyuan_uranus_bigtts: {
    zh: '甜美女声 · 故事',
    en: 'Sweet female · Storytelling',
    vi: 'Nữ giọng ngọt ngào · Kể chuyện',
  },
  zh_female_shuangkuaisisi_uranus_bigtts: {
    zh: '爽快女声 · 都市',
    en: 'Brisk female · Urban',
    vi: 'Nữ giọng sắc gọn · Đô thị',
  },
  zh_female_vv_uranus_bigtts: {
    zh: 'Vivi · 国风女声',
    en: 'Vivi · Classical Chinese female',
    vi: 'Vivi · Nữ giọng cổ điển',
  },
  zh_female_xiaohe_uranus_bigtts: {
    zh: '小何 · 通用女声',
    en: 'Xiaohe · General female',
    vi: 'Xiaohe · Nữ giọng đa dụng',
  },
  zh_male_shaonianzixin_uranus_bigtts: {
    zh: '少年梓辛 · 男声',
    en: 'Shaonian Zixin · Male',
    vi: 'Thiếu niên Tử Tân · Nam',
  },
  zh_male_m191_uranus_bigtts: {
    zh: '云舟 · 稳重男声',
    en: 'Yunzhou · Steady male',
    vi: 'Vân Châu · Nam giọng điềm tĩnh',
  },
  zh_male_taocheng_uranus_bigtts: {
    zh: '小天 · 年轻男声',
    en: 'Xiaotian · Young male',
    vi: 'Tiểu Thiên · Nam giọng trẻ',
  },
  zh_male_ruyayichen_uranus_bigtts: {
    zh: '儒雅逸辰 · 男声',
    en: 'Ruyai Yichen · Male',
    vi: 'Nhã nhã Dật Thần · Nam',
  },
  zh_male_baqiqingshu_uranus_bigtts: {
    zh: '霸气青叔 · 男声',
    en: 'Baqi Qingshu · Male',
    vi: 'Bá khí Thanh Thúc · Nam',
  },
}

/**
 * Localized voice name, falling back to the backend string.
 *
 * `id` and `speaker` are the same value for every preset today, but the lookup
 * tries both so a preset that separates them still resolves.
 */
export function voiceName(
  voice: { id?: string; speaker?: string; label?: string } | null | undefined,
): string {
  if (!voice) return ''
  const entry = VOICE_LABELS[voiceKeyOf(voice.id)] ?? VOICE_LABELS[voiceKeyOf(voice.speaker)]
  return entry ? localized(entry) : voice.label || ''
}

function voiceKeyOf(value: string | undefined): string {
  return (value || '').toLowerCase()
}
