# REPORT — 参考图（frontend: Canvas → Studio 发送侧）

**Lane:** `bunny/1` · **Path:** `D:\novafilm-lanes\bunny-1` · **Ngày:** 2026-10-02
**Brief:** `.kilo/briefs/rescue-branch-sync.md`

---

## 1. Commit và đường dẫn file báo cáo

File báo cáo này: **`frontend/REPORT_REFERENCE_IMAGES.md`** (chính nó).

| Commit | Nội dung |
|---|---|
| `bb24c73` | **Merge `origin/main` vào `bunny/1`** — cứu nhánh lệch |
| `50beccc` | `api.ts` — `generate()` gửi `subject_ref_urls` / `style_ref_urls` |

---

## 2. Merge `main`: xung đột nào, quyết định thế nào

### Kết quả: **merge sạch, KHÔNG có conflict nào**

Chạy `git merge origin/main --no-commit`. Git báo *"Automatic merge went well; stopped before
committing as requested"* — không hunk nào phải chọn tay. Đây là điểm brief cần kiểm tra
cẩn thận nhất, nên tôi **không tin thông báo đó** và đã đối chiếu lại từng file.

### Bằng chứng merge không nuốt mất việc của ai

Trước merge: `git diff --stat main..bunny/1` = **84 file, +632 / −9122** (nhánh bắt đầu từ
`main` cũ). Sau merge:

- **82 file** thay đổi, tất cả là `A` (thêm mới) hoặc `M` (sửa) **lấy từ `main`**.
- **0 file nào có trạng thái `D` (deleted)** — đây là phép đo quyết định. Nếu merge nuốt mất
  việc của lane khác thì sẽ xuất hiện `D` hoặc nội dung bị ghi đè; con số 0 là bằng chứng
  cơ học, không phải cảm nhận.
- **15/15 file** mà brief liệt kê là sẽ bị xoá đều **đã có mặt trên đĩa** sau merge, đúng
  số dòng board ghi: `project_reference_images.py` (132), `test_project_reference_images.py`
  (549), `dummy_gateway.py` (703), `perf-audit.mjs` (731), `dramaScriptLabels.ts` (341),
  `DramaPromptBundleModal.tsx` (430), `BetaNotice.tsx`/`.css` (193/215), `clipboardCopy.ts`
  (91), `oauthCallback.ts` (96), `coverArt.ts` (56), `projectTitleLabels.ts` (68),
  `dramaAiReadiness.ts` (158), `dramaImageStylePreviews.ts` (39), `test_asset_upload_local.py`
  (420).

### Phần của tôi còn nguyên

| File | Trạng thái |
|---|---|
| `frontend/src/lib/referenceImages.ts` (136 dòng, mới hoàn toàn) | còn |
| `CanvasStore.tsx` — chặn trần 9 ảnh trước khi gọi API | còn |
| `CanvasNodeGeneratePanel.tsx` | còn |

### Nguyên nhân gốc

Nhánh tôi bắt đầu từ một `main` cũ và làm việc không đồng bộ. Đúng như brief mô tả.

---

## 3. Tên trường backend — đọc ra từ đâu, không đoán

Backend đã merge sẵn hợp đồng. Tôi đọc ba nguồn, tên trường lấy từ nguồn thứ nhất:

| Nguồn | Nội dung đọc được |
|---|---|
| **`backend/app/schemas.py:222`** | `class ProjectGenerateIn(BaseModel)` → `restart: bool = False`, **`subject_ref_urls: list[str]`**, **`style_ref_urls: list[str]`**, cả hai `max_length=20` |
| `backend/app/api/projects.py:702-717` | `@router.post("/projects/{project_id}/generate")`, `body: ProjectGenerateIn \| None = None` — body **tùy chọn** |
| `backend/app/services/project_reference_images.py` | `ReferenceImageError`, `reference_image_budget`, `ensure_reference_image_mode`, `resolve_project_reference_images`, `merge_video_extra_refs` |

**Tên tôi dùng: `subject_ref_urls` và `style_ref_urls`.** Khớp chính xác, cùng kiểu `list[str]`.
Tôi đã đoán trúng từ trước merge, nhưng đã **đối chiếu lại sau merge** — đoán trúng không
phải bằng chứng, và brief yêu cầu đọc chứ không đoán.

### Nơi tiêu thụ thật sự của hợp đồng này

Đây là phát hiện quan trọng nhất của lane, và nó **không nằm ở Canvas**.

`api.generate()` chỉ có **hai** nơi gọi (`grep` toàn repo):

- `frontend/src/pages/studio/StyleConfigPage.tsx:214` — `api.generate(project.id)`
- `frontend/src/pages/studio/StoryboardPage.tsx:344,376` — `api.generate(...)`

Còn Canvas thì đi đường **khác hoàn toàn**: `CanvasStore.tsx:729` gọi
`enqueueDramaVideoGen(...)` → `frontend/src/lib/dramaVideoGenQueue.ts` → hàng đợi task của
drama, **không** đi qua `/api/projects/{id}/generate`.

