/**
 * Ảnh bìa thay thế khi thẻ không có ảnh thật — dùng lại kho ảnh đã có sẵn trong repo.
 *
 * Vì sao cần: `preview_cover` của template và `cover_url` của dự án Drama đều do
 * backend trả về. Khi tài nguyên đó không dùng được, thẻ hiện ra một khung trắng hoặc
 * xám — ở `/templates` là hai thẻ kể trong `TEMPLATE_COVER_ART`, ở `/drama` là mọi
 * dự án chưa sinh bìa. Kho `frontend/public/image-styles/` và `frontend/public/img/`
 * đã có sẵn 21 phong cách nên ta dùng lại, không tải ảnh về và không vẽ lại ảnh mới.
 *
 * Module này chỉ chọn **phong cách nào** đứng ra trước; phần dựng `<img>` và chuỗi lùi
 * jpg → png → static → svg thuộc về `DramaImageStylePreviewImg`.
 *
 * Khi backend đã thay lại file gốc, chỉ cần xoá id khỏi `TEMPLATE_COVER_ART`; phần còn
 * lại của module không phải đổi gì.
 */

import type { ImageStyleId } from './dramaImageStyles'
import { IMAGE_STYLE_IDS } from './dramaImageStyles'

/**
 * Template có bìa giao hàng nhưng nhìn ra khung trắng/xám ở cỡ thẻ.
 *
 * Cả `backend/static/templates/covers/opensource_showcase.png` và
 * `…/opensource_live_work.png` là **cùng một ảnh** (137890 byte, đo được từ server) và
 * gần như trắng toàn bộ, nên hai thẻ này đứng cạnh nhau như hai ô trống. File nằm trong
 * `backend/**` — ngoài phạm vi sửa ở frontend — nên trước mắt chọn ảnh phong cách có
 * sẵn thay cho tới khi backend thay lại file.
 */
const TEMPLATE_COVER_ART: Record<string, ImageStyleId> = {
  // 「开源项目展示」— dự án mã nguồn mở: cần một khung hình có người và máy, nền đời thường.
  opensource_showcase: 'chinese-urban-realistic',
  // 「人工工作场景」— người thật làm việc: cần một cảnh trong nhà, tự nhiên.
  opensource_live_work: 'japanese-daily-natural',
}

/**
 * Phong cách đứng thay cho bìa của một template, hoặc `null` nghĩa là bìa gốc dùng
 * được và không cần thay.
 */
export function templateCoverArtStyleId(templateId: string | null | undefined): ImageStyleId | null {
  if (!templateId) return null
  return TEMPLATE_COVER_ART[templateId] ?? null
}

/**
 * Phong cách đứng trước bìa của một dự án Drama chưa có `cover_url`.
 *
 * Chọn theo `id` để ổn định: cùng một dự án luôn nhận cùng một ảnh giữa các lần tải
 * trang, và `id` tăng đều nên hai dự án liên tiếp không bị trùng ảnh khi kho còn dư
 * băng thang. Danh sách API không kèm `image_style_id` (xem `DramaProjectListItem`),
 * nên không có cách nào khác mà không phải đổi backend.
 */
export function dramaProjectCoverArtStyleId(projectId: number | null | undefined): ImageStyleId {
  const id = Number.isFinite(projectId) ? Math.abs(Math.trunc(projectId as number)) : 0
  return IMAGE_STYLE_IDS[id % IMAGE_STYLE_IDS.length]
}
