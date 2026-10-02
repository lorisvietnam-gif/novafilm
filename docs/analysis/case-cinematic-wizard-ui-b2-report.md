# Bảng chỉ đạo nghệ thuật + Champagne Gold — `/wizard` bước 4

Báo cáo thi hành `docs/briefs/case-cinematic-wizard-ui-b2.md`.

- **Lane:** Bunny 2 · `D:\novafilm-lanes\bunny-2` · branch `bunny/2`
- **Cổng dev của lane:** `:5183` (không dùng `:5173` — cổng đó bị lane khác giữ)
- **Commit:** xem `git log -1` trên `bunny/2` (nội dung báo cáo nằm trong chính commit này)
- **Backend:** `:8000` dùng chung, `/api/health` trả `{"ok":true,...,"app":"NOVAFILM"}`

## 0. Tóm tắt một dòng

Bước 4 không còn là một khối kết quả đơc lệ. Nó là **bảng chỉ đạo nghệ thuật bảy thẻ**,
mỗi thẻ một trường của prompt với **nút Copy riêng**, trên nền champagne. 456 cặp màu đo
trong hai theme · **0 không đạt AA**. CLS = 0. `AUDIT_ONLY=/wizard` vẫn ra
**8 bước · 8 ký tự · 0 bước còn lại**.

---

## 1. Hợp đồng DOM của audit — giữ nguyên, đã đo lại

| Hợp đồng | Đo bằng gì | Kết quả |
|---|---|---|
| `.wizard-actions .pf-btn`, nút cuối = "Tiếp tục" | `wizard-board-check.mjs` đếm nút trong `.wizard-actions` ở bước 4 | đúng 1 nút, là "Quay lại" (bước cuối không có "Tiếp tục") |
| `.wizard-textarea` ở bước 2 | `visual-audit.mjs` bấm được, `wizard-board-check.mjs` chờ selector | có |
| `.wizard-generate` ở bước 2 | `visual-audit.mjs` bấm được | có |
| Không nút sao chép nào lọt vào `.wizard-actions` | nút lớn đặt ở `.wizard-board-primary`, nút thẻ ở `.wizard-board-card-head` | đúng — hai nhóm này nằm ngoài `.wizard-actions` |

```
$ AUDIT_ONLY=/wizard AUDIT_BASE=http://127.0.0.1:5183 node scripts/visual-audit.mjs
vi  /wizard   cjk= 1        en  /wizard   cjk= 1
--- lai thu: 8 buoc · 8 ky tu Trung · 0 buoc van van
```

Đối chiếu với nền đo trước khi sửa: **8 bước · 8 ký tự · 0 bước còn lại** — y hệt.

Ký tự Trung `1` mỗi trang là nút chuyển ngôn ngữ hiện chữ `中`. Đúng như `AGENTS.md` mục 8
đã ghi, không phải lỗi.

### 1.1. Phát hiện ngoài phạm vi lane: ảnh bước 4 của `visual-audit.mjs` **rỗng**

`visual-audit.mjs` dựng kịch bản lái thử có bấm `.wizard-generate`, nhưng ảnh bước 4 nó
chụp lại là `Chưa có khung hình nào để sao chép` — tức **không có bảng**. Lý do đo được:
`waitForSettled` (dòng ~726) chỉ chờ văn bản **đứng yên** vài nhịp rồi coi là xong, mà trong
lúc chờ mạng thì văn bản vẫn đứng yên; hai lần bấm "Tiếp tục" sau đó đưa sang bước 4 trước
khi lệnh gọi quay về. Endpoint `POST /api/wizard/generate_prompt` **có thật** và cần token
(đo: `401` không token), nên nó không đi vào nhánh dựng bản nháp nhanh.

Hệ quả: `AUDIT_ONLY=/wizard` **không bao giờ** chứng minh được bảng. Số "8 bước · 8 ký tự"
vẫn đúng và vẫn là hợp đồng cần giữ, nhưng ảnh thì không.

**Không tự sửa** vì `visual-audit.mjs` là script dùng chung cho 26 route của mọi lane.
Giao board: thêm một nhịp chờ `.wizard-board-card` (hoặc chặn endpoint trong kịch bản lái
thử) mới làm ảnh bước 4 có bảng. Ba script mới của lane này đã chặn endpoint theo cách đó
và không cần sửa `visual-audit.mjs` (xem §6).

