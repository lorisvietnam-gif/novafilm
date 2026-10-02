# Sinh kịch bản chế độ `script`: đo trước, sửa sau

Lane: `bunny/4` · gốc đồng bộ `main` = `a654b58` · commit: `5b8248c`, `a8e4bad`, `b10c1c1`, `84d7575`, `5d8d098`

Môi trường đo: model `deepseek-v4-flash-free` qua `https://kiraai.vn/api/v1`,
`ARK_MOCK=false`, Postgres local `:5432`. Không in khoá ra log — chỉ in độ dài và 4 ký tự cuối.

---

## 0. Tóm tắt một câu

Không phải model suy nghĩ lâu, và cũng không phải timeout của ta cắt ngang. Có **hai** nguyên nhân
độc lập: một bức tường **60 giây của nginx phía nhà cung cấp** mà ta không kiểm soát, và một
**đơn vị đo độ dài bằng tiếng Trung** trong prompt khiến model viết dài gấp 2–4 lần. Thêm vào đó,
`_parse_expand_content` **im lặng trả về mock tiếng Trung** mỗi khi model hỏng — nên người dùng
tiếng Việt nhận về một đoạn tiếng Trung trông y hệt kết quả thật.

Sau khi sửa: **lỗi 21% → 0%**, trung vị `script/vi` **39.9s → 24.9s**.
Nhưng **trường hợp xấu nhất thì tệ hơn**: 48.7s → 92.1s. Mục 5 nói rõ vì sao và đánh đổi này.

---

## 1. Số đo TRƯỚC khi sửa

Gọi thẳng `get_ark().expand_content(...)` — đúng đường mà `/api/content/expand` gọi, trừ HTTP và billing.

| Chế độ | Lần 1 | Lần 2 | Lần 3 | min | median | max | lỗi |
|---|---|---|---|---|---|---|---|
| `script/vi` | 48.7s | 37.3s | 39.9s | 37.3s | **39.9s** | 48.7s | 0 |
| `theme/vi` | 4.9s | 5.7s | 5.5s | 4.9s | **5.5s** | 5.7s | 0 |
| `script/en` | 18.3s | 19.9s | **60.6s LỖI** | 18.3s | 19.9s | 60.6s | 1 |

Mở rộng thêm (cùng prompt sản xuất, non-streaming) để lấy tỉ lệ lỗi đủ tin cậy:

| Mẫu | Kết quả |
|---|---|
| `script/vi` ×6 | 37.3, 39.7, 39.9, 48.7, 49.4, 53.3, 56.5s — **1 lần 504 @ 60.44s** |
| `script/en` ×4 | 18.3, 19.9, 29.3s — **1 lần 504 @ 60.62s** |
| 1500–2500 chữ `vi` | **504 @ 60.62s** |

**Tổng: 14 lần gọi `script` non-streaming → 3 lần 504 = 21.4% lỗi.** Không lần nào trả rỗng,
vì `_parse_expand_content` đã nuốt lỗi và trả mock.

### Token: biến ẩn quyết định thời gian

| Mẫu | completion_tokens | thời gian | token/giây |
|---|---|---|---|
| `theme/vi` 40–90 chữ | 146 | 6.96s | 21.0 |
| `script/en` 300–700 字 | 1032 | 29.29s | 35.2 |
| `script/vi` 300–700 字 | 1444 | 37.30s | 38.7 |
| `script/vi` 300–700 字 | 1656 | 56.45s | 29.3 |
| `script/vi` 300–700 字 | 1704 | 49.35s | 34.5 |

Model chạy gần như **cố định ~35 token/giây**. Thời gian chờ **gần như bằng
`completion_tokens / 35`** — nên `script` chậm hơn `theme` 5 lần **không phải** vì provider,
mà vì nó phải sinh ra nhiều token hơn ~11 lần (146 → 1656).

---

## 2. Ba giả thuyết — loại trừ bằng số

### H1 — Model suy nghĩ quá lâu: **BỊ LOẠI**

