# BÁO CÁO — Nối ảnh tham chiếu từ Canvas tới Seedance (phần BACKEND)

Worktree `D:\novafilm-lanes\bunny-4`, branch `bunny/4`.
Phạm vi: **chỉ `backend/**`**. `frontend/**`, `admin/**`, `styles/**` không bị đụng.

---

## 1. Chuỗi đã nối (đầu → giữa → cuối)

```
POST /api/projects/{id}/generate            app/api/projects.py:703
  body: ProjectGenerateIn | None = None      app/schemas.py:222
  ├─ resolve_project_reference_images(...)   app/services/project_reference_images.py:80
  └─ payload{subject_ref_urls, style_ref_urls}  app/api/projects.py:783
        ↓
TaskRun.payload → handler                    app/services/tasks/handlers.py:150
  run_pipeline(..., subject_ref_urls=, style_ref_urls=)
        ↓
pipeline._parallel_videos                   app/services/pipeline.py:1154-1156
  ratio = _project_output_ratio(project) or cfg.ark_video_ratio   ← 画幅在这里才确定
  ensure_reference_image_mode(ratio, has_reference=...)  project_reference_images.py:65
  merge_video_extra_refs(上一镜尾帧, 用户参考图)           pipeline.py:1365
        ↓
ark.gen_and_wait_video(extra_image_urls=...) pipeline.py:1261
        ↓
ArkGateway.gen_video_i2v(extra_image_urls)  app/services/ark.py:1143
```

### Nối vào đúng tham số nào của `ark.py`

| Chỗ | Dòng | Ghi chú |
|---|---|---|
| `gen_video_i2v(..., extra_image_urls: list[str] \| None = None)` | `ark.py:1143` | tham số **đã có sẵn**, không thêm tham số mới |
| `gen_and_wait_video(..., extra_image_urls)` → truyền xuống | `ark.py:1670` | đã có sẵn |
| dựng `{"role": "reference_image", ...}` | `ark.py:1203` (`for extra in extra_refs:`) | **đã có sẵn** |

Nói rõ: phần sâu nhất **không phải do tôi viết** — `extra_image_urls` và role
`reference_image` đã nằm sẵn trong `ark.py`. Tôi chỉ vá hai chỗ đứt mà brief chỉ ra
(đầu không có chỗ nhận, giữa không ai gửi), cộng thêm ba chốt chặn còn thiếu.

### Gọi hàm sẵn có, không viết lại
```python
from app.services.style_lock import split_seedream_subject_style_refs   # style_lock.py:240
subject_refs, style_refs = split_seedream_subject_style_refs(subjects, styles, max_total=9)
```
`app/services/style_lock.py` **không bị sửa một dòng** (brief cấm đúng vậy). Số 9 张 lấy từ
`app/services/media_ref_limits.py:6` (`MAX_REFERENCE_IMAGES`), cũng không sửa.

---

## 2. Ba chốt chặn phải SỬA, vì code cũ chưa chặn đúng

Đây là phần brief ghi là "quan trọng nhất", và đo được code cũ **chưa chặn**:

1. **`ark.py:1187` cũ là `for extra in extra_refs[:2]:`** — cắt bớt âm thầm 2 张.
   Người dùng chọn 5 张参考图 thì chỉ 2 张 đi, không ai báo gì, nhân vật sai âm thầm.
   → Đổi thành `for extra in extra_refs:` + chốt chặn 9 张 bằng **raise** (`ark.py:1185-1189`).
2. **Không khử trùng.** Cùng một URL gửi 5 lần thì upstream đếm 5 张 và chạm trần
   (chính `tokenfree_video.py:75` đã ghi lại điều này). → Khử trùng ở `ark.py:1165-1184`.
   Lưu ý kỹ thuật: phải **tách 2 bộ** — `seen_input` (URL người dùng gửi) và
   `resolved_refs` (URL sau khi `_resolve_image_ref` chuyển về CDN, cộng cả静帧 `image_ref`).
   Test đã bắt được lỗi này: dùng chung một bộ thì mọi ảnh đều bị tự khử.
3. **Không có chốt chặn nào ở tầng pipeline**: `_parallel_videos` chỉ gom
   `video_extra_refs_for_shot(prev_proxy)` (tối đa 1 张) nên không bao giờ chạm trần,
   cũng nghĩa là nhánh first_frame/reference chưa ai canh. → Thêm
   `ensure_reference_image_mode` + `merge_video_extra_refs`.

### Bốn chốt chặn, và chỗ nó chặn
| # | Quy tắc | Chặn ở đâu | Hành vi khi vi phạm |
|---|---|---|---|
| 1 | 单次最多 9 张参考图 | `project_reference_images.py:96` + `ark.py:1186` | `ReferenceImageError` → HTTP 400 ở API; `RuntimeError` ở tầng transport |
| 2 | `first_frame` 与 `reference_image` 不混发 | `project_reference_images.py:65` (mode) + `ark.py:1190-1192` (role) | 报错，或整批图全变 `reference_image` |
| 3 | 重复 URL 必须去重 | `project_reference_images.py:98` + `ark.py:1165-1184` | 去重后照发，不重复计张 |
| 4 | first_frame 模式下带参考图要 rẽ nhánh | `project_reference_images.py:65-78` | 报错，不静默丢图也不混发 |

