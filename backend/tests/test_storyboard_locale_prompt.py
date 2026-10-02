"""Prompt phân镜 phải nhận biết locale, và không được đổi cấu trúc đầu ra.

Vì sao có file test này: câu ép ngôn ngữ trong `chat_storyboard` vừa làm hai việc —
nói ngôn ngữ **và** nhắc lại danh sách trường. Ai đó "dọn nợ" bằng cách xoá cả câu thì
LLM trả về JSON không parse được, `_parse_storyboard` ném lỗi, và lỗi đó hiện ra với
người dùng là "分镜模型返回空内容" — không ai đoán ra nguyên nhân. Vì vậy test khẳng
định **cả hai** vế.

Ngoài ra: marker Seedance (`【字幕：…】`, `【BGM：…】`, `【旁白·…】`, `@duration:N`,
`空镜`) là hợp đồng máy↔máy, có parser hai đầu (`segmentDuration.ts` +
`seedance_segments.py:48-50`). Dịch chúng thì `pipeline.py:318` ném
`全部镜头旁白为空，无法配音`. Test khẳng định chúng **còn nguyên** ở mọi locale.
"""

import json
import os
import re

import pytest

from app.config import Settings
from app.services import ark as ark_mod
from app.services.ark import ArkGateway

STORYBOARD_FIELDS = (
    "title",
    "text",
    "img_prompt",
    "video_prompt",
    "camera",
    "bgm",
    "segments",
    "bgm_lock",
)
SEEDANCE_MARKERS = ("【字幕：", "【BGM：", "【旁白·", "@duration", "空镜")

STUB_REPLY = json.dumps(
    {
        "character_bible": "Mot ky su lap trinh lam viec mot minh",
        "bgm_lock": "nhe nhang",
        "shots": [
            {
                "shot": 1,
                "duration": 5,
                "title": "Mo dau",
                "subtitle": "Van de",
                "text": "AI giu lai viec lap trinh.",
                "segments": [
                    {"duration": 2, "kind": "visual", "text": "mot canh phong lam viec"},
                    {"duration": 3, "kind": "narration", "text": "AI giu lai viec lap trinh."},
                ],
                "img_prompt": "mot canh phong lam viec ban toi",
                "video_prompt": "canh phong lam viec ban toi",
                "camera": "tu tien",
                "bgm": "nhe nhang",
            }
        ],
    },
    ensure_ascii=False,
)


@pytest.fixture
def gateway(monkeypatch) -> ArkGateway:
    """Gateway **không** mock — mock sẽ đi vòng qua nhánh dựng prompt."""
    monkeypatch.setenv("ARK_API_KEY", "test-key-so-the-gateway-is-not-mock")
    return ArkGateway(
        Settings(
            ark_mock=False,
            ark_api_key="test-key-so-the-gateway-is-not-mock",
            app_env="development",
            secret_key="test-only-not-a-real-secret",
        )
    )


async def _system_prompt(gateway: ArkGateway, monkeypatch, **overrides) -> tuple[str, dict]:
    """Chạy `chat_storyboard` với LLM giả, trả về (system prompt, tham số gọi)."""
    seen: list[dict] = []

    async def fake_chat_completions(system, user, **kwargs):
        seen.append({"system": system, "user": user, "kwargs": kwargs})
        return STUB_REPLY

    monkeypatch.setattr(ark_mod, "chat_completions", fake_chat_completions)
    result = await gateway.chat_storyboard(
        source_text="AI giup gi cho cong viec",
        source_type="theme",
        style_prefix="viet duyet",
        llm_system_addon="",
        duration_min=4,
        duration_max=8,
        max_shot_duration=8,
        consistency_mode="character",
        output_ratio="16:9",
        **overrides,
    )
    assert len(seen) == 1, "chat_storyboard phai goi LLM dung mot lan"
    # JSON trả về vẫn phải parse được: đổi câu chỉ thị không được làm hỏng đầu ra.
    assert len(result.shots) == 1
    return seen[0]["system"], seen[0]["kwargs"]


