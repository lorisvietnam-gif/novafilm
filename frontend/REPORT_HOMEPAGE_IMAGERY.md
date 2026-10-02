# Trang chủ — ô ảnh trống, đọc lại từ pixel thật

**Kết luận một dòng:** trong 15 ô trống mà bản brief nêu, **14 ô là cố ý** (hoặc do
ảnh `loading="lazy"` chưa tải — không phải thiếu ảnh), và **đúng 1 ô là lỗi thật**:
ô `cgi-3d-animation` trong dải 21 phong cách trỏ nhầm `.jpg` trong khi trên đĩa chỉ có
`.png`. Ô đó đã sửa xong.

Số đo ở dưới lấy từ trình duyệt, không đếm bằng mắt trong mã nguồn.

---

## 1. Bằng chứng brief sai ở đâu

Bản brief dựa vào ảnh `frontend/.kilo/audit/vi/trang-chu.png`. Đo kích thước file đó:

| file | kích thước thật |
|---|---|
| `frontend/.kilo/audit/vi/trang-chu.png` | **756 × 4000** |
| `frontend/.kilo/before-1440/vi/trang-chu.png` | 1440 × 1000 |
| `frontend/.kilo/before-390/vi/trang-chu.png` | 390 × 4000 |

Ba điều suy ra ngay, và cả ba đều làm bảng "ô trống" trong brief sai:

1. **Không phải ảnh 1440px.** Nó rộng 756px. Ở 756px các lưới `max-width: 1024px` /
   `max-width: 700px` đã kích hoạt nên bố cục hoàn toàn khác 1440.
2. **Chiều cao bị cắt cứng ở 4000px** (`visual-audit.mjs:836`). Ô "Dành cho ai chỉ có
   2 thẻ" chính là thẻ thứ ba bị cắt — mã có **3** thẻ (`m.home.audiences`, `pages.ts:61`).
3. **`Page.captureScreenshot` với `captureBeyondViewport: true`** (`visual-audit.mjs:831`)
   chụp trang nguyên dạng mà **không cuon**. Ở trang dài 3266px, mọi `<img loading="lazy">`
   nằm ngoài ngưỡng lazy của trình duyệt đều **chưa tải**, và ô của chúng hiện ra là
   nền `var(--pf-surface-sunken)` — tức đúng màu ô đen mà brief tưởng là "thiếu ảnh".

Đo lại ở cả hai phía cho thấy đúng như vậy (cùng một lần chạy, 1440px, locale `vi`):

| trạng thái | ô có `<img>` | ảnh **chưa tải** | ảnh **hỏng** |
|---|---|---|---|
| COLD — không cuộn (giống hệt `visual-audit.mjs`) | 32 | 16 | — |
| WARM — cuộn hết trang + cuộn hết dải ngang | 32 | 0 | **1** |

Sai lệch 16 → 0 là bằng chứng trực tiếp rằng 15 ô kia **có** ảnh, chỉ là ảnh chưa tới.

---

## 2. Phân loại từng khối

Đếm trên DOM, 42 ô ở 1440px: 32 ô có `<img>`, 10 ô không có (và cả 10 ô không có đều **không
có chỗ chừa ảnh trong CSS** — xem cột cuối).

| Khối | Số ô | Có `<img>` | Có chỗ chừa ảnh trong CSS | Kết luận |
|---|---|---|---|---|
| Hero — 2 khung | 2 | 2 | `.pf-land-frame` `aspect-ratio: 9/16` | **Có ảnh, đủ** |
| AI Drama / AI Short Video | 2 | 2 | `.pf-land-product-art` 232px | **Có ảnh, đủ** |
| "Ba bước ra phim" | 3 | 3 | `.pf-land-step-art` `16/10` | **Có ảnh, đủ** |
| Dải 21 phong cách | 21 | 21 | `.pf-land-reel-cell` `3/4` | **20 ảnh tốt · 1 lỗi thật** |
| 4 thẻ "21 phong cách / Tái nguyên / Storyboard / Hai lối" | 4 | 0 | `.pf-land-cap-grid article` — **không có** | **Cố ý, không có ô ảnh** |
| "Công cụ" — 6 thẻ | 6 | 0 | `.pf-land-tool-card` — **chỉ có icon 34px** | **Cố ý, không có ô ảnh** |
| "Dành cho ai" | 3 | 3 | `.pf-land-who-art` `21/9` | **Có ảnh, đủ** |
| Băng kết | 1 | 1 | `.pf-land-close-art` | **Có ảnh, đủ** |

