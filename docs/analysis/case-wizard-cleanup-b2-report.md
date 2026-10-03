# BÁO CÁO — `case-wizard-cleanup-b2.md`, phần 1: bảng chỉ đạo `/wizard`

Lane `bunny/2` · ngày 2026-10-03 · phạm vi: **chỉ phần 1**, phần 3 (lint) đã có trên `main` nên không đụng.

---

## 0. Tóm tắt

Bảy thẻ ở bước 4 **không còn sao chép trùng nhau**. Đo được, không suy ra:

| | Bản cũ (quét từ khoá) | Bản mới (đọc nhãn) |
|---|---|---|
| Số giá trị xuất hiện ở **nhiều hơn một thẻ** | **15** | **0** |
| Số khung đọc được cấu trúc | 0 (cấu trúc bị xé vụn thành 40 mệnh đề) | **3 / 3** |
| Dòng không thuộc bảy trường | 10 mệnh đề rơi vào `style` | **0** |
| Thẻ `Hành động` có bao nhiêu khung | **2 / 3** (mất hẳn một khung) | **3 / 3** |

Chạy `POST /api/wizard/generate_prompt` thật: HTTP 200 sau **102.9 s**, trả về 4 `frames`,
mỗi `frames[].prompt` là **đúng bảy dòng `nhãn: giá trị`**. Bảng dựng từ đó ra 7 thẻ đầy,
không trùng ô nào.

Ảnh: `frontend/.kilo/wizard-real/vi-light-real-output.png` (kết quả mô hình thật) và
`frontend/.kilo/wizard-board/vi-light-5-bang-chi-dao.png` (nhánh bản nháp, endpoint bị chặn).

---

## 1. Brief sai ở đâu, và vì sao điều đó lại thành đường đi

Brief dặn *"đọc đúng cấu trúc mà LLM trả về, đừng đoán"*, rồi chỉ vào
`episode_batch_content_system` trong `ark.py` và nói các trường `title / text / camera / bgm /
segments` là đã tách sẵn. **Chỗ này không đúng**, và đo ra thì rõ:

- Không có file `ark.py`. Tên hàm đúng là `episode_batch_content_system`, nhưng nó nằm ở
  `backend/app/services/drama/agents.py:372`.
- Cấu trúc nó trả về là `{"episodes": [{"episodeNumber", "title", "creative", "summary",
  "content"}]}` (`agents.py:391-398`). **Không có** `text`, `camera`, `bgm`, `segments`, và
  cũng không có `scene` mà brief nhắc ở phần "Ánh sáng/Phong cách".
- Quan trọng hơn: `/wizard` **không đi qua** hàm đó. Endpoint là `app/api/wizard.py` →
  `app/services/wizard/prompt_writer.py`.

Cấu trúc thật của `/wizard` nằm ở `prompt_writer.py`, và nó **đã tách sẵn đúng những gì brief
đòi đọc**:

| nơi | nói gì |
|---|---|
| `build_messages()` (`prompt_writer.py:260`) | bắt model trả `{"script", "prompt", "frames":[{"narration","prompt"}]}`, mỗi prompt là **danh sách nhãn tiếng Anh, mỗi nhãn một dòng**, từ `subject:` tới `duration:` |
| `PROMPT_FIELDS` (`prompt_writer.py:96`) | 7 tên trường, **thứ tự cố định** |
| `normalize_prompt()` (`prompt_writer.py:204`) | dựng lại đúng `PROMPT_FIELDS` theo thứ tự đó và **loại mọi dòng không phải nhãn đã biết** |

Nên `WizardFrameOut.prompt` mà trang nhận về **đã là cấu trúc**, không phải văn xuôi. Bản
"quét từ khoá" cũ vừa chậm vừa sai, và tệ nhất là **bịa thêm**: `FALLBACK_FIELD = 'style'`
dán mọi mệnh đề không khớp quy tắc nào vào thẻ Phong cách.

Đo trên ảnh chụp thật (Edge headless + CDP, `/wizard` ở `http://127.0.0.1:5183`), ba ví dụ mà
bản cũ đặt sai thẻ — lấy nguyên văn từ lượt gọi thật:

