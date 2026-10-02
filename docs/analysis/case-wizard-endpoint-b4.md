# `POST /api/wizard/generate_prompt` — báo cáo bunny/4

Lane: `D:\novafilm-lanes\bunny-4`, branch `bunny/4`.
Ngày đo: **2026-10-02**. Brief: `docs/briefs/case-wizard-integration-b2-b4.md`.

Lỗi audit trong brief (`Buoc lai thu tren /wizard that bai (buoc-2-y-tuong): Uncaught`) là do
`POST /api/wizard/generate_prompt` không tồn tại. Phần 1 của brief (dựng endpoint) là việc của
lane này và **đã xong**. Phần 2 (trang không crash khi backend lỗi) do `bunny/2` làm và đã merge
sẵn — `WizardPage.tsx:159-190` có `try/catch/finally` đầy đủ.

---

## 1. Kết luận quan trọng nhất: premise của brief đã cũ

Brief ghi *"Gọi `gemini-3-flash-preview` trên channel `text-openai` … (`gemini-3.5-flash` đang
lỗi high demand; đo `gemini-3-flash-preview` → 200 OK)"*. **Đo lại hôm nay thì không còn đúng.**

`text-openai` không còn trỏ vào Google. Nó đang trỏ vào Kira:

```
id='text-openai' enabled=True base='https://kiraai.vn/api/v1' models=['deepseek-v4-flash-free']
```

Khoá Kira **không có quyền Gemini nào**:

```
gemini-3-flash-preview -> HTTP 403 {"code":"model_not_allowed"}
gemini-3.5-flash      -> HTTP 403 {"code":"model_not_allowed"}
Allowed models: hy4, hy3, ling-3.0-flash-free, hy-image-v3.5-free, qwen3.8-27b-free,
  qwen3.8-flash-next-free, mimo-v2.6-flash-free, deepseek-v4-flash-free,
  space-bunny-alpha, longcat-2.5-preview-free, laguna-s-2.1-free, laguna-xs-2.1-free
```

Cũng không còn khoá Google nào trong overlay của DB (đã quét `get_overlay_dict()`).

⇒ Endpoint **không** gọi cứng `gemini-3-flash-preview`. Nó đi một chuỗi model có thứ tự, giữ
gemini ở đầu đúng ý brief: nếu board cấp lại khoá Google thì gemini tự được dùng, còn hôm nay
rơi xuống model đo được là chạy. Đây cũng chính là lý do brief nói *"endpoint này tự chỉ định
model"* — một model ghi cứng mà luôn 403 thì endpoint hỏng.

### Thứ tự chuỗi là do đo, không do mặc định

**Vận chuyển** (4 lần gọi mỗi model, payload thật của wizard):

| model | `stream=True` | `stream=False` |
|---|---|---|
| `mimo-v2.6-flash-free` | 4/4, 52–82s | **1/4** — 3 lần 504 ở tường 60s của nginx |
| `deepseek-v4-flash-free` | 4/4, 10–38s | 4/4 |

`stream=True` là bắt buộc, và đây là bằng chứng đo được chứ không phải quy ước: cùng một model,
không stream thì hỏng 3/4. Khớp với ghi chú ở `llm_client.py:203-209`.

