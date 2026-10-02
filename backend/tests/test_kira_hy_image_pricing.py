"""Kira HY Image 定价契约：能选、能算、且不挪走别的 model 的默认位。"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.models_tasks import TaskRun
from app.services.billing.estimates import estimate_task_fen
from app.services.media_model_presets import (
    clamp_default_to_preset,
    is_preset_model,
    preset_ids,
)
from app.services.tokenfree_pricing import (
    KIRA_HY_IMAGE_CHARGE_FEN,
    charge_fen_official_image,
    set_cached_rates,
)

HY = "hy-image-v3.5-free"


def test_hy_image_is_a_valid_preset_image_model():
    """它必须留在生图 preset 里，否则会被 clamp 回 seedream，前台根本选不到。"""
    assert is_preset_model("image", HY)
    assert clamp_default_to_preset("image", HY) == HY


def test_hy_image_did_not_displace_the_default_image_model():
    """加它只能追加。若插到第一项，seedream 的默认位就被抢走了。"""
    assert preset_ids("image")[0] == "seedream-5-0-pro"
    assert preset_ids("image") == ["seedream-5-0-pro", "gpt-image-2", HY]


def test_hy_image_charges_ten_fen_not_the_2k_fallback(monkeypatch):
    """没有这一条定价，它会掉进 Kie 2K 兜底被收 35 分。"""
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "billing_markup", 1.0)
    monkeypatch.setattr(settings, "billing_kie_fen_per_credit", 3.5)
    set_cached_rates(None)

    assert charge_fen_official_image(settings, model=HY, size="2K") == 10
    # 清晰度不能改价 —— 它是按张固定价。
    assert charge_fen_official_image(settings, model=HY, size="1K") == 10


@pytest.mark.asyncio
async def test_hy_image_estimate_is_ten_fen(monkeypatch):
    """按张价不乘 1.2 缓冲，所以预扣就等于 10。"""
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "billing_estimate_buffer", 1.2)
    monkeypatch.setattr(settings, "billing_markup", 1.0)
    monkeypatch.setattr(settings, "billing_kie_fen_per_credit", 3.5)
    set_cached_rates(None)

    task = TaskRun(
        id=1,
        domain="studio",
        task_type="tool_image",
        requested_by=1,
        payload={"model": HY, "size": "2K"},
    )
    fen = await estimate_task_fen(MagicMock(), task, settings=settings)
    assert fen == KIRA_HY_IMAGE_CHARGE_FEN


def test_charge_fen_is_a_real_number_never_zero():
    """把价钱设 0 也照样冻钱：estimates 处处有 max(1, ...)。所以 0 挡不住免费白嫖。"""
    from app.services.billing.estimates import _buffered_fen

    from app.config import get_settings

    settings = get_settings()
    assert _buffered_fen(0, settings) >= 1
