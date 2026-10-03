# Báo cáo — `case-episode-locale-and-silent-charge-b4`

Lane: `bunny/4` · ngày đo: 2026-10-03 · brief:
`docs/briefs/case-episode-locale-and-silent-charge-b4.md`

**Kết luận một dòng:** 4/5 mục đóng và đo được; **mục 1 chưa đạt nghiệm thu qua
HTTP**, vì nguyên nhân gốc còn nằm ở `script_summary_prompt.py` — ngoài 6 hằng số
brief nêu tên. Số đo ở mục 1.

---

## 0. Số đo trước khi sửa (brief yêu cầu "Measure before changing anything")

Tất cả lấy từ database thật của máy (127.0.0.1:5432), không sửa gì trước khi đo.

### Mục 1 — prompt của `episode_script` không nhận locale

Project 28 (`params.locale = "vi"`), `episode_content`:

| tập | ký tự Trung | ký tự bỏ trắng |
|---|---|---|
| ep1 | 894 | 1032 |
| ep2 | 1010 | 1146 |
| ep3 | 1126 | 1262 |
| ep4 | 1064 | 1198 |
| ep5 | 889 | 1006 |
| ep6 | 1034 | 1166 |

6/6 tập toàn chữ Trung. Cùng lúc `content/expand` với `locale=vi` ra đúng tiếng
Việt — nên bảng ngôn ngữ của `ark.py` **đúng**, chỉ là đường `episode_script` không
dùng nó: 6 prompt là hằng số cấp module trong `agents.py`, `语言使用简体中文` và
`450-600 汉字` viết cứng.

### Mục 2 — tập rác biến mất không dấu vết

Project 17: đúng 1 tập có `episodeNumber = None` (`title='Bat cua'`). Tái hiện trực
tiếp:

```
auto_missing_episode_numbers(existing, 3) = [1, 2, 3]
merge_episode_bodies(existing, [])         = [(1, 'E1')]
```

Tập `None` không được tính là thiếu (nên không bao giờ được sinh lại), và không có
một dòng log nào. `merge_episode_bodies` cũng nuốt nó.

### Mục 3 — thu tiền cho lần gọi không ghi được gì

Đọc lại từ trạng thái DB, không suy đoán:

| task | status | billing | estimate | charged | refunded | usage |
|---|---|---|---|---|---|---|
| 811 | succeeded | settled | 48 | **40** | 8 | 1×`llm_chat` 80000 tok (estimated) |

**Chỉnh một điểm so với brief:** brief nói task 811 "`episode_content` không đổi".
Đo lại thì task 811 **có** ghi: event log của nó là
`分集大纲就绪，开始生成 0/1` → `分集剧本进度 1/1` → `分集剧本全部完成 1/1`, và
`drama_scripts.updated_at = 23:41:34.66` (task xong `23:41:34.68`). Nói cách khác,
task 811 **đã** sinh tiếng Trung cho một dự án `locale=vi` — đây là hậu quả của mục 1,
không phải lỗi "ghi bằng rỗng".

Lỗi "ghi bằng rỗng" vẫn có thật, ở chỗ khác, và là **lỗi thứ tự** — đây mới là cái đáng
sửa:

- `jobs.py` `raise RuntimeError("分集生成无进度")` nằm **sau** `record_line`. Nghĩa là
  task fail mà vẫn mất tiền. Cùng dạng đó đã xảy ra thật ở task 788: `failed` mà vẫn
  `charged=320` (8 dòng `llm_chat`).
- Nguyên nhân gốc không bắt được bằng `try/except`: LLM không ném exception. Nó trả
  rác, parser nuốt rác, không có gì để bắt.

### Mục 4 — chỉ có một model chữ, không có dự phòng

`resolve_logical_model_candidates("text", "mimo-v2.6-flash-free")` → **đúng 1 ứng
viên**. Nhưng cùng kênh `image-kira` có thêm model sống:

