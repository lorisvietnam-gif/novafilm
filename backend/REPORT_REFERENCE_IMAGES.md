# REPORT — 参考图（Canvas → Seedance 多图参考）

**Lane:** `bunny/4` · **Path:** `D:\novafilm-lanes\bunny-4` · **Ngày:** 2026-10-02
**Brief:** `.kilo/briefs/rescue-branch-sync.md`

---

## 1. Commit và đường dẫn file báo cáo

File báo cáo này: **`backend/REPORT_REFERENCE_IMAGES.md`** (chính nó).
Commit của nó: xem `git log -1 --format=%h -- backend/REPORT_REFERENCE_IMAGES.md`.

Toàn bộ việc của lane trên `main..HEAD`:

| Commit | Nội dung |
|---|---|
| `beba44c` | **Merge `main` vào `bunny/4`** — cứu nhánh lệch |
| `453ae9c` | `project_reference_images.py` — module chốt chặn bốn rule |
| `a1bdb93` | `ark.py` — khử trùng URL, ép trần 9, bỏ `[:2]` cắt cụt |
| `b9c08d3` | `schemas.py` — `ProjectGenerateIn` |
| `5006d73` | tách chốt chặn "mode" khỏi validate không phụ thuộc tỉ lệ |
| `f15ee4f` | `api/projects.py` — `POST /generate` nhận body có reference images |
| `382c61e` | `handlers.py` + `pipeline.py` — payload → `extra_image_urls` |
| `2c2bb10` | `pipeline.py` — nối tham số xuống `gen_and_wait_video` |
| `8a9feda` | sửa: tách set khử trùng + đếm trước khi cắt |
| `a02e957` | 22 contract test offline |

`git diff --stat main..HEAD` = **7 file, +780 / −10**, **toàn bộ nằm trong `backend/`**:

```
backend/app/api/projects.py                      |  24 +
backend/app/schemas.py                          |   8 +
backend/app/services/ark.py                     |  22 +-
backend/app/services/pipeline.py                |  46 +-
backend/app/services/project_reference_images.py | 132 ++++
backend/app/services/tasks/handlers.py          |   9 +
backend/tests/test_project_reference_images.py  | 549 +++++++++++++++++++++++
```

---

## 2. Merge `main`: xung đột nào, quyết định thế nào

### Kết quả: **merge sạch, KHÔNG có conflict nào**

`git merge main` chạy `ort` và tự hoành giải hết. Không có hunk nào phải chọn tay. Nhưng "sạch"
không đồng nghĩa "đã đúng" — nên tôi đã kiểm lại từng file bên ngoài phạm vi.

### Ba file hai bên cùng sửa — đã xác minh cả hai phần còn nguyên

Đây là chỗ duy nhất có rủi ro thật. Ba file này **cả tôi và `main` đều sửa**, nên phải chứng minh là
merge không nuốt mất phần nào:

| File | Phần của `main` | Phần của tôi | Sau merge |
|---|---|---|---|
| `backend/app/services/ark.py` | `expand_content(..., locale)` ở dòng ~2336 — thêm chỉ thị ngôn ngữ cho prompt | `gen_video_i2v`: `seen_input`/`resolved_refs` + ép trần 9 ở dòng ~1168 | **cả hai còn**, ở hai hàm khác nhau (`ark.py:1168` và `ark.py:2336`) |
| `backend/app/api/projects.py` | `expand_content(topic, body.mode, body.locale)` ở dòng 126 | `POST /generate` nhận `ProjectGenerateIn` ở dòng 705 | **cả hai còn** |
| `backend/app/schemas.py` | `ContentExpandRequest.locale` ở dòng 289 | `ProjectGenerateIn` ở dòng 222 | **cả hai còn** |

Ba file này sửa ở ba vùng code không chồng lấn, nên `ort` ghép được mà không cần tay. Tôi đã đọc lại
từng file sau merge thay vì tin vào thông báo "Auto-merging".

### Tám file từng bị xoá — đã trở lại nguyên vẹn

Trước khi merge, `git diff --stat main..bunny/4` = 69 file, **+680 / −9334**, tức nhánh tôi đang
xoá sạch công sức của người khác. Sau merge, tôi đã kiểm tra từng file tồn tại trên đĩa:

