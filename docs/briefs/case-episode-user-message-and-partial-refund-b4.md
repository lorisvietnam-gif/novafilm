# BRIEF — bunny/4 — Đợt 2: user message và khoản thu tiền theo từng tập

Bản vá đợt 1 (`9725c76`) sửa **system prompt**. Phép kiểm chứng E2E cho thấy
**vẫn ra tiếng Trung**. Đây là phép đo thật trên dự án mới `id=39`, `locale=vi`, task 821:

```
ep1 len>0  cjk=240
### 场1-1
夜 外 老城区街道
出场人物：苏晚、阿萤
△ 特写：车载导航红蓝线交错，屏幕跳出"路线重新规划"…
苏晚（mệt mỏi，os）：又是这条路，导航从来不认这里。
ep2 len=0  cjk=0
ep3 len=0  cjk=0
ep4 len=0  cjk=0
```

---

## 1 — Locale tới đúng chỗ, nhưng **user message** vẫn ép tiếng Trung

Đã loại trừ giả thuyết "locale rớt":
```
project 39: params.locale='vi'  keys=[episode_count, image_style_id, locale, workflow]
jobs.py:509  locale = str((project.params or {}).get("locale") or get_settings().default_locale)
```

Vậy vấn đề là **hai chỉ thị trái ngược trong cùng một lời gọi**:

- system prompt (đã sửa): *"Ngôn ngữ đầu ra là tiếng Việt…"*
- user message (**chưa sửa**): `"请输出第 N 集的 title 与 content。"` + khuôn
  `### 场X-Y`、`夜 外`、`出场人物：`、`△`

Khuôn định dạng chi tiết hơn nên thắng. Bằng chứng là thẻ cảm xúc
`苏晚（mệt mỏi，os）` ra tiếng Việt (system prompt thắng ở chỗ đó) còn thân thì bằng Trung.

Cần làm:
1. Đưa **user message** về cùng một bộ ngôn ngữ dùng chung với system prompt.
   Tái dùng `resolve_output_language_spec` trong `ark.py` — **cấm bảng thứ ba**.
2. Câu yêu cầu định dạng (`### 场1-1`, `夜 外`, `出场人物`, `△`) là **khuôn bản kịch
   bản cố định**. Đây là khuôn **cấu trúc**, không phải nội dung — nó được phép giữ,
   và **phải giữ**: Seedance đọc đúng khuôn này. Chỉ câu **giải thích/yêu cầu** quanh
   nó mới cần đổi theo locale.
3. **Không** dịch `△` và các marker Nhóm D.

Nếu không làm (1), thay đổi locale sẽ chỉ làm dịch vỏ ngoài mà nội dung vẫn Trung —
đúng cái tình trạng hiện tại.

---

## 2 — Điều kiện hoàn tiền bỏ lọt trường hợp "3 tập rỗng"

Đợt 1 thêm: ghi xong mà `episode_content` **không đổi hoặc rỗng** thì hoàn tiền.
Nhưng task 821 vẫn `succeeded` và **thu tiền**, dù `ep2/3/4` có `len=0` — vì
`episode_content` **có đổi** (tập 1 có nội dung) nên điều kiện không kích hoạt.

Cần sửa thành **kiểm từng tập**:
- Sau khi ghi, đếm số tập có `body` đủ dài.
- Nếu **bất kỳ tập nào** được yêu cầu sinh mà ra rỗng ⇒ **hoàn tiền phần đó** hoặc
  hoàn toàn bộ, và **báo lỗi cho người dùng**.
- Không được coi là thành công khi `total > 0` mà phần lớn tập rỗng.

---

## Ràng buộc

- **Cấm** dịch marker Seedance: `【字幕】`, `【旁白·…】`, `【画面】`, `【空镜】`, `△`,
  `### 场X-Y`, `@duration:N`.
- **Cấm** viết bảng ngôn ngữ thứ ba; nguồn duy nhất là `ark.py`.
- **Cấm** sửa `settlement.py:289-299`.
- `pytest` không được vượt `4 failed, 1087 passed, 2 skipped`.
- **Đồng bộ `main` trước khi bắt đầu.**

## Nghiệm thu (bắt buộc, chạy thật)
1. Tạo dự án mới, `params.locale = "vi"`, sinh **tối thiểu 3 tập**.
2. Đo `episode_content`: **0 ký tự Trung trong `body`**.
3. Marker Nhóm D **vẫn còn nguyên**.
4. Mọi tập yêu cầu sinh đều **không rỗng**.
5. Báo cáo **ảnh chụp màn hình** + đo trực tiếp từ database, không chỉ dựa vào unit test.

## Ghi chú

Lần này **không tin unit test**. Đợt 1 có **112 test xanh** mà sản phẩm vẫn ra tiếng Trung.
Chỉ dữ liệu thật mới được tính là bằng chứng.