Brief nghi ngờ thiếu nhánh chặn suy nghĩ cho `deepseek-v4-flash-free`. **Không thiếu.**
`llm_client.py:46` đã có nhánh `deepseek`, và nó **có được gửi đi** — mọi lần đo đều thấy
`thinking_sent: {"thinking": {"type": "disabled"}}` trên wire. `reasoning_content` dài 0 ở
cả 14 mẫu.

Bằng chứng nó không phải thủ phạm — bỏ hẳn key đi rồi so:

| Payload | thời gian | completion_tokens | token/giây |
|---|---|---|---|
| Có `thinking: disabled` (sản xuất) | 39.73s | 1422 | 35.8 |
| Bỏ hẳn key | 54.27s | 2140 | 39.4 |

Chênh lệch thời gian **bám theo độ dài output**, không bám theo suy nghĩ: tốc độ token gần như
không đổi (35.8 vs 39.4). Model chỉ đơn giản viết dài hơn. Suy nghĩ không tốn thời gian ở đây.

### H2 — Có nơi nào đặt timeout 60 giây: **XÁC NHẬN, VÀ KHÔNG PHẢI CODE CỦA TA**

Bức tường 60s có thật, và rất chắc: **60.62, 60.45, 60.44, 60.62s** ở bốn lần chạy khác nhau.
Body trả về là HTML của nginx: `<center><h1>504 Gateway Time-out</h1></center>`.

Nhưng nó **không** nằm trong repo:
- Timeout của đường này là `timeout=90.0` (`ark.py`, `expand_content`) — **chưa bao giờ kích hoạt**.
- `frontend/src/api.ts` không có `AbortController`, không có `signal`.
- Mọi file nginx trong repo đều đặt `600s` (`frontend/nginx.conf`, `admin/nginx.conf`, `deploy/nginx.local.conf`).
- Tìm toàn repo, mọi giá trị `60` đều **không liên quan**: TTL cache (`tokenfree_pricing.py:24`),
  read timeout của video poll (`ark.py:82`), write timeout (`ark.py:88`),
  `task_runtime_tick_stale_sec=60` → 50s tick budget (`tasks/scheduler.py:127`, là watchdog nền, không nằm trên đường request).

→ Bức tường nằm ở **nginx phía `kiraai.vn`**.

**Chứng minh nó là giới hạn rảnh (read-idle), không phải tổng thời gian:** cùng một yêu cầu
2500 chữ, chỉ khác chế độ truyền:

| Cách gọi | Kết quả |
|---|---|
| non-streaming | **504 @ 60.62s** |
| **streaming** | **HTTP 200, xong trong 205.65s**, TTFB 5.92s |

Đó là toàn bộ cơ chế: non-streaming thì model chưa xong thì **chưa byte nào** được gửi đi, nên
timer của nginx không được reset. Đây cũng chính là lý do `ark.py:711`/`:725` (120.0s) không
liên quan — chỗ đó là `chat_storyboard`, và 120s cũng không cứu được một request im lặng 60s.

### H3 — Tạo nội dung dài: **XÁC NHẬN, và tìm ra được cơ chế cụ thể**

Có ảnh hưởng lớn tới thời gian, nhưng lý do sâu hơn "viết dài": prompt gốc là
`content：300-700 字` — **`字` là đơn vị chữ Hán**. Với output tiếng Trung thì không mơ hồ;
với output tiếng Việt/Anh, model đọc thành **"words"** và trả về **1531–2274 ký tự** thay vì
300–700. Vượt 2–4 lần.

Đo trực tiếp bằng cách thêm chỉ dẫn "ký tự" rõ ràng, cùng model, cùng yêu cầu:

| Prompt | completion_tokens | thời gian | độ dài |
|---|---|---|---|
| Gốc (`300-700 字`) | 1422 – 2140 | 37.3 – 56.5s | 1531–2274 ký tự |
| Có chỉ dẫn "ký tự" | **916 – 1074** | **19.2 – 21.9s** | 961–1143 ký tự |

**Giảm ~40% token, nhanh ~2.4 lần.** Và tiếng Việt bản thân đã tốn ~1.6 lần token tiếng Anh cho
cùng nội dung (1704 vs 1032) — nên `script/vi` chậm hơn `script/en` một cách có hệ thống.

### Vì sao `max_tokens` không dùng để chặn được

