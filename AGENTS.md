# AGENTS.md — novafilm (bản sở hữu riêng của chúng ta)

## 0. Danh tính dự án

- `novafilm` là repo của **chúng ta**, kế thừa từ PRINTFILM (`ai_movie`).
- Upstream gốc: `github.com/yi1108/printfilm`. Đây **không phải** bản chính thức của upstream.
- Stack: FastAPI (Python 3.12) `:8000` · Vite/React 19 `:5173` · admin Vite `:5174` · Postgres `:15432` · Redis `:16379`.
- Nguồn: `backend/`, `frontend/`, `admin/`, `docs/`, `deploy/`.

## 1. Mục tiêu hiện tại — thêm ngôn ngữ thứ 3: TIẾNG VIỆT

PRINTFILM hiện chỉ có 2 locale: `zh` (mặc định) và `en`. Ta thêm `vi` (tiếng Việt).

Kiến trúc i18n hiện tại (đọc trước khi sửa):

```
frontend/src/i18n/
  detect.ts          type Locale = 'zh' | 'en'; LOCALES; LOCALE_HTML; LOCALE_DATE; isLocale(); localeFromBrowser(); detectLocale(); applyLocale(); formatDateTime()
  messages.ts        messages: Record<Locale, Messages>  (Messages = typeof zh)
  context.tsx        I18nProvider / useI18n / t()
  lookup.ts          tra cứu key lồng nhau
  index.ts           public surface
  locales/zh.ts      export const zh  = { ...zhShell, ...zhPages }
  locales/en.ts      export const en  = { ...enShell, ...enPages }
  locales/zh/{shell,pages}.ts
  locales/en/{shell,pages}.ts
frontend/src/components/layout/LanguageSwitch.tsx   nút chuyển ngôn ngữ (đang hard-code zh/en)
```

Ràng buộc kỹ thuật: `Messages = typeof zh`, nên **`vi` phải có đủ key của `zh`**, cùng shape, cùng kiểu.
Thêm `vi` tối thiểu phải động vào: `detect.ts`, `messages.ts`, `locales/vi.ts`, `locales/vi/shell.ts`,
`locales/vi/pages.ts`, `LanguageSwitch.tsx`.

## 2. Quy tắc lane — KHÔNG được chạm lane khác

Board (main) chia 3 lane, mỗi lane là 1 git worktree riêng trên ổ `D:`:

| Lane | Path | Branch | Cổng dev |
|---|---|---|---|
| Bunny 1 | `D:\novafilm-lanes\bunny-1` | `bunny/1` | 5173 |
| Bunny 2 | `D:\novafilm-lanes\bunny-2` | `bunny/2` | 5183 |
| Bunny 3 | `D:\novafilm-lanes\bunny-3` | `bunny/3` | 5193 |

- Chỉ sửa file **trong lane của mình**. Không `git checkout` sang branch của lane khác.
- Tuyệt đối **không** `git push`, **không** `git stash`, **không** `git rebase` xoá history, **không** đụng `main`.
- Tuyệt đối không sửa `.kilo/agent-manager.json` (state của UI, sẽ bị ghi đè).
- Cần chạm ra ngoài lane ( ví dụ file dùng chung ) → **báo board, đừng tự sửa**. Board phân xử.
- Không chạy `docker compose up` / database dùng chung — sẽ đụng hạ tầng của lane khác.

## 3. Quy tắc git

- Commit trên branch lane của mình, message tiếng Anh dạng Conventional Commits:
  `feat(vi): ...`, `fix(vi): ...`, `refactor(vi): ...`, `docs(vi): ...`, `chore(vi): ...`
- Một commit = một đơn vị việc. Không commit file rác (`*.log`, `.env`, `node_modules/`, `dist/`).
- **Board giữ quyền push.** Agent commit xong thì báo board, board merge và push.
- Không `git commit -a --force`, không `git reset --hard` trên branch đã có việc của người khác.