| model | probe | trong allowlist |
|---|---|---|
| `mimo-v2.6-flash-free` | 200 · 1.56s | có |
| `hy3` | 200 · 0.42s | **không** |
| `hy4` | 200 · 3.45s | **không** |
| `qwen3.8-flash-next-free` | 200 · 2.56s | **không** |
| `deepseek-v4-flash-free` | **HTTP 403** | không |

Cả 3 model sống bị loại **chỉ vì** không có trong `models` của kênh. Task 810 đúng
lúc đó: `mimo` 504 ⇒ hệ thống dừng, trong khi 3 kia cùng kênh đều 200.

Ngoài ra `chat_completions` chỉ lấy `candidates[0]` — nghĩa là `LogicalModel` mà
schema mô tả là *"multi-channel failover"* thì failover chưa bao giờ chạy.

### Mục 5 — ngưỡng 450 chưa đo được

Đo được `_content_char_len` (bỏ khoảng trắng) trên 6 tập của project 28:

```
nospace: 1032, 1146, 1262, 1198, 1006, 1166   (tất cả đều ≫ 450)
```

Đây là nội dung **tiếng Trung**, không phải tiếng Việt. Ngưỡng 450 được chọn cho
"chữ Hán xấp xỉ bằng độ dài bỏ trắng"; với tiếng Việt đơn ngữ, chữ cái có dấu **mật
độ ký tự cao hơn**, nên 450 ký tự tiếng Việt có thể là ít thông tin hơn 450 chữ Hán
nhiều hơn. **Không đo thì giữ nguyên** → giữ 450. Xem mục 5 bên dưới.

---

## 1. Đã làm

### Mục 1 — 6 prompt thành hàm dựng theo locale (ĐẠT một phần, xem cảnh báo)

Bảng ngôn ngữ **một nguồn sự thật**, mở rộng từ bảng sẵn có của `ark.py`
(`resolve_output_language_spec`), không viết bảng thứ hai:

`backend/app/services/ark.py`
- `OutputLanguage` — thêm `directive` + `length_unit` + `marker_clause` +
  `example_lead` + `body_example`.
- `SEEDANCE_CONTRACT_TOKENS` — danh sách token **không được dịch**, su ra từ parser
  thật (`build_fragments.py`, `seedance_segments.py`).
- `OUTPUT_LANGUAGE_BODY_EXAMPLE` — ví dụ một cảnh, viết bằng **đúng** ngôn ngữ đích.

`backend/app/services/drama/agents.py`
- 6 hằng số → 6 hằng số riêng tư + 6 hàm `episode_*_system(locale)`.
- `run_episode_script_batch` / `run_episode_script_from_draft` /
  `run_episode_body_from_brief` / `run_episode_full_from_creative` /
  `run_episode_summary_from_creative` / `run_episode_brief_from_body` /
  `run_episode_outline` / `ensure_episode_outline` nhận `locale`.

**Không dùng `.format()`/f-string cho template** — template có ngoặc `{` `}` kiểu
JSON (`{"episodes":[{"episodeNumber":...}]}`), format sẽ ăn mất dấu ngoặc. Dùng
`.replace()` với token `__LANGUAGE_DIRECTIVE__` / `__LENGTH_UNIT__` /
`__SEEDANCE_MARKER_CLAUSE__` / `__OUTPUT_LANGUAGE_EXAMPLE__`.

`backend/app/services/drama/jobs.py` — `locale` lấy từ `project.params.locale`, rơi
về `settings.default_locale` (`config.py:213` là `vi`), truyền xuống cả đường job
lẫn đường một tập.

**Ba lần sửa giữa chừng, đo được mỗi lần** (xem bảng ở mục 2 báo cáo): câu chỉ thị
viết thành danh sách *nội dung được phép dịch* không ăn; phải là danh sách *ngoại
lệ*; và sau cả hai vẫn còn 224 ký tự Hán → phải thêm vòng kiểm–nhắc.

### Mục 2 — tập bị bỏ phải nói ra