Hai dòng "cố ý" là câu trả lời cho phần lớn bảng trong brief:

- **6 thẻ Công cụ**: `.pf-land-tool-card` (`printfilm.css:1098`) là `flex column` gồm icon
  34px + tiêu đề + mô tả. Không có `background-image`, không có `aspect-ratio`, không có
  ô đen nào. Vùng tối nhìn thấy trong ảnh brief chính là nền thẻ.
- **4 thẻ kỹ năng**: `.pf-land-cap-grid article` (`printfilm.css:1048`) là thẻ chữ, cùng
  nhóm với `.pf-land-who-grid article` nhưng bản `who` có `.pf-land-who-art` còn bản `cap`
  thì không. Cố ý: hai khối liền nhau phải khác nhau về dáng, và bốn thẻ này là phần chữ
  của khối.

Dòng mà brief gọi là "Những người đã làm (4 thẻ) — 2 thẻ đầu có ảnh, 2 thẻ sau trống" thực
ra là **dải cuộn ngang** ở trên: ở 756px chỉ 4 ô kịp hiện, ô thứ 3–4 chưa cuộn tới nên
ảnh chưa tải. Không có khối nào tên "Những người đã làm" trong trang.

---

## 3. Lỗi thật: `cgi-3d-animation` trỏ nhầm đuôi `.jpg`

`WITHOUT_DERIVATIVE` trong `HomePage.tsx:75` là style duy nhất không có bản thu nhỏ 512px.
Nhánh đó gọi `getDramaImageStylePreviewUrl(id)`, mà hàm này trả về **ứng viên đầu tiên**
của dãy `jpg → png → api → svg` (`dramaImageStylePreviews.ts:78`). Với 20/21 style ứng viên
đầu là `.jpg` và đúng. Riêng `cgi-3d-animation` trên đĩa **chỉ có `.png`** (1024×1024,
1,26 MB) — `public/image-styles/cgi-3d-animation.jpg` không tồn tại.

Vì sao nó hỏng **âm thầm**, không đỏ lên:

```
GET /image-styles/cgi-3d-animation.jpg  ->  200, Content-Type: text/html, 3668 bytes
```

Dev server trả `index.html` (SPA fallback) cho một đường dẫn ảnh. Trình duyệt nhận HTML
chỗ mong ảnh nên báo `complete = true, naturalWidth = 0` — tức là **ảnh đã tải xong và hỏng**,
không phải "đang tải". Ô đen có biểu tượng ảnh vỡ ở góc, và không có gì báo lỗi.

`Still` cố ý không đổi `src` khi ảnh hỏng (ghi chú ở `HomePage.tsx:91-101`), nên nó không
tự chịu được — phải chọn đúng ứng viên ngay trong `stillSrc`.

**Đã sửa** (`frontend/src/pages/HomePage.tsx`): nhánh `WITHOUT_DERIVATIVE` giờ lấy ứng viên
`.png` từ chính dãy ứng viên mà helper đó dùng, không tự dựng đường dẫn.

### Trước / sau — đúng một ô, cùng toạ độ cắt (1440px, `vi`)

Cùng một script, cùng một lần cuộn tới ô đó, cắt tại `x=601 y=346 156×208`, phóng 2×.

**Trước** — `.kilo/reel-cell/reel-cell-before.png` · `natural=0` · src `…/cgi-3d-animation.jpg`

![trước](../../frontend/.kilo/reel-cell/reel-cell-before.png)

**Sau** — `.kilo/reel-cell/reel-cell-after.png` · `natural=1024` · src `…/cgi-3d-animation.png`

![sau](../../frontend/.kilo/reel-cell/reel-cell-after.png)

### Trước / sau — toàn trang

| | 1440px | 390px |
|---|---|---|
| Trước | `.kilo/home-slots/1440-cold.png` · `.kilo/home-slots/1440-warm.png` | `.kilo/home-slots/390-cold.png` · `.kilo/home-slots/390-warm.png` |
| Sau | `.kilo/home-slots-after/1440-cold.png` · `.kilo/home-slots-after/1440-warm.png` | `.kilo/home-slots-after/390-cold.png` · `.kilo/home-slots-after/390-warm.png` |

