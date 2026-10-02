"""Ước tính phải đọc đúng tên trường model mà payload thật sự dùng.

Payload thật của `asset_image` mang model ở khoá **`model_id`**
(`DramaImageGenerateRequest.model_id` → `dispatch_asset_image_job` → `TaskRun.payload`).
Bộ đọc cũ chỉ dò `model` / `image_model`, nên nó rơi về model mặc định và tính sai tiền.
"""

from __future__ import annotations

from app.services.billing.estimates import _payload_image_model


def test_reads_model_id_from_a_real_asset_image_payload():
    payload = {
        "project_id": 16,
        "prompt": "x",
        "kind": "character",
        "model_id": "hy-image-v3.5-free",
        "aspect_ratio": "16:9",
    }
    assert _payload_image_model(payload) == "hy-image-v3.5-free"


def test_prefers_the_explicit_keys_before_model_id():
    payload = {"model": "seedream-5-0-pro", "model_id": "hy-image-v3.5-free"}
    assert _payload_image_model(payload) == "seedream-5-0-pro"


def test_finds_model_id_nested_under_prepared():
    payload = {"prepared": {"model_id": "hy-image-v3.5-free"}}
    assert _payload_image_model(payload) == "hy-image-v3.5-free"


def test_returns_empty_string_when_absent_or_blank():
    assert _payload_image_model({}) == ""
    assert _payload_image_model({"model_id": "   "}) == ""