---

## 2. Tương phản — đo, không giả định

### 2.1. Cặp màu của phần mới, đo trên DOM đang render

Nguồn: `scripts/wizard-contrast-check.mjs` (cùng thuật toán dựng nền phân tầng với
`contrast-audit.mjs`, nên số của hai script so được). Báo cáo đầy đủ:
`frontend/.kilo/wizard-contrast/report.json`.

| Element | Chữ | Nền đo được | Số đo | Cần | Đạt |
|---|---|---|---|---|---|
| `.wizard-board-label` (sáng) | `rgb(28,28,26)` | `rgb(254,246,220)` | **15,79:1** | 4,5 | ✅ |
| `.wizard-board-value` (sáng) | `rgb(28,28,26)` | `rgb(254,246,220)` | **15,79:1** | 4,5 | ✅ |
| `.wizard-board-slot-no` (sáng) | `rgb(85,86,92)` | `rgb(254,246,220)` | **6,77:1** | 4,5 | ✅ |
| `.wizard-board-coverage` (sáng) | `rgb(85,86,92)` | `rgb(247,248,250)` | **6,88:1** | 4,5 | ✅ |
| `.wizard-toast` (sáng) | `rgb(28,28,26)` | `rgb(254,246,220)` | **15,79:1** | 4,5 | ✅ |
| `.wizard-board-label` (tối) | `rgb(245,245,247)` | `rgb(54,50,41)` | **11,72:1** | 4,5 | ✅ |
| `.wizard-board-value` (tối) | `rgb(245,245,247)` | `rgb(54,50,41)` | **11,72:1** | 4,5 | ✅ |
| `.wizard-board-slot-no` (tối) | `rgb(169,170,178)` | `rgb(54,50,41)` | **5,52:1** | 4,5 | ✅ |
| `.wizard-board-coverage` (tối) | `rgb(169,170,178)` | `rgb(14,14,17)` | **8,33:1** | 4,5 | ✅ |
| `.wizard-toast` (tối) | `rgb(245,245,247)` | `rgb(54,50,41)` | **11,72:1** | 4,5 | ✅ |

**Tổng: 456 cặp · 456 trên nền phẳng · 0 không đạt AA** (2 locale × 2 theme × 5 trạng thái
bước + trạng thái sau khi bấm sao chép). Nền trước khi sửa: 444 cặp / 0 không đạt.

Toast chỉ tồn tại **sau khi bấm sao chép**, nên script cấp quyền clipboard rồi bấm nút lớn
mới đo. Không làm vậy thì `.wizard-toast` là CSS không có con số nào — tức thêm CSS mà
không đo.

### 2.2. Champagne: vì sao **không** dùng làm màu chữ

Nguồn: `scripts/token-contrast-check.mjs` (tạo mới, chạy độc lập, không cần trình duyệt).

| Cặp | Số đo | Kết luận |
|---|---|---|
| `#f2c94c` trên `#ffffff` | **1,59:1** | không đạt AA → champagne là **màu tô**, không phải màu chữ |
| `#f2c94c` trên `#fef6dc` (thẻ champ sáng) | **1,47:1** | không đạt AA |
| `#f2c94c` trên `#363229` (thẻ champ tối) | **8,04:1** | đạt AA chữ thường |
| `#6a5116` (accent-800) trên `#363229` | **1,70:1** | không đạt AA |
| `#6a5116` trên `#fef6dc` | **6,94:1** | đạt AA |

Hai dòng này là lý do cụ thể cho cách làm: champagne **đảo vai** giữa hai theme (hỏng ở
sáng, đạt ở tối), và `--pf-accent-ink` thì ngược lại (đạt ở sáng, hỏng ở tối). Một nhãn
đơn lẻ dùng màu nào trong hai cũng hỏng ở một theme. Nên **mọi chữ trên bảng dùng
`--pf-ink` / `--pf-ink-secondary`** — hai màu đã có sẵn, đã đo ở cả hai theme; champagne
chỉ xuất hiện ở ba chỗ **không mang chữ**: sống lưng trái thẻ (`--pf-accent-300`), nền thẻ
(`--pf-accent-100`), viền thẻ rỗng (`--pf-accent-200`).

Lệch 0,01 với `tokens.css` (ghi 1,60:1) là khác biệt làm tròn ở tầng khác nhau, không phải
hai cách tính. Báo cáo này dùng số máy tính.

