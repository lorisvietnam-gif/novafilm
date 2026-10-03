"""Đường `episode_script` phải tôn trọng locale, và phải **nói ra** khi nó viết rác.

Đo trước khi sửa (2026-10-03, database thật của lane):
  - project 28 tạo với `params.locale = "vi"`, 6/6 tập trong `episode_content` toàn
    chữ Trung: ep1 cjk=894 · ep2 cjk=1010 · ep3 cjk=1126 · ep4 cjk=1064 · ep5 cjk=889 ·
    ep6 cjk=1034. Cùng lúc `content/expand` với `locale=vi` ra đúng tiếng Việt.
  - Nguyên nhân: bản vá locale trước (28af98f) chỉ sửa `ark.py`, còn sáu prompt của
    `episode_script` là **hằng số cấp module** trong `agents.py` với `语言使用简体中文`
    và `450-600 汉字` viết cứng.
  - project 17 có đúng 1 tập `episodeNumber=None`; `merge_episode_bodies` và
    `auto_missing_episode_numbers` nuốt nó không một dòng log.

Vì sao cả `语言使用…` lẫn `汉字` đều phải đi: đổi câu chỉ thị mà để lại `汉字` thì
LLM vẫn bị kéo về tiếng Trung — nó đọc "khoảng 550 汉字" như một yêu cầu viết bằng
chữ Hán. Nên test khóa **cả hai**.
"""

from __future__ import annotations

import logging
import re

import pytest

from app.services.ark import (
    _OUTPUT_LANGUAGE_LENGTH_UNITS,
    _OUTPUT_LANGUAGE_NAMES,
    resolve_output_language_spec,
)
from app.services.drama import agents

CJK_RE = re.compile(r"[\u4e00-\u9fff]")

BUILDERS = (
    "episode_outline_system",
    "episode_batch_content_system",
    "episode_optimize_system",
    "episode_summary_from_creative_system",
    "episode_body_from_brief_system",
    "episode_brief_from_body_system",
)

# Marker Seedance là hợp đồng máy↔máy. Chúng là tiếng Trung ở **mọi** locale.
SEEDANCE_MARKERS = ("### 场", "出场人物：", "△", "【空镜：", "vo", "os")
# Chỉ ba prompt sinh **nội dung** mới có khung dài 450-600 và marker cảnh.
BODY_BUILDERS = (
    "episode_batch_content_system",
    "episode_optimize_system",
    "episode_body_from_brief_system",
)


# --- bảng ngôn ngữ: một nguồn sự thật -------------------------------------------


def test_episode_prompts_reuse_the_ark_language_table():
    """Sáu prompt của `episode_script` phải lấy tên ngôn ngữ từ bảng của `ark.py`.

    Bảng riêng ở `agents.py` là hai nguồn sự thật — chúng sẽ trôi lệch nhau sau vài
    lần sửa, và không ai nhận ra vì mọi test offline vẫn xanh.
    """
    assert set(_OUTPUT_LANGUAGE_NAMES) == {"zh", "vi", "en"}
    assert set(_OUTPUT_LANGUAGE_LENGTH_UNITS) == set(_OUTPUT_LANGUAGE_NAMES)
    for lang in _OUTPUT_LANGUAGE_NAMES:
        spec = resolve_output_language_spec(lang, default="vi")
        assert spec.code == lang
        assert spec.name == _OUTPUT_LANGUAGE_NAMES[lang]
        assert spec.directive, f"{lang} phải có câu chỉ thị"
        assert spec.length_unit, f"{lang} phải có đơn vị đo dài"


