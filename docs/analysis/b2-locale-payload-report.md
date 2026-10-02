# B2 — Gửi `locale` xuống các lời gọi sinh kịch bản (Phần 2 của brief)

Lane: `bunny-2` · nhánh `bunny/2` · chỉ sửa **frontend**.
Brief: `docs/briefs/case-locale-aware-script-prompt-b2-b4.md`, Phần 2.

Mọi số trong báo cáo này là **số đo từ công cụ**, không phải suy luận từ mã nguồn.
Công cụ: `frontend/scripts/locale-payload-check.mjs` (`npm run check:locale`), chạy trên
Edge headless + CDP, chặn request thật và đọc `postData` của nó.

---

## 1. Kết luận trước — có một phần brief nói **không đúng với hiện trạng repo**

Brief §Phần 2 mục 2 bảo: *"đừng bịa thêm biến mới nếu đã có `locale` trong schema
(`schemas.py:285` đã khai `locale`)"*.

Đọc `schemas.py` cho thấy dòng 285 **không phải** schema của lời gọi sinh kịch bản:

```
backend/app/schemas.py:285   class ContentExpandRequest   # /api/content/expand — MỞ RỘNG CHỦ ĐỀ
backend/app/schemas.py:286       topic, mode
backend/app/schemas.py:289       locale: str = "zh"        # ← dòng mà brief trích
```

`grep locale backend/app/schemas.py` trên **720 dòng** chỉ ra **một** kết quả duy nhất:
dòng 289. Ba schema sinh kịch bản thật sự **không có** trường `locale`:

| Lời gọi | Schema | Có `locale`? |
|---|---|---|
| `POST /api/content/expand` | `ContentExpandRequest` — `schemas.py:285` | **Có** (`schemas.py:289`) |
| `POST /api/projects/{id}/generate` | `ProjectGenerateIn` — `schemas.py:222` | Không |
| `POST /api/drama/agents/script_summary` | `DramaScriptSummaryRequest` — `schemas_drama.py:152` | Không |
| `POST /api/drama/agents/episode_script` | `DramaEpisodeScriptRequest` — `schemas_drama.py:159` | Không |

Hệ quả: **Phần 1 của brief (`bunny/4`) sửa `ark.py` thì không đủ.** Nếu chỉ sửa prompt mà
không khai `locale` trong ba schema kia, locale vẫn không tới được `chat_storyboard`.
Phần này là việc của `bunny/4` — xem §5.

---

## 2. Đo: backend có thật sự đọc `locale` không?

Không đọc schema là chưa đủ, vì **FastAPI bỏ qua field lạ** (Pydantic mặc định
`extra='ignore'`). Gửi `locale` vào endpoint chưa khai báo field đó **không gây lỗi** —
nó biến mất im lặng. Nên phải thử thật:

```
--- A: field `locale` có bị schema chặn không? ---
  POST /api/content/expand + field lạ  -> 200      (422 mới là bị chặn)
```

`200`, không phải `422`. Xác nhận: gửi thêm field là **an toàn, không tương thích ngược vỡ**,
và cũng không báo lỗi giúp ta phát hiện việc nó bị bỏ qua.

```
--- B: backend có đọc `locale` ở đâu? ---
  locale=vi -> title="Bí quyết hút khách quán…"   (0 ký tự Trung)
  locale=en -> title="Small Coffee Shop Growth"   (0 ký tự Trung)
  => CÓ đọc locale
```

Đây là bằng chứng **`/api/content/expand` chạy hết đường ngay hôm nay**: sau thay đổi này,
nút "AI viết hộ" ở `/studio/new` sản sinh tiêu đề đúng ngôn ngữ giao diện.

```
--- C: 3 endpoint sinh kịch bản còn lại ---
  studio generate       -> 200  được nhận
  drama script_summary  -> 404  được nhận   ("漫剧项目不存在" — project_id=1 không tồn tại)
  drama episode_script  -> 404  được nhận
```

Cả ba **nhận** request có `locale` mà không trả `422`. `404` là lỗi nghiệp vụ (project không
tồn tại), **không phải** lỗi schema. Nên: field tới nơi, và bị bỏ qua.

---

## 3. Thay đổi đã làm

Một hàm duy nhất, đặt ở tầng API:

`frontend/src/api.ts:79-98` — `withLocale(body)` đọc `getActiveLocale()` rồi dán vào body.

```ts
export function withLocale<T extends object>(body: T): T & { locale: string } {
  return { ...body, locale: getActiveLocale() }
}
```

Bốn chỗ dùng: `api.expandContent` (`api.ts:737`), `api.generate` (`api.ts:666`),
`dramaApi.scriptSummary` (`drama.ts:381`), `dramaApi.episodeScript` (`drama.ts:396`).

