/** Liên kết cố định ra ngoài site (kho mã nguồn mở, v.v.) */

/**
 * Kho mã nguồn. KHÔNG đưa link này vào navbar/footer — nó chỉ còn là "diễn đàn
 * mở" trong nội dung trang (ContactPage, LegalDocPage, HomePage, PricingPage).
 */
export const GITHUB_REPO_URL = 'https://github.com/lorisvietnam-gif/novafilm'

/**
 * Link mời vào cộng đồng Discord, lấy từ biến môi trường `VITE_DISCORD_INVITE_URL`.
 *
 * Rỗng khi biến chưa được đặt — nghĩa là chưa có server Discord. `DiscordFab`
 * coi đây là tín hiệu "chưa cấu hình" và ẩn hẳn nút, thay vì render ra một nút
 * chết không đi đâu. Đây là hợp đồng, không phải tối ưu: đổi giá trị rỗng thành
 * link thật là nút tự hiện, không cần sửa code.
 *
 * Đây là ĐIỂM CẤU HÌNH DUY NHẤT cho link Discord — không điền cứng URL vào
 * component, cũng không đoán link nào khi thiếu cấu hình.
 */
export const DISCORD_INVITE_URL = (import.meta.env.VITE_DISCORD_INVITE_URL ?? '').trim()

/**
 * Origin của site, lấy từ biến môi trường `VITE_SITE_URL`.
 *
 * Đây là ĐIỂM CẤU HÌNH DUY NHẤT cho domain: chuyển staging → production chỉ cần
 * sửa biến môi trường, không phải sửa code. Vì vậy KHÔNG điền cứng tên miền vào
 * source — domain staging chưa phân giải được trong DNS, còn domain production
 * sẽ mua sau nên chưa tồn tại.
 *
 * Chuẩn hoá: bỏ khoảng trắng hai đầu và dấu `/` cuối, để ghép nối luôn ra
 * `https://…/duong-dan` chứ không phải `https://…//duong-dan`.
 *
 * Rỗng khi biến chưa được đặt — nghĩa là chưa có origin công khai nào để dùng.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '')
