"""TokenFree / New API 视频路径与 Seedance 请求体包装。"""

from __future__ import annotations

import pytest

from app.services.ark import ArkGateway, _build_task_result_from_payload
from app.services.media_ref_limits import (
    MAX_REFERENCE_IMAGES,
    ReferenceImageError,
    ensure_within_reference_image_limit,
)
from app.services.tokenfree_gateway import TOKENFREE_BASE_URL, TOKENFREE_CHANNEL_ID
from app.services.tokenfree_video import (
    extract_video_task_id,
    prepare_video_create_body,
    remap_video_path,
    uses_tokenfree_video,
    wrap_seedance_payload_for_newapi,
)


def test_remap_video_path_on_tokenfree():
    create = remap_video_path(
        "/contents/generations/tasks",
        base_url=TOKENFREE_BASE_URL,
        channel_id=TOKENFREE_CHANNEL_ID,
    )
    poll = remap_video_path(
        "/contents/generations/tasks/task-1",
        base_url=TOKENFREE_BASE_URL,
    )
    assert create == "/videos"
    assert poll == "/videos/task-1"


def test_remap_video_path_keeps_ark_volces():
    path = remap_video_path(
        "/contents/generations/tasks",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
    )
    assert path == "/contents/generations/tasks"
    assert uses_tokenfree_video(base_url="https://ark.cn-beijing.volces.com/api/v3") is False


def test_wrap_seedance_payload_uses_videos_metadata_input():
    payload = {
        "model": "seedance-2-5",
        "content": [
            {"type": "text", "text": "镜头推进"},
            {
                "type": "image_url",
                "image_url": {"url": "https://cdn.example.com/a.jpg"},
                "role": "first_frame",
            },
        ],
        "duration": 5,
        "resolution": "720p",
        "ratio": "16:9",
        "watermark": False,
        "generate_audio": True,
        "return_last_frame": True,
    }
    wrapped = wrap_seedance_payload_for_newapi(payload)
    assert wrapped["model"] == "seedance-2-5"
    assert wrapped["prompt"] == "镜头推进"
    assert wrapped["image"] == "https://cdn.example.com/a.jpg"
    assert wrapped["seconds"] == "5"
    meta_input = wrapped["metadata"]["input"]
    assert meta_input["duration"] == "5"
    assert meta_input["aspect_ratio"] == "16:9"
    assert meta_input["content"] == payload["content"]
    assert meta_input["generate_audio"] is True
    assert meta_input["first_frame_url"] == "https://cdn.example.com/a.jpg"
    assert "reference_image_urls" not in meta_input
    assert "content" not in wrapped


def test_wrap_seedance_payload_keeps_all_reference_images():
    """多参考必须写成 reference_image_urls，不能只留顶层第一张图。"""
    payload = {
        "model": "seedance-2-5",
        "content": [
            {"type": "text", "text": "光光飞过"},
            {
                "type": "image_url",
                "image_url": {"url": "https://cdn.example.com/guang.png"},
                "role": "reference_image",
            },
            {
                "type": "image_url",
                "image_url": {"url": "https://cdn.example.com/mimi.png"},
                "role": "reference_image",
            },
            {
                "type": "image_url",
                "image_url": {"url": "https://cdn.example.com/last.jpg"},
                "role": "reference_image",
            },
            {
                "type": "audio_url",
                "audio_url": {"url": "https://cdn.example.com/voice.mp3"},
                "role": "reference_audio",
            },
        ],
        "duration": 22,
        "resolution": "480p",
        "ratio": "16:9",
        "watermark": False,
        "generate_audio": True,
        "return_last_frame": True,
    }
    wrapped = wrap_seedance_payload_for_newapi(payload)
    meta_input = wrapped["metadata"]["input"]
    refs = [
        "https://cdn.example.com/guang.png",
        "https://cdn.example.com/mimi.png",
        "https://cdn.example.com/last.jpg",
    ]
    assert "image" not in wrapped
    assert "images" not in wrapped
    assert meta_input["reference_image_urls"] == refs
    assert "images" not in meta_input
    assert all(
        not (isinstance(item, dict) and item.get("type") == "image_url")
        for item in meta_input.get("content") or []
    )
    assert meta_input["reference_audio_urls"] == ["https://cdn.example.com/voice.mp3"]
    assert "first_frame_url" not in meta_input
    assert "image" not in meta_input


