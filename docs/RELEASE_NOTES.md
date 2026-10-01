# RELEASE NOTES — NOVAFILM

Tài liệu này ghi lại **trạng thái thật** của sản phẩm tại thời điểm phát hành, gồm cả những
hạng mục **chưa xong**. Mục đích là để không ai phải phát hiện ra bằng cách chạm vào.

Nguyên tắc: **hạng mục nào chưa kiểm chứng được thì ghi là chưa kiểm chứng được**, không ghi là
đã xong.

---

## 1. Đã có và đã kiểm chứng

| Hạng mục | Bằng chứng |
|---|---|
| Giao diện tiếng Việt, 25 route | Audit chạy 2 lần cho kết quả **giống hệt từng dòng route** (`Compare-Object` rỗng): `vi 135` · `en 133` ký tự Trung còn sót. 0 lỗi JS, 0 trang trắng. |
| Lint sạch | `0 error / 40 warning`, không tăng so với baseline. |
| Test backend | `4 failed / 912 passed / 1 skipped`. 4 lỗi failed là **có sẵn từ upstream**, đã chứng minh bằng cách chạy lại ở commit gốc. |
| Nhiều nhà cung cấp, mỗi nhà một channel | `tokenfree` (ảnh/video/TTS) · `text-openai` (văn bản) · `image-kira` (ảnh). Đã kiểm chứng: `PATCH` cấu hình **giữ được**, không còn bị ghi đè. |
| Ảnh tham chiếu nhân vật/bối cảnh từ Canvas | Backend nhận `subject_ref_urls` / `style_ref_urls`, khử trùng, chặn trần 9 ảnh, chặn trộn `first_frame` với `reference_image`. 549 dòng test hợp đồng. |
| Tải ảnh lên khi chưa có OSS | Kiểm chứng tay: `POST /api/drama/assets/14/upload` → `200`, tên file do **UUID sinh ra** (không dùng tên người dùng gửi lên), ảnh tải về `200 image/jpeg`. |
| Sinh kịch bản bằng nhà cung cấp văn bản | Kiểm chứng tay qua API: `vi` → *"Ly Cà Phê Ghép Cho Mẹ"*; `en` → *"The Coffee Seller Who Ga..."* |

## 2. Known Issues — những hạng mục **chưa xong**

### 2.1 Chưa build Docker image lần nào
`Dockerfile` và `docker-compose.yml` đã viết xong (non-root, healthcheck, volume cho media) nhưng
**máy này không cài Docker**, nên chưa từng build image thật. Lên VPS chắc chắn sẽ gặp lỗi môi
trường lần đầu. **Phải dành thời gian cho bước đó**, không được coi là đã xong.
→ giai đoạn Staging.

### 2.2 OAuth chưa kiểm với nhà cung cấp thật
Registry 5 provider đã viết và có test, nhưng **không có client_id/secret thật** và cả bốn provider
đều bắt buộc URL https công khai, từ chối `localhost`. Nút đăng nhập xã hội vì thế **đang ẩn sau
feature flag** — cố ý, không phải lỗi.
→ cần tài khoản provider thật + domain production.

### 2.3 Sinh kịch bản chế độ `script` chậm
Đo được ~**55 giây** cho một bản lời dẫn 300–700 chữ, và có **một lần trả về rỗng ở 60 giây**.
Chưa rõ nguyên nhân là hàng đợi provider, timeout, hay giới hạn tốc độ bậc miễn phí. **Chưa điều tra
xong.**

### 2.4 `hy-image-v3.5-free` chưa định giá — chưa bật làm model ảnh
Cố bật làm model ảnh chính đã làm hỏng test `test_tool_image_1k_uses_six_credits`, vì model đó
**không có bảng giá** nên phí tính ra sai. Phải **định giá trước, bật sau** — không đảo thứ tự.
→ cần Admin đặt giá.

### 2.5 Chưa chứng minh được ảnh tham chiều với Seedance thật
549 dòng test là **contract test** — chứng minh logic của ta đúng, **không** chứng minh Seedance
chấp nhận. **Cần API key thật và chạy lại từ đầu.**

### 2.6 53 ký tự tiếng Trung còn sót trong database
Không phải lỗi giao diện — là **văn xuôi kịch bản do mô hình sinh, lưu trong `drama_fragments.content`**.
Dịch nó là dịch nội dung người dùng, nên **không sửa ở tầng frontend**. Sẽ dọn khi khởi tạo dữ liệu
thật.

### 2.7 Luồng "AI Short Video" chưa có ô tải ảnh tham chiếu nhân vật
Nhất quán nhân vật ở luồng này đang được ép bằng **prompt**, không phải bằng ảnh. Ảnh tham chiếu
nằm ở trang Tài nguyên. Đây là khoảng trống sản phẩm thật, chưa sửa.

## 3. Quy trình đã học được — giữ lại để không lặp lại

1. **`npm run build` xanh không có nghĩa trang chạy được.** Vite xếp lại thứ tự, Rollup nên không
   bắt được lỗi khởi tạo hằng ở dev server. Phải mở app thật.
2. **Ảnh chụp chứng minh thị giác, không chứng minh ứng dụng chạy.** Ảnh `/templates` từng trông
   hoàn hảo trong khi trang báo lỗi kết nối. Muốn chứng minh chạy thì phải có số đo.
3. **Số liệu từ công cụ mới là bằng chứng; ước lượng của người viết brief thì không.** Hai lần
   trong ngày, brief của board sai và lane bắt đúng bằng cách đối chiếu dữ liệu.
4. **Đọc file bằng công cụ đọc text, không giải mã bằng mắt.** Board đã từng viết ra một danh sách
   "dữ liệu thật" mà thực ra là mojibake giải mã sai, rồi giao như thật.
5. **`pytest` trên máy này cần `--basetemp` trỏ vào worktree**, nếu không sẽ báo hàng loạt
   `PermissionError` trông như code hỏng.
6. **Công cụ dò bằng Edge headless để lại 0.4–0.5 GB mỗi lần.** Đợi tích tụ đã lên 12 GB và làm
   đầy ổ D:. Đã dọn, còn 18.2 GB.
