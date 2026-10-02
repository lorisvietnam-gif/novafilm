# REPORT — Cắt bớt âm thầm ảnh tham chiếu (silent truncation)

Lane: `bunny/1` · Base: `adeebe9` · Commits: `cc75219`, `ad29e27`, `a5661fc`, `14a70bf`

Brief: `.kilo/briefs/fix-silent-truncation.md`

---

## 0. Kết luận một dòng

`tokenfree_video.py:120` **đã cắt âm thầm** ở 9 ảnh như brief nói. Nay nó **báo lỗi bằng
tiếng Việt** thay vì cắt, chuỗi lỗi **tới tận người dùng** (đã test chứng minh, không phải
đọc code), và thêm một chốt chặn cho **kênh Ark native** mà trước đó **không hề có**.

---

## 1. Chuỗi lỗi: từ chỗ phát hiện đến response — CÓ tới người dùng

### 1.1 Chuỗi thật trên đường Canvas (đã kiểm chứng bằng test)

```
raise ReferenceImageError(...)                    media_ref_limits.py:50
 └ ensure_within_reference_image_limit             media_ref_limits.py:33
    └ wrap_seedance_payload_for_newapi            tokenfree_video.py:70  (gọi ở :128)
       └ prepare_video_create_body                tokenfree_video.py:191
          └ ArkGateway._video_json                ark.py:540-548
             └ gen_video_seedance_body            ark.py:1378  ← 漫剧分镜实际走这里
                └ submit_prepared_fragment_video  drama/generation.py:1642 (gọi ở jobs.py:1187)
                   └ submit_fragment_video_task   drama/jobs.py:1187
                      └ _run_drama_fragment_video tasks/handlers.py:79
                         └ execute_task_run       tasks/executor.py:95
                            └ except Exception   tasks/executor.py:124
                               └ _fail_task       tasks/executor.py:188
                                  ├ task.status  = "failed"
                                  ├ task.error_code = "ReferenceImageError"
                                  ├ task.error_message = <tiếng Việt>
                                  └ frag.params["generation"] ← lỗi gốc  executor.py:208-221
```

**Hai mặt trước người dùng** (đều qua polling, không cần SSE):

| Bề mặt | Trường | Chỗ đọc |
|---|---|---|
| `GET /api/tasks/{id}` | `error_message` | `api/tasks.py:68-78` → `DramaGenTaskDetail.tsx:157` |
| `GET /api/drama/episodes/{id}` | `params.generation.error` / `.root_error` | `api/drama/episodes.py:140,163` → `dramaEpisodeEditUtils.ts:106-138` |

### 1.2 **KHÔNG bị nuốt** — và đây là điều đã test, không phải đoán

Ba test mới trong `tests/test_reference_image_limit_reaches_user.py` chạy **đúng** `execute_task_run`
thật (không mock cả chuỗi) và assert:

| Test | Chứng minh |
|---|---|
| `test_executor_records_reference_image_error_for_polling` | `status=failed`, `error_code="ReferenceImageError"`, `error_message` có số ảnh / trần / số bị bỏ |
| `test_reference_image_error_writes_fragment_generation_error` | `frag.params.generation` có lý do, không phải `status=failed` trống |
| `test_reference_image_error_is_not_retried_as_insufficient_balance` | `error_code != "insufficient_balance"`, `billing_status="settled"` |

Điểm quan trọng: **precheck của frontend chạy ở browser, còn chốt chặn này chạy ở backend.**
Người dùng gọi API trực tiếp (open API `v1`), hoặc tiền cũ chưa kịp chặn, vẫn nhận được lỗi
đọc được. Trước đây họ chỉ nhận được 9 ��nh và im lặng.

### 1.3 Không có retry nào nuốt hoặc lặp lại lỗi này

| Tầng | Kết luận |
|---|---|
| `ark.py:1531-1552` (`gen_and_wait_seedance_body`) | whitelist chỉ khớp `audio_url` + `resource download failed` → **không retry**, re-raise |
| `ark.py:1717-1757` (`gen_and_wait_video`) | keyword không khớp → **không retry** |
| `billing/ephemeral.py:262` | ghi `error_code="ephemeral_failed"` rồi **re-raise** |
| `tasks/scheduler.py:249` | chỉ re-queue `leased`/`running`, **không** re-queue `failed` |

Đây là lỗi tất định (đếm số ảnh), không retry là đúng.

### 1.4 Về thời điểm phát sinh — không mất tiền

