# REPORT — Nối lớp nhãn hiển thị vào trang xem tập (67 ký tự Trung)

**Lane:** `bunny/2` · **Path:** `D:\novafilm-lanes\bunny-2` · **Ngày:** 2026-10-02
**Brief:** `.kilo/briefs/wire-episode-labels.md` · **Base:** `55f394c` (đã đồng bộ `main`)

> **Trạng thái báo cáo:** PHẦN I là bản nháp đầu tiên, commit **trước** khi sửa code — theo yêu cầu
> "write and COMMIT the report file first" và `AGENTS.md` §11 (tiến trình chết là mất sạch).
> PHẦN II là việc của brief `.kilo/briefs/add-missing-bgm-label.md`: thêm **một** biến thể
> nhãn BGM. Số đo "sau" của cả hai phần được bổ sung ở commit cuối.

---

## 0. KẾT LUẬN ĐẦU TIÊN — tiền đề của brief **không đúng**

Brief nói: *"Lớp nhãn đã có sẵn — vấn đề là CHƯA NỐI"*, và liệt kê
`EpisodesPage.tsx` + `EpisodeEditPage.tsx` là hai chỗ **không** gọi lớp nhãn.

**Cả hai đều sai, và tôi có bằng chứng cơ học chứ không phải suy đoán:**

### 0.1 `EpisodeEditPage` **đã** nối rồi, qua `EpisodeEditPromptEditor`

`EpisodeEditPage.tsx:1580` render `<EpisodeEditPromptEditor content={selected?.content || ''} …>`.
Bên trong, `EpisodeEditPromptEditor.tsx:84-98`:

```ts
const asDisplay = !editing
renderPromptEditorContent(editor, next, resolveChip, asDisplay ? localizeScriptContent : undefined)
```

**Bằng chứng rằng nó thật sự chạy** (chứ không chỉ là có trong mã) là trong ảnh chụp của
audit: dòng `【字幕：后期叠旁白字幕，简体中文逐句同步】` **không xuất hiện** trong danh sách
dòng có tiếng Trung, trong khi dòng `【BGM：…】` ngay bên dưới **có**. Cùng một khối chữ,
cùng một lần render — nếu `localizeScriptContent` không chạy thì cả hai đều phải hiện nguyên
tiếng Trung. Chỉ có cách giải thích duy nhất: dòng phụ đề **đã** được dịch, dòng BGM thì không.

Nếu không dịch, `/drama/projects/16/episodes/3` phải ra **ít nhất 81 ký tự Trung**, không
phải 67. Đo được: **67**.

### 0.2 `EpisodesPage.tsx` không có gì để nối

File này dài 60 dòng và là **trang chuyển hướng thuần**: nó gọi
`resolveStoryboardPath(pid)` rồi `navigate(path, { replace: true })`. Thân nó chỉ render
một dòng `'Đang mở trang storyboard…'` (tiếng Việt, không có ký tự Trung).

Đó cũng là lý do **hai route audit cho ra đúng cùng một con số 67**: `/episodes` chuyển
hướng tới `/episodes/3`, nên cả hai dòng audit đo **cùng một trang**, đếm hai lần. Không
phải hai nơi lọt tiếng Trung — **một nơi**, đếm hai lần.

---

## 1. 67 ký tự Trung là **gì**, đếm từng ký tự

Lấy từ `AUDIT_VERBOSE=1` (dòng `cjkLines` trong `report.json`), không suy đoán:

| Dòng hiển thị | Ký tự Trung | Loại |
|---|---|---|
| `【BGM：后期混音 · 轻快专业，音量低于人声】` | 14 | **nhãn chưa có trong bảng** |
| `远景：清晨的老街，薄雾未散，` | 11 | văn xuôi kịch bản (`远景` = 2 ký tự là nhãn cỡ cảnh) |
| `静静躺在巷口，` | 6 | văn xuôi |
| `站在路口望向深处，手里的伞还在滴水` | 16 | văn xuôi |
| `走近半步，` | 4 | văn xuôi |
| `被攥在掌心，低声说：「这张照片，你见过吗？」` | 16 | văn xuôi |
| **Tổng** | **67** | |

Chia ra: **14 ký tự là nhãn**, **53 ký tự là nội dung kịch bản do mô hình sinh ra**.

