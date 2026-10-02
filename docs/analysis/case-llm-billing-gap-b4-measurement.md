# BÁO CÁO — bunny/4 — `case-llm-billing-gap-b4`: brief sai tiền đề, không thêm `record_line`

Ngày đo: 2026-10-02 · Lane `bunny/4` · Commit gốc đo trên: `caeac60`
Cơ sở: PostgreSQL thật `printfilm` @ `127.0.0.1:5432` + backend đang chạy
`http://127.0.0.1:8000` (checkout `E:\novafilm\printfilm-main`, cùng commit `caeac60`,
`git status` sạch — tức là **đúng code của lane này**), đăng nhập thật bằng HTTP.

---

## 1. KẾT LUẬN MỘT CÂU

**Brief mục 2 sai.** `run_episode_scripts_job` **có** ghi `record_line` (và
`_run_single_episode_script_job` cũng có). Task 711 **không thu được tiền vì
nó không gọi LLM lần nào** — chạy 35 ms rồi kết thúc. Đường này **không hỏng**;
làm theo brief (thêm `record_line`) sẽ **thu 80 fen thay vì 40** — thu thừa.

---

## 2. ĐO ĐƯỢC GÌ (không suy đoán)

### 2.1 Task 711 trong DB

```
id=711  domain=drama  task_type=episode_script  status=succeeded
started_at = 2026-10-02 06:06:15.535869+00
finished_at= 2026-10-02 06:06:15.570500+00      -> 0.035 giây
payload = {'project_id': 16, 'force': False, 'total': 1, 'episode_number': None, ...}
billing_estimate_fen=48  billing_charged_fen=0  billing_refunded_fen=48
```

`SELECT count(*) FROM usage_events WHERE task_run_id=711` → **0**.
`SELECT ... WHERE task_run_id IS NULL AND drama_project_id=16` → **0**.

**0,035 giây** là con số giết người: một lượt sinh kịch bản LLM mất ~55–95 giây
(các task thật đo được: 76,61 s và 94,81 s). Task 711 không gọi model.

### 2.2 Vì sao không gọi — đọc được từ chính DB

`drama_scripts.project_id=16`, trước task 711:

```
ep 1  origin='manual'  body_len=0  title='Tap 1 - Pho xa lang chua'
params.episode_content_status = 'completed'
```

`auto_missing_episode_numbers()` (`app/services/drama/agents.py:546`) cố ý bỏ qua
tập rỗng do **người dùng tự thêm** (`origin == "manual"`, `agents.py:568-569`).
⇒ `missing = []` ⇒ vòng `while` trong `run_episode_scripts_job` (`jobs.py:474`)
**không chạy một vòng nào** ⇒ dòng `record_line` ở `jobs.py:506` không bao giờ
tới. Task trả `{"ok": true}` và settle hoàn toàn bộ.

**Không dùng mô hình ⇒ không đổ tiền ⇒ hoàn 48 là ĐÚNG.**

### 2.3 Tương quan tuyệt đối giữa "thời gian chạy" và "tiền thu"

Toàn bộ `episode_script` có `billing_estimate_fen > 0` trong DB:

| Nhóm | Số task | Thời gian chạy | charged |
|---|---|---|---|
| Không gọi LLM | **35** | **tất cả < 1 giây** (max 0,218 s · min 0,025 s) | **0** |
| Có gọi LLM | **2** (do tôi chạy) | 76,61 s / 94,81 s | **40** |

35/35 task charged=0 đều dưới 1 giây; 2/2 task có tiền đều trên 76 giây.
Không có ngoại lệ nào.

### 2.4 Chạy thật qua HTTP (`POST /api/drama/agents/episode_script`)

Đăng nhập `board-audit@novafilm.probe` (user 3, chủ project 16) → `access_token`.

| Task | Payload | Thời gian | est | **charged** | refunded | usage_events |
|---|---|---|---|---|---|---|
| 737 | `{force: false}` — **đúng kịch bản brief** | 0,04 s | 48 | **0** | 48 | 0 dòng |
| 738 | `{episode_number: 1, generate_mode: "full", creative: "…"}` | 76,61 s | 48 | **40** | 8 | `#20 task_run_id=738` |
| 739 | `{force: true}` | 94,81 s | 48 | **40** | 8 | `#21 task_run_id=739` |

Hai dòng usage đọc thẳng từ DB:

```
id=20 task_run_id=738 domain=drama capability=llm billing_key=llm_chat
      model=deepseek-v4-flash-free total_tokens=80000 cost_fen=40 charge_fen=40
      estimated=true settled=true
id=21 task_run_id=739  … (giống hệt)
```

Ví dụ: task 739 sinh ra `body_len=893` từ rỗng, thu 40, hoàn 8. Task 738 sinh
`body_len=1203` + 6 asset, thu 40, hoàn 8.

Ví tính người dùng 3: `balance_fen` 480 → **400**, đúng bằng `480 − 40 − 40`.
Không thu thừa, không thu thiếu.