Đo: `max_tokens=1024` → provider trả về `finish_reason: "stop"` với **1610** completion tokens.
**Provider bỏ qua `max_tokens`.** Không thể dùng nó làm lưới an toàn phía server.

---

## 3. Nguyên nhân thật và cách sửa

### 3.1 `llm_client.chat_completions` không bao giờ stream — đây là nguyên nhân gốc

`chat_completions` gọi `client.post()` không stream. Sửa: stream mặc định, tự ghép lại chuỗi
(`llm_client.py:218`, `_stream_chat` tại `:153`). **Giá trị trả về và mọi call site không đổi** —
giao diện vẫn trả JSON như cũ, nên không cần sửa `frontend/**`.

Đây là nguyên nhân gốc chứ không phải riêng `script`: `drama_chat_json` (`timeout=300.0`) và
`chat_storyboard` (`timeout=120.0`) cũng non-streaming, nên **cũng dính đúng bức tường 60s đó**.

Có đường lùi: nếu kênh từ chối tham số `stream` thì gọi lại kiểu cũ — nhưng **chỉ khi chưa nhận
byte nào**; 429 và 5xx thì ném thẳng, vì chuyển sang non-streaming chỉ để đâm vào cùng bức tường.

### 3.2 Streaming sinh ra một lỗi mới — phải phát hiện được

Đây là lỗi **tôi tự gây ra**, ghi lại thẳng thắn: sau khi bật stream, có lần provider **cắt
ngang giữa chừng**:

```
httpx.RemoteProtocolError: peer closed connection without sending complete message body
(incomplete chunked read)
```

Còn lại là **một nửa JSON object**. Nguy hiểm hơn hẳn lỗi: JSON bị cắt ở giữa **vẫn có thể hợp lệ**,
khi đó người dùng nhận về một văn bản bị cắt cụt mà **không có dấu hiệu gì là lỗi** — họ sẽ lấy
nó đi làm video. Nên `_stream_chat` phải báo cáo `complete` (có `[DONE]` hoặc `finish_reason`),
coi `RemoteProtocolError` là không hoàn chỉnh, thử lại **một lần**, còn không hoàn chỉnh thì
**ném lỗi chứ không trả đoạn vỡ** (`llm_client.py:329`).

### 3.3 `_parse_expand_content` im lặng trả về mock tiếng Trung

`_mock_expand_content` là **một đoạn văn tiếng Trung viết cứng**. Trước đây nó được trả về ở
cả ba đường thất bại: không tìm thấy `{`, JSON hỏng, và `content` rỗng. Nghĩa là: người dùng
tiếng Việt, model hỏng → nhận văn bản tiếng Trung **trông y hệt kết quả thật**, log không có
gì cảnh báo. Sửa: mọi lỗi parse giờ **ném lỗi** (`ark.py:2495`, `:2512`, `:2517`); rỗng thì thử
lại đúng một lần. `mock` **vẫn chạy** khi gateway thật sự ở chế độ mock — đó là chỗ duy nhất
trả sẵn có câu trả lời là không phải dối.

### 3.4 `expand_content` là call có cấu trúc duy nhất còn chưa dùng JSON mode

Sau khi sửa vẫn còn lần trả về 1235 ký tự **không parse được**. Nguyên nhân: nó là call có cấu
trúc duy nhất còn **cầu xin** model trả JSON bằng prompt, trong khi `chat_storyboard` và
`drama_chat_json` từ lâu đã dùng `response_format={"type":"json_object"}` kèm đường lùi
(`ark.py:2424`).

### 3.5 Lỗi trống / lỗi đọc không được

504 về kèm HTML của nginx, 429 về kèm **body hoàn toàn rỗng**. Trước đây cả hai bị ghép thẳng
vào `"LLM error {code}: {text}"`, ra tới giao diện là một đống `<center>` hoặc một dấu hai chấm
trống không. Giờ `_upstream_error` (`llm_client.py:90`) trả lời tiếng Việt, bỏ HTML, và giữ
nguyên văn bản gốc khi 4xx để cơ chế lùi `response_format` cũ không hỏng.

### 3.6 Không có retry cho 429/5xx

