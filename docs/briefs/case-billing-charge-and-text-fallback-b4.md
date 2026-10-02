# BRIEF — bunny/4 — Sinh ảnh thành công nhưng không thu được tiền

## 1. Bằng chứng đã đo (không phải giả định)

Task 705, chạy qua đúng đường HTTP thật:

```
POST /api/drama/generation/image  {"model_id":"hy-image-v3.5-free", ...}

billing_enabled=True
ví TRƯỚC : balance=500  frozen=0
ví SAU 5s : balance=490  frozen=10      <- đóng băng ĐÚNG 10 fen
task 705 : status=succeeded
           billing_status=settled
           billing_estimate_fen=10       <- ước tính ĐÚNG
           billing_charged_fen=0         <- THU ĐƯỢC 0  ← vấn đề
           billing_refunded_fen=10       <- hoàn hết
```

Ảnh thật đã sinh thành công (character sheet 2,28 MB, đã mở xem bằng mắt).

## 2. ĐÃ LOẠI TRỪ — đừng làm lại

- **Không phải** thiếu lời gọi ghi usage: `app/services/drama/generation.py:1338` **đã có**
  `await record_seedream_image_usage(...)` ngay sau khi `gen_image` trả về.
- **Không phải** ước tính sai: `estimate_task_fen` với payload thật trả **10**
  (đo bằng script, xem mục 6).
- **Không phải** billing tắt: `billing_enabled=True`.

## 3. Nghi vấn để soi trước

`settle_task` đọc `UsageEvent` có `settled=False` theo `task_run_id`. Không có dòng nào ⇒
`charged=0` ⇒ hoàn toàn bộ. Nên một trong hai khả năng:

a) `record_line` **không ghi được** — `usage.py` có chốt chặn
   `if get_current_task_run_id() is None: return None` cho các wrapper trong `billing_scope`.
   Nếu `generate_asset_image` chạy **ngoài** scope thì dòng usage bị bỏ qua âm thầm.
   → Kiểm `UsageEvent.task_run_id` sau khi sinh ảnh có bằng 705 không.
b) Dòng usage **có ghi** nhưng `charge_fen_for_usage` ra 0 — kiểm tra `billing_key`,
   `estimated`, và `model` thực tế truyền vào.

Đo trước rồi sửa. Đừng sửa theo phỏng đoán.

## 4. Cảnh báo: ĐỪNG ép `charged = est`

Board từng đề xuất "số fen phải bằng đúng est (10)". **Làm vậy sẽ tính sai tiền thật.**
`charge_fen_official_image` phân giá theo model: Kira HY là **10 fen cố định**, nhưng
Seedream là **21 fen ở 1K / 35 fen ở 2K**. Ép cứng 10 nghĩa là mỗi ảnh Seedream 2K lỗ
**25 fen**, và ảnh Seedream 1K lại **thu hơn giá**.

Cách đúng: ghi usage với **model thực sự đã sinh ảnh** để `charge_fen_for_usage` tự tính.
Kira → 10, Seedream 1K → 21, Seedream 2K → 35. Số đi ra đúng hơn con số 10.

## 5. Kèm theo: mở kênh dự phòng `deepseek-v4-flash-free`

Gemini trả **HTTP 429** (giới hạn lưu lượng) làm chết task `project_pipeline` (task 706).

**Đo được trước khi sửa:**
```
channel text-openai  enabled=True sort=-1 models=['gemini-3.5-flash']   <- chỉ có Gemini
resolve text 'deepseek-v4-flash-free'
   -> candidates=[('text-openai', 'gemini-3.5-flash')]                  <- chạy nhầm Gemini!
```

DeepSeek **không cần API key mới** — nó là model của chính Kira, dùng cùng
`kira_base_url` + `kira_api_key` đã có. Đã đo trước: 3/3 thành công, 13,3s / 9,0s / 13,9s.

Việc cần làm:
1. Thêm `deepseek-v4-flash-free` vào `models` của channel `text-openai`.
2. Thêm logical model `deepseek-v4-flash-free` (capability `text`, binding
   `channel_id=text-openai`, `upstream_model=deepseek-v4-flash-free`) **nếu chưa đủ**.
3. **KHÔNG viết mã rẽ nhánh riêng.** Cơ chế dự phòng đã có sẵn: ứng viên được sắp theo
   `sort_order` rồi `priority`. Đặt DeepSeek **sau** Gemini là đủ.
4. **Cấm** dùng `PATCH /api/admin/settings/routing` với `system_channels` để làm việc này —
   `model_settings.py` sẽ **disable mọi channel không phải TokenFree**.

## 6. Bắt buộc trước khi báo cáo

- Test: `hy-image-v3.5-free` thành công ⇒ `charged == 10` và `refunded == 0`.
- Test: Seedream **2K** vẫn ra **35**, không phải 10 (đây là chốt chặn chống hồi quy giá).
- Test: DeepSeek xuất hiện trong ứng viên của `resolve('text','deepseek-v4-flash-free')`
  **sau** Gemini; `resolve('text','gemini-3.5-flash')` không đổi.
- `pytest` không được vượt `4 failed, 975 passed, 1 skipped`.
- **Báo cáo ra FILE rồi COMMIT trước khi kết thúc** (`AGENTS.md` mục 11).