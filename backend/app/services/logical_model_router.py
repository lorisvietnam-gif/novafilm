"""Resolve logical model requests to concrete upstream channels."""

from __future__ import annotations

from app.schemas_routing import DefaultModels, LogicalModel, LogicalModelCapability, ResolvedModelRoute, SystemModelChannel
from app.services.model_routing_config import (
    channel_connection_ready,
    channel_supports_model,
    infer_model_capability,
)
from app.services.model_settings import get_routing_snapshot


# 解析某逻辑模型的可用路由
def _routes_for_logical_model(
    logical: LogicalModel,
    capability: LogicalModelCapability,
    channels: list[SystemModelChannel],
    *,
    preferred_channel_id: str = "",
) -> list[ResolvedModelRoute]:
    bindings = sorted(
        [binding for binding in logical.bindings if binding.enabled],
        key=lambda binding: (
            0 if preferred_channel_id and binding.channel_id == preferred_channel_id else 1,
            binding.priority,
            -(binding.weight or 100),
            binding.id,
        ),
    )
    routes: list[ResolvedModelRoute] = []
    for binding in bindings:
        channel = next((item for item in channels if item.id == binding.channel_id), None)
        if not channel or not channel_connection_ready(channel):
            continue
        if not channel_supports_model(channel, binding.upstream_model):
            continue
        route = _build_route(capability, logical.id, binding.upstream_model, channel)
        if route:
            routes.append(route)
    return routes


# 解析逻辑模型到运行时路由（含 failover 候选列表）
def resolve_logical_model_candidates(
    capability: LogicalModelCapability,
    requested_model_id: str,
    *,
    preferred_channel_id: str = "",
) -> list[ResolvedModelRoute]:
    """按请求 ID 解析；不可用时回落到同能力任一可解析逻辑模型（通用模型）。"""
    snapshot = get_routing_snapshot()
    requested = (requested_model_id or "").strip()
    if not requested:
        requested = _default_model_id(snapshot.default_models, capability)

    if requested:
        logical = next(
            (
                model
                for model in snapshot.logical_models
                if model.enabled
                and model.capability == capability
                and model.id.lower() == requested.lower()
            ),
            None,
        )
        if logical:
            routes = _routes_for_logical_model(
                logical,
                capability,
                snapshot.channels,
                preferred_channel_id=preferred_channel_id,
            )
            if routes:
                return routes

    # 用户点名的上游模型在渠道清单里时，不要静默换成同能力的另一个逻辑模型
    if requested:
        direct = _direct_channel_routes(
            capability,
            requested,
            snapshot.channels,
            preferred_channel_id=preferred_channel_id,
        )
        if direct:
            return direct

    # 默认/请求模型失效时，回落到同能力第一个可解析模型（DeepSeek / Kimi / 其它兼容均可）
    for model in snapshot.logical_models:
        if not model.enabled or model.capability != capability:
            continue
        if requested and model.id.lower() == requested.lower():
            continue
        routes = _routes_for_logical_model(
            model,
            capability,
            snapshot.channels,
            preferred_channel_id=preferred_channel_id,
        )
        if routes:
            return routes

    if snapshot.logical_models:
        return []

    if not requested:
        return []
    return _direct_channel_routes(
        capability,
        requested,
        snapshot.channels,
        preferred_channel_id=preferred_channel_id,
    )


def _direct_channel_routes(
    capability: LogicalModelCapability,
    requested: str,
    channels: list[SystemModelChannel],
    *,
    preferred_channel_id: str = "",
) -> list[ResolvedModelRoute]:
    """按渠道 models 清单精确匹配用户点名的上游模型。"""
    ordered = list(channels)
    if preferred_channel_id:
        ordered = [
            *([item for item in channels if item.id == preferred_channel_id]),
            *[item for item in channels if item.id != preferred_channel_id],
        ]
    routes: list[ResolvedModelRoute] = []
    for channel in ordered:
        if not channel.enabled or not channel_connection_ready(channel):
            continue
        if not channel_supports_model(channel, requested):
            continue
        # TokenFree 渠道 protocol=openai；能力靠价目 tags + 名字推断，不再整渠道路径当 text
        if infer_model_capability(requested) != capability:
            continue
        route = _build_route(capability, requested, requested, channel)
        if route:
            routes.append(route)
    return routes


