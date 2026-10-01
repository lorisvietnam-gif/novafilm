"""Bộ biên dịch prompt theo model — GET hồ sơ, POST biên dịch.

Không tốn credit, không gọi model, không ghi database: chỉ đọc hồ sơ tĩnh và ghép
prompt. Đó là chủ ý — đầu ra của bản beta là prompt người dùng tự đi render.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.models import User
from app.services.model_prompt_compiler import (
    REFERENCE_KINDS,
    SceneConfig,
    SceneReference,
    UnknownModelError,
    compile_prompt,
)
from app.services.model_prompt_profiles import list_profiles

router = APIRouter()


class SceneReferenceBody(BaseModel):
    label: str = ""
    url: str = ""
    kind: str = "character"


class SceneDialogueBody(BaseModel):
    speaker: str = ""
    text: str = ""


class SceneBody(BaseModel):
    subject: str = ""
    action: str = ""
    setting: str = ""
    shot_size: str = ""
    camera: str = ""
    light: str = ""
    style: str = ""
    narration: str = ""
    dialogue: list[SceneDialogueBody] = Field(default_factory=list)
    references: list[SceneReferenceBody] = Field(default_factory=list)
    continuity_frame_url: str = ""
    burn_subtitles: bool = True
    avoid: list[str] = Field(default_factory=list)


class CompilePromptBody(BaseModel):
    model: str
    scene: SceneBody = Field(default_factory=SceneBody)
    aspect_ratio: str = ""
    duration_sec: int = 8
    resolution: str = ""


def _to_scene(body: SceneBody) -> SceneConfig:
    return SceneConfig(
        subject=body.subject,
        action=body.action,
        setting=body.setting,
        shot_size=body.shot_size,
        camera=body.camera,
        light=body.light,
        style=body.style,
        narration=body.narration,
        dialogue=[(d.speaker, d.text) for d in body.dialogue],
        references=[
            SceneReference(
                label=r.label,
                url=r.url,
                kind=r.kind if r.kind in REFERENCE_KINDS else "character",
            )
            for r in body.references
        ],
        continuity_frame_url=body.continuity_frame_url,
        burn_subtitles=body.burn_subtitles,
        avoid=[a for a in body.avoid if a and a.strip()],
    )


@router.get("/prompt-compiler/profiles")
async def prompt_compiler_profiles(
    user: User = Depends(get_current_user),
) -> dict:
    return {"models": list_profiles()}


@router.post("/prompt-compiler/compile")
async def prompt_compiler_compile(
    body: CompilePromptBody,
    user: User = Depends(get_current_user),
) -> dict:
    try:
        result = compile_prompt(
            body.model,
            _to_scene(body.scene),
            aspect_ratio=body.aspect_ratio,
            duration_sec=body.duration_sec,
            resolution=body.resolution,
        )
    except UnknownModelError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result.to_dict()
