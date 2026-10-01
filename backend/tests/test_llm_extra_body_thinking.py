"""Gemini thinking must be capped, otherwise the answer comes back empty."""

from app.services.llm_client import _llm_extra_body


def test_gemini_25_flash_disables_thinking():
    # thinking_budget cannot be disabled with "none" on 2.5 Pro / 3, but 2.5 Flash accepts it
    assert _llm_extra_body("gemini-2.5-flash") == {"reasoning_effort": "none"}


def test_gemini_25_pro_caps_thinking_instead_of_disabling():
    # 2.5 Pro cannot turn thinking off; an invalid "none" would be rejected as 400
    assert _llm_extra_body("gemini-2.5-pro") == {"reasoning_effort": "low"}


def test_gemini_3_family_caps_thinking_instead_of_disabling():
    assert _llm_extra_body("gemini-3-flash") == {"reasoning_effort": "low"}
    assert _llm_extra_body("gemini-3.1-pro") == {"reasoning_effort": "low"}


def test_gemini_thinking_control_is_case_and_space_insensitive():
    assert _llm_extra_body("  Gemini-2.5-Flash ") == {"reasoning_effort": "none"}


def test_gemini_never_sends_kimi_style_thinking_key():
    # the kimi/deepseek wire format is not understood by Google and vice versa
    assert "thinking" not in _llm_extra_body("gemini-2.5-flash")
    assert "thinking" not in _llm_extra_body("gemini-3-pro")


def test_kimi_and_deepseek_keep_their_own_thinking_disabling():
    assert _llm_extra_body("kimi-k2.6") == {"thinking": {"type": "disabled"}}
    assert _llm_extra_body("deepseek-chat") == {"thinking": {"type": "disabled"}}


def test_other_openai_compatible_models_are_untouched():
    assert _llm_extra_body("gpt-4o") == {}
    assert _llm_extra_body("") == {}
