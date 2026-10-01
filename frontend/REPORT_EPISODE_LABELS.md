# REPORT — Nối lớp nhãn hiển thị vào trang xem tập (67 ký tự Trung)

**Lane:** `bunny/2` · **Path:** `D:\novafilm-lanes\bunny-2` · **Ngày:** 2026-10-02
**Brief:** `.kilo/briefs/wire-episode-labels.md` · **Base:** `55f394c` (đã đồng bộ `main`)

> **Trạng thái báo cáo:** bản nháp đầu tiên, commit **trước** khi sửa code — theo yêu cầu
> "write and COMMIT the report file first" và `AGENTS.md` §11 (tiến trình chết là mất sạch).
> Số đo "sau" sẽ bổ sung ở commit tiếp theo.

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
| 1 | `【BGM：后期混音 · 轻快专业，音量低于人声】` | `drama_fragments.content`, fragment id=8 | **chưa có nhãn** |

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
`build_production_cues` bọc lại. `轻快专业` là do mô hình viết, không nằm trong bất kỳ
danh sách nào ở backend (`BGM_MOOD_KEYWORDS` ở `seedance_segments.py:293-299` và
`_infer_bgm_mood` ở `build_fragments.py:575-585` đều không có nó).

**Vì vậy tôi không thêm nhãn cho `轻快专业，音量低于人声`.** Thêm nhãn cho một chuỗi do mô hình
tự viết là bịa từ vựng, và lần sau mô hình viết chuỗi khác thì lại hỏng — đúng cái bẫy mà
brief cấm.

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

## 9. Những gì chưa làm được

1. **Không đạt mục tiêu 25 ký tự mỗi bên.** Không thể đạt bằng lớp nhãn. 53/67 ký tự là văn
   xuôi kịch bản trong `drama_fragments.content` — dịch nó là dịch nội dung người dùng.
   Tôi **không** làm và **không** tính là đã dịch.
2. **14 ký tự nhãn BGM** cũng chưa hết, vì `轻快专业，音量低于人声` là chuỗi mô hình tự viết —
   báo ở §3, không bịa.
3. **Chưa thêm nhãn cho nhóm A** (`BGM_MOOD_KEYWORDS`) vì đó là 6 mục mới, tức **mở rộng bảng
   nhãn**, vượt quá "chỉ nối dây" — chờ board quyết.
4. **Chưa sửa lỗi bố cục** đè khung soạn ở §6 (việc CSS, ngoài phạm vi).
5. **Chưa có số đo "sau"** — bổ sung ở commit tiếp theo.