# BÁO CÁO — Hoàn tất hiển thị Bảng chỉ đạo Prompt ở `/wizard`

Lane `bunny/2` · commit `3f1cde4`, `d70a59d`, `d9a8cd0` · ngày 2026-10-03
Brief: `docs/briefs/case-prompt-board-finish-b2.md`

---

## 0. Tóm tắt: brief đã sai ở một chỗ, và phần nó nói là "còn lại" đã có sẵn

Brief mở đầu bằng câu *"Hạ tầng đã có, không viết lại … Việc còn lại là phần hiển thị"*.
Đo lại thì **phần hiển thị đã có từ trước** — commit `481763d` trên chính lane này đã dựng
đủ bảng bảy thẻ, nút Copy từng thẻ, nút Copy tất cả, vùng `role="status"`, và CSS.
Kiểm lại bằng `wizard-board-check.mjs`: 7/7 thẻ, 9/9 mệnh đề còn lại trên ít nhất một
thẻ, 1 nút lớn, `status/polite`, cả `vi` lẫn `en`, cả theme sáng lẫn tối.

Nên phần thật sự còn lại không phải "dựng bảng", mà là **ba lỗi của lời báo** và một
**xanh giả trong công cụ đo**. Chi tiết ở mục 2 và 3.

Một chỗ brief **không khớp** hiện trạng và đã được sửa theo đúng brief: mục 3 yêu cầu
toast nguyên văn `"Đã chép Prompt cấu hình, sẵn sàng render!"`, còn mã đang dùng câu khác.
Câu brief đã được đặt vào mã, và **ép kiểm** luôn (mục 4, mục D7).

---

## 1. Ảnh chụp thật — bốn bước, đã đi qua Edge

Bốn bước đều mở thật ở `http://127.0.0.1:5183/wizard`, chụp bằng Edge headless + CDP.

| Ảnh | Nội dung |
|---|---|
| `docs/images/image-20261003-wizard-vi-b1.png` | Bước 1 · ảnh tham chiếu |
| `docs/images/image-20261003-wizard-vi-b2.png` | Bước 2 · ý tưởng |
| `docs/images/image-20261003-wizard-vi-b3.png` | Bước 3 · đã soạn (bản nháp trình duyệt) |
| `docs/images/image-20261003-wizard-vi-b4.png` | Bước 4 · đích đến và giọng |
| **`docs/images/image-20261003-wizard-vi-board.png`** | **Bảng chỉ đạo, 7 thẻ, nút Copy từng thẻ + "Sao chép tất cả"** |
| **`docs/images/image-20261003-wizard-vi-toast.png`** | **Sau cú bấm Copy — lời báo hiện, bảng không dịch chuyển** |
| `docs/images/image-20261003-wizard-vi-board-dark.png` | Cùng bảng ở theme tối |
| `docs/images/image-20261003-wizard-audit-buoc4.png` | Ảnh bước 4 **của `visual-audit.mjs`** — trước đây bảng này trống |

So sánh `…-vi-board.png` với `…-vi-toast.png`: y của tiêu đề "Bảng chỉ đạo nghệ thuật"
và của hàng thẻ thứ nhất **giống hệt nhau**. Đó là ảnh chứng minh lời báo không đẩy bảng.

---

## 2. Ba lỗi thật của lời báo — `wizard-copy-ux-check.mjs`, commit `3f1cde4`

Chạy script trước khi sửa: **4 vi phạm**. Sau khi sửa: **0**.

| | Trước | Sau | Nguyên nhân |
|---|---|---|---|
| **A** | `display: none`, `axTree=false` | `display: block`, `axTree=true` | `:empty { display: none }` **rút vùng sống khỏi cây trợ năng** đúng lúc nó cần có mặt. `role="status"` là hình thức. |
| **B** | bảng nhảy **55px** mỗi lần bấm Copy | **0px** | Toast nằm trong luồng, ngay trên lưới thẻ. Nay là `position: fixed` + `pointer-events: none`. |
| **C** | 6 giây sau vẫn còn nguyên văn bản | **đã đi** | `copyTimer` chỉ `setCopied('')`, **không** `setToast('')`. Tức là nó là một *biển báo*, không phải toast. |
| **E** | im lặng, vùng sống còn vương câu thành công của lần trước | **"Không sao chép được. Bôi đen phần bạn cần rồi copy thủ công."** | `catch` chỉ set cờ, không gọi `announce`. Lỗi sao chép đáng để nghe hơn thành công. |