def test_wrap_seedance_payload_single_reference_image_keeps_ratio_mode():
    """有画幅的单张 i2v 也是 reference_image，不能退化成 first_frame。"""
    payload = {
        "model": "seedance-2-5",
        "content": [
            {"type": "text", "text": "镜头推进"},
            {
                "type": "image_url",
                "image_url": {"url": "https://cdn.example.com/a.jpg"},
                "role": "reference_image",
            },
        ],
        "duration": 5,
        "ratio": "9:16",
        "resolution": "480p",
    }
    wrapped = wrap_seedance_payload_for_newapi(payload)
    meta_input = wrapped["metadata"]["input"]
    assert "images" not in wrapped
    assert "image" not in wrapped
    assert meta_input["reference_image_urls"] == ["https://cdn.example.com/a.jpg"]
    assert "images" not in meta_input
    assert meta_input["aspect_ratio"] == "9:16"
    assert "first_frame_url" not in meta_input


def test_wrap_seedance_payload_from_generate_body_includes_continuity():
    """真实组装体：角色图 + 上一镜尾帧都要进 reference_image_urls。"""
    from app.services.drama.build_seedance_generate_body import build_seedance_generate_body

    body = build_seedance_generate_body(
        {
            "content": "@duration:6\n禹：水患未平。",
            "aspect_ratio": "16:9",
            "resolution": "480p",
            "duration_fallback": 8,
            "continuity_first_frame_url": "https://cdn.example.com/prev_last.jpg",
            "reference": [
                {
                    "id": 1,
                    "type": "character",
                    "name": "禹",
                    "cover": "https://cdn.example.com/yu.jpg",
                    "url": "https://cdn.example.com/yu.jpg",
                    "params": {},
                }
            ],
        }
    )
    wrapped = wrap_seedance_payload_for_newapi(body)
    refs = wrapped["metadata"]["input"]["reference_image_urls"]
    assert refs[0] == "https://cdn.example.com/yu.jpg"
    assert refs[-1] == "https://cdn.example.com/prev_last.jpg"
    assert "image" not in wrapped
    assert "images" not in wrapped
    assert "images" not in wrapped["metadata"]["input"]
    assert "first_frame_url" not in wrapped["metadata"]["input"]


def _seedance_body_with_images(count: int, *, role: str = "reference_image") -> dict:
    content: list[dict] = [{"type": "text", "text": "群戏"}]
    for i in range(count):
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"https://cdn.example.com/{i}.png"},
                "role": role,
            }
        )
    return {"model": "seedance-2-5", "content": content, "duration": 8}


def test_wrap_seedance_payload_keeps_exactly_nine_reference_images():
    """刚好 9 张要**照发**，且同一批图不得在 content / images 里再写一份。"""
    wrapped = wrap_seedance_payload_for_newapi(_seedance_body_with_images(MAX_REFERENCE_IMAGES))
    refs = wrapped["metadata"]["input"]["reference_image_urls"]
    assert len(refs) == MAX_REFERENCE_IMAGES
    assert refs == [f"https://cdn.example.com/{i}.png" for i in range(MAX_REFERENCE_IMAGES)]
    assert "images" not in wrapped
    assert "images" not in wrapped["metadata"]["input"]
    assert all(
        not (isinstance(item, dict) and item.get("type") == "image_url")
        for item in wrapped["metadata"]["input"].get("content") or []
    )


def test_wrap_seedance_payload_rejects_ten_reference_images():
    """第 10 张必须**报错**，不能悄悄发 9 张。

    这是本 bug 的核心断言。旧实现在去重循环里 `break` 到 9 张，多出来的图人间蒸发、
    不报任何错 —— 于是用户永远不知道自己的第 10 张图（很可能正是角色定妆照）被丢了，
    只觉得「AI 画错人了」。少发一张图 = 角色画错，比失败更糟。
    """
    with pytest.raises(ReferenceImageError) as err:
        wrap_seedance_payload_for_newapi(_seedance_body_with_images(MAX_REFERENCE_IMAGES + 1))
    message = str(err.value)
    # 报错要说清有多少张、 trần là bao nhiêu、bị bỏ bao nhiêu
    assert str(MAX_REFERENCE_IMAGES + 1) in message
    assert str(MAX_REFERENCE_IMAGES) in message
    assert "1" in message
    # 报错文案要让人知道这不是"没生成"，而是"图太多了"
    assert "ảnh" in message