@pytest.mark.parametrize("locale", ["vi", "en", "", "xx-Latn"])
def test_non_chinese_locales_never_ask_for_chinese_output(locale: str):
    """Không locale nào khác `zh` được phép để lại `语言使用…` hay `汉字`."""
    for name in BUILDERS:
        text = getattr(agents, name)(locale)
        assert "语言使用" not in text, f"{name}({locale!r}) vẫn ép tiếng Trung"
        assert "汉字" not in text, (
            f"{name}({locale!r}) vẫn yêu cầu đếm 汉字 — "
            "đây là câu lệnh sai, và nó kéo nội dung về tiếng Trung"
        )
        assert "__LENGTH_UNIT__" not in text, f"{name}({locale!r}) còn placeholder sót"
        assert "__LANGUAGE_DIRECTIVE__" not in text, f"{name}({locale!r}) còn placeholder sót"


def test_zh_prompts_keep_the_original_wording():
    """`locale="zh"` phải trả lại đúng câu cũ — không phải dịch người dùng Trung."""
    spec = resolve_output_language_spec("zh", default="vi")
    for name in BUILDERS:
        text = getattr(agents, name)("zh")
        assert "语言使用" in text, f"{name} mất câu chỉ thị tiếng Trung"
        assert spec.length_unit in text, f"{name} mất đơn vị đo 汉字"
    # Khung dài 450-600 chỉ có ở ba prompt sinh nội dung; prompt dàn tập chỉ đặt tên tập.
    for name in BODY_BUILDERS:
        assert "450-600 汉字" in getattr(agents, name)("zh"), (
            f"{name} đổi khung dài của tiếng Trung"
        )


def test_vietnamese_prompt_names_the_language_and_drops_the_hanzi_unit():
    text = agents.episode_batch_content_system("vi")
    assert "tiếng Việt" in text
    assert "450-600 ký tự" in text, "khung dài phải đổi sang đơn vị của tiếng Việt"


def test_seedance_markers_stay_chinese_in_every_locale():
    """Dịch marker là dịch hợp đồng máy↔máy, không phải dịch nội dung."""
    for locale in ("zh", "vi", "en"):
        for name in BODY_BUILDERS:
            text = getattr(agents, name)(locale)
            for marker in SEEDANCE_MARKERS:
                assert marker in text, f"{name}({locale!r}) mất marker {marker!r}"


def test_prompt_keeps_the_literal_json_skeleton():
    """Template có ngoặc `{` `}` kiểu JSON — `.format()` sẽ ăn mất chúng."""
    for locale in ("zh", "vi", "en"):
        text = agents.episode_batch_content_system(locale)
        assert '{"episodes":[{"episodeNumber":' in text
        assert '"content":"..."}]}' in text


def test_marker_clause_is_an_exception_list_not_a_target_list():
    """Câu ép ngôn ngữ phải **liệt kê cái không được dịch**, không liệt kê cái được dịch.

    Đo thật: lần sửa đầu tiên viết "áp dụng cho cả tiêu đề, tên tập, tóm tắt và lời
    thoại" — một danh sách đóng. LLM đọc đúng nghĩa đen và bỏ nguyên phần còn lại:
    mô tả sau △ và tên địa điểm vẫn ra tiếng Trung. Danh sách "được phép dịch" không
    bao giờ đủ; phải là danh sách ngoại lệ.
    """
    from app.services.ark import SEEDANCE_CONTRACT_TOKENS

    spec = resolve_output_language_spec("vi", default="vi")
    # Phải nêu đúng ba loại nội dung đo ra còn tiếng Trung.
    assert "△" in spec.directive or "△" in spec.marker_clause
    for hint in ("mô tả hành động", "tên địa điểm", "lời thoại"):
        assert hint in spec.directive, f"thiếu định hướng cho: {hint}"
    # Và phải nêu token cấm dịch.
    for token in ("### 场", "出场人物：", "【空镜", "@duration:N"):
        assert token in spec.marker_clause, f"token {token!r} không có trong danh sách cấm dịch"
    assert len(SEEDANCE_CONTRACT_TOKENS) >= 10
    # Ví dụ tiếng Trung trong prompt không được biến thành mẫu để sao chép.
    assert "ví dụ về hình thức" in spec.marker_clause


