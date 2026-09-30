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

**Baseline (đo thật trên Windows, 2026-09-30): `5 failed, 609 passed`.** Cả 5 lỗi là bug có sẵn từ
upstream, board đã chạy lại ở commit gốc `88755c3` và xác nhận y hệt — không phải do ta:

- `test_admin_stats.py::test_admin_stats_http_query_days_accepts_string_query`
- `test_fragment_video_estimate.py::test_fragment_video_estimate_720p_doubles_480p`
- `test_kepu_phase_billing.py::test_videos_estimate_hd_doubles_480p_preview`
- `test_kepu_phase_billing.py::test_shot_regen_video_estimate_uses_project_hd`
- `test_kepu_shot_edit_demote.py::test_narration_edit_invalidates_continuous_audio`

Nếu số lỗi **vượt quá 5** thì do bạn. Đừng sửa 5 lỗi trên trừ khi được giao riêng.

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
- **Media/Egress.** Với `OSS_ENABLED=false`, FastAPI phục vụ `/static` từ đĩa VPS. Sản phẩm
  xử lý video mà băng thông video chạy trên một VPS là khoản chi phí cần tính trước.
  Cơ chế OSS có sẵn là Aliyun (Trung Quốc) — độ trễ tới Việt Nam và người dùng quốc tế sẽ tệ.
  Cần chọn nhà cung cấp lưu trữ trước khi ra mắt.
