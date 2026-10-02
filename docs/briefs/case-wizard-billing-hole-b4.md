# BRIEF — Lỗ hổng tiền: `/wizard` ghi "đã thu" nhưng không thu được fen nào

Đây là lỗi **mất tiền thật**, ưu tiên cao nhất trong backlog.

## 1. Bằng chứng đo (gọi thật qua HTTP)

```
POST /api/wizard/generate_prompt   -> 200, prompt 813 ký tự, 0 ký tự Trung
task 753  generate_prompt  succeeded  est=0  charged=40  refunded=0  settled
ví: balance 360 -> 360            <-- KHÔNG đổi một fen nào
```

**Bản ghi task nói `charged=40`. Ví nói 0.** Hai nơi đang nói hai sự thật khác nhau.

## 2. Nguyên nhân đã khoanh vùng

`app/services/billing/settlement.py:289-299`:
```python
if not user or task.billing_status != "frozen":
    # 非 frozen（如 none）但已有用量：只落账用量，不碰钱包
    task.billing_charged_fen = charged
```
> Task không ở trạng thái `frozen` thì hệ thống **ghi `charged` vào sổ nhưng cố ý không đụng ví**.

Đo thêm, đã loại trừ từng nghi vấn:
- `estimate_task_fen('generate_prompt')` = **48** — hàm ước tính **đúng**, không phải lỗi ở đây
- `run_billed_ephemeral` **có** gọi `freeze_for_task` (`ephemeral.py:118`)
- Nhưng task lưu `billing_estimate_fen = 0` ⇒ nhánh `not billing_active` tại
  `settlement.py:181-187` đã chạy và đặt `billing_status = "skipped"`

**Câu hỏi phải trả lời:** vì sao `billing_active(user)` lại False cho chính tài khoản này,
trong khi `GET /api/billing/wallet` trả `billing_enabled: true`?
Tìm ra chỗ lệch đó. **Đo trước, sửa sau.**

## 3. Cạm bẫy phải tránh

Brief cũ nói "đi qua `freeze_for_task` / `settle_task` để có thu tiền" — vô nghĩa về mặt kiểm chứng.
`charged > 0` **trên bản ghi task** KHÔNG chứng minh tiền vào ví. Bài này đã trải qua đúng cái bẫy đó.

**Chỉ được coi là xong khi số dư ví thật sự giảm.**

## 4. Tiêu chuẩn nghiệm thu (bắt buộc)

Chạy thật trên DB thật và đọc **cả hai** — bản ghi task **và** ví:

| | trước | sau |
|---|---|---|
| `billing_estimate_fen` | > 0 | = est |
| `billing_status` | — | `frozen` → `settled` |
| **ví `balance_fen`** | B | **B − charge** |
| `billing_charged_fen` | — | = charge |

Tài khoản thử: `board-audit@novafilm.probe` / `Audit-2026-x`.

Ngoài ra:
- Nghạch đủ thì phải **bị chặn** (HTTP 402/`insufficient_balance`) chứ không lặp lẩm rồi mới hỏng ví.
- Gọi lỗi (LLM 500) thì **hoàn đủ** `est`, ví về nguyên trạng.
- `pytest` không được vượt `4 failed, 1023 passed, 1 skipped`.

## 5. Ràng buộc

- **Đừng sửa `settlement.py:289-299` cho "chạy cho có".** Nhánh đó **có chủ đích** —
  `skipped` nghĩa là billing tắt toàn cục, `none` là task không tính phí. Sửa nó sẽ lấy tiền
  của người dùng cả khi hệ thống đang tắt billing. **Sửa đúng chỗ sai, đừng vô hiệu hoá lớp bảo vệ.**
- Không xoá file nào.
- Báo cáo ra FILE rồi **COMMIT** trước khi kết thúc (`AGENTS.md` mục 11).