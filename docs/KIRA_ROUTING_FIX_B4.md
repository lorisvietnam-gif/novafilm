# Sửa định tuyến model ảnh — báo cáo bunny/4

Brief: `docs/briefs/case-kira-routing-b4.md` · Lane: `bunny/4` · Ngày: 2026-10-02

## 1. Kết luận một dòng

Định tuyến ảnh đã đúng: `hy-image-v3.5-free` ra Kira, `seedream-5-0-pro` **vẫn** ra TokenFree,
không sửa router, không thêm ưu tiên theo tên model, cơ chế fallback giữ nguyên.
`pytest`: `4 failed, 964 passed, 1 skipped` — chạy hai lần liên tiếp, kết quả giống hệt.

**Nhưng** còn một lỗi khác chặn cuối đường, **ngoài phạm vi brief**: Kira trả ảnh về dạng
base64, còn code coi `b64_json` là URL. Mục 5.

---

## 2. Chẩn đoán của brief đúng ở kết luận, sai ở cơ chế

Brief nói channel `image-kira` "không có row trong bảng `system_model_channels`".
Đo thật thì **có row** — nhưng `enabled = False`:

```
== bảng system_model_channels (trước khi sửa) ==
  image-kira       enabled=False sort=-2 base=https://kiraai.vn/api/v1 có_khoá=True models=['hy-image-v3.5-free']
  text-openai      enabled=False sort=-1 base=https://generativelanguage.googleapis.com/v1beta/openai có_khoá=True models=['gemini-3.5-flash']
  tokenfree        enabled=True  sort=0  base=https://www.tokenfree.com/v1 có_khoá=True models=['doubao-seedream-5-0-260128', 'seedance-2-5', 'qwen-tts-2025-05-22']
```

Sai ở chỗ đó cũng là lý do `PATCH /api/admin/settings/routing` **không** phải đường để thêm
channel: nó đọc channel từ DB row nên thấy Kira, nhưng dòng đó đã tắt nên không sinh logical
model nào; đồng thời `patch_admin_routing_settings` lại tắt mọi dòng không phải TokenFree
(`model_settings.py:844`), tức là đường đó **tự tắt chính channel vừa thêm**.

Kết quả đo được trước khi sửa, đúng triệu chứng 401 của brief:

```
resolve(hy-image-v3.5-free) -> [('tokenfree', 'doubao-seedream-5-0-260128')]
```

**Ai tắt?** `_ensure_tokenfree_channel` (`model_settings.py:571` trước khi sửa):

```python
for row in existing:
    if row.id != TOKENFREE_CHANNEL_ID:
        row.enabled = False
```

Vòng lặp này viết ra từ thời TokenFree là nguồn duy nhất. Nó chạy ở **mọi** lần nạp, nên:
dòng Kira được `_ensure_env_channels` tạo ra ở lượt nạp đầu, rồi bị tắt ngay ở lượt nạp kế
tiếp. `_ensure_env_channels` chỉ tạo dòng khi **thiếu**, không bao giờ bật lại ⇒ tắt vĩnh viễn.
`synchronize_logical_models_with_channels` bỏ qua channel `enabled=False`, nên
`hy-image-v3.5-free` không có logical model ⇒ request rơi xuống logical model mặc định của
cùng capability (Seedream, TokenFree) ⇒ TokenFree trả 401 vì không phục vụ model đó.

Cùng lỗi đó giết luôn `text-openai` (nhà cung cấp văn bản), chỉ là không ai báo nên chưa ai thấy.

## 3. Sửa gì

Một tệp: `backend/app/services/model_settings.py` (+49 / −2). Không đụng router, không đụng
schema, không đụng DB bằng tay.

1. `model_settings.py:571` — khoá TokenFree chỉ tắt **dòng lạ**; dòng của nhà cung cấp mà
   `.env` đang khai thì không đụng. Danh sách id lấy từ chính `_bootstrap_channels_from_env()`
   (`:523`) nên không có "danh sách cấu hình thứ hai" để lệch nhau.
2. `model_settings.py:442` `_heal_env_channel_row()` — dòng đã có mà bị tắt thì **bật lại**,
   kèm điền `base_url` khi trống và `api_key_ciphertext` khi dòng chưa có khoá. Không đụng
   `models` / `sort_order` / `advanced_config` / `base_url` đã có — đó là điều kiện để
   `PATCH /api/admin/settings/models` không bị đọc lại thành giá trị cũ (đúng bài học đã ghi
   trong docstring của hàm).
3. `model_settings.py:470` — `_ensure_env_channels` gọi hồi phục, và chỉ `commit` khi thật sự
   có thay đổi (nạp cấu hình vốn là việc đọc).

