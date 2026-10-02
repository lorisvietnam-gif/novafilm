# BRIEF — bunny/4 — Sửa định tuyến model ảnh (đã đo, có bằng chứng)

## 0. ĐỌC TRƯỚC: chẩn đoán cũ SAI. Đừng làm theo.

Board từng đề xuất: "nếu request sinh ảnh thì ưu tiên channel có `hy-image-v3.5-free`",
và "không tìm thấy thì throw Exception". **Cả hai đều gây hại. Không làm.**

Lý do:
1. Ưu tiên channel Kira cho *mọi* request ảnh sẽ kéo Seedream và GPT Image sang Kira →
   phá model đang chạy.
2. Bỏ fallback sẽ phá `test_tool_image_1k_uses_six_credits` và mọi model hợp lệ chưa
   được khai báo. Fallback là hành vi có chủ đích, không phải bug.

## 1. Chẩn đoán ĐÚNG (đã tự chạy, không đoán)

Frontend **không** gửi sai tên model. Bằng chứng: board gọi thẳng `ArkGateway.gen_image()`
trong Python, không qua frontend, truyền `model="hy-image-v3.5-free"`.
Kết quả vẫn bị đổi thành model khác:

```
出图上游失败 model=doubao-seedream-5-0-260128 tokenfree=True status=401
```

Nguyên nhân thật — đo bằng script:

```
default_models: image_model='doubao-seedream-5-0-260128'
so logical model: 3     <- chỉ có DUY NHẤT 1 logical model cho capability 'image'
  image logical: doubao-seedream-5-0-260128 -> channel tokenfree

'hy-image-v3.5-free' -> logical_id = hy-image-v3.5-free
   candidate: channel= tokenfree   upstream= doubao-seedream-5-0-260128
```

`resolve_logical_model_candidates()` không tìm thấy logical model tên `hy-image-v3.5-free`
nên **rơi xuống logical model mặc định của cùng capability** (fallback có chủ đích).
Request vì thế đi sang TokenFree với model Seedream, và token TokenFree đã hết hạn → 401.

## 2. Vì sao channel Kira không được sinh ra

Channel `image-kira` chỉ tồn tại **trong RAM**, sinh bởi `_bootstrap_channels_from_env()`
(`model_settings.py:130`, đăng ký ở dòng 194-210, `sort_order=-2`). Nó **không có row**
trong bảng `system_model_channels`. Routing snapshot lúc chạy có nó (đã kiểm: `['image-kira',
'text-openai', 'tokenfree']`), nhưng:

- `patch_admin_routing_settings` chỉ đọc channel từ **DB rows** (`_load_channels(db, runtime=False)`).
- Nên `synchronize_logical_models_with_channels()` + `_bootstrap_logical_from_channels()`
  không bao giờ thấy `hy-image-v3.5-free`, và không tạo logical model nào cho nó.

**Ngoặc nguy hiểm — đừng dùng `PATCH /api/admin/settings/routing` để thêm channel.**
`model_settings.py:840-844` disable **mọi channel không phải TokenFree** khi body có
`system_channels`. Gửi Kira qua đó sẽ **tắt chính channel Kira**.

## 3. Việc phải làm

1. **Persist channel `image-kira` vào bảng `system_model_channels`** (id `image-kira`,
   `base_url=https://kiraai.vn/api/v1`, `api_format=openai`, `enabled=true`,
   `sort_order=-2`, `models=["hy-image-v3.5-free"]`, `api_key_ciphertext` mã hoá bằng
   `_encrypt_secret`). Làm qua đường đã có sẵn, **đừng** `UPDATE` tay `app_settings.config_json`.
   Sau đó logical model sẽ được bootstrap tự động — có thể **không cần sửa router chút nào**.
2. Thêm logical model `hy-image-v3.5-free` (capability `image`, binding
   `channel_id=image-kira`, `upstream_model=hy-image-v3.5-free`) nếu bước 1 chưa đủ.
3. **Giữ nguyên** cơ chế fallback hiện có. Không thêm nhánh ưu tiên theo model.
4. Test bắt buộc:
   - `resolve_logical_model_candidates("image", "hy-image-v3.5-free")` → channel `image-kira`,
     upstream `hy-image-v3.5-free` (**không phải** tokenfree).
   - `resolve_logical_model_candidates("image", "seedream-5-0-pro")` → **vẫn** tokenfree.
     Đây là chốt chặn để chắc Seedream không bị kéo đi.
   - `pytest` không được vượt `4 failed, 960 passed, 1 skipped`.

## 4. Bằng chứng nền đã có sẵn

- Khoá Kira **còn sống**: gọi tay `POST https://kiraai.vn/api/v1/images/generations`
  với `model=hy-image-v3.5-free` → **HTTP 200**, trả PNG thật (~3,9 MB).
  Ảnh đã lưu và xác nhận bằng mắt. Nên KHÔNG phải vấn đề khoá.
- Giá đã có: `hy-image-v3.5-free` tính **10 fen/lượt** (`KIRA_HY_IMAGE_CHARGE_FEN`,
  commit `0661f97`), test ở `backend/tests/test_kira_hy_image_pricing.py`.
- Luồng tiền đã chứng minh hoạt động: task 683 ước tính 35 fen → đóng băng 35 →
  API lỗi → **hoàn đủ 35**, số dư về nguyên trạng.