### 2.3. Một lần tự sửa trong lúc đo

Lượt đo tương phản **đầu tiên** in ra "0 không đạt" cho cả bước 4 — và con số đó **vô
nghĩa**. Bước 4 lúc đó có `0` khung hình: script bấm "soạn", endpoint thật mất ~55 giây
(`AGENTS.md` mục 10), còn kịch bản chỉ chờ 2,2 giây, nên bảng không bao giờ dựng ra.
Trang rỗng trông y hệt trang sạch. Sửa: chặn `generate_prompt` để trang đi đúng nhánh dựng
bản nháp trong trình duyệt, và thêm `waitForSelector` trước mỗi lần đo. Con số 456/0 ở §2.1
là của bản đã sửa, trên bảng **thật sự có mặt**.

---

## 3. Font `Noto Serif` — có sẵn cục bộ không, và CLS có nhảy không

### 3.1. Đo trước, đo sau

| | Nền (trước khi sửa) | Sau khi sửa |
|---|---|---|
| CLS tệ nhất, nhánh `cdn` | **0** | **0** |
| CLS tệ nhất, nhánh `no-cdn` (chặn font) | **0** | **0** |
| Chiều cao `.pf-page-title` | 43px | 43px |

Đo bằng `scripts/wizard-cls-check.mjs`, trên **build** (`vite preview` `:4173`), Fast 3G
(1,6 Mbps · 150 ms RTT — đúng preset `perf-audit.mjs`), cache tắt, `PerformanceObserver`
cài **trước** lần điều hướng đầu. CLS đọc qua `getEntriesByType` sau sẽ ra 0 cho mọi route —
tức là báo "không có vấn đề" trong khi không đo được gì.

**Không đo trên dev server.** Vite phục vụ hàng trăm module rời; dưới Fast 3G trang cần hàng
chục giây mới dựng xong, đo ở đó ra CLS của một trang *chưa kịp vẽ*. `perf-audit.mjs` cũng
ghi điều này ở dòng 15.

### 3.2. Font có sẵn cục bộ không? **Không.**

Đo danh sách font đã cài (`System.Drawing.Text.InstalledFontCollection`): chỉ có
`Cambria`, `Constantia`, `Georgia`, `Palatino Linotype`, `Times New Roman`. Không có
`Noto Serif`. Nó tới từ CDN: `index.html` nối Google Fonts với `display=swap`, weights
`500;700`. Chuỗi dự phòng trong `tokens.css` là `'Noto Serif', 'Noto Serif SC', Georgia,
serif` — **`Georgia` có sẵn cục bộ**, nên đường dự phòng là đường thật, không phải lời hứa.

### 3.3. Vì sao bảng dùng serif **weight 700** — đây là quyết định đo được

Đọc `document.fonts` sau khi tải trang:

```
Noto Serif 500  unloaded
Noto Serif 700  unloaded
Noto Serif 700  loaded      <- mặt đập duy nhất được tải
Noto Serif SC 500 unloaded
Noto Serif SC 700 unloaded
```

`.pf-page-title` đã dùng serif 700 nên mặt 700 nằm sẵn trong bộ nhớ đệm; **mặt 500 chưa
từng được tải** trên trang này. Nếu bảng dùng serif 500 thì nó tạo thêm **một** lần tải
font giữa lúc người dùng đang đọc — đúng rủi ro CLS mà brief cảnh báo. Đặt tiêu đề bảng ở
serif **700** thì không: sau khi sửa, danh sách mặt serif nạp **y hệt nền**, `Noto Serif 500`
vẫn `unloaded`. Không phát sinh tải font mới, và CLS vẫn 0.

---

## 4. Ảnh chụp

Toàn bộ ảnh bên dưới **đã xem**, không chỉ đếm ký tự (`AGENTS.md` mục 8). Đường dẫn trong
`docs/images/`.