### Vì sao ở tầng API chứ không phải ở từng call site

1. **Không bịa biến mới, dùng cơ chế sẵn có.** `getActiveLocale()` (`i18n/detect.ts:61`) là
   module state mà `I18nProvider` ghi ngay trong initializer của `useState`
   (`i18n/context.tsx:29`) và mỗi lần đổi ngôn ngữ (`:36`). Đây đúng là cơ chế
   `lib/localeStrings.ts:27` đã dùng để chọn chuỗi ngoài React.
2. **Hai call site của `/drama` không có `useI18n()`.** `OutlineStep.tsx` và
   `OutlineEpisodePanel.tsx` không import module i18n. Truyền `locale` từ component xuống sẽ
   phải thêm import vào hai file không có nó — tạo ra nguồn sự thật thứ hai cho cùng một
   quyết định, đúng thứ `AGENTS.md` cảnh báo ở mục 10.
3. **Call site mới không thể quên.** Ở tầng API không có chỗ nào phải nhớ.
4. **Kiểu tham số của `scriptSummary`/`episodeScript` cố tình đóng** — không có `locale`.
   Muốn sinh bằng ngôn ngữ khác thì phải đổi ngôn ngữ của app, không phải đổi tham số.

### 8 call site được phủ, không sửa file nào trong `pages/`

`api.generate` × 3 (`StyleConfigPage.tsx:214`, `StoryboardPage.tsx:344`, `:376`),
`api.expandContent` × 1 (`CreateProjectPage.tsx:157`), `dramaApi.scriptSummary` × 1
(`OutlineStep.tsx:116`), `dramaApi.episodeScript` × 2 (`OutlineStep.tsx:148`,
`OutlineEpisodePanel.tsx:441`).

### Đã sửa một quyết định cũ, và ghi lý do mới

`api.generate` trước đây cố tình để `body: undefined` khi không có ảnh tham chiếu, với lý
do ghi trong code: *"gửi body rỗng chỉ để nói không có gì là rác"*. Lý do đó **hết hiệu
lực**: body giờ luôn mang `locale`, tức là không còn rỗng. Comment cũ đã bị thay bằng lý do
mới. Tương thích ngược vẫn giữ nguyên ở phía server: `body: ProjectGenerateIn | None`
(`projects.py:705`) cùng test `test_generate_without_body_still_accepts_query_restart`.

---

## 4. Đo: `npm run check:locale` — 12/12 đạt, hai lần liên tiếp giống hệt

Mỗi endpoint được bắn bởi **luồng UI thật**, không gọi hàm trực tiếp:

| Endpoint | Cách bắn |
|---|---|
| `/api/content/expand` | Bấm `.pf-btn-ai` ở `/studio/new` |
| `/api/projects/{id}/generate` | Bấm `.pf-btn-lime.pf-btn-lg` ở `/studio/{id}/style` |
| `drama/agents/script_summary` | `OutlineStep` **tự chạy** khi mount (`OutlineStep.tsx:198-274`) |
| `drama/agents/episode_script` | Tiếp theo, vì tóm tắt giả báo `completed` còn `episode_content` rỗng nên `autoMissingEpisodeCount` > 0 |

Đo ở cả **3** locale (`vi`, `en`, `zh`) — `zh` thêm vào để chắc payload *bám theo giao diện*
chứ không bám một giá trị cứng.

```
===== TONG HOP =====
vi: 4/4 endpoint gui dung
en: 4/4 endpoint gui dung
zh: 4/4 endpoint gui dung

DAT: 12 lan do (4 endpoint x 3 locale) — payload buoc theo ngon ngu dang hien tren giao dien.
```

Body thật đã đo (rút gọn):

```
POST /api/content/expand              {"topic":"Biến điểm bán của…","mode":"theme","locale":"vi"}
POST /api/projects/{id}/generate      {"restart":false,"subject_ref_urls":[],"style_ref_urls":[],"locale":"en"}
POST /api/drama/agents/script_summary {"project_id":23,"locale":"zh"}
POST /api/drama/agents/episode_script {"project_id":23,"batch_size":1,"force":false,"locale":"zh"}
```

### Chạy hai lần (tiêu chuẩn board ở `AGENTS.md` mục 10)

Lượt 1: 12/12. Lượt 2: 12/12, giống hệt. Khác biệt duy nhất là `project_id` của project
drama tăng dần (23 → 24) — **đúng thiết kế**: mỗi lượt tạo project drama mới, vì
`OutlineStep` chỉ tự gọi `script_summary` khi project còn chưa có tóm tắt.