| giá trị | bản cũ đặt ở | đúng là |
|---|---|---|
| `A low-angle close-up on a 85mm lens` | `action` **và** `camera` | chỉ `camera` |
| `Night ambient light reflecting off the wet pavement` | `setting` **và** `lighting` | chỉ `lighting` |
| `A rain-soaked city street at night` | `setting` **và** `camera` | chỉ `setting` |

Nghĩa là bấm "Sao chép" ở thẻ *Hành động* sẽ dán cho người dùng một chỉ dẫn về ống kính. Đó là
lỗi nặng hơn hẳn so với ô trống.

---

## 2. Đã làm gì

### `frontend/src/pages/wizard/artDirection.ts` — viết lại
- Bỏ toàn bộ `RULES` (7 mảng regex từ khoá), `FALLBACK_FIELD`, `splitClauses`, `matchClause`.
- Thêm `parsePromptFields()` đọc dòng `nhãn: giá trị`. Regex **sao y hệt**
  `_LABEL_PREFIX_RE` ở `prompt_writer.py:140`: cùng nhận `- * •`, cùng nhận `**bọc đậm**`,
  cùng nhận `:` và `：`, cùng chấp nhận `Depth of Field : …`. Phải khớp chứ không "gần giống" —
  lệch thì trình duyệt hiện một trường mà backend đã loại.
- Nhãn lặp trong một prompt: giữ lần đầu, y hệt `_label_values()` ở backend.
- Mỗi trường của mỗi khung vào **đúng một ô**. Không có đường để một giá trị rơi vào hai thẻ.
- `ArtDirectionBoard` đổi số đo: `clauses / unmatched / unplaced` → `labelled / unlabelled /
  stray`. Số đo cũ là của thiết kế cũ; số mới đo đúng thứ đang xảy ra.

### `frontend/src/pages/wizard/WizardPage.tsx`
- `DRAFT_FRAMING` + `DRAFT_PER_FRAME` (hai hằng **văn xuôi**) → `DRAFT_FIELDS`, bốn giá trị
  **theo trường**. Lý do: bảng đọc nhãn, nên một hằng văn xuôi không rơi vào ô nào và bảng
  trống trơn. `subject` và `setting` **không** có trong `DRAFT_FIELDS` — bản nháp không có nhân
  vật, không có địa điểm, và thừa trống còn hơn bịa.
- `buildLabelledPrompt()` ghép dòng theo `BOARD_FIELDS`, là **một** nguồn duy nhất khớp
  `PROMPT_FIELDS` ở backend.
- `normalizeFrames()`: khi `frames` vắng mặt mà `prompt` **có** nhãn thì giữ nguyên làm một
  khung. Trước đây `splitSentences()` cắt nó thành văn xuôi — nghĩa là backend trả về cấu
  trúc, frontend lại xé nó ra.
- Bảng hiện thêm dòng cảnh báo khi có khung không tách được trường nào, kèm khóa
  `wizard.board.unlabelledFrames` ở cả ba locale. Không có dòng này thì ô trống của những
  khung đó sẽ bị đọc nhầm là "bảng đã đầy".

### `frontend/scripts/wizard-board-check.mjs`
Bất biến cũ ("mệnh đề phải còn ở ít nhất một thẻ") là bất biến **của thiết kế cũ**, và nó đã bỏ
lọt chính lỗi cần bắt: một câu nằm ở ba thẻ vẫn là "còn". Thay bằng ba điều đo được trên DOM:

| tên | nghĩa |
|---|---|
| `lost` | cặp `nhãn: giá trị` nào rơi khỏi thẻ của nó |
| `misplaced` | giá trị của nhãn X nằm ở thẻ `data-field != X` |
| `duplicated` | một giá trị nằm ở **hai thẻ khác nhau** |

Đo trên DOM đang render, cắt lại bằng regex riêng — dùng lại hàm của mã nguồn thì chỉ chứng
minh mã nguồn tự nhất quán với chính nó.

