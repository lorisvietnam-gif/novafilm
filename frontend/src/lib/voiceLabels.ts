/**
 * Nhãn hiển thị cho giọng đọc TTS lấy từ backend.
 *
 * Backend lưu `label` tiếng Trung trong `app/services/voices.py` và trả về nguyên văn cho
 * mọi ngôn ngữ. `voice_id` / `speaker` mới là giá trị mà backend đối chiếu khi tổng hợp
 * video, nên **không được sửa** — chỉ phần hiển thị mới dịch.
 *
 * Tên riêng của giọng (`灿灿`, `云舟`, `Vivi`…) là thương hiệu giọng đọc, giữ nguyên ở mọi
 * ngôn ngữ để người dùng khớp với thứ họ nghe ở nơi khác. Phần sau dấu `·` mô tả chất
 * giọng thì dịch.
 */

import { localized, type LocalizedText } from './localeStrings'

/** Khoá là `voice.id` của backend (`zh_female_cancan_uranus_bigtts`…). */
const VOICE_LABELS: Record<string, LocalizedText> = {
  zh_female_cancan_uranus_bigtts: {
    zh: '灿灿 · 女声旁白',
    en: 'Cancan · Female narrator',
    vi: 'Cancan · Nữ dẫn chuyện',
  },
  zh_female_tianmeixiaoyuan_uranus_bigtts: {
    zh: '甜美女声 · 故事',
    en: 'Sweet female voice · Storytelling',
    vi: 'Nữ ngọt · Kể chuyện',
  },
  zh_female_shuangkuaisisi_uranus_bigtts: {
    zh: '爽快女声 · 都市',
    en: 'Brisk female voice · Urban',
    vi: 'Nữ dứt khoát · Đô thị',
  },
  zh_female_vv_uranus_bigtts: {
    zh: 'Vivi · 国风女声',
    en: 'Vivi · Classic Chinese female voice',
    vi: 'Vivi · Nữ giọng cổ điển',
  },
  zh_female_xiaohe_uranus_bigtts: {
    zh: '小何 · 通用女声',
    en: 'Xiaohe · Versatile female voice',
    vi: 'Xiaohe · Nữ đa dụng',
  },
  zh_male_shaonianzixin_uranus_bigtts: {
    zh: '少年梓辛 · 男声',
    en: 'Shaonian Zixin · Young male voice',
    vi: 'Shaonian Zixin · Nam trẻ',
  },
  zh_male_m191_uranus_bigtts: {
    zh: '云舟 · 稳重男声',
    en: 'Yunzhou · Steady male voice',
    vi: 'Yunzhou · Nam trầm ổn',
  },
  zh_male_taocheng_uranus_bigtts: {
    zh: '小天 · 年轻男声',
    en: 'Xiaotian · Young male voice',
    vi: 'Xiaotian · Nam trẻ',
  },
  zh_male_ruyayichen_uranus_bigtts: {
    zh: '儒雅逸辰 · 男声',
    en: 'Ruya Yichen · Refined male voice',
    vi: 'Ruya Yichen · Nam điềm tành',
  },
  zh_male_baqiqingshu_uranus_bigtts: {
    zh: '霸气青叔 · 男声',
    en: 'Baqi Qingshu · Commanding male voice',
    vi: 'Baqi Qingshu · Nam uy nghi',
  },
}

/**
 * Nhãn giọng theo ngôn ngữ đang dùng.
 *
 * Khoá tra theo `id` trước, rồi `speaker` — hai trường này trùng nhau ở backend hiện tại
 * nhưng tách bạch vì `speaker` mới là giá trị gửi cho TTS và có thể tồn tại độc lập.
 *
 * Giọng lạ (backend thêm mới) thì trả về đúng `label` gốc.
 */
export function voiceLabel(voice: { id: string; label: string; speaker?: string }): string {
  const entry = VOICE_LABELS[voice.id] ?? (voice.speaker ? VOICE_LABELS[voice.speaker] : undefined)
  if (!entry) return voice.label
  return localized(entry)
}

/** Danh sách id đã có bảng nhãn — dùng để báo cáo mục nào còn thiếu. */
export function labelledVoiceIds(): string[] {
  return Object.keys(VOICE_LABELS)
}
