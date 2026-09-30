"""Format an exception into a displayable, never-empty error message."""

from __future__ import annotations

# Connected, but timed out waiting for a response (not a connection failure)
_READ_TIMEOUT_EXC_NAMES = frozenset({"ReadTimeout"})
# Connected, but timed out while sending the request body
_WRITE_TIMEOUT_EXC_NAMES = frozenset({"WriteTimeout"})
# Connection failed / proxy unreachable (includes the undifferentiated TimeoutException)
_CONNECT_EXC_NAMES = frozenset(
    {
        "ConnectError",
        "ConnectTimeout",
        "PoolTimeout",
        "TimeoutException",
        "NetworkError",
        "ProxyError",
    }
)


def format_exception_message(
    exc: BaseException,
    *,
    fallback: str = "未知错误",
    limit: int = 500,
) -> str:
    """Build an error message with the exception type name; supplies readable text when ConnectError and friends have an empty message."""
    name = type(exc).__name__
    detail = str(exc).strip()
    if name in _READ_TIMEOUT_EXC_NAMES:
        tip = detail or "上游已连通但响应超时（图片/视频生成可能超过等待上限）"
        return f"网络错误（{name}）：{tip}"[:limit]
    if name in _WRITE_TIMEOUT_EXC_NAMES:
        tip = detail or "上游已连通但发送请求超时"
        return f"网络错误（{name}）：{tip}"[:limit]
    if name in _CONNECT_EXC_NAMES:
        tip = detail or "无法连接上游服务（请检查网络、代理或 TokenFree 是否可达）"
        return f"网络错误（{name}）：{tip}"[:limit]
    if not detail:
        return f"{name}：{fallback}"[:limit]
    if detail.startswith(name):
        return detail[:limit]
    return f"{name}: {detail}"[:limit]