Lượt chạy thứ hai có một lần thất bại `LOI: fetch failed` **trước** khi chạy lại được.
Đã **kiểm tra**, không đoán: `http://127.0.0.1:8000/api/health` trả `Connection refused`
(trong khi dev server `:5183` vẫn `200`), và vài giây sau đó backend trở lại `200`. Backend
đó là tiến trình của checkout `E:\novafilm\printfilm-main` — hạ tầng dùng chung, không
phải của lane này, nên ta **không** khởi động lại hay can thiệp. Đây là hạ tầng chập chờn,
không phải lỗi code.

### Kiểm chứng công cụ thật sự bắt được lỗi (kiểm chứng âm)

Một phép đo luôn xanh thì vô dụng. Nên đã **cố tình làm hỏng** `expandContent` (bỏ
`withLocale`) rồi chạy lại:

```
  SAI    [vi] POST /api/content/expand gui locale — locale=undefined · body={"topic":"…","mode":"theme"}
  SAI    [en] … locale=undefined
  SAI    [zh] … locale=undefined
vi: 3/4 · SAI: contentExpand      (thoát mã 1)
```

Bắt đúng, chỉ đúng endpoint bị hỏng, ba endpoint còn lại vẫn xanh. Đã hoàn nguyên và
`tsc -b` xanh.

### Vì sao công cụ tự trả lời thay vì gọi thật

`Fetch.requestPaused` chặn ở `Request` stage rồi **tự trả lời bằng dữ liệu giả**. Không có
bước này thì mỗi lượt sẽ gọi LLM thật, trừ credit và đẩy database đi xa. Điều này không
phải suy ra — nó xảy ra thật: script dò backend dùng thử đã **vô tình** kích hoạt một
pipeline thật trên project 59 (`status=SCRIPTING`, `progress=5`) qua
`POST /api/projects/59/generate`. Đã **hủy** ngay (`POST /api/projects/59/cancel` →
`status=CANCELLED`) và xoá script dò đó. Hậu quả: một lượt tiêu LLM nhỏ trên backend dùng
chung. Script dò đã bị xoá, không vào commit.

### Ba lỗi mà công cụ tự phát hiện trong lúc viết (ghi lại vì chúng dễ lặp lại)

1. **Điều hướng trước khi chặt token** → app đẩy sang `/auth`, `Page.reload` nạp lại
   `/auth`, selector không bao giờ xuất hiện, chết ở mốc 60s. Sửa: chặt token **trước**, rồi
   mới điều hướng.
2. **`#root` nằm sẵn trong `index.html` tĩnh** nên xuất hiện trước khi React mount — chờ nó
   là chờ không. Đo được: báo `lang="vi"` ở locale `en`, đúng `<html lang="vi">` viết cứng
   trong `index.html`. Sửa: chờ bằng `document.documentElement.lang`, vừa là tín hiệu đã
   render vừa là chính thứ đo.
3. **`endsWith` không khớp `/api/projects/{id}/generate`** vì có id động ở giữa — so chuỗi
   hậu tố biến thành `/api/projects//generate`. Sai này **không báo lỗi mà im lặng bỏ sót**:
   endpoint không bao giờ bị chặn, và kịch bản vẫn "thành công" vì không có gì để kiểm. Sửa:
   dùng regex.

Ngoài ra `captureOne()` ban đầu tự xoá mảng **sau** cú click nên xoá luôn chính request cần
đo; và bản tổng kết đầu tiên lấy `captured.slice(-1)` cho mọi locale nên in ra
`vi: 0/4 · SAI` ngay dưới dòng "tất cả đều đúng" — hai kết luận trái ngược trong cùng một
bản in. Cả hai đã sửa; tổng kết giờ dựng từ danh sách lần đo, không suy ra từ giả định.

---

## 5. Việc còn thiếu — **không phải của lane này**

Đây là phần quan trọng nhất của báo cáo. Frontend đã gửi; backend mới tiêu thụ được 1/4.

### Cho `bunny/4` (Phần 1)

| Việc | Vị trí |
|---|---|
| Khai `locale` trong `ProjectGenerateIn` | `schemas.py:222` |
| Khai `locale` trong `DramaScriptSummaryRequest` | `schemas_drama.py:152` |
| Khai `locale` trong `DramaEpisodeScriptRequest` | `schemas_drama.py:159` |
| Truyền `locale` vào payload job (qua hàng đợi) | `drama/jobs.py:210` và `:298-306` |
| Truyền `locale` từ `generate_project` xuống `chat_storyboard` | `projects.py:702` → `pipeline.py:720-736` |
| Đọc `locale` trong hai prompt builder | `ark.py:702` và `:729` (giữ nguyên danh sách trường/JSON) |

