# BRIEF — Hoàn thiện Bảng điều phối Prompt `/wizard` (B2)

Hạ tầng **đã có**, không viết lại:
- `artDirection.ts`: `BOARD_FIELDS`, `buildArtDirectionBoard()` — đã tách prompt thành thẻ
- `WizardPage.tsx`: `copied` / `toast` / `copyFailed` / `copyTimer`, `IconCopy`

Việc còn lại là **phần hiển thị**. Không sửa lại logic đã xanh.

---

## 1. Mỗi thẻ một nút Copy

`BOARD_FIELDS` đã có sẵn danh sách. Mỗi thẻ phải có **nút Copy riêng** — người làm phim
thường chỉ cắm một đoạn (chỉ camera, hoặc chỉ thoại), không cần cả bài.

Nhớ dùng `BOARD_FIELDS` (một nguồn duy nhất). **Cấm** liệt kê lại danh sách trường ở
chỗ khác.

## 2. Nút Copy tất cả

Nổi bật, đặt ở vị trí trung tâm phía trên bảng thẻ.

## 3. Toast — đúng nội dung này

> **"Đã chép Prompt cấu hình, sẵn sàng render!"**

- Bắt buộc `role="status"` + `aria-live="polite"` — đây là điều kiện WCAG, không phải tuỳ chọn.
- **Không** được hứa hệ thống đang tạo video. Hiện **không có API video nào chạy được**
  (Veo 429, TokenFree không khoá). Người dùng dán prompt sang Veo/Muse/Kling bằng tay.
- Giữ nguyên cơ chế `copyTimer` / `copyFailed` sẵn có.

## 4. Marker Seedance phải hiện nguyên vẹn trong thẻ Copy

`### 场1-1`, `△`, `【…】`, `@duration:N` — người dùng dán sang nền tảng khác và cần **đúng
khuôn đó**. Đừng dịch, đừng lọc.

## 5. Mở app thật và nhìn

`npm run build` xanh **không** chứng minh trang chạy — đã có tiền lệ: build xanh mà
trang trắng vì `const` đọc trước khi khai báo.

Phải **mở `http://127.0.0.1:5173/wizard`** bằng Edge, đi qua đủ 4 bước, **nhìn** bảng thẻ
hiện ra đúng, bấm thử Copy. **Chụp màn hình** đính kèm báo cáo.

## 6. Cấm đổi tên selector audit

`visual-audit.mjs` bấm vào `.wizard-actions .pf-btn` và điền các ô của 4 bước.
**Đổi tên = audit mù = mất cả lớp kiểm thử.** Được phép làm đẹp, không được đổi cấu trúc.

## Nghiệm thu

- `npm run build` xanh · `npm run lint` **0 error / 40 warning**
- Đụng `styles/**` thì đếm selector `.pf-` trước/sau, **không mất cái nào**
- `AUDIT_ONLY=/wizard` ⇒ **8 bước · 0 bước còn lại**
- Báo cáo ra **FILE** + **COMMIT** — tiến trình chết là mất sạch (đã xảy ra 9 lần)
- **Commit sớm**: làm xong phần nhỏ thì commit ngay, đừng để dồn tới cuối

## Ghi chú hạ tầng

- Có **3 tiến trình `uvicorn`**, chỉ một giữ được cổng 8000; hai còn lại chết ngay vì
  tranh cổng và **không** xử lý task. Không phải lý do để bỏ kiểm thử.
- Nếu gặp `Da co audit khac dang chay` thì đó là **khoá chống chạy song song** — hãy chờ,
  đừng xoá khoá.
- `.env` của lane trỏ cổng `15432` (không chạy). Chạy test/kiểm thử thì ép sang `5432`.