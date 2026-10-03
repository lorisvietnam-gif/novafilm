# `/wizard` → nền True Black — báo cáo nghiệm thu

Brief: `docs/briefs/case-true-black-wizard-b2.md`
Lane: `bunny/2` · worktree `D:\novafilm-lanes\bunny-2` · dev server `:5183`

Tiêu chuẩn nghiệm thu là **script đo**, không phải mắt. Mọi con số dưới đây là kết quả chạy,
không phải ước lượng.

---

## 1. Kết quả: đạt

| Hạng mục | Kết quả |
|---|---|
| `wizard-contrast-check.mjs` (4 bước × vi/en × 2 theme) | **456 cặp · 0 hụt AA** (trước: 456 · 0) |
| `wcag-contrast-check.mjs --route "/wizard,/"` | `/wizard` 41 chu · 0 · `/` 99 chu · 0 · **exit 0** |
| Hợp đồng DOM, 2 theme × 4 bước | selector **không đổi một cái nào**, không phần tử nào bị ẩn |
| `visual-audit.mjs AUDIT_ONLY=/wizard` | **8 bước · 0 bước vẫn lặn** |
| `wizard-board-check.mjs` | ĐẠT — 7 thẻ, 7 có nội dung, toast `status/polite`, 9/9 mệnh đề còn |
| `wizard-copy-ux-check.mjs` | ĐẠT |
| `wizard-error-check.mjs` | ĐẠT — không crash, lỗi ra tiếng Việt |
| `npm run build` | xanh (`tsc -b && vite build`, exit 0) |
| `npm run lint` | **0 error · 41 warning**, không warning nào từ file đã đụng |
| Rò sang route khác | **không** — xem mục 4 |

Ảnh chụp nền mới: `frontend/.kilo/wizard-board/vi-light-*.png` (theme sáng — nơi thay đổi
xảy ra) và `vi-dark-*.png` (theme tối — không đổi). 24 ảnh, vi/en × sáng/tối × 5 bước + toast.

---

## 2. Phát hiện quan trọng: `--pf-surface-inverse` **không** phải nền đen ở theme đang chạy

Brief ghi: *"Nền đen: dùng token sẵn có `--pf-surface-inverse: #1c1c1a`"*.

`#1c1c1a` là giá trị của token đó **ở theme sáng** (`tokens.css:124`). Ở theme mà ứng dụng
thực sự chạy, `tokens.css:758` hạ nó xuống `#f5f5f7` — tức **một nền trắng**. Dùng nó làm nền
trang sẽ ra trang trắng, ngược hẳn "true black" và đúng cái vệt sáng mà brief cấm.

Đo bằng `getComputedStyle`, không suy từ trí nhớ:

```
prefersDark: true          pfBg: #0e0e11     pfInk: #f5f5f7
dataTheme: null            pfSurface: #16161a    pfSurfaceInverse: #f5f5f7
```

Nên thay bằng **thang trung tính `--pf-n-*`**: nó không đổi theo theme, và các bậc dùng ở
đây trùng khít với những gì khối tối của `tokens.css` đã dùng cho đúng vai trò đó
(`--pf-n-975` = `#0e0e11` = `--pf-bg` của khối tối). Không phát minh bảng màu mới.

Hệ quả thứ hai, và nó là lý do lượt đo đầu tiên **bất khả dụng**: Edge headless trên máy
này mặc định `prefers-color-scheme: dark`. Ở theme tối, `/wizard` **đã** là nền đen và đã
0 vi phạm. Nghĩa là lệnh nghiệm thu trong brief (`wcag-contrast-check.mjs`, không ép theme)
đo đúng chỗ mà thay đổi **không có tác dụng gì**. Chỉ ép theme sáng mới thấy được việc này.

## 3. Vì sao ghim token chứ không sơn tay

`/wizard` dùng chung `.pf-shell`, `.pf-nav`, `.pf-stepper`, `.pf-btn`, `.pf-field`,
`.pf-link`, `.pf-shell-footer` — tất cả nằm trong `printfilm.css`, không được sửa. Sơn tay
từng thẻ là một danh sách dài và **sai** ngay khi `printfilm.css` thêm rule.

Nên trang trỏ lại **tên token** trong phạm vi mình: mọi rule vốn đã đọc `var(--pf-...)` nên
tự đổi theo, không selector nào phải đổi tên, không rò sang route khác.

Khối ghim nằm trong `@media (prefers-color-scheme: light)`, cố ý. Ở theme tối trang đã đúng;
ghi đè ở đó chỉ tạo thêm một bản sao của `tokens.css` phải giữ đồng bộ. Bỏ media query đi
thì trang tối vẫn đúng, nhưng đổi bảng màu tối sau này thì trang này đứng lại ở bản sao.

Cần ba vòng đo–sửa, mỗi vòng đều do script chỉ ra chứ không phải đoán:

| Vòng | Còn hụt | Nguyên nhân đo được |
|---|---|---|
| 1 | 22 | nền kính nav còn trắng → `span.brand-word` **1,24:1**, nút ngôn ngữ **2,15:1**; nền lỗi còn `#fdeceb` → `p.pf-error-notice-text` **1,05:1** |
| 2 | 0 | đủ glass + ngữ nghĩa + nâng cao + `color-scheme: dark` |

