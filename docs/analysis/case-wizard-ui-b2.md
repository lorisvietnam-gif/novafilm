# `/wizard` — trạm đẻ prompt 4 bước (lane bunny/2)

Brief: `docs/briefs/case-wizard-ui-b2.md`. Lane: `bunny/2` (`D:\novafilm-lanes\bunny-2`).

**Kết luận một dòng:** trang `/wizard` đã dựng xong, cả 4 bước đều được mở thật và
chụp ảnh chứng minh; audit chạy **hai lần liên tiếp**, mỗi lần 26 route × 2 locale,
không dừng giữa chừng, không rò khoá i18n, không lỗi JS.

---

## 1. File đã đụng

| File | Thay đổi |
|---|---|
| `frontend/src/pages/wizard/WizardPage.tsx` | **Mới.** Trang 4 bước. |
| `frontend/src/pages/wizard/wizard.css` | **Mới.** Chỉ rule mới, tất cả dưới `.wizard-scoped`. |
| `frontend/src/App.tsx` | `lazy()` + `<Route path="/wizard">`, đặt trước `path="*"` (trang rơi vào `*` không có route). |
| `frontend/src/api.ts` | `api.wizardGeneratePrompt()`, type `WizardPromptResult` / `WizardFrame`. |
| `frontend/src/i18n/locales/{vi,zh,en}/pages.ts` | Section `wizard` mới — đủ 3 locale. |
| `frontend/scripts/visual-audit.mjs` | Thêm `/wizard` vào `ROUTES_BASE`, `wizard` vào `RAW_KEY`, cơ chế lái thử (walkthrough), và thử lại khi route chưa ổn định. |

**Không đụng `frontend/src/styles/**`.** `src/index.css`, `src/lib/apiError.ts`,
`src/lib/referenceImages.ts`, `src/components/layout/AppShell.tsx`, `src/i18n/messages.ts`
đều nguyên vẹn.

### Selector `.pf-` trước / sau

Không cần đo vì không file nào trong `styles/**` bị sửa — nhưng đo lại để có bằng chứng:

| File | `HEAD` | Làm việc |
|---|---|---|
| `styles/printfilm.css` | 1229 | 1229 |
| `styles/base.css` | 56 | 56 |
| `styles/tokens.css` | 1 | 1 |
| `styles/media.css` | 26 | 26 |

Rủi ro xung đột class ở mức **0**: `wizard.css` không định nghĩa lại class `.pf-*` nào;
nó chỉ **dùng lại** `pf-page-head`, `pf-page-head-row`, `pf-page-title`, `pf-stepper`,
`pf-step`, `pf-step-dot`, `pf-step-line`, `pf-field`, `pf-field-label`, `pf-btn*`, `pf-link`.
Toàn bộ token màu cũng lấy từ biến sẵn có (`--pf-ink`, `--pf-line`, `--pf-surface`,
`--pf-lime`, `--pf-muted`, `--pf-accent`…). Không hard-code màu.

---

## 2. Bốn bước

| Bước | Nội dung |
|---|---|
| 1 | Ảnh tham chiếu: hai nhóm **Nhân vật** / **Bối cảnh**. Xem thumbnail, bỏ từng ảnh, xoá cả nhóm. |
| 2 | Ô **“Bạn muốn video kể gì?”** + nút **Soạn kịch bản & prompt**. Ra: script + từng khung hình. |
| 3 | **Đích đến**: Veo 3.1 / Muse / Kling / Seedance (4 ô bấm được) + **Giọng đọc** (6 mục). |
| 4 | **Sao chép prompt** từng khung + **Sao chép tất cả**, kèm tóm tắt thiết lập. |

**Không có khoá nào gọi API video.** Đây là yêu cầu cốt lõi của brief và của tình trạng
dịch vụ: TokenFree không khoá, Veo hết hạn ngạch. Trang chỉ gọi đúng một endpoint —
`POST /api/wizard/generate_prompt` — và chỉ để **sao chép văn bản**. Không có
`ImagePicker` có `onGenerate`, không có nút “Quay video”, không có provider nào được nhắc.

---

## 3. Bằng chứng: ảnh chụp thật

