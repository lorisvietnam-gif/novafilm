# Tên mặc định tiếng Trung lọt ra giao diện — báo cáo bunny/1

Brief: `docs/briefs/case-chinese-default-names-b1.md`
Lane: `bunny/1` (`D:\novafilm-lanes\bunny-1`)
Ngày: 2026-10-02

## 1. Đã sửa — đúng 7 dòng của mục 2 brief, cộng guard ở mục 3

| File | Dòng | Trước | Sau |
|---|---|---|---|
| `backend/app/services/drama/generation.py` | 1370 | `未命名资产` | `Tài sản chưa đặt tên` |
| `backend/app/api/drama/generation.py` | 250 | `未命名音色` | `Giọng đọc chưa đặt tên` |
| `backend/app/api/drama/projects.py` | 125 | `自由画布项目` / `未命名漫剧` | `Dự án bảng vẽ tự do` / `Dự án drama chưa có tên` |
| `backend/app/models_drama.py` | 20 | `未命名漫剧` | `Dự án drama chưa có tên` |
| `backend/app/schemas_drama.py` | 14 | `未命名漫剧` | `Dự án drama chưa có tên` |
| `backend/app/models.py` | 103 | `未命名作品` | `Chưa có tên` |
| `backend/app/schemas.py` | 179 | `未命名作品` | `Chưa có tên` |

**Sai đường dẫn trong brief:** dòng `未命名音色` nằm ở `app/api/drama/generation.py:250`,
không phải `app/services/drama/generation.py:250` (đó là `fragment_generation_status`).
Chỉ có đúng một chỗ khớp nên không có rủi ro gõ nhầm.

**Chọn chuỗi tiếng Việt:** dùng đúng vốn từ mà frontend đã dùng cho nhãn hiển thị
(`frontend/src/lib/projectTitleLabels.ts`: `未命名作品 → vi 'Chưa có tên'`,
`未命名漫剧 → vi 'Dự án drama chưa có tên'`, `自由画布项目 → vi 'Dự án bảng vẽ tự do'`).
Nhờ vậy dữ liệu cũ (Trung) và dữ liệu mới (Việt) dùng chung một từ vựng.

### Guard ở mục 3 — `backend/app/services/drama/agents.py`

`pick_auto_project_title` không còn so với set literal. Nó dùng
`DEFAULT_PROJECT_TITLES` (agents.py:638), gồm **4** giá trị:

```python
DEFAULT_PROJECT_TITLES = {
    "Dự án drama chưa có tên",
    "Dự án bảng vẽ tự do",
    # Tên mặc định cũ: dữ liệu đã nằm sẵn trong database.
    "未命名漫剧",
    "自由画布项目",
}
```

Hai giá trị Trung cũ **cố ý giữ lại**: chúng là dữ liệu đã nằm trong database,
đổi mã nguồn không đổi dữ liệu cũ. Bỏ chúng khỏi set thì dự án cũ sẽ bị coi là
"người dùng đã đặt tên" và logic đặt tên tự động sẽ không bao giờ chạy lại với chúng —
đúng cái hỏng mà mục 3 brief cảnh báo, chỉ là theo chiều ngược lại.

## 2. Không đụng (đúng mục 4 brief)

Đã kiểm lại toàn bộ chỗ còn tiếng Trung trong `backend/app` sau khi sửa:

- `services/drama/fragment_plan_prompt.py:109,111`, `script_summary_prompt.py:20`,
  `visual_prompt.py:134`, `voice_prompt.py:56` → **prompt gửi model**, giữ nguyên.
- `api/projects.py:506,508` `_safe_zip_name` → **tên file kỹ thuật** (`p{id}_{title}.mp4`),
  giữ nguyên.
- `services/drama/workflow.py:9,10` `CANVAS_SOURCE_MARKER` / `CANVAS_TITLE_MARKER` →
  marker so khớp với dữ liệu đã lưu, giữ nguyên. Đã kiểm tra cả hai lớp dò workflow
  (`backend/app/services/drama/workflow.py:19` và `frontend/src/lib/dramaWorkflow.ts:26`)
  đều **đọc `params.workflow` trước**, mới tới marker trong title ⇒ dự án canvas mới
  (luôn có `params.workflow="canvas"` qua `build_project_params`) không bị ảnh hưởng.
