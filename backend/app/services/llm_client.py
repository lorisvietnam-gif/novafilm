"""OpenAI-compatible text model client (any compatible upstream: Kimi / DeepSeek / OpenAI, etc.)."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, NamedTuple

import httpx
from app.config import get_settings
from app.services.logical_model_router import (
    resolve_logical_model_id,
    resolve_same_channel_failover_routes,
)

logger = logging.getLogger(__name__)

# DEFAULT_MAX_TOKENS: structured output such as episode bodies needs enough completion room
DEFAULT_MAX_TOKENS = 32768

# 上游瞬时故障后的重试间隔。别太长：用户已经在等了。
GATEWAY_RETRY_BACKOFF_SEC = 2.0

# 一次调用最多打多少个上游候选（首选 + 备选）。
#
# 为什么不把候选列表走完：判断一个候选死没死要跑满 read timeout 才算，多一个候选
# 就多一份等待。3 个够挡住「首选模型被上游下线」这种真事故，又不会让用户等 N 倍时间。
#
# 为什么需要它（实测 2026-10-02，task 810）：首选 `mimo-v2.6-flash-free` 返回 504，
# 同一时刻 `hy3` / `hy4` / `qwen3.8-flash-next-free` 都是 200 —— 但那三个不在候选
# 列表里，因为渠道的 models 白名单只登记了一个文字模型。只取 `candidates[0]` 的话，
# 一个上游抖动就等于整个文字功能停摆。
MAX_TEXT_ROUTES_PER_CALL = 3


class LlmUnavailableError(RuntimeError):
    """The text LLM is not configured or not available."""


class LlmUpstreamError(RuntimeError):
    """上游返回了 HTTP 错误。

    继承 RuntimeError，所以现有靠 `except RuntimeError` + 匹配文案的降级逻辑
    （chat_storyboard、drama_chat_json）完全不受影响；status_code 让"该不该重试"
    不必再靠解析文案。
    """

    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


# 限流和网关故障都是瞬时的：换一次请求往往就成了。视频轮询早就这么处理
# （ark._is_transient_http_status），文字这边以前完全没有，60s 网关墙一撞就是死。
def _is_transient_gateway_error(exc: BaseException) -> bool:
    return isinstance(exc, LlmUpstreamError) and (
        exc.status_code == 429 or exc.status_code >= 500
    )


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
def _upstream_error(status_code: int, text: str, model: str) -> LlmUpstreamError:
    detail = (text or "").strip()
    if detail.lower().startswith(("<!doctype", "<html")):
        detail = ""
    if status_code == 429:
        return LlmUpstreamError(
            f"文字模型 {model} 当前被限流（HTTP 429），请稍后重试。", status_code
        )
    if status_code >= 500:
        return LlmUpstreamError(
            f"文字模型 {model} 上游网关超时或暂时不可用（HTTP {status_code}），请重试。",
            status_code,
        )
    # 保留上游原文：渠道不支持 response_format / json_object 时，调用方靠匹配这些字样
    # 降级重试（ark.chat_storyboard、drama.llm.drama_chat_json）。
    return LlmUpstreamError(f"LLM error {status_code}: {detail[:800]}", status_code)


# 从一行 SSE 里取出 (content, reasoning_content, finish_reason, 是否终止标记)
def _read_sse_chunk(line: str) -> tuple[str, str, str, bool]:
    if not line.startswith("data:"):
        return "", "", "", False
    raw = line[len("data:"):].strip()
    if not raw:
        return "", "", "", False
    if raw == "[DONE]":
        return "", "", "", True
    try:
        chunk = json.loads(raw)
    except json.JSONDecodeError:
        # 流末尾被切断时最后一行经常是半截 JSON，不能让它毁掉整个响应
        return "", "", "", False
    # 某些网关在 HTTP 200 的流里塞 error 事件
    if chunk.get("error"):
        return "", "", "", False
    choices = chunk.get("choices") or []
    if not choices:
        return "", "", "", False
    delta = choices[0].get("delta") or {}
    finish = choices[0].get("finish_reason") or ""
    return str(delta.get("content") or ""), str(delta.get("reasoning_content") or ""), str(finish), False


# 从一行 SSE 里取出 (content, reasoning_content) 增量
def _read_sse_delta(line: str) -> tuple[str, str]:
    content, reasoning, _finish, _done = _read_sse_chunk(line)
    return content, reasoning


class _StreamResult(NamedTuple):
    status: int
    content: str
    err_body: str
    # 整段回复是否完整：收到 [DONE] 或 finish_reason 才算完整。
    # 半截 JSON 有可能是"合法但被砍短"的（内容看着正常，其实少了一半），
    # 那种情况比直接报错更危险，所以必须能分辨。
    complete: bool


# 流式拉一次 chat/completions。
#
# 流式不是为了"更快返回给浏览器"——调用方拿到的仍然是拼好的整段字符串，接口返回结构没变。
# 流式是为了让上游在生成期间持续吐字节，从而绕开供应商 nginx 的 proxy_read_timeout。
async def _stream_chat(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> _StreamResult:
    chunks: list[str] = []
    reasoning_len = 0
    done = False
    finish = ""
    try:
        async with client.stream("POST", url, headers=headers, json=payload) as res:
            if res.status_code >= 400:
                await res.aread()
                return _StreamResult(res.status_code, "", res.text, True)
            async for line in res.aiter_lines():
                content, reasoning, chunk_finish, is_done = _read_sse_chunk(line)
                if content:
                    chunks.append(content)
                if reasoning:
                    reasoning_len += len(reasoning)
                if chunk_finish:
                    finish = chunk_finish
                if is_done:
                    done = True
                    break
    except httpx.RemoteProtocolError as exc:
        # 上游中途掐断连接：已收到的部分一定不完整
        logger.warning("文字 LLM 流被上游中断: %s", exc)
        return _StreamResult(200, "".join(chunks), "", False)
    if reasoning_len:
        logger.warning("文字 LLM 流里带 reasoning_content，长度=%s", reasoning_len)
    return _StreamResult(200, "".join(chunks), "", done or bool(finish))



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
    retry_gateway: bool = True,
) -> str:
    settings = get_settings()
    logical_id = resolve_logical_model_id("text", None)
    # 候选列表就是逻辑模型上的全部 binding（`LogicalModel` 的注释原文就是
    # "multi-channel failover"），已按 binding priority / 渠道 sort_order 排好序。
    # 以前只取 `candidates[0]`，等于把 failover 定义写空了：登记了 3 个备选也没人用。
    targets = _resolve_text_targets(logical_id, settings)
    if not targets:
        raise LlmUnavailableError(
            "未解析到可用文字模型。请在管理后台填写 TokenFree API Key，拉取并选择文本模型。"
        )

    # 限流和 5xx 是瞬时的：同一个候选重试一次，再换下一个候选。
    # 只重试一次：用户等的是结果，不是无限重试。代价要说清楚——撞上 60s 网关墙时，
    # 一次失败会拖到约 2 倍时长才给出结果或报错。所以长度必须压到让这个尾巴很难出现，
    # 而不是靠重试兜底。
    first_budget = 2 if retry_gateway else 1
    last_exc: LlmUpstreamError | None = None
    for index, (model, base, api_key) in enumerate(targets):
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
            "调用文字 LLM model=%s base=%s user_len=%s max_tokens=%s candidate=%s/%s",
            model,
            base,
            len(user or ""),
            max_tokens,
            index + 1,
            len(targets),
        )
        # 首选保留原有的同路重试；备选只打一发：它已经是在兜底了，再重试只是让用户多等。
        budget = first_budget if index == 0 else 1
        for attempt in range(1, budget + 1):
            try:
                return await _chat_completions_once(
                    payload,
                    base=base,
                    api_key=api_key,
                    model=model,
                    timeout=timeout,
                    stream=stream,
                )
            except LlmUpstreamError as exc:
                if not _is_transient_gateway_error(exc):
                    # 4xx 是请求本身的问题（参数错、没鉴权），换模型只会得到同样的错。
                    raise
                last_exc = exc
                if attempt >= budget:
                    break
                logger.warning(
                    "文字 LLM 上游瞬时故障(HTTP %s)，第 %s 次重试: %s",
                    exc.status_code,
                    attempt,
                    exc,
                )
                await asyncio.sleep(GATEWAY_RETRY_BACKOFF_SEC)
        logger.warning(
            "文字 LLM 候选 %s 用尽重试仍失败，换下一个候选 (%s/%s 共 %s 个)",
            model,
            index + 1,
            len(targets),
            len(targets),
        )
    assert last_exc is not None  # 有 targets 就至少发过一次，进来必带异常
    raise last_exc


def _resolve_text_targets(
    logical_id: str,
    settings: Any,
) -> list[tuple[str, str, str]]:
    """(model, base_url, api_key) 列表，按优先级排好，最多 `MAX_TEXT_ROUTES_PER_CALL` 个。"""
    targets: list[tuple[str, str, str]] = []
    for route in resolve_same_channel_failover_routes(
        "text", logical_id, limit=MAX_TEXT_ROUTES_PER_CALL
    ):
        model = (route.upstream_model or "").strip()
        if not model:
            continue
        targets.append((model, route.base_url.rstrip("/") or resolve_llm_base_url(), route.api_key))
    if targets:
        return targets
    # 逻辑模型一个都解析不出来：退回 .env 那条老路，行为与改动前一致。
    model = (settings.model_llm or "").strip()
    if not model:
        return []
    return [(model, resolve_llm_base_url(), resolve_llm_api_key())]


# 真正发一次请求。chat_completions 负责重试策略，这里只管"发一次、要么成功要么抛"。
async def _chat_completions_once(
    payload: dict[str, Any],
    *,
    base: str,
    api_key: str,
    model: str,
    timeout: float,
    stream: bool,
) -> str:
    async with httpx.AsyncClient(timeout=timeout) as client:
        url = f"{base}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if stream:
            result = await _stream_chat(
                client, url, headers, {**payload, "stream": True}
            )
            if result.status < 400:
                if result.complete:
                    logger.info("文字 LLM 流式返回 content_len=%s", len(result.content))
                    # 空正文交给调用方处理：chat_storyboard、drama_chat_json、expand_content
                    # 都已经有"空了就重试"的逻辑，这里不重复重试（重试=再付一次 token）。
                    return result.content
                # 上游中途断流。半截 JSON 有可能刚好"合法"，直接交出去等于给用户一篇
                # 被砍掉一半却看不出异常的文案——那比报错危险得多，所以这里重试一次。
                logger.warning(
                    "文字 LLM 流不完整（已收 %s 字符，无结束标记），重试一次",
                    len(result.content),
                )
                retry = await _stream_chat(
                    client, url, headers, {**payload, "stream": True}
                )
                if retry.status < 400 and retry.complete:
                    logger.info("文字 LLM 流式重试成功 content_len=%s", len(retry.content))
                    return retry.content
                if retry.status >= 400:
                    raise _upstream_error(retry.status, retry.err_body, model)
                raise RuntimeError(
                    f"文字模型 {model} 的回复被上游中途截断（两次都不完整），请重试。"
                )
            if result.status == 429 or result.status >= 500:
                # 限流和网关故障跟流不流式无关，换回非流式只是再撞一次同一堵墙
                raise _upstream_error(result.status, result.err_body, model)
            # 渠道不认 stream 参数：还没收到任何字节，降级重试是安全的
            logger.warning("文字 LLM 渠道拒绝流式(HTTP %s)，降级为非流式", result.status)

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
