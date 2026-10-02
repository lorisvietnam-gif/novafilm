# BRIEF — Dọn nợ cuối: làm prompt kịch bản nhận biết locale

Hai lane, hai phần. **Không xoá dòng ép ngôn ngữ** — chỉ nội suy theo locale.

## Vì sao không được xoá thẳng

`ark.py:702` / `:729` đang ép `所有字段必须使用简体中文`. Dòng đó **giữ cấu trúc đầu ra**
(title/text/img_prompt/video_prompt/camera/bgm/segments). Xoá hẳn thì LLM có thể trả về
thứ gì đó không parse được. Đổi **ngôn ngữ trong câu chỉ thị**, giữ nguyên phần yêu cầu
cấu trúc.

---

## Phần 1 — `bunny/4` (backend): prompt nhận biết locale

Đã có sẵn logic: `ark.py:2468` có dict ánh xạ locale → chỉ thị tiếng Việt. Tái dùng nó,
đừng viết bản thứ hai.

1. Thêm tham số `locale` (mặc định lấy từ settings, rồi tới `"vi"`) vào hai chỗ dựng
   `system` ở dòng ~702 và ~729.
2. Thay câu cứng bằng câu **theo locale**. Với `vi` câu chỉ phải yêu cầu tiếng Việt
   **nhưng vẫn phải giữ nguyên danh sách trường và kiểu JSON** — giống cách câu Trung
   hiện đang làm.
3. `generate_prompt` của wizard **không đụng** — nó đã sạch, đã đo 0 ký tự Trung.

### Ràng buộc bất di bất dịch — Nhóm D

Marker Seedance là **hợp đồng máy↔máy**, không thuộc phạm vi sửa này:
`【字幕：…】`, `【旁白·…】`, `【BGM：…】`, `@duration:N`, `△`, `空镜`.
Chúng do `seedance_segments.py` chèn **riêng**, có parser hai đầu
(`segmentDuration.ts` + `seedance_segments.py:48-50`).

**Nếu dịch marker này, dự án sẽ hết lồng tiếng** (`pipeline.py:318` ném
`全部镜头旁白为空，无法配音`) và Seedance sẽ **đọc to mô tả hình ảnh thành lời thoại**.
Cấm đụng. Chỉ sửa **nội dung kịch bản**.

### Test bắt buộc
- `locale="vi"` ⇒ LLM trả `title`/`text`/`img_prompt` bằng tiếng Việt.
- Cấu trúc JSON **không đổi**: đủ trường, kiểu đúng.
- `locale` thiếu ⇒ không ném lỗi, rơi về mặc định.
- `pytest` **không được vượt `4 failed, 1023 passed, 1 skipped`**.

---

## Phần 2 — `bunny/2` (frontend): gửi locale xuống

Không có gì gửi thì Phần 1 không bao giờ chạy.

1. Các lời gọi tạo kịch bản từ `/studio` và `/drama` phải gửi **ngôn ngữ đang hiện trên
   giao diện** (`vi` / `en` / `zh`).
2. Đi theo cơ chế sẵn có — **đừng** bịa thêm biến mới nếu đã có `locale` trong schema
   (`schemas.py:285` đã khai `locale`). Kiểm tra `api.ts` xem các hàm đó có gửi chưa.
3. Không hard-code `lang`. Lấy từ state i18n đang chạy.

### Test bắt buộc
- Bấm nút tạo kịch bản ở `vi` ⇒ payload **có** `locale: "vi"` (kiểm chứng được bằng script,
  không tin lời).
- Đổi sang `en` ⇒ payload đổi theo.
- `npm run build` xanh · `npm run lint` **0 error / 40 warning**.

---

## Cả hai

- Báo cáo ra FILE rồi **COMMIT** trước khi kết thúc (`AGENTS.md` mục 11).
- **Đồng bộ `main` trước khi bắt đầu** — main vừa có thêm hai merge.
- Nếu kiểm thử cần nâng version cơ sở dữ liệu địa phương, **dừng lại báo**, không tự migrate.

## Về con số audit

Project 16 **không xoá** trong task này. Sau khi vá, sinh một dự án mới ở `vi` và đo lại:
đó mới là con số **tái lập được** — không tái lập được thì xoá data chỉ là quét rác.