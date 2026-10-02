# -*- coding: utf-8 -*-
"""`/wizard` — API cho trạm đẻ prompt. Router mới, không sửa luồng cũ."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.services.billing import record_line, run_billed_ephemeral
from app.services.billing.http import http_exception_for_value_error
from app.services.wizard.prompt_writer import WizardDraft, WizardPromptError, write_prompt

router = APIRouter(prefix="/wizard", tags=["wizard"])


class WizardGeneratePromptBody(BaseModel):
    idea: str = Field(min_length=1, max_length=4000)
    language: Literal["vi", "en"] = "vi"
    # Trang `/wizard` hiện KHÔNG gửi trường này (bước 3 chạy sau bước 2), nhưng hợp
    # đồng trong brief có nó. Không được bắt buộc — bắt buộc là 422 với mọi request
    # thật của trang.
    target: Literal["veo", "muse", "kling", "seedance"] = "veo"


class WizardFrameOut(BaseModel):
    prompt: str
    narration: str | None = None


class WizardGeneratePromptOut(BaseModel):
    # Bắt buộc và phải khác rỗng: `WizardPage` coi `prompt` rỗng là bước 2 thành
    # công mà không báo lỗi, tức là người dùng thấy trang "thành công" rỗng rụng.
    prompt: str
    script: str | None = None
    frames: list[WizardFrameOut] | None = None
    task_id: int | None = None


@router.post("/generate_prompt", response_model=WizardGeneratePromptOut)
async def generate_prompt(
    body: WizardGeneratePromptBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WizardGeneratePromptOut:
    async def _do() -> WizardDraft:
        draft = await write_prompt(
            idea=body.idea,
            language=body.language,
            target=body.target,
        )
        # Ghi bằng `record_line` chứ không `record_llm_chat_line`: hàm kia đóng cứng
        # `model=get_settings().model_llm` (billing/usage.py:104), tức là dòng
        # usage sẽ ghi sai model so với cái thật sự gọi.
        await record_line(
            db,
            user_id=user.id,
            billing_key="llm_chat",
            model=draft.model,
            tokens=0,
            estimated=True,
            domain="wizard",
        )
        return draft

    try:
        task, draft = await run_billed_ephemeral(
            db,
            user,
            domain="wizard",
            task_type="generate_prompt",
            executor=_do,
            payload={"target": body.target, "language": body.language},
            commit=True,
        )
    except ValueError as exc:
        raise http_exception_for_value_error(exc) from exc
    except WizardPromptError as exc:
        # detail theo đúng dạng `apiError.ts:57` đọc ("text model error: …") để
        # giao diện dịch sang tiếng Việt thay vì in thẳng câu tiếng Anh.
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return WizardGeneratePromptOut(
        prompt=draft.prompt,
        script=draft.script or None,
        frames=[WizardFrameOut(**f) for f in draft.frames] or None,
        task_id=task.id,
    )