## 4. Kiểm tra trước khi báo cáo

### Frontend
```bash
cd frontend
npm run lint          # oxlint — baseline: 1 error + 40 warning
npm run build         # tsc -b && vite build -> phải 0 error
```

### Backend
```bash
cd backend
.venv\Scripts\python.exe -m pytest -q
```

**Baseline (đo thật trên Windows, 2026-09-30, sau Wave 1.1b/1.1c/1.2/1.3: `4 failed, 635 passed, 1 skipped`).
Cả lỗi failed lẫn lỗi skipped đều là vấn đề có sẵn từ upstream, board đã chạy lại ở commit gốc
`88755c3` và xác nhận — không phải do ta:

- `test_fragment_video_estimate.py::test_fragment_video_estimate_720p_doubles_480p`
- `test_kepu_phase_billing.py::test_videos_estimate_hd_doubles_480p_preview`
- `test_kepu_phase_billing.py::test_shot_regen_video_estimate_uses_project_hd`
- `test_kepu_shot_edit_demote.py::test_narration_edit_invalidates_continuous_audio`
- `test_admin_stats.py::test_admin_stats_http_query_days_accepts_string_query` — **test này có điều kiện
  skip** (`demo 账号不可用，跳过 HTTP stats 回归`). Nếu tài khoản `demo` còn trong database thì nó FAIL,
  nếu không thì nó SKIP. Số lỗi vì vậy **phụ thuộc trạng thái database**, không phải do code.
  Board đã xác nhận điều này bằng cách chạy trên `main` không có thay đổi nào: vẫn SKIP.

Nếu số lỗi **vượt quá mức trên** thì do bạn. Đừng sửa 4 lỗi failed kia trừ khi được giao riêng.

### Cổng chặn bảo mật khi khởi động
`APP_ENV=production` với `SECRET_KEY` còn giá trị mặc định sẽ **từ chối khởi động** (đã kiểm chứng).
Chỉ `APP_ENV` bằng `prod` hoặc `production` mới kích hoạt cổng; `staging` và `dev` cố ý không bị chặn.
Sinh khoá: `python -c "import secrets; print(secrets.token_urlsafe(48))"`

Nếu `tsc` báo thiếu key `vi`, đó chính là lỗi cần sửa — không dùng `as any` để né.
Không được dùng `as unknown as Messages` hay bất kỳ cast nào để né kiểm tra.
Cơ chế đúng là `Widen<typeof zh>` trong `i18n/messages.ts`: thiếu key sẽ làm build FAIL.

## 5. Báo cáo về board

Báo cáo ngắn gồm: file đã đụng, commit hash, kết quả `npm run build`, và những chỗ bạn phát hiện
ngoài phạm vi lane (để board giao việc lại, không tự ý mở rộng phạm vi).

## 6. Hạ tầng và tên miền (quyết định 2026-09-30)

### Kiến trúc đã chốt
**Frontend = Firebase Hosting · Backend = VPS Linux với Docker Compose.**

Lý do: hệ thống có tác vụ nền, hàng đợi Redis, long-polling và timeout dài — serverless sẽ
đắt và cấu hình rắc rối. Hai tầng này ở **hai origin khác nhau**, nên CORS của API phải khai
báo origin của frontend.

### Tên miền: staging trước, production sau
- **Staging (tạm, chỉ để test):** `novastudio.rr.kg`.
  Lưu ý: đây là **subdomain miễn phí của Nodeloc, không phải tên miền chúng ta sở hữu**.
  Nhà cung cấp có thể thu hồi bất cứ lúc nào. Tuyệt đối không dùng làm production.
- **Production:** sẽ mua tên miền thật sau khi hệ thống ổn định.
- **CẤM hard-code bất kỳ domain nào vào source.** Mọi tham chiếu phải đến từ biến môi trường
  (`VITE_SITE_URL` cho frontend, `PUBLIC_BASE_URL` cho backend).

