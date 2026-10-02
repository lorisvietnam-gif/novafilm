"""Upstream trả base64 thay vì URL: phải lưu được ảnh, không được văng lỗi URL.

Kira (`POST /v1/images/generations`) trả `data[0].b64_json`, `url` rỗng. Trước đây
`_extract_image_url` trả luôn `b64_json` như thể nó là URL, rồi `download_to()` ném
`InvalidURL: URL too long` — ảnh sinh được nhưng bị mất.
"""

from __future__ import annotations

import base64

import pytest

from app.services.ark import ArkGateway, _strip_data_url_prefix

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def test_extract_image_url_does_not_return_base64_as_a_url():
    data = {"data": [{"b64_json": "aGVsbG8gd29ybGQ=", "mime_type": "image/png"}]}
    assert ArkGateway._extract_image_url(data) is None
    assert ArkGateway._extract_image_b64(data) == "aGVsbG8gd29ybGQ="


def test_extract_image_url_still_prefers_a_real_url():
    data = {"data": [{"url": "https://example.test/a.png", "b64_json": "aGk="}]}
    assert ArkGateway._extract_image_url(data) == "https://example.test/a.png"


def test_extract_image_b64_handles_data_url_prefix():
    data = {"data": [{"b64_json": "data:image/png;base64,aGk="}]}
    got = ArkGateway._extract_image_b64(data)
    assert got is not None
    assert base64.b64decode(_strip_data_url_prefix(got)) == b"hi"


@pytest.mark.parametrize("payload", [{}, {"data": []}, {"data": [{}]}])
def test_both_extractors_return_none_when_there_is_no_image(payload):
    assert ArkGateway._extract_image_url(payload) is None
    assert ArkGateway._extract_image_b64(payload) is None


def test_inline_png_bytes_survive_the_round_trip():
    """B64 của ảnh thật phải giải ra đúng byte PNG."""
    got = base64.b64decode(base64.b64encode(PNG_BYTES))
    assert got[:8] == b"\x89PNG\r\n\x1a\n"