53 ký tự văn xuôi đó **không phải giao diện** — đó là dòng prompt mà người dùng nhập hoặc
mô hình sinh, lưu trong `drama_fragments.content`. Dịch nó là **dịch nội dung người dùng**,
không phải đổi cách hiển thị. Theo `AGENTS.md` §8 ("phải nói rõ đó là nguồn nào, không được
tính vào *đã dịch xong*") tôi **không tính** 53 ký tự đó là lỗi giao diện.

---

## 2. Brief giải mã sai nội dung này

Brief §"BỐI CẢNH" in ra một khối như là nội dung thật:

```
【BGM：轻快鼓点 · 节奏专业，鼓组与人声分轨
无混响，干净，适合旁白。
⚠️（无字幕）
语言左右声道，旁白居中，干净
旁白时长：8.4
（无转场声）
```

**Khối này không tồn tại trong database.** Tôi đã tra thẳng:

- `grep` toàn worktree cho `无混响` / `旁白时长` / `转场声` / `语言左右声道` → **0 kết quả**
  (không có trong code frontend lẫn backend).
- `GET /api/drama/episodes/3` → `content` thật của 4 fragment là (nguyên văn):

```
【字幕：后期叠旁白字幕，简体中文逐句同步】
【BGM：后期混音 · 轻快专业，音量低于人声】
@duration:4
远景：清晨的老街，薄雾未散，@asset:19 静静躺在巷口，@asset:18 站在路口望向深处，手里的伞还在滴水
@duration:6
@asset:18 走近半步，@asset:20 被攥在掌心，低声说：「这张照片，你见过吗？」
```

Nguyên nhân rất có thể: PowerShell trả về UTF-8 bị đọc như Latin-1, ra mojibake
`ãå¤å¹ï¼…`, rồi khối mojibinkle ấy bị "giải mã" thành văn xuôi trông có vẻ hợp lý. Tôi ghi
ra đây để board không đối chiếu danh sách trong brief với dữ liệu rồi tưởng database bị
đổi — đúng bài học `AGENTS.md` §11 và báo cáo `REPORT_REFERENCE_IMAGES.md` §2.

---

## 3. Danh sách chuỗi chưa có nhãn — **không tự bịa**

Brief mục 3: gặp chuỗi chưa phủ thì *báo lại danh sách*, đừng bịa nhãn dịch. Đây là danh
sách, lấy từ dữ liệu thật của project 16 / tập 3:

| # | Chuỗi | Nguồn | Trạng thái |
|---|---|---|---|
| 1 | `【BGM：后期混音 · 轻快专业，音量低于人声】` | `drama_fragments.content`, fragment id=8 | ~~chưa có nhãn~~ → **đã thêm ở PHẦN II §10** |

Cụ thể hơn, phần chưa có nhãn là **tâm trạng BGM**: `轻快专业，音量低于人声`.

Vì sao nó không có trong bảng — đọc code backend, không đoán:

`backend/app/services/seedance_segments.py:400-404`
```python
def build_production_cues(bgm_mood: str) -> list[str]:
    mood = (bgm_mood or "").strip() or DEFAULT_BGM_MOOD
    if "音量低于人声" not in mood:
        mood = f"{mood}，音量低于人声"
    return [SUBTITLE_CUE, f"【BGM：后期混音 · {mood}】"]
```

`build_production_cues` **luôn** dán đuôi `，音量低于人声` vào tâm trạng trước khi bọc
cue. Mà `BGM_MOOD_LABELS` trong `dramaScriptLabels.ts:148-179` lấy từ
`build_fragments._infer_bgm_mood` (`build_fragments.py:573-585`), là **tập khác**, không
mục nào chứa `音量低于人声`.

Hệ quả đo được: **nhánh `postMix` trong `localizeScriptCue` là code chết** — nó tra
`BGM_MOOD_LABELS[mood]` với `mood` luôn kết thúc bằng `，音量低于人声`, nên **không bao giờ
trúng** mục nào. Cả `BGM_CUE_TEMPLATES.postMix` cũng vì thế không bao giờ được dùng.

Và tâm trạng này **không phải danh sách đóng**: `script_bgm_mood()`
(`seedance_segments.py:386-397`) đọc nguyên văn dòng `【BGM：…】` mà mô hình đã viết, rồi
`build_production_cues` bọc lại.

> ⚠️ **Đoạn dưới đây sai, và PHẦN II §10 đã đính chính.** Tôi kết luận `轻快专业` là chuỗi mô
> hình tự viết vì nó không nằm trong `BGM_MOOD_KEYWORDS` (`seedance_segments.py:293-299`)
> hay `_infer_bgm_mood` (`build_fragments.py:575-585`). **Hai danh sách đó chỉ là hai đường
> suy luận, không phải toàn bộ nơi giá trị này tồn tại.** Đọc thêm `backend/` thì thấy nó là
> **mặc định BGM của cả hệ thống**: `pipeline.py:752` (chốt fallback cuối của `bgm_lock`),
> `templates_seed.py:73,130,297` và `templates_seed_huoke.py:123` (`audio_config.bgm_mood`).
> Bài học: **"không có trong danh sách tôi đọc" khác hẳn "không có trong sản phẩm"** — và
> tôi đã suy ra thứ hai từ thứ nhất.

**Vì vậy ở PHẦN I tôi không thêm nhãn cho `轻快专业，音量低于人声`.** Quyết định đó **đúng về
quy trình** (báo lại danh sách thay vì tự dịch, đúng brief mục 3) nhưng **sai về kết luận**, vì
lẽ ra phải tra thêm một vòng thay vì dừng ở hai danh sách. PHẦN II đã thêm đúng một mục, có
dẫn nguồn.

### Danh sách *có* trong code backend, để board chọn (tôi không tự thêm)

**Nhóm A — `seedance_segments.BGM_MOOD_KEYWORDS` + `DEFAULT_BGM_MOOD`** (6 chuỗi, đã có sẵn
đuôi `，音量低于人声`):

| Chữ | Nghĩa |
|---|---|
| `低沉紧张、鼓点渐强，烘托压迫感，音量低于人声` | căng thẳng, trống dồn |
| `温暖人文、钢琴弦乐铺底，音量低于人声` | ấm áp, piano + dây đàn |
| `轻电子氛围，克制不抢戏，音量低于人声` | điện tử nhẹ |
| `轻快专业、干净电子铺底，音量低于人声` | nhanh gọn, chuyên nghiệp |
| `史诗弦乐铺底，气势克制，音量低于人声` | sử thi, dây đàn |
| `贴合内容的轻量配乐，情绪平稳，不抢旁白` | nhẹ theo nội dung |

**Nhóm B — `build_fragments._infer_bgm_mood`** (6 chuỗi, **không** có đuôi): đây chính là 6
mục đã nằm trong `BGM_MOOD_LABELS`, và nhánh `volume` xử lý đúng.

Nếu board muốn nhóm A có nhãn, đó là việc thêm 6 dòng vào `BGM_MOOD_LABELS` — **và nhánh
`postMix` sẽ sống ngay** vì sau khi bỏ đuôi `，音量低于人声` thì nó khớp nhóm B.

---

## 4. Nối vào **chỗ nào**, và vì sao chọn hàm nào

Vì mục 1 của brief đã được thoả ở `EpisodeEditPromptEditor`, phần còn lại tôi **không** nối
thêm vào `EpisodesPage` / `EpisodeEditPage` — không có chỗ nào hiển thị văn xuôi chưa qua
lớp nhãn, và nối thêm chỉ tạo ra hai bản sao của cùng một quyết định (đúng cái bài học
`AGENTS.md` §10 ghi về `api/drama.ts`).

Ba hàm được chọn theo đúng phạm vi của chúng:

| Hàm | Dùng ở | Vì sao đúng hàm này |
|---|---|---|
| `localizeScriptContent` | cả khối `content` của fragment, ở chế độ **chỉ xem** | giữ nguyên số dòng và thụt lề; dòng không nhận diện được thì trả **nguyên bản kèm thụt lề** (`dramaScriptLabels.ts:333-341`) — đúng yêu cầu mục 4 của brief ("không có nhãn thì hiện bản gốc, đừng làm rỗng") |
| `localizeScriptLine` | một dòng, khi cần dịch lẻ mà không đụng cả khối | là hàm mà `localizeScriptContent` gọi bên trong; dùng trực tiếp khi chỉ có một dòng |
| `localizeScriptCue` | **một marker cue đứng đầu dòng** (`【…】`) | đúng đơn vị mà backend khớp chuỗi: `build_fragments` / `seedance_segments` đều so khớp `【字幕…】` / `【BGM…】`. Sửa giá trị này là hỏng chức năng dựng video, không chỉ hỏng ngoại hình |

**Ranh giới đã giữ:** ở chế độ soạn (`editing === true`) `mapText` phải là `undefined`, vì
DOM được serialize ngược thành `content` rồi gửi lên backend. Dịch rồi bấm "Lưu" là hỏng
luôn bài kiểm tra định dạng. Đây là lý do `EpisodeEditPromptEditor.tsx:88` dùng
`asDisplay = !editing` chứ không dịch thẳng — và tôi **không** đụng vào.

---

## 5. Số đo audit — TRƯỚC

Lệnh (lệch một chút so với brief, xem §8):

```
$env:VITE_API_BASE="http://127.0.0.1:8000"
$env:AUDIT_BASE="http://127.0.0.1:5183"     # dev server của chính bunny/2
$env:AUDIT_API="http://127.0.0.1:8000"
$env:AUDIT_VERBOSE="1"
node scripts\visual-audit.mjs
```

**Lần 1:**

```
vi: 25 route · 163 ky tu Trung · 23 route van van
en: 25 route · 161 ky tu Trung · 23 route van van
   /drama/projects/16/episodes        cjk=67
   /drama/projects/16/episodes/3      cjk=67
```

**Trùng khớp đúng** con số brief ghi (`163` / `161`), nên phép đo của tôi và của brief là
cùng một phép đo trên cùng một trạng thái dữ liệu.

Ngoài hai route trên, 23 route còn lại **đều đúng 1 ký tự** (chữ `中` trên nút chuyển ngôn
ngữ — hành vi đúng). Hai ngoại lệ nhỏ, không liên quan lane này và **đã có từ trước**:
`/settings` = 4 (vi) / 2 (en), `/history` = 6 (cả hai).

Ảnh chụp: `frontend/.kilo/audit/before/vi-drama-tap-chi-tiet.png` và
`…/en-drama-tap-chi-tiet.png`.

---

## 6. Ảnh trước — nhìn tận mắt, và phát hiện phụ

`frontend/.kilo/audit/before/vi-drama-tap-chi-tiet.png`:

- Khung soạn kịch bản giữa trang **bị thanh storyboard dưới cùng đè lên** ở khung nhìn của
  audit. Tiếng Trung **có trong `innerText`** (bộ đếm đo được, con số 67 là thật) nhưng phần
  bị che không đọc được bằng mắt trong ảnh.
- Đây là **vấn đề bố cục riêng**, không phải vấn đề dịch: `EpisodeEditPage.tsx:1571-1576`
  có ghi chú đúng việc này cho `.drama-ep-editor-box`. Tôi **không sửa** vì nó là việc CSS và
  ngoài phạm vi brief. Ghi ra để board giao.

---

## 7. Việc tôi định làm tiếp

1. **Sửa nhánh `postMix` đang là code chết** trong `dramaScriptLabels.ts`: bỏ đuôi cố định
   `，音量低于人声` (do `build_production_cues` chèn) trước khi tra bảng, và chấp nhận mood
   đã có sẵn đuôi. Đây là **nối dây**, không phải thêm từ vựng — nó làm nhánh có thể chạy
   được với nhóm B (6 mục đã có nhãn sẵn trong bảng). Không thêm mục mới, không bịa nhãn.
2. Chạy `npm run build` + `npm run lint`, kiểm không vượt baseline 0 error / 40 warning.
3. Chạy audit **hai lần**, chỉ nhận khi giống hệt, rồi bổ sung mục "sau" vào báo cáo này.

## 8. Lệch so với brief (nói rõ để không bị tưởng là đo sai)

- **Cổng audit**: brief ghi `AUDIT_BASE=http://localhost:5173`. Đó là dev server của `main`,
  **không phục vụ code của `bunny/2`** — dùng nó thì đo nhầm thứ mình vừa sửa, đúng cảnh báo
  ngay trong `scripts/visual-audit.mjs:86-91`. Tôi dựng dev server riêng cho lane ở **5183**
  (`AGENTS.md` §2 ghi cổng dev của Bunny 2 là 5183) và trỏ audit vào đó.
- **Bằng chứng trước/sau**: vì hai route audit là **cùng một trang**, ảnh "trước" và "sau" của
  `drama-tap` và `drama-tap-chi-tiet` là **cùng một bức** — tôi vẫn giữ cả bốn file để đối
  chiếu, nhưng cần biết chúng không độc lập nhau.

---

# PHẦN II — THÊM MỘT BIẾN THỂ NHÃN BGM (14 ký tự)

**Brief:** `.kilo/briefs/add-missing-bgm-label.md` · **Base:** `666a75a` · **Ngày:** 2026-10-02
**Commit mã nguồn:** `160803f` — `feat(vi): add the missing bgm mood label for 轻快专业 so the
postMix cue localises` · **File:** `frontend/src/lib/dramaScriptLabels.ts` (+21 −2)

## 10. Sửa đúng **một** mục, và vì sao đó **không phải bịa**

Thêm đúng một khoá vào `BGM_MOOD_LABELS`:

| Khoá | zh | en | vi |
|---|---|---|---|
| `轻快专业` | `轻快专业` | `brisk and professional` | `nhanh gọn và chuyên nghiệp` |

**Phần 3 của báo cáo cũ đã kết luận sai ở một chỗ, và tôi đính chính.** Nó viết
`轻快专业` *"không nằm trong bất kỳ danh sách nào ở backend"* nên tôi *"không thêm nhãn"*. Điều
đó chỉ đúng với `BGM_MOOD_KEYWORDS` (`seedance_segments.py:293-299`) và
`_infer_bgm_mood` (`build_fragments.py`) — hai danh sách **suy luận**. `轻快专业` còn nằm ở
bốn chỗ khác trong backend, và những chỗ đó là **giá trị thật của sản phẩm**:

| Chỗ | Vai trò |
|---|---|
| `backend/app/services/pipeline.py:752` | chốt fallback cuối cho `project.bgm_lock` |
| `backend/app/services/templates_seed.py:73,130,297` | `audio_config.bgm_mood` của template đã seed |
| `backend/app/services/templates_seed_huoke.py:123` | như trên, bộ template 获客 |
| `backend/app/services/templates_seed.py:109` | câu lệnh trong prompt: *"bgm 全片统一为轻快专业"* |
| `backend/tests/test_seedance_segments.py` | giá trị fixture cho mọi test cue BGM |

Tức là nó là **mặc định BGM của cả hệ thống**, không phải chuỗi mô hình tự nghĩ ra. Thêm
nhãn cho nó là điền một lỗ hổng thật, không phải bịa từ vựng.

**Tôi đã tự tra lại từng dòng trong bảng trên**, vì chính PHẦN I của tôi là nơi kết luận ngược
lại. Cả năm đều đúng: `pipeline.py:747-753` đúng là chốt fallback cuối
(`user_bgm or plans_result.bgm_lock or tpl_bgm or plans[0].bgm or "轻快专业"`), và
`grep 轻快专业` trong `backend/app/**/*.py` ra **7** kết quả, đúng như bảng liệt kê.

Cơ chế khớp không cần sửa thêm code: `build_production_cues()`
(`seedance_segments.py:400-404`) dán đuôi `，音量低于人声` rồi bọc `后期混音`, và
`localizeScriptCue()` đã bỏ đuôi đó trước khi tra (commit `666a75a`). Nên **cả hai** nhánh
`postMix` và `volume` đều khớp mục này — thêm một khoá là đủ.

## 11. Chuỗi đích lấy từ database bằng **công cụ đọc text**, không giải mã bằng mắt

`frontend/.kilo/probe-episode.mjs` (gitignored) đăng nhập, gọi `GET /api/drama/episodes/3`
rồi ghi `content` thô ra `frontend/.kilo/probe-episode.json` bằng `writeFileSync(..., 'utf8')`.
Đọc file đó bằng công cụ đọc, fragment **id=8**:

```
【字幕：后期叠旁白字幕，简体中文逐句同步】
【BGM：后期混音 · 轻快专业，音量低于人声】
@duration:4
远景：清晨的老街，薄雾未散，@asset:19 静静躺在巷口，@asset:18 站在路口望向深处，手里的伞还在滴水
@duration:6
@asset:18 走近半步，@asset:20 被攥在掌心，低声说：「这张照片，你见过吗？」
```

Khoá cần tra là `轻快专业` — phần giữa sau khi bỏ tiền tố `【BGM：后期混音 · ` và đuôi
`，音量低于人声】`.

**53 ký tự văn xuôi còn lại không được đụng tới.** Tôi không sửa `localizeScriptContent`, không
thêm bảng từ vựng mới, không dịch dòng kịch bản. Số đo ở §13 là bằng chứng: giảm **đúng 14**.

## 12. Build và lint

```
npm run lint   -> 0 error · 40 warning   (đúng baseline, không tăng)
npm run build  -> exit 0 · built in 1.07s · 0 error
```

Không thêm i18n key nào (`zh`/`en`/`vi` của bảng này là `LocalizedText` nên thiếu `zh` sẽ
fail build), và không có cast nào.

## 13. Số đo audit

### Trước / sau

| | `vi` | `en` | `/drama/projects/16/episodes` | `/drama/projects/16/episodes/3` |
|---|---|---|---|---|
| **Trước** (base `55f394c`) | 25 route · **163** | 25 route · **161** | 67 | 67 |
| **Sau** (code = `160803f`, HEAD `18785f8`) | 25 route · **135** | 25 route · **133** | **53** | **53** |

Giảm **28** ký tự = đúng `2 route × 14 ký tự`, tức **đúng cái cue BGM** và **không động vào gì
khác**. Đó là phép đo quyết định: nếu tôi lỡ dịch văn xuôi thì tổng sẽ giảm nhiều hơn 28.

Lệnh (dev server của chính `bunny/2`, không phải `:5173` của `main`):

```
$env:VITE_API_BASE="http://127.0.0.1:8000"
$env:AUDIT_BASE="http://127.0.0.1:5183"
$env:AUDIT_API="http://127.0.0.1:8000"
$env:AUDIT_VERBOSE="1"
node scripts\visual-audit.mjs
```

### Tính lặp lại: **ba lần chạy trọn vẹn, giống hệt nhau**

| Lần | `vi` | `en` | Ghi chú |
|---|---|---|---|
| A | 135 | 133 | trọn 25 route × 2 locale |
| B | 135 | 133 | **giống lần A ở cả 50 dòng route**, `Compare-Object` rỗng |
| C | 135 | 133 | **giống lần B ở cả 50 dòng route**, `Compare-Object` rỗng |

Chỉ nhận con số khi so **từng dòng route** (`^(vi|en)\s+/`), không chỉ so tổng — hai tổng bằng
nhau vẫn có thể che một route đổi theo chiều ngược nhau.

Dữ liệu đo được trong 3 lần đó là `content` **giống hệt** hiện tại; tôi kéo lại
`GET /api/drama/episodes/3` sau khi đo và đối chiếp từng dòng fragment — không có trôi dữ
liệu giữa các lần chạy.

### ⚠️ Một lần chạy đo sai bundle cũ — phải kể ra

Lần chạy **đầu tiên sau khi sửa code** cho ra `163 / 161`, tức **không giảm gì**, dù code đã
đúng. Nguyên nhân: dev server Vite còn phục vụ module đã biên dịch từ trước, nên lần đầu
audit đo **bundle cũ**. Các lần sau mới ra `135 / 133`.

Nếu tôi chỉ chạy một lần rồi báo "không giảm", kết luận đó sai. Và nếu tôi chạy lại rồi báo
"giảm 28" mà không kể lần đầu, thì số liệu trông sạch nhưng che một lần chạy hỏng — đúng
loại sai lệch mà `AGENTS.md` §10 cấm. Ghi ra đây để board biết con số này cần **ít nhất hai
lần chạy sau khi dev server đã nạp lại module**, và nên bỏ lần đầu tiên.

Ảnh: `frontend/.kilo/audit/vi/drama-tap-chi-tiet.png` và `…/en/drama-tap-chi-tiet.png`
(ghi đè lúc chạy sau). Ảnh "trước" giữ ở `frontend/.kilo/audit/before/`.

### Build và lint tại đúng commit đã đo

```
npm run build -> ✓ built in 969ms, 0 error   (tsc -b sạch)
npm run lint  -> 0 error · 40 warning
```

`git diff 160803f 18785f8 -- frontend/src/lib/dramaScriptLabels.ts` → **rỗng**: giữa trạng
thái code đã đo và `HEAD` chỉ khác file báo cáo này.

## 14. Biến thể BGM **khác** mà tôi thấy — báo lại, không tự thêm

Sáu chuỗi trong `seedance_segments.BGM_MOOD_KEYWORDS` (`:293-299`) cộng
`DEFAULT_BGM_MOOD` (`:37`) đều đã có sẵn đuôi `，音量低于人声` và sẽ đi qua `build_production_cues`
thành cue `【BGM：后期混音 · …】`. Sau khi bỏ đuôi thì **không mục nào trùng** với 7 mục đang có
trong bảng:

| Chuỗi (đã bỏ đuôi) | So với bảng hiện có |
|---|---|
| `低沉紧张、鼓点渐强，烘托压迫感` | gần `低沉紧张、鼓点渐强，烘托压迫与危机感` nhưng **khác** |
| `温暖人文、钢琴弦乐铺底` | không có |
| `轻电子氛围，克制不抢戏` | không có |
| `轻快专业、干净电子铺底` | **khác** mục `轻快专业` vừa thêm (có đuôi `、干净电子铺底`) |
| `史诗弦乐铺底，气势克制` | không có |
| `贴合内容的轻量配乐，情绪平稳，不抢旁白` | gần `贴合剧情氛围的轻量配乐，情绪随画面起伏` nhưng **khác** |

Đây là **6 mục**, tức mở rộng bảng — vượt "thêm đúng một biến thể" của brief, nên tôi **không
thêm** và giao lại board. Ghi chú: `低沉紧张、鼓点渐强，烘托压迫感` và
`贴合内容的轻量配乐，情绪平稳，不抢旁白` **gần** nhưng không bằng hai mục đã có, nên bảng phải
giữ cả hai bên; không được gộp làm một.

## 15. Phát hiện ngoài phạm vi — **tiếng Trung mà audit không đo được**

`frontend/src/lib/segmentDuration.ts:27`:

```
export const SEGMENT_SCRIPT_PLACEHOLDER = `${SUBTITLE_CUE}\n【BGM：后期混音 · 轻快专业，音量低于人声】\n@duration:4\n过肩工位操作画面…`
```

Nó được dùng làm `placeholder` của textarea ở `StoryboardPage.tsx:1507`. Attribute
`placeholder` **không nằm trong `innerText`**, mà bộ đếm của `visual-audit.mjs` đo `innerText` —
nên trang nào có placeholder này vẫn báo "sạch" trong khi người dùng thật nhìn thấy tiếng
Trung. Đây là loại lọt mà phép đo hiện tại **về nguyên tắc không bắt được**.

Tôi **không sửa**: nó là chuỗi mẫu để người dùng bắt chước, nằm ngoài phạm vi brief, và sửa nó
cần một quyết định riêng (dịch placeholder thì người dùng copy ra nội dung tiếng Việt rồi gửi
lên backend, cần kiểm xem còn đúng định dạng không).

**Chi phí sửa giờ đã rẻ hơn hẳn sau PHẦN II.** Chuỗi trong placeholder
(`【BGM：后期混音 · 轻快专业，音量低于人声】`) **đã** có nhãn, nên `localizeScriptCue()` sẽ dịch
đúng nó ngay. Nhưng điểm còn lại là chỗ dùng: `placeholder` của textarea ở
`StoryboardPage.tsx:1507` không đi qua lớp nhãn nào cả, và `placeholder` lại **không nằm
trong `innerText`** — nên nếu sửa thì `visual-audit.mjs` **vẫn báo 0** và không có bằng chứng
bằng phép đo. Đó là lý do tôi vẫn không tự làm: sửa xong thì **không chứng minh được** bằng
công cụ hiện có, mà brief đòi bằng chứng.

## 16. Độ tin cậy của phép đo — đã phải thử lại nhiều lần

Máy đang chạy **nhiều audit song song** (tiến trình của lane khác và của board, cùng dùng
worktree `bunny/2`). Hệ quả đo được, không phải lỗi code:

- `visual-audit.mjs` chốt "chỉ một audit chạy một lúc" qua file khoá `frontend/.kilo/audit.lock`.
  Ba lần của tôi bị **từ chối ngay** với `Da co audit khac dang chay (pid …)`.
- Lần chạy được khoá nhưng vẫn chết: một lần `Assertion failed: ncrypto::CSPRNG(nullptr, 0)`
  (node chết ngay lúc khởi động, `EXIT=134`), một lần `Ket noi CDP bi ngat giua chung`
  kèm `da don 0 tien trinh Edge` — tức Edge của lô đó **không nổi lên** vì máy quá tải
  (đã đếm tới **860** tiến trình `msedge.exe` lúc ba audit cùng chạy).
- Một lần bị giết âm thầm (`EXIT=-1`) giữa lô 2, không có dòng lỗi nào.

Lần chạy **hoàn chỉnh đầu tiên** (lúc máy còn rảnh) mất 7,4 phút. Số liệu chỉ được chấp nhận
khi **hai lần cho kết quả giống hệt**, và cả hai lần đều phải là lần chạy trọn vẹn 25 route ×
2 locale — không lấy số từ lượt chạy bị giết.

### Ba lỗi của chính công cụ audit, đo được — không phải lỗi code

Ba điều này làm tốn lượt chạy và **làm sai số** nếu không kiểm. Ghi ra vì `visual-audit.mjs`
là công cụ **dùng chung của mọi lane**, nên đây là nợ của board chứ không phải của lane này.

1. **`node scripts\visual-audit.mjs` in xong tổng kết rồi không bao giờ thoát.** Đo được hai
   lần: sau khi đã in `===== TONG HOP =====`, tiến trình `node` vẫn sống, **CPU đứng yên ở
   ~0,94s** và không tăng trong 30 giây theo dõi liên tục. Vì `process.on('exit')` không
   chạy nên file khoá `frontend/.kilo/audit.lock` **còn nguyên**, và lần chạy kế bị chính công
   cục từ chối với `Da co audit khac dang chay (pid …)`. Muốn chạy tiếp phải **xoá khoá tay**.
2. **Giết tiến trình `node` để gỡ khoá thì rò Edge.** `taskkillTree()` nằm trong `finally`
   của từng lô, nên giết `node` từ ngoài **bỏ qua** nó: đo được **20 tiến trình `msedge.exe`**
   còn sống lọt lại (đều có profile `novafilm-audit-edge-*`). Phải dọn tay, và chỉ dọn đúng
   tiến trình của mình — máy lúc đó còn **12 tiến trình Edge của lane khác**, không được đụng.
3. **Ba lần chết giữa chừng** với `CDP khong tra loi cho "Runtime.evaluate" sau 60s`, ở lô
   `vi` (11/50 route) và lô `en` (37/50 route). Máy quá tải, không phải ứng dụng hỏng — công cụ
   **đã đúng** khi không chấp nhận lấy số từ lượt chạy dở.

**Khuyến nghị cho board:** thêm `process.exit(0)` sau `report(results)` trong `main()`. Đó
là sửa một dòng và nó giải quyết cả vòng lặp "xoá khoá tay" lẫn rò Edge — nhưng
`visual-audit.mjs` dùng chung nên **tôi không tự sửa**.

## 9. Những gì chưa làm được (PHẦN I)

1. **Không đạt mục tiêu 25 ký tự mỗi bên.** Không thể đạt bằng lớp nhãn. 53/67 ký tự là văn
   xuôi kịch bản trong `drama_fragments.content` — dịch nó là dịch nội dung người dùng.
   Tôi **không** làm và **không** tính là đã dịch.
2. ~~**14 ký tự nhãn BGM** cũng chưa hết~~ — **ĐÃ XỬ LÝ Ở PHẦN II.** Lý do bỏ qua ở phần này
   (coi `轻快专业` là chuỗi mô hình tự viết) **sai** — xem §10.
3. **Chưa thêm nhãn cho nhóm A** (`BGM_MOOD_KEYWORDS`) vì đó là 6 mục mới, tức **mở rộng bảng
   nhãn**, vượt quá "chỉ nối dây" — chờ board quyết. Vẫn còn nguyên ở PHẦN II §14.
4. **Chưa sửa lỗi bố cục** đè khung soạn ở §6 (việc CSS, ngoài phạm vi).
5. **Chưa có số đo "sau" ở PHẦN I** — PHẦN II đã chốt ở §13: `135 / 133`, giảm đúng 28.

## 17. Những gì chưa làm được (PHẦN II)

1. **Số đo audit "sau" đã chốt ở §13** — ba lần chạy trọn vẹn, `135 / 133`, giống hệt ở từng
   dòng route. Mục tiêu của brief là `25 / 25`: **không đạt**, và **không thể đạt** bằng lớp
   nhãn — 53 ký tự còn lại là văn xuôi kịch bản trong database (xem §9.1 của PHẦN I).
2. **6 biến thể BGM của nhóm A chưa có nhãn** — §14, giao board.
3. **Chưa xử lý `SEGMENT_SCRIPT_PLACEHOLDER`** — §15, tiếng Trung mà bộ đếm `innerText` không
   bắt được. Cần quyết định riêng, không tự ý sửa.
4. **Chưa sửa lỗi bố cục** đè khung soạn kịch bản (§6 của phần I) — việc CSS, ngoài phạm vi.
5. **53 ký tự văn xuôi kịch bản vẫn còn nguyên** — đúng yêu cầu, không tính là lỗi giao diện.