Một cái bẫy đã sửa luôn: `duplicated` so **tập thẻ khác nhau**, không so số ô. Model viết
cùng một chủ thể cho cả ba khung là **đúng** (cùng một nhân vật) và đó là ba ô *trong cùng một
thẻ*; đếm ô thì lần chạy với kết quả thật sẽ báo trùng oan.

---

## 3. Đo

Đều chạy trên Edge headless thật tại `http://127.0.0.1:5183/wizard`, backend thật ở `:8000`.

| lệnh | kết quả |
|---|---|
| `npm run build` | `✓ built in 1.43s`, 0 error |
| `npm run lint` | 0 error, 40 warning — đúng baseline `AGENTS.md` mục 4 |
| `node scripts\wizard-board-check.mjs` | **DAT**, cả `vi`+`en` × sáng+tối. 7 thẻ · 5 có nội dung · 1 nút lớn · `status/polite` · `truong 5/5 dung the cua no` · rõ (Copy tắt): `subject, setting` |
| `node scripts\wizard-copy-ux-check.mjs` | **DAT** — bảng không bị đẩy khi lỗi báo hiện, toast tự tắt |
| `node scripts\wizard-cls-check.mjs` | `Worst CLS cdn=0 no-cdn=0`, 10/10 bước |
| `node scripts\wizard-dom-contract.mjs` | **DAT** — mọi selector bắt buộc còn và đều hiện |
| `node scripts\wizard-contrast-check.mjs` | `Tong 464 cap · khong dat AA 0` |
| `node scripts\wcag-contrast-check.mjs --base http://127.0.0.1:5183 --route "/wizard"` | `/wizard: 41 chu · 0 khong dat AA` |
| `AUDIT_ONLY=/wizard node scripts\visual-audit.mjs` | **`8 buoc · 8 ky tu Trung · 0 buoc van van`** — đạt đúng điều kiện nghiệm thu của brief |

Kết quả mô hình thật (`frontend/.kilo/wizard-real/vi-light-real-output.png`):
`7 trên 7 trường có nội dung`, dòng cảnh báo không hiện (vì không khung nào thiếu cấu trúc).

Về 8 ký tự Trung: đó là nút `中` trong bộ chuyển ngôn ngữ, `+1` mỗi trang, đã ghi ở
`AGENTS.md` mục 8. Không phải nội dung chưa dịch.

### Biến số đo được ngoài phạm vi lane
`wizard-cls-check.mjs` mặc định trỏ `http://127.0.0.1:4173` — tức `vite preview`, không phải
`npm run dev`. Trỏ nhầm sang dev server thì lượt chạy chết ở `buoc 1` với
`khong thay .wizard-actions .pf-btn sau 45s`: script cố tình bóp băng thông về Fast 3G và tắt
cache, mà dev server của Vite không bundle — hàng trăm request module riêng không kịp 45 s.
Không phải hồi quy, nhưng là cái bẫy mất một lượt chạy. Cứ chạy nguyên lệnh, không đổi `BASE`.

---

## 4. Phần 2 — **không sửa gì, và đây là kết luận có số**

Brief yêu cầu bỏ "vòng tròn A (avatar) và badge 0 cạnh Trợ giúp — không có chức năng gì".
Đo trên DOM đang render thì **cả hai mô tả đó không khớp hiện trạng**:

**(a) Badge "0": không tồn tại.** Quét toàn bộ phần tử có `textContent === "0"` trên
`/wizard` (bỏ qua `display:none` và khung 0×0):

```
--- moi phan tu van ban dung bang "0" tren trang ---
[]
```

Toàn bộ `.pf-nav-right` render ra là:

```
<div class="pf-nav-lang">…VI 中 EN…</div>
<button class="pf-nav-help-btn" title="Trung tâm trợ giúp">…<span>Trợ giúp</span></button>
<button class="pf-avatar" title="audit · Tài khoản"><span class="pf-user-avatar …">A</span></button>
<button class="pf-btn pf-btn-lime pf-btn-sm pf-btn-icon">Bắt đầu sáng tạo</button>
<button class="pf-nav-burger" …>
```

