# B4 — `/wizard` ghi "đã thu" nhưng không thu được fen nào

Báo cáo đo đạc. **Không sửa file nguồn nào** — vì đo cho thấy không có lỗi code gây ra
triệu chứng. Lý do thật nằm ở cấu hình. Chi tiết bên dưới.

Lane: `bunny-4` · nhánh `bunny/4` · DB dùng chung `printfilm` @ `127.0.0.1:5432`.
Tài khoản thử: `board-audit@novafilm.probe` / `Audit-2026-x` (user id 3, role `admin`).

Mọi số dưới đây là **số đo**, không phải suy luận từ mã nguồn.

---

## 1. Tái hiện đúng triệu chứng

Backend của lane chạy ở `127.0.0.1:8140` (cổng 8000 đang thuộc checkout `E:\novafilm\printfilm-main`,
không dùng để đo để khỏi lẫn lane).

```
POST /api/wizard/generate_prompt  -> 200, prompt 322 ký tự, task_id=757
GET  /api/billing/wallet          -> BEFORE balance_fen=360  billing_enabled=False
GET  /api/billing/wallet          -> AFTER  balance_fen=360  billing_enabled=False
DELTA_FEN=0
```

Bản ghi task trong `task_runs` (đọc thẳng bằng `psql`, không qua API):

| id | domain | task_type | status | billing_status | est | charged | refunded |
|---|---|---|---|---|---|---|---|
| 753 | wizard | generate_prompt | succeeded | settled | **0** | **40** | 0 |
| 754 | wizard | generate_prompt | succeeded | settled | **0** | **40** | 0 |
| 757 | wizard | generate_prompt | succeeded | settled | **0** | **40** | 0 |

Đúng như brief mô tả: **bản ghi task nói `charged=40`, ví nói 0.**

---

## 2. Trả lời câu hỏi ở §2 của brief — và tiền đề của câu hỏi đó **không đúng**

Brief hỏi: *"vì sao `billing_active(user)` lại False cho chính tài khoản này, trong khi
`GET /api/billing/wallet` trả `billing_enabled: true`?"*

**Đo được: không có sự lệch đó. Cả hai đều `false`.**

- `billing_active()` — `settlement.py:32-36` — đọc `get_settings().billing_enabled`.
- `GET /api/billing/wallet` — `api/billing.py:44` — `current = get_settings()`, rồi
  `"billing_enabled": current.billing_enabled`.

Hai chỗ gọi **cùng một singleton** (`config.py:421`, `@lru_cache`). Chúng không thể lệch nhau.

Đo trên cả hai tiến trình:

| tiến trình | `/api/billing/wallet` → `billing_enabled` |
|---|---|
| `E:\novafilm\printfilm-main` cổng 8000 | `false` |
| lane bunny-4 cổng 8140 | `false` |

Cột `billing_enabled` trong DB:

```sql
select config_json->'flat'->>'billing_enabled' from app_settings where id='default';
-- flat_billing_enabled
-- false
```

`.env` của cả hai checkout: `BILLING_ENABLED=false`.

**Kết luận:** `billing_active()` trả False vì billing **đang tắt toàn cục**, và
`/api/billing/wallet` nói đúng điều đó. Không có chỗ nào nói dối. Brief ghi nhận
`billing_enabled: true` ở thời điểm đo của board — **không tái hiện được**, và tôi không
tìm được cấu hình nào trong repo/DB làm cho nó thành `true`.

---

## 3. Nhánh code thật sự đã chạy (không phải nhánh brief nghi ngờ)

Vì `billing_enabled=false`, `freeze_for_task` đi vào `settlement.py:181-187`:

```python
user = await _lock_user(db, int(task.requested_by))
if not user or not billing_active(user):
    task.billing_status = "skipped"      # <- đã chạy
    task.billing_estimate_fen = 0        # <- đã chạy
```

`est=0` + `skipped` khớp chính xác với bảng ở §1.

Lúc settle, task rơi vào **nhánh `skipped` ở `settlement.py:282-286`**, không phải nhánh
`289-299` mà brief dẫn:

```python
if task.billing_status == "skipped":
    task.billing_charged_fen = charged   # ghi 40 vào sổ task
    task.billing_status = "settled"
    return {"charged": charged, "refunded": 0}   # không đụng ví — CỐ Ý
```

Đây chính là hành vi mà brief §5 nói phải giữ nguyên. **Tôi không đụng vào
`settlement.py:289-299`.** Thực tế nhánh đó không liên quan tới sự cố này.

---

## 4. Bằng chứng quyết định: bật billing thật thì hệ thống thu tiền đúng