- `seed.py:387` `asset.name or "未命名"` — **đã xác minh như brief yêu cầu**: biến `name`
  này chỉ dùng để ghi log (`errors.append(f"{kind}/{name}: {detail}")`), không bao giờ ra
  UI. Tên thật đưa vào prompt đến từ `visual_prompt.py` / `voice_prompt.py` (nhóm prompt).
  ⇒ để nguyên.
- `services/agent/compose.py:33` `"未命名"` → thuộc hệ thống skill khác, ngoài phạm vi brief.

## 3. Test mới — `backend/tests/test_default_names_vi.py` (9 test, tất cả xanh)

- `test_asset_created_without_name_is_stored_in_vietnamese` — gọi thật
  `generate_asset_image` (chỉ giả lập nhà cung cấp ảnh `get_ark` + `record_seedream_image_usage`
  + `republish_url`), tạo asset **không truyền `name`**, rồi **đọc lại cột `name` từ
  PostgreSQL** ⇒ `Tài sản chưa đặt tên`, và assert không có ký tự CJK nào.
- `test_voice_asset_created_without_name_is_stored_in_vietnamese` — gọi thật endpoint
  `POST /api/drama/generation/voice` (giả lập `generate_voice_asset_audio`) ⇒
  `Giọng đọc chưa đặt tên`.
- `test_model_column_defaults_are_vietnamese` — insert `Project` / `DramaProject` **không
  truyền title**, đọc lại ⇒ `Chưa có tên` / `Dự án drama chưa có tên`.
- `test_request_schema_defaults_are_vietnamese` — default của Pydantic schema.
- `test_default_titles_are_still_auto_renamed` (4 case: 2 tên mới + 2 tên cũ Trung) —
  **đúng yêu cầu mục 5 brief**: sau khi đổi tên mặc định, `pick_auto_project_title` vẫn
  coi là mặc định và vẫn đặt tên tự động được.
- `test_user_renamed_title_is_not_overwritten` — tên người dùng tự đặt vẫn không bị đè.

## 4. Kết quả kiểm tra

### Backend
```
4 failed, 991 passed, 1 skipped
```
- Đúng 4 lỗi failed là baseline có sẵn từ upstream đã ghi ở `AGENTS.md` §4:
  `test_fragment_video_estimate_720p_doubles_480p`,
  `test_kepu_phase_billing.py::test_videos_estimate_hd_doubles_480p_preview`,
  `test_kepu_phase_billing.py::test_shot_regen_video_estimate_uses_project_hd`,
  `test_kepu_shot_edit_demote.py::test_narration_edit_invalidates_continuous_audio`.
- `passed` 982 (baseline) → **991** = +9 test mới. `skipped` giữ nguyên 1.
- Lệnh đã dùng (bắt buộc `--basetemp`, trỏ vào worktree):
  ```
  cd backend
  $env:DATABASE_URL = (<.env> nhưng đổi cổng 15432 → 5432)
  .venv\Scripts\python.exe -m pytest -q --basetemp=..\.kilo\pytest -p no:cacheprovider
  ```

### Frontend
- `npm run build` → `✓ built in 1.26s`, 0 lỗi TypeScript.
- `npm run lint` → **0 error / 40 warning** (khớp baseline; không đụng file frontend).

### Audit thị giác — `node scripts\visual-audit.mjs`
Chạy đúng vào server của **lane này**, không đo nhầm `main`:
```
AUDIT_BASE=http://127.0.0.1:5272   (vite dev của bunny/1)
AUDIT_API=http://127.0.0.1:8011    (uvicorn của bunny/1, backend/.venv)
```

Số đo **sau** khi sửa (locale `vi`):

| Route | Trước (brief) | Sau | Ghi chú |
|---|---|---|---|
| `/assets` | 16 | **6** | = 1 (nút `中`) + 5 (dữ liệu cũ, xem §5) |
| `/drama/assets` | 16 | **6** | = 1 + 5 (dữ liệu cũ) |
| `/drama/projects/16/canvas` | 5 | **5** | = 5 (dữ liệu cũ) |
| `/drama/projects/16/episodes` | — | 53 | **nội dung kịch bản trong database**, đã ghi ở `AGENTS.md` §10 |
| Tổng | — | **151** (`vi`, đủ 24 route) · **146** (`en`, thiếu canvas vì lỗi) | cộng tay từ bảng in ra của script |

