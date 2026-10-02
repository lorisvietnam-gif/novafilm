"""Pydantic schemas for the drama module."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas_tasks import TaskRunBriefOut


class DramaProjectCreate(BaseModel):
    title: str = Field(default="Dự án drama chưa có tên", max_length=200)
    description: str | None = None
    source: str = Field(default="", description="原始创意文案")
    episode_count: int = Field(default=12, ge=1, le=120)
    image_style_id: str = Field(default="")
    # script = outline/episode flow; canvas = free canvas
    workflow: str = Field(default="script", description="script | canvas")
    params: dict[str, Any] | None = None


class DramaProjectUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    content: dict | list | None = None
    params: dict[str, Any] | None = None


class DramaScriptOut(BaseModel):
    id: int
    name: str
    source: str | None = None
    summary: dict | None = None
    episode_content: dict | list | None = None
    params: dict | None = None
    project_id: int

    model_config = {"from_attributes": True}


class DramaAssetOut(BaseModel):
    id: int
    type: str
    asset_type: str
    name: str | None = None
    cover: str | None = None
    url: str | None = None
    params: dict | None = None
    derive_id: str | None = None
    project_id: int
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class DramaProjectUsageStats(BaseModel):
    """Cumulative usage for one drama: cost plus image/video generation counts."""

    charge_fen: int = 0
    charge_yuan: float = 0.0
    cost_fen: int = 0
    cost_yuan: float = 0.0
    tokens: int = 0
    calls: int = 0
    image_gens: int = 0
    video_gens: int = 0


class SeedAssetsFromScriptOut(BaseModel):
    """Result statistics from extracting or refreshing assets out of a script."""

    assets: list[DramaAssetOut] = Field(default_factory=list)
    created_count: int = 0
    prompts_refreshed: int = 0
    props_updated: int = 0
    llm_errors: list[str] = Field(default_factory=list)
    status: str = "done"
    message: str | None = None


class DramaFragmentOut(BaseModel):
    id: int
    episode_id: int
    sort_order: int
    content: str
    cover: str = ""
    video: str = ""
    duration_sec: int | None = None
    params: dict | None = None
    asset_ids: list[int] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class DramaEpisodeOut(BaseModel):
    id: int
    name: str
    params: dict | None = None
    project_id: int
    fragments: list[DramaFragmentOut] = Field(default_factory=list)
    active_tasks: list[TaskRunBriefOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class DramaEpisodeUpdate(BaseModel):
    name: str | None = None
    params: dict | None = None


class DramaProjectOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: str | None = None
    content: dict | list | None = None
    params: dict | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    script: DramaScriptOut | None = None
    asset_count: int = 0
    episode_count: int = 0
    # script | canvas
    workflow: str = "script"
    usage: DramaProjectUsageStats = Field(default_factory=lambda: DramaProjectUsageStats())
    active_tasks: list[TaskRunBriefOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class DramaProjectListItem(BaseModel):
    id: int
    title: str
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    episode_count: int = 0
    asset_count: int = 0
    has_script: bool = False
    cover_url: str | None = None
    cover_pending: bool = False
    # script | canvas
    workflow: str = "script"
    usage: DramaProjectUsageStats = Field(default_factory=lambda: DramaProjectUsageStats())
    active_tasks: list[TaskRunBriefOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class DramaScriptSummaryRequest(BaseModel):
    project_id: int
    creative: str | None = None
    episode_count: int | None = None
    image_style_id: str | None = None


class DramaEpisodeScriptRequest(BaseModel):
    project_id: int
    # Same as the original project: generate one episode at a time by default, to reduce the risk of a timeout or truncation producing "only half"
    batch_size: int = Field(default=1, ge=1, le=12)
    # Force a rewrite: clear the existing body (keeping the episode title), then regenerate with the new prompt
    force: bool = False
    # Optimise or generate only this one episode; used together with draft for "paste a script -> AI optimise"
    episode_number: int | None = Field(default=None, ge=1, le=120)
    draft: str | None = Field(default=None, max_length=50000)
    # optimize = refine the draft; summary = idea -> summary; body = idea + summary -> body; full = one-click summary + body; brief = body -> idea + summary
    generate_mode: str | None = Field(default=None, max_length=32)
    # Optional: store this episode's idea before generating (and persist it)
    creative: str | None = Field(default=None, max_length=20000)
    title: str | None = Field(default=None, max_length=40)


class DramaAddEpisodeRequest(BaseModel):
    project_id: int
    title: str | None = Field(default=None, max_length=40)


class DramaConfirmEpisodeRequest(BaseModel):
    project_id: int
    episode_number: int = Field(ge=1, le=120)


class DramaConfirmEpisodeOut(BaseModel):
    episode: DramaEpisodeOut
    assets_status: str = "done"
    created_count: int = 0


class DramaAssetCreate(BaseModel):
    project_id: int
    type: str = "none"
    asset_type: str = "image"
    name: str | None = None
    cover: str | None = None
    url: str | None = None
    params: dict | None = None


class DramaAssetUpdate(BaseModel):
    type: str | None = None
    asset_type: str | None = None
    name: str | None = None
    cover: str | None = None
    url: str | None = None
    params: dict | None = None


class DramaImageGenerateRequest(BaseModel):
    project_id: int
    asset_id: int | None = None
    prompt: str
    name: str | None = None
    asset_type_kind: str = "character"
    # Built-in style id (optional; falls back to the project's or the script's params.image_style_id)
    image_style_id: str | None = None
    # Front-end model id: seedream-5.0 / seedream-4.5
    model_id: str | None = None
    # Output aspect ratio; 3:4 is the default for characters
    aspect_ratio: str | None = None
    # Resolution 3K / 4K
    resolution: str | None = None


class DramaVideoGenerateRequest(BaseModel):
    project_id: int
    asset_id: int
    prompt: str
    # Front-end short name seedance-2.5 / seedance-1.5, or the full endpoint name
    model_id: str | None = None
    aspect_ratio: str | None = None
    resolution: str | None = None
    duration_sec: int | None = None
    image_style_id: str | None = None
    # Reference assets dragged in on the canvas (merged with @asset:id in the body)
    reference_asset_ids: list[int] = Field(default_factory=list)


class DramaVoicePromptRequest(BaseModel):
    project_id: int
    asset_id: int


class DramaVoiceGenerateRequest(BaseModel):
    project_id: int
    asset_id: int | None = None
    name: str | None = None
    voice_prompt: str = Field(description="音色描述，用于 TTS 试听与 Seedance reference_audio")
    sample_text: str | None = Field(default=None, description="试听台词，缺省自动生成")
    speaker: str | None = Field(default=None, description="可选 TTS speaker 覆盖")
    character_asset_id: int | None = Field(
        default=None,
        description="关联角色资产 ID，用于 voice_design image_prompt",
    )


class DramaFragmentSaveItem(BaseModel):
    id: int | None = None
    sort_order: int = 0
    content: str = ""
    cover: str = ""
    video: str = ""
    duration_sec: int | None = None
    params: dict | None = None
    asset_ids: list[int] = Field(default_factory=list)


class DramaSaveFragmentsRequest(BaseModel):
    fragments: list[DramaFragmentSaveItem]


class DramaGenerateRequest(BaseModel):
    fragment_ids: list[int] | None = None
    # Video model: a catalogue id from the admin-configured TokenFree list
    model_id: str | None = Field(default=None, max_length=64)


class DramaComposeEpisodeRequest(BaseModel):
    # fragment_ids only concatenates the listed fragments; None means every fragment in this episode that already has a video
    fragment_ids: list[int] | None = None


class DramaPlanFragmentsRequest(BaseModel):
    # force whether to overwrite existing videos and hand-edited fragments (defaults to true for a per-episode AI re-split)
    force: bool = True
    # fallback_rules whether to fall back to rule-based splitting when the LLM fails
    fallback_rules: bool = True
    # skill_ids the Agent Skills to inject this time; None means every enabled one, [] means inject nothing
    skill_ids: list[int] | None = None
    # subtitle_enabled whether to inject subtitle hints into this storyboard; None keeps the episode's current setting
    subtitle_enabled: bool | None = None


class DramaActivateVideoVersionRequest(BaseModel):
    # version_id the archived film version id (params.video_versions[].id)
    version_id: str = Field(..., min_length=1, max_length=128)


class DramaActivateImageVersionRequest(BaseModel):
    # version_id the archived asset-look version id (params.image_versions[].id)
    version_id: str = Field(..., min_length=1, max_length=128)


class DramaCanvasSaveRequest(BaseModel):
    project_id: int
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class DramaChatRequest(BaseModel):
    message: str
    project_id: int | None = None


class DramaRouteRequest(BaseModel):
    message: str