Đây là bước quyết định có/không. Bật billing qua **đường admin được hỗ trợ**
(`PATCH /api/admin/settings/models`), không sửa code:

```
PATCH {"billing_enabled": true}  ->  wallet billing_enabled=True
```

rồi gọi lại đúng endpoint đó:

```
BEFORE balance_fen=360  billing_enabled=True
POST /api/wizard/generate_prompt -> 200, prompt_len=604, task_id=764
AFTER  balance_fen=320  billing_enabled=True
DELTA_FEN=40
```

**Số dư ví thật sự giảm.** Đây là tiêu chuẩn nghiệm thu duy nhất được brief chấp nhận, và
nó đạt được.

### Bảng nghiệm thu §4 của brief — đủ cả bốn dòng

| | trước | sau |
|---|---|---|
| `billing_estimate_fen` | 0 | **48** (> 0, = est) ✅ |
| `billing_status` | — | **`frozen` → `settled`** ✅ |
| ví `balance_fen` | 360 | **320** = B − charge ✅ |
| `billing_charged_fen` | — | **40** = charge ✅ |

Sổ ví `wallet_ledger`, user 3 (đọc bằng `psql`) — bằng chứng tiền thật đi qua ví:

```
150 | task_run | 758 | freeze   | -48 | 312 | freeze:wizard/generate_prompt
151 | task_run | 758 | unfreeze | +8  | 320 | refund_unused_freeze
152 | task_run | 758 | settle   |  0  | 320 | charged=40 freeze=48 refund=8
```

Ròng −48 + 8 + 0 = **−40**, khớp `DELTA_FEN=40`. `est=48` khớp đúng
`estimate_task_fen('generate_prompt') = 48` mà brief đã đo trước.

---

## 5. Hai điều kiện còn lại trong §4 — đều đạt

### 5a. Nghạch đủ thì bị chặn, không lặp lẩm rồi mới hỏng ví

Đặt số dư xuống 20 fen (thấp hơn est 48) qua `PATCH /api/admin/users/3`:

```
BEFORE balance_fen=20  billing_enabled=True
POST /api/wizard/generate_prompt
  -> HTTP 402  {"detail": "余额不足：需要 ¥0.48，当前 ¥0.20，请先充值"}
AFTER  balance_fen=20   DELTA_FEN=0
```

Bị chặn **trước khi** gọi LLM, ví không đổi. ✅

### 5b. Gọi lỗi thì hoàn đủ `est`

Trỏ channel `text-openai` vào cổng chết (`http://127.0.0.1:9/v1`) để gây lỗi vận
chuyển thật, số dư đặt về 360:

```
BEFORE balance_fen=360
POST /api/wizard/generate_prompt
  -> HTTP 502  {"detail": "text model error: no usable model on channel text-openai: All connection attempts failed"}
AFTER  balance_fen=360   DELTA_FEN=0
```

Bản ghi task:

| id | status | billing_status | est | charged | refunded | error_code |
|---|---|---|---|---|---|---|
| 763 | failed | settled | 48 | **0** | **48** | ephemeral_failed |

Sổ ví: `freeze −48 → 312`, `unfreeze +48 → 360`, `settle 0`. **Hoàn đủ 48, ví về nguyên trạng.** ✅

Sau khi trả `base_url` về `https://kiraai.vn/api/v1`, gọi lại lần nữa: `task_id=764`,
`360 → 320`, `DELTA_FEN=40`. Không có gì hỏng.

---

## 6. Hai khiếm khuyết thật tìm được trong lúc đo (chưa sửa — ngoài phạm vi brief)

### 6a. Lần nạch đủ **không để lại dấu vết nào** trong `task_runs`

Lúc đo 5a, `run_billed_ephemeral` (`ephemeral.py:119-126`) gán
`status="failed"`, `error_code="insufficient_balance"`, `billing_status="none"` rồi `raise`
**không `commit`**. `wizard.py:81-82` đổi thành `HTTPException`, `get_db`
(`database.py:48-50`) không rollback tường minh nên `AsyncSessionLocal()` đóng session và
rollback. Kết quả: **task row bị mất hoàn toàn.**

Bằng chứng: sau `task_id=758` (thành công) và trước `task_id=763` (lỗi upstream) — lần gọi
402 nằm giữa đúng chỗ đó — **không có dòng nào**. Đã gọi 402 hai lần, cả hai lần đều không
có row.

Hệ quả: ví an toàn (đây là điều tốt), nhưng **admin không có cách nào biết người dùng đã
bị chặn vì hết tiền**. Người đọc `task_runs` sẽ thấy im lặng. Đây là lỗ hổng quan sát,
không phải lỗ hổng tiền. **Chưa sửa** — sửa cần commit trong nhánh lỗi của
`run_billed_ephemeral`, đó là thay đổi hành vi của luồng tiền, thuộc quyết định của board.