**Bám cấu trúc** (3 câu: bữa mì / đứa trẻ đứng yên / cô gái dưới mưa; chấm "JSON hợp lệ + đủ 7
nhãn"):

| model | đạt | ghi chú |
|---|---|---|
| `ling-3.0-flash-free` | **3/3** | miễn phí |
| `hy3` | 3/3 | **không** miễn phí, giá chưa đo ⇒ cố ý loại |
| `mimo-v2.6-flash-free` | 3/3 | miễn phí, chậm và hay 504 |
| `longcat-2.5-preview-free` | 2/3 | miễn phí, hay JSON hỏng |
| `laguna-s-2.1-free` | 2/3 | miễn phí, hay JSON hỏng |
| `laguna-xs-2.1-free` | 2/3 | miễn phí, có lần 429 |
| `hy4` | 1/3 | JSON hỏng |
| `deepseek-v4-flash-free` | 1/3 | thiếu nhãn `action` ở 2/3 lần |
| `qwen3.8-flash-next-free` | 0/4 | 504 cả khi có stream |
| `qwen3.8-27b-free` | 0/3 | DNS không phân giải ⇒ model không tồn tại |
| `space-bunny-alpha` | 0/3 | JSON hỏng / đứt kết nối |

Chuỗi cuối cùng: `gemini-3-flash-preview` → `ling-3.0-flash-free` → `mimo-v2.6-flash-free`
→ `deepseek-v4-flash-free`.

**Chỉ model `-free` mới được đưa vào chuỗi.** `billing_llm_per_m` là giá suất chung theo token,
không theo model, nên gọi một model không miễn phí là tiền thật với đơn giá chưa ai đo — đúng
loại nợ `AGENTS.md` mục 10 đang cảnh báo. `hy3` đo tốt nhưng **không** miễn phí nên nằm ngoài.

---

## 2. Ràng buộc chất lượng của brief — làm thế nào và chứng minh ra sao

Brief yêu cầu prompt phải là **danh sách mô tả thị giác**, không phải văn xuôi, vì đo thật thấy
prompt văn xuôi làm model bịa (nấm, cà rốt, cần). Ba lớp:

**(a) Prompt hệ thống** (`build_messages`) cấm rõ: đủ 7 nhãn theo thứ tự `subject + action +
setting + camera + lighting + style + duration`, không văn xuôi, **không bịa** vật/đồ ăn/màu/thời
tiết mà ý tưởng không nói, không ký tự Trung, không marker Seedance.

**(b) Chấm nhận cứng** (`is_usable_prompt`): thiếu bất kỳ nhãn nào trong 7 nhãn là **coi như hỏng
và thử model kế tiếp**. Đây là chỗ bắt được văn xuôi — đo thấy `deepseek-v4-flash-free` thiếu
`action` ở 2/3 câu, nên nó không bao giờ lọt ra ngoài.

**(c) Dọn kết quả** (`sanitize_prompt_text`): bỏ ký tự CJK/kana/fullwidth, bỏ marker Seedance
(`【字幕】`, `【旁白·…】`, `@duration:N`), gộp khoảng trắng, giữ nguyên thứ tự dòng.

Ngoài ra `normalize_prompt` **dựng lại** prompt theo đúng thứ tự nhãn thay vì bắt model làm
đúng — đo thấy `deepseek-v4-flash-free` hay đặt `setting` trước `action`; sửa ở đây rẻ hơn và
không tốn token thêm.

`prompt` và `frames[].prompt` **luôn tiếng Anh**; `script` và `frames[].narration` theo
`language`. Khớp với i18n: `wizard.idea.hint` bảo người dùng *"Viết bằng tiếng Việt"*, còn
`wizard.idea.scriptLabel` là *"Kịch bản"*.

---

## 3. Hợp đồng với trang `/wizard`

**Trang KHÔNG gửi `target`.** `api.ts:816-821` và `WizardPage.tsx:176-179` chỉ gửi `{ idea,
language }`; `target` là state cục bộ của bước 3, chạy *sau* bước 2. Nếu khai `target` bắt buộc
thì mọi request thật của trang đều 422, trang rơi vào nhánh bản nháp và **không ai thấy sai**.

Hai brief trong repo cũng mâu thuẫn nhau về chỗ này (`case-wizard-backend-b4.md:69` không có
`target`; `case-wizard-integration-b2-b4.md:23` thì có). Endpoint nhận `target` là **tuỳ chọn**
(mặc định `veo`) để theo brief mới, nhưng không bắt buộc.

Trả về:

| trường | bắt buộc | ý nghĩa |
|---|---|---|
| `prompt` | **có**, khác rỗng | `WizardPage` coi `prompt` rỗng là bước 2 "thành công rỗng", không báo lỗi |
| `script` | không | tiếng theo `language` |
| `frames[].prompt` | có | từng khung |
| `frames[].narration` | không | tiếng theo `language` |
| `task_id` | không | id TaskRun đã thu tiền |

Không gửi `index` (trang tự đánh số theo vị trí) và không gửi `title` (trang khai báo nhưng
không đọc).

Lỗi trả theo mẫu `text model error: …` đúng dạng `apiError.ts:57` đọc, để giao diện dịch sang
tiếng Việt thay vì in thẳng câu tiếng Anh. `detail` không chứa ký tự Trung.

---

## 4. Thu tiền

Đi đúng đường đã được chứng minh: `run_billed_ephemeral` (`freeze_for_task` → `billing_scope` →
`settle_task`) với `domain="wizard"`, `task_type="generate_prompt"`.

Ghi usage bằng `record_line(billing_key="llm_chat", …)` chứ **không** `record_llm_chat_line`,
vì hàm kia đóng cứng `model=get_settings().model_llm` (`billing/usage.py:104`) — dòng usage sẽ
ghi sai model so với cái thật sự gọi.

`estimate_task_fen` không cần nhánh mới cho `domain="wizard"`: rơi xuống
`charge_fen_official_llm` + buffer như mọi task LLM khác (`estimates.py:289`).

### Test bắt buộc — kết quả

| yêu cầu brief | test | kết quả |
|---|---|---|
| prompt không có ký tự Trung | `test_endpoint_returns_english_prompt_without_chinese`, `test_endpoint_reports_chinese_stripped_from_reply` | xanh |
| `charged > 0` | `test_generation_is_billed_and_refunds_the_difference` | xanh |
| `refunded == est - charged` | cùng test | xanh |

Test thu tiền đặt lại `billing_estimate_buffer = 1.2` (conftest ép `1.0`); giữ `1.0` thì
`est == charged` và phần hoàn tiền bằng 0 — assert thành vô nghĩa. Test còn kiểm tra dòng usage
đúng là `["llm_chat"]`, `model == "ling-3.0-flash-free"`, `domain == "wizard"`, và
`frozen_fen == 0` sau khi chốt.

**20 test mới, tất cả xanh.**

---

## 5. Kiểm chứng bằng chạy thật

Cổng `:8000` đang chạy từ worktree chính (`E:\novafilm\printfilm-main`), **không phải** lane
này, nên không khởi động lại nó. Dựng instance riêng của lane để kiểm chứng:

* backend của lane: `:8024` (từ `bunny-4`)
* frontend của lane: `:5194`, trỏ `VITE_API_BASE` vào `:8024`

### `openapi.json`

```
PATH:   /api/wizard/generate_prompt
SCHEMA: WizardFrameOut  WizardGeneratePromptBody  WizardGeneratePromptOut
```

### Gọi thật, đúng câu `visual-audit.mjs` gõ vào ô

```
HTTP 200 in 24s  task_id=744
content-type: application/json

subject: a young woman wearing a leather jacket
action: runs across a rainy street at night, stops in front of a small coffee shop,
        tilts her head up to look at the neon light and sighs
setting: a rainy city street at night with a small coffee shop and a neon sign
camera: smooth tracking shot following her from the side at eye level, 35mm lens,
        shallow depth of field, subtle handheld sway
lighting: low-key night lighting with neon glow reflecting off the wet pavement
style: cinematic, moody, realistic
duration: 8 seconds

Kịch bản (tiếng Việt): "Một cô gái trẻ mặc áo khoác da chạy băng qua con phố ngập trong mưa lúc đêm khuya…"
frames: 4 · CJK: False · marker Seedance: False
```

Dòng tiếng Việt hiện **sai dấu** trên PowerShell (`Má»t cÃ¡i`). Đã kiểm tra lại bằng cách decode
response thẳng ra UTF-8: `Một cô gái trẻ mặc áo khoác da…`, không có ký tự thay thế `U+FFFD`,
không có dấu hiệu mojibake. Đây chỉ là console cp1252 hiển thị, dữ liệu trên đường đi là đúng.

Dòng task thật trong DB:

```
task 744: domain=wizard type=generate_prompt status=succeeded
billing_status=settled est=0 charged=40 refunded=0
usage: key=llm_chat model=ling-3.0-flash-free domain=wizard tokens=80000 estimated=True charge=40 settled=True
```

### Trình duyệt thật (Edge headless)

Đã mở `/wizard` và bấm "Soạn kịch bản & prompt", chờ model trả lời thật:

* bước 2 hiện **Kịch bản** tiếng Việt + **Các khung hình (3)**, mỗi khung là 7 nhãn tiếng Anh
* nút trở lại `"Soạn kịch bản & prompt"` — **không kẹt** ở trạng thái loading
* bước 4 hiện đủ 3 khung, mỗi khung có lời dẫn tiếng Việt + prompt tiếng Anh + nút sao chép
* **0 uncaught exception, 0 console error**
* **1 ký tự Trung** trên trang — đó là nút chuyển ngôn ngữ `中`, đúng nền đo đã ghi ở `AGENTS.md` mục 8
* không có nhãn "bản nháp tự soạn" ⇒ đi nhánh thành công, không nhánh lỗi

Ảnh: `%TEMP%\kilo\wizard-shots\vi\{b2-timeout,b3,b4}.png`.

### `visual-audit.mjs` trên riêng route `/wizard`

```
vi /wizard → cjk=1 ; 4 bước walkthrough đều qua, 0 bước hỏng
en /wizard → cjk=1 ; 4 bước walkthrough đều qua, 0 bước hỏng
--- lai thu: 8 buoc · 8 ky tu Trung · 0 buoc van van
```

Trước khi có endpoint, bước này làm **cả lô audit dừng**. Giờ đi hết.

Lưu ý khi đọc ảnh audit của `/wizard`: `buoc-2-da-soan` chụp ngay lúc bấm nên còn hiện
"Đang soạn…", và `buoc-4-sao-chep` có thể ra "Chưa có khung hình nào để sao chép" vì script
bấm qua các bước trong vài trăm ms còn model cần 24–80s. **Đó là giới hạn của script audit, không
phải của endpoint** — bằng chứng thật là ảnh ở trên, chờ tới khi khung hình hiện ra.

---

## 6. `pytest`

```
4 failed, 1023 passed, 1 skipped, 5 warnings in 77.06s
```

4 lỗi failed **đúng bằng** baseline `AGENTS.md` và đều có sẵn từ upstream:

* `test_fragment_video_estimate.py::test_fragment_video_estimate_720p_doubles_480p`
* `test_kepu_phase_billing.py::test_videos_estimate_hd_doubles_480p_preview`
* `test_kepu_phase_billing.py::test_shot_regen_video_estimate_uses_project_hd`
* `test_kepu_shot_edit_demote.py::test_narration_edit_invalidates_continuous_audio`

Brief có nhắc 4 test `test_kira_image_channel_routing.py` hỏng sẵn trên `main`; commit
`a6096da` trên chính branch này đã sửa fixture giep trùng nên chúng đang xanh. Tổng số lỗi vẫn là
4, không tăng, không giảm.

Chạy với `--basetemp=..\.kilo\pytest` như `AGENTS.md` yêu cầu.

---

## 7. File đã đụng

| file | việc |
|---|---|
| `backend/app/services/wizard/__init__.py` | mới |
| `backend/app/services/wizard/prompt_writer.py` | mới — dựng prompt, dọn, chuỗi model |
| `backend/app/api/wizard.py` | mới — router + schema |
| `backend/app/main.py` | đăng ký router (2 dòng) |
| `backend/tests/test_wizard_generate_prompt.py` | mới — 20 test |

Không sửa file nào của lane khác, không sửa `ark.py:702`/`:729`, không xoá file nào, không
đụng module drama.

---

## 8. Việc ngoài phạm vi lane — báo board, không tự sửa

1. **`frontend/scripts/visual-audit.mjs` còn comment sai.** `:232` và `:300-302` vẫn viết
   *"endpoint `generate_prompt` chưa có nên đoạn này đang chạy đúng nhánh lỗi"*. Từ giờ
   `buoc-2-da-soan` đi nhánh thành công và nhãn "bản nháp tự soạn" biến mất khỏi ảnh. Người
   sau sẽ đi "sửa lỗi" nhầm. File dùng chung nên lane này không tự sửa.

2. **`visual-audit.mjs` không chờ request mạng ở bước walkthrough.** `WIZARD_GENERATE` bấm
   `.wizard-generate` rồi trả `true` ngay, `awaitPromise` không có tác dụng vì biểu thức không
   trả promise; `waitForSettled` chỉ chờ trang ổn định. Với endpoint cần 24–80s thì bước 4
   chụp ra "Chưa có khung hình nào để sao chép" dù backend rất tốt. Nên cho `WIZARD_GENERATE`
   trả promise đợi `.wizard-frame` xuất hiện (hoặc `.pf-error-notice`), rồi mới chụp.

3. **`estimate_task_fen` và `charge_fen_for_usage` lệch nhau 3 lần cho đường LLM.** Đo được:

   ```
   estimate_task_fen (domain=wizard)        = 123
   charge_fen_official_llm(80000)           = 102
   charge_fen_for_tokens(80000,'llm_chat')  = (40, 40)
   ```

   Freeze lấy từ bảng giá TokenFree (`billing_llm_per_m` chưa dùng tới), còn charge lấy từ
   `billing_llm_per_m = 5.0`. Bật billing thì freeze 123, thu 40, hoàn 83 — đúng công thức
   `refunded == est - charged`, nhưng người dùng bị giữ 123 rồi hoàn 83 cho một lệnh gọi 40.
   Cùng kiểu lệch này với mọi task LLM khác (`skill_optimize`, `voice_prompt`), **không riêng
   endpoint này**, nên sửa nó là đụng `estimates.py` / `pricing.py` dùng chung. Không tự sửa.

4. **`billing_enabled=false` nên cột `charged` ghi 40 nhưng số dư không đổi.** Đã kiểm tra:
   user `board-audit@novafilm.probe` sau 2 lần gọi vẫn `balance_fen=360, frozen_fen=0`. Với
   billing tắt, `freeze_for_task` trả 0 và `settle_task` vẫn ghi `charged` vào hàng cho khớp
   sổ. Không phải lỗi của endpoint, nhưng ai đọc bảng `task_runs` mà không bật billing sẽ tưởng
   bị thu tiền oan.

5. **Cần khoá Google để dùng đúng model brief yêu cầu.** Nếu board cấp lại khoá
   `generativelanguage.googleapis.com` (base `https://generativelanguage.googleapis.com/v1beta/openai`),
   chuỗi sẽ tự dùng `gemini-3-flash-preview` ở vị trí đầu, không cần sửa code. Chỉ cần thêm
   model đó vào `text-openai.models` nếu muốn router cũng thấy — endpoint này không đi qua
   router nên không bắt buộc.

6. **`WizardPage.tsx:140-142` dùng sai thông điệp.** Gọi
   `formatReferenceImageLimitMessage`, câu tiếng Việt bảo người dùng xoá ảnh ở **Canvas** —
   trang `/wizard` không dùng Canvas. Nhỏ, thuộc `bunny/2`.

7. **`docs/KIRA_ROUTING_FIX_B4.md:24` đã lỗi thời.** Ghi
   `text-openai ... base=https://generativelanguage.googleapis.com/v1beta/openai models=['gemini-3.5-flash']`;
   thực tế đã đổi sang Kira. Ai làm việc dựa trên dòng đó sẽ đi sai.

---

## 9. Còn lại

Audit **đầy đủ 26 route** đang chạy nền từ worktree này (frontend `:5194` → backend `:8024`).
Kết quả sẽ ghi thêm vào đây nếu khác với `4 failed` ở trên. Đây là lần chạy đầu tiên kể từ khi
endpoint tồn tại, nên nó là lần đầu đo được trần đủ 26 route thay vì dừng giữa chừng ở `/wizard`.