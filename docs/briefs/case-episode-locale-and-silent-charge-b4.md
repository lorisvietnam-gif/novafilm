# BRIEF — bunny/4 — 5 khoản nợ đã đo được, đều có đường dẫn

Năm việc. Mỗi việc đều có bằng chứng đo, không phải phỏng đoán. **Đo lại trước khi sửa.**

---

## 1 — `episode_script` không nhận locale (nguyên nhân gốc)

**Đo được:** project 28 tạo với `locale:"vi"`, task 798 `succeeded` `charged=480`,
nhưng `episode_content` ra `ep1 cjk=783 · ep2 cjk=859 · ep3 cjk=967` — **tiếng Trung**.
Trong khi `content/expand` cùng lúc đó ra `Cô gái giao hàng đêm` — đúng tiếng Việt.

**Nguyên nhân:** bản vá locale trước (commit `28af98f`) chỉ sửa `ark.py:702` và `:729`.
Prompt của đường `episode_script` **không nằm ở đó** mà là **hằng số cấp module** trong
`app/services/drama/agents.py`:

- `EPISODE_OUTLINE_SYSTEM`
- `EPISODE_SUMMARY_FROM_CREATIVE_SYSTEM`
- `EPISODE_BODY_FROM_BRIEF_SYSTEM`
- `EPISODE_BATCH_CONTENT_SYSTEM`
- `EPISODE_OPTIMIZE_SYSTEM`
- `EPISODE_BRIEF_FROM_BODY_SYSTEM`

Cần làm:
1. Đổi 6 hằng số đó thành hàm dựng theo `locale`. **Tái dùng `_OUTPUT_LANGUAGE_NAMES`/
   `_OUTPUT_LANGUAGE_NOUNS` đã có trong `ark.py` — cấm viết bảng thứ hai.**
2. Truyền `locale` từ `run_episode_scripts_job` xuống các hàm gọi chuỗi.
3. **Quan trọng:** các prompt thử lại còn viết cứng
   `f"每集 content 约 {...} 汉字（不少于 {...}）"`. Khi `locale != "zh"` phải bỏ chữ **汉字**,
   nếu không LLM vẫn bị kéo về tiếng Trung dù system prompt đã đổi.

---

## 2 — Parser nuốt tập im lặng (sinh ra `epNone`)

**Đo được:** project 17 có một tập với `episodeNumber = None`.

`agents.py:546-571` và `484-500`:
```python
number = int(item.get("episodeNumber") or 0)
if number < 1: continue        # rác im lặng, không log, không cảnh báo
```
Tập bị bỏ thì **không bao giờ** được tính là "thiếu", nên **không bao giờ** được sinh lại —
mất vĩnh viễn, không có dấu vết.

Cần làm: đếm và **ghi log cảnh báo** số item bị bỏ vì `number < 1`. Không sửa logic bỏ —
chỉ làm cho nó **nói ra**.

---

## 3 — Thu tiền cho tác vụ không ghi được gì

**Đo được:** task 811 `succeeded`, `charged=40`, nhưng `episode_content` **không đổi** và
`status` vẫn `completed`.

Cơ chế nghi ngờ (cần xác nhận khi chạy thật): `jobs.py:566`
```python
if _content_char_len(body) >= MIN_EPISODE_CONTENT_CHARS:
    continue        # nội dung cũ đủ dài -> bỏ qua, nhưng vẫn settle
```
`force=true` không vô hiệu hoá điều kiện này.

**Nguyên tắc bắt buộc — đây là điều quan trọng nhất của brief:**
> Ghi xong mà `episode_content` **không đổi hoặc rỗng** ⇒ **HOÀN TIỀN + báo lỗi**,
> tuyệt đối không settle.

Lưu ý: **điều kiện phải là "không có gì thay đổi", KHÔNG phải `try/except`.** LLM không
ném exception — nó trả rác, parser nuốt rác, không có gì để bắt. So sánh trước/sau mới
là cách duy nhất bắt được.

---

## 4 — Thiếu dự phòng model chữ

**Đo được:** task 810 `failed` với
`文字模型 mimo-v2.6-flash-free 上游网关超时或暂时不可用（HTTP 504）`.
Đo lại cùng lúc: `mimo` 200/2,11s · `hy4` 200/3,99s · `hy3` 200/1,43s ·
`qwen3.8-flash-next-free` 200/2,87s — **bốn model đều sống**.

Hiện chỉ đăng ký một model chữ nên nó chết là hệ thống chết. Thêm các model còn sống làm
ứng viên dự phòng. **Cơ chế ứng viên đã có** (`resolve_logical_model_candidates` sắp theo
`sort_order` rồi `priority`) — không viết mã rẽ nhánh riêng.

---

## 5 — Đo lại tiêu chí "nội dung đã đủ"

`MIN_EPISODE_CONTENT_CHARS = 450` đang đếm **ký tự**. Với nội dung tiếng Việt, cùng 450
ký tự nhưng ít thông tin hơn nhiều; với tiếng Trung thì nhiều hơn. Cân nhắc đo theo
`_content_char_len` hiện có thay vì `len`, và **đo lại trên nội dung tiếng Việt** trước khi
đổi con số. Không đo thì giữ nguyên.

---

## Ràng buộc

- **Cấm** viết bảng ngôn ngữ thứ hai; **cấm** thêm `if locale ==` rải rác.
- **Cấm** dịch marker Seedance (`【字幕】`, `【旁白·…】`, `@duration:N`, `△`, `空镜`).
- **Cấm** sửa `settlement.py:289-299` cho "chạy cho có" — nhánh đó có chủ đích.
- `pytest` không được vượt `4 failed, 975 passed, 1 skipped`.
- **Đồng bộ `main` trước khi bắt đầu.**
- Báo cáo ra FILE rồi **COMMIT** trước khi kết thúc (`AGENTS.md` mục 11).

## Nghiệm thu
- Tạo dự án mới với `locale=vi`, sinh tập, đo `episode_content` ⇒ **0 ký tự Trung trong nội dung**.
- Marker vẫn giữ nguyên tiếng Trung.
- Tác vụ không ghi được gì ⇒ **hoàn tiền**, ví không đổi.
- `main` còn khoá text chết ⇒ sửa kênh hoặc bỏ khỏi danh sách.