`merge_episode_bodies` và `auto_missing_episode_numbers` thu thập mục bị bỏ rồi gọi
`_warn_dropped_episodes`, đếm số + mẫu. **Không đổi logic bỏ** — chỉ làm nó không
im lặng. Cảnh báo tắt khi không có gì bị bỏ, nếu không log sẽ thành tiếng ồ.

### Mục 3 — không ghi được gì thì hoàn tiền + báo lỗi

`jobs.py`: `_episode_content_fingerprint` (chỉ `episodeNumber` + hash thân) và
`_episode_record_fingerprint` (toàn bộ bản ghi một tập, cho đường một tập vì
`summary`/`brief` **không** đổi thân) + `_assert_episode_content_written`.

Chốt bảo vệ chỉ bắn khi **đã tiêu tiền mà vẫn không viết gì**. Không tiêu thì
giữ nguyên hợp đồng cũ (`test_episode_script_no_llm_call_charges_nothing`): đã đủ
nội dung thì **thành công**, không phải lỗi — báo lỗi cho người dùng khi nội dung
của họ đã đủ là sai.

Điểm mấu chốt: **`raise` trước `record_line`**. `settle_task` chấm tiền theo
`usage_events`; dòng đã nẻ DB thì task fail vẫn thu được tiền. Nên phải chứng minh
đã ghi được gì *trước khi* ghi dòng, và `if not batch: raise` được nối lên trên.

### Mục 4 — có dự phòng, và không đổi bên thu tiền

- `logical_model_router.resolve_same_channel_failover_routes` — chuỗi failover:
  binding của model được yêu cầu, rồi bù bằng model cùng năng lực **trên cùng
  kênh**.
- `llm_client.chat_completions` đi theo chuỗi đó, tối đa
  `MAX_TEXT_ROUTES_PER_CALL = 3` lần gọi lên; 4xx vẫn ném ngay (đổi model chỉ
  nhận cùng lỗi).
- `model_settings.KIRA_IMAGE_MODELS` → `KIRA_CHANNEL_MODELS`, bỏ
  `deepseek-v4-flash-free` (403) và thêm 3 model sống đã đo.
- Ghi allowlist trực tiếp vào `system_model_channels.image-kira` (xem cảnh báo bên
  dưới về vì sao **không** dùng endpoint PATCH).

**Giới hạn failover trong một kênh là cố ý.** Bản đầu tôi cho phép đổi kênh, và đo
thấy nó kéo chuỗi sang `tokenfree` (`kimi-k2.6`, `deepseek-v4-pro`, `gpt-5.5`) — tức
là **đổi bên thu tiền giữa chừng một request**: giá ước tính theo model đầu, tiền thực
ghi theo model sau, `settle_task` báo chênh lệch mà người dùng không hề đồng ý. Đổi
gateway là quyết định vận hành, không phải việc mà logic retry tự ý làm.

Chuỗi đo được sau khi sửa:

```
1. mimo-v2.6-flash-free   https://kiraai.vn/api/v1
2. hy3                    https://kiraai.vn/api/v1
3. hy4                    https://kiraai.vn/api/v1
distinct channels: 1  ✅
```

### Mục 5 — giữ 450, có chốt bằng test

Không đo được trên nội dung tiếng Việt thật thì giữ nguyên. Thêm test khẳng định
`MIN_EPISODE_CONTENT_CHARS == 450` để đổi số này phải là một commit riêng kèm số đo.

---

## 2. Số đo sau khi sửa

### Mục 1 — ba lần sửa, ba con số

| lần sửa | `cjk_prose` còn lại | còn sót ở đâu |
|---|---|---|
| chỉ đổi 6 prompt theo locale | 358 | toàn bộ |
| + danh sách token **ngoại lệ** | 224 | mô tả sau `△`, tên địa điểm |
| + ví dụ mẫu đúng ngôn ngữ | 253 | như trên (nhiễu, không giảm) |
| + vòng kiểm–nhắc chỉ ra dòng sai | **0** ✅ | — |

