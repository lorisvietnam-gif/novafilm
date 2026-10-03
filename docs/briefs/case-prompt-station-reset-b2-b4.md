# BRIEF — Đợt reset: ưu tiên tuyệt đối luồng Tạo Prompt Điện ảnh

Hai lane, hai phần tách bạch. **Không `git reset --hard`** — hai bản vá i18n đã merge và đã
chứng minh bằng sinh thật (project 79: tổng ký tự Hán = 0).

---

## Phần 1 — `bunny/4` (backend)

### 1a. Dọn 2 ký tự Trung trong nhãn cảm xúc — **đã làm, hãy giữ**

`96b4d89` đã thêm vào `_OUTPUT_LANGUAGE_DIRECTIVES["vi"/"en"]`:
- nhãn cảm xúc trong ngoặc phải theo locale (giữ nguyên `（）` và `vo/os`)
- **"tuyệt đối không chèn ký tự Hán"**
- `9ba14b0` tách `img_prompt`/`video_prompt` **giữ tiếng Trung** cho Seedance.

Đo thật sau khi vá: project 79 `locale=vi` → **mọi trường 0 ký tự Hán**.

**Việc của anh:** chạy `scripts/verify_emotion_tag_locale.py` (đã có trong nhánh anh) để
**chứng minh lại bằng sinh thật**, rồi commit. **Đừng sửa lại directive** — đã đúng.

### 1b. Cờ bật/tắt billing cho localhost — **thay vì xóa logic**

Yêu cầu: ở môi trường dev, luồng phải chạy xuyên suốt không vướng số dư.

Cách làm đúng: thêm **cờ cấu hình** (ví dụ `billing_enabled`), mặc định `true`, và cho
`.env` của máy dev đặt `false`.

Cấm:
- Xoá `freeze_for_task` / `settle_task` / `charge_fen_for_usage`.
- Sửa `settlement.py:289-299` — nhánh đó **có chủ đích**.
- Hard-code `charged = True` trong code. Đó là **ghi sổ sai vào sổ cái**, và chính tôi đã
  phải sửa một lỗi gần như y hệt.

Lý do phải giữ logic: nó **đã chứng minh** — task 891 `charged=10 refunded=0`,
task 890 `charged=40 refunded=8`. Xoá đi thì mất lớp bảo vệ duy nhất còn lại.

---

## Phần 2 — `bunny/2` (frontend): Workspace `/wizard`

Thành phẩm là **Bảng điều phối Prompt**, không phải video. Bỏ qua Veo 429.

1. Màn hình kết quả băm nhỏ thành thẻ: **Thoại · Camera · Chuyển động · Ánh sáng · Phong
cách · Thời lượng**. Mỗi thẻ **một nút Copy**.
2. Nút **Copy tất cả** nổi bật.
3. Toast: **"Đã chép Prompt cấu hình, sẵn sàng render!"**
   - Có `role="status"` + `aria-live` (WCAG).
   - **Không** hứa hệ thống đang render video. Không có API video nào chạy được.
4. Marker Seedance (`### 场`, `△`, `【…】`) **giữ nguyên** trong thẻ Copy — người dùng
dán sang Veo/Muse/Kling, họ cần đúng khuôn đó.

### Cấm tuyệt đối
- **Đổi tên** `.wizard-actions`, `.pf-btn`, các input của 4 bước — audit bấm vào đúng
các tên đó. Đổi là audit mù.
- `npm run build` xanh **không** chứng minh trang chạy. **Mở app thật và nhìn.**

---

## Nghiệm thu chung

- `pytest` **không được vượt `4 failed, 1100 passed, 2 skipped`**.
- Build xanh · lint **0 error / 40 warning**.
- Đụng `styles/**` thì đếm selector `.pf-` trước/sau, không mất cái nào.
- **Chạy thật, đo thật.** Đợt trước có 112 test xanh mà sản phẩm vẫn hỏng.
- Báo cáo ra **FILE** rồi **COMMIT** — tiến trình chết là mất sạch (đã xảy ra 9 lần).
- **Đồng bộ `main` trước khi bắt đầu.**