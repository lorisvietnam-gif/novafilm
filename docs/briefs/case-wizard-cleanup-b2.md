# BRIEF — Dọn 3 tì vết còn sót trên `/wizard`

Mục 3 (lint) **đã xong trên `main`** (`58c6a7f`): cảnh báo thứ 41 là `parseColor` không
dùng trong `wcag-contrast-check.mjs` của board. Baseline đã về **40**. Đừng đụng vào nữa.

Còn lại **mục 1 và 2**. **Commit ngay sau từng mục** — đừng gộp.

---

## 1. Sửa logic chia thẻ — `buildArtDirectionBoard`

**Hiện trạng quan sát được trên ảnh:** cùng một mệnh đề *"Một cô gái trẻ mặc áo khoác da chạy
băng qua phố mưa lúc đêm…"* nằm ở **Chủ thể, Hành động, Bối cảnh**, rồi lặp lần nữa ở khung
hình. Bấm "Sao chép" ở ô nào cũng ra cùng một câu ⇒ bảng thẻ mất hết giá trị.

Cần:
1. Đọc **đúng cấu trúc** mà LLM trả về — đừng suy đoán bằng cách quét từ khoá.
   Xem `episode_batch_content_system` trong `ark.py`: các trường `title / text / camera / bgm /
   segments` là **đã tách sẵn ở phía sinh kịch bản**. Dùng chúng.
2. Mỗi ô lấy **nội dung riêng**. Ô nào không có dữ liệu thì **để trống và nói rõ là trống** —
   tuyệt đối **không** dán nội dung của ô khác vào để trông đầy.
3. Ô "Chủ thể" lấy từ nhân vật/đề tài; "Hành động" lấy `text`; "Bối cảnh" lấy `scene`;
   "Máy quay" lấy `camera`; "Ánh sáng"/`"Phong cách"`/`"Thời lượng"` theo dữ liệu có thật.

**Nguyên tắc:** thừa trống còn hơn bịa. Bảng mà ô trống thì người dùng biết; bảng đầy nhưng
trùng nhau thì người dùng mất niềm tin vào toàn bộ hệ thống.

---

## 2. Xoá 2 phần tử giả

Vòng tròn **"A"** (avatar) và badge **"0"** cạnh "Trợ giúp" — không có chức năng gì.

- Xoá khỏi **cây React**, không dùng `display:none` hay `opacity:0`.
- Nếu chúng thuộc layout dùng chung thì **báo board**, đừng tự sửa file chung.

---

## Chốt chặn bất di bất dịch

- **Không** đụng `tokens.css` — dùng chung 25 route.
- **Không** đổi tên `.wizard-actions`, `.pf-btn`.
- **Không** hạ ngưỡng AA để cho dễ đạt.
- Mỗi lần sửa CSS phải chạy lại đo, không ước lượng:
  ```
  node scripts\wcag-contrast-check.mjs --base http://127.0.0.1:5173 --route "/wizard"
  node scripts\visual-audit.mjs          # với AUDIT_ONLY=/wizard → phải 8 bước
  npm run build ; npm run lint           # 0 error · 40 warning
  ```
- Báo cáo ra **FILE** + **COMMIT** từng mục.

## Bằng chứng bắt buộc

Ảnh chụp `/wizard` sau khi chia thẻ lại, và **0 vi phạm AA** từ script. Không có ảnh thì không
có bằng chứng.