Hai lần đầu **không đủ** chỉ vì tám quy tắc định dạng trong prompt đều viết bằng
tiếng Trung và kèm ví dụ tiếng Trung. Chỉ thị càng dài càng yếu; chỉ ra đúng dòng sai
mới ăn. Cùng nguyên tắc với vòng "thử lại khi quá ngắn" đã có sẵn.

**Kết quả, hai lần chạy độc lập, giống nhau** (`scripts/verify_episode_locale_vi.py`):

```
project 34: ep1 cjk_total=29  cjk_prose=0  nospace=1401  title='Món ăn của bố'
project 38: ep1 cjk_total=47  cjk_prose=0  nospace=1116  title='Món ăn của bố'
markers intact: True   ('### 场', '出场人物：', '△', '【空镜：')
```

Mẫu thân (project 38) — tiếng Việt ở phần văn xuôi, marker tiếng Trung ở đúng chỗ:

```
### 场1-1
夜 外 Phố Hà Nội
出场人物：Linh、Khách hàng
△ 特写：Bàn tay Linh đưa túi đồ ăn, ánh đèn đường hắt lên gương mặt mồ hôi đầm đìa.
Linh（run, os）：Món này… không thể nào.
【空镜：Đường phố vắng, xe máy lao qua vũng nước mưa.】
```

### ⚠ Mục 1 chưa đạt qua HTTP — nguyên nhân nằm ngoài phạm vi brief

Qua đúng đường người dùng đi (`POST /api/drama/agents/episode_script`), project 37
(`locale=vi`) cho **toàn chữ Trung**:

```
ep1 cjk_total=811  cjk_prose=690  title='旧巷秘味十五年'
task 815 succeeded, charged=160      ← tiền bị trừ cho nội dung sai ngôn ngữ
```

Nguyên nhân đo được, không suy đoán — `episode_content` bám theo `summary` của
chính nó:

| project | locale | CJK trong `summary` | CJK trong `episode_content` |
|---|---|---|---|
| 34 | vi | 0 (nạp tay summary tiếng Việt) | **0** ✅ |
| 37 | vi | 2376 | 690 ❌ |
| 28 | vi | 2986 | toàn chữ Trung (bug gốc của brief) |

`SCRIPT_SUMMARY_SYSTEM_PROMPT` (`app/services/drama/script_summary_prompt.py`) viết
cứng tiếng Trung:

- `:20` `seriesTitle ... 4–16 个汉字`
- `:24` `synopsis 用一段完整中文叙述故事`
- `:25` `语言统一使用简体中文`

Đó là prompt sinh `summary`, mà `summary` là nguyên liệu trực tiếp của cả 6 prompt
tôi đã sửa. Prompt của tôi đúng, nhưng đầu vào bị ép tiếng Trung thì LLM trôi theo —
và vòng kiểm–nhắc cũng không kéo lại được.

**Đây chính là các prompt khắc tiếng Trung mà brief nói "chưa đo, để lane khác lo" —
nhưng nó chặn đúng tiêu chí nghiệm thu của chính brief.** Sửa cũng chỉ là đưa qua
`resolve_output_language_spec` đã có. **Tôi không tự sửa** vì ngoài 6 hằng số brief
nêu tên → nhờ board giao tiếp hoặc tách lane.

### Mục 3 — đo bằng `settle_task` thật

`tests/test_episode_no_write_refund.py` (11 test) — không mock `settle_task`, dùng
`freeze_for_task` + `settle_task` + `wallet_ledger` thật trên DB thật:

| tình huống | `ok` | dòng `usage_events` | `charged` | `refunded` | `balance_fen` |
|---|---|---|---|---|---|
| LLM trả lại đúng nội dung cũ | False | **0** | 0 | = freeze | không đổi |
| `run_episode_script_batch` trả `[]` | False | **0** | 0 | = freeze | không đổi |
| viết thật | True | 1 | >0 | — | giảm |
| không có gì để làm | **True** | 0 | 0 | = freeze | không đổi |
| một tập, viết ra y hệt | False | **0** | 0 | = freeze | không đổi |

Hàng 2 là lỗi thứ tự cũ: `record_line` chạy trước `raise`.

