# BRIEF — bunny/4 — Sinh kịch bản xong nhưng không thu được tiền

## 1. Bằng chứng (đo, không phải suy đoán)

Task 711, chạy qua đúng HTTP thật (`POST /api/drama/agents/episode_script`):

```
status=succeeded
billing_status=settled
billing_estimate_fen=48
billing_charged_fen=0        <- thu được 0
billing_refunded_fen=48      <- hoàn hết
```

Kịch bản sinh ra và lưu vào DB thành công, nhưng không có dòng `usage_events` nào
thuộc task 711. `settle_task` quét `UsageEvent` thấy rỗng ⇒ `charged=0` ⇒ hoàn toàn bộ.

## 2. ĐÃ TÌM RA CHỖ — không cần đoán

`handlers.py:274` → `("drama","episode_script")` → `_run_drama_episode_script` →
`jobs.py:341 run_episode_scripts_job`.

Đo bằng cách quét toàn bộ thân hàm: **`run_episode_scripts_job` không có bất kỳ lời
gọi nào** tới `record_line` / `record_seed*` / `charge_fen*` / `billing_scope`.
Đó là lỗ hổng. Đối chiếu: `run_script_summary_job` (task `script_summary`, `jobs.py:274`)
**có** ghi `record_line` — và các task 666–670, 736 đều có dòng `llm_chat` `charge=40`
trong DB. Nên đường LLM **không** hỏng toàn bộ, chỉ hỏng ở đường này.

## 3. CẢNH BÁO QUAN TRỌNG: ĐỪNG ÉP `charged = est`

Board đề xuất "charged phải khớp est". **Làm vậy sẽ thu thừa tiền của người dùng.**
Đo được:

```
mọi dòng llm_chat hiện có:  tokens=80000  cost=40  charge=40
est của task 711:                                       48
```

est **48** là **trần trước** — `estimates.py:230` cố ý nhân `billing_est_llm_tokens * 3`
để phòng LLM gọi nhiều lần. Giá thật **40**. Ép 48 ⇒ **mỗi lượt thu thừa 8 fen**,
đúng thứ `settle_task` mô tả là "多退少补" (thừa hoàn, thiếu bù).

Cách đúng: ghi usage **đúng như `run_script_summary_job` làm** — `billing_key="llm_chat"`,
`model` là model thực sự đã chạy. Khi đó `charge_fen_for_usage` tự tính 40, settle hoàn
8 fen phần chênh. Người dùng trả đúng số đã dùng.

## 4. Cách làm (bám khuôn mẫu có sẵn)

Đọc `jobs.py` quanh dòng 274 (hàm `run_script_summary_job`) và **sao y hệt khuôn mẫu đó**:
`billing_key="llm_chat"`, `model=get_settings().model_llm` hoặc model thực tế trả về,
`estimated=True` nếu không đo được token, kèm `drama_project_id`.

Lưu ý: đường ảnh đã từng vướng bẫy "ghi usage ngoài `billing_scope` nên bị bỏ qua âm
thầm" (`usage.py` có chốt `if get_current_task_run_id() is None: return None`). Đảm bảo
lời gọi nằm trong scope của task, và **kiểm chứng bằng cách đọc `UsageEvent` sau khi
chạy thật** — đừng chỉ tin test.

## 5. Bắt buộc trước khi báo cáo

- Unit test: sinh kịch bản thành công ⇒ `charged > 0` **và** `refunded = 48 - charged`.
  Không ép bằng 48.
- **Chạy thật** `POST /api/drama/agents/episode_script` trên database thật, rồi đọc
  `billing_charged_fen` **và** dòng `usage_events` tương ứng. Bằng chứng bằng dữ liệu,
  không bằng suy luận.
- `pytest` không được vượt `4 failed, 991 passed, 1 skipped`.
- Viết báo cáo ra FILE rồi **COMMIT** trước khi kết thúc (`AGENTS.md` mục 11).

## 6. Ghi chú cho người đọc brief này

`billing_est_llm_tokens` là **giả định chưa đo**, `billing_llm_per_m = 5.0` cũng vậy
(`AGENTS.md` mục 10). Nên giá LLM hiện là ước lượng, chưa phải giá nhà cung cấp thật.
Việc cần làm bây giờ là **ghi đúng số đã dùng**; chốt giá thật là việc riêng.