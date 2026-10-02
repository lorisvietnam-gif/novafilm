# Phần 1 — prompt phân cảnh nhận biết locale (`bunny/4`, backend)

Brief: `docs/briefs/case-locale-aware-script-prompt-b2-b4.md`
Nhánh: `bunny/4` · Commit: xem `git log -1` sau khi commit file này.

## 1. Đo trước, sửa sau

Đo bằng cách gọi `chat_storyboard` với LLM giả (`chat_completions` bị thay), nên đọc
được **prompt thật** mà không cần mạng hay database. Bộ đếm ký tự Trung dùng đúng
regex của `frontend/scripts/visual-audit.mjs`: `/[\u4e00-\u9fff]/g`.

| Nhánh | locale | len(system) | ký tự Trung | câu ép ngôn ngữ | đủ 8 trường | 5 marker Seedance |
|---|---|---|---|---|---|---|
| `full` | *(trước)* zh cứng | 1339 | **601** | `所有字段必须使用简体中文（包括 …）` | có | có |
| `full` | *(sau)* `zh` | **1339** | **601** | y hệt dòng trên | có | có |
| `full` | *(sau)* `vi` | 1454 | 569 | `Mọi trường (title, text, …) phải viết bằng tiếng Việt, có dấu đầy đủ.` | có | có |
| `full` | *(sau)* `en` | 1426 | 569 | `Every field (title, text, …) must be written in English.` | có | có |
| `full` | *(sau)* rỗng / `None` / `fr` / `VI-VN` | 1454 | 569 | rơi về `vi`, không ném lỗi | có | có |
| `image_text` | *(trước)* zh cứng | 1336 | **673** | `所有字段必须使用简体中文。` | có | có |
| `image_text` | *(sau)* `zh` | **1336** | **673** | y hệt dòng trên | có | có |
| `image_text` | *(sau)* `vi` | — | 661 | `Mọi trường phải viết bằng tiếng Việt, có dấu đầy đủ.` | có | có |

**Con số quan trọng nhất:** `locale="zh"` cho ra prompt **dài đúng bằng trước** và
**cùng số ký tự Trung** ở cả hai nhánh (1339/601 và 1336/673). Đó là bằng chứng máy
đo được rằng khách tiếng Trung không đổi một ký tự nào, chứ không phải lời hứa suông.

Năm marker Seedance (`【字幕：`, `【BGM：`, `【旁白·`, `@duration`, `空镜`) còn nguyên ở
**mọi** locale × **mọi** nhánh — không đụng Nhóm D.

## 2. Sửa gì

### `backend/app/services/ark.py`

- Thêm `locale: str = ""` vào `chat_storyboard` (`ark.py:676`).
- Thứ tự nguồn: tham số rõ ràng → `settings.default_locale` → `"vi"`.
- **Một bảng ngôn ngữ duy nhất** `_OUTPUT_LANGUAGE_NAMES` + `_OUTPUT_LANGUAGE_NOUNS`
  (`ark.py:131-152`). `expand_content` đã có dict riêng (`ark.py:2552` cũ) — nay nó
  lấy tên ngôn ngữ từ bảng chung, không còn bảng thứ hai. Test
  `test_expand_content_reuses_the_same_language_table` canh ràng buộc này.
- Câu ép ngôn ngữ ở cả hai chỗ dựng `system` giờ do `_storyboard_language_rule()`
  sinh, **và vẫn giữ nguyên danh sách trường** — đây là phần brief cấm xoá.

### Hai chỗ phát hiện thêm, cùng nằm trong prompt phân cảnh

Câu ép ngôn ngữ không phải chỗ duy nhất ép tiếng Trung. Hai dòng dưới đây **mâu thuẫn**
với nó, nên phải sửa cùng lúc, nếu không thì `locale="vi"` vẫn ra tiếng Trung:

| Dòng cũ | Vì sao mâu thuẫn | Sau khi sửa |
|---|---|---|
| `img_prompt(与首段 visual 一致的**中文**首帧提示词…)` | bảo `img_prompt` là tiếng Trung, đúng lúc câu trên bảo tiếng Việt | `一致的 tiếng Việt 首帧提示词` / `一致的 中文 首帧提示词` (giữ nguyên với `zh`) |
| `img_prompt 与 video_prompt **禁止英文句子**，专有名词可保留原文。` | với `locale="en"` thì câu này **cấm** chính thứ nó yêu cầu | `zh` giữ nguyên; `vi`/`en` đổi thành câu cùng ý bằng đúng ngôn ngữ đích |

### `backend/app/config.py`

Thêm `default_locale: str = "vi"` (`config.py:209`) — mặc định của nhà vận hành, đổi
bằng biến môi trường `DEFAULT_LOCALE` được, không cần sửa code. Đây là mắt xích
"settings" mà brief nêu; trước đó `Settings` **không có** trường ngôn ngữ nào.

### `backend/tests/test_storyboard_locale_prompt.py` (mới, 25 test)

