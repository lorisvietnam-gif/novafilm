# ĐÀO GỐC RỄ — BÁO CÁO LẦN 1 (2026-10-02)

Lane: `bunny/2`. Worktree: `D:\novafilm-lanes\bunny-2`. Branch: `bunny/2`.

Lượt này làm **VIỆC 1** và **nhóm C**, **phân loại** nhóm B và A, và **không** đụng
nhóm D. Mọi con số dưới đây là **số đo**, không phải ước lượng.

---

## 0. CÁCH ĐO

Không đếm bằng mắt. Ba script nằm ở `.kilo/` trong worktree lane:

| Script | Việc |
|---|---|
| `.kilo/measure_groups.py` | đếm ký tự Trung (`U+3400–U+9FFF`, `U+F900–U+FAFF`) theo nhóm |
| `.kilo/parity_backend_messages.py` | đối chiếu bảng nhãn `backendMessages.ts` với chuỗi backend thật |
| `.kilo/verify_tpl.py` | đối chiếu id mẫu seed với bảng nhãn `templateLabels.ts` / `templatePromptLabels.ts` |

**Tổng đo được: 56.992 ký tự Trung trong `backend/app/*.py`, ở 148 / 171 file.**
(Brief ghi 57.920; chênh 928 ký tự là brief đã tính thêm dấu câu toàn cảnh. Số của ta
chỉ đếm chữ Hán, nên nhỏ hơn — đây là số đo của ta, không phải lỗi của ai.)

---

## 1. KẾT LUẬN ĐẦU TIÊN: NHÓM B KHÔNG THỂ DỊCH THEO CÁCH BRIEF MÔ TẢ

Brief nói nhóm B (`templates_seed.py` 5.971 + `templates_seed_huoke.py` 1.695) là
"nội dung mẫu người dùng đọc, dịch sang tiếng Việt". Đo thì ra **không còn gì để dịch**,
và **ba phần dịch được thì dịch sẽ làm hỏng**. Bằng chứng:

### 1.1 Phần người đọc — ĐÃ CÓ BẢNG NHÃN, đủ 27/27

`templates_seed.py` không hiển thị thẳng lên UI. Mọi nơi render tên/mô tả mẫu đều
đi qua bảng nhãn theo `template.id`:

- `frontend/src/pages/TemplatesPage.tsx:120-121` → `templateName(t.id, t.name)` / `templateDescription(t.id, t.description)`
- `frontend/src/pages/studio/CreateProjectPage.tsx:249`
- `frontend/src/pages/studio/StyleConfigPage.tsx:285`
- `frontend/src/lib/templateLabels.ts` — 27 mục

Đo bằng `.kilo/verify_tpl.py`: **23 id seed + 4 id huoke = 27; bảng nhãn có đủ 27.**
Không thiếu mục nào. Ba chuỗi prompt mặc định cũng đã có bảng
(`templatePromptLabels.ts`, 27 mục).

### 1.2 `category` là KHOÁ, không phải nhãn — thuộc nhóm D

`frontend/src/pages/TemplatesPage.tsx:33` ghi rõ:

> `// Khoá danh mục, không phải nhãn: giữ nguyên tiếng Trung vì khớp với CATEGORY_ORDER`

`CATEGORY_ORDER` (`lib/categories.ts:3`) là mảng khoá tiếng Trung, `homeCategoryLabel()`
tra nhãn theo khoá đó. 28 giá trị `category` trong seed, 58 ký tự. **Dịch là hỏng bộ lọc.**

### 1.3 `bgm_mood` được khớp bằng regex TIẾNG TRUNG — dịch là hỏng chọn nhạc

Đây là phát hiện quan trọng nhất của lượt này. `backend/app/services/bgm.py:15-22`:

```python
_BGM_FILES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"紧张|悬疑|压迫"), "tense"),
    (re.compile(r"温暖|人文|故事"), "warm"),
    (re.compile(r"赛博|电子|科技"), "tech"),
    (re.compile(r"史诗|宏大|奇幻"), "epic"),
    (re.compile(r"轻快|专业|开源|产品|工作"), "upbeat"),
    (re.compile(r"冷静|纪实"), "calm"),
]
```