Video poller đã coi 429/5xx là lỗi tạm thời từ lâu (`ark.py:286` `_is_transient_http_status`),
đường text thì **chưa có gì**. Nay thử lại **đúng một lần**, vẫn trên đường stream
(`llm_client.py:42`, `GATEWAY_RETRY_BACKOFF_SEC`).

---

## 4. Số đo SAU khi sửa

Cùng harness, 5 lần mỗi chế độ (nhiều hơn 3 lần brief yêu cầu, để cái đuôi có ý nghĩa):

| Chế độ | Lần 1 | Lần 2 | Lần 3 | Lần 4 | Lần 5 | min | **median** | **max** | lỗi |
|---|---|---|---|---|---|---|---|---|---|
| `script/vi` | 22.1s | **92.1s** | 24.4s | 24.9s | 36.2s | 22.1s | **24.9s** | **92.1s** | **0** |
| `theme/vi` | 5.3s | 6.9s | 3.7s | 4.1s | 8.5s | 3.7s | **5.3s** | 8.5s | **0** |
| `script/en` | 63.0s | 12.8s | 12.6s | **114.5s** | 14.3s | 12.6s | **14.3s** | **114.5s** | **0** |

**15/15 thành công, 0 lỗi, 0 kết quả rỗng, 0 ký tự Trung lọt vào nội dung.**

So với trước:

| Chế độ | median trước | median sau | max trước | max sau | lỗi trước | lỗi sau |
|---|---|---|---|---|---|---|
| `script/vi` | 39.9s | **24.9s** (−38%) | 48.7s | **92.1s** (+89%) | 0/3 | 0/5 |
| `script/en` | 19.9s | **14.3s** (−28%) | 60.6s (lỗi) | **114.5s** | **1/3** | 0/5 |
| `theme/vi` | 5.5s | 5.3s | 5.7s | 8.5s | 0/3 | 0/5 |

### Kiểm chứng qua HTTP thật

Không đụng server đang chạy ở `:8000` (không xác định được nó thuộc lane nào). Dựng riêng một
instance từ worktree này ở `:8123`, đăng nhập thật, gọi thật `POST /api/content/expand`:

| Lần | Kết quả |
|---|---|
| `theme/vi` | HTTP 200, 5.3s, 100 ký tự, **0 ký tự Trung** |
| `script/vi` | HTTP 200, 22.7s, 1108 ký tự, **0 ký tự Trung** |
| `script/vi` | HTTP 200, 30.9s, 1414 ký tự, **0 ký tự Trung** |
| `script/en` | HTTP 200, 15.2s, 1160 ký tự, **0 ký tự Trung** |

Log server xác nhận đường stream thật sự được dùng: `文字 LLM 流式返回 content_len=1164` v.v.
Auth, billing và `run_billed_ephemeral` chạy qua bình thường.

### Kiểm tra hồi quy

`4 failed, 944 passed, 1 skipped` — đúng 4 lỗi failed có sẵn đã ghi ở `AGENTS.md` mục 4, không
lỗi mới nào. Thêm 32 test mới trong `backend/tests/test_expand_content_streaming.py`.

---

## 5. Đánh đổi và phần CHƯA giải quyết được

### 5.1 Trường hợp xấu nhất đã **tệ hơn**, và đây là đánh đổi có chủ ý

92.1s và 114.5s gần như chắc chắn là: 504 @ 60s → nghỉ 2s → thử lại → thành công. Tức là **retry
kéo dài thời gian chờ**, đúng cái brief cảnh báo khi nói đừng chỉ nâng timeout.

Tôi vẫn chọn retry, vì brief xếp hạng rõ: *"Trả về rỗng là lỗi nặng hơn chậm"* và yêu cầu phải
sửa để **không bao giờ** trả rỗng. Một lần chờ 92s rồi có kết quả tốt hơn một lần chờ 60s rồi
gặp lỗi. **Nhưng con số max này phải nói thẳng, không được giấu.** Nếu sản phẩm muốn ưu tiên
giữ dưới 60s tuyệt đối thì bỏ `retry_gateway`, đổi lại lỗi quay về ~21%.

### 5.2 Provider bỏ qua `max_tokens`