### 6b. `BILLING_ENABLED` trong `.env` bị overlay DB vô hiệu hoàn toàn — không có cảnh báo

Đo trực tiếp: khởi động backend của lane với **process env `BILLING_ENABLED=true`**:

```
GET /api/billing/wallet  ->  billing_enabled=False
```

Lý do: `load_model_settings_cache` (`model_settings.py:719-727`) ghi toàn bộ 88 trường
`flat` — gồm `billing_enabled` — xuống `app_settings.config_json`; `_refresh_overlay` +
`reload_settings` biến nó thành overlay có độ ưu tiên cao hơn `.env`. Sau lần bootstrap đầu,
sửa `.env` không còn tác dụng.

`AGENTS.md` §10 đã ghi nhận điều này ("hàng cấu hình trong database có quyền ưu tiên cao
hơn `.env`), nên **không phải lỗi mới**. Nhưng nó chính là thứ làm cho cả triệu chứng này
khó chẩn đoán: sửa `.env` rồi thấy không đổi gì. **Chưa sửa** — đổi thứ tự ưu tiên overlay
là thay đổi lớn và rủi ro, ngoài phạm vi brief này.

---

## 7. Khuyến nghị cho board

1. **Không có lỗ hổng tiền trong `/wizard`.** Toàn bộ luồng
   `freeze_for_task → settle_task` đúng khi billing bật, đã chứng minh bằng số dư ví thật.
   Đừng sửa `settlement.py`.
2. **Câu hỏi gốc của brief dựa trên một tiền đề sai** (`billing_enabled: true` từ
   `/api/billing/wallet`). Nếu board có log/capture của lần đo đó, nên kiểm lại — cùng một
   cặp đọc đó không thể cho hai giá trị khác nhau trong cùng tiến trình.
3. **Người vận hành muốn thu tiền thì phải bật billing qua trang quản trị**, không phải
   qua `.env`. Tôi đã bật để đo rồi **trả lại về `false`**.
4. **Chưa được bật billing cho người dùng thật.** `AGENTS.md` §10 còn đang mở
   `billing_llm_per_m = 5.0` (giả định chưa đo) và `hy-image-v3.5-free` chưa có bảng giá.
   Bật billing bây giờ là thu tiền thật bằng con số chưa được đo.
5. Nên giao riêng 6a (mất dấu vết khi nghạch đủ) và 6b (`.env` bị overlay vô hiệu).

---

## 8. Môi trường đã trả về nguyên trạng

Đã đổi tạm trên DB dùng chung, **đã trả lại hết và đã kiểm lại bằng `psql`**:

| mục | trước | sau khi trả |
|---|---|---|
| `app_settings.flat.billing_enabled` | `false` | `false` ✅ |
| `system_model_channels.text-openai.base_url` | `https://kiraai.vn/api/v1` | `https://kiraai.vn/api/v1` ✅ |
| `users.balance_fen` (id 3) | 360 | 360 ✅ |

Các dòng `wallet_ledger` sinh ra lúc đo vẫn còn (id 150–157) — đó là bằng chứng, không xoá.
Tiền thật đã bị trừ trong lúc đo rồi được cộng lại bằng đúng số, nên số dư đúng như cũ.

Cổng 8140 và 8141 là tiến trình của riêng lane này, không đụng cổng 8000 của lane khác.

---

## 9. pytest

| lần | kết quả |
|---|---|
| baseline (trước khi đo) | `4 failed, 1023 passed, 1 skipped` |
| sau khi đo (DB đã trả về) | `4 failed, 1023 passed, 1 skipped` |

Hai lần liên tiếp cho **cùng một con số** — đúng chuẩn board ở `AGENTS.md` §10.

4 lỗi failed là **đúng 4 lỗi failed đã biết từ upstream**, không lỗi nào mới:

```
tests/test_fragment_video_estimate.py::test_fragment_video_estimate_720p_doubles_480p
tests/test_kepu_phase_billing.py::test_videos_estimate_hd_doubles_480p_preview
tests/test_kepu_phase_billing.py::test_shot_regen_video_estimate_uses_project_hd
tests/test_kepu_shot_edit_demote.py::test_narration_edit_invalidates_continuous_audio
```

Ngưỡng brief §4: không vượt `4 failed, 1023 passed, 1 skipped` — **đạt, vừa đúng ngưỡng.**

Không sửa file nguồn nào, nên không có thay đổi nào để làm hỏng test.