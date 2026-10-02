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


# 把上游状态码翻成人能看懂、能动手处理的话。
#
# 504 来自供应商前面的 nginx，只带一段 HTML；429 经常连 body 都是空的。以前这两种都原样
# 拼进 "LLM error {code}: {text}"，到界面上要么是一整段 <center>504 Gateway Time-out</center>，
# 要么是一个后面什么都没有的冒号——用户只看到"失败"，看不到能做什么。
def _upstream_error(status_code: int, text: str, model: str) -> RuntimeError:
    detail = (text or "").strip()
    if detail.lower().startswith(("<!doctype", "<html")):
        detail = ""
    if status_code == 429:
        return RuntimeError(f"文字模型 {model} 当前被限流（HTTP 429），请稍后重试。")
    if status_code >= 500:
        return RuntimeError(
            f"文字模型 {model} 上游网关超时或暂时不可用（HTTP {status_code}），请重试。"
        )
    # 保留上游原文：渠道不支持 response_format / json_object 时，调用方靠匹配这些字样
    # 降级重试（ark.chat_storyboard、drama.llm.drama_chat_json）。
    return RuntimeError(f"LLM error {status_code}: {detail[:800]}")


# 从一行 SSE 里取出 (content, reasoning_content) 增量
def _read_sse_delta(line: str) -> tuple[str, str]:
    if not line.startswith("data:"):
        return "", ""
    raw = line[len("data:"):].strip()
    if not raw or raw == "[DONE]":
        return "", ""
    try:
        chunk = json.loads(raw)
    except json.JSONDecodeError:
        return "", ""
    # 某些网关在 HTTP 200 的流里塞 error 事件
    if chunk.get("error"):
        return "", ""
    choices = chunk.get("choices") or []
    if not choices:
        return "", ""
    delta = choices[0].get("delta") or {}
    return str(delta.get("content") or ""), str(delta.get("reasoning_content") or "")


# 流式拉一次 chat/completions，返回 (http_status, 拼好的正文, 错误时的响应体)。
#
# 流式不是为了"更快返回给浏览器"——调用方拿到的仍然是拼好的整段字符串，接口返回结构没变。
# 流式是为了让上游在生成期间持续吐字节，从而绕开供应商 nginx 的 proxy_read_timeout。
async def _stream_chat(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> tuple[int, str, str]:
    chunks: list[str] = []
    reasoning_len = 0
    async with client.stream("POST", url, headers=headers, json=payload) as res:
        if res.status_code >= 400:
            await res.aread()
            return res.status_code, "", res.text
        async for line in res.aiter_lines():
            content, reasoning = _read_sse_delta(line)
            if content:
                chunks.append(content)
            reasoning_len += len(reasoning)
    if reasoning_len:
        logger.warning("文字 LLM 流里带 reasoning_content，长度=%s", reasoning_len)
    return res.status_code, "".join(chunks), ""


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
#
# stream=True（默认）是必须的，不是优化。上游供应商前面挂着一层 nginx，
# proxy_read_timeout 约 60s：非流式请求在模型把整段生成完之前一个字节都不会发出去，
# 只要生成超过 60s 就被网关掐成 504。实测同一个 2500 字的越语请求：
# 非流式 60.6s 必然 504，流式 205.6s 正常返回。传 stream=False 可以退回旧行为，
# 但那就等于把 60s 的墙又请回来。
async def chat_completions(
    system: str,
    user: str,
    *,
    temperature: float = 0.6,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    timeout: float = 300.0,
    response_format: dict[str, Any] | None = None,
    stream: bool = True,
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
        url = f"{base}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if stream:
            status, streamed, err_body = await _stream_chat(
                client, url, headers, {**payload, "stream": True}
            )
            if status < 400:
                logger.info("文字 LLM 流式返回 content_len=%s", len(streamed))
                # 空正文交给调用方处理：chat_storyboard、drama_chat_json、expand_content
                # 都已经有"空了就重试"的逻辑，这里不重复重试（重试=再付一次 token）。
                return streamed
            if status == 429 or status >= 500:
                # 限流和网关故障跟流不流式无关，换回非流式只是再撞一次同一堵墙
                raise _upstream_error(status, err_body, model)
            # 渠道不认 stream 参数：还没收到任何字节，降级重试是安全的
            logger.warning("文字 LLM 渠道拒绝流式(HTTP %s)，降级为非流式", status)

        res = await client.post(url, headers=headers, json=payload)
        if res.status_code >= 400:
            raise _upstream_error(res.status_code, res.text, model)
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