Hệ quả trung thực: **chốt chặn trần 9 ảnh mà tôi đặt trên Canvas hiện không bảo vệ được
đường nào**, vì đường Canvas không bao giờ gửi ảnh tham chiếu tới Seedance qua hợp đồng
này. Tôi giữ nguyên chốt chặn đó (nó vẫn đúng, và nó là chốt chặn duy nhất chặn sớm bên
client), nhưng tôi **không** tuyên bố nó đang nối được Canvas với Seedance. Nói thẳng hơn
thì Canvas có `referenceAssetIds` (`CanvasStore.tsx:741`) nhưng đó là **ID tài nguyên nội
bộ**, không phải `list[str]` URL công khai mà `ProjectGenerateIn` yêu cầu.

### Phần backend đã bàn giao cho lane này

`backend/REPORT_REFERENCE_IMAGES.md` §7.1 ghi rõ: *"`frontend/src/api.ts:563` vẫn chỉ gửi
`?restart=true`. `generate(id, { restart, subject_ref_urls, style_ref_urls })` chưa tồn
tại, nên **chưa có đường nào trong sản phẩm đưa ảnh vào được**."* — đó chính xác là hạng mục
tôi giao ở commit `50beccc`.

---

## 4. Bốn chốt chặn đã giữ nguyên

| Chốt chặn | Trạng thái | Bằng chứng |
|---|---|---|
| **Khử trùng URL trước khi gửi** | giữ | `referenceImages.ts:112-116` — `seen` là `Set<string>`, trùng thì đếm vào `duplicates`, **không** push. Đường dẫn tương đối được nối tuyệt đối bằng `resolveDramaMediaUrl` *trước khi* so trùng, vì cùng một ảnh mà một node giữ `/static/...` và node kia giữ URL tuyệt đối thì phải tính là một. |
| **Không trộn `first_frame` với `reference_image`** | giữ, **không cần làm gì thêm ở frontend** | Chốt chặn này nằm hoàn toàn phía backend: `ensure_reference_image_mode(ratio, has_reference=...)` chặn lúc không có tỉ lệ đích (khi đó Ark lùi về mode 静帧 đầu), và test `test_first_frame_never_mixed_with_reference_image` kiểm ở **tầng wire** rằng `ratio=None` + có reference thì body **không được chứa** `first_frame`. Frontend chỉ gửi hai list URL; nó **không** có đường nào để trộn. Tôi không sửa gì ở đây và cũng **không** cần. |
| **Không ảnh thì hành vi y hệt hiện tại** | giữ | `api.ts`: `hasRefs` false ⇒ `body: undefined`. Request ra y hệt trước — `POST …/generate?restart=true`, không thân. Backend khai báo `body: ProjectGenerateIn \| None = None` và có test `test_generate_without_body_still_accepts_query_restart` giữ tương thích ngược, nên client cũ vẫn chạy. Gửi body rỗng cũng chạy được nhưng là rác, nên tôi **không** gửi. |
| **Vượt trần thì chặn và báo, không cắt bớt** | giữ | `referenceImages.ts:128` — `overLimit: total > MAX_REFERENCE_IMAGES` (so sánh **thẳng**, không dùng hàm cắt). `requireWithinReferenceImageLimit` **ném** `ReferenceImageLimitError` chứ không cắt. Chặn ở `CanvasStore.tsx:706`, **trước** `pushSnapshot()` (dòng 707), nên lần bấm bị chặn không đẩy thêm một bước vào lịch sử undo. |

### Lỗi thật đã tránh lặp lại

Backend lane đã mắc lỗi `cap_url_list()` **break ở `limit`** nên vế `len(unique) > MAX` là code
chết: 10 ảnh vào **không bao giờ** ném lỗi, bị cắt còn 9 im lặng (`REPORT_REFERENCE_IMAGES.md`
§4, commit `8a9feda`). Phía frontend tôi **không** lặp lại: `collectCanvasReferenceImages` đếm
`subjectRefUrls.length + styleRefUrls.length` **sau khi** đã khử trùng và **trước** bất kỳ
mức cắt nào, rồi so sánh thẳng với 9. Không có đường cắt nào trong hàm này.

---

## 5. Cổng an toàn

```
cd frontend
npm run build    → ✓ built in 952ms, 0 error
```

`tsc -b` sạch. Không `as any`, không `as unknown as Messages` — kiểm tra kiểu thật.

Chưa chạy `npm run lint` cùng đợt; xem §6.

---

## 6. GIỚI HẠN — nói thẳng

1. **Tôi CHƯA chạy `npm run lint`.** `npm run build` xanh nhưng build xanh **không** thay
   lint. Theo `AGENTS.md` §7 ("Build xanh không có nghĩa là trang chạy được") tôi cũng **chưa
   mở app ở localhost** để nhìn tận mắt. Sửa của tôi ở `api.ts` thuần tuý về giao diện dữ
   liệu của `request()`, không đổi render, nên rủi ro trắng trang rất thấp — nhưng **tôi chưa
   kiểm chứng bằng mắt và không tính là đã kiểm chứng**.

