# Báo cáo — `/wizard` bước 2 không được crash khi backend lỗi

Lane: `bunny/2` · Phần 2 của `docs/briefs/case-wizard-integration-b2-b4.md`
Ngày: 2026-10-02

## Tóm tắt một dòng

Yêu cầu của brief **đã được thoả trong code từ trước** — `WizardPage.tsx` đã có
`try/catch/finally` và `ErrorNotice`; task này **không sửa một dòng mã nguồn ứng dụng**.
Việc thật còn thiếu là **bằng chứng có thể lặp lại**, và đó là thứ tôi làm: thêm
`frontend/scripts/wizard-error-check.mjs` (17 khẳng định, ép endpoint trả 404 thật).

Quan trọng: lỗi `Uncaught` mà brief dẫn lại **không tái hiện được**, và nguyên nhân
thật của nó **không nằm ở trang `/wizard`**. Chi tiết ở mục "Sai lệch so với brief".

## 1. Đã kiểm chứng (không phải suông)

Lệnh: `npm run check:wizard` (từ `frontend/`, dev server lane ở `:5183`).
Chạy **hai lần liên tiếp, cùng kết quả** — đúng tiêu chuẩn board về "hai lần sạch".

17/17 khẳng định đạt, gồm cả bốn điều brief yêu cầu:

| Yêu cầu brief | Khẳng định | Đo được |
|---|---|---|
| Lỗi 404/500 hiện **tiếng Việt** trong trang | `errors.notFound` của pack `vi` | `Không tìm thấy dữ liệu này. Bạn tải lại trang, hoặc quay lại danh sách để chọn mục khác.` |
| **Không** lỗi uncaught thoát ra ngoài | `window.__wizardUncaught` rỗng **và** không `Runtime.exceptionThrown` | rỗng / không có |
| Nút bước 2 về trạng thái sẵn sàng, không kẹt loading | `disabled=false`, nhãn về "soạn prompt" | `{"disabled":false,"text":"Soạn kịch bản & prompt"}` |
| Bấm bước 2 khi endpoint 404 **không** phát sinh lỗi uncaught | chính là kịch bản script ép | đạt |

Ngoài ra: bước 4 vẫn tới được và có khung để sao chép (1 khung), tức người dùng không
bị chặn ở giữa luồng.

### Ảnh chụp thật (AGENTS.md mục 8)

`frontend/.kilo/audit/vi-404/` — chụp ở locale `vi`, endpoint bị ép 404:

- `wizard-buoc-2-loi-404.png` — khung lỗi tiếng Việt, nút đã về nhãn "Soạn kịch bản & prompt"
- `wizard-buoc-4.png` — bước 4 có khung để sao chép
- `wizard-buoc-1.png`, `wizard-buoc-3.png`

## 2. Sai lệch so với brief — cần board biết

Brief ghi nguyên nhân là: `POST /api/wizard/generate_prompt` không tồn tại ⇒ trang gọi
API không có ⇒ lỗi không được bắt. **Phần "endpoint không tồn tại" thì đúng** (đã
kiểm: `GET /openapi.json` không có `wizard`; trong `backend/` chỉ có một dòng nhắc tên
trong test). **Phần "lỗi không được bắt" thì không đúng** với code hiện tại:

- `generate()` (`WizardPage.tsx:166-190`) đã bọc `try/catch/finally`: lỗi vào `setError`,
  `finally` luôn `setBusy(false)`, và dựng bản nháp để bước 4 vẫn dùng được.
- Chạy lại đúng kịch bản của audit (`AUDIT_ONLY=/wizard`) **không** dừng ở
  `buoc-2-y-tuong` nữa — cả `vi` và `en` đều đi hết 4 bước.

Khả năng cao `Uncaught` cũ là triệu chứng của `Runtime.evaluate` ném
(`exceptionDetails.text` luôn là chuỗi `"Uncaught"`), và `bdc6626` đã sửa đúng chỗ đọc
lỗi. Tôi không sửa gì thêm ở đây vì không tái hiện được, và sửa mò thì dễ làm hỏng.

## 3. Hai lỗi thật tìm ra khi làm bằng chứng (ngoài phạm vi `/wizard`)

Cả hai là lỗi của **công cụ đo**, không phải của trang — nhưng chúng làm số liệu audit
sai, nên tôi gửi board chứ không tự sửa (`visual-audit.mjs` là file dùng chung).

### 3.1 `localStorage` ghi lỗi trên tab vừa mở ⇒ ảnh `vi` ra tiếng Anh

`navigateAndSettle()` (`visual-audit.mjs:1066`) ghi `localStorage` **ngay sau khi mở
tab**, lúc tài liệu còn là `about:blank`. `localStorage` khi đó ném `SecurityError`,
giá trị **không** được ghi, trang rơi về ngôn ngữ trình duyệt (`en`).

Đo được trực tiếp:
```
setItem returned -> {"exc":"Uncaught"}
/wizard -> {"lang":"en","stored":null,"h1":"Prompt station"}
```
Dấu vết duy nhất là `EN` sáng trên thanh trên cùng. Hệ quả: **ảnh trong thư mục `vi/`
có thể là ảnh tiếng Anh** — đo sai mà nhìn thì tưởng đã Việt hoá. Điều này cũng giải
thích vì sao `vi/wizard` và `en/wizard` trông giống hệt nhau.