| Bước | `vi` | `en` |
|---|---|---|
| 1 · Ảnh tham chiếu | `image-20261002-wizard-vi-b1.png` | `image-20261002-wizard-en-b1.png` |
| 2 · Ý tưởng | `image-20261002-wizard-vi-b2.png` | `image-20261002-wizard-en-b2.png` |
| 3 · Đã soạn | `image-20261002-wizard-vi-b3.png` | `image-20261002-wizard-en-b3.png` |
| 4 · Đích đến | `image-20261002-wizard-vi-b4.png` | `image-20261002-wizard-en-b4.png` |
| 4 · **Bảng chỉ đạo** | `image-20261002-wizard-vi-board.png` | `image-20261002-wizard-en-board.png` |
| 4 · Bảng, **theme tối** | `image-20261002-wizard-vi-board-dark.png` | `image-20261002-wizard-en-board-dark.png` |
| Sau khi bấm sao chép (**toast**) | `image-20261002-wizard-vi-toast.png` | `image-20261002-wizard-en-toast.png` |

Ảnh bốn bước lấy từ `wizard-board-check.mjs` (chặn endpoint để bảng dựng ra thật), **không**
lấy từ `visual-audit.mjs` — lý do ở §1.1.

### 4.1. Một lỗi bố cục tìm ra **chỉ vì nhìn ảnh**

Ảnh `vi` đầu tiên cho thấy nút "Sao chép phần Máy quay" **tràn ra ngoài thẻ**, và nhãn
"Chủ thể" bị vặn thành hai dòng ("Chủ" / "thể"). Mã nguồn nhìn thì không thấy, `tsc` xanh,
lint sạch, và tương phản đo ra vẫn đạt. Cả hai đều vì nhãn tiếng Việt dài hơn tiếng Anh và
cột lưới hẹp 250px.

Sửa: chữ trên nút tách khỏi tên trường (`board.copy` = "Sao chép" / "Copy" hiện ra mắt,
`board.copyField` = "Sao chép phần {field}" đi vào `aria-label`), cột lưới 250px → 19rem,
`flex-wrap` cho đầu thẻ. Chụp lại thì sạch. Bản `en` không bị lỗi này ngay từ đầu — dấu
hiệu của việc chỉ nhìn một locale là chưa đủ.

---

## 5. Build, lint, selector

```
npm run build   -> ✓ built in 929ms          0 error
npm run lint    -> 0 error · 40 warning
```

Nền đo trước khi sửa: `0 error · 40 warning`. **Giữ nguyên từng cảnh** — `Compare-Object`
giữa hai lần chạy không ra dòng nào mới.

Lần đầu của tôi để lại **3 cảnh báo mới** (`edge` khai báo mà không dùng, trong 3 script
mới). Không dập tắt bằng `_edge`; thay vào đó cái handle được nối vào `killTree()` — thử
`taskkill` theo pid trước rồi mới quét profile. Nó vẫn không ăn trên Windows, nhưng chút
nữa nó là thứ duy nhất báo được lỗi `spawn` khi máy không có Edge ở `EDGE_PATH`.

**Số selector `.pf-`:** không đụng `src/styles/**`. Đo trước và sau đều **1312** lần xuất
hiện, **550** selector khác nhau. Điều kiện "đếm trước/sau nếu đụng `styles/**`" của brief
**không phát sinh**; số vẫn được ghi ra đây để kiểm chéo.

---

## 6. File đã đụng

| File | Việc |
|---|---|
| `frontend/src/pages/wizard/artDirection.ts` | **mới.** Hàm thuần cắt prompt thành 7 trường |
| `frontend/src/pages/wizard/WizardPage.tsx` | bước 4 thành bảng 7 thẻ · nút Copy từng thẻ · toast · dọn timer |
| `frontend/src/pages/wizard/wizard.css` | champagne quanh bảng · nền thẻ · toast |
| `frontend/src/i18n/locales/{vi,en,zh}/pages.ts` | khoá `wizard.board.*` và `wizard.export.toast*` (thêm, không sửa khoá cũ) |
| `frontend/scripts/wizard-board-check.mjs` | **mới.** Kiểm chứng bảng + chụp ảnh 4 bước |
| `frontend/scripts/wizard-contrast-check.mjs` | **mới.** Đo tương phản 2 locale × 2 theme × 5 bước |
| `frontend/scripts/wizard-cls-check.mjs` | **mới.** Đo CLS, nhánh `cdn` và `no-cdn` |
| `frontend/scripts/token-contrast-check.mjs` | **mới.** Đo tỉ lệ giữa các token màu |

Không đụng `/studio`, `/drama`, `/canvas`, backend, `src/styles/**`, `src/index.css`,
`package.json`, `.kilo/agent-manager.json`. Không push, không stash.

### 6.1. Ghi chú cho board: ba pack locale là file dùng chung