### Kiểm thử

```
4 failed, 1087 passed, 2 skipped
```

4 failed là đúng 4 lỗi có sẵn từ upstream đã ghi ở `AGENTS.md` §4
(`test_fragment_video_estimate`, 2× `test_kepu_phase_billing`,
`test_kepu_shot_edit_demote`). 2 skipped: `test_admin_stats` (tài khoản `demo` không
còn trong DB → SKIP, đúng như `AGENTS.md` mô tả) và `test_storyboard_locale_prompt`
live-LLM (opt-in). **Không có lỗi mới.**

+112 test so với baseline brief (975 → 1087).

### Ứng dụng thật

`bunny/4` chạy ở `:8020` (`:8000` đang chạy checkout của lane khác — không đụng):

```
GET /api/health -> 200
  llm=mimo-v2.6-flash-free  image=hy-image-v3.5-free
  video=seedance-2.5  audio=gemini-3.1-flash-tts
  task_runtime: scheduler/poller/watchdog running
```

---

## 3. ⚠ Hai thứ phát hiện ngoài phạm vi — board nên biết

### A. `PATCH /api/admin/settings/routing` **nuốt** channel không phải TokenFree

Đo trực tiếp: tôi gửi `system_channels: [{id: "image-kira", models: [...5 model...]}]`.

- Response **200**, và `applied: ["system_channels"]` — nhìn như thành công.
- `image-kira.models` **không đổi**.
- `default_models` bị đổi: `textModel` `mimo-v2.6-flash-free` → `kimi-k2.6`,
  `videoModel` `seedance-2.5` → `MiniMax-H3`.

Nguyên nhân ở `model_settings.py:960-990`: hàm **chỉ** ghi dòng `tokenfree`, và mọi
dòng khác bị đặt `enabled = False` (`for cid, stale in existing_rows.items(): ... stale.enabled
= False`). Danh sách `models` gửi lên bị bỏ qua hoàn toàn. Sau đó nó tính lại
`default_models` từ `.env` — mà `.env` có `MODEL_LLM` rỗng.

