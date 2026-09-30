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

```bash
# frontend (lane của bạn)
cd frontend
npm run lint          # oxlint
npm run build         # tsc -b && vite build  -> phải 0 error
```

Nếu `tsc` báo thiếu key `vi`, đó chính là lỗi cần sửa — không dùng `as any` để né.

## 5. Báo cáo về board

Báo cáo ngắn gồm: file đã đụng, commit hash, kết quả `npm run build`, và những chỗ bạn phát hiện
ngoài phạm vi lane (để board giao việc lại, không tự ý mở rộng phạm vi).