`self._video_json(...)` là **tham số** của `client.post(...)`, nên raise xảy ra **trước** khi
request được tạo: **không có task nào ở upstream**, và `settle_task` trả lại khoản đóng băng
(test xác nhận `billing_status="settled"`).

---

## 2. Test chứng minh 10 ảnh bị **TỪ CHỐI**, không phải cắt còn 9

### 2.1 Test mới (11 test, tất cả xanh)

`tests/test_tokenfree_video.py`:

| Test | Khẳng định |
|---|---|
| `test_wrap_seedance_payload_rejects_ten_reference_images` | **10 ảnh → raise**; message có 10, 9, và số bị bỏ |
| `test_wrap_seedance_payload_rejects_far_over_limit_reference_images` | 12 ảnh → raise, nói rõ bỏ 3 |
| `test_wrap_seedance_payload_keeps_exactly_nine_reference_images` | 9 ảnh **vẫn gửi đủ**, không lặp vào `content`/`images` |
| `test_wrap_seedance_payload_dedups_before_counting_the_limit` | 10 entry / 9 URL khác nhau → **vẫn qua** |
| `test_wrap_seedance_payload_rejects_ten_first_frame_images_too` | nhánh first/last-frame cũng phải chặn |
| `test_gen_video_seedance_body_rejects_ten_images_on_native_ark` | chặn trên **Ark native**, và **không** chạy URL resolve |
| `test_gen_video_seedance_body_allows_nine_images_on_native_ark` | 9 ảnh đi trọn vẹn tới POST |
| `test_ensure_within_reference_image_limit_dedups_itself` / `_rejects_over_limit` | helper tự khử trùng; >9 → raise |

`tests/test_reference_image_limit_reaches_user.py`: 3 test chuỗi lỗi ở mục 1.2.

### 2.2 **Bằng chứng test thật sự bắt được bug** (không pass vacuous)

Brief yêu cầu "test phải thất bại với ảnh thứ 10 bị mất". Đã kiểm chứng thật: tạm vô hiệu hoá
chốt chặn rồi chạy lại —

```
FAILED tests/test_tokenfree_video.py::test_wrap_seedance_payload_rejects_ten_reference_images
        E  Failed: DID NOT RAISE <class 'app.services.media_ref_limits.ReferenceImageError'>
FAILED tests/test_tokenfree_video.py::test_wrap_seedance_payload_rejects_far_over_limit_reference_images
FAILED tests/test_tokenfree_video.py::test_wrap_seedance_payload_rejects_ten_first_frame_images_too
3 failed, 13 passed
```

Sau đó khôi phục lại code đã commit (`git checkout --`), chạy lại: **16 passed**. Không có
marker tạm nào sót lại.

### 2.3 Test cũ đã bị **xoá** vì nó mã hoá chính cái bug

`test_wrap_seedance_payload_caps_reference_images` assert **12 vào → 9 ra, không lỗi**. Chính
test đó giữ cho hành vi cắt âm thầm sống sót. Đã thay bằng bộ test ở 2.1.

---

## 3. Hai thứ phát hiện ngoài phạm vi brief

### 3.1 Kênh Ark native **hoàn toàn không có chốt chặn** — đã sửa

`prepare_video_create_body` chỉ bọc khi `uses_tokenfree_video()` đúng; ngoài đó trả body
nguyên trạng. Mà **漫剧分镜 đi qua `gen_video_seedance_body`** (`ark.py:1378`). Nên cùng một
request 10 ảnh:
trên TokenFree bị chặn, trên Ark native thì **gửi nguyên 10 ảnh đi**. Và danh mục drama
được dựng **không cap**: `build_seedance_reference_catalog`
(`drama/build_seedance_generate_body.py:301-307`) append **mọi** asset được tham chiếu vào
`catalog.images`, chỉ khử trùng theo `asset_id`, không giới hạn số lượng (rồi cộng thêm画风板
và尾帧). Nên >9 là **thật**, không phải giả định.

Đã thêm chốt chặn vào `ark.py:1396-1410`. Chạy **trước** khi resolve URL, có chủ ý: mỗi ảnh đều
gọi `ensure_seedance_compatible_image_url` (tải + đệm + upload OSS), làm việc đó cho một
request chắc chắn bị từ chối là lãng phí và có thể để lại file rác trên OSS. Đánh đổi: hai URL
sau này resolve về cùng một ảnh CDN sẽ bị đếm là 2 — **từ chối nhầm còn hơn cho qua nhầm**.

> Nằm trong `backend/**` và đúng cam kết của brief, nhưng **ngoài file brief nêu tên**. Ghi ra
> đây để board quyết, không phải tự mở rộng.