Bước 2 của brief (thêm logical model thủ công) **không cần**: logical model
`hy-image-v3.5-free` (capability `image`, binding `image-kira` → `hy-image-v3.5-free`) do
`synchronize_logical_models_with_channels` tự sinh ra, vì giờ channel đã bật.

## 4. Bằng chứng

### 4.1 Định tuyến, đo trên DB thật (127.0.0.1:5432/printfilm)

`python scripts/diag_kira_routing.py` — 3 lượt nạp liên tiếp trong một tiến trình:

| mốc | `resolve("image", "hy-image-v3.5-free")` | `resolve("image", "seedream-5-0-pro")` | default image |
|---|---|---|---|
| trước khi sửa | `('tokenfree', 'doubao-seedream-5-0-260128')` | `('tokenfree', 'doubao-seedream-5-0-260128')` | `doubao-seedream-5-0-260128` |
| sau khi sửa, lượt 1 | `('image-kira', 'hy-image-v3.5-free')` | `('tokenfree', 'doubao-seedream-5-0-260128')` | `doubao-seedream-5-0-260128` |
| sau khi sửa, lượt 3 | `('image-kira', 'hy-image-v3.5-free')` | `('tokenfree', 'doubao-seedream-5-0-260128')` | `doubao-seedream-5-0-260128` |

Hàng trong DB sau 3 lượt nạp: `image-kira enabled=True`, `text-openai enabled=True`,
`tokenfree enabled=True`. Ổn định, không dao động.

`gpt-image-2` vẫn rơi về Seedream của TokenFree — đúng như trước khi sửa, vì channel
TokenFree không khai model đó. Không nằm trong phạm vi brief, không đổi.

### 4.2 Gọi thật, qua đúng đường API dùng

`python scripts/verify_kira_image_live.py` (gọi `ArkGateway.gen_image`, không giả lập):

```
model yêu cầu   : hy-image-v3.5-free
logical id      : hy-image-v3.5-free
channel         : image-kira
upstream model  : hy-image-v3.5-free
base url        : https://kiraai.vn/api/v1
có khoá         : True
url sẽ gọi      : https://kiraai.vn/api/v1/images/generations
```

Đúng model, đúng URL, đúng khoá. Trước khi sửa, dòng này in ra `channel: tokenfree` /
`upstream: doubao-seedream-5-0-260128` — tức là 401 đã được chứng minh là do định tuyến.

### 4.3 Test

`backend/tests/test_kira_image_channel_routing.py` — 4 case, chạy trên DB test
(`printfilm_test`, rollback từng case), `.env` giả nên không phụ thuộc máy:

| test | chặn cái gì |
|---|---|
| `test_kira_image_model_routes_to_kira_not_tokenfree` | đúng lỗi gốc: HY ra Kira **và** Seedream vẫn ra TokenFree |
| `test_env_channel_row_is_healed_but_stale_row_still_disabled` | dòng của `.env` bật lại, dòng lạ vẫn bị tắt, không ghi đè cột đã có |
| `test_hy_image_does_not_become_the_default_image_model` | Seedream giữ mặc định |
| `test_admin_routing_patch_does_not_switch_kira_off` | ngoặc nguy hiểm: lưu routing không tắt Kira |

Đã kiểm chứng chúng **thật sự bắt lỗi**: chạy lại 3 case đầu trên code gốc
(`git checkout HEAD -- app/services/model_settings.py`) thì hỏng đúng chỗ:

```
assert _routes("image", HY) == [(KIRA_ID, HY)]
E   AssertionError: assert [('tokenfree'...-5-0-260128')] == [('image-kira...e-v3.5-free')]
E   assert enabled[KIRA_ID] is True
E   assert False is True
3 failed, 1 passed
```

### 4.4 `pytest` — hai lần liên tiếp, giống hệt

| lượt | kết quả |
|---|---|
| nền (trước khi sửa) | `4 failed, 960 passed, 1 skipped` |
| sau khi sửa, lượt 1 | `4 failed, 964 passed, 1 skipped` |
| sau khi sửa, lượt 2 | `4 failed, 964 passed, 1 skipped` |

4 lỗi failed là bộ có sẵn từ upstream, đúng danh sách AGENTS.md ghi, không đổi:
`test_fragment_video_estimate_720p_doubles_480p`,
`test_kepu_phase_billing::test_videos_estimate_hd_doubles_480p_preview`,
`test_kepu_phase_billing::test_shot_regen_video_estimate_uses_project_hd`,
`test_kepu_shot_edit_demote::test_narration_edit_invalidates_continuous_audio`.