`resolve_bgm_path()` **dò regex tiếng Trung trên chuỗi tâm trạng** để chọn file nhạc.
17 giá trị `bgm_mood` trong seed (71 ký tự) đều là tiếng Trung. Dịch sang tiếng Việt →
không regex nào trúng → rơi về `default.mp3`. **Mọi mẫu sẽ mất đúng nhạc dựng nền.**

Tệ hơn: `bgm_mood` còn được dán thẳng vào cue `【BGM：后期混音 · {mood}】`
(`seedance_segments.py:404`) rồi gửi cho Seedance. Đó là **giao thức**, đúng nhóm D.

### 1.4 Chuỗi prompt trong seed thuộc nhóm A, và bảng nhãn đã ghi rõ lý do

`templatePromptLabels.ts:9-12`:

> `VÌ SAO PHẢI LÀ BẢNG NHÃN CHỨ KHÔNG SỬA GIÁ TRỊ GỐC` — Ba chuỗi này không chỉ hiển
> thị — chúng được gửi thẳng cho **mô hình ảnh** khi sinh cảnh. Đổi chúng trong database
> là đổi kết quả ảnh.

Thêm nữa, mục `zh` trong bảng được ghi là **nguyên văn giá trị backend trả về**. Dịch
seed sẽ phá vỡ bảo đảm đó: ở `zh`, bảng hiện tiếng Trung còn database thành tiếng Việt.

**Kết luận nhóm B: 7.666 ký tự, trong đó ~1.834 là chú thích/docstring, ~5.832 chia như
sau — 129 ký tự thuộc D (khoá), 633 ký tự đã có bảng nhãn đủ, 5.070 ký tự thuộc A.**
Không dịch giá trị lưu trữ. Phần còn lại là chú thích cho người đọc mã — xem mục 5.

---

## 2. NHÓM C — ĐÃ LÀM

Đây là nhóm **thật sự còn tồn đọng**, và chính mã nguồn đã tự ghi nhận nợ này.
`dramaGenError.ts` (trước khi sửa), dòng 13-16:

> *Một hệ quả chưa giải quyết được ở frontend: vài nhánh đặt `message: text`, tức hiển
> thị lại nguyên văn thông báo lỗi của backend. Chuỗi đó vẫn là tiếng Trung cho tới khi
> backend có bản `vi`.*

### 2.1 Ba thay đổi, đều ở tầng hiển thị

| File | Việc |
|---|---|
| `lib/backendMessages.ts` | 6 → **102 khoá** + **11 mẫu** có tham số |
| `components/billing/BillingErrorNotice.tsx` | phân loại trên chuỗi thô, **hiển thị chuỗi đã dịch** |
| `lib/dramaGenError.ts` | không còn nhánh nào đặt `message` bằng thô `text` |

### 2.2 VÌ SAO KHÔNG DỊCH GIÁ TRỊ GỐC Ở BACKEND

Chuỗi tiếng Trung trong `detail` **không chỉ là văn bản — nó là đầu vào của phân loại
lỗi**:

- `billingError.isBillingError()` dò `余额不足`, `请先充值`
- `dramaGenError.ts` dò `生图失败`, `上一镜失败`, `分镜已变更`, `参考图格式不支持`
- `apiError.parseRawApiError()` dò `不存在`, `超时`, `网络`

Dịch giá trị gốc là những regex đó trượt → mọi nhánh rơi xuống fallback cuối →
**thông báo lỗi biến mất im lặng**. Đây đúng là cái bẫy mà `dramaGenError.ts:8-10`
đã cảnh báo. Nên: giữ chuỗi gốc làm **khoá**, dịch ở tầng hiển thị.

Vì vậy trong `BillingErrorNotice` thứ tự là bắt buộc và đã ghi rõ trong mã:

```ts
const shown = localizeBackendMessage(text)   // hiển thị
if (!isBillingError(text)) { ... }           // phân loại trên `text` THÔ
```

### 2.3 Đã bắt được một lỗi thật khi làm bảng nhãn