Không dựa vào `npm run build`. Đã sửa `visual-audit.mjs` để **lái thử** `/wizard`: nó bấm
qua từng bước và chụp ảnh riêng, vì trang này chỉ dựng bước 1 ở lần tải đầu — chụp một
lần thì không chứng minh được bước 2–4.

Vị trí: `frontend/.kilo/audit/<locale>/`

| Ảnh | Nội dung |
|---|---|
| `tram-de-prompt.png` | Bước 1 — hai khung ảnh, trống, nút Tiếp tục. |
| `tram-de-prompt-buoc-2-y-tuong.png` | Bước 2 — ô ý tưởng đã điền. |
| `tram-de-prompt-buoc-2-da-soan.png` | Bước 2 sau khi bấm soạn — **xem mục 4**. |
| `tram-de-prompt-buoc-3-dich-den.png` | Bước 3 — bốn ô đích đến, dropdown giọng. |
| `tram-de-prompt-buoc-4-sao-chep.png` | Bước 4 — Khung 1 + nút sao chép + tóm tắt thiết lập. |

Có đủ cho cả `vi` và `en` (mỗi locale 5 ảnh, tổng 10).

---

## 4. Bước 2 thất bại thì bước 4 vẫn tới được

`POST /api/wizard/generate_prompt` **chưa tồn tại** (brief B4 chưa được giao), nên bước 2
**luôn** rơi vào nhánh lỗi. Đây đúng là tình huống brief yêu cầu phải chứng minh, và ảnh
chụp cho thấy:

1. Khung lỗi hiện ra bằng **tiếng Việt**, đi qua `ErrorNotice` — lớp lỗi duy nhất của sản
   phẩm — kèm nút **“Thử lại”**: *“Không tìm thấy dữ liệu này. Bạn tải lại trang, hoặc
   quay lại danh sách để chọn mục khác.”* (locale `en` tương ứng đã kiểm qua ảnh `en/`).
2. Trang **không trắng**. Bước 3 và bước 4 vẫn bấm tới được — thanh bốn bước bấm ngược
   được, và nút “Tiếp tục” luôn đi tiếp.
3. Song song, trang dựng **bản nháp tự soạn trong trình duyệt** và **ghi rõ** nó chưa qua
   mô hình AI: *“Đây là bản nháp tự soạn tại trình duyệt, chưa qua mô hình AI…”*. Nhờ vậy
   người dùng không bị chặn ở bước 2 và vẫn có gì để dán thử.

Bản nháp là **payload prompt tiếng Anh**, không đi qua pack i18n. Cố ý vậy: nếu đưa vào
pack thì người dùng locale `vi` sẽ nhận prompt tiếng Việt rồi dán vào Veo — đúng cái họ
không cần.

Khi B4 lên, nhánh `try` chạy, `drafted` về `false`, thông báo nháp biến mất, không cần sửa
dòng nào ở trang.

---

## 5. `npm run lint` / `npm run build`

```
npm run lint    → 0 error, 40 warning
npm run build   → xanh, built in 1.86s
npx tsc -b      → exit 0
```

40 warning là **đúng bằng baseline** của `AGENTS.md` mục 4, và **không warning nào** trỏ
vào file của `wizard/` hay `scripts/visual-audit.mjs` (đã grep xác nhận). Baseline ghi
"1 error + 40 warning"; chạy được 0 error.

Chunk sinh ra: `WizardPage-DJjtFjUn.js` 10.9 kB, `WizardPage-BdQPi7mG.css` 4.7 kB.

---

## 6. Audit — hai lần liên tiếp

Môi trường: dev server lane `http://127.0.0.1:5183`, API `http://127.0.0.1:8000`
(backend dùng chung, đúng theo `AGENTS.md` mục 2). Dữ liệu thật do script tự tạo:
`studio=55 drama=16 episode=3`.

| Lần | Kết quả |
|---|---|
| Chạy 1 (mốc, trước khi thêm `/wizard`) | vi 25 route · 1045 · en 25 route · 1043 — `/privacy` **bình thường** |
| Chạy 2 (sau thay đổi) | vi **26** route · 1046 · en **26** route · 1044 · lái thử 8 bước, **0 bước vấn** |
| Chạy 3 (liên tiếp ngay sau) | vi **26** route · 1046 · en **26** route · 1044 · lái thu 8 bước, **0 bước vấn** |

