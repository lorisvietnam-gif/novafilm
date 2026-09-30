# -*- coding: utf-8 -*-
"""Giới hạn tần suất theo IP bằng Redis, dùng cửa sổ cố định.

Cửa sổ cố định đủ dùng ở đây: chúng ta chặn kịch bản spam/đoán mã, không phải phân tích
lưu lượng chính xác. Redis là bắt buộc — hết Redis thì hết luôn chống spam, nên hàm
chính của nó phải fail mở trước khi endpoint từ chối người dùng thật.

Redis chỉ lưu sha256 của IP, không lưu IP thô.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any

logger = logging.getLogger(__name__)


class RateLimitExceeded(Exception):
    """Vượt quá số lần gọi cho phép trong cửa sổ hiện tại."""

    def __init__(self, retry_after: int) -> None:
        super().__init__("请求过于频繁，请稍后再试")
        self.retry_after = max(1, int(retry_after))


def hit(redis_client: Any, *, scope: str, identifier: str, limit: int, window_seconds: int) -> None:
    """Ghi một lần gọi; ném RateLimitExceeded nếu vượt `limit` trong cửa sổ."""
    # Redis chỉ lưu digest của IP, không lưu IP thô.
    digest = hashlib.sha256(f"{scope}:{identifier}".encode("utf-8")).hexdigest()
    key = f"ratelimit:{scope}:{digest}"
    try:
        count = int(redis_client.incr(key))
        if count <= 1:
            redis_client.expire(key, window_seconds)
        ttl = int(redis_client.ttl(key))
    except Exception as exc:  # noqa: BLE001
        # Không đếm được thì không chặn: endpoint này đã có CSRF state và mật khẩu ứng dụng.
        logger.warning("rate limit unavailable scope=%s: %s", scope, exc)
        return
    if count > int(limit):
        raise RateLimitExceeded(ttl if ttl > 0 else window_seconds)