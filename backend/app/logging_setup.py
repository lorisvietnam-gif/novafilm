"""Application-wide logging: readable business logs, SQL DEBUG off by default."""

from __future__ import annotations

import logging
import sys

_configured = False


def configure_logging(*, level: str = "INFO", sql_echo: bool = False) -> None:
    # Configure the root logger; safe to call repeatedly to refresh the level (still works after --reload)
    global _configured

    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
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