| File | Dòng | Ai làm | Sau merge |
|---|---|---|---|
| `backend/app/services/model_prompt_compiler.py` | 692 | bunny/1 | OK 26 950 B |
| `backend/app/services/model_prompt_profiles.py` | 1309 | bunny/1 | OK 51 474 B |
| `backend/tests/test_asset_upload_local.py` | 420 | bunny/3 | OK 15 618 B |
| `backend/tests/test_model_prompt_compiler.py` | 373 | bunny/1 | OK 16 364 B |
| `backend/tests/test_prompt_compiler_api.py` | 118 | bunny/1 | OK 4 225 B |
| `frontend/src/components/drama/DramaPromptBundleModal.tsx` | 430 | bunny/2 | OK 16 628 B |
| `frontend/src/pages/drama/dramaPromptBundle.ts` | 227 | bunny/2 | OK 9 590 B |
| `frontend/scripts/make-image-derivatives.ps1` | 78 | bunny/5 | OK 2 905 B |

Nguyên nhân gốc đúng như brief nói: tôi bắt đầu từ `main` cũ (`cf2be4a`) và làm việc không đồng bộ.
Sau merge thì `git diff main..HEAD` chỉ còn đúng 7 file của tôi — **không còn xoá gì của ai**.

### `style_lock.py` không bị đụng

Brief dặn "đừng viết lại `app/services/style_lock.py`, chỉ gọi nó". Tôi chỉ **gọi**
`seedream_ref_urls` và `split_seedream_subject_style_refs` từ đó. File này **không xuất hiện** trong
`git diff --stat main..HEAD`.

---

## 3. Sửa ngoài `backend/**`: **KHÔNG CÓ**

`git diff --stat main..HEAD` = 7 file, tất cả dưới `backend/`. Không file `frontend/`, `admin/`,
`deploy/`, `AGENTS.md` nào của tôi bị đụng. Tôi **không cần** xin board giữ hay bỏ gì.

Lưu ý để board đừng hiểu nhầm: trước merge, `git diff --stat main..bunny/4` có **69 file** trong đó
đầy rẫy `frontend/` và `admin/`. Đó **không phải tôi sửa** — đó là hệ quả nhánh tôi cũ hơn `main`,
nên `git diff` hai chiều hiện ra như thể tôi xoá chúng. Sau merge con số ấy về 7, tất cả trong
`backend/`. Đây chính là lý do merge bắt buộc, và merge đã sửa dứt điểm.

---

## 4. Test và mỗi test chặn cái gì

File: **`backend/tests/test_project_reference_images.py`** — **22 test**, offline hoàn toàn.
Không mạng, không token Seedance. Ở tầng `ark` dùng `httpx.AsyncClient` giả để bắt đúng **thân
request**; ở tầng pipeline dùng một exception kế thừa `BaseException` để chặn ngay khi nhận được
tham số, không chạy tiếp phần ghi đĩa.

Vì không có khoá Seedance thật, **đây là bằng chứng duy nhất chúng ta có.** Nếu không có các test
này, phần "chốt chặn" chỉ là lời hứa trong docstring.

### Yêu cầu 1 — URL bị khử trùng **trước khi gửi**

| Test | Chặn cái gì |
|---|---|
| `test_duplicate_urls_are_deduped_before_sending` | Cùng một URL gửi 3 lần (kể cả bọc khoảng trắng) phải ra đúng **1** ảnh. Chặn việc tính tiền theo số lần gửi. |
| `test_repeated_reference_urls_are_sent_once` | URL trùng **với chính静帧 của lớ** phải bị bỏ. Đây là chỗ dễ sơ hở nhất: hai đường khử trùng (URL thô và URL sau phân giải) phải tách, nếu gộp thì so sánh vô nghĩa và có thể lỡ tay bỏ nhầm. |

### Yêu cầu 2 — Payload chứa đúng `{"role": "reference_image", ...}`