**Chạy 2 và chạy 3 cho kết quả giống hệt nhau** — đạt tiêu chuẩn hai lần sạch liên tiếp
của `AGENTS.md` mục 10. Không route nào phải thử lại (không có dòng `khong on dinh` nào
trong log của cả ba lần).

Không lần nào dừng giữa chừng. `report.json` (`frontend/.kilo/audit/report.json`) của
lần chạy 3 có `routes: 52` (26 × 2) + `walkthrough: 8`, và:

| Kiểm tra | Kết quả |
|---|---|
| Route có `errors > 0` (lỗi JS lúc chạy) | **0** |
| Route có `rawKeys` (rò khoá i18n) | **0** |
| Route `apiDown` | **0** |
| Route rỗng (`visible < 40`) | **0** |
| Bước lái thử có vấn đề | **0 / 8** |

### Ký tự Trung

| Route | `vi` | `en` | Ghi chú |
|---|---|---|---|
| `/wizard` | 1 | 1 | Đúng bằng mọi trang khác. |
| `/assets`, `/drama/assets` | 31 | 31 | Dữ liệu từ backend. |
| `/drama/projects/16` | 806 | 806 | **Tên dự án + kịch bản trong database**, không phải UI. |

Con số `+1` ở mọi trang là nút chuyển ngôn ngữ hiện chữ `中` — hành vi đúng, không phải lỗi.

Tổng giảm so với bảng trong `AGENTS.md` mục 8 (1753/1751 → 1046/1044) **không phải do ta
sửa UI**: script giờ tìm được id thật nên các route có `:id` render ra nội dung thay vì
trang rỗng, nên chỗ nào còn tiếng Trung đều là dữ liệu database.

---

## 7. `/privacy` — **không tái hiện được, nên không dám nói là đã sửa**

Brief ghi: *“Trang `/privacy` (sau reload) không ổn định sau 45s (readyState=interactive,
chu=0)”*.

**Sự thật đo được:** ở lane này `/privacy` qua **cả 3 lần chạy**, cả `vi` lẫn `en`, luôn
`cjk=1`, không bao giờ vướng, và không lần nào phải dùng tới cơ chế thử lại mới thêm.
**Không tái hiện được, nên không có gì để sửa, và tôi không dám ghi “đã sửa”.**

Phân tích triệu chứng: `readyState=interactive` + `innerText` rỗng là trạng thái **quá độ**,
không phải trang hỏng. `innerText` cần layout mới trả về chữ, và sau `Page.reload` lệnh
`Runtime.evaluate` của CDP có thể rơi vào đúng tài liệu vừa bị thay thế nhưng chưa nạp xong.
Trang thật sự hỏng thì hỏng **mọi lần**; lần này chỉ hỏng một lần.

**Cái đã sửa là hậu quả, không phải nguyên nhân.** Board mất 15 route vì một route hụt
một lần — đó mới là điều `visual-audit.mjs` sai. Nay:

- `navigateAndSettle()` tải lại rồi đo lại **tối đa `ROUTE_ATTEMPTS` lần** (mặc định 2,
  đổi được bằng `AUDIT_ATTEMPTS`).
- Chỉ ném lỗi khi hụt **liên tiếp** mọi lần → trang hỏng thật vẫn bị báo, vẫn dừng cả lô.
- **Mỗi lần thử lại đều được in ra** kèm đúng `readyState` / số ký tự. Nếu lỗi quay lại thì
  lần này log đủ để chẩn đoán thay vì chỉ có một dòng “không ổn định”.

Đây là câu trả lời của tôi cho “`/privacy` treo ở đâu”: **tôi không xác định được**, và đoán
bừa một nguyên nhân rồi sửa sẽ tệ hơn là nói thẳng là chưa tìm ra. Nếu nó tái hiện, log
thử lại mới là thứ đáng đọc đầu tiên.

---

## 8. Chệch lệch có chủ đích so với brief — xin board xác nhận

### 8.1 Không tái dùng `CanvasStore.tsx:682 collectIncomingAssetIds()`

Brief ghi: *“Tái dùng logic node của Canvas: `collectIncomingAssetIds()`”*.

