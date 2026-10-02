# BRIEF — Tích hợp `/wizard`: backend thiếu, frontend crash

Board đã merge `bunny/2` (vỏ `/wizard`). Audit chạy ngay sau đó **bắt được lỗi thật**:

```
LOI: Buoc lai thu tren /wizard that bai (buoc-2-y-tuong): Uncaught
at auditRoutes (scripts/visual-audit.mjs:951)
```

**Nguyên nhân đã xác minh:** `POST /api/wizard/generate_prompt` **không tồn tại**
(`GET /openapi.json` không có `wizard`). `bunny/4` bị giết trước khi viết endpoint.
Trang gọi API không có → lỗi không được bắt → audit **dừng giữa chừng**, không tính được
trần 25 route.

Đây là lỗi tích hợp, **không phải** lỗi CSS hay i18n.

---

## Phần 1 — `bunny/4`: dựng endpoint

`POST /api/wizard/generate_prompt`

- Nhận: `{"idea": "...", "target": "veo|muse|kling|seedance", "language": "vi|en"}`
- Gọi **`gemini-3-flash-preview` trên channel `text-openai`**. **Đừng** sửa cấu hình mặc định
  của hệ thống — endpoint này tự chỉ định model, đó là điểm của việc viết độc lập.
  (`gemini-3.5-flash` đang lỗi *"high demand"*; đo `gemini-3-flash-preview` → **200 OK**.)
- Trả: **một prompt tiếng Anh** cho Veo. Trả thêm `frames[]` nếu tách được từng cảnh.

### Ràng buộc chất lượng — có bằng chứng đo, phải theo

Đo thật: với cùng một nội dung, **prompt điện tính cho ảnh tốt hơn hẳn prompt văn xuôi**.
Prompt văn xuôi khiến model **bịa thêm chi tiết** (nấm, cà rốt, bò viên, cần — không có
trong yêu cầu), sai màu, mì bị vặn. Prompt dạng danh sách mô tả thị giác không bịa.

⇒ `prompt` trả về phải là **danh sách mô tả thị giác**, không phải văn xuôi.
Cấu trúc tham chiếu: `subject + action + setting + camera + lighting + style + duration`.

- **Không** sinh marker Seedance (`【字幕】`, `【旁白·…】`, `@duration:N`) — wizard không đi qua Seedance.
- **Không** chứa ký tự Trung.
- Đi qua `freeze_for_task` / `settle_task`; billing key `llm_chat` là đường đã chứng minh.
- Test: prompt trả về **không có ký tự Trung**; `charged > 0`; `refunded == est - charged`.

---

## Phần 2 — `bunny/2`: trang không được crash khi backend lỗi

Bất kể backend có sẵn hay không:
- Lỗi mạng / 404 / 500 phải hiện **thông báo tiếng Việt** trong trang.
- **Không** để promise lỗi thoát ra ngoài → không được có uncaught.
- Nút bước 2 phải trở lại trạng thái sẵn sàng sau khi lỗi, không kẹt loading.
- Thêm một test hoặc tối thiểu tự kiểm: bấm bước 2 khi endpoint 404 **không** phát sinh
  lỗi uncaught.

---

## Cùng một lúc cho cả hai

- `pytest` **không được vượt `4 failed, 999 passed, 1 skipped`** — nhưng đã ghi nhận 4 test
  `test_kira_image_channel_routing.py` đang fail **có sẵn trên `main`** do fixture tự giep
  trùng. **Đừng tính 4 test đó là của mình**; nhưng cũng **đừng sửa chúng** ở task này.
- Báo cáo ra FILE rồi **COMMIT** trước khi kết thúc (`AGENTS.md` mục 11).
- **Đồng bộ `main` trước khi bắt đầu** — `main` vừa có hai merge mới.