Cột **cold** giữ nguyên trạng thái ảnh chưa tải — có 16 ô ở 1440 và 27 ô ở 390, và đó là
hành vi đúng của `loading="lazy"`, không phải lỗi. Cột **warm** (đã cuộn hết) là ảnh thật
mà người dùng nhìn thấy: **32/32 ô có ảnh đều tải thành công**, trước là 31/32.

---

## 4. Số đo tương phản

Đo bằng pixel thật, không dựng nền giả. `scripts/contrast-on-media.mjs` cho ba dòng hero
(`AUDIT_BASE=…:5195 AUDIT_WIDTH=1440`):

| vị trí | màu chữ | nền p05/p50/p95 | tiêu biểu | xấu nhất | cần | kết quả |
|---|---|---|---|---|---|---|
| kicker hero | `rgba(255,255,255,0.78)` | 0.023/0.040/0.092 | **6.90** | 4.38 | 4.5 | đạt |
| `<h1>` hero | `rgb(255,255,255)` | 0.013/0.019/0.083 | **15.18** | 7.91 | 3 | đạt |
| lede hero | `rgba(255,255,255,0.9)` | 0.008/0.011/0.063 | **13.71** | 7.43 | 4.5 | đạt |

`contrast-on-media.mjs` cắt bằng toạ độ **viewport**, nên nó chỉ đo được chuỗi đang hiện
trên màn hình: ba mục dưới đều in `(vùng chụp không có chữ — bỏ qua)` vì nằm dưới fold và
ảnh lazy chưa tải. Để có số thay vì một chỗ trống, tôi chạy lại đúng phép đo ấy với toạ độ
trang (`.kilo/contrast-below-fold.mjs`), 10/10 mục đo được, **0 mục hỏng AA**:

| vị trí | màu chữ | nền p05/p50/p95 | tiêu biểu | xấu nhất | cần | kết quả |
|---|---|---|---|---|---|---|
| chip khung hero (drama) | `#fff` | 0.007/0.009/0.050 | 17.65 | 10.51 | 4.5 | đạt |
| chip khung hero (kepu) | `#fff` | 0.006/0.007/0.040 | 18.44 | 11.72 | 4.5 | đạt |
| `<h2>` băng kết | `#fff` | 0.011/0.023/0.039 | 14.37 | 11.75 | 3 | đạt |
| đo phụ băng kết | `rgba(255,255,255,0.88)` | 0.010/0.024/0.037 | 10.73 | 9.17 | 4.5 | đạt |
| nút ghost trên ảnh | `#f5f5f7` | 0.008/0.008/0.026 | 16.57 | 12.77 | 4.5 | đạt |

**Kết luận về hero:** brief nói "hero rất tối, chữ nằm trên nền gần đen". Ở 1440px đo được
nền `p50 = 0.019–0.040` trên ảnh, tiêu biểu 6.9–15.2:1. Hero **không** tối, và nếu có sửa
thì sẽ là hại. Ảnh nền hero nhìn thấy rõ (xe trong mưa), hai khung hero đều có ảnh.

---

## 5. Tràn ngang ở 360 / 390

`documentElement.scrollWidth` so với `clientWidth`, đo ở ba khung:

| rộng | `scrollWidth` | `clientWidth` | tràn? |
|---|---|---|---|
| 1440 | 1440 | 1440 | không |
| 390 | 390 | 390 | không |
| 360 | 360 | 360 | không |

Không có tràn trang ở khung nào. Các phần tử mà trình dò báo vượt biên đều là
`.pf-land-reel-cell` nằm trong dải cuộn ngang — đó là nội dung cuộn được, không phải
tràn tài liệu.

---

## 6. Selector CSS

Đếm bằng `.kilo/count-selectors.mjs` (bỏ comment, đếm mỗi khối `…{ … }` không lồng nhau),
toàn bộ 16 file CSS trong `frontend/src`:

| | tổng selector | số file | tổng dòng |
|---|---|---|---|
| trước | **2810** | 16 | 23.192 |
| sau | **2810** | 16 | 23.192 |

Không mất, không thêm, không đổi selector nào — thay đổi chỉ nằm trong một file `.tsx`.
Chi tiết từng file: `.kilo/css-selectors-before.json`, `.kilo/css-selectors-after.json`.

---

## 7. Ảnh không dùng