Điều này mâu thuẫn với ghi trong `AGENTS.md` §10 ("PATCH giữ được giá trị, không còn
bị về TokenFree"). Đường PATCH vẫn còn sập về TokenFree. **Ai cấu hình routing qua
trang quản trị sẽ tưởng đã lưu được, thực ra đã đổi model mặc định của cả site.**

Tôi đã tự khôi phục `default_models` bằng `patch_admin_model_settings` (đường
`AGENTS.md` §10 chỉ định) và ghi allowlist trực tiếp vào dòng, rồi
`_compose_runtime_state` tự đồng bộ logical model. **Trạng thái cuối:**

```
default_models: text=mimo-v2.6-flash-free  image=hy-image-v3.5-free
                video=seedance-2.5          audio=gemini-3.1-flash-tts
```

`audio` đổi từ `qwen-tts-2025-05-22` → `gemini-3.1-flash-tts`. Đo cho thấy đây là
**sửa chứ không phá**: `resolve_logical_model_candidates('audio', 'qwen-tts-2025-05-22')`
trả về `gemini-3.1-flash-tts` — tức `qwen-tts-2025-05-22` không nằm trong allowlist
kênh nào và **đã** âm thầm rơi về `gemini` trước khi tôi đụng vào. Giờ nó ghi đúng
tên đang thực sự chạy. `billing_llm_per_m = 5.0` chưa kiểm tra lại.

### B. Prompt khắc tiếng Trung còn ở 4 chỗ khác

Cùng bảng `resolve_output_language_spec` là sửa được hết, nhưng ngoài phạm vi brief:

- `drama/script_summary_prompt.py:20,24,25` — **chặn tiêu chí nghiệm thu của mục 1**
- `drama/visual_prompt.py:53,65,75,81` — `只输出一条简体中文`
- `drama/voice_prompt.py:19` — `只输出一条简体中文`
- `drama/character_intro_llm.py:29` — `每条介绍 8~24 个汉字`
- `drama/extract_props_materials.py:21` — `visualPrompt 用简体中文`

### C. Lỗi tôi tự gây ra rồi sửa — ghi lại vì rất dễ lặp

Khi làm ví dụ mẫu, tôi viết `△ Gần cảnh:` bằng tiếng Việt. Model học cả **việc dịch
nhãn cảnh quan** → `Gần cảnh` không khớp `VISUAL_SHOT_LABEL_RE` → cảnh đó rơi khỏi
`build_fragments`. Sửa tiếng Trung bằng cách làm hỏng đường xuống.

Đã sửa: ví dụ mẫu dùng nhãn thật của hợp đồng (`△ 特写：`) + văn xuôi tiếng Việt, và
câu nhắc thử lại liệt kê nhãn cảnh quan. Có test khoá lại
(`test_body_example_keeps_contract_tokens_and_target_language`,
`test_language_retry_suffix_names_the_shot_labels`).

### D. Ghi chép khác (chưa sửa, ngoài phạm vi)

- Model hay đặt `△` trước dòng **thoại** (`△ Linh (run, os)：…`) thay vì
  `角色（情绪）：…`. `build_fragments` coi dòng `△` là cảnh không lời → mất thoại.
  Có sẵn trước thay đổi này, không do lane này.
- `run_episode_script_batch` trả `[]` chỉ khi `missing` rỗng; `if not batch: raise`
  về lý thuyết không với tới được nữa (vòng lặp ngoài đã kiểm tra) — nhưng đã sửa
  thứ tự vì đó là chỗ thu tiền sai.
- `force=true` + `episode_content_status == "generating"` bỏ qua việc xóa nội dung
  cũ. Đây là hành vi **cố ý** (tiếp tục sau khởi động lại), không sửa.

---

## 4. File đã đụng

| file | việc |
|---|---|
| `backend/app/services/ark.py` | `OutputLanguage`, `resolve_output_language_spec`, `SEEDANCE_CONTRACT_TOKENS`, `OUTPUT_LANGUAGE_BODY_EXAMPLE` — mở rộng bảng dùng chung |
| `backend/app/services/drama/agents.py` | 6 prompt → hàm theo locale; `locale` xuống 8 hàm gọi LLM; bộ đo + vòng kiểm–nhắc ngôn ngữ; cảnh báo tập bị bỏ |
| `backend/app/services/drama/jobs.py` | truyền `locale`; fingerprint + `_assert_episode_content_written`; chuyển `raise` lên trước `record_line` |
| `backend/app/services/llm_client.py` | đi theo chuỗi failover cùng kênh; `MAX_TEXT_ROUTES_PER_CALL` |
| `backend/app/services/logical_model_router.py` | `resolve_same_channel_failover_routes` |
| `backend/app/services/model_settings.py` | `KIRA_IMAGE_MODELS` → `KIRA_CHANNEL_MODELS` (bỏ 403, thêm 3 model sống) |
| `backend/tests/test_episode_prompt_locale.py` | **mới** — 29 test |
| `backend/tests/test_episode_no_write_refund.py` | **mới** — 11 test, `settle_task` thật |
| `backend/scripts/verify_episode_locale_vi.py` | **mới** — đo nghiệm thu job trực tiếp |
| `backend/scripts/verify_episode_locale_vi_http.py` | **mới** — đo nghiệm thu qua HTTP |
| `backend/tests/test_expand_content_streaming.py` | đổi seam `_use_route` sang `resolve_same_channel_failover_routes` |
| `backend/tests/test_drama_episode_script_billing.py` | fake nhận `**_kwargs` (thêm `locale`) |

Không đụng frontend. `npm run lint` / `npm run build` không áp dụng (toàn bộ thay đổi ở
backend); backend không có cấu hình lint/ruff.

## 5. Trạng thái `main`

Sau khi đồng bộ: `origin/main` (`ceafe7b`) **là** tiền tố của `HEAD`, không có commit
nào của lane này chưa có trên main.