@pytest.mark.asyncio
@pytest.mark.parametrize("pipeline_mode", ["full", "image_text"])
async def test_vietnamese_locale_asks_for_vietnamese(
    gateway, monkeypatch, pipeline_mode
):
    """`locale="vi"` ⇒ prompt yêu cầu tiếng Việt, không còn yêu cầu tiếng Trung."""
    system, _ = await _system_prompt(
        gateway, monkeypatch, pipeline_mode=pipeline_mode, locale="vi"
    )

    assert "tiếng Việt" in system
    assert "简体中文" not in system


@pytest.mark.asyncio
@pytest.mark.parametrize("pipeline_mode", ["full", "image_text"])
async def test_english_locale_asks_for_english(
    gateway, monkeypatch, pipeline_mode
):
    """`locale="en"` ⇒ prompt yêu cầu tiếng Anh, và không còn "cấm câu tiếng Anh"."""
    system, _ = await _system_prompt(
        gateway, monkeypatch, pipeline_mode=pipeline_mode, locale="en"
    )

    assert "must be written in English" in system
    assert "简体中文" not in system
    # Câu cũ cấm tiếng Anh trong img_prompt — với locale=en thì nó tự mâu thuẫn.
    assert "禁止英文句子" not in system


@pytest.mark.asyncio
@pytest.mark.parametrize("pipeline_mode", ["full", "image_text"])
async def test_chinese_locale_keeps_the_original_sentence(
    gateway, monkeypatch, pipeline_mode
):
    """Khách tiếng Trung phải nhận **đúng** prompt cũ, không mất một ký tự nào.

    Đây là chốt chặn hồi quy: câu ép ngôn ngữ được dịch, không được xoá.
    """
    system, _ = await _system_prompt(
        gateway, monkeypatch, pipeline_mode=pipeline_mode, locale="zh"
    )

    if pipeline_mode == "full":
        assert (
            "所有字段必须使用简体中文"
            "（包括 title、text、img_prompt、video_prompt、camera、bgm、segments）。"
        ) in system
        assert "禁止英文句子" in system
    else:
        assert "所有字段必须使用简体中文。" in system


@pytest.mark.asyncio
@pytest.mark.parametrize("pipeline_mode", ["full", "image_text"])
@pytest.mark.parametrize("locale", ["vi", "en", "zh"])
async def test_output_structure_survives_every_locale(
    gateway, monkeypatch, pipeline_mode, locale
):
    """Cấu trúc JSON không được đổi: đủ trường, đúng kiểu, đủ marker Seedance."""
    system, kwargs = await _system_prompt(
        gateway, monkeypatch, pipeline_mode=pipeline_mode, locale=locale
    )

    for field in STORYBOARD_FIELDS:
        assert field in system, f"{locale}/{pipeline_mode}: thieu truong {field}"
    assert '"character_bible":"...","shots":[...]' in system
    assert "不要 markdown" in system
    # Nhóm D: marker là hợp đồng máy↔máy, cấm dịch.
    for marker in SEEDANCE_MARKERS:
        assert marker in system, f"{locale}/{pipeline_mode}: mat marker {marker}"
    assert kwargs["response_format"] == {"type": "json_object"}


@pytest.mark.asyncio
@pytest.mark.parametrize("locale", ["", None, "fr", "VI-VN"])
async def test_missing_or_unknown_locale_falls_back_without_raising(
    gateway, monkeypatch, locale
):
    """Thiếu/lạ locale ⇒ không ném lỗi, rơi về mặc định của settings (`vi`)."""
    kwargs = {} if locale is None else {"locale": locale}
    system, _ = await _system_prompt(gateway, monkeypatch, pipeline_mode="full", **kwargs)

    assert gateway.settings.default_locale == "vi"
    assert "tiếng Việt" in system
    assert "简体中文" not in system


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("locale", "expected"),
    [
        ("zh-CN", "所有字段必须使用简体中文"),
        ("vi-VN", "tiếng Việt"),
        ("en-US", "must be written in English"),
        ("  VI  ", "tiếng Việt"),
    ],
)
async def test_region_tagged_locale_resolves_on_the_language_part(
    gateway, monkeypatch, locale, expected
):
    """`zh-CN` là locale hợp lệ, không phải locale lạ — cắt 2 ký tự như `expand_content`."""
    system, _ = await _system_prompt(gateway, monkeypatch, pipeline_mode="full", locale=locale)

    assert expected in system