### Khi đổi staging → production, KHÔNG chỉ là đổi biến
Đây là danh sách những chỗ **phải thao tác ngoài repo**. Đừng tưởng là xong khi đã đổi env:

1. **Luật CORS của bucket Aliyun OSS.** `ensure_browser_cors()` trong `app/services/oss.py`
   ghi luật CORS **lên bucket**, không nằm trong repo. Phải vào console Aliyun sửa thủ công.
   Hàm này chỉ chạy khi `OSS_ENABLED=true`; mặc định đang là `false` nên hiện là no-op.
2. **Custom domain trong Firebase Hosting.** Console Firebase, không phải file trong repo.
3. **Bản ghi DNS.** Tên miền mới phải trỏ đúng, và tên miền cũ phải tháo ra.
4. **`CORS_ORIGINS` của FastAPI** (`config.py` → biến `CORS_ORIGINS`) phải khai đúng origin
   mới. Khác với mục 1: mục này là biến thật.
5. **`PUBLIC_BASE_URL` của backend** — dùng cho link email và URL media.

### Chưa được quyết, để dành
- ~~Media/Egress.~~ **ĐÃ QUYẾT 2026-10-01 — xem mục 9.**

## 10. NỢ KỸ THUẬT ĐANG MỞ (rà lại ở mỗi đợt)

- **Audit chưa từng chạy sạch hai lần liên tiếp.** Tiêu chuẩn board là hai lần cho kết quả
  giống hệt. Lượt gần nhất chỉ có **một** lần sạch. Trước khi tin một con số, **chạy hai lần**.
- **`/__drama/projects/{id}/episodes` còn tiếng Trung** — đây là **nội dung kịch bản trong
  database**, không phải giao diện. Sẽ dọn khi khởi tạo database thật, không tính là nợ UI.
- ~~**Cấu hình model có hai nguồn gây xung đột**~~ **ĐÃ SỬA 2026-10-01.** Kẻ ghi đè là
  `apply_tokenfree_flat_overlay` (`tokenfree_gateway.py`) đè `openai_base_url` / `openai_api_key`
  vô điều kiện, cộng thêm `_ensure_tokenfree_channel` (`model_settings.py`) ghim base URL mỗi
  lần nạp. Nay mỗi nhà cung cấp có **channel riêng**: `tokenfree` (ảnh/video/TTS), `text-openai`
  (Kira), `image-kira` (Kira). Đã kiểm chứng: PATCH giữ được giá trị, không còn bị về TokenFree.
- **Lưu ý khi đổi nhà cung cấp:** hàng cấu hình trong **database** có quyền ưu tiên cao hơn
  `.env`. Đổi `.env` một mình **không có tác dụng** — phải sửa qua `PATCH
  /api/admin/settings/models` (hoặc trang quản trị).
- **`billing_llm_per_m = 5.0` là giả định chưa đo.** Phải sửa trước khi bắt đầu thu credit.
- **Chưa bật `hy-image-v3.5-free` làm model ảnh** — nó chưa có bảng giá nên
  `estimate_task_fon` trả về con số khác và `test_tool_image_1k_uses_six_credits` vỡ. Phải
  **định giá trước**, không bật trước rồi tính sau.
- **Sinh kịch bản chế độ `script` chậm** — `vi/script` mất ~55 giây, và một lần trả rỗng ở 60 giây.
  Cần kiểm lại trước khi cho người dùng thật dùng.
- **`billing_llm_per_m = 5.0` là giả định chưa đo.** Khoá Gemini hiện **miễn phí**. Phải sửa
  trước khi bắt đầu thu credit, nếu không con số tính tiền sẽ sai.
- **Chưa build Docker image lần nào** — máy không cài Docker. Lên VPS phải dành thời gian.
- **Chưa kiểm OAuth với provider thật** — cần `client_id`/`secret` thật và URL https công khai.
  Cả bốn provider đều từ chối `localhost`.
