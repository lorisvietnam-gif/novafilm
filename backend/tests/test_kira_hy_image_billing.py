"""Kira HY Image 的结算价：估 10 分就必须真收 10 分，不能整笔退还。

Hồi quy cho task 705 đo được: ảnh `hy-image-v3.5-free` sinh thành công, ví đóng băng đúng
10 fen, `billing_charged_fen=0`, `billing_refunded_fen=10` — ảnh ra, tiền không thu.

Nguyên nhân không nằm ở chỗ thiếu lời gọi ghi usage (`generation.py` đã ghi), mà ở chỗ
`_catalog_image_fen_if_per_call` không nhận ra Kira HY: không có dòng giá trong
`lookup_rate`, `is_seedream_family` cũng false, tên không chứa `gpt-image` — nên hàm trả
`None` và rơi xuống `charge_fen_for_tokens(0, "seedream")`, mà 0 token thì charge 0.

Ước tính (`estimates._catalog_image_fen`) gọi thẳng `charge_fen_official_image` nên ra 10.
Hai đường gọi khác nhau chính là lý do freeze=10 còn charge=0.

`charge_fen_official_image` đã có sẵn nhánh Kira HY trả 10 cố định, nhưng nhánh đó **không
bao giờ tới được** từ đường settle. Bản sửa đưa nhánh đó vào đúng chỗ dùng chung.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ark import ImageResult
from app.services.billing.pricing import _catalog_image_fen_if_per_call, charge_fen_for_usage
from app.services.drama.billing_util import record_seedream_image_usage
from app.services.tokenfree_pricing import is_kira_hy_image
from tests.conftest import make_user

HY = "hy-image-v3.5-free"
SEEDREAM_2K = "doubao-seedream-5-0-260128"


def test_kira_hy_image_is_recognised_including_free_alias() -> None:
    assert is_kira_hy_image(HY) is True
    assert is_kira_hy_image("hy-image-v3.5") is True
    assert is_kira_hy_image("HY-Image-v3.5-Free") is True
    # Không được nuốt nhầm model khác.
    assert is_kira_hy_image(SEEDREAM_2K) is False
    assert is_kira_hy_image("gpt-image-2-5") is False


def test_kira_hy_image_catalog_is_not_none() -> None:
    """Chốt chặn đúng lỗi gốc: hàm phân giá trả `None` ⇒ charge 0 ⇒ hoàn hết."""
    from app.config import get_settings

    settings = get_settings()
    assert _catalog_image_fen_if_per_call(settings, HY, size="") == 10


def test_kira_hy_image_is_flat_10_regardless_of_size() -> None:
    """Kira HY tính theo tấm, không theo tỉ lệ khung hình."""
    from app.config import get_settings

    settings = get_settings()
    for size in ("1K", "2K", "4K"):
        assert _catalog_image_fen_if_per_call(settings, HY, size=size) == 10


def test_seedream_prices_are_not_clobbered_by_the_kira_fix() -> None:
    """Chốt chặn hồi quy giá: ép cứng 10 là sai — Seedream 2K vẫn phải là 35.

    Bản gốc có lần được đề xuất "số fen phải bằng đúng est (10)". Làm vậy mỗi ảnh Seedream
    2K lỗ 25 fen và ảnh 1K lại thu hơn giá.
    """
    from app.config import get_settings

    settings = get_settings()
    assert _catalog_image_fen_if_per_call(settings, SEEDREAM_2K, size="1K") == 21
    assert _catalog_image_fen_if_per_call(settings, SEEDREAM_2K, size="2K") == 35


def test_zero_token_usage_no_longer_prices_to_zero_for_hy_image() -> None:
    """Đúng lời gọi `record_line` làm với ảnh Kira: 0 token nhưng vẫn có giá theo tấm."""
    from app.config import get_settings

    cost, charge, from_upstream = charge_fen_for_usage(
        0, "seedream", raw_usage=None, settings=get_settings(), model=HY
    )
    assert (cost, charge, from_upstream) == (10, 10, False)


@pytest.mark.asyncio
async def test_record_hy_image_usage_writes_10_fen(db_session: AsyncSession) -> None:
    """Ảnh Kira không có token, không có cost_fen — vẫn phải ra 10 fen."""
    user = await make_user(db_session)
    image = ImageResult(local_url="/static/hy.png", total_tokens=0, raw_usage=None)
    ev = await record_seedream_image_usage(
        db_session,
        user_id=user.id,
        model=HY,
        domain="drama",
        image_result=image,
    )
    await db_session.commit()

    assert ev.cost_fen == 10
    assert ev.charge_fen == 10
    # Task 705 đóng băng 10 rồi hoàn 10 vì charge=0; không được tái diễn.
    assert ev.charge_fen != 0


@pytest.mark.asyncio
async def test_record_seedream_2k_usage_stays_35_fen(db_session: AsyncSession) -> None:
    """Seedream 2K vẫn 35 fen sau bản sửa."""
    user = await make_user(db_session)
    image = ImageResult(local_url="/static/sd.png", total_tokens=0, raw_usage=None)
    ev = await record_seedream_image_usage(
        db_session,
        user_id=user.id,
        model=SEEDREAM_2K,
        domain="drama",
        image_result=image,
        extra_raw={"size": "2K"},
    )
    await db_session.commit()

    assert ev.charge_fen == 35