@pytest.mark.asyncio
async def test_settings_default_locale_drives_the_prompt(gateway, monkeypatch):
    """Đổi `DEFAULT_LOCALE` trong settings ⇒ prompt đổi theo, không cần sửa code."""
    monkeypatch.setattr(gateway._settings_override, "default_locale", "zh")

    system, _ = await _system_prompt(gateway, monkeypatch, pipeline_mode="full")

    assert "所有字段必须使用简体中文" in system
    assert "tiếng Việt" not in system


@pytest.mark.asyncio
async def test_explicit_locale_beats_the_settings_default(gateway, monkeypatch):
    """Tham số rõ ràng phải thắng mặc định của settings."""
    monkeypatch.setattr(gateway._settings_override, "default_locale", "zh")

    system, _ = await _system_prompt(
        gateway, monkeypatch, pipeline_mode="full", locale="vi"
    )

    assert "tiếng Việt" in system
    assert "所有字段必须使用简体中文" not in system


def test_expand_content_reuses_the_same_language_table():
    """`expand_content` và `chat_storyboard` phải dùng chung một bảng ngôn ngữ.

    Hai bảng riêng là hai nguồn sự thật — chúng sẽ trôi lệch nhau sau vài lần sửa.
    """
    from app.services.ark import _OUTPUT_LANGUAGE_NAMES

    assert set(_OUTPUT_LANGUAGE_NAMES) == {"zh", "vi", "en"}
    for lang in _OUTPUT_LANGUAGE_NAMES:
        assert lang in ark_mod._EXPAND_LENGTH_RULES, (
            f"{lang} co chung ten ngon ngu nhung khong co quy tac do dai: "
            "prompt se len 'KeyError' khi expand_content chay"
        )


def test_expand_content_still_defaults_to_chinese():
    """Hành vi cũ của `expand_content` phải giữ nguyên: thiếu locale ⇒ tiếng Trung."""
    import inspect

    signature = inspect.signature(ArkGateway.expand_content)
    assert signature.parameters["locale"].default == "zh"


CJK = re.compile(r"[\u4e00-\u9fff]")


@pytest.mark.asyncio
@pytest.mark.skipif(
    os.environ.get("NOVAFILM_LIVE_LLM") != "1",
    reason="can goi nha cung cap that; bat bang NOVAFILM_LIVE_LLM=1",
)
async def test_live_model_actually_answers_in_vietnamese():
    """Đo thật: `locale="vi"` ⇒ model trả `title`/`text`/`img_prompt` bằng tiếng Việt.

    Các test offline phía trên chỉ chứng minh **prompt** yêu cầu tiếng Việt. Chứng
    minh *model nghe theo* phải gọi provider thật, nên test này mặc định tắt.

    Chạy: `NOVAFILM_LIVE_LLM=1 pytest tests/test_storyboard_locale_prompt.py -k live`

    Lưu ý khi chạy: nếu gateway rơi vào mock (`ark_api_key` rỗng và kênh trong DB chưa
    nạp) thì kết quả là **script tiếng Trung viết cứng**, không phải câu trả lời của
    model — đó chính là cái bẫy `test_expand_content_streaming.py:189` đang canh.
    """
    gateway = ArkGateway()
    if gateway.mock:
        pytest.fail(
            "gateway dang o che do mock: khong co key trong env/DB overlay. "
            "Ket qua se la mock tieng Trung chu khong phai cau tra loi cua model."
        )

    result = await gateway.chat_storyboard(
        source_text="Lam sao AI giup nguoi lam viec tiet kiem thoi gian?",
        source_type="theme",
        style_prefix="viet duyet",
        llm_system_addon="",
        duration_min=4,
        duration_max=8,
        max_shot_duration=8,
        pipeline_mode="full",
        consistency_mode="character",
        output_ratio="16:9",
        locale="vi",
    )

    assert result.shots, "LLA tra ve khong co manh nao"
    for plan in result.shots[:2]:
        for field, value in (
            ("title", plan.overlay_title),
            ("text", plan.text),
            ("img_prompt", plan.img_prompt),
        ):
            assert value.strip(), f"{field} rong"
            assert not CJK.search(value), (
                f"{field} van chua ky tu Trung: {value[:120]!r}"
            )