def test_zh_gets_no_marker_clause():
    """Với tiếng Trung thì "đừng dịch marker" là vô nghĩa — và câu cũ phải giữ nguyên."""
    spec = resolve_output_language_spec("zh", default="vi")
    assert spec.marker_clause == ""
    text = agents.episode_batch_content_system("zh")
    assert "语言使用简体中文" in text
    assert "唯一例外" not in text


def test_translatable_cjk_helper_separates_markers_from_prose():
    """Đo "0 ký tự Trung" phải bỏ qua marker, nếu không con số này vô nghĩa.

    Marker Seedance là tiếng Trung **theo hợp đồng** ở mọi locale, nên đếm cả chúng
    vào thì đúng 100% cũng bị coi là hỏng. `frontend/scripts/visual-audit.mjs` đã
    tách hai thứ này ra làm vậy (SEEDANCE_META_PREFIXES); `agents.translatable_prose`
    làm cùng việc cho đường `episode_script`.
    """
    body = (
        "### 场1-1\n"
        "夜 外 Hà Nội\n"
        "出场人物：Linh\n"
        "△ 特写：Cô bấm điện thoại, mắt mở to.\n"
        "Linh (os): Món này bố từng nấu.\n"
        "【空镜：Nước sôi trào trên nắp nồi.】\n"
    )
    assert agents.count_translatable_cjk(body) == 0
    assert CJK_RE.search(body) is not None, "marker vẫn phải là tiếng Trung"


def test_translatable_cjk_counts_the_label_but_not_its_prose():
    """Nhãn cảnh quan là marker, phần sau `：` là văn xuôi — tách đúng ranh giới."""
    with_label = "△ 特写：Cô bấm điện thoại.\n"
    without_label = "△ Cô bấm điện thoại.\n"
    assert agents.count_translatable_cjk(with_label) == 0
    assert agents.count_translatable_cjk(without_label) == 0
    chinese_prose = "△ 特写：Cô bấm điện thoại，眼睛睁大。\n"
    assert agents.count_translatable_cjk(chinese_prose) > 0, (
        "chữ Hán nằm sau nhãn cảnh quan là lỗi và phải bị đếm"
    )


def test_translatable_cjk_flags_a_chinese_location_name():
    """Tiền tố `夜 外` là marker; **tên địa điểm sau nó** thì phải được đếm."""
    assert agents.count_translatable_cjk("夜 外 Hà Nội\n") == 0
    assert agents.count_translatable_cjk("夜 外 河内街道\n") > 0


def test_find_chinese_prose_lines_points_at_the_offending_lines():
    body = (
        "### 场1-1\n"
        "夜 外 Phố cổ\n"
        "出场人物：Linh\n"
        "△ 特写：Cô cúi xuống, miệng hơi há，眼睛睁大。\n"
        "Linh（os）：Món này…\n"
        "夜 外 河内街道\n"
    )
    offenders = agents.find_chinese_prose_lines(body)
    assert len(offenders) == 2, offenders
    assert any("Cô cúi xuống" in o for o in offenders), "dòng hành động tiếng Trung phải bị chỉ ra"
    assert any("河内街道" in o for o in offenders), "tên địa điểm tiếng Trung phải bị chỉ ra"
    # Dòng thoại đã đúng thì không bị báo.
    assert not any("Món này" in o for o in offenders)


def test_find_chinese_prose_lines_is_quiet_on_a_clean_body():
    clean = (
        "### 场1-1\n"
        "夜 外 Phố cổ\n"
        "出场人物：Linh\n"
        "△ 特写：Cô cúi xuống, miệng hơi há.\n"
        "Linh（os）：Món này…\n"
        "【空镜：Bóng cây đổ trên bàn ghế.】\n"
    )
    assert agents.find_chinese_prose_lines(clean) == []


