"""Application-wide logging: readable business logs, SQL DEBUG off by default.

Every log record has to survive the console it is written to. A Windows console
(and any pipe) can hand us a ``cp1252``/``cp936`` stream that cannot encode a single
character of the text we log — the ``→`` in the per-request line, but also the
Chinese/Vietnamese text all over ``app/``. When that happens ``StreamHandler.emit``
raises ``UnicodeEncodeError``, ``logging`` swallows it into a ``--- Logging error ---
`` traceback on stderr and **drops the record**: the business log goes blind and any
real error next to it is buried.

So the fix lives here, in the stream, not in the message text. Message text is data
used by humans reading the log (and it is localised), and editing hundreds of call
sites to be ASCII-safe would both lose information and leave the next message to
break it. A stream wrapper keeps every message, in full, whatever the codec.
"""

from __future__ import annotations

import logging
import sys
from typing import IO, Any

_configured = False


class _EncodingSafeStream:
    """Write-through proxy that degrades a message instead of losing it.

    First write is attempted verbatim, so a UTF-8 capable stream gets the exact
    characters the log asked for (``→`` stays ``→``). Only if the codec refuses is
    the text re-encoded with ``backslashreplace``, which is pure ASCII and therefore
    encodable by any ASCII-compatible codec — the record survives as
    ``GET /x \\u2192 200`` instead of vanishing.
    """

    def __init__(self, stream: IO[str]) -> None:
        self._stream = stream

    @property
    def encoding(self) -> str:
        return getattr(self._stream, "encoding", None) or "ascii"

    def write(self, text: str) -> int:
        try:
            return self._stream.write(text)
        except UnicodeEncodeError:
            escaped = text.encode(self.encoding, "backslashreplace").decode("ascii", "replace")
            return self._stream.write(escaped)

    def flush(self) -> None:
        self._stream.flush()

    def __getattr__(self, name: str) -> Any:
        if name == "_stream":
            raise AttributeError(name)
        return getattr(self._stream, name)


def _harden_stream(stream: IO[str]) -> IO[str]:
    """Return a stream that cannot raise ``UnicodeEncodeError`` on write."""
    return _EncodingSafeStream(stream)


def _relax_std_streams() -> None:
    """Give the real ``stdout``/``stderr`` a non-strict error handler, in place.

    Doing it on the stream object (not by replacing it) means uvicorn's own log
    handlers — which captured ``sys.stdout`` before this module was imported — are
    covered too. The encoding is deliberately left alone: a UTF-8 console keeps its
    UTF-8, a cp1252 console keeps cp1252 and simply escapes what it cannot show.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(errors="backslashreplace")
        except (ValueError, OSError, AttributeError):
            # Closed or exotic stream; _EncodingSafeStream is the safety net.
            continue


def configure_logging(*, level: str = "INFO", sql_echo: bool = False) -> None:
    # Configure the root logger; safe to call repeatedly to refresh the level (still works after --reload)
    global _configured

    _relax_std_streams()

    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(_harden_stream(sys.stdout))
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                datefmt="%H:%M:%S",
            )
        )
        root.addHandler(handler)

    # Root level is INFO: DEBUG=true still does not flood third-party libraries
    root.setLevel(logging.INFO)
    logging.getLogger("app").setLevel(getattr(logging, level.upper(), logging.INFO))

    # SQLAlchemy drivers are off by default
    for name in (
        "sqlalchemy",
        "sqlalchemy.engine",
        "sqlalchemy.pool",
        "sqlalchemy.dialects",
        "asyncpg",
    ):
        logging.getLogger(name).setLevel(logging.WARNING)

    if sql_echo:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)
    else:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    # Other noise sources
    for name in ("uvicorn.access", "httpx", "httpcore", "celery", "asyncio", "multipart"):
        logging.getLogger(name).setLevel(
            logging.INFO if name == "uvicorn.access" else logging.WARNING
        )
    logging.getLogger("celery").setLevel(logging.INFO)

    if not _configured:
        logging.getLogger("app").info(
            "日志已配置 app_level=%s sql_echo=%s（已关闭 SQL DEBUG）",
            level,
            sql_echo,
        )
    _configured = True