2. **Tôi không có ảnh chụp màn hình chặn khi vượt 9 ảnh.** Brief yêu cầu mục này ở 1440 và
   390, và tôi **không làm được**: tôi cần 10 node `character`/`scene` **có ảnh** trên Canvas
   để chạm trần. Đường đó chỉ dựng được khi có project thật trong database local, và tôi
   không có dữ liệu đó cũng không tự tạo được trong phạm vi lane. **Đây là hạng mục chưa
   hoàn thành, không phải hạng mục đã làm mà thiếu ảnh.**

3. **Chốt chặn trần 9 hiện chưa nối được vào đường gửi ảnh thật.** Vì Canvas đi đường
   `enqueueDramaVideoGen`, còn `ProjectGenerateIn` chỉ được `StyleConfigPage` và
   `StoryboardPage` gọi — mà hai trang đó **không có ô chọn ảnh tham chiếu nào cả**. Tôi đã
   thêm phương án vào `api.generate()`, nhưng **chưa trang nào truyền ảnh vào**. Backend đã
   sẵn sàng, phía gọi đã sẵn sàng, nhưng **giữa hai đầu còn thiếu UI chọn ảnh**.

4. **Tôi không tự thêm ô chọn ảnh, và đó là chủ ý.** Brief mục 3 nói rõ "không thêm ô tải
   ảnh mới"; `AGENTS.md` §5 nói phần ngoài phạm vi lane thì báo board chứ tự mở rộng. Thêm ô
   upload vào `StyleConfigPage` là thay đổi UI sản phẩm, **không** phải nối dây. Tôi giao
   board ở §7.1.

5. **Không chứng minh được với Seedance thật.** Không có khoá API thật. Các test của backend
   bắt đúng **thân request**, nhưng không biết Seedance có thật sự tôn trọng `role`, có thật
   sự dùng ảnh để giữ nhất quán nhân vật không. Trần 9 lấy từ
   `media_ref_limits.MAX_REFERENCE_IMAGES` — **giả định của codebase**, không phải con số
   đo từ upstream. Phía frontend tôi kế thừa đúng giả định đó; tôi không hề kiểm chứng nó.

6. **Reference URL phải là http(s) công khai.** `referenceImages.ts:108` lọc `/^https?:\/\//i`
   và đếm phần lọc rơi vào `unusable`. Backend cũng từ chối `localhost` / `data:` / path tương
   đối. Nghĩa là **trên localhost, Canvas sẽ không gửi được ảnh nào** và mọi ảnh rơi vào
   `unusable`. Đây là hành vi đúng, nhưng có nghĩa luồng chỉ chạy được khi đã bật object
   storage — đúng với kiến trúc R2 đã chốt ở `AGENTS.md` §9, và cũng là lý do tôi **không thể**
   chứng minh luồng chạy được ở localhost trong giai đoạn hiện tại.

---

## 7. Việc còn lại (đề nghị board giao, tôi không tự mở rộng)

### 7.1 Cần quyết định sản phẩm: Canvas hay Studio?

Đây là câu hỏi chặn, và nó **không phải câu hỏi kỹ thuật**. Hiện có hai đường không giao nhau:

- **Studio** (`StyleConfigPage` → `ProjectGenerateIn`): hợp đồng đã thông từ đầu→cuối, phía
  gọi đã xong. Thiếu **UI chọn ảnh**. Ảnh ở đây là reference cấp **cả dự án**.
- **Canvas** (`enqueueDramaVideoGen`): có sẵn ảnh trên node, có `referenceAssetIds`, nhưng
  **không** đi qua hợp đồng này. Nối vào đây là việc backend khác, không phải frontend.

Hai đường này cho kết quả khác nhau về mặt người dùng và tôi **không tự quyết**. Đề nghị
board chọn một, rồi giao đúng lane.

### 7.2 Nợ phía frontend (nếu board chọn Studio)

- Thêm ô chọn ảnh ở `StyleConfigPage`, chờ upload xong mới gửi URL công khai (gửi
  `/static/...` sẽ bị 400 ngay — đã có test backend chứng minh).
- `StoryboardPage.tsx:376` (`restart`) cũng nên mang ảnh, không chỉ lần generate đầu.
- Cân nhắc lưu ảnh đã chọn vào DB. Hiện reference URL **chỉ sống trong `TaskRun.payload`**
  (backend report §7.2): bấm "tạo" một lần thì có, bấm lại hoặc 单镜重绘 thì mất. Với
  reference để giữ nhất quán nhân vật thì mất sau một lần bấm lại là hỏng thật.

### 7.3 Nợ phía backend (báo board, không tự sửa)

Đã có trong `backend/REPORT_REFERENCE_IMAGES.md` §7.2, tôi không lặp lại. Chỉ bổ sung một
điểm liên quan trực tiếp tới lane này: **`tokenfree_video.wrap_seedance_payload_for_newapi`
vẫn cắt cụt ở 9 张** (`tokenfree_video.py:120`). Đường Canvas đi qua đúng chỗ đó. Nghĩa là
nếu board nối Canvas vào Seedance, chỗ này **vẫn cắt âm thầm** — cần xử trước khi mở đường
đó, nếu không thì chốt chặn "không cắt bớt" của tôi ở frontend chỉ là trên giấy.