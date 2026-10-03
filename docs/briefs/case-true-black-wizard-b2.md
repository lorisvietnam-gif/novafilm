# BRIEF — Đổi `/wizard` sang nền True Black (đo được, không đoán)

Đã có **đường chạy đo khách quan** — dùng nó làm tiêu chuẩn nghiệm thu, không phải mắt thường.

---

## 0. Trạng thái đo được TRƯỚC khi đổi

```
/wizard  41 chu · 0 khong dat AA
/         99 chu · 0 khong dat AA
/studio  /drama  /assets  /settings   12 chu moi trang · 0 khong dat AA
```

Nền kem **hiện đã đạt AA toàn bộ**. Việc đổi sang đen là quyết định **thương hiệu**, không phải sửa lỗi
tiếp cận. Nhưng nó **không được làm hỏng cái đang xanh**.

---

## 1. Công cụ đo — dùng nó, không phải mắt thường

```powershell
cd frontend
node scripts\wcag-contrast-check.mjs --base http://127.0.0.1:5173 --route "/wizard"
```

Script tự đi ngược cây DOM tìm **nền hiệu dụng** (xử lý alpha), đọc cỡ chữ để biết chữ lớn hay
không, và **thoát với mã ≠ 0** khi có chữ hụt AA.

**Nền đen có nhiều lớp mờ chồng nhau — đó là chỗ dễ đo sai nhất. Bộ đo đã xử lý sẵn; đừng
tự tính tay.**

## 2. Nguyên tắc bất di bất dịch

- **`--pf-accent-400: #f2c94c` đã đóng băng.** Không đổi tông. Đây là champagne đã chốt.
- Nền đen: dùng token sẵn có `--pf-surface-inverse: #1c1c1a` và `--pf-ink` — **đừng phát minh
  bảng màu mới**. Đổi `#fef6dc`/`#fffbf0` (champagne rất sáng) làm nền thẻ thì thẻ đó thành
  **vệt sáng** trên nền đen — mất đúng cái cảm giác "cinematic" mà anh muốn.
- Hướng đúng: **nền tối, champagne làm viền/điểm nhấn/ánh sáng**, chữ sáng. Đừng đảo ngược
  thành thẻ sáng trên nền tối.

## 3. Cấm tuyệt đối

- **Đừng đụng `tokens.css` dùng chung** — nó phục vụ 25 route. Chỉ sửa `wizard.css`.
- **Đừng đổi tên** `.wizard-actions`, `.pf-btn`, các input của 4 bước (hợp đồng audit).
- **Đừng hạ tiêu chuẩn AA** để cho dễ đạt. Đây là ranh giới của cả bài toán.
- Không dùng màu đủ tương phản để "cho xanh" mà **phá cấu trúc thị giác** của bảng thẻ.

## 4. Nghiệm thu — đo, không mô tả

```powershell
# (a) khả năng đọc: 0 vi phạm
node scripts\wcag-contrast-check.mjs --base http://127.0.0.1:5173 --route "/wizard,/"

# (b) hợp đồng DOM: đếm selector
#     wizard-actions truoc/sau, pf-btn truoc/sau

# (c) audit: AUDIT_ONLY=/wizard phải ra 8 buoc · 0 buoc van lan
node scripts\visual-audit.mjs        # với AUDIT_ONLY=/wizard

npm run build        # xanh
npm run lint         # 0 error · 40 warning
```

**Gửi kèm ảnh chụp màn hình `/wizard` ở nền mới** — không có ảnh thì không có bằng chứng.

## 5. Nếu có chữ trượt AA

**Tăng độ sáng của chữ** (hoặc hạ độ sáng nền) cho tới khi script báo 0. **Không** hạ ngưỡng,
không thêm ngoại lệ, không bỏ qua phần tử nào bằng cách làm nó "ẩn đi cho audit quên".

## 6. Bàn giao

Báo cáo ra **FILE** rồi **COMMIT** — tiến trình chết là mất sạch (đã xảy ra 9 lần).
**Commit từng phần nhỏ ngay khi xong**, đừng dồn tới cuối.