def test_language_retry_suffix_names_the_shot_labels():
    """Câu nhắc phải giữ nhãn cảnh quan, nếu không model dịch luôn `特写`.

    Đo thật: một lần sửa đầu dùng ví dụ mẫu `△ Gần cảnh:` và model học cả việc dịch
    nhãn — `Gần cảnh` không khớp `VISUAL_SHOT_LABEL_RE` nên cảnh đó rơi khỏi
    `build_fragments`. Sửa tiếng Trung bằng cách làm hỏng đường xuống là thay đổi
    tệ hơn bug ban đầu.
    """
    body = "△ 特写：Cô cúi xuống, miệng hơn há，眼睛睁大。"
    suffix = agents._language_retry_suffix("vi", body)
    assert "特写" in suffix, "phải nhắc giữ nhãn cảnh quan"
    assert "Gần cảnh" not in suffix
    assert "Cô cúi xuống" in suffix, "phải chỉ ra đúng dòng sai"
    # locale=zh thì không có gì để nhắc.
    assert agents._language_retry_suffix("zh", body) == ""


def test_body_example_keeps_contract_tokens_and_target_language():
    """Ví dụ mẫu là thứ model bắt chước mạnh nhất — nó phải đúng ở cả hai mặt."""
    from app.services.ark import SEEDANCE_CONTRACT_TOKENS

    for lang in ("zh", "vi", "en"):
        example = resolve_output_language_spec(lang, default="vi").body_example
        for token in ("### 场", "出场人物：", "△", "【空镜"):
            assert token in example, f"ví dụ {lang} mất token {token}"
        # Nhãn cảnh quan phải là token thật của VISUAL_SHOT_LABEL_RE, không phải bản dịch.
        assert re.search(r"△\s*(?:特写|近景|中景|全景|远景)\s*[：:]", example), (
            f"ví dụ {lang} phải dùng nhãn cảnh quan tiếng Trung đúng hợp đồng"
        )
        for token in SEEDANCE_CONTRACT_TOKENS:
            assert token.strip(), "danh sách token không được có mục rỗng"


# Đo thật 2026-10-03, project 43 (locale=vi, job path), ngay **sau** khi user message đã
# được dịch: `cjk_prose` của 3 tập là 6, 0, 0 — và cả 6 ký tự đều nằm trên dòng bối
# cảnh: `夜 外 老街`, `夜 外 旧巷`, `夜 内 老宅`. `夜 外` là marker (được giữ), còn `老街`
# là tên địa điểm và là **văn xuôi**. Nó ra tiếng Trung vì quy tắc 2 của system prompt
# liệt kê ví dụ địa điểm tiếng Trung.
@pytest.mark.asyncio
async def test_retry_result_is_merged_not_swapped_in(monkeypatch):
    """Thử lại không phải lúc nào cũng hơn — phải lấy **bản tốt hơn của từng tập**.

    Đo thật 2026-10-03 (project 44, locale=vi): lần một có 30 ký tự Hán, thử lại trả về
    một dòng nữa lẫn Trung **và** làm hỏng marker (`夜 夅` thay vì `夜 外`). Thay thẳng
    bản mới là ném đi bản cũ; với batch nhiều tập thì còn ném cả những tập vốn đã sạch.
    """
    # Dùng `\n` vì `_SHOT_LABEL_RE` chỉ bỏ nhãn cảnh quan ở **đầu dòng**.
    long_clean = "△ 特写：Cô cúi xuống món ăn, mắt cô lấp lánh.\n" * 20
    long_dirty = "△ 特写：Cô cúi xuống，眼睛睁大，很久说不出话。\n" * 20
    assert agents.count_translatable_cjk(long_clean) == 0
    assert agents.count_translatable_cjk(long_dirty) > 0
    assert len("".join(long_dirty.split())) >= agents.MIN_EPISODE_CONTENT_CHARS

    replies = [
        # Lần một: tập 1 sạch, tập 2 bẩn.
        {
            "episodes": [
                {"episodeNumber": 1, "content": long_clean},
                {"episodeNumber": 2, "content": long_dirty},
            ]
        },
        # Thử lại: tập 1 bẩn, tập 2 sạch.
        {
            "episodes": [
                {"episodeNumber": 1, "content": long_dirty},
                {"episodeNumber": 2, "content": long_clean},
            ]
        },
    ]
    seen: list[str] = []

    async def fake_chat(_system: str, user: str, **_kwargs):
        seen.append(user)
        return replies[min(len(seen) - 1, len(replies) - 1)]

    monkeypatch.setattr(agents, "drama_chat_json", fake_chat)
    out = await agents.run_episode_script_batch(
        {"episodeCount": 2},
        [{"episodeNumber": 1, "body": ""}, {"episodeNumber": 2, "body": ""}],
        batch_size=2,
        total=2,
        locale="vi",
    )

    assert len(seen) == 2, "phải thử lại đúng một lần"
    by_number = {int(item["episodeNumber"]): str(item.get("body") or "") for item in out}
    assert by_number[1] == long_clean.strip(), "tập 1 đã sạch thì không được đổi lấy bản bẩn"
    assert by_number[2] == long_clean.strip(), "tập 2 bẩn thì phải lấy bản sạch của lần thử lại"