Đáng chú ý: `/` lại ra tiếng Việt đúng. Không phải ngẫu nhiên — tab được mở với URL
`BASE + '/'` nên `/` thường đã nạp xong khi lệnh `setItem` chạy, còn `/wizard` (mở
thẳng URL của nó trong lượt chạy của tôi) thì không. **Thứ tự route quyết định kết quả
đo** — đó là loại lỗi khiến số liệu không ổn định giữa hai lần chạy.

Cách sửa đúng: chờ `.wizard-actions` (marker của trang đã render) rồi mới ghi
`localStorage`, đúng như tôi làm trong script mới. `document.readyState` **không** dùng
để chờ được — nó trả `"complete"` ngay cả trên `about:blank`.

### 3.2 Preflight CORS bị trả 404 khiến test đo sai nhánh lỗi

Lần chạy đầu tiên của script tôi báo đúng lỗi 404 nhưng thông báo hiện ra là
*"Connection failed"* thay vì *"Không tìm thấy dữ liệu này"*. Nguyên nhân: `api.ts` gửi
kèm `Content-Type: application/json` nên trình duyệt bắn `OPTIONS` trước, mà
`urlPattern` khớp cả `OPTIONS`; trả 404 cho nó ⇒ thiếu `access-control-allow-origin` ⇒
trình duyệt chặn phản hồi `POST` ⇒ `fetch` ném `TypeError: Failed to fetch`.

Đáng nói: **cả hai nhánh đều không crash**, nên nếu chỉ khẳng định "không uncaught" thì
vẫn xanh — và ta tưởng đã kiểm 404 trong khi thực ra đang kiểm lỗi mạng. Đã sửa bằng
cách trả `OPTIONS` 204 với đủ header CORS. Bài học đã ghi trong comment của script.

## 4. Bổ sung: bảo đảm khẳng định không rỗng

Phần "không có lỗi uncaught" chỉ có giá trị nếu bộ dò lỗi **thật sự bắt được** lỗi.
Nếu collector hỏng, nó im lặng báo xanh mãi. Script cố tình ném một rejection thử
nghiệm và đòi phải bắt được:

```
DAT  bo do loi bat duoc rejection thu nghiem — unhandledrejection: canh bao thu nghiem
```

Không có dòng này, con số "17/17 đạt" chỉ là ảo.

## 5. Cổng chặn đã chạy

| Cổng chặn | Kết quả |
|---|---|
| `npm run check:wizard` | **17/17 đạt**, hai lần liên tiếp giống nhau |
| `npm run lint` | 40 warning, **0 error** — đúng baseline, script mới không bị báo |
| `npm run build` | **0 error** (`tsc -b && vite build`, built in 1.21s) |
| `pytest` | **không chạy được** — xem mục 6 |

## 6. `pytest` không chạy được — ghi rõ thay vì im lặng

Worktree `bunny-2` **không có `backend/.venv`**, và máy không có `pytest` trong Python
hệ thống (`ModuleNotFoundError: No module named 'pytest'`). Tôi đã tìm ở `bunny-1..5`,
`D:\wt\*` và các checkout cũ — không có venv nào để dùng.

Vì thế **không có con số pytest nào để báo**. Điều tôi khẳng định được: thay đổi của task
này **chỉ gồm một file mới** `frontend/scripts/wizard-error-check.mjs` và một dòng trong
`frontend/package.json` — `git status --porcelain` xác nhận không có file `backend/` nào
bị đụng, nên không thể làm hỏng số backend. Nhưng đây là suy luận, **không phải phép đo**,
và board nên chạy `pytest` ở lane có venv để chốt.

## 7. Ngoài phạm vi lane — đề nghị board giao việc

1. **`visual-audit.mjs:1066`** — lỗi `localStorage` trên `about:blank` (mục 3.1).
   Đây là lỗi nghiêm trọng nhất tôi phát hiện: nó làm **mọi ảnh `vi/` trông tin cậy một
   cách sai**, và số ký tự Trung đo được có thể thuộc về ngôn ngữ khác. Nên sửa ở đây
   trước khi ai đọc báo cáo audit khác.
2. **`/settings` làm CDP timeout 60s** khi chạy audit đầy đủ (đã thấy ở lượt chạy
   không giới hạn route). Không phải lane tôi, chưa điều tra sâu.
3. **`bunny/4` phần 1** — endpoint `POST /api/wizard/generate_prompt` vẫn chưa có.
   Script của tôi ép 404 nên vẫn chạy được sau khi endpoint thật xuất hiện, nhưng
   nhánh "thành công" thì **chưa** được kiểm bởi task này.

## 8. File đã đụng

| File | Việc |
|---|---|
| `frontend/scripts/wizard-error-check.mjs` | **mới** — tự kiểm 17 khẳng định, ép 404 qua CDP `Fetch` |
| `frontend/package.json` | thêm script `check:wizard` |

Không sửa mã nguồn ứng dụng. Không sửa `visual-audit.mjs` (file dùng chung, nằm ngoài
phạm vi lane). Không đụng backend.