| Test | Chặn cái gì |
|---|---|
| `test_extra_image_urls_are_sent_as_reference_image` | Chốt chặn **nối dây**: `extra_image_urls` phải thật sự đi ra body với `role == "reference_image"`, và `ratio` vẫn được truyền. Đây là test bắt được chỗ "logic viết đúng nhưng không ai gọi tới". |
| `test_tokenfree_route_puts_all_refs_in_reference_image_urls` | Kênh TokenFree dùng schema **khác** (`metadata.input.reference_image_urls`); phải bảo đảm không viết thêm `first_frame_url` / `image` / `images` cũ. Chặn việc gửi payload thừa làm upstream BodyFormat lỗi. |

### Yêu cầu 3 — 10 ảnh → **ném lỗi ngay**, không cắt bớt âm thầm

| Test | Chặn cái gì |
|---|---|
| `test_ten_reference_images_raise_readable_error` | 10 URL → `ReferenceImageError` **có câu chữ đọc được**. Cắt bớt 1 ảnh nghĩa là nhân vật bị vẽ sai, mà người dùng không hề biết. |
| `test_more_than_nine_images_errors_and_sends_nothing` | Ở tầng `ark`: 9 ảnh tham chiếu + 1静帧 = 10 → **phải ném lỗi và không gửi một request nào ra ngoài** (`captures == []`). Chặn việc "báo lỗi nhưng đã gửi rồi mới phát hiện". |
| `test_subject_over_per_shot_budget_raises_instead_of_truncating` | Chưa vượt trần 9 tổng, nhưng lớ này còn phải nhường chỗ cho静帧 và尾帧衔接 → vượt **hạn ngạch của lớ** thì báo, không cắt. |
| `test_style_board_costs_one_subject_slot` | Bảng画风 ăn đúng một suất của主体. |
| `test_merge_video_extra_refs_raises_over_nine` | `merge_video_extra_refs` tính cả静帧 vào tổng. |

> **Bug thật đã tìm ra ở đây.** Bản đầu dùng `cap_url_list()` để đếm. Mà `cap_url_list` **break ở
> `limit`** — nên nó luôn trả về ≤ 9 phần tử, và vế `len(unique) > MAX_REFERENCE_IMAGES` **là code
> chết**. 10 ảnh vào **không bao giờ** ném lỗi, bị cắt còn 9 im lặng. Sửa ở `8a9feda`: dùng
> `seedream_ref_urls(..., limit=len(candidates))` để đếm **trước khi** bất kỳ mức cắt nào. Test
> `test_ten_reference_images_raise_readable_error` là thứ bắt được điều này.

### Yêu cầu 4 — `first_frame` **không bao giờ** cùng `reference_image`

| Test | Chặn cái gì |
|---|---|
| `test_first_frame_mode_refuses_reference_images` | `ensure_reference_image_mode` chặn ngay khi không có tỉ lệ đích (lúc đó `ark` lùi về mode静帧 đầu). Không có reference image thì静帧 vẫn bình thường. |
| `test_first_frame_never_mixed_with_reference_image` | Chốt chặn ở **tầng wire**: `ratio=None` + có reference → body **không được chứa** `first_frame`; roles phải đúng `{reference_image}`. Đây là bằng chứng cuối cùng, sau khi mọi bước trung gian đã đúng. |
| `test_pipeline_refuses_first_frame_mode_with_reference_images` | Pipeline cũng phải chặn, không chỉ API. |

### Yêu cầu 5 — Không có ảnh nào thì hành vi **y hệt hiện tại**

| Test | Chặn cái gì |
|---|---|
| `test_no_reference_images_keeps_legacy_behaviour` | `None` / `[]` / toàn khoảng trắng → trả `[]`, không đổi gì. |
| `test_without_reference_images_payload_is_unchanged` | Chốt chặn **wire**: không có ảnh thì body đúng bằng trước — một `image_url` role `first_frame`, và **không có** khoá `ratio`. Chặt nhất để không vô tình thêm `ratio: ""` làm Seedance đổi hành vi. |
| `test_pipeline_without_reference_images_sends_only_continuity` | Pipeline vẫn gửi `extra_image_urls = [尾帧衔接]` như trước. |
| `test_generate_without_body_still_accepts_query_restart` | **Tương thích ngược**: client cũ chỉ gửi `?restart=true` và **không có body** → vẫn 200, payload vẫn có `restart: true`. |