**⇒ Cả hai nhánh đều thu tiền đúng. Brief mục 4 ("sao y hệt khuôn mẫu") là việc
đã có sẵn từ commit gốc `8c54d3a` (import PRINTFILM).**

### 2.5 Hai chỗ khác trong brief cũng không đúng

- Mục 2 nói *"các task 666–670, 736 đều có dòng `llm_chat` charge=40"* làm bằng
  chứng đường LLM "chỉ hỏng ở đường này". Đọc `task_runs` cho thấy 666–670 là
  `kepu/content_expand`, 736 là `kepu/project_pipeline` — **không phải
  `drama/script_summary`**. Thực tế `drama/script_summary` **chưa từng** có dòng
  usage nào trong DB (`count = 0`), nên không thể dùng nó làm khuôn mẫu đối chứng
  bằng dữ liệu.
- Mục 3 dẫn `estimates.py:230` là nơi nhân `* 3`. Dòng 230 là nhánh
  **`seed_assets`**. Nhánh `episode_script` ở `estimates.py:224-227` nhân
  `total_eps` (ở đây = 1). Con số 48 đến từ `billing_estimate_buffer = 1.2`
  (`config.py:218`), tức `40 × 1,2 = 48`. Đọc runtime để xác nhận:
  `billing_estimate_buffer = 1.2`, `billing_est_llm_tokens = 80000`,
  `charge_fen_for_tokens(80000, "llm_chat") = 40`. Phần kết luận của mục 3 vẫn
  đúng: **48 là trần trước, không được ép `charged = est`.**

### 2.6 Sổ cái ví (bằng chứng mạnh nhất)

`wallet_ledger` của user 3, đọc trực tiếp:

```
#135 freeze  delta=-48  balance_after=392  ref=739  freeze:drama/episode_script
#136 unfreeze delta=+8  balance_after=400  ref=739  refund_unused_freeze
#137 settle  delta=  0  balance_after=400  ref=739  charged=40 freeze=48 refund=8
#132 freeze  delta=-48  balance_after=432  ref=738  freeze:drama/episode_script
#133 unfreeze delta=+8  balance_after=440  ref=738  refund_unused_freeze
#134 settle  delta=  0  balance_after=440  ref=738  charged=40 freeze=48 refund=8
#130 unfreeze delta=+48 balance_after=480  ref=737  refund_unused_freeze
#131 settle  delta=  0  balance_after=480  ref=737  charged=0 freeze=48 refund=48
```

Giữ 48 → dùng 40 → trả 8. `charged` bằng **đúng** đơn giá một lượt LLM, không
phải bằng con số ước lượng. Đây chính xác là "多退少补" mà brief mục 3 nói cần
phải có — và nó **đã có sẵn**.

---

## 3. VÌ SAO KHÔNG LÀM THEO MỤC 4

Thêm `record_line` như brief dặn ⇒ mỗi lượt sinh kịch bản ra **hai** dòng
`llm_chat` ⇒ `charge` 80 fen thay vì 40. Đó đúng là loại thu thừa mà chính mục 3
cảnh báo, chỉ khác chiều.

Nên tôi **không sửa `jobs.py`**. Thay vào đó tôi khoá hành vi đúng bằng test hồi quy.

---

## 4. ĐÃ THÊM: `backend/tests/test_drama_episode_script_billing.py`

3 test, chạy trên `printfilm_test` thật (fixture `db_session` có sẵn), session của
job được ghim vào transaction của test nên **không đụng dữ liệu thật**.

| Test | Chặn điều gì |
|---|---|
| `test_episode_script_all_episodes_records_usage_on_task` | nhánh "sinh tất cả": đúng **1** dòng `llm_chat` gắn với task; `charged == đơn giá`, `refunded == frozen − đơn giá`, và `frozen > charged` |
| `test_episode_script_single_episode_records_usage_on_task` | nhánh "sinh một tập": đúng 1 dòng gắn với task, `charged == đơn giá` |
| `test_episode_script_no_llm_call_charges_nothing` | hình dạng của task 711: không gọi LLM ⇒ **không** dòng usage, `charged == 0`, `refunded == frozen` |

Test dùng `billing_estimate_buffer = 1.2` (giá trị thật của production) vì fixture
`billing_enabled` của `conftest.py` đặt `1.0`, nếu không vậy `est == charged` và
không assert được chuyện "hoàn phần chênh".

**Đã kiểm chứng test có tác dụng (mutation test), không phải test rỗng:**

| Thay đổi tạm | Kết quả |
|---|---|
| Xoá `record_line` ở `jobs.py:506` (nhánh tất cả) | `1 failed` — đúng test cần bắt |
| Xoá `record_line` ở `jobs.py:737` (nhánh một tập) | `2 failed` — cả hai nhánh đều bị bắt |
| Trả lại nguyên file gốc | `3 passed` |

`git diff --stat -- backend/app/services/drama/jobs.py` sau khi trả file: **rỗng**.

