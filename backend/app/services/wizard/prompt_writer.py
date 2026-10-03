# -*- coding: utf-8 -*-
"""`/wizard` — soạn prompt tiếng Anh cho Veo từ một câu ý tưởng.

Module này **tự chỉ định model**: nó đọc thẳng channel `text-openai` trong routing
snapshot rồi gọi `_chat_completions_once` với `base` / `api_key` / `model` tường minh.
Không đụng vào cấu hình mặc định của hệ thống — đó là điểm của việc endpoint này
tồn tại độc lập. `llm_client.chat_completions` không dùng được ở đây vì nó gọi
`resolve_logical_model(capability, None)` và luôn rơi về model chữ mặc định.

## Vì sao có chuỗi model thay vì một model cứng
Đo thật 2026-10-02 trên `text-openai` (lúc đó base là `https://kiraai.vn/api/v1`):

    gemini-3-flash-preview -> HTTP 403 {"code":"model_not_allowed"}
    gemini-3.5-flash      -> HTTP 403 {"code":"model_not_allowed"}

Khoá Kira không có quyền Gemini nào, nên bản brief ghi "đo gemini-3-flash-preview →
200 OK" **không còn đúng** với cấu hình hiện tại. Chuỗi model giữ gemini ở đầu (đúng
ý brief, và sẽ tự dùng lại ngay khi board cấp lại khoá Google), rồi mới thử các
model đã đo được là chạy. Model nào bị từ chối thì thử model kế tiếp, không phải
lỗi 503 cho người dùng.

## Thứ tự chuỗi là do đo, không do mặc định (2026-10-02)

Vận chuyển, 4 lần gọi mỗi model:

| model | stream=True | stream=False | ghi chú |
|---|---|---|---|
| `mimo-v2.6-flash-free` | 4/4, 52–82s | **1/4** (3 lần 504 ở tường 60s của nginx) | |
| `deepseek-v4-flash-free` | 4/4, 10–38s | 4/4 | nhanh nhất |

Bám cấu trúc, 3 câu (bữa mì / trẻ con đứng yên / cô gái dưới mưa), chấm "JSON hợp
lệ + đủ 7 nhãn":

| model | đạt | loại |
|---|---|---|
| `ling-3.0-flash-free` | **3/3** | miễn phí |
| `hy3` | 3/3 | **không** miễn phí, giá chưa đo ⇒ loại, xem report |
| `mimo-v2.6-flash-free` | 3/3 | miễn phí, chậm và hay 504 |
| `longcat-2.5-preview-free` | 2/3 | miễn phí, hay JSON hỏng |
| `laguna-s-2.1-free` | 2/3 | miễn phí, hay JSON hỏng |
| `laguna-xs-2.1-free` | 2/3 | miễn phí, có lần 429 |
| `hy4` | 1/3 | JSON hỏng |
| `deepseek-v4-flash-free` | 1/3 | thiếu nhãn `action` 2/3 lần |
| `qwen3.8-flash-next-free` | 0/4 | 504 cả khi có stream |
| `qwen3.8-27b-free` | 0/3 | DNS không phân giải ⇒ model không tồn tại |
| `space-bunny-alpha` | 0/3 | JSON hỏng / đứt kết nối |

`stream=True` là bắt buộc, đo được chứ không phải quy ước: `mimo` không stream thì
504 3/4 lần, có stream thì 4/4. Đó cũng là lý do `llm_client.py:203-209` không cho
tắt.

Chỉ những model `-free` mới được đưa vào chuỗi: `billing_llm_per_m` là giá suất
chung theo token chứ không theo model, nên gọi một model **không** miễn phí là
tiền thật với đơn giá chưa ai đo (AGENTS.md mục 10).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.services.llm_client import (
    LlmUnavailableError,
    LlmUpstreamError,
    _chat_completions_once,
    _llm_extra_body,
)
from app.services.model_settings import get_routing_snapshot

logger = logging.getLogger(__name__)

# Endpoint này gọi channel này. Đọc theo id, không dùng router: router chặn ở
# `channel.models` và nếu không khớp sẽ **âm thầm** trả về model chữ khác
# (đã xảy ra: docs/briefs/case-billing-charge-and-text-fallback-b4.md:60).
WIZARD_CHANNEL_ID = "text-openai"

# Thứ tự là thứ tự thử. Xem docstring để biết vì sao không chỉ có một model, và vì
# sao các model chết / không miễn phí bị loại.
WIZARD_MODEL_CHAIN: tuple[str, ...] = (
    # Đo 2026-10-03: khoá Kira trả `403 model_not_allowed` cho `gemini-3-flash-preview`,
    # `ling-3.0-flash-free` và `deepseek-v4-flash-free`. Danh sách được phép là
    # kira-mini-1.0, hy4, hy3, hy-image-v3.5-free, qwen3.8-*, mimo-v2.6-flash-free,
    # space-bunny-alpha, laguna-s-2.1-free, laguna-xs-2.1-free.
    # Chỉ đưa vào đây model **đã đo là chạy**; thêm model chết là mỗi lượt gọi mất một vòng
    # thử rồi vẫn 403.
    "hy3",  # đo 200, 1,06s
    "mimo-v2.6-flash-free",  # đo 200, 2,07s
    "hy4",  # đo 200, 4,20s
    "qwen3.8-flash-next-free",  # đo 200, 1,85s
)

# Một lần thử lại cho lỗi vận chuyển (ngắt giữa luồng, 429, 5xx). Không thử lại lỗi
# "model này không được phép" — thử lại y hệt là chờ thêm một vòng rồi vẫn 403.
TRANSPORT_ATTEMPTS = 2

# Nhãn mục bắt buộc. Brief yêu cầu đúng bộ này, theo thứ tự này.
PROMPT_FIELDS = (
    "subject",
    "action",
    "setting",
    "camera",
    "lighting",
    "style",
    "duration",
)

MAX_IDEA_CHARS = 2000
MAX_FRAMES = 4
# Chấm nhận nghiêm: đủ CẢ 7 nhãn và đúng thứ tự. Thiếu một nhãn là model đã viết
# văn xuôi — đúng cái làm model bịa chi tiết (nấm, cà rốt, cần). Đo 2026-10-02:
# `deepseek-v4-flash-free` thiếu `action` ở 2/3 câu, `mimo-v2.6-flash-free` 0/3.
REQUIRED_PROMPT_LABELS = 7
MIN_PROMPT_CHARS = 40

# Đích đến: trang `/wizard` KHÔNG gửi trường này (bước 3 chạy sau bước 2), nhưng hợp
# đồng trong brief có nó nên vẫn nhận. Giá trị lạ -> rơi về "veo".
TARGET_HINTS: dict[str, str] = {
    "veo": (
        "Write long and detailed: describe the camera movement, the lens, and the "
        "lighting precisely."
    ),
    "muse": "Keep each line short. Prioritise emotion and rhythm over technical detail.",
    "kling": (
        "Emphasise one continuous motion and describe the physics of it precisely."
    ),
    "seedance": "Split the idea into separate frames, one scene per frame.",
}

# Ký tự CJK + kana + fullwidth. Chặn cứng ở đây vì yêu cầu là prompt về sau đi vào
# ảnh/video: một nhãn tiếng Trung lọt vào là người dùng dán sang Veo và nhận text
# burn-in. Phải có cả kana (u3040-u30ff): chỉ quét Hán tự thì tiếng Nhật lọt lưới.
_CJK_RE = re.compile(
    r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]"
)
# Marker Seedance. Wizard không đi qua Seedance nên để lọt là sinh text trong video.
_SEEDANCE_MARKER_RE = re.compile(
    r"\u3010[^\u3011]*\u3011|@\s*duration\s*:\s*\d+(?:\.\d+)?\s*s?",
    re.IGNORECASE,
)
_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)
_LABEL_PREFIX_RE = re.compile(r"^\s*(?:[-*\u2022]\s*)?(?:\*\*)?([a-z][a-z ]*?)(?:\*\*)?\s*[:：]\s*", re.IGNORECASE)


class WizardPromptError(RuntimeError):
    """Sinh prompt thất bại. `status_code` để router trả đúng mã HTTP."""

    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass
class WizardDraft:
    prompt: str
    script: str = ""
    frames: list[dict[str, str]] = field(default_factory=list)
    model: str = ""


def _strip_seedance_markers(text: str) -> str:
    return _SEEDANCE_MARKER_RE.sub(" ", text or "")


def has_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(text or ""))


def sanitize_prompt_text(text: str) -> str:
    """Dọn một khối prompt về đúng dạng danh sách nhãn tiếng Anh.

    Bỏ marker Seedance, bỏ ký tự Trung, gộp khoảng trắng, giữ nguyên thứ tự dòng.
    Dòng nào sau khi bỏ mà trống hẳn thì rụng — thường là dòng model tự chế ra bằng
    tiếng Trung, giữ lại chỉ để lấp chỗ trống.
    """
    cleaned = _strip_seedance_markers(text or "")
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    for raw_line in cleaned.split("\n"):
        line = _CJK_RE.sub("", raw_line)
        line = re.sub(r"[ \t]+", " ", line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def count_prompt_labels(text: str) -> int:
    """Số nhãn cấu trúc nhận ra được. Dùng để chấm nhận chất lượng."""
    return len(_label_values(text))


def _label_values(text: str) -> dict[str, str]:
    """Nhãn -> nội dung. Nhãn lạ bị bỏ, không ghi đè nhãn đã có."""
    values: dict[str, str] = {}
    for line in (text or "").split("\n"):
        m = _LABEL_PREFIX_RE.match(line)
        if not m:
            continue
        label = m.group(1).strip().lower()
        value = line[m.end():].strip()
        if label in PROMPT_FIELDS and value and label not in values:
            values[label] = value
    return values


def normalize_prompt(text: str) -> str:
    """Dựng lại prompt đúng thứ tự nhãn.

    Model hay xáo thứ tự (đo: `deepseek-v4-flash-free` đặt `setting` trước `action`).
    Sửa ở đây rẻ hơn là đòi model làm đúng, và sửa thì không tốn token thêm.
    """
    values = _label_values(text)
    if not values:
        return ""
    return "\n".join(f"{label}: {values[label]}" for label in PROMPT_FIELDS if label in values)


def is_usable_prompt(text: str) -> bool:
    cleaned = sanitize_prompt_text(text)
    if has_cjk(cleaned) or len(cleaned) < MIN_PROMPT_CHARS:
        return False
    return len(_label_values(cleaned)) >= REQUIRED_PROMPT_LABELS


def _extract_json(raw: str) -> dict[str, Any]:
    """Lấy object JSON đầu tiên trong câu trả lời. Cùng cách `drama.llm` làm."""
    text = _FENCE_RE.sub("", (raw or "").strip())
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise WizardPromptError(
                "text model returned no JSON object", status_code=502
            ) from None
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise WizardPromptError(
                "text model returned malformed JSON", status_code=502
            ) from exc
    if not isinstance(data, dict):
        raise WizardPromptError("text model returned a non-object", status_code=502)
    return data


def _resolve_channel():
    snap = get_routing_snapshot()
    for ch in snap.channels:
        if ch.id == WIZARD_CHANNEL_ID and ch.enabled and (ch.api_key or "").strip():
            return ch
    raise WizardPromptError(
        f"channel {WIZARD_CHANNEL_ID} is not configured", status_code=503
    )


def build_messages(idea: str, language: str, target: str) -> tuple[str, str]:
    """Hệ thống + người dùng. Chất lượng prompt đặt ở đây, không phải ở model."""
    hint = TARGET_HINTS.get((target or "").strip().lower(), TARGET_HINTS["veo"])
    narration_language = "Vietnamese" if language == "vi" else "English"
    system = (
        "You write video prompts for Google Veo. You reply with raw JSON only, "
        "no prose, no markdown fences.\n"
        "\n"
        "Every prompt you write MUST be a labelled LIST in English, one field per "
        "line, in exactly this order:\n"
        "subject: ...\n"
        "action: ...\n"
        "setting: ...\n"
        "camera: ...\n"
        "lighting: ...\n"
        "style: ...\n"
        "duration: ...\n"
        "\n"
        "Hard rules, all measured, not stylistic preference:\n"
        "1. NEVER write prose or a paragraph. Never join two fields into one "
        "sentence.\n"
        "2. Describe ONLY what the idea states. Do not invent objects, props, food, "
        "colours, weather, time of day, or characters that the idea does not "
        "mention. A prompt that adds an unrequested detail is a failed prompt.\n"
        "3. English only. Never write Chinese characters or any CJK character.\n"
        "4. Never emit Seedance markers such as 【字幕】, 【旁白·…】 or @duration:8. "
        "This output goes to Veo, not to Seedance.\n"
        "5. Keep `duration` to a single value in seconds, for example "
        "'duration: 8 seconds'.\n"
        "\n"
        "Return exactly this JSON shape:\n"
        '{"script": "...", "prompt": "subject: ...\\naction: ...", '
        '"frames": [{"narration": "...", "prompt": "subject: ...\\naction: ..."}]}\n'
        "\n"
        "`prompt` is one shot. `frames` is the same idea split into at most "
        f"{MAX_FRAMES} consecutive shots, each with its own labelled prompt. "
        "`script` and `frames[].narration` are written in "
        f"{narration_language}. `prompt` and `frames[].prompt` are ALWAYS English. "
        f"\n{hint}"
    )
    user = (
        "Idea:\n"
        "<<<\n"
        f"{idea}\n"
        ">>>\n\n"
        "Write the JSON now."
    )
    return system, user


def _frames_from_reply(data: dict[str, Any]) -> list[dict[str, str]]:
    frames: list[dict[str, str]] = []
    raw_frames = data.get("frames")
    if not isinstance(raw_frames, list):
        return frames
    for item in raw_frames:
        if not isinstance(item, dict):
            continue
        prompt = sanitize_prompt_text(str(item.get("prompt") or ""))
        if not is_usable_prompt(prompt):
            continue
        narration = _strip_seedance_markers(str(item.get("narration") or ""))
        narration = _CJK_RE.sub("", narration)
        narration = re.sub(r"[ \t]+", " ", narration.replace("\n", " ")).strip()
        frames.append({"prompt": prompt, "narration": narration})
        if len(frames) >= MAX_FRAMES:
            break
    return frames


def _model_rejected(exc: BaseException) -> bool:
    """Model này không dùng được trên channel — thử model kế tiếp, đừng báo lỗi."""
    if isinstance(exc, LlmUpstreamError) and exc.status_code in (400, 403, 404):
        return True
    if isinstance(exc, LlmUnavailableError):
        return False
    text = str(exc).lower()
    return "model_not_allowed" in text or "does not have permission to use model" in text


def _transport_retryable(exc: BaseException) -> bool:
    """Lỗi vận chuyển thì thử lại model **cùng** đó được.

    Ngắt giữa luồng là thứ xảy ra thật trên channel này (`incomplete chunked read`),
    và `llm_client` chỉ tự thử lại một lần bên trong cho 429/5xx chứ không thử lại khi
    luồng bị cắt. Ở tầng endpoint thì thử lại một lần rồi mới kết luận model hỏng.
    """
    if isinstance(exc, LlmUpstreamError):
        return exc.status_code == 429 or exc.status_code >= 500
    return isinstance(exc, (httpx.HTTPError, RuntimeError))


async def _call_model(channel, model: str, system: str, user: str) -> str:
    payload: dict[str, Any] = {
        "model": model,
        "temperature": 0.4,
        "max_tokens": 4096,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    # Bắt buộc: không có reasoning_effort thì thinking của Gemini nuốt hết
    # max_tokens và content trả về rỗng (llm_client.py:73-78).
    payload.update(_llm_extra_body(model))
    # stream=True là bắt buộc: đo 2026-10-02, `mimo-v2.6-flash-free` không stream
    # thì 504 3/4 lần ở tường 60s của nginx, có stream thì 4/4.
    return await _chat_completions_once(
        payload,
        base=(channel.base_url or "").rstrip("/"),
        api_key=channel.api_key,
        model=model,
        timeout=180.0,
        stream=True,
    )


def _clean_narration(text: str) -> str:
    narration = _strip_seedance_markers(text or "")
    narration = _CJK_RE.sub("", narration)
    return re.sub(r"[ \t]+", " ", narration.replace("\n", " ")).strip()


def _frames_from_reply(data: dict[str, Any]) -> list[dict[str, str]]:
    frames: list[dict[str, str]] = []
    raw_frames = data.get("frames")
    if not isinstance(raw_frames, list):
        return frames
    for item in raw_frames:
        if not isinstance(item, dict):
            continue
        prompt = sanitize_prompt_text(str(item.get("prompt") or ""))
        if not is_usable_prompt(prompt):
            continue
        frames.append(
            {
                "prompt": normalize_prompt(prompt),
                "narration": _clean_narration(str(item.get("narration") or "")),
            }
        )
        if len(frames) >= MAX_FRAMES:
            break
    return frames


async def write_prompt(
    *, idea: str, language: str = "vi", target: str = "veo"
) -> WizardDraft:
    """Gọi model và trả về prompt tiếng Anh đã dọn. Ném `WizardPromptError` nếu hỏng."""
    trimmed = (idea or "").strip()
    if not trimmed:
        raise WizardPromptError("idea is empty", status_code=400)
    trimmed = trimmed[:MAX_IDEA_CHARS]

    channel = _resolve_channel()
    system, user = build_messages(trimmed, language, target)

    last_error: BaseException | None = None
    for model in WIZARD_MODEL_CHAIN:
        raw: str | None = None
        for attempt in range(1, TRANSPORT_ATTEMPTS + 1):
            try:
                raw = await _call_model(channel, model, system, user)
                break
            except Exception as exc:  # noqa: BLE001 - chuỗi model, thử rồi mới báo
                last_error = exc
                if _model_rejected(exc):
                    logger.warning(
                        "wizard: model %s bị từ chối trên channel %s, thử model kế tiếp: %s",
                        model,
                        WIZARD_CHANNEL_ID,
                        exc,
                    )
                    raw = None
                    break
                if attempt >= TRANSPORT_ATTEMPTS or not _transport_retryable(exc):
                    logger.warning(
                        "wizard: model %s lỗi vận chuyển (%s/%s): %s",
                        model,
                        attempt,
                        TRANSPORT_ATTEMPTS,
                        exc,
                    )
                    raw = None
                    break
                logger.warning(
                    "wizard: model %s lỗi vận chuyển lần %s/%s, thử lại: %s",
                    model,
                    attempt,
                    TRANSPORT_ATTEMPTS,
                    exc,
                )
        if raw is None:
            continue

        try:
            data = _extract_json(raw)
        except WizardPromptError as exc:
            last_error = exc
            logger.warning("wizard: model %s trả về JSON hỏng, thử model kế tiếp", model)
            continue

        prompt = normalize_prompt(sanitize_prompt_text(str(data.get("prompt") or "")))
        if not is_usable_prompt(prompt):
            # Thiếu nhãn cấu trúc nghĩa là model viết văn xuôi — đúng cái làm
            # model bịa chi tiết (nấm, cà rốt, cần). Thử model kế tiếp.
            last_error = WizardPromptError(
                f"model {model} returned an unstructured prompt", status_code=502
            )
            logger.warning("wizard: %s không trả về đủ 7 nhãn cấu trúc", model)
            continue

        script = _clean_narration(str(data.get("script") or ""))
        frames = _frames_from_reply(data)
        logger.info(
            "wizard: sinh prompt bằng model=%s prompt_chars=%d frames=%d",
            model,
            len(prompt),
            len(frames),
        )
        return WizardDraft(
            prompt=prompt, script=script, frames=frames, model=model
        )

    detail = f": {last_error}" if last_error else ""
    raise WizardPromptError(
        f"text model error: no usable model on channel {WIZARD_CHANNEL_ID}{detail}",
        status_code=502,
    )