# 解析首选逻辑模型路由
def resolve_logical_model(
    capability: LogicalModelCapability,
    requested_model_id: str,
    *,
    preferred_channel_id: str = "",
) -> ResolvedModelRoute | None:
    candidates = resolve_logical_model_candidates(
        capability,
        requested_model_id,
        preferred_channel_id=preferred_channel_id,
    )
    return candidates[0] if candidates else None


# 将前端 alias 映射为逻辑模型 ID
def resolve_logical_model_id(
    capability: LogicalModelCapability,
    model_id: str | None,
) -> str:
    raw = (model_id or "").strip()
    aliases = _capability_aliases(capability)
    if not raw:
        snapshot = get_routing_snapshot()
        return _default_model_id(snapshot.default_models, capability) or raw
    return aliases.get(raw.lower(), raw)


def resolve_same_channel_failover_routes(
    capability: LogicalModelCapability,
    requested_model_id: str,
    *,
    limit: int = 3,
    preferred_channel_id: str = "",
) -> list[ResolvedModelRoute]:
    """首选路由 + **同一渠道**上的其它可用模型，凑成一条 failover 链。

    为什么需要它：`resolve_logical_model_candidates` 只覆盖**一个**逻辑模型的多个
    binding；而 `synchronize_logical_models_with_channels` 是按「渠道里登记过的上游
    模型」一个模型建一个逻辑模型。所以同一渠道上的多个文字模型各自是独立的逻辑
    模型 —— 首选那个被上游下线时，候选列表就只剩它自己，登记了备选也没人用得上
    （实测 2026-10-02 task 810：`mimo-v2.6-flash-free` 504，同渠道 `hy3`/`hy4`/
    `qwen3.8-flash-next-free` 都是 200）。

    为什么**限定同渠道**：跨渠道换模型等于在一次请求的中途换掉计费方。估价按
    首选模型算，实际用量却记到另一个 provider 的费率上，`settle_task` 会打出
    「多退少补」的差额告警，而用户从没同意过这件事。换网关是运维决定，不该由
    重试逻辑顺手做掉。
    """
    snapshot = get_routing_snapshot()
    cap = max(1, int(limit))
    requested = (requested_model_id or "").strip()

    primary = resolve_logical_model_candidates(
        capability,
        requested,
        preferred_channel_id=preferred_channel_id,
    )
    routes: list[ResolvedModelRoute] = []
    seen: set[tuple[str, str]] = set()
    for route in primary:
        seen.add((route.channel_id, route.upstream_model))
        routes.append(route)
        if len(routes) >= cap:
            return routes

    # 没有首选就直接收工：换渠道是运维决定，不由重试逻辑代劳。
    primary_channels = {route.channel_id for route in primary}
    if not primary_channels:
        return routes

    for model in snapshot.logical_models:
        if len(routes) >= cap:
            break
        if not model.enabled or model.capability != capability:
            continue
        if requested and model.id.lower() == requested.lower():
            continue
        for route in _routes_for_logical_model(
            model,
            capability,
            snapshot.channels,
            preferred_channel_id=preferred_channel_id,
        ):
            # 只收首选所在的渠道：跨渠道等于中途换计费方。
            if route.channel_id not in primary_channels:
                continue
            key = (route.channel_id, route.upstream_model)
            if key in seen:
                continue
            seen.add(key)
            routes.append(route)
            if len(routes) >= cap:
                break
    return routes


# 解析上游 endpoint（兼容旧 alias 逻辑）
def resolve_upstream_model(
    capability: LogicalModelCapability,
    model_id: str | None,
) -> str:
    logical_id = resolve_logical_model_id(capability, model_id)
    route = resolve_logical_model(capability, logical_id)
    if route:
        return route.upstream_model
    snapshot = get_routing_snapshot()
    fallback = _legacy_upstream_fallback(capability, model_id, snapshot.default_models)
    if fallback:
        return fallback
    from app.config import get_settings

    settings = get_settings()
    if capability == "text":
        return settings.model_llm
    if capability == "image":
        return settings.model_image
    if capability == "video":
        return settings.model_video
    return settings.model_audio


