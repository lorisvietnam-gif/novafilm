# BRIEF — bunny/2 — Lỗi chồng chữ ở trang Canvas

## 1. Lỗi đã nhìn thấy, không phải nghi ngờ

`/drama/projects/16/canvas` — header chồng chữ ở **cả `vi` và `en`, giống hệt nhau**,
nên là lỗi CSS, **không** phải lỗi dịch.

Ảnh: `frontend/.kilo/audit/vi/drama-canvas.png` và `en/drama-canvas.png`
(dựng bởi `node scripts\visual-audit.mjs`, chạy ở 1440).

Hiện tượng:
- "Sắp xếp thư viện tài nguyên" nằm đè lên tab "Ảnh cụ".
- Panel phải bị cắt: chỉ thấy "Chọn ng…" cắt cụt ở mép phải.

## 2. Nguyên tắm dừng (không phá)

- Đếm **selector `.pf-` trước và sau** trong mọi file CSS bạn đụng. **Không được mất selector nào.**
- Bốn ràng buộc cứng: build xanh · lint **không tăng** error (baseline **0 error / 40 warning**) ·
  không mất selector · WCAG AA có số đo thật.
- Không đổi tông vàng `#f2c94c`.
- Chỉ sửa file CSS **của riêng bạn**. Cần rule ở `styles/**` (của B2) thì báo board.

## 3. Hướng sửa (tự quyết trong khuôn khung)

Bệnh kinh điển của flex/grid khi chữ dài. Kiểm tra theo thứ tự:
- container: `flex-wrap`, `min-width: 0` (rất hay quên — con mềm không co được, đẩy
  hàng ra ngoài thay vì xuống dòng),
- phần tử chữ: `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`,
  `white-space: nowrap` khi cần,
- panel phải: `flex-shrink` / `width` để không bị cắt.

Tiếng Việt dài hơn tiếng Trung, nên chữ tiếng Việt là điều kiện lộ ra lỗi — sửa cho đúng
tiếng Việt, đừng cắt bớt nội dung.

## 4. Bắt buộc khi báo xong

1. `npm run build` xanh; `npm run lint` = 0 error / 40 warning.
2. **Đếm selector `.pf-` trước/sau**, ghi rõ số vào báo cáo.
3. **Mở `http://127.0.0.1:5173/drama/projects/16/canvas` nhìn bằng mắt**, cả `vi` lẫn `en`.
   `npm run build` xanh **không** chứng minh layout đúng — đã có tiền lệ.
4. Chạy lại `node scripts\visual-audit.mjs`, mở `drama-canvas.png` xác nhận.
5. Viết báo cáo ra **file**, rồi **commit** trước khi kết thúc. Số ký tự Trung phải
   giữ nguyên: `vi 135`, `en 133` (đo 2 lần giống hệt — chuẩn công bố là 2 lần giống nhau).