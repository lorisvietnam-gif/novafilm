"""Đo trạng thái định tuyến ảnh: channel Kira có sống không, và HY Image ra đâu.

Chạy nhiều lượt nạp liên tiếp trong **cùng một tiến trình**, vì đó mới giống server chạy
lâu: lượt đầu tiến trình mới chỉ thấy `.env`, lượt sau mới thấy cả overlay trong DB. Mục
tiêu là bắt trạng thái **ổn định**, không phải trạng thái của một lần nạp.

Dùng: python scripts/diag_kira_routing.py [so_lan_nap]
"""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models_settings import SystemModelChannelRow  # noqa: E402
from app.services.logical_model_router import resolve_logical_model_candidates  # noqa: E402
from app.services.model_settings import (  # noqa: E402
    _bootstrap_channels_from_env,
    _decrypt_secret,
    get_routing_snapshot,
    load_model_settings_cache,
)

IMAGE_MODELS = ("hy-image-v3.5-free", "seedream-5-0-pro", "gpt-image-2")


async def _rows() -> list[SystemModelChannelRow]:
    async with AsyncSessionLocal() as db:
        return list(
            (
                await db.execute(
                    select(SystemModelChannelRow).order_by(SystemModelChannelRow.sort_order)
                )
            )
            .scalars()
            .all()
        )


async def main() -> None:
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    settings = get_settings()
    print("== .env / overlay ==")
    print("  kira_base_url        =", settings.kira_base_url)
    print("  kira_api_key có khoá =", bool((settings.kira_api_key or "").strip()))

    print("\n== _bootstrap_channels_from_env() (chỉ trong RAM) ==")
    for ch in _bootstrap_channels_from_env():
        print(f"  {ch.id:16s} enabled={ch.enabled!s:5s} sort={ch.sort_order} models={ch.models}")

    for round_no in range(1, rounds + 1):
        async with AsyncSessionLocal() as db:
            await load_model_settings_cache(db)
        snap = get_routing_snapshot()
        print(f"\n== sau lượt nạp {round_no} ==")
        print("  channels =", [(c.id, c.enabled, c.sort_order) for c in snap.channels])
        print("  logical image =", [m.id for m in snap.logical_models if m.capability == "image"])
        print("  default image =", snap.default_models.image_model)
        for mid in IMAGE_MODELS:
            routes = resolve_logical_model_candidates("image", mid)
            print(f"  resolve({mid}) ->", [(r.channel_id, r.upstream_model) for r in routes])

    print("\n== hàng trong bảng system_model_channels ==")
    for row in await _rows():
        print(
            f"  {row.id:16s} enabled={row.enabled!s:5s} sort={row.sort_order} "
            f"base={row.base_url} có_khoá={bool(_decrypt_secret(row.api_key_ciphertext or ''))} "
            f"models={row.models}"
        )


if __name__ == "__main__":
    asyncio.run(main())