Ảnh chụp: `frontend/.kilo/audit/vi/tai-nguyen.png` (chính là `/assets`) — đã mở xem:
trang hiện tiếng Việt hoàn toàn, **thẻ duy nhất còn tiếng Trung là `未命名资产`**
ở góc trên bên trái, đúng bằng 5 ký tự.

**Vì sao chưa tụt về 1:** truy thẳng DB (`printfilm` trên 5432):

```
id=23  name='未命名资产'   <- hàng có sẵn từ trước khi sửa, của project 16
id=22  name='Video mới'
id=21  name='Bối cảnh mới'
id=20  name='Anh cu'
```

Đó là **dữ liệu đã lưu**, không phải tên mặc định còn sót trong mã. Sửa mã nguồn không
đổi dữ liệu cũ — cùng lý do mà `projectTitleLabels.ts` tồn tại. Không tự sửa hàng này
vì đó là database dùng chung, ngoài phạm vi lane. Chi tiết ở §5.

Lỗi cuối lượt audit: `/drama/projects/16/canvas` ở **lô `en`** không ổn định sau 45s
(`readyState=interactive`), script dừng trước khi in bảng tổng `en`. Route này không liên
quan tới thay đổi này; số `en` của canvas chưa được đo. `vi` đã đo xong (5).

## 5. Việc còn lại — đề nghị board giao, không tự làm

1. **Hàng DB cũ vẫn hiện tiếng Trung** (`drama_assets.id=23` = `未命名资产`; tương tự có
   thể còn ở `projects.title` / `drama_projects.title` của dữ liệu cũ). Cần một migration
   `UPDATE ... WHERE name IN (...)` lúc khởi tạo database thật — cùng kiểu việc đã ghi ở
   `AGENTS.md` §10 về `/episodes`. **Cần board giao**, vì nó đụng database dùng chung.
2. **`frontend/src/lib/projectTitleLabels.ts` giờ thiếu khoá cho tên mặc định mới.**
   Hàng cũ (Trung) vẫn được dịch; hàng mới (Việt) trả nguyên văn ⇒ **người dùng locale
   `zh` và `en` sẽ thấy tên dự án tiếng Việt**. Không tự sửa vì brief giới hạn phạm vi.
   Cách sửa đúng: thêm 3 khoá mới vào `DEFAULT_PROJECT_TITLES` (map hiển thị, giữ `zh`
   trùng giá trị gốc) — giống cách đang làm cho bản cũ.
3. **`frontend/src/pages/studio/CreateProjectPage.tsx:34`** `LEGACY_UNTITLED = '未命名作品'`.
   Sau thay đổi này `isDefaultTitle()` lại **khớp** với locale `vi`
   (`studio.shared.untitled` = `Chưa có tên`) — tức là đã tốt hơn trước, không hỏng.
   Không cần gấp.
4. **`api/drama/projects.py:125` về kỹ thuật là nhánh chết**: dòng 109-110 chặn
   `source` dưới 20 ký tự, nên `title` ở dòng 111-113 luôn khác rỗng ⇒ `title or (...)`
   không bao giờ chạy. Vẫn sửa theo brief; ghi ra đây để ai đó đóan là nhánh thừa thì biết.
5. **Ghi chú môi trường:** `.env` của lane trỏ `DATABASE_URL` cổng **15432** (docker dùng
   chung, hiện không chạy); Postgres local là **5432**. Mọi lần chạy test/audit ở trên đều
   override biến môi trường sang 5432, **không sửa file `.env`**.

## 6. File đã đụng

```
backend/app/api/drama/generation.py
backend/app/api/drama/projects.py
backend/app/models.py
backend/app/models_drama.py
backend/app/schemas.py
backend/app/schemas_drama.py
backend/app/services/drama/agents.py
backend/tests/test_default_names_vi.py     (mới)
docs/CHINESE_DEFAULT_NAMES_FIX_B1.md       (báo cáo này)
```