### 3.2 Frontend chưa có nhánh dịch cho thông điệp này — **CHƯA sửa, ngoài lane**

`frontend/src/lib/dramaGenError.ts:98` (`formatDramaGenError`) không có nhánh nào khớp lỗi
"quá số ảnh tham chiếu", và `looksLikeRootCause` (`:51`) khớp các mẫu Trung `参考图` mà thông
điệp tiếng Việt mới **không còn chứa**. Hệ quả: `pickRootDramaGenError` rơi xuống
`cleaned[0]`, tiêu đề hộp thoại rơi về câu chung "Tạo thất bại", và nội dung bị cắt ở 200 ký tự.

Nghĩa là: **backend đã nói đúng, nhưng UI chưa biết nói lại đẹp.** Cần một task riêng cho
`frontend/**` để thêm nhánh tiếng Việt này.

---

## 4. Những gì tôi **KHÔNG** làm được

1. **Không xác minh bằng trình duyệt thật.** AGENTS.md §8 bắt buộc `visual-audit.mjs` và xem ảnh
   chụp. Tôi **không chạy**: nó cần dev server ở `5173`, và bản thân nó đang có lỗi không tự thoát
   (mục 5). Trên 25 route có dữ liệu thật, số ký tự Trung còn sót **không đổi** so với nền
   trước — hành vi UI không đổi, chỉ thêm một nhánh lỗi. **Nhưng tôi đã không nhìn ảnh chụp**,
   nên không được tuyên bố đã kiểm chứng bằng mắt.

2. **Không sửa `visual-audit.mjs`** — xem mục 5. Brief **tự mâu thuẫn**: dòng 40 cấm sửa
   `frontend/**` và `scripts/visual-audit.mjs`, dòng 57-61 lại giao đúng file đó. Theo
   AGENTS.md §2 (file dùng chung → báo board, đừng tự sửa) và vì tôi **không gửi được tin nhắn
   board** (AGENTS.md §11 — tiến trình này bị từ chối với `Board messages cannot be sent to
   yourself`), tôi **không tự quyết**. Đây là chỗ cần board phân xử.

3. **Không sửa chuỗi lỗi**, vì chuỗi **không hỏng**. Brief mục 3 nói "nếu nó bị nuốt thì sửa cả
   chuỗi đó" — nó không bị nuốt, nên sửa là sửa không cần. Cụ thể là
   `executor.py:112` đang bọc `{ok:False}` thành `RuntimeError(err_text)`, khiến `error_code`
   **tụt** `ReferenceImageError` → `RuntimeError` và message bị tiền tố hai lần. Điều này
   **có sẵn và áp cho mọi loại lỗi**, không phải do thay đổi của tôi — tôi để nguyên thay vì
   refactor code dùng chung.

4. **Không đổi ngôn ngữ các message tiếng Trung sẵn có** trong `project_reference_images.py`.
   Repo đang lẫn hai ngôn ngữ: message mới của tôi là tiếng Việt (đúng như brief yêu cầu),
   còn các message cũ vẫn tiếng Trung. Đồng nhất hoá là việc chung của đợt Việt hoá, không
   thuộc lượt này.

5. **Không chạm `git push` / `stash` / `rebase` / `reset --hard`.** Để chứng minh test bắt được
   bug (§2.2) tôi tạm sửa file rồi `git checkout --` về đúng commit đã lưu — không mất gì.

6. **Baseline của brief là 936 passed; tôi đo được 947** (xem mục 6). Không tự dịch nghĩa là đạt.

---

## 5. `visual-audit.mjs` không tự thoát — chẩn đoán (để người được giao sửa)

Tôi **không sửa**, nhưng đã đọc và tìm ra nguyên nhân chính xác:

- `main()` kết thúc ở `report(results)` — `visual-audit.mjs:563` — rồi **không `process.exit`**,
  không đóng socket CDP còn treo.
- Việc xoá khoá `.kilo/audit.lock` nằm trong `process.on('exit', ...)` — `:171-173`.
  Node chỉ bắn `exit` khi event loop **rỗng**. Nếu còn handle sống (socket CDP, tiến trình con
  Edge đã spawn ở `:532`), `main()` resolve xong nhưng tiến trình **đứng yên vĩnh viễn** →
  khoá không bao giờ được giải phóng.
- Lượt sau đọc khoá thấy pid còn sống → `lockHeldByOther()` `:151` trả pid → `:162` **throw**
  `Da co audit khac dang chay`, và mọi lượt sau đều bị từ chối cho tới khi ai đó kill tay.