- **`passlib` + `bcrypt` xung đột phiên bản** — cảnh báo bị nuốt mỗi lần đăng nhập. Chưa giao ai.
- **`api/drama.ts` từng có bản sao riêng của `API_BASE`** và làm hỏng 7 trang. Đã gộp về một
  nguồn, nhưng đó là bài học: **hai bản sao của cùng một quyết định là nguồn sự cố.**

## 11. BÁO CÁO CỦA LANE PHẢI NẰM TRÊN ĐĨA
Tiến trình `kilo run` **không gửi được tin nhắn lên board** (bị từ chối với `Board messages
cannot be sent to yourself`). Báo cáo chỉ tồn tại trong **tin nhắn cuối của tiến trình** — và
tiến trình chết là mất sạch. Đã xảy ra: một lượt giao chẩn đoán kết thúc với **0 commit, 0
file**, mất toàn bộ kết quả phân tích.

Luật: **việc quan trọng phải ghi ra file và `git commit` TRƯỚC khi báo cáo xong.** Tin nhắn cuối
chỉ nên chứa đường dẫn file và commit hash, không chứa nội dung.

## 9. KIẾN TRÚC LƯU TRỮ MEDIA — "chỉ lưu tri thức" (chủ sản phẩm chốt 2026-10-01)

### Nguyên tắc
1. **Postgres chỉ giữ tri thức tạo tác**: prompt gốc, negative prompt, seed, model id, tỉ lệ khung
   hình, cấu trúc storyboard. **Không lưu file nhị phân trong DB.**
2. **Không lưu media nặng trên đĩa VPS.** Đĩa VPS đắt khi scale và băng thông ra bị tính tiền.
3. **Object storage: Cloudflare R2** (tương thích S3), **không dùng Aliyun OSS**. R2 **miễn phí
   băng thông ra** — đó là lý do chọn R2 thay vì OSS.
4. **VPS chỉ gánh điều phối** (FastAPI). Dữ liệu nặng sang R2.
5. **OAuth ẩn sau feature flag** cho tới khi có `client_id`/`secret` thật và domain https công khai.
6. **Docker:** chỉ cần `Dockerfile` + `docker-compose.yml` sẵn sàng. **Không bắt buộc build image
   trên máy cá nhân.**

### Điểm đã CHỐT — không còn là câu hỏi mở
Chủ sản phẩm **xác nhận**: URL từ AI Gateway / nhà cung cấp upstream **hầu hết là URL ký số
(presigned) và chết sau vài giờ đến vài ngày**. Nếu chỉ lưu URL gốc mà không có bản lưu vĩnh
viễn, tính năng *"Xem lại lịch sử tác phẩm"* sau một đêm sẽ thành **đống link 403/404**.

**Chốt:** R2 giữ **tác phẩm đã render**. Postgres giữ **tri thức**. Đó là lý do chọn R2 — egress
miễn phí. Không lưu gì trên đĩa VPS, không tốn tiền băng thông, và tác phẩm tồn tại vĩnh viễn.

Phương án *"xem lại thì render lại từ prompt đã lưu"* bị loại: mỗi lần xem lại là một lần tạo
video mới — tốn tiền và phải chờ.

### Hệ quả phải xử lý
`backend/app/api/drama/assets.py` hiện **ghi ảnh tải lên xuống `static/generated/p{project_id}/`**
khi OSS tắt — thay đổi này **vừa merge hôm nay** và **trái ngược** quyết định mới. Nó giải quyết
lỗi "không tải ảnh được", nhưng giờ phải giới hạn: **đĩa chỉ dùng cho phát triển và kiểm thử**;
chạy thật mà chưa có object storage thì **phải báo lỗi rõ ràng**, không âm thầm ghi xuống đĩa rồi
mất khi dựng lại container.

## 7. MÔ HÌNH GIAI ĐOẠN — LOCALHOST TRƯỚC, VPS SAU (chủ sản phẩm chốt 2026-09-30)