Cả bốn đều là **vấn đề thật**, không phải thẩm mỹ:

- A là điều kiện để thông báo được đọc. Vùng `aria-live` không có trong cây trợ năng thì
  không có gì để so sánh, phần lớn trình đọc màn hình im lặng. Brief gọi đây là điều
  kiện WCAG — và trước khi sửa thì nó **không** là điều kiện.
- B đo bằng `getBoundingClientRect()` trước/sau cú bấm ở một thẻ nằm ở hàng thứ hai:
  thứ người dùng đang nhìn cũng nhảy theo.
- C cũng chính là lý do C phải đi kèm E: sửa C xong thì vùng sống trống thật, lúc đó E
  mới lộ ra là im lặng. Hai lỗi này không thấy cùng lúc.

Cơ chế `copyTimer` / `copyFailed` / `announce` **giữ nguyên** như brief yêu cầu; chỉ
`wizard.css` (`.wizard-toast`) và phần cuối của `copyText` đổi.

### Câu chữ toast

| Khoá | Locale | Câu |
|---|---|---|
| `wizard.export.toastAll` | `vi` | **`Đã chép Prompt cấu hình, sẵn sàng render!`** (nguyên văn brief) |
| `wizard.export.toastAll` | `en` | `Prompt copied, ready to render!` |
| `wizard.export.toastAll` | `zh` | `提示词已复制，可以直接渲染。` |
| `wizard.export.toastFailed` | `vi`/`en`/`zh` | câu báo lỗi sao chép, mới |

**`toastField` và `toastFrame` giữ nguyên** — chúng nói rõ **thẻ nào** vừa được chép,
đó là lý do tồn tại của chúng, và brief không yêu cầu gộp về một câu. Nếu board muốn ép
cả ba về một câu thì rất nhanh.

---

## 3. Xanh giả trong `visual-audit.mjs` — commit `d70a59d`

`AUDIT_ONLY=/wizard` in ra `8 buoc · 0 buoc van van` **trước khi** tôi đụng gì. Nhưng
ảnh bước 4 lúc đó chụp đúng dòng:

> Chưa có khung hình nào để sao chép.

Tức là **không có bảng**, và dòng tổng kết vẫn báo xanh. Đây đúng thứ brief cấm: có
bằng chứng, nhưng bằng chứng của cái rỗng.

**Nguyên nhân, đo được:** `POST /api/wizard/generate_prompt` **tồn tại** và gọi mô hình
thật. Tôi gọi thử bằng tay: **62,3 giây** cho một ý tưởng, trả về 3 khung hợp lệ.
`waitForSettled` chỉ chờ văn bản **đứng yên** — mà trong lúc chờ mạng thì văn bản vẫn
đứng yên, nên audit kết luận "ổn định" rồi chụp. Hai cú bấm "Tiếp tục" đưa sang bước 4
**trước khi** lệnh gọi quay về.

**Cách sửa:**
1. Chặn endpoint đó cho cả lô, đúng cách `wizard-board-check.mjs` và
   `wizard-cls-check.mjs` vốn đã làm. Bước 2 đi nhánh dựng bản nháp trong trình duyệt,
   bảng dựng ra ngay. Đổi lại audit không còn phụ thuộc một lệnh gọi mô hình 62 giây —
   đúng thứ AGENTS.md nêu là nguyên nhân hai lần chạy cho hai con số khác nhau.
2. Thêm `after` tuỳ chọn cho mỗi bước lái thử: chờ **có mặt**, không phải **đứng yên**.
   Không có nó thì một bước hỏng vẫn ra ảnh trống rồi báo xanh.

**Selector audit bấm không đổi:** `.wizard-actions .pf-btn`, `.wizard-textarea`,
`.wizard-generate`. Vẫn đúng 4 bước × 2 locale = **8 bước**.