@pytest.mark.asyncio
async def test_retry_cannot_downgrade_a_long_body_to_a_short_one(monkeypatch):
    """Lần thử lại ngắn hơn ngưỡng không được làm hỏng bản dài đã có.

    Bản ngắn bị `auto_missing_episode_numbers` coi là chưa xong, nên nhận nó cũng là
    tự tạo một vòng lặp sinh lại — đúng cái đã làm task 821 mất tiền oan.
    """
    long_dirty = "△ 特写：Cô cúi xuống，眼睛睁大，很久说不出话。\n" * 30
    assert len("".join(long_dirty.split())) >= agents.MIN_EPISODE_CONTENT_CHARS
    replies = [
        {"episodes": [{"episodeNumber": 1, "content": long_dirty}]},
        {"episodes": [{"episodeNumber": 1, "content": "△ 特写：Cô cúi xuống."}]},
    ]
    seen: list[str] = []

    async def fake_chat(_system: str, user: str, **_kwargs):
        seen.append(user)
        return replies[min(len(seen) - 1, len(replies) - 1)]

    monkeypatch.setattr(agents, "drama_chat_json", fake_chat)
    out = await agents.run_episode_script_batch(
        {"episodeCount": 1},
        [{"episodeNumber": 1, "body": ""}],
        total=1,
        locale="vi",
    )

    assert len(seen) == 2, "phải thử lại đúng một lần"
    assert str(out[0].get("body") or "") == long_dirty.strip(), (
        "bản dài của lần một phải được giữ, không đổi lấy bản ngắn của lần thử lại"
    )


_LOCATION_FIELDS = (
    "location_example_batch",
    "location_example_optimize",
    "location_example_body",
)

# Ba system prompt vốn đã có ba ví dụ địa điểm khác nhau; gộp lại một sẽ đổi prompt
# của người dùng tiếng Trung. Khóa từng chuỗi để việc gộp đó phải là một chủ ý.
_ZH_LOCATION_EXAMPLES = {
    "location_example_batch": "日 内 灵山大雄宝殿 / 夜 外 妖寨大门外 / 晨外 羽山刑场",
    "location_example_optimize": "日 内 教室 / 夜 外 天台",
    "location_example_body": "日 内 教室 / 夜 外 天台 / 晨外 操场",
}


def test_chinese_location_examples_are_preserved_verbatim():
    zh = resolve_output_language_spec("zh", default="zh").episode
    for field, expected in _ZH_LOCATION_EXAMPLES.items():
        assert getattr(zh, field) == expected, f"{field} của zh bị đổi"


