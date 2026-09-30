"""Log phải sống sót qua stdout của hệ điều hành.

Windows console (và mọi pipe) có thể trả về stream `cp1252`/`cp936`. Trước khi sửa,
`StreamHandler.emit` ném `UnicodeEncodeError`, `logging` nuốt vào một traceback
`--- Logging error ---` trên stderr rồi **vứt mất record** — mất luôn dòng
`GET /api/... → 200` trong `app/main.py`. Test ở đây khóa lại đúng điều đó.
"""

from __future__ import annotations

import io
import logging

from app.logging_setup import _EncodingSafeStream


def _strict_stream(encoding: str) -> io.TextIOWrapper:
    return io.TextIOWrapper(io.BytesIO(), encoding=encoding, errors="strict", newline="\n")


def _drain(stream: io.TextIOWrapper) -> str:
    stream.flush()
    return stream.buffer.getvalue().decode(stream.encoding)


def _record(stream: io.TextIOWrapper) -> str:
    logger = logging.getLogger("test.logging_setup")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = logging.StreamHandler(_EncodingSafeStream(stream))
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    try:
        logger.info("GET /api/billing/alerts/pending → 200 (4ms)")
    finally:
        logger.removeHandler(handler)
    return _drain(stream)


def test_cp1252_stream_does_not_lose_the_record() -> None:
    """Ký tự `→` không được làm mất dòng log trên console cp1252."""
    out = _record(_strict_stream("cp1252"))
    assert "GET /api/billing/alerts/pending" in out
    assert "200 (4ms)" in out


def test_cp1252_fallback_is_readable_ascii() -> None:
    """Fallback phải là ASCII thuần (backslashreplace) chứ không phải dấu hỏi."""
    out = _record(_strict_stream("cp1252"))
    assert "\\u2192" in out
    assert out.isascii()


def test_utf8_stream_keeps_the_arrow_verbatim() -> None:
    """Môi trường hỗ trợ UTF-8 vẫn phải in đúng dấu mũi tên."""
    out = _record(_strict_stream("utf-8"))
    assert "→" in out
    assert "\\u2192" not in out


def test_chinese_text_survives_a_latin1_console() -> None:
    """Text tiếng Trung trong app/ cũng phải sống, không chỉ ký tự vẽ."""
    stream = _strict_stream("latin-1")
    logger = logging.getLogger("test.logging_setup.chinese")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = logging.StreamHandler(_EncodingSafeStream(stream))
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    try:
        logger.info("剧本已生成 %s", "第 1 集")
    finally:
        logger.removeHandler(handler)
    out = _drain(stream)
    assert "\\u5267\\u672c" in out
    assert out.isascii()


def test_plain_ascii_passes_through_untouched() -> None:
    """Stream cp1252 vẫn phải nhận nguyên văn chữ ASCII bình thường."""
    out = _record(_strict_stream("cp1252")).replace("\\u2192", "->")
    assert out.strip() == "GET /api/billing/alerts/pending -> 200 (4ms)"