def _build_route(
    capability: LogicalModelCapability,
    logical_model_id: str,
    upstream_model: str,
    channel: SystemModelChannel,
) -> ResolvedModelRoute | None:
    api_key = channel.api_key or ""
    if channel.protocol != "volc_tts" and not api_key:
        return None
    protocol = channel.protocol if channel.protocol != "auto" else _auto_protocol(channel, upstream_model)
    return ResolvedModelRoute(
        capability=capability,
        logical_model_id=logical_model_id,
        upstream_model=upstream_model,
        channel_id=channel.id,
        channel_name=channel.name,
        base_url=(channel.base_url or "").rstrip("/"),
        api_key=api_key,
        protocol=protocol,
        api_format=channel.api_format,
    )


def _auto_protocol(channel: SystemModelChannel, upstream_model: str) -> str:
    explicit = (channel.protocol or "auto").lower()
    if explicit not in {"", "auto"}:
        return explicit
    cap = infer_model_capability(upstream_model)
    if cap == "audio":
        return "openai"
    if cap in {"image", "video"}:
        # TokenFree / New API 走 OpenAI 兼容根路径；方舟专有渠道仍用 ark 路径
        from app.services.tokenfree_gateway import TOKENFREE_CHANNEL_ID, TOKENFREE_BASE_URL

        base = (channel.base_url or "").rstrip("/").lower()
        if channel.id == TOKENFREE_CHANNEL_ID or TOKENFREE_BASE_URL.split("://")[-1].lower() in base:
            return "openai"
        return "ark"
    return "openai"


def _default_model_id(defaults: DefaultModels, capability: LogicalModelCapability) -> str:
    if capability == "text":
        return defaults.text_model
    if capability == "image":
        return defaults.image_model
    if capability == "video":
        return defaults.video_model
    return defaults.audio_model


def _capability_aliases(capability: LogicalModelCapability) -> dict[str, str]:
    if capability == "image":
        # 旧 UI 别名 → TokenFree 价目真实 id（逻辑模型与上游同名，不做换绑）
        return {
            "seedream-5.0": "seedream-5-0-pro",
            "seedream-5": "seedream-5-0-pro",
            "5.0": "seedream-5-0-pro",
            "seedream-4.5": "seedream-4-5",
            "seedream-4": "seedream-4-5",
            "4.5": "seedream-4-5",
        }
    if capability == "video":
        return {
            "seedance-2.5": "seedance-2.5",
            "seedance-2": "seedance-2",
            "seedance-1.5": "seedance-2",
            "seedance-1": "seedance-2",
        }
    return {}


def _legacy_upstream_fallback(
    capability: LogicalModelCapability,
    model_id: str | None,
    defaults: DefaultModels,
) -> str:
    from app.config import get_settings

    settings = get_settings()
    raw = (model_id or "").strip()
    if capability == "image":
        mid = raw.lower()
        if mid in {"", "seedream-5.0", "seedream-5", "5.0"}:
            route = resolve_logical_model("image", defaults.image_model or "seedream-5-0-pro")
            return route.upstream_model if route else settings.model_image
        if mid in {"seedream-4.5", "seedream-4", "4.5"}:
            route = resolve_logical_model("image", "seedream-4-5")
            return route.upstream_model if route else ((settings.model_image_45 or "").strip() or settings.model_image)
        return raw or settings.model_image
    if capability == "video":
        aliases = _capability_aliases("video")
        logical = aliases.get(raw.lower(), raw) if raw else defaults.video_model
        route = resolve_logical_model("video", logical or defaults.video_model)
        if route:
            return route.upstream_model
        if logical == "seedance-2":
            return (settings.model_video_2 or "").strip() or settings.model_video
        return settings.model_video or (settings.model_video_2 or "").strip()
    return raw
