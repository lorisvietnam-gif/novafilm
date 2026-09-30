/**
 * Nhãn cho thông báo lỗi mà backend trả về bằng tiếng Trung.
 *
 * Backend ném `ValueError("请先生成分集剧本")` và FastAPI đưa nguyên văn chuỗi đó vào
 * `detail`, nên frontend in ra đúng tiếng Trung. Sửa ở backend thì nằm ngoài phạm vi
 * repo frontend và còn phải đổi cả ngôn ngữ `zh` cũ, nên ở đây giữ nguyên **giá trị** và
 * chỉ tra một nhãn hiển thị tương ứng.
 *
 * `localizeBackendMessage()` trả về **nguyên văn** khi không có trong bảng — thông báo lạ
 * phải hiện được chứ không được nuốt, nên thiếu mục là hành vi chấp nhận được.
 */

import { localized, type LocalizedText } from './localeStrings'

/** Khoá là đúng chuỗi backend trả về, khớp từng ký tự. */
const BACKEND_MESSAGES: Record<string, LocalizedText> = {
  请先生成剧本摘要: {
    zh: '请先生成剧本摘要',
    en: 'Generate the script summary first',
    vi: 'Hãy tạo tóm tắt kịch bản trước',
  },
  缺少剧本: {
    zh: '缺少剧本',
    en: 'The script is missing',
    vi: 'Thiếu kịch bản',
  },
  请先生成分集剧本: {
    zh: '请先生成分集剧本',
    en: 'Generate the episode script first',
    vi: 'Hãy tạo kịch bản tập trước',
  },
  集号无效: {
    zh: '集号无效',
    en: 'That episode number is not valid',
    vi: 'Số tập không hợp lệ',
  },
  分集写入后未能重新加载: {
    zh: '分集写入后未能重新加载',
    en: 'The episodes were written but could not be reloaded',
    vi: 'Đã ghi tập nhưng không tải lại được',
  },
  '未解析到可用文字模型。请在管理后台填写 TokenFree API Key，拉取并选择文本模型。': {
    zh: '未解析到可用文字模型。请在管理后台填写 TokenFree API Key，拉取并选择文本模型。',
    en: 'No usable text model is configured. Add a TokenFree API key in the admin console, then fetch and pick a text model.',
    vi: 'Chưa có mô hình văn bản nào dùng được. Hãy điền khoá API TokenFree trong trang quản trị, rồi tải về và chọn một mô hình văn bản.',
  },
}

/**
 * Thông báo backend đã qua bảng nhãn; chuỗi lạ thì trả về nguyên văn.
 *
 * Thông báo có số nhúng vào (`找不到第 3 集剧本`) không liệt kê từng giá trị — dịch mẫu
 * cố định sẽ sai số. Những thông báo đó vẫn hiện tiếng Trung, và được ghi lại trong báo
 * cáo thay vì dịch sai.
 */
export function localizeBackendMessage(message: string): string {
  const entry = BACKEND_MESSAGES[message.trim()]
  if (!entry) return message
  return localized(entry)
}