+4 passed là 4 test mới. `test_tool_image_1k_uses_six_credits` vẫn xanh — Seedream không bị
kéo đi. Lệnh: `.venv\Scripts\python.exe -m pytest -q --basetemp=..\.kilo\pytest-b4-after`.

## 5. Còn lỗi nào (NGOÀI phạm vi brief — xin board giao việc)

### 5.1 Kira trả base64, code coi là URL — chặn đường cuối

Đo thật, gọi thẳng Kira qua đường đã resolve ở mục 4.2:

```
HTTP status   : 200
top-level keys: ['created', 'data', 'description', 'model']
item keys     : ['b64_json', 'mime_type']
url           : 0 ký tự
b64_json      : 3,694,816 ký tự -> 2,771,111 byte
```

`response_format: "url"` trong body bị Kira bỏ qua. Chuỗi:

- `ark.py:1141` — `_extract_image_url` trả `item.get("url") or item.get("b64_json")`, tức trả
  **chuỗi base64** ra vị trí URL.
- `ark.py:1008` — `storage.download_to(remote, dest)` đem chuỗi đó đi GET.
- `storage.py:112` — `httpx` ném `InvalidURL: URL too long`.

Hệ quả: ảnh **đã sinh ra và đã trừ tiền**, nhưng task fail. Đây là lỗi thứ hai, độc lập với
lỗi định tuyến, và không nằm trong danh sách việc của brief nên tôi không tự sửa. Sửa thì
`ark.py:995-1008` phải nhận cả hai dạng: `remote` bắt đầu bằng `http` thì tải như cũ, còn lại
decode base64 rồi ghi thẳng ra `dest` (dựng sẵn `dest` ở `:1003`). `mime_type` cho biết
phần mở đầu file nên kiểm tra magic bytes thay vì tin tên.

### 5.2 Danh sách preset của TokenFree có lẫn model của Kira

`all_preset_channel_models()` (`media_model_presets.py:178`) gộp **mọi** preset vào channel
TokenFree, kể cả `hy-image-v3.5-free` — model thuộc Kira. Nên sau khi ai đó lưu routing
(`PATCH .../routing` có `system_channels`), logical model HY có **hai** binding: Kira
(priority 1) và TokenFree (priority 3). Ưu tiên vẫn đúng là Kira, nhưng nếu Kira chết thì
failover sang TokenFree — nơi không có model đó — và lại 401.

Đo được: `resolve("image", "hy-image-v3.5-free")` → `[('image-kira', ...), ('tokenfree', ...)]`
sau khi lưu routing. DB dev hiện tại chưa bị vậy (channel TokenFree chỉ có 3 model), nên đường
đi thường không bị đụng. **Không sửa**: cắt model của Kira khỏi hàm này là đụng hợp đồng của
`patch_admin_routing_settings` và của test giá. Cần board quyết.

### 5.3 `kira_api_key` không nằm trong `model_config_field_names()`

`schemas_settings.py:276` không liệt kê `kira_api_key` / `kira_base_url`, nên khoá Kira
chỉ đọc được từ `.env` — admin UI không sửa được, cũng không xoá được. Kênh thật trong DB vẫn
giữ khoá đã mã hoá nên request vẫn chạy, nhưng người vận hành sẽ tưởng mình đang sửa được.
Ghi ra đây để board chọn: thêm vào danh sách field quản lý, hay cố ý giữ `.env` làm nguồn
duy nhất (thì nên nói rõ trong `docs/OPERATIONS.md`).

## 6. File đã đụng

| file | việc |
|---|---|
| `backend/app/services/model_settings.py` | sửa: +49 / −2 |
| `backend/tests/test_kira_image_channel_routing.py` | mới, 4 test |
| `backend/scripts/diag_kira_routing.py` | mới, đo định tuyến nhiều lượt nạp |
| `backend/scripts/verify_kira_image_live.py` | mới, gọi thật qua `gen_image` |
| `docs/KIRA_ROUTING_FIX_B4.md` | file này |

Không sửa `logical_model_router.py`, `model_routing_config.py`, `ark.py`, `storage.py`.
Không `UPDATE` tay `app_settings.config_json`. Không push.

## 7. Lưu ý cho người đọc

- Script `diag_kira_routing.py` và `verify_kira_image_live.py` **ghi vào DB dev** (hồi phục
  channel, commit). Chạy `verify_kira_image_live.py` là **một lần gọi thật có tiền** (HY Image
  tính 10 fen/lượt).
- Không khởi động backend thứ hai trên `:8000`: `main.py:140` bật scheduler + poller vô điều
  kiện, hai tiến trình sẽ tranh task trên cùng DB. Kiểm chứng vì vậy chạy trong tiến trình
  script, không qua HTTP.
