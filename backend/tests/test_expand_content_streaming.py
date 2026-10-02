"""Regression tests for the `script` mode rewrite.

Two things this file locks, both of which were measured, not guessed:

1. `llm_client.chat_completions` must go over the wire as a stream. The provider sits
   behind an nginx with a ~60s read timeout; a non-streaming request sends nothing until
   the model has finished, so anything slower than 60s becomes a 504. Measured: the same
   2500-character Vietnamese request returns 504 at 60.6s non-streaming and completes in
   205.6s streamed.
2. The length rule must be stated in the *output* language. The old prompt said
   "300-700 zi" -- a Chinese character unit -- in a prompt asking for Vietnamese or
   English, and the model read it as words and returned 4x the characters.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import pytest

from app.services.ark import _EXPAND_LENGTH_RULES, ArkGateway
from app.services.llm_client import (
    _read_sse_delta,
    _stream_chat,
    _upstream_error,
    chat_completions,
)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}"


def _delta(content: str = "", reasoning: str = "") -> str:
    return _sse({"choices": [{"delta": {"content": content, "reasoning_content": reasoning}}]})


# --- SSE parsing ----------------------------------------------------------------


def test_read_sse_delta_reads_content():
    assert _read_sse_delta(_delta("abc")) == ("abc", "")


def test_read_sse_delta_ignores_non_data_lines():
    # SSE sends bare "event:"/"id:" lines and blank keep-alive lines
    assert _read_sse_delta("event: message") == ("", "")
    assert _read_sse_delta("") == ("", "")
    assert _read_sse_delta(": ping") == ("", "")


def test_read_sse_delta_stops_at_done_sentinel():
    assert _read_sse_delta("data: [DONE]") == ("", "")


def test_read_sse_delta_survives_malformed_json():
    # a truncated final chunk must not kill the whole response
    assert _read_sse_delta('data: {"choices": [{"delta"') == ("", "")


def test_read_sse_delta_reads_reasoning_content():
    assert _read_sse_delta(_delta(reasoning="thinking...")) == ("", "thinking...")


def test_read_sse_delta_ignores_empty_choices():
    assert _read_sse_delta(_sse({"choices": []})) == ("", "")


# --- streaming transport --------------------------------------------------------


def _stream_transport() -> httpx.MockTransport:
    body = "\n".join([_delta("Ghép "), _delta("cà phê"), "data: [DONE]"])
    return httpx.MockTransport(
        lambda request: httpx.Response(200, text=body, headers={"content-type": "text/event-stream"})
    )


async def test_stream_chat_assembles_the_whole_reply():
    async with httpx.AsyncClient(transport=_stream_transport()) as client:
        status, content, err = await _stream_chat(client, "http://x/v1/chat/completions", {}, {})
    assert status == 200
    assert content == "Ghép cà phê"
    assert err == ""


async def test_stream_chat_returns_error_body_for_upstream_failures():
    # the caller needs the body to build the error message
    transport = httpx.MockTransport(
        lambda request: httpx.Response(504, text="<html>504 Gateway Time-out</html>")
    )
    async with httpx.AsyncClient(transport=transport) as client:
        status, content, err = await _stream_chat(client, "http://x/v1/chat/completions", {}, {})
    assert status == 504
    assert content == ""
    assert "504" in err


# --- the 60s wall is the reason streaming is not optional ----------------------


def test_upstream_error_does_not_leak_gateway_html_to_the_user():
    # this is what the brief called the blank/confusing error: a raw <center>504 page
    exc = _upstream_error(504, "<html>\r\n<center><h1>504 Gateway Time-out</h1></center>", "m")
    assert "<" not in str(exc)
    assert "504" in str(exc)
    assert "m" in str(exc)


def test_upstream_error_gives_429_an_actionable_message():
    # 429 arrives with a completely empty body, which used to render as "LLM error 429: "
    exc = _upstream_error(429, "", "deepseek-v4-flash-free")
    assert "429" in str(exc)
    assert str(exc).strip().endswith("。")


def test_upstream_error_keeps_upstream_text_for_response_format_fallback():
    # chat_storyboard and drama_chat_json downgrade by matching these substrings
    exc = _upstream_error(400, "json_object is not supported by this model", "m")
    assert "json_object" in str(exc)
    assert "400" in str(exc)


# --- the length unit bug --------------------------------------------------------


def test_every_expand_locale_states_a_length_rule():
    for lang in ("zh", "vi", "en"):
        rules = _EXPAND_LENGTH_RULES[lang]
        assert rules["title"] and rules["script"] and rules["theme"]


def test_non_chinese_locales_never_ask_for_chinese_character_units():
    # "zi" is a Chinese character unit; in a vi/en prompt the model reads it as "words"
    # and returns 4x the characters. Each locale must name its own unit.
    assert "字" not in _EXPAND_LENGTH_RULES["vi"]["script"]
    assert "字" not in _EXPAND_LENGTH_RULES["en"]["script"]
    assert "ký tự" in _EXPAND_LENGTH_RULES["vi"]["script"]
    assert "characters" in _EXPAND_LENGTH_RULES["en"]["script"]


def test_zh_length_rules_are_unchanged():
    # zh output is the upstream default; do not alter existing behaviour
    assert _EXPAND_LENGTH_RULES["zh"]["script"].startswith("300-700 字")


# --- a failed upstream must never look like a success --------------------------


def test_parse_expand_content_raises_instead_of_returning_chinese_mock():
    # the old fallback handed back hardcoded Simplified Chinese for a Vietnamese request
    gateway = ArkGateway.__new__(ArkGateway)
    for raw in ("", "   ", "not json at all", "```json\n{oops}\n```", '{"title":"t"}'):
        with pytest.raises(RuntimeError):
            gateway._parse_expand_content(raw, "ghép cà phê cho mẹ", "script")


def test_parse_expand_content_still_accepts_a_wrapped_json_object():
    gateway = ArkGateway.__new__(ArkGateway)
    out = gateway._parse_expand_content(
        'Sure! {"title":"T","content":"C"} hope this helps', "topic", "script"
    )
    assert out == {"title": "T", "content": "C"}


def test_parse_expand_content_still_accepts_fenced_json():
    gateway = ArkGateway.__new__(ArkGateway)
    out = gateway._parse_expand_content('```json\n{"title":"T","content":"C"}\n```', "topic", "script")
    assert out == {"title": "T", "content": "C"}


def test_parse_expand_content_flattens_and_caps_theme_mode():
    gateway = ArkGateway.__new__(ArkGateway)
    out = gateway._parse_expand_content('{"title":"T","content":"a\\nb"}', "topic", "theme")
    assert out["content"] == "a b"


# --- the wire format is the fix; lock it ---------------------------------------


def _use_route(monkeypatch, model: str = "deepseek-v4-flash-free") -> None:
    import app.services.llm_client as lc

    route = SimpleNamespace(
        upstream_model=model, base_url="https://provider.test/v1", api_key="key", channel_id="c"
    )
    monkeypatch.setattr(lc, "resolve_logical_model_id", lambda capability, model_id: "text-model")
    monkeypatch.setattr(lc, "resolve_logical_model", lambda capability, model_id: route)


def _use_transport(monkeypatch, handler) -> None:
    import app.services.llm_client as lc

    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(lc.httpx, "AsyncClient", factory)


async def test_chat_completions_sends_stream_true_by_default(monkeypatch):
    # THE fix. Without stream=true the provider's nginx 504s everything past 60s.
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, text=_delta("ok"), headers={"content-type": "text/event-stream"})

    _use_route(monkeypatch)
    _use_transport(monkeypatch, handler)

    out = await chat_completions("sys", "usr")
    assert out == "ok"
    assert seen[0]["stream"] is True


async def test_chat_completions_can_be_told_not_to_stream(monkeypatch):
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    _use_route(monkeypatch)
    _use_transport(monkeypatch, handler)

    out = await chat_completions("sys", "usr", stream=False)
    assert out == "ok"
    assert "stream" not in seen[0]


async def test_chat_completions_degrades_when_a_channel_refuses_streaming(monkeypatch):
    # a channel that does not understand `stream` gets the old non-streaming call
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body)
        if "stream" in body:
            return httpx.Response(400, text="stream is not supported")
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    _use_route(monkeypatch)
    _use_transport(monkeypatch, handler)

    out = await chat_completions("sys", "usr")
    assert out == "ok"
    assert len(calls) == 2
    assert calls[0]["stream"] is True
    assert "stream" not in calls[1]


async def test_chat_completions_does_not_degrade_on_a_gateway_timeout(monkeypatch):
    # retrying a 504 without streaming would just hit the same 60s wall twice
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        return httpx.Response(504, text="<html>504 Gateway Time-out</html>")

    _use_route(monkeypatch)
    _use_transport(monkeypatch, handler)

    with pytest.raises(RuntimeError, match="504"):
        await chat_completions("sys", "usr")
    assert len(calls) == 1


async def test_chat_completions_preserves_the_thinking_key_while_streaming(monkeypatch):
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, text=_delta("ok"), headers={"content-type": "text/event-stream"})

    _use_route(monkeypatch, model="deepseek-chat")
    _use_transport(monkeypatch, handler)

    await chat_completions("sys", "usr")
    assert seen[0]["thinking"] == {"type": "disabled"}


async def test_chat_completions_returns_empty_for_an_empty_stream(monkeypatch):
    # the caller owns the "empty means retry" decision; chat_completions must not
    # silently burn a second call (that is a second bill)
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        return httpx.Response(200, text="data: [DONE]", headers={"content-type": "text/event-stream"})

    _use_route(monkeypatch)
    _use_transport(monkeypatch, handler)

    assert await chat_completions("sys", "usr") == ""
    assert len(calls) == 1