Đo được: yêu cầu 1024, nhận 1610 token. Không thể chặn độ dài phía server. Mọi thứ phải đi
qua prompt.

### 5.3 Model vẫn vượt trần đặt ra

Bảo ≤700 ký tự, thực tế vẫn ra 840–1302. Đã giảm nhiều so với 1531–2274, nhưng chưa chịu nằm
gọn.

### 5.4 Còn lại là giới hạn **sức chứa của provider**, không phải lỗi code

Tốc độ dao động 19–39 token/giây giữa các lần, cộng với trần ~60s ở upstream. Không còn cách
nào trong repo để sửa. Đòn bẩy thật sự là **chọn model nhanh hơn / rẻ hơn** — nhưng đó là quyết
định sản phẩm, và `AGENTS.md` mục 10 vẫn còn treo `billing_llm_per_m = 5.0` chưa đo. **Tôi không
tự quyết.**

### 5.5 Nhịp 429

Bị 429 (body rỗng) sau khoảng 20–30 lần gọi liên tiếp trong lúc đo, hai lần. Một người dùng bấm
một lần gần như không gặp. Có retry, nhưng retry không thay thế được việc giảm độ dài output.

### 5.6 Server ở `:8000` vẫn chạy code cũ

Không khởi động lại được vì không xác định được tiến trình đó thuộc lane nào. **Ai sở hữu nó
phải restart** thì thay đổi mới có hiệu lực.

### 5.7 Ngoài phạm vi lane — phát hiện thêm, **không tự sửa**

`resolve_logical_model("text", ...)` trả về `None` (`logical_id` rỗng), nên text model đang đi qua
**`env-fallback`**, không đi qua channel nào cả. Model và base URL lấy từ flat settings overlay.
Nghĩa là channel `text-openai` (Kira) mà `AGENTS.md` mục 10 mô tả **không thực sự được dùng cho
text**, và override base URL theo channel không có tác dụng với text. Đây là nợ kỹ thuật riêng,
cần board phân xử — tôi không mở rộng phạm vi.

### 5.8 Chưa làm: đẩy stream tới trình duyệt

SSE tới UI sẽ cảm nhận được nhanh hơn nhiều, nhưng cần sửa `frontend/**` — brief cấm. Stream
hiện chỉ ở phía server, người dùng **không** thấy tiến triển.

### 5.9 Provider theo dõi ở tầng khác

504 còn xuất hiện cả khi đã stream (một lần 60.4s), nghĩa là ngoài `proxy_read_timeout` còn có
một giới hạn nữa ở tầng bên trong provider. Stream **giảm** tỉ lệ lỗi rất nhiều nhưng **không**
triệt tiêu nó.

---

## 6. File đã đụng

| File | Nội dung |
|---|---|
| `backend/app/services/llm_client.py` | stream mặc định; phát hiện & thử lại khi stream bị cắt; retry 429/5xx một lần; `LlmUpstreamError`; lỗi 429/5xx dễ hiểu |
| `backend/app/services/ark.py` | `_EXPAND_LENGTH_RULES` theo ngôn ngữ; `response_format` + đường lùi; thử lại khi rỗng; `_parse_expand_content` ném lỗi thay vì trả mock |
| `backend/tests/test_expand_content_streaming.py` | 32 test mới |

Không đụng `frontend/**`, `admin/**`, `scripts/**`, `styles/**`. Không `git push`, `stash`,
`rebase`, `reset --hard`.

## 7. Cách đo lại

Harness nằm ở `.kilo/` (đã gitignore, không lọt vào commit):
`measure_lib.py` (dùng chung), `phase1_baseline.py` (trước), `phase5_after.py` (sau),
`phase2_hypotheses.py`, `phase3_length.py`, `phase7_repro.py`, `e2e_client.py`.

Lưu ý khi chạy lại: phải nạp settings cache từ DB trước, nếu không `ArkGateway.mock` sẽ là
`True` (`ark.py` property `mock`) và `expand_content` trả về mock Trung trong ~0s — trông như
thành công nhanh nhưng là đường giả. `warm()` trong `measure_lib.py` kiểm tra điều này và
dừng luôn nếu đang ở mock mode.