---

## 4. Nghiệm thu — tất cả là số đo, không phải mắt thường

### Môi trường
Backend `:8000` khoẻ (`{"ok":true,"app":"NOVAFILM"}`) · Vite dev của lane ở `:5183` ·
Edge headless + CDP (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`).
Endpoint soạn prompt bị **chặn có chủ đích** ở mọi lượt lái thử, để bảng dựng tức thì
và để lượt đo không phụ thuộc mô hình.

### D1 · `npm run build`
`tsc -b && vite build` → **0 lỗi**, `✓ built in 1.06s`.

### D2 · `npm run lint`
**0 error / 42 warning.**
Trước khi tôi bắt đầu: 0 error / **44** warning. Tôi xoá 2 warning thuộc lane này
(`wizard-copy-ux-check.mjs`, chỉ có ở `bunny/2`). 42 warning còn lại nằm ở file của lane
khác đã merge (`pages/drama/*`, `pages/studio/*`, `i18n/context.tsx`) — mục tiêu 40 trong
brief đã lỗi thời so với các lần merge đó, và không thuộc lane này để sửa. Tôi không
đụng `frontend/src/styles/**`: đếm `.pf-` trước **1312**, sau **1312**.

### D3 · `AUDIT_ONLY=/wizard`
```
--- lai thu: 8 buoc · 8 ky tu Trung · 0 buoc van van
```
8 bước — đúng con số brief đòi. 0 bước còn lại. `cjk=1` mỗi trang là nút chuyển ngôn ngữ
hiện chữ `中`, đúng như AGENTS.md mục 8 ghi.

### D4 · Audit đầy đủ 26 route (để chắc `d70a59d` không làm hỏng route khác)
```
vi: 26 route · 78 ky tu Trung · 0 route API CHET · walk 8 buoc · 0 buoc van van
en: 26 route · 76 ky tu Trung · 0 route API CHET
```
Không route nào bị bỏ qua. `marker Seedance` = 8 mỗi locale (cấm dịch, đúng hợp đồng).
Phần dư là nội dung kịch bản **trong database** ở `/drama/projects/65/*` (30/12/12) và
`/settings` — không phải giao diện, đúng như AGENTS.md mục 10 đã ghi.

### D5 · `wizard-board-check.mjs` → **DAT**
Cả 4 tổ hợp `{vi,en} × {light,dark}`: `7 the · 7 co noi dung · nut lon 1 ·
toast status/polite · menh de 9/9 con lai tren it nhat mot the`.

### D6 · `wizard-copy-ux-check.mjs` → **DAT** (trước khi sửa: 4 vi phạm)
```
A. Vung song luc RONG     display block   chi cao 0px · axTree=true
B. Bang co bi DAY         shift 0px       position:fixed
C. Loi bao tu di          sau6s da di
D. Co che hen khi tab AN  raf/timer LOI_BAO · visibility=hidden
E. Loi bao khi THAT BAI   "Không sao chép được. Bôi đen phần bạn cần rồi copy thủ công."
F. Hop dong selector      actions: 1 nut · nut sao chep lot trong actions: 0
G. Cau toast cua nut lon  "Đã chép Prompt cấu hình, sẵn sàng render!"
```

### D7 · Câu chữ brief giờ là **bất biến được kiểm**, không phải lời hứa trong commit
Mục G mới của `wizard-copy-ux-check.mjs` ép đúng nguyên văn brief và phủ định mọi câu
dạng `đang tạo|render|quay` — vì không có API video nào chạy được, nói vậy là nói dối.

### D8 · `wizard-contrast-check.mjs`
```
Tong 456 cap · tren nen phang 456 · khong dat AA 0
toast  light 15.79 / can 4.5  DAT   dark 11.72 / can 4.5  DAT
```
Cả hai locale, cả hai theme.

### D9 · `wizard-cls-check.mjs`
Chạy với `BASE` trỏ vào **bản build production** (`vite preview` `:5193`) → **CLS = 0** ở
cả 5 bước, cả hai nhánh `cdn` / `no-cdn`. `position: fixed` không làm dịch layout.

> **Ghi chú trung thực về cách chạy:** lần đầu tôi chạy script này với `BASE` là dev
> server `:5183` và nó **hỏng** — `khong thay .wizard-actions .pf-btn sau 45s`. Nguyên
> nhân là script ép mạng 1,6 Mbps + `setCacheDisabled`, còn Vite dev phục vụ hàng trăm
> module ES rời, mỗi cái một request; trên máy đang chạy song song nhiều lane (~196
> tiến trình Edge lúc đó) thì 45 giây không đủ. **Đây không phải hồi quy của tôi** — các
> script khác (`board-check`, `copy-ux-check`, `visual-audit`) đi qua bước 1 với cùng
> code đó, và bước 1 không chạm vào bất kỳ thứ gì tôi sửa. Chạy lại với bản build là xanh.

---

## 5. File đã đụng

| File | Nội dung |
|---|---|
| `frontend/src/pages/wizard/WizardPage.tsx` | `TOAST_MS`; `copyText` huỷ **cả** nhãn lẫn vùng sống và báo cả nhánh lỗi |
| `frontend/src/pages/wizard/wizard.css` | `.wizard-toast` thành toast cố định; `:empty` rút gọn thay vì `display: none` |
| `frontend/src/i18n/locales/{vi,en,zh}/pages.ts` | `toastAll` theo brief; thêm `toastFailed` |
| `frontend/scripts/visual-audit.mjs` | Chặn endpoint soạn prompt; `after` + `waitForSelector` cho bước lái thử; `STEP_READY_TIMEOUT_MS` |
| `frontend/scripts/wizard-copy-ux-check.mjs` | Mục G; dùng 2 giá trị trước đây bỏ không; bỏ tham số thừa |
| `docs/images/image-20261003-wizard-*.png` | 8 ảnh bằng chứng |

**Ngoài phạm vi lane, nhờ board xử lý — tôi không tự sửa:**

1. **`wizard-cls-check.mjs` thiếu token.** Nó không `localStorage.setItem('token', …)`
   trong khi `board-check` và `copy-ux-check` đều có. `/wizard` hiện chưa bắt buộc đăng
   nhập nên chưa lộ ra, nhưng ngày nào `/wizard` bị khoá sau `RequireAuth` thì script
   chết ngay ở bước 1 với thông báo dễ chẩn đoán sai. Sửa một dòng.
2. **`wizard-cls-check.mjs` chạy với dev server là không khả thi** vì ép mạng 1,6 Mbps.
   Nên ép `BASE` vào `vite preview` trong chính script, hoặc bỏ `setCacheDisabled` ở
   chế độ có CDN.
3. **Mốc lint 40 trong brief đã lỗi thời** so với code đã merge (thực tế 42 sau khi tôi
   dọn xong phần của lane). Nên lấy lại baseline một lần cho cả ba lane rồi ghi vào
   `AGENTS.md` mục 4 — hiện mục 4 ghi "1 error + 40 warning" trong khi thực tế là 0 error.
4. **`generate_prompt` mất 62 giây cho một ý tưởng** (đo tay, `mimo-v2.6-flash-free`).
   `vi/script` chậm đã có trong AGENTS.md mục 10; con số này nên vào cùng chỗ.
5. **Dải CJK còn lại ở `/drama/projects/65/*`** là nội dung kịch bản trong database
   (30/12/12). Đã ghi ở AGENTS.md mục 10, chỉ nhắc lại là nó **không** phải nợ UI.

---

## 6. Điều tôi **không** làm, có chủ đích

- **Không** đụng `styles/**`, `api.ts`, `billing`, hay backend. Đếm `.pf-` trước/sau bằng
  nhau để chứng minh.
- **Không** đổi tên bất kỳ selector nào của audit — brief §6 cấm, và
  `wizard-copy-ux-check.mjs` mục F vẫn khẳng định `.wizard-actions` chỉ còn **một** nút
  là "Quay lại", không có nút sao chép nào lọt vào đó.
- **Không** gộp `toastField` / `toastFrame` về một câu chung (xem giải trình ở mục 2).
- **Không** đụng `AGENTS.md` mục 10 dù có phát hiện mới — đó là của board.
