# BRIEF — Đợt cuối: dọn 2 ký tự Trung + siết UI `/wizard`

Nền đo đã sạch và tái lập được: `vi 78 / en 76`, hai lần giống hệt, hàng đợi 0 task,
byte-0 = 0. **Đo trước khi kết luận.**

---

## Phần 1 — `bunny/4`: 2 ký tự Trung còn sót

Đo thật trên project mới (`locale=vi`), chỗ duy nhất còn:
```
Tuấn（vội vã，低沉）：Đặt tiếp tuần sau, vẫn món ấy.
                                ^^^^  <- nhãn cảm xúc trong ngoặc
```
Thân thoại đã là tiếng Việt; **chỉ nhãn cảm xúc trong dấu ngoặc** còn tiếng Trung.

Đây là **cấu trúc** `角色名（情绪）：台词` của Seedance — **không được đổi dấu ngoặc**, chỉ
cần yêu cầu phần trong ngoặc viết bằng ngôn ngữ đích.

Việc:
1. Bổ sung **một câu** vào chỉ thị locale trong `OutputLanguage.directive`
   (`ark.py`) — dùng lại bảng dùng chung, **cấm tạo bảng mới**.
2. Test: `locale=vi` ⇒ nhãn cảm xúc tiếng Việt; `locale=zh` ⇒ giữ nguyên hành vi cũ.

**Cấm:** đổi `（…）`, đổi `△`, `### 场`, `【…】`. Đó là hợp đồng máy↔máy.

---

## Phần 2 — `bunny/2`: `/wizard` đã có bảng chỉ đạo nghệ thuật, giờ làm nó xứng đáng

Bước 1–3 đã chạy và được kiểm thật. Phần còn lại:
1. Mỗi thẻ (subject / action / camera / lighting / style / duration) có **nút Copy riêng**
   — người làm phim thường chỉ cắm một đoạn, không cần cả bài.
2. Toast sau khi Copy: tiếng Việt, có `role="status"` + `aria-live` (điều kiện WCAG).
   Nội dung phải nói đúng chuyện: **kịch bản đã sẵn sàng để dán sang nền tảng render** —
   **đừng** hứa "đang tạo video", vì hiện chưa có video API nào chạy được.
3. Màn hình kết quả **không được** là một ô text phẳng.

### Cấm tuyệt đối
- **Đổi tên class/id** mà `visual-audit.mjs` bấm vào: `.wizard-actions`, `.pf-btn`, và các
  trường nhập của 4 bước. Đổi tên là audit mù ⇒ mất toàn bộ lớp kiểm thử.
- `npm run build` xanh **không** chứng minh trang chạy. Phải **mở app thật** và nhìn.

---

## Nghiệm thu chung (bắt buộc)

- `pytest` **không được vượt `4 failed, 1100 passed, 2 skipped`**.
- Frontend: `npm run build` xanh · `npm run lint` **0 error / 40 warning**.
- Nếu đụng `styles/**`: **đếm selector `.pf-` trước/sau**, không được mất selector nào.
- **Chạy thật rồi bằng chứng thật** — không dựa vào unit test. Đợt trước có 112 test
  xanh mà sản phẩm vẫn hỏng.
- Báo cáo ra **FILE** rồi **COMMIT** (`AGENTS.md` mục 11). Tiến trình chết là mất sạch —
  đã xảy ra 7 lần.
- **Đồng bộ `main` trước khi bắt đầu.**

## Lưu ý hạ tầng

Có **3 tiến trình `uvicorn`** (một giữ cổng 8000, hai chết vì tranh cổng) do `kilo.exe`
tự sinh. Chúng **không** gây hỏng dữ liệu — hàng đợi đang rỗng. Nhưng **đừng chạy kiểm thử
song song với audit**, và nếu gặp `Da co audit khac dang chay` thì đó là khoá chống
chạy song song, hãy chờ chứ đừng xoá khoá.