Không có badge, không có hạt số nào. `SiteNav.tsx:106-148` là **toàn bộ** thanh trên cùng —
không có nhánh nào vẽ badge.

**(b) Vòng tròn "A": là avatar thật, có chức năng thật.** Nó là `pf-avatar` bấm đi `/settings`,
`title="audit · Tài khoản"` hiện tên người dùng, và `UserAvatar.tsx:18` dựng chữ cái đầu của
nickname khi không có ảnh. Bỏ nó là bỏ đường vào trang tài khoản trên **cả 25 route**, không
phải dọn một phần tử rác.

Nó lại nằm trong `SiteNav.tsx` — layout dùng chung qua `AppShell` — mà brief tự dặn *"nếu
chúng thuộc layout dùng chung thì báo board, đừng tự sửa file chung"*.

**(c) Đã tìm cả ở trang quản trị, cũng không có.** `AdminLayout.tsx:416` có một
`admin-icon-btn` với icon `Bell`, cũng không badge và cũng không handler — nhưng nó không nằm
cạnh "Trợ giúp" và không ở `/wizard`. Hai cây mã khác nhau, không phải một.

### Nghi phóng đoán
Nav hiện tại đã qua `40c1734` *"fix(design): unbreak nav wrapping…"* và `cb9818f` *"feat(vi):
finish the shared UI kit…"*. `git log -- frontend/src/components/layout/SiteNav.tsx` cho thấy
**không có commit nào từng thêm badge** vào file này. Nên khả năng cao nhất: ảnh trong brief
lấy từ một bản dựng cũ, không phải từ code hiện tại.

### Cách đo
Edge headless + CDP, đăng nhập bằng tài khoản thử, ép `localStorage['novafilm.locale']='vi'`,
điều hướng `http://127.0.0.1:5183/wizard`, rồi:

- in `document.querySelector('.pf-nav-right').outerHTML` (nguyên văn ở mục 4a);
- quét `document.querySelectorAll('body *')`, lấy phần tử **không có con**, `textContent`
  cắt trắng đúng bằng `"0"`, khung hiện hữu (`width ≥ 1 && height ≥ 1`), không
  `display:none` / `visibility:hidden`.

Cả hai lần in ra ở trên. Ảnh `frontend/.kilo/wizard-real/vi-light-real-output.png` cũng thấy
thanh trên cùng: chỉ có `中` trong bộ chuyển ngôn ngữ, không badge.

---

## 5. Cần board quyết

1. **Phần 2 chưa làm được gì, và không nên làm bừa.** Hai phần tử mà brief mô tả: một không
   tồn tại ở cả hai cây mã, một là avatar thật đang hoạt động trong layout dùng chung. Trước khi
   có việc gì để làm thì cần board chỉ lại mục tiêu — xem mục 4.
2. **`DRAFT_FIELDS` là tiền đề cho bản nháp.** Nó tự điền `camera / lighting / style /
   duration` bằng giá trị hằng, và để `subject` / `setting` trống vì không có dữ liệu. Nếu
   board muốn bản nháp có đủ bảy trường thì phải cho nhân vật và bối cảnh vào ý tưởng — đó là
   việc thiết kế khác, không phải việc dịch câu.
3. **`stray` đang đo mà chưa hiện ra mặt.** Không có khung nào rơi vào nhánh này với đầu ra
   thật của backend (`normalize_prompt()` đã loại sạch dòng lạ), nên hiện ra cũng chỉ là số
   `0`. Muốn hiện thì cần một quyết định về câu chữ; bỏ thì bỏ.
4. **Nhịp gọi mô hình thay đổi.** Đo hôm nay: `102.9 s` cho một lượt, và một lượt khác
   vượt `280 s`. Chuỗi model trong `prompt_writer.py:84` thử `gemini-3-flash-preview` trước
   (403 rồi thử tiếp). Nợ kỹ thuật `vi/script` chậm ở `AGENTS.md` mục 10 vẫn đúng, và `/wizard`
   còn tệ hơn vì gọi tới bốn model.