Hai việc cuối **quan trọng nhất** vì dễ bỏ sót:

- **Hàng đợi là chỗ locale chết.** `dispatch_script_summary_job` và
  `dispatch_episode_scripts_job` đóng gói `{"project_id": ...}` rồi đẩy đi
  (`jobs.py:218`). Không đưa `locale` vào payload thì nó mất ngay lúc đóng gói, dù handler
  đã nhận được.
- **Prompt của drama còn nguyên tiếng Trung.** Ngoài `ark.py:702`/`:729`, các prompt drama
  cũng viết cứng `简体中文` ở `drama/agents.py:32, 57, 78, 93, 118, 133` và
  `drama/script_summary_prompt.py:25`. Sửa `ark.py` **không** làm cho drama ra tiếng Việt.

### Quyết định cần chốt: mặc định là `zh` hay `vi`?

- Frontend `DEFAULT_LOCALE = 'vi'` (`i18n/detect.ts:9`)
- Backend `ContentExpandRequest.locale` mặc định `"zh"` (`schemas.py:289`), và
  `expand_content` rơi về `"zh"` khi rỗng (`ark.py:2443`)

Hai mặc định này **mâu thuẫn nhau**. Ba field mới nên để mặc định `"zh"` để giữ đúng ý
"không đổi hành vi cũ" đã ghi ở `ark.py:2467`. Nhưng nếu sau này bỏ hỗ trợ tiếng Trung thì
mặc định backend sẽ sai. **Xin board chốt**, vì nó nằm ở ranh giới giữa hai lane.

### Ngoài phạm vi, phát hiện lúc đọc code — không tự sửa

1. **Có tới hai cách gọi ngôn ngữ trên dây.** Frontend gửi `locale` (mới) cho 4 endpoint
   sinh kịch bản, nhưng `api.wizardGeneratePrompt` (`api.ts:816`) gửi **`language`** với
   kiểu `Literal["vi","en"]` (`backend/app/api/wizard.py:24`) — không có `zh` — và
   `WizardPage.tsx:178` gộp `zh` thành `vi`. Đây là quy ước thứ ba cho cùng một ý nghĩa.
   Không tự đụng vì `bunny/2` từng sở hữu `/wizard` và đổi tên trường sẽ phá client cũ.
2. **`OutlineStep.tsx` và `OutlineEpisodePanel.tsx` viết thẳng tiếng Việt vào JSX**
   (ví dụ `'Ý tưởng toàn phim'`, `'Chạy lại toàn bộ tập'`, `'Tạo tóm tắt kịch bản thất bại'`)
   chứ không qua `t()`. Cùng file đó lại chạy pipeline tự động ngay khi mount — tức là một
   lượt sinh kịch bản ở `en` vẫn hiện chữ Việt trên nút bấm. Không thuộc task này.

---

## 6. Kiểm tra bắt buộc

| Lệnh | Kết quả |
|---|---|
| `npm run check:locale` (frontend) | **12/12 đạt**, hai lần liên tiếp giống hệt |
| Kiểm chứng âm (bỏ `withLocale` rồi chạy lại) | **Bắt đúng** — `SAI` ở `contentExpand`, thoát mã 1 |
| `npm run lint` | **0 error / 40 warning** — đúng baseline `AGENTS.md` mục 4 |
| `npm run build` | `tsc -b && vite build` **exit 0**, build xong trong 1.07s |
| `npx tsc -b` (sau khi hoàn nguyên kiểm chứng âm) | exit 0 |

Không sửa file backend nào, nên không có thay đổi nào ảnh hưởng `pytest`. Không migrate
database. Không `docker compose`.

## 7. File đã đụng

```
frontend/src/api.ts                              +withLocale, expandContent, generate
frontend/src/api/drama.ts                        scriptSummary, episodeScript
frontend/scripts/locale-payload-check.mjs        MỚI — công cụ đo
frontend/package.json                            +script check:locale
docs/analysis/b2-locale-payload-report.md        MỚI — báo cáo này
```

Ngoài lane đã báo ở §5: `backend/app/schemas.py`, `backend/app/schemas_drama.py`,
`backend/app/api/projects.py`, `backend/app/api/wizard.py`,
`backend/app/services/drama/jobs.py`, `backend/app/services/drama/agents.py`,
`backend/app/services/drama/script_summary_prompt.py`, `backend/app/services/pipeline.py`,
`backend/app/services/ark.py`, `frontend/src/pages/wizard/WizardPage.tsx`,
`frontend/src/pages/drama/OutlineStep.tsx`, `frontend/src/pages/drama/OutlineEpisodePanel.tsx`.