`vi` / `en` / `zh` `pages.ts` nằm ngoài `/wizard` nhưng là bắt buộc: `messages.ts` khai
`Messages = Widen<typeof vi>`, nên **thiếu khoá tiếng Việt là build FAIL**. Diff thay đổi
**chỉ nằm trong khối `wizard`**, thêm thuần, không sửa dòng cũ nào — để hợp nhất với lane
khác gần nhất còn có thể. Nếu board muốn giao việc song song trên các trang khác thì nên
tách `wizard` ra file riêng trước, không phải sau.

### 6.2. Nợ nhỏ đã trả trong lúc làm

- `copyText` trước đây gọi `window.setTimeout` rồi bỏ mặc — điều hướng đi trước khi 2,4 giây
  trôi là callback giữ nguyên closure cũ và gọi `setCopied` vào state đã bỏ rơi. Nay có
  `copyTimer` ref + `useEffect(() => clearCopyTimer, [])`.
- Object URL trong `.wizard-ref` vẫn giữ nguyên cơ chế thu hồi có sẵn — không đụng.

---

## 7. Bảng chỉ đạo hoạt động thế nào

### 7.1. Vì sao phân rã **ở trình duyệt**, không đổi hợp đồng API

`POST /api/wizard/generate_prompt` chỉ hứa "một prompt tiếng Anh"
(`WizardGeneratePromptOut`: `prompt`, `script`, `frames[{prompt, narration}]`) — không có
trường cấu trúc nào để đọc. Đổi API là việc của lane khác, nên phân rã chạy trên đúng văn
bản đã có.

### 7.2. Không "khớp trước thắng" — đây là quyết định đo được

Mệnh đề tiếng Việt mang nhiều thông tin cùng lúc. Câu thật trong bản nháp:

> *"Một cô gái trẻ mặc áo khoác da **chạy** băng qua **phố** mưa lúc **đêm**"*

vừa có chủ thể, vừa có hành động, vừa có bối cảnh, vừa có ánh sáng. Gán vào một thẻ là vứt
mất hai phần ba thứ người dùng cần. Nên một mệnh đề vào **mọi** thẻ mà nó thật sự khớp.
Kết quả đo được (cả 4 tổ hợp locale × theme đều ra như nhau):

| Trường | Nội dung |
|---|---|
| Chủ thể | Một cô gái trẻ mặc áo khoác da chạy băng qua phố mưa lúc đêm |
| Hành động | *câu trên*; dừng lại trước một quán cà phê nhỏ; ngẩng đầu nhìn đèn neon và thở dài |
| Bối cảnh | *câu trên*; dừng lại trước một quán cà phê nhỏ |
| Máy quay | Medium shot; gentle dolly-in |
| Ánh sáng | *câu trên*; ngẩng đầu nhìn đèn neon và thở dài; soft rim light |
| Phong cách | shallow depth of field; cinematic |
| Thời lượng | 8 seconds |

Hệ quả được chấp nhận có chủ ý: cùng một câu có thể hiện ở hai thẻ. Đó là cái giá của việc
cho phép sao chép "riêng phần ánh sáng", và người dùng đã bấm Copy đúng thẻ mình muốn.

### 7.3. Lỗi thật tìm ra khi đo: `\b` không hiểu chữ có dấu

Lần đo đầu cho thấy thẻ "Bối cảnh" **không bắt được `phố`** dù câu có đúng chữ đó. Đo lại
(`node`, 10 từ khoá tiếng Việt lấy từ câu thật):

| Ranh giới từ | Số từ khớp / 10 |
|---|---|
| `\b` kiểu ASCII | **6** |
| Theo `\p{L}` | **10** |

Bốn từ mất là `phố`, `đêm`, `đèn`, `thở` — tức **mọi từ Việt tận cùng bằng một chữ có dấu**.
Lý do: `\b` chỉ coi `[A-Za-z0-9_]` là chữ, nên `ố` là "không phải chữ", rồi `\b` đòi một bên
là chữ và bên kia không — mà hai bên đều không phải chữ nên không có ranh giới, từ đó không
bao giờ khớp. Đã đổi sang `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` với cờ `u`.

Cùng lúc đó, `depth of field` chưa có trong nhóm `style` nên rơi vào thùng rác và hiện ở
thẻ "Hành động" — sai. Đã đưa `depth of field` vào `style`.

