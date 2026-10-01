"""OpenAI-compatible text model client (any compatible upstream: Kimi / DeepSeek / OpenAI, etc.)."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import get_settings
from app.services.logical_model_router import resolve_logical_model, resolve_logical_model_id

logger = logging.getLogger(__name__)

# DEFAULT_MAX_TOKENS: structured output such as episode bodies needs enough completion room
DEFAULT_MAX_TOKENS = 32768


class LlmUnavailableError(RuntimeError):
    """The text LLM is not configured or not available."""


# Resolve the LLM API key (mirrors manju resolveOpenaiApiKey)
def resolve_llm_api_key() -> str:
    key = (get_settings().openai_api_key or "").strip()
    if not key:
        raise LlmUnavailableError(
            "未配置 OPENAI_API_KEY，无法调用文字模型。"
            "请在管理后台「系统设置 → 模型」填写 TokenFree API Key 并选择文本模型。"
        )
    return key


# Resolve the OpenAI-compatible base URL
def resolve_llm_base_url() -> str:
    base = (get_settings().openai_base_url or "").strip().rstrip("/")
    if base:
        return base
    return "https://api.openai.com/v1"


# kimi / deepseek-v4 enable thinking by default, which eats the whole token budget and leaves content empty; turn it off for every structured call
def _llm_extra_body(model: str) -> dict[str, Any]:
    mid = (model or "").strip().lower()
    if mid.startswith("kimi") or mid.startswith("deepseek"):
        return {"thinking": {"type": "disabled"}}
    if mid.startswith("gemini"):
        # Google maps the OpenAI `reasoning_effort` field onto Gemini's thinking budget
        # (thinking_budget for 2.5, thinking_level for 3). Left unset, thinking is dynamic
        # and can consume the whole max_tokens, leaving content empty -- the same failure as kimi.
        # "none" disables thinking, but only 2.5 accepts it; 2.5 Pro and Gemini 3 cannot turn
        # thinking off at all, so cap them at "low" instead to leave room for the answer.
        # reasoning_effort and thinking_config/thinking_level overlap and cannot be combined.
        if "-pro" in mid or mid.startswith("gemini-3"):
            return {"reasoning_effort": "low"}
        return {"reasoning_effort": "none"}
    return {}


# Extract the body text from a chat/completions response
def _message_content(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if content:
        return str(content)
    # Some compatible gateways put the result in reasoning_content
    reasoning = message.get("reasoning_content")
    return str(reasoning or "")


# Call the OpenAI-compatible chat/completions endpoint
async def chat_completions(
    system: str,
    user: str,
    *,
    temperature: float = 0.6,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    timeout: float = 300.0,
    response_format: dict[str, Any] | None = None,
) -> str:
    settings = get_settings()
    logical_id = resolve_logical_model_id("text", None)
    route = resolve_logical_model("text", logical_id)
    if route:
        api_key = route.api_key
        model = (route.upstream_model or "").strip()
        base = route.base_url.rstrip("/") or resolve_llm_base_url()
    else:
        api_key = resolve_llm_api_key()
        model = (settings.model_llm or "").strip()
        base = resolve_llm_base_url()
    if not model:
        raise LlmUnavailableError(
            "未解析到可用文字模型。请在管理后台填写 TokenFree API Key，拉取并选择文本模型。"
        )
    # The kimi family only accepts temperature=0.6; any other value returns 400
    effective_temperature = 0.6 if model.lower().startswith("kimi") else temperature

    payload: dict[str, Any] = {
        "model": model,
        "temperature": effective_temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    extra = _llm_extra_body(model)
    if extra:
        payload.update(extra)
    if response_format:
        payload["response_format"] = response_format

    logger.info(
        "调用文字 LLM model=%s base=%s user_len=%s max_tokens=%s",
        model,
        base,
        len(user or ""),
        max_tokens,
    )
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if res.status_code >= 400:
            raise RuntimeError(f"LLM error {res.status_code}: {res.text[:800]}")
        body = (res.text or "").strip()
        if not body:
            raise RuntimeError(f"LLM 返回空响应体 (HTTP {res.status_code})")
        lowered = body[:256].lower()
        if lowered.startswith("<!doctype") or lowered.startswith("<html"):
            raise RuntimeError(
                f"LLM 渠道 Base URL 配置错误（返回了网页 HTML 而非 API JSON）。"
                f"当前 base={base}，请检查管理后台「模型渠道」的 Base URL 是否为 OpenAI 兼容 API 地址"
                f"（如 https://api.deepseek.com 或 https://api.moonshot.cn/v1），而非网站首页。"
            )
        try:
            data = res.json()
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"LLM 响应不是合法 JSON: {body[:200]}") from exc
    content = _message_content(data)
    logger.info("文字 LLM 返回 content_len=%s", len(content))
    return content