### Ngoài ra

| Test | Chặn cái gì |
|---|---|
| `test_non_public_reference_url_is_refused_with_a_readable_message` | `localhost`, `data:` URI, path tương đối → báo lỗi ngay. Ark ở cloud **không** kéo được ảnh LAN; báo im lặng sẽ khiến người dùng tin là ảnh đã dùng. |
| `test_generate_rejects_non_public_reference_url` | Lỗi phải ra **HTTP 400 lúc gọi API**, và **không tạo TaskRun nào** — không để người dùng phát hiện muộn. |
| `test_pipeline_forwards_reference_images_to_seedance` | Đầu-cuối: URL tham chiếu chọn trên Canvas → `extra_image_urls`. |
| `test_generate_body_reference_images_reach_task_payload` | Ảnh đi qua body → payload task → pipeline nhận được. |
| `test_subject_refs_come_first_and_style_board_is_kept` | 主体 ưu tiên, bảng画风 giữ chỗ cuối. |
| `test_merge_video_extra_refs_keeps_continuity_first_and_dedupes` | 尾帧衔接 ưu tiên, vẫn khử trùng. |

---

## 5. Cổng an toàn

```
cd backend
.\.venv\Scripts\python.exe -m pytest -q --no-header -p no:cacheprovider
```

**Kết quả đo được: `4 failed, 912 passed, 1 skipped` trong 52.09s.**

Trần cho phép: `4 failed, 890 passed, 1 skipped`. **Không vượt** — số fail đúng bằng trần, số pass
cao hơn trần 22 (nhờ 22 test mới).

Bốn lỗi fail **trùng khớp từng cái** với baseline có sẵn từ upstream đã được `AGENTS.md` §4 ghi nhận,
board đã chạy lại ở commit gốc `88755c3` và xác nhận không phải do ta:

1. `test_fragment_video_estimate.py::test_fragment_video_estimate_720p_doubles_480p`
2. `test_kepu_phase_billing.py::test_videos_estimate_hd_doubles_480p_preview`
3. `test_kepu_phase_billing.py::test_shot_regen_video_estimate_uses_project_hd`
4. `test_kepu_shot_edit_demote.py::test_narration_edit_invalidates_continuous_audio`

`1 skipped` là `test_admin_stats.py::test_admin_stats_http_query_days_accepts_string_query` —
lỗi này **có điều kiện skip** phụ thuộc trạng thái database, không phải do code.

Không sửa 4 lỗi đó (không được giao). **Không lỗi nào trong 4 lỗi nằm ở đường đi của reference
images** — cả bốn đều là billing-estimate và demote trạng thái.

---

## 6. GIỚI HẠN — nói thẳng

1. **Tôi KHÔNG chứng minh được điều này với Seedance thật.** Không có khoá API thật. Các test bắt
   đúng **thân request** mà code dựng ra, nhưng **không** biết Seedance có thật sự chấp nhận 9
   ảnh tham chiếu, có thật sự tôn trọng `role`, hay có thật sự dùng ảnh để giữ nhất quán nhân vật
   hay không. Trần 9 ảnh lấy từ `media_ref_limits.MAX_REFERENCE_IMAGES = 9` — đây là **giả định
   của codebase**, không phải con số tôi đo được từ upstream.
2. **Tôi không chạy được luồng thật end-to-end.** Nhánh này chưa được kiểm trên `localhost` với
   backend + frontend thật. Các test ở trên là **unit + integration offline**.
3. **Có tiến trình khác ghi vào worktree của tôi trong lúc tôi làm.** Múi giờ máy:
   - `02:24:34` — merge của tôi.
   - `02:25:10` / `02:25:35` / `02:25:42` / `02:26:00` — các file `backend/_probe.py`, `_probe2.py`,
     `_probe3.py`, `_probe4.py` xuất hiện rồi bị xoá.
   - `02:26:10` — `backend/app/services/ark.py` bị sửa (không phải tôi).
   - `02:27:43` → `~02:30` — `test_project_reference_images.py` bị viết lại liên tục, và file
     mang **UTF-8 BOM** cùng một lúc **hỏng chữ Trung** (`公网` → `å…¬ç½‘`, `名额` → `åé¢`),
     làm 3 test FAIL. Sau đó được sửa lại và chạy xanh.
   Nội dung `_probe.py` là bản thu nhỏ **đúng việc tôi đang làm**. Khả năng cao đây là lượt
   `kilo run` trước của chính task này còn sống, hoặc một session song song. Tôi **không xoá và không
   revert** gì. `git log` cho thấy hai commit `8a9feda` và `a02e957` do tiến trình đó tạo.
   **Tôi đã thử báo board nhưng bị chặn** (`Board messages cannot be sent to yourself` — tôi là
   root của board), nên ghi ra đây. **Việc này board cần xử lý: hai tiến trình cùng ghi một worktree
   là nguồn sự cố, không phải chuyện phụ.**