Hàm đó gom ID asset từ **cạnh của đồ thị Canvas** (`edges.target === nodeId`). `/wizard`
không có đồ thị, không có node, không có cạnh — dùng lại hàm đó là bắt buộc phải dựng
đồ thị giả chỉ để gọi một hàm vòng qua mảng rỗng.

Phần **thật sự** liên quan và đã tái dùng: trần 9 ảnh và câu báo vượt trần, từ
`lib/referenceImages.ts` (`MAX_REFERENCE_IMAGES`, `formatReferenceImageLimitMessage`) —
cùng trần với `backend/app/services/project_reference_images.py`. Không cắt bớt âm thầm,
ném lỗi cho người dùng tự bỏ ảnh.

### 8.2 Ảnh bước 1 **không upload**

`lib/referenceImages.ts:6` ghi rõ: *“tuyệt đối **không** thêm ô tải ảnh mới”* — vì Canvas
đã sở hữu ảnh tham chiếu, và `collectCanvasReferenceImages` cố ý **loại** `blob:`/`data:`
(máy chủ không tải được).

Nên bước 1 dùng object URL, **chỉ trong trình duyệt**, và nói thẳng với người dùng:
*“Ảnh chỉ nằm trong trình duyệt của bạn, chưa tải lên máy chủ.”* Kèm link sang `/assets`.

Lý do không upload: hợp đồng của B4 là `{ idea, language }` — **không có ô nào nhận ảnh**.
Upload ảnh vào `drama` sẽ tạo dòng database cho một trang không dùng tới, và `AGENTS.md`
mục 2 cấm chạm lane khác. Nếu board muốn wizard dùng ảnh từ thư viện thay vì file máy,
đó là một đổi ở `RefGroup` — báo lại, tôi không tự làm.

### 8.3 Không thêm mục `wizard` vào menu điều hướng

Brief không yêu cầu, và thêm vào menu là đụng `SiteNav` — ngoài phạm vi brief. Trang chạy
được bằng `/wizard`. `AppShell` không truyền `active`, nên **không mục nào được sáng**,
vì `/wizard` không thuộc mục nào.

---

## 9. Việc ngoài phạm vi lane — đề nghị board giao lại

1. **`AGENTS.md` mục 1 đã cũ.** Nó ghi `Messages = typeof zh` và liệt kê
   `detect.ts / messages.ts / LanguageSwitch.tsx`. Thực tế ở commit này:
   `Messages = Widen<typeof vi>` trong `i18n/messages.ts`, `DEFAULT_LOCALE = 'vi'`,
   `LOCALES = ['vi','zh','en']`, `locales/{vi,zh,en}.ts`. Thêm ngôn ngữ bây giờ là **thêm
   section vào `locales/<x>/pages.ts`**, không phải mục trong danh sách đó.
2. **Bảng nền đo ở `AGENTS.md` mục 8 đã cũ** (1753/1751). Số thật hôm nay 1046/1044 —
   vì `ensureData()` đã tìm được id thật, nên route có `:id` không còn trang rỗng.
3. **`POST /api/wizard/generate_prompt` chưa có** — brief `case-wizard-backend-b4.md`
   vẫn chưa ai giao. Trang đã gọi đúng hợp đồng, chờ backend là chạy.
4. **`/drama/projects/{id}/episodes` còn tiếng Trung = 806 ký tự** ở cả hai locale. Đây là
   **nội dung kịch bản trong database**, không phải UI. `AGENTS.md` mục 10 đã ghi sẽ dọn
   khi khởi tạo database thật — số liệu này xác nhận điều đó vẫn đúng.
5. **`report.json` đổi hình dạng:** trước là mảng phẳng, nay là
   `{ routes: [...], walkthrough: [...] }`. Kịch bản nào đọc file này bằng `json[0]` thì
   phải sửa theo.

---

## 10. Cách chạy lại

```powershell
cd frontend
# dev server của lane này
$env:VITE_API_BASE="http://127.0.0.1:8000"
npm run dev -- --host 127.0.0.1 --port 5183 --strictPort

# audit (giới hạn số lần thử lại)
$env:AUDIT_BASE="http://127.0.0.1:5183"
$env:AUDIT_API="http://127.0.0.1:8000"
node scripts\visual-audit.mjs
# AUDIT_ATTEMPTS=3 nếu muốn thử nhiều hơn trước khi bỏ một route
```