Brief nói "5 style còn lại chưa xuất hiện ở đâu trên trang chủ". Đo lại:

- `IMAGE_STYLE_IDS` có **21** style, và dải cuộn ngang hiển thị **đủ 21** (`map` qua
  `IMAGE_STYLE_IDS`) — không style nào vắng mặt khỏi trang chủ.
- Ngoài dải đó có **11** style được gán cố định: 2 khung hero, 2 thẻ sản phẩm, 3 bước
  quy trình, 3 thẻ "Dành cho ai", 1 băng kết.
- **10** style chỉ xuất hiện trong dải cuộn ngang: `domestic-suspense-cold`,
  `ancient-romance-soft`, `japanese-daily-natural`, `chinese-urban-realistic`,
  `90s-realistic-film`, `retro-narrative-film`, `cgi-3d-animation`, `tezuka-era-cartoon`,
  `shanghai-animation`, `pixel-art`.

Cân nhắc "dùng 10 style còn lại để lấp chỗ trống" không còn đúng đề bài: không còn ô trống
nào để lấp.

---

## 8. Kiểm tra

| việc | kết quả |
|---|---|
| `npm run build` | xanh, 0 lỗi |
| `npm run lint` | 0 error, 40 warning — đúng baseline `AGENTS.md` |
| `node scripts/visual-audit.mjs` | 50 route, **0 lỗi JS**, 0 trang rỗng, 0 route API chết |
| trang `/` ở `vi` | `cjk=1` (nút chuyển ngôn ngữ chữ `中`), không lộ key i18n |
| `build` sau khi sửa | xanh |

`cjk=53` ở `/drama/projects/16/episodes` là **nội dung kịch bản Trung trong database**,
đã ghi ở mục 10 của `AGENTS.md`, không phải giao diện.

---

## 9. Ngoài phạm vi brief — phát hiện, không sửa

1. **`scripts/contrast-on-media.mjs` không đo được chữ dưới fold.** Nó cắt bằng toạ độ
   viewport (`contrast-on-media.mjs:180`) cho `Page.captureScreenshot` với `clip`, nên mọi
   mục dưới đều ra `(vùng chụp không có chữ)`. Ba mục trang chủ và ba mục ở `/method`,
   `/pricing`, `/auth` đều nằm dưới fold. Nên sửa dùng toạ độ trang + tải ảnh lazy trước
   khi đo. Tôi không sửa vì nó là công cụ dùng chung của nhiều lane.
2. **`/help` không đạt AA khi đo trên ảnh**: `.pf-help-page-hero p` đo được 4.45:1 / cần 4.5
   (nền p05 = 0.025). Thiếu 0.05. Ngoài phạm vi brief nên tôi để nguyên.
3. **`cgi-3d-animation` vẫn nặng 1,26 MB** cho một ô 156px, vì đó là bản gốc duy nhất có.
   Nên sinh thêm bản thu nhỏ 512px như 20 style kia. Lần này không sinh ảnh mới.

---

## 10. Cách đo lại

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5195 --strictPort
# trạng thái từng ô, ảnh tải được không, tràn ngang, ảnh theo từng khối
$env:PROBE_OUT="$PWD\.kilo\reel-check"
node .kilo\home-slots-probe.mjs
# chữ trên ảnh ở các khối dưới fold
node .kilo\contrast-below-fold.mjs
# đếm selector
node .kilo\count-selectors.mjs after
```

Bốn script trên nằm trong `frontend/.kilo/` (đã `.gitignore`, không commit). Chúng chỉ đọc
trang, không sửa mã nguồn.

**Hai bài học từ lần đo này, viết lại vì rất dễ quên:**

- Ảnh `loading="lazy"` dưới fold sẽ **không bao giờ** xuất hiện trong ảnh chụp toàn trang
  không cuộn. Muốn chụp ảnh thật thì phải cuộn trước rồi mới chụp.
- `Page.captureScreenshot` + `captureBeyondViewport: true` **vẽ lại** trang ở kích thước
  đầy đủ, nên nó ghi đè `scrollLeft` của mọi container cuộn ngang — ảnh chụp ra ô khác,
  và nếu cắt bằng `clip` cho phần tử trong container đó thì ra nền trắng. Muốn chụp đúng
  một ô trong dải cuộn ngang thì chụp nguyên viewport rồi cắt pixel bằng Node.
