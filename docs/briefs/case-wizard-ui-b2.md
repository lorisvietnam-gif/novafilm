# BRIEF — bunny/2 — Dựng vỏ `/wizard` 4 bước

Trang **hoàn toàn mới**. **Không sửa, không xoá, không ẩn** gì của `/studio` hay `/drama`.

## Vì sao trang này tồn tại

NOVAFILM là **trạm đẻ prompt**, không phải trình render. Người dùng bấm Copy → dán sang
Google Flow / Muse / Kling. Không có API video nào chạy được (TokenFree không khoá; Veo hết hạn
ngạch). Nên **đừng xây chỗ gọi video** — bước 4 chỉ xuất prompt.

## 4 bước

| Bước | UI | Ghi chú |
|---|---|---|
| 1 | Up ảnh **Nhân vật** + **Bối cảnh** | Tái dùng logic node của Canvas: `CanvasStore.tsx:682 collectIncomingAssetIds()` |
| 2 | Ô "Bạn muốn video kể gì?" (tiếng Việt) + khu hiện **kịch bản & prompt** | Gọi `POST /api/wizard/generate_prompt` (B4 đang viết) |
| 3 | Chọn **đích đến**: Veo / Muse / Kling / Seedance · Chọn giọng (dropdown, tạm chỉ UI) | Giọng là mô tả tính chất, **không** có model TTS |
| 4 | Nút lớn + hiện prompt cuối cùng, nút **Copy** từng khung | Không gọi video API |

Chạm bước 4 khi bước 2 **thất bại**: phải hiện lỗi dễ hiểu bằng tiếng Việt, không trắng trang.

## Việc kèm — `/privacy` làm script audit crash

Board đã gặp: `Trang /privacy (sau reload) khong on dinh sau 45s (readyState=interactive, chu=0)`
— audit **dừng cả lô**, không tính được route còn lại. Tìm và sửa nguyên nhân
(giả định ban đầu: trang đổ locale/lazy-load treo). **Phải chứng minh** bằng cách chạy
`node scripts\visual-audit.mjs` và thấy đủ **25 route** không dừng giữa chừng.

## Ràng buộc

- `npm run build` xanh · `npm run lint` **0 error / 40 warning**.
- Đếm selector `.pf-` trước/sau nếu đụng `styles/**` — **không mất selector nào**.
- Ngôn ngữ: nhãn và thông báo lỗi **tiếng Việt**. `vi` phải đủ key của `zh` — dùng cơ chế
  `Widen<typeof zh>`, thiếu key thì build FAIL (đừng né bằng `as any`).
- Không hard-code domain. Không đụng token/key.
- Báo cáo ra FILE rồi **COMMIT** trước khi kết thúc (`AGENTS.md` mục 11).

## Nếu `generate_prompt` chưa có khi anh bắt đầu

Kệ. Dựng UI với mock, ghi rõ trong báo cáo, đừng chặn tiến độ vì chờ B4.