def test_location_examples_keep_the_time_tokens_and_drop_chinese_prose():
    """Tiền tố `日/内/外` là hợp đồng; phần sau nó là tên địa điểm và phải theo locale."""
    for lang in ("zh", "vi", "en"):
        episode = resolve_output_language_spec(lang, default="vi").episode
        for field in _LOCATION_FIELDS:
            value = getattr(episode, field)
            assert re.search(r"[日晨晚夜]\s*(?:内|外)", value), f"{lang}.{field} mất token 日/夜 + 内/外"
            if lang != "zh":
                # Đo phần **sau** token, không đo cả dòng.
                tail = value.split("晨外")[-1].split("夜 外")[-1].split("日 内")[-1]
                assert not CJK_RE.search(tail), (
                    f"{lang}.{field} còn tên địa điểm tiếng Trung: {tail!r}"
                )


def test_location_example_actually_reaches_the_system_prompts():
    """Không được để lại `__LOCATION_EXAMPLE…__` trong prompt đã dựng."""
    for lang in ("zh", "vi", "en"):
        for builder in (
            agents.episode_batch_content_system,
            agents.episode_optimize_system,
            agents.episode_body_from_brief_system,
        ):
            text = builder(lang)
            assert "__LOCATION_EXAMPLE" not in text, f"{builder.__name__}({lang}) còn token thô"
            assert re.search(r"[日晨晚夜]\s*(?:内|外)", text)


@pytest.mark.asyncio
async def test_batch_retries_when_the_prose_is_still_chinese(monkeypatch):
    """Chỉ thị không đủ; phải có vòng kiểm–nhắc với đúng dòng sai.

    Đo thật trên `mimo-v2.6-flash-free`, locale=vi: có đủ câu chỉ thị + danh sách token
    cấm dịch + ví dụ mẫu, mô tả sau △ vẫn tiếng Trung (224 ký tự Hán). Chỉ khi chỉ ra
    từng dòng sai thì mới ra 0.

    Thân hai bản phải **đủ dài**: `short_or_missing_episodes` coi tập ngắn là chưa
    viết xong và ném lỗi, nên một thân ngắn sẽ khiến test vấp nhầm chỗ khác.
    """
    chinese = "△ 特写：Cô cúi xuống, miệng hơn há，眼睛睁大。" + "Linh nhìn xuống món ăn. " * 40
    bodies = [chinese, "△ 特写：Cô cúi xuống, miệng hơn há." + "Linh nhìn xuống món ăn. " * 40]
    seen: list[str] = []

    async def fake_chat(_system: str, user: str, **_kwargs):
        seen.append(user)
        return {"episodes": [{"episodeNumber": 1, "content": bodies[len(seen) - 1]}]}

    monkeypatch.setattr(agents, "drama_chat_json", fake_chat)
    await agents.run_episode_script_batch(
        {"episodeCount": 1},
        [{"episodeNumber": 1, "title": "T1", "body": "ngắn"}],
        total=1,
        locale="vi",
    )

    assert len(seen) == 2, "phải thử lại đúng một lần"
    retry_user = seen[1]
    assert "tiếng Trung" in retry_user
    assert "Cô cúi xuống" in retry_user, "phải trích nguyên dòng sai"
    assert "特写" in retry_user, "phải nhắc giữ nhãn cảnh quan"


@pytest.mark.asyncio
async def test_batch_does_not_retry_a_clean_body(monkeypatch):
    """Không có chữ Hán sót thì không tốn thêm một lần gọi LLM nào."""
    calls = 0

    async def fake_chat(_system: str, _user: str, **_kwargs):
        nonlocal calls
        calls += 1
        return {"episodes": [{"episodeNumber": 1, "content": "Viet " * 300}]}

    monkeypatch.setattr(agents, "drama_chat_json", fake_chat)
    await agents.run_episode_script_batch(
        {"episodeCount": 1},
        [{"episodeNumber": 1, "title": "T1", "body": "ngắn"}],
        total=1,
        locale="vi",
    )

    assert calls == 1, f"không được gọi thừa, đã gọi {calls} lần"