- Giết nó từ bên ngoài thì `finally` ở `:550-560` không chạy, **cả cây Edge** của lô đó lọt lại
  (đúng triệu chứng "rò 20 tiến trình Edge" bunny/2 báo).

**Sửa một dòng:** ngay sau `report(results)` ở `:563`, đóng nốt handle rồi `process.exit(0)` —
để `process.on('exit')` được bắn và khoá được nhả.

> **Chưa kiểm chứng bằng chạy thật** — tôi không chạy `visual-audit.mjs`, nên đây là đọc code,
> không phải quan sát. Cần một lượt chạy để xác nhận tiến trình thoát và khoá được nhả.

---

## 6. Kiểm tra

### Backend — chạy **hai lần liên tiếp**, giống hệt nhau

```
.\.venv\Scripts\python.exe -m pytest -q --no-header --basetemp=..\.kilo\pytest
```

| Lượt | Kết quả |
|---|---|
| run 1 | `4 failed, 947 passed, 1 skipped` in 52.48s |
| run 2 | `4 failed, 947 passed, 1 skipped` in 53.05s |

4 lỗi failed **đúng y hệt** danh sách upstream ghi sẵn trong brief, không lỗi nào lạ:

- `test_fragment_video_estimate.py::test_fragment_video_estimate_720p_doubles_480p`
- `test_kepu_phase_billing.py::test_videos_estimate_hd_doubles_480p_preview`
- `test_kepu_phase_billing.py::test_shot_regen_video_estimate_uses_project_hd`
- `test_kepu_shot_edit_demote.py::test_narration_edit_invalidates_continuous_audio`

**947 = 936 (nền của brief) + 11 test mới.** Vượt ngưỡng "không quá 936 passed" là vì tôi
**thêm** test, không phải vì hỏng. Không đụng 4 lỗi upstream.

### Môi trường — lưu ý cho lane sau

- Lane này **không có `backend/.venv`**; tôi tạo mới và cài `requirements-dev.txt`.
  Cài với `--no-cache-dir` + cache/temp trong worktree vì **cache pip dùng chung bị khoá**
  (`PermissionError` trên `...\pip\cache\wheels\...\oss2-*.whl`) — trông như lỗi code nhưng
  là vấn đề thư mục tạm, giống cảnh báo `--basetemp` trong AGENTS.md.
- `.env` của lane trỏ `15432` (docker dùng chung, **đang tắt**). Tôi **không sửa `.env`** và
  **không bật docker**; chạy test với biến môi trường trỏ `5432` (Postgres local theo AGENTS.md §7).
  Không test nào đụng hạ tầng của lane khác. Nếu lane sau thấy lỗi
  `ConnectionRefusedError` ở `tests/test_project_reference_images.py`, đó là **vì DB**, không
  phải vì code.

### Dọn dẹp

Đã xoá `.kilo/pytest*`, `backend/.kilo/pip-*` (thư mục tạm của tôi). Không có `edge-*` nào để
dọn trong lane này. `git status` sạch, không có file rác được commit.

---

## 7. File đã đụng

| File | Việc |
|---|---|
| `backend/app/services/media_ref_limits.py` | Chuyển `ReferenceImageError` vào đây; thêm `dedupe_reference_urls`, `ensure_within_reference_image_limit` |
| `backend/app/services/project_reference_images.py` | Re-export `ReferenceImageError` (thay đổi hành vi: **không**) |
| `backend/app/services/tokenfree_video.py` | **Cốt lõi**: `break` cắt âm thầm → `ensure_within_reference_image_limit` |
| `backend/app/services/ark.py` | Thêm chốt chặn cho kênh Ark native (§3.1) |
| `backend/tests/test_tokenfree_video.py` | +8 test, xoá 1 test mã hoá bug |
| `backend/tests/test_reference_image_limit_reaches_user.py` | Mới, 3 test chuỗi lỗi |

---

## 8. Việc cần board giao tiếp

1. **`visual-audit.mjs` không tự thoát** (§5) — cần quyết định: sửa ở lane nào. Tôi không tự
   sửa vì brief mâu thuẫn với chính nó và AGENTS.md §2 cấm tự đụng file dùng chung.
2. **`dramaGenError.ts` chưa có nhánh tiếng Việt** cho lỗi này (§3.2) — `frontend/**`.
3. **Chốt chặn Ark native** (§3.1) đã nằm ngoài file brief nêu tên — xác nhận hoặc yêu cầu rút lại.
4. **`executor.py:112` làm `error_code` tụt** (§4.3) — lỗi có sẵn, áp cho mọi loại lỗi.