**名额计算（chốt chặn 1 的细化，比 9 张更严）.** 上限 9 张是**整个请求**的图数，不只是用户传的。
本镜静帧（`content[1]`）永远占 1 张，上一镜尾帧占 1 张，画风板占 1 张：
`reference_image_budget()` = 9 − 静帧 − 尾帧 − 画风板 = **7 张主体图（无画风板）/ 6 张（有画风板）**。
超了这个数同样报错，不截断 —— 因为截断就是"少发一张角色图，角色就画错"。

### 一处我比 brief 更严的地方（请复核）
`seedream_ref_urls` 原本会**静默丢弃** localhost / `data:` URI / 私网 URL。我改成**报错**：
Ark 云端本来就拉不到这些图，静默丢等于骗用户"这张已经用上了"。如果前端将来会传本地
`/static/...` 路径，这里会直接 400 —— 那种情况应该先上传再传公网地址。这条是刻意的，
不是疏忽。

---

## 3. Test đã viết — `backend/tests/test_project_reference_images.py` (22 个, 全离线)

| Test | Chặn cái gì |
|---|---|
| `test_no_reference_images_keeps_legacy_behaviour` | 没有参考图 → 空列表，老流程不变 |
| `test_subject_refs_come_first_and_style_board_is_kept` | 主体优先 + 画风板占位（没重写 `style_lock` 的分流） |
| `test_duplicate_urls_are_deduped_before_sending` | 同一 URL 发 3 次只算 1 张 |
| `test_ten_reference_images_raise_readable_error` | **10 张 → 报错**，不截断成 9；文案含数量与上限 |
| `test_subject_over_per_shot_budget_raises_instead_of_truncating` | 没破 9 张总上限但超本镜名额 → 仍报错 |
| `test_style_board_costs_one_subject_slot` | 画风板吃掉 1 个主体名额，且画风板排最后 |
| `test_non_public_reference_url_is_refused_with_a_readable_message` | localhost / data URI / 本地路径 → 报错 |
| `test_first_frame_mode_refuses_reference_images` | **first_frame 与参考图互斥**；`None`/空画幅报错，`9:16` 放行 |
| `test_merge_video_extra_refs_keeps_continuity_first_and_dedupes` | 衔接尾帧优先、跨列表去重 |
| `test_merge_video_extra_refs_raises_over_nine` | 含静帧合计 10 张 → 报错 |
| `test_extra_image_urls_are_sent_as_reference_image` | **`extra_image_urls` 真的以 `role=reference_image` 进提交体** |
| `test_first_frame_never_mixed_with_reference_image` | 无画幅 + 有参考图时，提交体里**不出现** `first_frame` |
| `test_tokenfree_route_puts_all_refs_in_reference_image_urls` | TokenFree 通道只写 `reference_image_urls`，无顶层 `image`/`first_frame_url` |
| `test_more_than_nine_images_errors_and_sends_nothing` | **合计 10 张时一个 HTTP 请求都不发** |
| `test_repeated_reference_urls_are_sent_once` | 重复 URL + 撞静帧的 URL 只发一次 |
| `test_without_reference_images_payload_is_unchanged` | 没有参考图 → 单图 + `first_frame` + 无 `ratio`，与接入前逐字一致 |
| `test_pipeline_forwards_reference_images_to_seedance` | 端到端：`[尾帧, 主体…, 画风板]` 进 `extra_image_urls` |
| `test_pipeline_without_reference_images_sends_only_continuity` | 老流程：仍只带上一镜尾帧 |
| `test_pipeline_refuses_first_frame_mode_with_reference_images` | 画幅为空时带参考图 → 流水线报错，**不提交上游** |
| `test_generate_without_body_still_accepts_query_restart` | **向后兼容**：`?restart=true` 不带 body 仍 200 |
| `test_generate_body_reference_images_reach_task_payload` | body 里的参考图真的落到 `TaskRun.payload` |
| `test_generate_rejects_non_public_reference_url` | 不可公网 URL → 400，且**不建任务** |

全部离线：ark 层用假 `httpx.AsyncClient` 抓提交体，宽高比垫边被打桩（不下真图）；
流水线层用 `BaseException` 哨兵在拿到调用参数后立刻中止；DB 用仓库自带的 `db_session` fixture。