| Nhóm | Khẳng định |
|---|---|
| `test_vietnamese_locale_asks_for_vietnamese` × 2 nhánh | `vi` ⇒ prompt có `tiếng Việt`, **không còn** `简体中文` |
| `test_english_locale_asks_for_english` × 2 nhánh | `en` ⇒ `must be written in English`, và **không còn** `禁止英文句子` |
| `test_chinese_locale_keeps_the_original_sentence` × 2 nhánh | `zh` ⇒ câu cũ nguyên vẹn (chốt chặn hồi quy) |
| `test_output_structure_survives_every_locale` (locale × nhánh) | đủ 8 trường, còn `{"character_bible":"...","shots":[...]}`, còn `不要 markdown`, còn 5 marker Seedance, `response_format` vẫn là `json_object` |
| `test_missing_or_unknown_locale_falls_back_without_raising` | `""` / `None` / `fr` ⇒ rơi về `vi`, không ném lỗi |
| `test_region_tagged_locale_resolves_on_the_language_part` | `zh-CN`→`zh`, `vi-VN`/`"  VI  "`→`vi`, `en-US`→`en` |
| `test_settings_default_locale_drives_the_prompt` | đổi `default_locale` ⇒ prompt đổi theo |
| `test_explicit_locale_beats_the_settings_default` | tham số rõ ràng thắng settings |
| `test_expand_content_still_defaults_to_chinese` | hành vi cũ của `expand_content` giữ nguyên (`locale` mặc định `"zh"`) |

## 3. pytest

Câu lệnh (bắt buộc `--basetemp` trỏ vào worktree, xem `AGENTS.md` §4):

```
cd backend
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp=..\.kilo\pytest
```

| Lần | Kết quả |
|---|---|
| **Trước khi sửa** | `4 failed, 1023 passed, 1 skipped` |
| Sau khi sửa, lần 1 | `4 failed, 1047 passed, 2 skipped` |
| Sau khi sửa, lần 2 | `4 failed, 1047 passed, 2 skipped` |

Bốn lỗi failed **giống hệt tên** trước và sau, đều là nợ có sẵn từ upstream đã được
`AGENTS.md` §4 ghi nhận: `test_fragment_video_estimate`, `test_kepu_phase_billing` (×2),
`test_kepu_shot_edit_demote`. Lần skip thứ hai là test live mới (mặc định tắt).

Không có linter cho Python ở backend (`backend/` không có `pyproject.toml`, `ruff` không
cài trong `.venv`); cổng kiểm của backend là `pytest` theo `AGENTS.md` §4.

## 4. CHƯA kiểm chứng được — nói thẳng

**"Model trả về tiếng Việt" thì chưa đo được ở lane này.** Các test offline chỉ chứng
minh *prompt yêu cầu* tiếng Việt, không chứng minh *model nghe theo*. Tôi đã thử gọi
provider thật và nó dừng ở:

```
ark_api_key = ""            # .env của lane không có
model_llm   = ""            # kênh nằm trong overlay DB, chỉ nạp dưới lifespan của app
⇒ get_ark().mock == True
```

`mock=True` thì `chat_storyboard` trả về **script tiếng Trung viết cứng**, tức là đo
được con số đẹp một cách giả. Đó đúng là cái bẫy mà `test_expand_content_streaming.py:189`
đang canh, nên tôi dừng lại thay vì báo cáo một con số không có thật.

Đã để sẵn test live để chạy được ở máy có cấu hình provider:

```
NOVAFILM_LIVE_LLM=1 .\.venv\Scripts\python.exe -m pytest tests\test_storyboard_locale_prompt.py -k live
```

Test **cố tình fail** nếu gateway rơi vào mock, để không bao giờ báo "xanh" nhầm.

## 5. Việc nằm ngoài phạm vi lane — xin board giao, không tự làm

1. **`Project` không có cột `locale`** (`models.py:97-136`). `pipeline.py:720` gọi
   `chat_storyboard` **không truyền `locale`**, nên project tạo từ `/studio` hiện vẫn
   nhận mặc định `vi`. Muốn `en`/`zh` đúng ý người dùng thì phải lưu locale vào
   project → **cần migration**. Theo `AGENTS.md` tôi dừng, không tự migrate.
2. **Phần 2 (bunny/2) chưa làm** ⇒ không có request nào gửi `locale` tới
   `chat_storyboard`. Đường duy nhất hiện chạy được là `POST /api/projects/expand`
   (`schemas.py:289` đã khai `locale`, `projects.py:126` đã truyền vào
   `expand_content`) — và đường đó đã sạch từ trước. Nói rõ để không ai tưởng Phần 1
   đã "chạy được" vì có người dùng.
3. **Độ dài `2-8字` / `8-22字` / `20-60 字`** trong prompt phân cảnh vẫn dùng đơn vị
   "字" của tiếng Trung. `ark.py:88-96` đã ghi nhận đúng cái bẫy này cho
   `expand_content` (越语 ra 1531-2274 ký tự thay vì 300-700). Ở prompt phân cảnh chưa
   sửa vì ngoài brief, nhưng nó sẽ cắt `title`/`subtitle` tiếng Việt quá dài. Cần một
   `_STORYBOARD_LENGTH_RULES` theo ngôn ngữ, giống `_EXPAND_LENGTH_RULES`.
4. **Ví dụ trong prompt vẫn tiếng Trung** (`camera(如：缓慢上摇/轻推/横移)`,
   `img_prompt(横屏 16:9 构图画面提示词…)`, persona `你是短视频分镜编剧`). Là chỉ thị
   bằng tiếng Trung nên hợp lý, nhưng model có xu hướng bám ví dụ. Chưa đo được mức
   ảnh hưởng; cần chạy live mới biết.
5. **Chưa đo lại audit hình ảnh.** `frontend/scripts/visual-audit.mjs` chụp 25 route;
   nó đo ký tự Trung **trên trang**, không đo nội dung LLM sinh ra trong DB. Cho tới khi
   Phần 2 chạy và có project `vi` thật thì con số audit chưa tái lập được — đúng như
   brief đã cảnh báo. **Project 16 giữ nguyên, không xoá.**