@pytest.mark.asyncio
async def test_batch_does_not_retry_chinese_when_locale_is_chinese(monkeypatch):
    """`locale="zh"` thì chữ Hán là **đúng**, không được nhắc gì cả."""
    calls = 0

    async def fake_chat(_system: str, _user: str, **_kwargs):
        nonlocal calls
        calls += 1
        return {"episodes": [{"episodeNumber": 1, "content": "她抬头。" * 120}]}

    monkeypatch.setattr(agents, "drama_chat_json", fake_chat)
    await agents.run_episode_script_batch(
        {"episodeCount": 1},
        [{"episodeNumber": 1, "title": "第一集", "body": "短"}],
        total=1,
        locale="zh",
    )

    assert calls == 1


def test_unknown_locale_falls_back_to_vietnamese_not_chinese():
    """Sản phẩm này là tiếng Việt; rơi về tiếng Trung là đẩy lỗi cho người dùng."""
    for name in BUILDERS:
        text = getattr(agents, name)("zz")
        assert "tiếng Việt" in text
        assert "语言使用" not in text


# --- đường LLM phải nhận locale ------------------------------------------------


@pytest.mark.asyncio
async def test_batch_call_passes_a_locale_aware_system_prompt(monkeypatch):
    """`run_episode_script_batch` phải gửi prompt theo locale, kể cả câu thử lại."""
    seen: list[tuple[str, str]] = []

    async def fake_chat(system: str, user: str, **_kwargs):
        seen.append((system, user))
        return {"episodes": [{"episodeNumber": 1, "content": "x" * 600}]}

    monkeypatch.setattr(agents, "drama_chat_json", fake_chat)
    # Thân phải **dưới** ngưỡng, nếu không `auto_missing_episode_numbers` thấy không
    # thiếu tập nào và hàm trả [] trước khi gọi LLM — vô nghĩa.
    body = "Viet " * 100  # 500 ký tự có khoảng trắng -> 400 không trắng, dưới 450
    assert agents._content_char_len(body) < agents.MIN_EPISODE_CONTENT_CHARS
    await agents.run_episode_script_batch(
        {"episodeCount": 1}, [{"episodeNumber": 1, "title": "T1", "body": body}], total=1, locale="vi"
    )

    assert seen, "phải có ít nhất một lần gọi LLM"
    for system, user in seen:
        assert "语言使用" not in system
        assert "汉字" not in system
        # Câu nhấn độ dài nằm ở user message và cũng phải theo locale.
        assert "汉字" not in user
        assert "ký tự" in user

    # Câu yêu cầu viết bằng tiếng Việt phải xuất hiện ở đâu đó trong các prompt.
    assert any("tiếng Việt" in system for system, _ in seen)


@pytest.mark.asyncio
async def test_body_from_brief_retry_prompt_drops_hanzi(monkeypatch):
    """Câu "扩写至约 550 汉字" là nơi chữ 汉字 lan vào prompt thử lại."""
    seen: list[tuple[str, str]] = []

    async def fake_chat(system: str, user: str, **_kwargs):
        seen.append((system, user))
        return {"episodes": [{"episodeNumber": 1, "content": "qua ngan"}]}

    monkeypatch.setattr(agents, "drama_chat_json", fake_chat)
    await agents.run_episode_body_from_brief(
        {"logline": "x"},
        [{"episodeNumber": 1, "title": "T1", "body": ""}],
        1,
        creative="motgau cung cap du yeu 1234567890",
        summary="tom tat 0123456789012345678901234567890123456789",
        locale="vi",
    )

    assert len(seen) == 2, "phải có lần gọi thứ hai (thử lại khi quá ngắn)"
    retry_user = seen[1][1]
    assert "汉字" not in retry_user
    assert "ký tự" in retry_user


# --- item 2: tập rác phải nói ra, không biến mất im lặng -----------------------