Đây là luật quan trọng nhất của `AGENTS.md`. Board đã từng đặt sai thứ tự, coi VPS là
điều kiện để phát triển. **Không phải vậy.**

### Bốn giai đoạn, đúng thứ tự này
1. **Dựng và kiểm thử trên localhost.** Tính năng, việt hoá, thiết kế, OAuth — tất cả phải
   chạy và kiểm chứng được ở đây.
2. **Chỉnh sửa giao diện** theo phản hồi thị giác của chủ sản phẩm.
3. **Rà soát code và tối ưu** — dọn code chết, siết bảo mật, đo hiệu năng.
4. **Cuối cùng mới lên VPS.** Chỉ khi 1–3 đã xanh và chủ sản phẩm đã duyệt.

### Hệ thống chạy cục bộ (đây là nơi kiểm thử duy nhất ở giai đoạn 1–3)
| Thành phần | Cổng | Ghi chú |
|---|---|---|
| Postgres | `5432` | user/db `printfilm` |
| Backend FastAPI | `8000` | `.venv\Scripts\python.exe -m uvicorn app.main:app` |
| Frontend Vite | `5173` | `npm run dev -- --host 127.0.0.1 --port 5173` |

Kiểm tra backend sống:
```
Invoke-WebRequest http://127.0.0.1:8000/api/health    # kỳ vọng {"ok":true,...,"app":"NOVAFILM"}
```

### Cách frontend tìm API — đây là hành vi ĐÚNG, đừng "sửa"
`frontend/src/api.ts` có `defaultApiBase()` trả về `<protocol>//<hostname>:8000`.
Ở `localhost:5173` nó ra `http://localhost:8000` — **đúng**. Nên ở giai đoạn 1–3,
**không đặt** `VITE_API_BASE` rỗng trong `.env.production`. File đó chỉ dùng cho build deploy.

### Đăng nhập OAuth trên localhost
Luồng với provider thật **không chạy trọn được ở localhost**: Google, Microsoft, Facebook và
TikTok đều bắt buộc redirect URI là `https` + tên miền công khai, từ chối `localhost`.

Cách làm đúng ở giai đoạn này:
- Luồng, state, PKCE, liên kết tài khoản được kiểm chứng bằng **test offline** (`pytest`).
  Đó là lớp kiểm thử chính, và nó phải xanh.
- Cần xác minh với provider thật thì dùng tunnel (cloudflared / ngrok) — làm khi cần, không
  phải điều kiện để làm việc. Không dùng tunnel như lý do để trì hoãn.
- `/api/auth/providers` phải trả `{"providers":[]}` khi chưa cấu hình client_id/secret. Đó là
  hành vi đúng. Không được hard-code provider để "cho có nút".

### Site đã deploy là gì
`novastudio.rr.kg` là **bản xem trước**, không phải môi trường kiểm thử.
Firebase Hosting không phục vụ `/api`, nên mọi lệnh gọi API trên đó nhận về `index.html` với
HTTP 200 và mọi tính năng cần backend **đều hỏng ở đó — đó là điều được biết trước, không phải
lỗi mới**. Đừng deploy lại để "kiểm tra". Hãy kiểm tra ở localhost.

### Điều KHÔNG được dùng làm lý do
- ❌ "Chưa có VPS nên chưa kiểm thử được."
- ❌ "Chỉ kiểm được trên domain thật."
- ✅ Cách nói đúng: "Chạy ở localhost, dùng test offline cho phần không thể chạy thật."

Một tác vụ chỉ được coi là **xong** khi đã kiểm chứng ở localhost, hoặc khi đã ghi rõ trong
báo cáo rằng phần nào không kiểm chứng local được và vì sao.

### `npm run build` KHÔNG chứng minh được code chạy được
Sự cố thật đã xảy ra ở đây. `dramaImageStyles.ts` có `IMAGE_STYLE_OPTIONS` khai báo **trên**
`IMAGE_STYLE_LABELS`, và dòng đó là:

```ts
IMAGE_STYLE_IDS.map((id) => ({ id, ...styleOption(id) }))
```

Object spread **gọi thẳng getter** `label`, mà getter đọc `IMAGE_STYLE_LABELS` — một `const`
chưa khởi tạo. Dev server giữ nguyên thứ tự ESM nên ném
`ReferenceError: Cannot access 'IMAGE_STYLE_LABELS' before initialization` và **trắng trang**.
Rollup xếp lại thứ tự khi bundle nên `npm run build` vẫn **xanh**.

Bài học:
- **Build xanh không có nghĩa là trang chạy được.**
- Luôn kiểm tra bằng cách **thực sự mở app** ở `localhost` sau khi sửa, không chỉ chạy build.
- Khi báo "đã sửa", phải kèm bằng chứng đã mở trang và nhìn thấy, hoặc ghi rõ là **chưa** mở
  kiểm tra.
- Cẩn trọng với getter + object spread ở cấp module, và với `const` được đọc trong hàm nhưng
  khai báo sau nơi gọi.

## 8. KIỂM CHỨNG BẰNG ẢNH CHỤP THẬT — bắt buộc (chủ sản phẩm chốt 2026-09-30)

Máy này có **Microsoft Edge** ở `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
Không cài Playwright, không cài Puppeteer. Đã có sẵn công cụ trong repo:

```
cd frontend
node scripts\visual-audit.mjs
```

Nó làm 4 việc, tự động, cho **cả `vi` lẫn `en`** trên 25 route:
1. Bật Edge headless, đăng nhập bằng tài khoản thử, **ép locale** qua `localStorage`.
2. **Chụp màn hình từng trang** vào `%TEMP%\kilo\audit\<locale>\*.png`.
3. Đếm **ký tự Trung còn sót** trong phần chữ nhìn thấy, và phát hiện **lệch key i18n** kiểu
   `common.pageSizeBefore` bị in thẳng ra giao diện.
4. Bắt **lỗi JS lúc chạy** — đây là thứ bắt được lỗi trắng trang mà `npm run build` bỏ lọt.

### Quy tắc
- **Đếm bằng mắt trong mã nguồn KHÔNG ĐỦ.** Chủ sản phẩm đã bắt được trang mà mã nguồn nhìn thì
  đã sạch. Chạy `visual-audit.mjs` và **mở xem ảnh chụp** trước khi báo cáo.
- Báo cáo phải kèm **ảnh chụp**, không kèm mô tả bằng lời.
- Số liệu phải là **số đo từ công cụ**, không phải ước lượng.
- Nếu một route vẫn còn tiếng Trung vì **dữ liệu từ backend** (tên template, tên dự án, thông báo
  lỗi API) thì phải nói rõ **đó là nguồn nào**, không được tính vào "đã dịch xong".

### Nền đo hiện tại — 2026-09-30, trước khi chạy lại
| Route | `vi` | `en` |
|---|---|---|
| `/templates` | **1006** | **1006** |
| `/studio`, `/studio/new` | 239 | 239 |
| `/assets`, `/drama/assets` | 65 | 65 |
| `/drama/projects/2/canvas` | 39 | 39 |
| `/drama` | 28 | 28 |
| `/pricing` | 20 | 20 |
| **Tổng 25 route** | **1753** | **1751** |

Lưu ý khi đọc số: mọi trang đều cộng **+1** vì nút chuyển ngôn ngữ hiện chữ `中`. Đó là hành vi
đúng, không phải lỗi.

Hai route render trống vì id không tồn tại trong database local: `/studio/1/style`,
`/studio/1`, `/studio/1/editor`, `/drama/projects/2/episodes/1`, `/drama/projects/2`,
`/drama/projects/2/episodes`. Cần id thật mới kiểm được các trang đó — nếu muốn, hãy tạo dữ
liệu thử qua API rồi chạy lại audit.

Audit chạy xong **không phát hiện lỗi JS nào** — xác nhận lỗi trắng trang đã hết.