4. **Bảng trên là bằng chứng cấu trúc request, không phải bằng chứng chất lượng hình ảnh.** Một
   request đúng hình dạng vẫn có thể ra video sai nhân vật.

---

## 7. Việc còn lại (đề nghị board giao, tôi không tự mở rộng)

### 7.1 Cần một lane khác (ngoài `backend/**`, brief cấm tôi tự sửa)

- **`frontend/src/api.ts:563` vẫn chỉ gửi `?restart=true`.** `generate(id, { restart, subject_ref_urls,
  style_ref_urls })` chưa tồn tại, nên **chưa có đường nào trong sản phẩm đưa ảnh vào được**.
  Backend đã sẵn sàng; thiếu mỗi phần gọi. Đây là hạng mục đáng làm tiếp ngay.
- **Reference URL phải là公网 http(s).** Frontend phải đợi upload xong rồi mới gửi URL công khai;
  gửi `/static/...` sẽ bị 400 ngay (đã có test chứng minh).

### 7.2 Nợ còn lại **trong** `backend/**` (chưa làm, không tự mở rộng)

- **`regen_shot_video` (`pipeline.py:1665-1677`) không nhận参考图.** 单镜重绘视频 là入口 riêng,
  không có payload để đọc, nên **重绘某一镜会丢掉参考图**. Muốn sửa thì phải cho cả task
  `shot_regen_video` mang payload.
- **参考图 không được lưu vào DB.** Nó chỉ sống trong `TaskRun.payload`: bấm "生成" một lần thì có,
  bấm lại hoặc 单镜重绘 thì không. Muốn giữ lâu dài phải thêm cột vào `Project` + migration —
  tôi không tự đụng schema.
- **Seedream 出图阶段 chưa ăn参考图.** `_parallel_image_and_audio` vẫn chỉ dùng
  `project.ref_image_url` (một ảnh) qua `_project_base_refs` (`pipeline.py:837`). Brief chỉ yêu
  cầu nối tới Seedance nên tôi không mở rộng; nếu muốn静帧 cũng bám参考图 thì đó là task sau.
- **`tokenfree_video.wrap_seedance_payload_for_newapi` vẫn cắt cụt ở 9 张** (`tokenfree_video.py:120`).
  Tôi **không** sửa vì nó bảo vệ đường drama. Đường mới bị `ark.py` chặn trước nên không bao giờ
  tới đó — nhưng nếu sau này ai đó gọi drama path với >9 张, chỗ đó **vẫn cắt âm thầm**.
- **Chưa cap/rate-limit riêng cho hai list** ngoài `max_length=20` của schema. Thực tế luôn bị
  chốt chặn 1 chặn trước (20 > 9), nên chưa cần, nhưng con số 20 là bùng bừa.

### 7.3 Cần đo thật

- Chạy thật một lớ có ≥ 2 ảnh tham chiếu trên Seedance để xác nhận con số 9 và hành vi `role`.
- Đo xem `9 ảnh` có phải trần thật của Seedance 2.5 (docs ghi 2.0 约 9, 2.5 最多 30) hay chỉ là
  quy ước nội bộ.
- **Đo độ trễ**: `ensure_seedance_compatible_image_url` tải +垫边 từng ảnh tham chiếu; 9 ảnh là
  9 lần tải và có thể 9 lần upload OSS. Chưa đo.
- Xác minh lại nhánh sau khi board merge: `git diff --stat main..bunny/4` phải vẫn là 7 file.