def test_wrap_seedance_payload_rejects_far_over_limit_reference_images():
    """远超上限（12 张）同样报错，并且说清会被丢掉几张。"""
    with pytest.raises(ReferenceImageError) as err:
        wrap_seedance_payload_for_newapi(_seedance_body_with_images(12))
    message = str(err.value)
    assert "12" in message
    assert str(12 - MAX_REFERENCE_IMAGES) in message


def test_wrap_seedance_payload_dedups_before_counting_the_limit():
    """重复图先去重再去数张数：10 个 URL 里只有 8 个不同地址 → 放行。

    反过来不行：上游按张数计费，同一张图发 10 次会当成 10 张。
    """
    body = _seedance_body_with_images(MAX_REFERENCE_IMAGES)
    # 把第 0 张重复塞一遍 → 10 个条目，但只有 9 个不同地址 → 仍然合法
    body["content"].append(
        {
            "type": "image_url",
            "image_url": {"url": "https://cdn.example.com/0.png"},
            "role": "reference_image",
        }
    )
    assert len(body["content"]) == MAX_REFERENCE_IMAGES + 2  # text + 9 图 + 1 重复
    wrapped = wrap_seedance_payload_for_newapi(body)
    refs = wrapped["metadata"]["input"]["reference_image_urls"]
    assert len(refs) == MAX_REFERENCE_IMAGES
    assert len(set(refs)) == len(refs)


def test_wrap_seedance_payload_rejects_ten_first_frame_images_too():
    """不只多参考图会超限：纯首/尾帧路径同样走这里，也必须报错而不是截断。"""
    with pytest.raises(ReferenceImageError):
        wrap_seedance_payload_for_newapi(
            _seedance_body_with_images(MAX_REFERENCE_IMAGES + 1, role="first_frame")
        )


def test_prepare_video_create_body_only_wraps_tokenfree():
    body = {"model": "seedance-2-5", "content": [{"type": "text", "text": "hi"}], "duration": 5}
    ark = prepare_video_create_body(
        body,
        base_url="https://ark.cn-beijing.volces.com/api/v3",
    )
    tf = prepare_video_create_body(body, base_url=TOKENFREE_BASE_URL)
    assert ark["content"][0]["text"] == "hi"
    assert tf["prompt"] == "hi"
    assert tf["metadata"]["input"]["duration"] == "5"
    assert tf["metadata"]["input"]["content"] == body["content"]


# ---- 原生方舟渠道的张数闸门（漫剧分镜实际走的那条路） ----


def _native_ark_client() -> ArkGateway:
    """原生方舟渠道的 client，且 mock 关掉（``mock`` 是只读 property）。"""
    from app.config import get_settings

    settings = get_settings().model_copy(
        update={
            "ark_base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "ark_mock": False,
            "ark_api_key": "test-dummy-not-a-real-key",
        }
    )
    client = ArkGateway(settings=settings)
    assert client.mock is False
    return client


@pytest.mark.asyncio
async def test_gen_video_seedance_body_rejects_ten_images_on_native_ark():
    """漫剧走 gen_video_seedance_body；原生方舟上原本**完全没有**张数闸门。

    TokenFree 那条路有 wrap_seedance_payload_for_newapi 兜底，原生方舟没有，
    于是同一份 10 图请求在两个渠道上一个报错、一个照发——10 张全丢给上游，
    上游要么拒要么只取前几张，用户看到的都不是可读报错。
    """
    client = _native_ark_client()
    body = _seedance_body_with_images(MAX_REFERENCE_IMAGES + 1)

    async def _must_not_resolve(items, *, project_id=0):
        raise AssertionError("不该做 URL 解析：超限要在解析之前就拒掉")

    client._resolve_seedance_content_items = _must_not_resolve
    with pytest.raises(ReferenceImageError) as err:
        await client.gen_video_seedance_body(body, project_id=0)
    assert str(MAX_REFERENCE_IMAGES + 1) in str(err.value)


