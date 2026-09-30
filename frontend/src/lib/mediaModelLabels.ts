/**
 * Nhãn hiển thị cho mô tả mô hình media lấy từ backend.
 *
 * `/api/media-models` trả `description`, `pricing_hint`, `eta_hint` bằng tiếng Trung cho mọi
 * ngôn ngữ. `id` mô hình mới là giá trị backend đối chiếu khi gọi API nhà cung cấp, nên
 * **giữ nguyên**; chỉ phần mô tả hiển thị mới dịch.
 *
 * Chỉ những mô hình có mô tả tiếng Trung mới cần vào đây. Mô tả rỗng (ví dụ mô hình mới
 * chưa có mô tả) thì không dịch gì cả.
 */

import { localized, type LocalizedText } from './localeStrings'

type MediaModelText = {
  description?: LocalizedText
  pricingHint?: LocalizedText
  etaHint?: LocalizedText
}

const MEDIA_MODEL_LABELS: Record<string, MediaModelText> = {
  'seedream-5-0-pro': {
    description: {
      zh: '角色一致性好，适合漫剧定妆与分镜静帧',
      en: 'Strong character consistency. Suits drama look-dev and storyboard stills.',
      vi: 'Nhân vật giữ nguyên tốt. Hợp dựng nhân vật cho phim và khung hình storyboard.',
    },
    pricingHint: {
      zh: '清晰度越高越贵',
      en: 'Higher resolution costs more',
      vi: 'Độ phân giải càng cao càng tốn',
    },
    etaHint: {
      zh: '约 20–60 秒/张',
      en: 'About 20–60 s per image',
      vi: 'Khoảng 20–60 giây mỗi ảnh',
    },
  },
  'gpt-image-2': {
    description: {
      zh: '细节与文字表现好，适合海报与精细静帧',
      en: 'Renders detail and text well. Suits posters and fine-grained stills.',
      vi: 'Diễn đạt tốt chi tiết và chữ viết. Hợp poster và khung hình tinh tế.',
    },
    pricingHint: {
      zh: '清晰度越高越贵',
      en: 'Higher resolution costs more',
      vi: 'Độ phân giải càng cao càng tốn',
    },
    etaHint: {
      zh: '约 30–90 秒/张',
      en: 'About 30–90 s per image',
      vi: 'Khoảng 30–90 giây mỗi ảnh',
    },
  },
  'seedance-2-0': {
    description: {
      zh: '标准成片，运镜较稳；最高 720p',
      en: 'Standard quality, steadier camera moves. Up to 720p.',
      vi: 'Chất lượng tiêu chuẩn, chuyển động ống kính ổn định hơn. Tối đa 720p.',
    },
    pricingHint: {
      zh: '清晰度越高越贵',
      en: 'Higher resolution costs more',
      vi: 'Độ phân giải càng cao càng tốn',
    },
    etaHint: {
      zh: '约 2–5 分钟/镜',
      en: 'About 2–5 min per shot',
      vi: 'Khoảng 2–5 phút mỗi cảnh quay',
    },
  },
  'seedance-2-0-mini': {
    description: {
      zh: '更快更省，适合草稿与批量；最高 720p',
      en: 'Faster and cheaper. Suits drafts and batch runs. Up to 720p.',
      vi: 'Nhanh hơn và rẻ hơn. Hợp bản nháp và chạy hàng loạt. Tối đa 720p.',
    },
    pricingHint: {
      zh: '更省 · 清晰度越高越贵',
      en: 'Cheaper · higher resolution costs more',
      vi: 'Rẻ hơn · độ phân giải càng cao càng tốn',
    },
    etaHint: {
      zh: '约 1–3 分钟/镜',
      en: 'About 1–3 min per shot',
      vi: 'Khoảng 1–3 phút mỗi cảnh quay',
    },
  },
  'seedance-2-5': {
    description: {
      zh: '成片首选，画质更好；支持到 1080p',
      en: 'Best choice for final output, better image quality. Supports up to 1080p.',
      vi: 'Lựa chọn hàng đầu cho bản chính thức, chất lượng hình tốt hơn. Hỗ trợ tới 1080p.',
    },
    pricingHint: {
      zh: '相对更贵 · 清晰度越高越贵',
      en: 'Costs more · higher resolution costs more',
      vi: 'Tốn hơn · độ phân giải càng cao càng tốn',
    },
    etaHint: {
      zh: '约 3–8 分钟/镜',
      en: 'About 3–8 min per shot',
      vi: 'Khoảng 3–8 phút mỗi cảnh quay',
    },
  },
  'MiniMax-H3': {
    description: {
      zh: '节奏感强、人物生动；4–15 秒，仅 720p',
      en: 'Strong rhythm and lively characters. 4–15 s, 720p only.',
      vi: 'Nhịp mạnh, nhân vật sinh động. 4–15 giây, chỉ 720p.',
    },
    pricingHint: {
      zh: '出片偏慢',
      en: 'Slower to produce',
      vi: 'Ra hình chậm hơn',
    },
    etaHint: {
      zh: '偏慢，4s 约 15 分钟起',
      en: 'Slow: about 15 min for a 4 s clip',
      vi: 'Chậm: khoảng 15 phút cho đoạn 4 giây',
    },
  },
}

/**
 * Mô tả của một mô hình, theo ngôn ngữ đang dùng.
 *
 * Mô hình không có trong bảng thì trả về đúng `description` gốc từ backend. Đây là dữ liệu
 * admin nhập tay, nên bảng nhãn ở đây không thể bao phủ hết — giá trị gốc là dự phòng
 * chấp nhận được, cần báo cáo những mục đang rơi vào đường này.
 */
export function mediaModelDescription(
  model: { id: string; description?: string },
): string {
  const entry = MEDIA_MODEL_LABELS[model.id]
  if (entry?.description) return localized(entry.description)
  return model.description || ''
}

/** Gợi ý giá, theo ngôn ngữ đang dùng; không có thì trả chuỗi rỗng. */
export function mediaModelPricingHint(model: { id: string; pricing_hint?: string }): string {
  const entry = MEDIA_MODEL_LABELS[model.id]
  if (entry?.pricingHint) return localized(entry.pricingHint)
  return model.pricing_hint || ''
}

/** Gợi ý thời gian chờ, theo ngôn ngữ đang dùng; không có thì trả chuỗi rỗng. */
export function mediaModelEtaHint(model: { id: string; eta_hint?: string }): string {
  const entry = MEDIA_MODEL_LABELS[model.id]
  if (entry?.etaHint) return localized(entry.etaHint)
  return model.eta_hint || ''
}
