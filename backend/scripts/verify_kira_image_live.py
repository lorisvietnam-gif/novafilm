"""Kiểm chứng sống đường sinh ảnh: model người dùng chọn thực sự gọi nhà cung cấp nào.

Gọi đúng đường API dùng (`ArkGateway.gen_image`), không giả lập. In ra channel / upstream /
URL / khoá trước khi gọi, kết quả sau khi gọi, và — nếu thất bại — hình dạng phản hồi thật
của upstream (chỉ in kích thước, không in payload).

Dùng: python scripts/verify_kira_image_live.py [ten_model]
"""

from __future__ import annotations

import asyncio
import base64
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.services.ark import ArkGateway  # noqa: E402
from app.services.logical_model_router import resolve_logical_model_id  # noqa: E402
from app.services.model_settings import load_model_settings_cache  # noqa: E402

MODEL = sys.argv[1] if len(sys.argv) > 1 else "hy-image-v3.5-free"
PROMPT = "a single red apple on a plain white table, product photo"


def _describe_response(data: dict) -> None:
    print("\n-- hình dạng phản hồi upstream --")
    print("  top-level keys :", sorted(data.keys()))
    items = data.get("data") or []
    print("  data items     :", len(items))
    if items:
        print("  item keys      :", sorted(items[0].keys()))
        print("  url            :", len(items[0].get("url") or ""), "ký tự")
        b64 = items[0].get("b64_json") or ""
        if b64:
            print("  b64_json       :", len(b64), "ký tự ->", len(base64.b64decode(b64)), "byte")
    print("  usage          :", data.get("usage"))


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await load_model_settings_cache(db)

    gateway = ArkGateway()
    route = gateway._resolve_ark_route("image", MODEL)
    url = gateway._route_url("/images/generations", route)
    print("model yêu cầu   :", MODEL)
    print("logical id      :", resolve_logical_model_id("image", MODEL))
    print("channel         :", route.channel_id if route else None)
    print("upstream model  :", route.upstream_model if route else None)
    print("base url        :", route.base_url if route else None)
    print("có khoá         :", bool(route.api_key) if route else False)
    print("url sẽ gọi      :", url)

    try:
        result = await gateway.gen_image(PROMPT, model=MODEL, size="1K", aspect_ratio="1:1")
    except Exception as exc:  # noqa: BLE001 — script đo lỗi, không phải test
        print("\n-- gen_image LỖI --")
        print(f"  {type(exc).__name__}: {exc}")
        print("  ảnh đã bị trả về nhưng bước lưu ảnh hỏng; đo tiếp phản hồi thật:")
        body = {
            "model": route.upstream_model if route else MODEL,
            "prompt": PROMPT,
            "size": "1K",
            "response_format": "url",
            "watermark": False,
        }
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                url, headers=gateway._route_headers(route), json=body
            )
        print("  HTTP status    :", resp.status_code)
        _describe_response(resp.json())
        return

    print("\n-- kết quả --")
    print("  local_url      :", result.local_url)
    print("  remote_url     :", result.remote_url)
    print("  upstream_cost_fen:", result.upstream_cost_fen)
    if result.remote_url and not result.remote_url.startswith("http"):
        print("  remote KHÔNG phải URL -> cần xử lý base64 (xem _extract_image_url)")


if __name__ == "__main__":
    asyncio.run(main())