@pytest.mark.asyncio
async def test_gen_video_seedance_body_allows_nine_images_on_native_ark():
    """闸门不能误伤合法请求：刚好 9 张照常往下走。"""
    client = _native_ark_client()
    body = _seedance_body_with_images(MAX_REFERENCE_IMAGES)

    async def _passthrough(items, *, project_id=0):
        return list(items)

    client._resolve_seedance_content_items = _passthrough
    client._resolve_ark_route = lambda capability, model_id: None
    client._route_url = lambda path, route=None: "https://ark.example.com" + path
    client._route_headers = lambda route=None: {}

    sent: dict = {}

    class _Resp:
        status_code = 200

        @staticmethod
        def json():
            return {"task_id": "t-1"}

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, *, headers=None, json=None):
            sent["json"] = json
            return _Resp()

    import app.services.ark as ark_module

    original = ark_module.httpx.AsyncClient
    ark_module.httpx.AsyncClient = lambda **kwargs: _Client()
    try:
        task_id = await client.gen_video_seedance_body(body, project_id=0)
    finally:
        ark_module.httpx.AsyncClient = original

    assert task_id == "t-1"
    images = [
        item["image_url"]["url"]
        for item in sent["json"]["content"]
        if item.get("type") == "image_url"
    ]
    assert len(images) == MAX_REFERENCE_IMAGES


def test_ensure_within_reference_image_limit_dedups_itself():
    """去重收在函数内部，调用方漏做也不会误拒合法请求。"""
    urls = [f"https://cdn.example.com/{i % MAX_REFERENCE_IMAGES}.png" for i in range(20)]
    assert ensure_within_reference_image_limit(urls) == [
        f"https://cdn.example.com/{i}.png" for i in range(MAX_REFERENCE_IMAGES)
    ]


def test_ensure_within_reference_image_limit_rejects_over_limit():
    urls = [f"https://cdn.example.com/{i}.png" for i in range(MAX_REFERENCE_IMAGES + 1)]
    with pytest.raises(ReferenceImageError) as err:
        ensure_within_reference_image_limit(urls)
    assert str(MAX_REFERENCE_IMAGES + 1) in str(err.value)
    assert str(MAX_REFERENCE_IMAGES) in str(err.value)


def test_extract_video_task_id_from_newapi_and_wrapped_data():
    assert extract_video_task_id({"task_id": "abc"}) == "abc"
    assert extract_video_task_id({"id": "ark-1"}) == "ark-1"
    assert extract_video_task_id({"data": {"task_id": "nested"}}) == "nested"
    assert extract_video_task_id({"id": "video_123", "task_id": "abcd"}) == "abcd"
    assert extract_video_task_id({"id": "outer", "data": {"task_id": "nested", "status": "queued"}}) == "nested"
    assert extract_video_task_id({"code": "success", "data": "cgt-xxx"}) == "cgt-xxx"


def test_build_task_result_from_newapi_completed_url():
    result = _build_task_result_from_payload(
        {
            "task_id": "abcd",
            "status": "completed",
            "url": "https://example.com/video.mp4",
        }
    )
    assert result.status == "succeeded"
    assert result.url == "https://example.com/video.mp4"


def test_build_task_result_from_newapi_nested_data():
    result = _build_task_result_from_payload(
        {
            "data": {
                "status": "succeeded",
                "content": {"video_url": "https://example.com/ark.mp4"},
            }
        }
    )
    assert result.status == "succeeded"
    assert result.url == "https://example.com/ark.mp4"


def test_ark_client_tokenfree_video_url():
    from app.config import get_settings

    settings = get_settings().model_copy(update={"ark_base_url": TOKENFREE_BASE_URL})
    client = ArkGateway(settings=settings)
    assert client._url("/contents/generations/tasks") == f"{TOKENFREE_BASE_URL}/videos"
    assert client._url("/contents/generations/tasks/t1") == f"{TOKENFREE_BASE_URL}/videos/t1"
    wrapped = client._video_json(
        {
            "model": "seedance-2-5",
            "content": [{"type": "text", "text": "hi"}],
            "duration": 5,
            "ratio": "16:9",
        }
    )
    assert wrapped["prompt"] == "hi"
    assert wrapped["metadata"]["input"]["duration"] == "5"
    assert wrapped["metadata"]["input"]["aspect_ratio"] == "16:9"
    finalized = client._finalize_video_result(
        _build_task_result_from_payload({"status": "completed"}),
        "task-9",
    )
    assert finalized.status == "succeeded"
    assert finalized.url == f"{TOKENFREE_BASE_URL}/videos/task-9/content"