`.kilo/parity_backend_messages.py` so **từng ký tự** khoá trong bảng với chuỗi backend
thật. Lần chạy đầu báo:

```
KHOA KHONG KHOP CHUOI BACKEND NAO (22)
  头像不能超过5MB        <- backend thật: 头像不能超过 5MB   (thiếu dấu cách)
  创意文案至少20字        <- backend thật: 创意文案至少 20 字
  ...
```

Tôi đã **bỏ dấu cách** khi chép 19 khoá. Nếu không có script này thì cả 19 thông báo đó
sẽ **hỏng âm thầm** — `localizeBackendMessage()` tra trượt thì trả nguyên văn, nhìn
tưởng đã xong. Đã sửa, chạy lại: `CHUA CO NHAN: khong co` cho toàn bộ `detail=`.

Một lỗi cú pháp nữa cùng loại: khoá tiếng Trung có dấu `，`, `：` không phải ký tự định
danh hợp lệ trong JS, nên `全集剧本正在生成，请稍后再优化单集: {` là `TS1127`. Đã bọc
**toàn bộ** khoá trong dấu nháy đơn thay vì vá lẻ từng cái.

### 2.4 Quy tắc giữ chi tiết kỹ thuật trong `dramaGenError`

`withDetail()` nối thêm phần thô **chỉ khi nó không phải tiếng Trung**. Suy nghĩ:

- Câu giải thích luôn do ta viết bằng ngôn ngữ đang chọn → tiếng Trung không còn lên màn hình.
- Mã kỹ thuật (`content[3]`, `File type not supported`, `Credits insufficient`) **giữ lại** —
  dùng được để điều tra và không cần dịch.
- Chuỗi thô **không mất**: `job.error` / `task.error_message` vẫn nguyên và
  `reportApiError()` vẫn in ra console.

Nhánh "câu tiếng Trung ngắn, không rõ nguyên nhân" trước đây in nguyên văn; nay nói
rõ là lỗi không xác định thay vì đẩy tiếng Trung cho người đọc.

---

## 3. BẢNG ĐẾM THEO NHÓM

| Nhóm | Nội dung | Ký tự | Xử lý lượt này |
|---|---|---|---|
| **A** | Prompt gửi cho model, 14 file | **17.597** | **Chưa đụng** — xem mục 4 |
| **B** | Seed data, 2 file | **7.666** | **Phân loại xong, không dịch giá trị lưu trữ** — mục 1 |
| **C** | Thông báo lỗi, 240 chuỗi | **2.177** | **Đã làm** cho toàn bộ `detail=`; còn 131 chuỗi `raise` — mục 5 |
| **D** | Định danh kỹ thuật | **≥ 1.913** | **Giữ nguyên** — không đổi một ký tự |
| — | Chú thích, docstring, chưa phân loại | **còn lại ~27.639** | **Để nguyên** — mục 5 |

Con số D là **mức tối thiểu có thể chứng minh**: 58 (khoá `category`) + 71 (`bgm_mood`)
+ 1.784 (cue marker `【…】` đo trong `seedance_segments.py` + `build_fragments.py`).
Không cộng các khoá khác vì chưa đo hết — không muốn đưa ra con số không dỗi được.

Chú thích/docstring là phần lớn "còn lại". Chúng là tiếng Trung **cho người đọc mã**,
nên theo tinh thần "tiếng Việt là nguồn sự thật" thì đáng dịch — nhưng đó là công việc
cỡ khác, và mục 6 nói rõ còn nhiều.

---

## 4. NHÓM A — VÌ SAO CHƯA ĐỤNG

17.597 ký tự trong 14 file. Brief yêu cầu giữ `img_prompt` / `video_prompt` /
`reference_image` bằng tiếng Trung, chỉ dịch phần hướng dẫn/giải thích trong prompt.

**Lý do hoãn, nói thẳng: chất lượng prompt không kiểm chứng được ở localhost, và
`AGENTS.md` §7 nói rõ việc chưa kiểm chứng local được thì phải ghi rõ là chưa kiểm
chứng — không được coi là xong.**