### Kết quả đo
```
pytest -q  →  4 failed, 912 passed, 1 skipped      (chạy 2 lần liên tiếp, kết quả y hệt)
4 failed = 4 lỗi có sẵn từ upstream, đúng tên AGENTS.md liệt kê, không do thay đổi này:
  test_fragment_video_estimate.py::test_fragment_video_estimate_720p_doubles_480p
  test_kepu_phase_billing.py::test_videos_estimate_hd_doubles_480p_preview
  test_kepu_phase_billing.py::test_shot_regen_video_estimate_uses_project_hd
  test_kepu_shot_edit_demote.py::test_narration_edit_invalidates_continuous_audio
```
Cả hai lượt đều chạy **sau** khi đã đổi code, không có lượt nào vượt quá 4 failed.

---

## 4. Commit

| Commit | Nội dung |
|---|---|
| `453ae9c` | 新增 `app/services/project_reference_images.py` |
| `a1bdb93` | `ark.py`: 9 张上限 + 去重 + 去掉 `[:2]` 静默截断 |
| `b9c08d3` | `schemas.py`: 新增 `ProjectGenerateIn` |
| `f15ee4f` | `api/projects.py`: endpoint 收 body（老调用仍可用） |
| `382c61e` | `tasks/handlers.py`: payload → pipeline |
| `2c2bb10` | `pipeline.py`: 参考图接进视频阶段 |
| `8a9feda` | 修 ark 去重集合混用；`seedream_ref_urls` 计数不被截断 |
| `a02e957` | `tests/test_project_reference_images.py`（22 test） |

HEAD sau báo cáo này: xem `git log -1`. Báo cáo: `backend/REPORT_REFERENCE_IMAGES.md`.

---

## 5. GIỚI HẠN — những gì tôi KHÔNG chứng minh được

Nói thẳng, không đẹp bề ngoài:

1. **Chưa chạy Seedance thật một lần.** Không có API key. Những gì test offline **không** bảo chứng:
   - Seedance/TokenFree có thật sự nhận 9 张 `reference_image` không, hay có trần thấp hơn
     (docs ghi Seedance 2.0 约 9 张、2.5 最多 30 张 — tôi lấy 9 là số chặt nhất, đúng brief).
   - 送 `reference_image` 时角色一致性到底有没有真的变好（这是"金矿"的核心收益，**没测过**）。
   - 推/拉/摇 mix 8 张参考图时,Seedance 会不会更慢、更多 `SensitiveContentDetected`。
   - 宽高比:参考图过多时上游是否还会按静帧比例输出。`ensure_seedance_compatible_image_url`
     会给每张参考图垫边上传 OSS，**9 张就是 9 次下载 + 可能的 9 次上传**，我没测过耗时。
2. **Chưa mở app thật ở localhost** (AGENTS.md mục 7 yêu cầu). Thay đổi nằm ở backend và
   frontend **chưa gửi** field mới, nên không có giao diện nào đổi hành vi; nhưng tôi vẫn
   **không** coi là đã kiểm chứng thị giác.
3. **Chưa đo độ trễ thực tế** của việc thêm 7 张参考图 vào mỗi request.
4. `tokenfree_video.wrap_seedance_payload_for_newapi` vẫn còn `MAX_REFERENCE_IMAGES` **截断**
   (`tokenfree_video.py:120`) — tôi **không** sửa vì nó bảo vệ đường drama. Ở đường mới của tôi,
   `ark.py` đã chặn trước nên không bao giờ tới đó. Nhưng nếu ai đó sau này gọi drama path
   với >9 张, chỗ đó vẫn cắt âm thầm — **nợ còn lại, không phải việc của brief này**.

---

## 6. CHƯA LÀM ĐƯỢC / ngoài phạm vi — cần board giao tiếp

1. **`frontend/src/api.ts:563` vẫn chỉ gửi `?restart=true`, không gửi `subject_ref_urls`.**
   Cần `generate(id, { restart, subject_ref_urls, style_ref_urls })`. **Phần frontend không thuộc
   lane này** (brief cấm sửa `frontend/**`).
2. **`regen_shot_video` (`pipeline.py:1665-1677`) không nhận参考图.** 单镜重绘视频走另一个入口，
   没有 payload 可读，所以**重绘某一镜会丢掉参考图**。要修得给重绘任务也带 payload。
3. **Seedream 出图阶段（`_parallel_image_and_audio`）仍只吃 `project.ref_image_url` 这一张**
   （`pipeline.py:837`），参考图没进 `base_refs`。Brief 只要求接 Seedance，我没有顺手扩到
   Seedream —— 但如果希望"参考图也影响静帧出图"，这是下一个任务。
4. **参考图没有落库。** 它只活在 `TaskRun.payload` 里：用户点一次"生成"带一次，
   之后单镜重绘/续跑就没有了。要长期保留需要给 `Project` 加列 + migration — tôi không tự làm
   vì đụng DB schema.
5. **Chưa có `POST`/rate-limit hay size cap cho `subject_ref_urls`/`style_ref_urls`** ngoài
   `max_length=20` ở schema. 20 张/类已经超上限 9 rồi, nên thực tế luôn bị chặn ở chốt chặn 1.
6. 4 lỗi failed có sẵn từ upstream — **không sửa**, đúng luật.
