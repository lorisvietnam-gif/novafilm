/** Liên kết cố định ra ngoài site (kho mã nguồn mở, v.v.) */

export const GITHUB_REPO_URL = 'https://github.com/lorisvietnam-gif/novafilm'

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