Cụ thể:
1. Postgres không chạy (mục 6) → không mở được app → không so sánh được ảnh/video trước sau.
2. Đổi prompt đổi **kết quả sinh ảnh**. Không có ảnh tham chiếu và không có nhóm đối
   chứng thì "dịch phần hướng dẫn trong prompt" là **mò mẫu**, không phải kỹ thuật.
3. Rủi ro lớn nhất không nằm ở chữ nghĩa mà ở **chỗ cắt**: phần nào là "hướng dẫn" và
   phần nào là "giao thức" phải cắt đúng từng chuỗi. Cắt lệch một chỗ là đổi đầu
   vào của model.

Việc cần làm trước khi đụng nhóm A (chưa làm, nằm ngoài phạm vi lượt này):
- Dựng database thật ở localhost theo `AGENTS.md` §7.
- Chốt danh sách **trắng** nhóm A: những chuỗi tuyệt đối không đụng
  (`img_prompt`, `video_prompt`, `reference_image`, `【…】` cue, `bgm_mood`, khoá
  `category`, tên khoá cột).
- Với phần còn lại: dịch từng chuỗi, sinh ảnh cả hai bản, **xem ảnh** (`visual-audit.mjs`
  theo `AGENTS.md` §8) rồi mới quyết định giữ.

Đây là lý do lượt này **dừng sau nhóm C**.

---

## 5. ĐỂ NGUYÊN, KHÔNG PHÂN LOẠI ĐƯỢC

Theo luật 5 của brief: không chắc thì để nguyên và ghi ra.

1. **Chú thích tiếng Trung trong mã.** 148 file. Không phải nhóm A/B/C/D. Đáng dịch nhưng
   là việc lớn và không ảnh hưởng người dùng.
2. **131 chuỗi lỗi `raise ValueError(...)` / `RuntimeError(...)`, 1.410 ký tự.** Không có
   nhãn. Đếm theo file (`python .kilo/count_missing.py`):

   | Số chuỗi | File |
   |---|---|
   | 16 | `services/tasks/service.py` |
   | 15 | `services/ark.py` |
   | 14 | `services/drama/agents.py` |
   | 13 | `services/studio_tools.py` |
   | 7 | `services/pipeline.py` |
   | 6 | `services/drama/visual_prompt.py`, `services/drama/voice_design.py` |
   | 5 | `services/drama/generation.py`, `services/tasks/handlers.py`, `services/upstream_model_catalog.py` |
   | 4 | `services/seedance_image_aspect.py`, `services/drama/jobs.py`, `services/billing/settlement.py`, `services/epay.py` |
   | 3 | `services/drama/seed.py`, `services/tokenfree_pricing.py`, `services/llm_client.py` |
   | 2 | `services/drama/episode_compose.py`, `services/tokenfree_usage.py`, `services/drama/fragment_plan.py`, `services/email.py`, `api/tools.py` |
   | 1 | `services/billing/ephemeral.py`, `services/model_settings.py`, `services/drama/voice_synthesis.py`, `database.py` |

   Toàn văn: `python .kilo/parity_backend_messages.py` (in 131 dòng).
   Cách làm: thêm vào `BACKEND_MESSAGES` y hệt cách lượt này làm cho `detail=`.
   Nhóm này **rẻ và chắc chắn đúng** — không đụng đầu vào model, không cần kiểm chứng ảnh.
3. **`lib/categories.ts` thiếu nhãn cho khoá `3D`.** `homeCategoryLabel()` rơi về
   `{zh:'3D', en:'3D', vi:'3D'}` — hiện `3D` ở cả ba ngôn ngữ nên **không rò tiếng Trung**,
   chỉ là mục thiếu. Vá được trong một dòng.
4. **`未解析到可用文字模型。…`** — khoá có sẵn từ trước, backend sinh ở `llm_client.py:98`
   ngoài tầm regex của script nên báo "không khớp". **Không phải khoá thừa.**

---

## 6. KIỂM CHỨNG

| Kiểm tra | Kết quả |
|---|---|
| `npm run build` sau commit `fee9cb3` (VIỆC 1) | **xanh**, 0 error |
| `npm run build` sau commit `364d402` (nhóm C) | **xanh**, 0 error |
| `npm run lint` | **0 error / 40 warning** — đúng baseline, không tăng |
| `pytest` | **4 failed / 829 passed / 84 errors** |

