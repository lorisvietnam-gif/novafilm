/**
 * Nhãn hiển thị cho danh mục mô hình media lấy từ backend.
 *
 * `/api/media-models` trả `description`, `pricing_hint`, `eta_hint` bằng tiếng Trung cho mọi
 * ngôn ngữ, vì API không có tham số locale. `id` mô hình là giá trị backend đối chiếu khi
 * gọi API nhà cung cấp, nên **giữ nguyên**; chỉ phần mô tả hiển thị mới dịch. Cùng cơ chế
 * với `templateLabels.ts` (nhãn giọng đọc nằm ở `voiceLabels.ts`).
 *
 * Chỉ những mô hình có mô tả tiếng Trung mới cần vào đây. Mô tả rỗng (ví dụ mô hình mới
 * chưa có mô tả) thì không dịch gì cả, và giá trị gốc từ backend được dùng làm dự phòng.
 *
 * Bảng là `Record` thuần và chỉ được đọc qua các hàm bên dưới — không getter, không spread.
 * Spread sẽ gọi getter lúc khởi tạo module, đúng loại lỗi đã ghi ở `AGENTS.md` §7.
 */

import { localized, type LocalizedText } from './localeStrings'

type ModelText = {
  description: LocalizedText
  pricing_hint: LocalizedText
  eta_hint: LocalizedText
}

/**
 * Khoá hạ ạt chữ thường: backend gửi `MiniMax-H3` (hoa chữ cái lẫn lộn), nên tra cứu
 * cũng hạ chữ thường. Cách này đúng với mọi biến thể viết hoa mà backend dùng.
 */
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
  'hy-image-v3.5-free': {
    description: {
      zh: 'Kira 渠道的免费档生图，先导接入用',
      en: 'Free-tier image generation via Kira, used for the pilot rollout',
      vi: 'Sinh ảnh gói miễn phí qua Kira, dùng cho đợt thử nghiệm đầu',
    },
    pricing_hint: {
      zh: '固定价，不随清晰度变化',
      en: 'Flat price, does not vary with resolution',
      vi: 'Giá cố định, không thay đổi theo độ phân giải',
    },
    eta_hint: {
      zh: '约 20–60 秒/张',
      en: 'About 20–60 s per image',
      vi: 'Khoảng 20–60 giây mỗi ảnh',
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

/**
 * Mô tả của một mô hình, theo ngôn ngữ đang dùng.
 *
 * Mô hình không có trong bảng thì trả về đúng `description` gốc từ backend. Đây là dữ
 * liệu admin nhập tay, nên bảng nhãn ở đây không thể bao phủ hết — giá trị gốc là dự
 * phòng chấp nhận được, mục nào rơi vào đường này được liệt kê trong báo cáo.
 */
export function mediaModelDescription(id: string | undefined | null, fallback = ''): string {
  const entry = MODEL_LABELS[modelKey(id)]
  return entry ? localized(entry.description) : fallback
}

/** Gợi ý giá, theo ngôn ngữ đang dùng; không có thì trả `fallback`. */
export function mediaModelPricingHint(id: string | undefined | null, fallback = ''): string {
  const entry = MODEL_LABELS[modelKey(id)]
  if (!entry) return fallback
  return localized(entry.pricing_hint) || fallback
}

/** Gợi ý thời gian chờ, theo ngôn ngữ đang dùng; không có thì trả `fallback`. */
export function mediaModelEtaHint(id: string | undefined | null, fallback = ''): string {
  const entry = MODEL_LABELS[modelKey(id)]
  if (!entry) return fallback
  return localized(entry.eta_hint) || fallback
}