### 7.4. Bất biến, và nó được đo chứ không tin

**Không mệnh đề nào rơi khỏi mọi thẻ.** `wizard-board-check.mjs` cắt lại các prompt trên
DOM đang render (cắt ở Node, không dùng lại hàm của mã nguồn — dùng lại thì chỉ chứng minh
mã nguồn tự nhất quán với chính nó) rồi hỏi từng câu có xuất hiện ở thẻ nào không.

Đo được: **9/9 mệnh đề còn lại trên ít nhất một thẻ**, cả `vi` lẫn `en`, cả sáng lẫn tối.

Trường rỗng thì thẻ nói thẳng *"Prompt của bạn không nhắc tới phần này"* và nút Copy của nó
**tắt** — đo kiểm `nút tắt ⇔ thẻ rỗng` trên cả 7 thẻ. Một nút sao chép được mà bên trong rỗng
là một cú bấm nói dối.

### 7.5. Toast nói đúng một việc

| Locale | Câu |
|---|---|
| `vi` | *Đã sao chép toàn bộ prompt. Dán sang nền tảng render bên ngoài để quay.* |
| `en` | *Prompt copied. Paste it into an external rendering platform to shoot.* |
| `vi` (thẻ) | *Đã sao chép phần Ánh sáng. Dán riêng phần này sang nền tảng render bên ngoài.* |

Không hứa "đang tạo video" — hệ thống không gọi được API video nào, nên lời hứa đó là nói
dối và người dùng sẽ chờ mãi.

Vùng sống có `role="status"` + `aria-live="polite"` (đo được trên DOM, không phải tin mã
nguồn). Nội dung bị xoá rồi mới gán ở khung hình kế tiếp: một `aria-live` **không** phát
sự kiện khi nội dung không đổi, nên sao chép cùng một thẻ hai lần liên tiếp sẽ im lặng ở
lần hai — đúng cái lần người dùng cần nghe nhất.

---

## 8. Cách chạy lại

```powershell
cd D:\novafilm-lanes\bunny-2\frontend
npm run dev -- --host 127.0.0.1 --port 5183 --strictPort    # phải là 5183, không phải 5173

$env:AUDIT_ONLY="/wizard"; $env:AUDIT_BASE="http://127.0.0.1:5183"
node scripts\visual-audit.mjs                  # kỳ vọng: 8 buoc · 8 ky tu · 0 buoc con lai

$env:BASE="http://127.0.0.1:5183"
node scripts\wizard-board-check.mjs            # kỳ vọng: DAT, thoat ma 0
node scripts\wizard-contrast-check.mjs        # kỳ vọng: 0 khong dat AA

npm run build; npm run preview -- --port 4173  # CLS phai do tren build
$env:BASE="http://127.0.0.1:4173"
node scripts\wizard-cls-check.mjs              # kỳ vọng: cdn=0 no-cdn=0
node scripts\token-contrast-check.mjs         # khong can trinh duyet
```

Lưu ý vận hành: ba script mới cùng lúc với Edge headless sẽ tranh cổng debug, nên chạy
**một lượt một**. Cổng lấy trong `[19400, 19999]`, và Edge được giết **theo profile** chứ
không theo pid — lý do đã ghi ở `visual-audit.mjs:1158`.

## 9. Chưa kiểm chứng được ở đây

- **Endpoint thật.** Cả ba script chặn `POST /api/wizard/generate_prompt` và đo trên nhánh
  dựng bản nháp trong trình duyệt. Đây là nhánh `visual-audit.mjs` cũng đang chạy mỗi lần,
  nhưng nó **không** phải nhánh LLM thật. Bảng trên prompt do mô hình viết ra có thể khác
  phân bố thẻ — đặc biệt prompt thuần tiếng Anh dài, nhiều mệnh đề ngắn. Bản phân rã là thuần
  và không có trạng thái, nên kiểm lại chỉ cần chạy lại script.
- **`billing`.** Sao chép là hành động phía client, không gọi API, không thu phí. Không sửa
  gì tới `billing.py`.
- **Trình đọc màn hình thật.** Đã kiểm `role` / `aria-live` / tên truy cập bằng DOM; chưa chạy
  NVDA hay Narrator. Điều kiện cấu hình đúng, còn `aria-live` chỉ phát khi vùng sống có mặt
  trước khi nội dung đổi — điều đã giữ.