### 6.1 Nói rõ về con số pytest — nó KHÔNG sạch, và lý do không phải do ta

- **4 failed** đúng là bộ lỗi có sẵn từ upstream mà `AGENTS.md` §4 đã liệt kê:
  `test_fragment_video_estimate_720p_doubles_480p`,
  `test_videos_estimate_hd_doubles_480p_preview`,
  `test_shot_regen_video_estimate_uses_project_hd`,
  `test_admin_stats_http_query_days_accepts_string_query`.
- **84 errors** là `ConnectionRefusedError` lúc **setup**, tức **không kết nối được
  Postgres**. Môi trường này Postgres không chạy. Không phải lỗi assertion.
- Baseline ghi `4 failed / 936 passed / 1 skipped`. Ta được `829 passed` — thiếu 107
  test vì 84 lỗi setup (mỗi lỗi loại 1–2 test) và các test phụ thuộc DB bị bỏ qua.
- Lượt này **không sửa một dòng Python nào** (`git show --stat` trên cả hai commit: chỉ
  `frontend/src`). Nên không thể có hồi quy backend từ thay đổi này.
- Worktree `bunny-2` **không có `.venv`** (kiểm tra: `Test-Path backend\.venv` → False).
  Đã chạy bằng interpreter của `bunny-1` — chỉ đọc site-packages của nó, không ghi vào
  repo của lane đó. Cần tạo `.venv` riêng cho lane này.

**Chưa kiểm chứng được bằng mắt.** `AGENTS.md` §7 nói build xanh không chứng minh trang
chạy được, và §8 đòi ảnh chụp thật. Cả hai đều **không làm được**: cần Postgres và
tiến trình backend đang chạy. Lượt này **không** kèm ảnh chụp. Phần thay đổi đều là bảng
nhãn và điều kiện hiển thị, không phải bố cục, nên rủi ro hình thành thấp — nhưng đó là
suy luận, **không phải quan sát**, và tôi ghi nó là suy luận.

---

## 7. CÒN LẠI

| Việc | Quy mô | Vì sao chưa làm |
|---|---|---|
| **Nhóm A** — dịch phần hướng dẫn trong prompt | 17.597 ký tự, 14 file | Không kiểm chứng được chất lượng ở localhost (mục 4) |
| **Nhóm C — 131 chuỗi `raise`** | 1.410 ký tự | Đủ cơ chế rồi, chỉ còn điền bảng |
| **Chú thích/docstring** | ~27.639 ký tự | Việc lớn, không ảnh hưởng người dùng |
| **Nhãn `3D` trong `categories.ts`** | 1 dòng | Trong nhóm dưới, dễ làm |
| **`.venv` cho `bunny-2`** | — | Chặn pytest sạch và visual audit |
| **`visual-audit.mjs`** | — | Chặn bởi Postgres |

Ưu tiên đề xuất cho lượt sau: **dựng Postgres → chạy `visual-audit.mjs` để có nền
đo → điền 131 chuỗi `raise` (rẻ, chắc chắn đúng) → rồi mới đụng nhóm A.** Đụng nhóm A
trước khi có ảnh so sánh là đánh cược vào may mắn.

---

## 8. DANH SÁCH COMMIT

| Commit | Nội dung |
|---|---|
| `fee9cb3` | `refactor(vi)`: `Messages = Widen<typeof vi>` — tiếng Việt là nguồn sự thật |
| `364d402` | `fix(vi)`: dịch thông báo lỗi ở tầng hiển thị, giữ tiếng Trung làm khoá |

`fee9cb3` phải sửa `NoExtraKey` cho nhận **kiểu thô** của pack (`typeof zh`), khoá theo
`Messages`. Nếu khai báo `NoExtraKey<Messages>` thì `Exclude<keyof Pack, keyof Messages>`
rỗng và **hàng rào khoá thừa biến mất im lặng**. Hàng rào "thiếu khoá làm build fail"
giờ bảo vệ tiếng Việt thay vì tiếng Trung.