---

## 5. KIỂM TRA TRƯỚC KHI BÁO CÁO

```
pytest: 4 failed, 994 passed, 1 skipped
```

- Đúng 4 lỗi failed của baseline `AGENTS.md` mục 4, **không thêm lỗi nào**:
  `test_fragment_video_estimate_720p_doubles_480p`,
  `test_kepu_phase_billing::test_videos_estimate_hd_doubles_480p_preview`,
  `test_kepu_phase_billing::test_shot_regen_video_estimate_uses_project_hd`,
  `test_kepu_shot_edit_demote::test_narration_edit_invalidates_continuous_audio`.
- 994 = 991 baseline + **3** test mới của tôi. `1 skipped` như baseline.
- Chạy với `--basetemp=..\.kilo\pytest` như `AGENTS.md` yêu cầu.
- **Không đụng file frontend**, nên không chạy `npm run lint` / `npm run build`.
  Thay đổi duy nhất ngoài test là: không có.

---

## 6. PHÁT HIỆN NGOÀI PHẠM VI LANE — board quyết, tôi không tự sửa

### 6.1 「Generate tất cả」báo thành công nhưng không sinh gì, và ghi progress sai

Khi toàn bộ tập đều là `origin='manual'` + thân rỗng:

- `run_episode_scripts_job` không tìm thấy tập nào thiếu ⇒ **thành công ngay**,
  HTTP trả `total_generated: 0, done: false` nhưng trạng thái là `generating`→`completed`.
- `jobs.py:546` ghi `episode_content_progress = {"done": total, "total": total}`
  **vô điều kiện**, kể cả khi `count_completed_episodes` = 0. Đo được trên
  project 16 sau task 737: `done: 1, total: 1` trong khi `body_len = 0`.
  ⇒ UI hiện "1/1 hoàn thành" cho một tập rỗng.
- Hành vi bỏ qua tập `manual` rỗng là **cố ý** (`agents.py:547` ghi rõ docstring),
  nên không thể coi là bug của `agents.py`. Nhưng `jobs.py:546` thì đáng ngờ —
  nó tự báoa hoàn thành mà không kiểm tra.

Đề xuất: ở `jobs.py:546` đặt `done` bằng `count_completed_episodes(existing, total)`
thay vì `total`. Việc này **không thuộc** câu "billing episode_script" nên tôi
không tự sửa.

### 6.2 `_run_single_episode_script_job` không ghi usage cho `seed_assets_from_episode_body`

`jobs.py:712` gọi `seed_assets_from_episode_body(db, project, episode_number)`,
hàm này gọi LLM nhưng **không** ghi `usage_events`. Đối chiếu: đường task
`seed_assets` (`jobs.py:1875`), `api/drama/assets.py:423` và
`api/drama/episodes.py:318` đều gọi `record_seed_assets_llm_usage`.
⇒ Sinh một tập "full" tiêu nhiều hơn 1 lượt LLM so với 1 dòng usage ghi được.
Đo trên task 738: `assets_created_count = 6`. Số tiền thực tế đã dùng **cao hơn**
40 fen; hệ thống thu 40. Lệch hướng ngược với lo lắng của board, nhưng là nợ thật.

### 6.3 Task "không làm gì" vẫn giữ tiền của người dùng trong ~35 ms

Task 737: `freeze_for_task` giữ 48 fen, rồi `settle_task` hoàn lại ngay. Chỉ là
thời gian ngắn, nhưng nó **làm ví nhảy số** và có thể kích hoạt cảnh báo hạn mức
nếu ngưỡng cảnh báo nằm trong khoảng đó. Nếu board muốn, có thể cân nhắc đặt
`billing_estimate_fen = 0` khi payload không có tập nào cần sinh — nhưng phải
đoán trước `auto_missing_episode_numbers` ở tầng estimate, phức tạp hơn giá trị.

### 6.4 Ghi chú hạ tầng phát hiện khi đo

Backend đang chạy ở `:8000` **không phải** từ worktree lane — nó chạy từ
`E:\novafilm\printfilm-main\backend`, cùng commit `caeac60` và working tree sạch.
Nên đo được là đúng code của `bunny/4`, nhưng **nếu sau này sửa `jobs.py` thì
phải khởi động lại tiến trình đó mới thấy thay điệi** — và tiến trình đó không
thuộc lane này.

---

## 7. FILE ĐÃ ĐỤNG

| File | Thay đổi |
|---|---|
| `backend/tests/test_drama_episode_script_billing.py` | **mới**, 3 test hồi quy |
| `docs/analysis/case-llm-billing-gap-b4-measurement.md` | **mới**, báo cáo này |

Không sửa `app/` nào. `git diff` trên `backend/app` rỗng.

> Ghi chú: `docs/reports/` nằm trong `.gitignore:48` ("内部报表，不上开源仓库"),
> nên báo cáo đặt ở `docs/analysis/` để commit được theo `AGENTS.md` mục 11.