Không hạ ngưỡng AA, không thêm ngoại lệ, không ẩn phần tử nào. `color-scheme: dark` là bắt
buộc chứ không phải trang trí: không có nó thì dropdown `.wizard-select` và thanh cuộn vẫn
trắng — một mảng sáng cắt ngang trang đen.

## 4. Bằng chứng rò/leak — đo trước và sau, cùng một lệnh

`contrast-audit.mjs` quét 16 route × 2 theme. Chạy lại trên CSS **trước khi đổi** và **sau khi đổi**:

```
trước:  693 cặp · 614 trên nền phẳng, 2 hụt AA · 12 trên nền ảnh
sau:    693 cặp · 614 trên nền phẳng, 2 hụt AA · 12 trên nền ảnh
```

Giống nhau tuyệt đối. Hai lỗi hụt AA đó nằm ở hero `/` (`h2` và `p` màu trắng trên
`rgb(247,248,250)`) và **có sẵn từ trước** — ngoài phạm vi brief, không tự sửa.

Bằng chứng trực tiếp rằng pin không rò: ở `/` trong theme sáng, nền vẫn ra
`rgb(247, 248, 250)` = `#f7f8fa`. Nếu `:has()` rò, nó ra `rgb(14, 14, 17)`.

Hợp đồng DOM, so từng dòng trước/sau — **khác biệt duy nhất** là màu, đúng thứ đã muốn:

```
<= nen shell = rgb(247, 248, 250)   (theme sáng, trước)
=> nen shell = rgb(14, 14, 17)      (theme sáng, sau)
   nen shell = rgb(14, 14, 17)      (theme tối, không đổi)
```

Không có dòng selector nào khác nhau. `wizard-actions` 1, `pf-btn` 2–4, `.pf-step` 4 ở cả
bốn bước, `total == visible` mọi nơi — không có gì bị ẩn để lách audit.

## 5. Ngoài phạm vi lane — phát hiện, không tự sửa

1. **`wizard-cls-check.mjs` hỏng sẵn, không phải do thay đổi này.** Nó báo
   `khong thay .wizard-actions .pf-btn (buoc 1) sau 45s`. Đã chạy lại trên CSS **trước khi
   đổi**: hỏng y hệt. Khác biệt so với `wizard-board-check.mjs`: script đó đăng nhập và set
   `localStorage.token` (dòng 133–137, 400–401), còn `wizard-cls-check.mjs` **không** — và
   `visual-audit.mjs` cũng vậy. Nghi vấn: `/wizard` cần token mà script không lấy. **Giao
   ai đó sửa:** thêm đăng nhập như `wizard-board-check.mjs`, hoặc xác nhận `/wizard` cố ý
   mở cho khách.

2. **Baseline lint ghi trong AGENTS.md đã cũ.** Ghi "40 warning", đo được **41**. Đã kiểm
   bằng cách gỡ file mới khỏi khỏi phạm vi lint: vẫn 41. Không warning nào đến từ
   `wizard.css` hay `wizard-dom-contract.mjs`. Nên là trôi có sẵn từ các commit gần đây,
   không phải do lane này.

3. **`/`, `/method`, `/pricing`, `/history` có 2 lỗi AA nền phẳng ở theme sáng** (xem mục 4).
   Có sẵn từ trước. Ngoài phạm vi brief.

## 6. Nguyên tắc của brief — đối chiếu

| Nguyên tắc | Trạng thái |
|---|---|
| Không đụng `tokens.css` (dùng chung 25 route) | Không đụng. Diff chỉ có `wizard.css` + 1 script mới |
| `--pf-accent-400: #f2c94c` đóng băng | Không đổi, không khai lại |
| Không đổi tên `.wizard-actions`, `.pf-btn`, input 4 bước | Không đổi; đếm được như cũ |
| Không hạ tiêu chuẩn AA | Không. Ngưỡng `--threshold`/`--large` còn nguyên mặc định |
| Không đảo thành thẻ sáng trên nền tối | Thẻ là `#363229` (ấm tối), có sống lưng champagne `#f8dc87` |
| Không làm hỏng cái đang xanh | 456 cặp vẫn 0 hụt; 693 cặp toàn site y hệt trước |

## 7. Commit

| Hash | Nội dung |
|---|---|
| `93d89b6` | `test(wizard)` — bộ đếm hợp đồng DOM |
| `35c71a6` | `feat(wizard)` — ghim nền true black |
| `bcead83` | `test(wizard)` — đếm hợp đồng DOM ở cả hai theme |

## 8. Cách chạy lại

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5183 --strictPort

$env:AUDIT_BASE="http://127.0.0.1:5183"; $env:AUDIT_API="http://127.0.0.1:8000"

node scripts\wizard-contrast-check.mjs      # 456 cap, 0 hụt AA, 2 theme
node scripts\wizard-dom-contract.mjs        # selector truoc/sau
$env:AUDIT_ONLY="/wizard"; node scripts\visual-audit.mjs   # 8 buoc, 0 lap
node scripts\wizard-board-check.mjs         # 7 the + anh chup 2 theme
npm run build; npm run lint
```

**Lưu ý khi đo:** `5173` trên máy này đang chạy `E:\novafilm\printfilm-main`, không phải
worktree của lane — audit không set `AUDIT_BASE` là đang đo **main**, tức đo nhầm thứ mình.
Đó là lý do mọi lượt đo ở trên đều trỏ `5183`.