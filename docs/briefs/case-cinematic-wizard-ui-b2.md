# BRIEF — Đại phẫu `/wizard`: Art Direction Board + Champagne Gold

**Giao cho MỘT lane.** Chia CSS cho hai lane là cách chắc chắn nhất để tạo conflict ở
`styles/**`, mà `AGENTS.md` cấm tự hòa.

## 0. Ràng buộc cứng — vi phạm là hỏng việc, không phải mất đẹp

1. **DOM là hợp đồng với audit.** `visual-audit.mjs` bấm vào `.wizard-actions .pf-btn`,
   điền vào ô ý tưởng, và bấm tiếp 4 bước. **Tên class/id/input không được đổi, không
   được bỏ, không được đặt sau điều kiện render khiến script không thấy.** Được đẹp
   bao nhiêu cũng được — phá DOM thì audit mù và cả đợt 26 route dừng.
   Sau mỗi đợt sửa: `AUDIT_ONLY=/wizard` phải ra **8 bước · 8 ký tự · 0 bước còn lại**.
2. **Tương phản phải ĐO, không giả định.** Đã có tiền lệ: `#64748b` tưởng đẹp mà đo ra
   **4,20:1** (hụt AA), đổi `#475569` ra **6,68:1** mới đạt. Glassmorphism làm **tăng**
   tương phản khó hơn nếu chữ nằm trên lớp trong mờ — nền đổi màu là chữ đổi tương phản.
   Mỗi cặp màu mới phải có **số đo** trong báo cáo.
3. **Màu champagne `#f2c94c` đã đóng băng** — không đổi tông. Được làm giàu hệ màu quanh nó.
4. Font `Noto Serif`: **kiểm tra có sẵn cục bộ không** trước. Nếu phải tải từ CDN thì
   phải có phương án fallback, và **đo lại** xem có phát sinh bố cục nhảy (CLS) không.
5. Không đụng `/studio`, `/drama`, `/canvas`. Đừng tạo re-render vô hạn: audit đã từng
   treo vì trình duyệt bị ngốn. Mọi timer/listener phải được `cleanup`.

## 1. Bố cục `/wizard` (4 bước, giữ nguyên DOM)

Bước 1 ảnh tham chiếu · Bước 2 ý tưởng · Bước 3 đích đến + giọng · Bước 4 kết quả.

Kết quả ở bước 4 **không được là một ô text**. Dựng thành **bảng chỉ đạo nghệ thuật**:
mỗi trường (`subject`, `action`, `setting`, `camera`, `lighting`, `style`, `duration`)
một thẻ riêng, có nhãn rõ, và **mỗi thẻ có nút Copy riêng** — người dùng thường chỉ
cần cắm một đoạn, không cần cả bài.

## 2. Nút Copy và thông báo

- Nút Copy nổi bật, đặt giữa khối kết quả.
- Sau khi bấm: toast tiếng Việt, ngắn, **có `role="status"` + `aria-live`** để trình đọc
  màn hình đọc được — đây là điều kiện WCAG, không phải lựa chọn.
- Văn bản toast phải nói đúng chuyện: kịch bản đã sẵn sàng để dán sang nền tảng
  render bên ngoài. **Đừng** hứa cứ gì thêm (như "đang tạo video") — hiện tại hệ thống
  **không** gọi được video API nào.

## 3. Báo cáo bắt buộc

- Bảng **tương phản có số đo**: màu chữ / màu nền / tỉ lệ đạt-không đạt AA.
- Ảnh chụp `vi` **và** `en` của cả 4 bước.
- Kết quả `AUDIT_ONLY=/wizard`.
- `npm run build` xanh · `npm run lint` **0 error / 40 warning**.
- Đếm selector `.pf-` trước/sau nếu đụng `styles/**` — **không mất selector nào**.
- Viết báo cáo ra FILE rồi **COMMIT** (`AGENTS.md` mục 11).
- **Đồng bộ `main` trước khi bắt đầu.**
