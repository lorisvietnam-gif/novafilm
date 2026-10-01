/**
 * Nhãn hiển thị cho **tên dự án** lấy từ database.
 *
 * Khác với `templateLabels.ts` (dữ liệu seed, admin sửa được) và `dramaScriptLabels.ts`
 * (marker do mô hình sinh), ở đây các chuỗi là **tên mặc định backend tự đặt** khi
 * người dùng không gõ tên:
 *
 * - `backend/app/api/projects.py`   → `未命名作品` cho dự án kepu (studio).
 * - `backend/app/api/drama/projects.py` → `自由画布项目` cho luồng canvas, `未命名漫剧`
 *   cho luồng kịch bản.
 *
 * Backend nằm ngoài phạm vi sửa của frontend, và sửa nó cũng **không phải** cách sửa:
 * những bản ghi đó đã nằm trong database, đổi mã nguồn không đổi dữ liệu cũ. Ngoài ra
 * `自由画布项目` còn là dữ liệu người dùng nhìn thấy và có thể sửa tay — nên giá trị gốc
 * phải giữ nguyên, chỉ dịch phần hiển thị. Đây cũng là lý do không được dịch tên dự án
 * một cách tổng quát: chỉ những tên **do hệ thống đặt** mới có nhãn.
 *
 * Cùng cơ chế với `templateLabels.ts`:
 * - Thiếu **ngôn ngữ** là lỗi kiểu, vì mọi thành viên của `LocalizedText` đều bắt buộc.
 *   Không ngôn ngữ nào lặng lẽ rơi về tiếng Trung.
 * - Thiếu **mục** thì trả về nguyên văn, tức là tên người dùng tự gõ vẫn hiện đúng.
 *
 * Bảng là `Record` thuần của `LocalizedText`, chỉ đọc qua hai hàm dưới. Cố ý KHÔNG
 * dùng getter và KHÔNG spread các mục này ở cấp module: spread gọi thẳng getter lúc
 * khởi tạo module, đúng loại lỗi đã ghi ở `AGENTS.md` §7.
 */

import { localized, type LocalizedText } from './localeStrings'

/**
 * Khoá là **đúng chuỗi backend đã lưu**, không phải tên hiển thị — nên nó phải khớp
 * verbatim với `projects.py` và `drama/projects.py`.
 *
 * Bản `zh` giữ nguyên: người dùng locale `zh` phải thấy đúng dữ liệu trong database.
 */
const DEFAULT_PROJECT_TITLES: Record<string, LocalizedText> = {
  /* `api/projects.py` — dự án kepu, cũng là `models.Project.title` default. */
  未命名作品: { zh: '未命名作品', en: 'Untitled work', vi: 'Chưa có tên' },
  /* `api/drama/projects.py` — dự án drama luồng canvas. */
  自由画布项目: { zh: '自由画布项目', en: 'Free canvas project', vi: 'Dự án bảng vẽ tự do' },
  /* `api/drama/projects.py` — dự án drama luồng kịch bản. */
  未命名漫剧: { zh: '未命名漫剧', en: 'Untitled drama', vi: 'Dự án drama chưa có tên' },
}

/** Ids/titles that have a translated display label. Used by tests and audits. */
export const TRANSLATED_DEFAULT_TITLES: string[] = Object.keys(DEFAULT_PROJECT_TITLES)

/**
 * Tên dự án drama theo ngôn ngữ đang dùng.
 *
 * Chỉ dùng để **hiển thị**. Mọi chỗ so khớp dữ liệu — tìm kiếm, `dramaWorkflow.ts` dò
 * marker `自由画布`, so sánh trước/sau khi đổi tên — vẫn phải dùng `title` gốc, nếu không
 * thì dự án cũ không còn nhận diện được là dự án canvas.
 */
export function dramaProjectTitle(raw?: string | null): string {
  const value = (raw || '').trim()
  if (!value) return ''
  const entry = DEFAULT_PROJECT_TITLES[value]
  return entry ? localized(entry) : value
}

/** Tên dự án kepu (studio) theo ngôn ngữ đang dùng. Chỉ dùng để hiển thị. */
export function studioProjectTitle(raw?: string | null): string {
  const value = (raw || '').trim()
  if (!value) return ''
  const entry = DEFAULT_PROJECT_TITLES[value]
  return entry ? localized(entry) : value
}