def test_merge_logs_the_episodes_it_drops(caplog):
    """Tập bị bỏ vì `episodeNumber` thiếu thì phải có dấu vết.

    Bỏ im lặng là mất vĩnh viễn: tập không có trong danh sách thì `auto_missing…`
    không bao giờ coi là thiếu, nên cũng không bao giờ được sinh lại.
    """
    with caplog.at_level(logging.WARNING, logger="app.services.drama.agents"):
        merged = agents.merge_episode_bodies(
            [{"episodeNumber": None, "title": "Bat cua", "body": "x" * 600}],
            [{"episodeNumber": 1, "title": "E1", "body": "y" * 600}],
        )

    assert [e["episodeNumber"] for e in merged] == [1]
    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert warnings, "bỏ tập không hợp lệ mà không log là mất dấu vết"
    assert "1" in warnings[0].getMessage()
    assert "episodeNumber" in warnings[0].getMessage()


def test_auto_missing_logs_the_episodes_it_drops(caplog):
    with caplog.at_level(logging.WARNING, logger="app.services.drama.agents"):
        missing = agents.auto_missing_episode_numbers(
            [{"episodeNumber": None, "title": "Bat cua", "body": "x" * 600}],
            3,
        )

    # Tập `None` không vào `by_num`, nên tất cả 1..3 đều "thiếu" — và tập `None`
    # vẫn bị báo là đã bỏ. Đó mới là chỗ nó biến mất: không có dòng log nào cả.
    assert missing == [1, 2, 3]
    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert warnings, "tập None phải được báo đã bị bỏ"
    assert "episodeNumber" in warnings[0].getMessage()


def test_a_valid_episode_list_logs_nothing(caplog):
    """Cảnh báo phải im khi không có gì bị bỏ, nếu không log sẽ thành tiếng ồ."""
    with caplog.at_level(logging.WARNING, logger="app.services.drama.agents"):
        agents.merge_episode_bodies(
            [{"episodeNumber": 1, "title": "E1", "body": "x" * 600}],
            [{"episodeNumber": 2, "title": "E2", "body": "y" * 600}],
        )
        agents.auto_missing_episode_numbers(
            [{"episodeNumber": 1, "title": "E1", "body": "x" * 600}], 1
        )

    assert [r for r in caplog.records if r.levelno >= logging.WARNING] == []


# --- item 5: ngưỡng độ dài đo được chưa, nên chưa đổi ---------------------------


def test_min_episode_chars_stays_at_the_measured_value():
    """450 là con số **chưa** được đo lại trên nội dung tiếng Việt.

    Đổi nó lúc này là đoán. `AGENTS.md` và brief đều yêu cầu: không đo thì giữ nguyên.
    Test này để lại một cái chốt rõ ràng: đổi 450 phải là một commit riêng, kèm số đo.
    """
    assert agents.MIN_EPISODE_CONTENT_CHARS == 450
    assert agents.TARGET_EPISODE_CONTENT_CHARS == 550


def test_min_episode_chars_is_compared_with_the_whitespace_free_counter():
    """Ngưỡng phải so với `_content_char_len` (bỏ khoảng trắng), không phải `len`."""
    body = "ab " * 300  # len=900, bỏ khoảng trắng=600
    assert len(body) > agents.MIN_EPISODE_CONTENT_CHARS
    assert agents._content_char_len(body) > agents.MIN_EPISODE_CONTENT_CHARS
    assert agents._content_char_len("ab " * 100) < agents.MIN_EPISODE_CONTENT_CHARS

    source = __import__("inspect").getsource(agents.count_completed_episodes)
    assert "_content_char_len(body) >= MIN_EPISODE_CONTENT_CHARS" in source
    # `(?<![\w])` để `len` trong `_content_char_len` không khớp nhầm.
    assert not re.search(r"(?<!\w)len\(body\)\s*>=", source), (
        "so sánh ngưỡng bằng len() là đếm cả khoảng trắng — vừa thay đổi ngưỡng vừa đổi cách đếm"
    )