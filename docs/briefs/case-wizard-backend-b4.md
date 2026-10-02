# BRIEF — bunny/4 — Vá định tuyến ảnh + dựng API sinh prompt cho /wizard

Hai việc, **không sửa gì thuộc luồng cũ**. Không xoá file nào.

---

## VIỆC 1 (ưu tiên) — `model_image` bị ghi đè, không cứu được

### Bằng chứng board đã đo (không cần đo lại)

```
patch_admin_model_settings(db, AdminModelSettingsPatch(model_image='hy-image-v3.5-free'))
  -> applied: ['model_llm', 'model_image']        # nhận giá trị
  -> overlay ngay sau patch : 'doubao-seedream-5-0-260128'   # đã bị đổi lại
  -> sau reload             : 'doubao-seedream-5-0-260128'
```

Tức giá trị **bị nuốt ngay trong lúc patch**, không phải lúc reload.

### Hy-image KHÔNG bị loại — đã kiểm

```
logical models image : ['doubao-seedream-5-0-260128', 'hy-image-v3.5-free']
hy-image-v3.5-free           resolvable=True  candidates=[('image-kira','hy-image-v3.5-free')]
doubao-seedream-5-0-260128   resolvable=True  candidates=[('tokenfree','doubao-seedream-5-0-260128')]
```

Nên `normalize_default_models` (`model_routing_config.py:206-229`) **không** phải thủ phạm —
nó sẽ giữ `hy-image-v3.5-free` vì resolvable.

### Nghi phạm đã khoanh vùng

`model_settings.py:696`:
```python
flat["model_image"] = default_models.image_model
```
Đây là **ghi ngược** giá trị đã chuẩn hoá vào overlay. Nếu ở thời điểm ghi, `default_models`
đã bị đổi về Seedream thì giá trị người dùng vừa đặt bị mất vĩnh viễn.

**Việc cần làm:** tìm đúng chỗ ghi đè (ưu tiên `patch_admin_model_settings` và
`_rewrite` quanh dòng 690-705), sửa để **giá trị người dùng đặt thắng**, rồi chứng minh:

```
patch model_image='hy-image-v3.5-free' -> reload -> default_models.image_model == 'hy-image-v3.5-free'
seedream vẫn còn phân giải được trên tokenfree (KHÔNG được phá Seedream)
```

**Không** được sửa bằng cách xoá `normalize_default_models` hoặc ép cứng — phải hiểu đúng
cơ chế rồi sửa đúng chỗ. Nếu không tìm ra nguyên nhân, **dừng và báo, đừng vá bừa**.

### Vì sao việc này quan trọng

TokenFree **không có khoá** (`ark._ark_api_key()` → rỗng). Mặc định ảnh đang trỏ vào đó
⇒ sản phẩm **hỏng ngay từ mặc định**. Chỉ chạy được sau khi board sửa DB thủ công cho
project 58. Đây là thứ duy nhất chặn luồng ảnh.

### Sau khi sửa, chạy thật và đọc số

Sinh 1 ảnh qua đường thật, rồi đọc `billing_charged_fen` phải **10** và `refunded` phải **0**.
Tài khoản thử: `board-audit@novafilm.probe` / `Audit-2026-x` (dự án 16).

---

## VIỆC 2 — `POST /api/wizard/generate_prompt`

Endpoint **mới**, không đụng `chat_storyboard` cũ (`ark.py:702,729` ép tiếng Trung —
**đừng sửa**, luồng drama đang dùng).

- Nhận: `{"idea": "...", "language": "vi|en"}`.
- Gọi **`gemini-3-flash-preview`** (đã đo: 200 OK. `gemini-3.5-flash` đang lỗi *"high demand"*).
- Trả về: **một prompt tiếng Anh** viết cho Veo 3.1, cấu trúc gợi ý:
  `subject + action + setting + camera + lighting + style + duration`.
- **Không** sinh marker Seedance (`【字幕】`, `【旁白·…】`, `@duration:N`) — wizard không đi qua Seedance.
- Phải đi qua `freeze_for_task` / `settle_task` như mọi task khác để có thu tiền.
- Nhớ: `charge_fen_for_usage` với `billing_key="llm_chat"` là đường thu đã được chứng minh.

### Test bắt buộc
- Prompt trả về **không chứa ký tự Trung**.
- Test tích phí: `charged > 0`, `refunded == est - charged`.
- `pytest` **không được vượt `4 failed, 994 passed, 1 skipped`**.

---

## Ràng buộc

- **Không sửa** `ark.py:702` / `:729`.
- **Không xoá** file nào.
- Không đụng module drama.
- Báo cáo ra FILE rồi **COMMIT** trước khi kết thúc (`AGENTS.md` mục 11).