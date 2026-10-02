# BRIEF — bunny/1 — Tên mặc định tiếng Trung lọt ra giao diện

## 1. Bằng chứng (đo, không phải nghi ngờ)

Audit vừa chạy lại cho thấy số ký tự Trung **tăng** so với lần trước:

```
/drama/assets               1  -> 16
/assets                     1  -> 16
/drama/projects/16/canvas   0  ->  5
```

Nguyên nhân **không** phải LLM sinh tiếng Trung. Truy thẳng xuống database:

```
id=23 name='未命名资产'   <- 5 ký tự, khớp đúng canvas +5
id=22 name='Video mới'
id=21 name='Bối cảnh mới'
id=20 name='Anh cu'
```

Những asset tôi sinh trong lúc thử nghiệm đều có tên tiếng Việt hoặc ASCII, **trừ** cái
không truyền `name` — nó nhận luôn tên mặc định tiếng Trung rồi hiển thị thẳng ra UI.

## 2. Danh sách đầy đủ đã tìm thấy

**Nhóm A — SỬA (tên mặc định hiện ra cho người dùng):**

| File | Dòng | Hiện tại |
|---|---|---|
| `app/services/drama/generation.py` | 1370 | `name or "未命名资产"` |
| `app/services/drama/generation.py` | 250 | `or "未命名音色"` |
| `app/api/drama/projects.py` | 125 | `"自由画布项目"` / `"未命名漫剧"` |
| `app/models_drama.py` | 20 | `DramaProject.title` default `"未命名漫剧"` |
| `app/schemas_drama.py` | 14 | `DramaProjectCreate.title` default |
| `app/models.py` | 103 | `Project.title` default `"未命名作品"` |
| `app/schemas.py` | 179 | `ProjectCreate.title` default |

Đổi sang tiếng Việt (`Tài sản chưa đặt tên`, `Tác phẩm chưa đặt tên`, `Dự án chưa đặt tên`…).

## 3. CÁI BẪY PHẢI SỬA CÙNG LÚC — đọc kỹ

`app/services/drama/agents.py:654`:
```python
or current in {"未命名漫剧", "自由画布项目"}
```
Đây là guard *"tên này có phải tên mặc định không"*. **Chỉ đổi giá trị mặc định mà không
sửa bộ so sánh này là tên mặc định sẽ bị coi là tên do người dùng đặt** → logic đặt tên
tự động hỏng. Phải cập nhật cả hai vế.

## 4. CẤM ĐỤNG — những chỗ Trung này phải giữ nguyên

- `fragment_plan_prompt.py:106-111`, `script_summary_prompt.py`, `visual_prompt.py:134`,
  `voice_prompt.py:56` → **prompt gửi cho model (Nhóm A của prompt, dùng khác nghĩa)**.
- `projects.py:506,508` `_safe_zip_name` → **tên file kỹ thuật (Nhóm D)**.
- `seed.py:387` → kiểm tra xem dùng để làm gì rồi mới quyết; nghi ngờ là prompt.

Đây là ranh giới đã ghim trong `AGENTS.md`. Đừng dịch hàng loạt bằng regex rồi phá
Seedance. **Chỉ sửa đúng 7 dòng ở mục 2 cộng guard ở mục 3.**

## 5. Bắt buộc trước khi báo cáo

- Test: tạo asset không truyền `name` ⇒ tên lưu vào DB phải là tiếng Việt.
- Test: đổi tên mặc định, chạy lại logic `agents.py` phải **vẫn** coi là mặc định.
- Test: `pytest` không được vượt `4 failed, 982 passed, 1 skipped`.
- `npm run build` xanh · `npm run lint` **0 error / 40 warning**.
- Chạy `node scripts\visual-audit.mjs`, `/drama/assets` và `/assets` phải **tụt về 1**.
- Viết báo cáo ra FILE rồi **COMMIT** trước khi kết thúc (`AGENTS.md` mục 11).