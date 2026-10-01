# -*- coding: utf-8 -*-
"""Bộ biên dịch prompt theo hồ sơ model.

Nguyên tắc
----------
1. Không có hồ sơ ⇒ không có prompt tối ưu. Model chưa được xác minh thì phát prompt
   trung tính kèm cảnh báo, không phát prompt "có vẻ chuyên nghiệp" rồi bịa.
2. Với Seedance, prompt dựng bằng đúng những hàm mà sản phẩm đang dùng để gửi đi
   (``build_seedance_production_section``, ``replace_duration_with_time_ranges``, các
   khối ``【强制约束：…】``). Nhờ vậy prompt người dùng dán ra ngoài **giống hệt** prompt
   hệ thống gửi, chứ không phải một bản "viết lại cho có".
3. Mọi giá trị bị kẹp đều kèm cảnh báo có mã; giao diện dịch mã đó sang tiếng Việt/Anh/
   Trung. Không có cảnh báo nào chỉ để nhớ.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.model_prompt_profiles import (
    CompilerHints,
    ModelPromptProfile,
    ProfileFact,
    get_profile,
)
from app.services.seedance_segments import (
    DIALOGUE_PREFIX,
    NARRATION_PREFIX,
    SEGMENT_DURATION_MAX,
    SEGMENT_DURATION_MIN,
    VISUAL_PREFIX,
    build_seedance_production_section,
    clamp_segment_duration,
    estimate_narration_duration,
    estimate_visual_duration,
    replace_duration_with_time_ranges,
)

# Trường hợp reference media trong prompt Seedance
SEEDANCE_VISUAL_CUE = VISUAL_PREFIX
SEEDANCE_VISUAL_SHOT_LABEL = "画面"
REFERENCE_KINDS = ("character", "scene", "prop")

DEFAULT_DURATION_SEC = 6


@dataclass
class SceneReference:
    """Một ảnh tham chiếu mà người dùng định gửi kèm."""

    label: str
    url: str
    kind: str = "character"


@dataclass
class SceneConfig:
    """Cấu hình cảnh do người dùng dàn — đầu vào trung tính, không theo model nào."""

    subject: str = ""
    action: str = ""
    setting: str = ""
    shot_size: str = ""
    camera: str = ""
    light: str = ""
    style: str = ""
    narration: str = ""
    dialogue: list[tuple[str, str]] = field(default_factory=list)
    references: list[SceneReference] = field(default_factory=list)
    continuity_frame_url: str = ""
    burn_subtitles: bool = True
    avoid: list[str] = field(default_factory=list)

    def visual_line(self, *, include_shot_size: bool = True) -> str:
        """Câu hình hình ảnh, ghép từ các thành phần người dùng đã điền."""
        parts: list[str] = []
        if include_shot_size and self.shot_size.strip():
            parts.append(self.shot_size.strip())
        parts.extend(
            b.strip()
            for b in (self.subject, self.action, self.setting, self.light, self.style)
            if b and b.strip()
        )
        return "，".join(parts)


@dataclass
class CompileWarning:
    code: str
    detail: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "detail": self.detail}


@dataclass
class CompileResult:
    model: str
    label: str
    readiness: str
    compiler_mode: str
    prompt: str
    parameters: dict[str, Any]
    warnings: list[CompileWarning] = field(default_factory=list)
    evidence_counts: dict[str, int] = field(default_factory=dict)
    # Các mục hồ sơ liên quan tới việc dựng prompt này, để giao diện hiện kèm.
    used_facts: list[ProfileFact] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "model": self.model,
            "label": self.label,
            "readiness": self.readiness,
            "compiler_mode": self.compiler_mode,
            "prompt": self.prompt,
            "parameters": self.parameters,
            "warnings": [w.to_dict() for w in self.warnings],
            "evidence_counts": dict(self.evidence_counts),
            "used_facts": [f.to_dict() for f in self.used_facts],
        }


# ---------------------------------------------------------------------------
# Kẹp tham số theo hồ sơ — mọi lần kẹp đều sinh cảnh báo
# ---------------------------------------------------------------------------


def _pick_ratio(
    requested: str, hints: CompilerHints, warnings: list[CompileWarning]
) -> str:
    raw = (requested or "").strip()
    allowed = list(hints.aspect_ratios)
    if not allowed:
        if raw:
            warnings.append(
                CompileWarning("aspect_ratio_unverified", raw)
            )
        return raw
    if not raw:
        return allowed[0]
    if raw in allowed:
        return raw
    warnings.append(CompileWarning("aspect_ratio_clamped", f"{raw} → {allowed[0]}"))
    return allowed[0]


def _pick_resolution(
    requested: str, hints: CompilerHints, warnings: list[CompileWarning]
) -> str:
    raw = (requested or "").strip()
    allowed = list(hints.resolutions)
    if not allowed:
        if raw:
            warnings.append(CompileWarning("resolution_unverified", raw))
        return raw
    if not raw:
        return allowed[-1]
    if raw in allowed:
        return raw
    warnings.append(CompileWarning("resolution_clamped", f"{raw} → {allowed[-1]}"))
    return allowed[-1]


def _pick_duration(
    requested: int, hints: CompilerHints, warnings: list[CompileWarning]
) -> int:
    raw = int(requested or DEFAULT_DURATION_SEC)
    if hints.duration_values:
        allowed = list(hints.duration_values)
        if raw in allowed:
            return raw
        nearest = min(allowed, key=lambda v: (abs(v - raw), v))
        warnings.append(CompileWarning("duration_snapped", f"{raw}s → {nearest}s"))
        return nearest
    lo, hi = hints.duration_min, hints.duration_max
    if lo <= 0 or hi <= 0:
        if raw < 1:
            warnings.append(CompileWarning("duration_unverified", f"{raw}s"))
            return max(1, raw)
        return raw
    clamped = max(lo, min(raw, hi))
    if clamped != raw:
        warnings.append(CompileWarning("duration_clamped", f"{raw}s → {clamped}s"))
    return clamped


def _fact(profile: ModelPromptProfile, key: str) -> ProfileFact | None:
    for group in (profile.dialect, profile.parameters, profile.references):
        for f in group:
            if f.key == key:
                return f
    return None


# ---------------------------------------------------------------------------
# Seedance — dựng bằng đúng hàm mà sản phẩm đang dùng để gửi đi
# ---------------------------------------------------------------------------


def _split_seedance_durations(
    scene: SceneConfig, total: int
) -> tuple[list[tuple[int, Any]], list[CompileWarning]]:
    """Chia thời lượng cho các đoạn, ưu tiên giữ đúng tổng mà người dùng chọn."""
    warnings: list[CompileWarning] = []
    segments: list[tuple[int, str]] = []

    visual = scene.visual_line()
    if visual:
        segments.append((estimate_visual_duration(visual), scene))
    if scene.narration.strip():
        segments.append((estimate_narration_duration(scene.narration.strip()), "narration"))
    for speaker, line in scene.dialogue:
        clean = (line or "").strip()
        if not clean:
            continue
        segments.append((estimate_narration_duration(clean), (speaker or "", clean)))
    if not segments:
        segments.append((SEGMENT_DURATION_MIN, ""))

    budget = max(SEGMENT_DURATION_MIN, int(total))
    natural = [clamp_segment_duration(d) for d, _ in segments]
    floor = SEGMENT_DURATION_MIN * len(natural)
    if budget < floor:
        # Không nén được dưới mức mỗi đoạn tối thiểu — nói thẳng thay vì cắt cụt.
        warnings.append(
            CompileWarning("segments_overflow", f"{budget}s < {floor}s tối thiểu cho "
                                               f"{len(natural)} đoạn")
        )
        natural = [SEGMENT_DURATION_MIN] * len(natural)
    elif sum(natural) > budget:
        # Chia tỉ lệ theo số giây tự nhiên, mỗi đoạn không dưới mức tối thiểu.
        scaled: list[int] = []
        for dur in natural:
            scaled.append(max(SEGMENT_DURATION_MIN, round(dur * budget / sum(natural))))
        while sum(scaled) > budget:
            idx = max(range(len(scaled)), key=lambda i: scaled[i])
            if scaled[idx] <= SEGMENT_DURATION_MIN:
                break
            scaled[idx] -= 1
        warnings.append(CompileWarning("segments_scaled", f"{sum(natural)}s → {budget}s"))
        natural = scaled
    elif sum(natural) < budget:
        # Phần thừa nhường cho đoạn hình ảnh để cảnh không bị cụt.
        spare = min(SEGMENT_DURATION_MAX - natural[0], budget - sum(natural))
        if spare > 0:
            natural[0] += spare
            warnings.append(CompileWarning("segments_extended", f"+{spare}s"))

    out = [(dur, payload) for dur, (_, payload) in zip(natural, segments)]
    return out, warnings


def _seedance_body(scene: SceneConfig, total: int) -> tuple[str, list[CompileWarning]]:
    """Phần thân có nhãn cue và mốc thời gian, đúng cách hệ thống đang viết."""
    segments, warnings = _split_seedance_durations(scene, total)
    lines: list[str] = []
    elapsed = 0
    for dur, payload in segments:
        start, end = elapsed, elapsed + dur
        elapsed = end
        if isinstance(payload, SceneConfig):
            visual = payload.visual_line()
            if not visual:
                continue
            lines.append(f"@duration:{dur}")
            lines.append(f"{SEEDANCE_VISUAL_CUE}{visual}")
        elif payload == "narration":
            lines.append(f"@duration:{dur}")
            lines.append(f"{NARRATION_PREFIX}{scene.narration.strip()}")
        elif isinstance(payload, tuple):
            speaker, line = payload
            lines.append(f"@duration:{dur}")
            lines.append(f"{DIALOGUE_PREFIX}{speaker}：{line}" if speaker else f"{DIALOGUE_PREFIX}{line}")
    script = "\n".join(lines).strip()
    if not script:
        script = f"@duration:{SEGMENT_DURATION_MIN}\n画面轻微动态，保持主体稳定"
        warnings.append(CompileWarning("empty_scene_fallback"))
    return replace_duration_with_time_ranges(script), warnings


def _seedance_reference_sections(
    scene: SceneConfig,
) -> tuple[str, list[dict[str, Any]], str, list[CompileWarning]]:
    """Khối 【强制约束：角色形象/场景/道具】 + kế hoạch gửi ảnh."""
    from app.services.drama.build_seedance_generate_body import (
        SEEDANCE_CHARACTER_APPEARANCE_SECTION_HEADER,
        SEEDANCE_PROP_SECTION_HEADER,
        SEEDANCE_SCENE_SECTION_HEADER,
    )

    warnings: list[CompileWarning] = []
    headers = {
        "character": SEEDANCE_CHARACTER_APPEARANCE_SECTION_HEADER,
        "scene": SEEDANCE_SCENE_SECTION_HEADER,
        "prop": SEEDANCE_PROP_SECTION_HEADER,
    }
    order = [k for k in REFERENCE_KINDS if any(r.kind == k for r in scene.references)]
    plan: list[dict[str, Any]] = []
    sections: list[str] = []
    index = 0
    for kind in order:
        lines: list[str] = []
        for ref in scene.references:
            if ref.kind != kind:
                continue
            index += 1
            label = (ref.label or "").strip() or f"参考图{index}"
            lines.append(f"{label}：参考图{index}")
            plan.append(
                {
                    "index": index,
                    "label": label,
                    "kind": kind,
                    "url": (ref.url or "").strip(),
                }
            )
        if lines:
            sections.append("\n".join([headers[kind], *lines]))

    if index == 0:
        continuity = (scene.continuity_frame_url or "").strip()
        if continuity:
            plan.append({"index": 1, "label": "上一镜尾帧", "kind": "continuity", "url": continuity})
        image_field = "first_frame_url" if continuity else ""
    else:
        continuity = (scene.continuity_frame_url or "").strip()
        if continuity:
            index += 1
            plan.append(
                {"index": index, "label": "上一镜尾帧", "kind": "continuity", "url": continuity}
            )
        image_field = "reference_image_urls"

    if len(plan) > 9:
        warnings.append(CompileWarning("reference_images_over_cap", f"{len(plan)} → 9"))
    return "\n\n".join(sections), plan, image_field, warnings


def _has_latin(text: str) -> bool:
    """Có chữ Latin hay không — Seedance đã xác minh bằng văn bản Trung."""
    return any(("a" <= ch <= "z") or ("A" <= ch <= "Z") for ch in text or "")


def _compile_seedance(
    profile: ModelPromptProfile, scene: SceneConfig, ratio: str, duration: int, resolution: str,
    warnings: list[CompileWarning],
) -> tuple[str, dict[str, Any]]:
    sections: list[str] = []

    # Hồ sơ đã xác minh: Seedance được viết bằng tiếng Trung giản thảo. Ta không tự dịch —
    # dịch sai còn tệ hơn nói thẳng là chỗ nào chưa đúng ngôn ngữ.
    if _has_latin(scene.visual_line()):
        warnings.append(CompileWarning("seedance_body_not_chinese"))
    if _has_latin(scene.narration) or any(_has_latin(l) for _, l in scene.dialogue):
        warnings.append(CompileWarning("seedance_speech_not_chinese"))

    style = (scene.style or "").strip()
    if style:
        sections.append(
            "【强制约束：视频画面风格】全片画面必须严格遵循以下风格描述，"
            f"严禁偏离、弱化或混用其他画风与镜头美学：\n{style}"
        )

    continuity = (scene.continuity_frame_url or "").strip()
    ref_sections, plan, image_field, ref_warnings = _seedance_reference_sections(scene)
    warnings.extend(ref_warnings)
    has_reference_media = image_field == "reference_image_urls"
    if continuity:
        if has_reference_media:
            sections.append(
                "【强制约束：镜头衔接】另附上一镜尾帧作为参考图（参考图序列最后一张）。"
                "本段开场须从该尾帧画面自然续接，保持主体、场景与光影连贯，禁止跳切到无关画面。"
            )
        else:
            sections.append(
                "【强制约束：镜头衔接】本段视频必须以首帧图为开场画面自然续接，"
                "保持主体、场景与光影连贯，禁止跳切到无关画面。"
            )

    body, body_warnings = _seedance_body(scene, duration)
    warnings.extend(body_warnings)

    sections.append(
        build_seedance_production_section(
            body,
            burn_subtitles=scene.burn_subtitles,
            character_intro=False,
        )
    )
    if ref_sections:
        sections.append(ref_sections)
    sections.append(body)

    prompt = "\n\n".join(s for s in sections if s).strip()
    avoid = [a.strip() for a in scene.avoid if a and a.strip()]
    if avoid:
        # Hồ sơ đã xác minh: Seedance không có trường negative, mọi điều cấm phải viết
        # thẳng vào khối ràng buộc theo văn phong cấm đoán.
        sections.insert(
            -1,
            "【强制约束：画面禁止项】禁止出现：" + "、".join(avoid) + "；严禁违反上述任一项。",
        )
        prompt = "\n\n".join(s for s in sections if s).strip()

    parameters: dict[str, Any] = {
        "model": profile.id,
        "duration_sec": duration,
        "resolution": resolution,
        "generate_audio": True,
        "watermark": False,
        "return_last_frame": True,
        "reference_plan": plan,
        # Chỉ khi thuần first_frame mới được phép bỏ ratio.
        "ratio": "" if image_field == "first_frame_url" else ratio,
        "image_field": image_field,
        "negative_prompt": "",
    }
    if image_field == "first_frame_url":
        warnings.append(CompileWarning("ratio_omitted_for_first_frame"))
    return prompt, parameters


# ---------------------------------------------------------------------------
# Kling VIDEO 3.0 — theo định dạng prompt và tham số trong tài liệu chính thức
# ---------------------------------------------------------------------------


def _compile_kling3(
    profile: ModelPromptProfile, scene: SceneConfig, ratio: str, duration: int, resolution: str,
    warnings: list[CompileWarning],
) -> tuple[str, dict[str, Any]]:
    sentences: list[str] = []
    lead = ", ".join(b for b in (scene.setting, scene.shot_size) if b.strip())
    if lead:
        sentences.append(f"{lead},")
    if scene.subject.strip():
        sentences.append(f"{scene.subject.strip()},")
    if scene.action.strip():
        sentences.append(f"{scene.action.strip()}.")
    if scene.camera.strip():
        sentences.append(f"The camera {scene.camera.strip()}.")
    if scene.light.strip():
        sentences.append(f"{scene.light.strip()}.")
    if scene.style.strip():
        sentences.append(f"{scene.style.strip()}.")

    if scene.narration.strip():
        sentences.append(f'Voiceover: "{scene.narration.strip()}"')
    for speaker, line in scene.dialogue:
        clean = (line or "").strip()
        if not clean:
            continue
        name = (speaker or "").strip() or "Speaker"
        sentences.append(f'{name}: "{clean}"')

    if scene.avoid:
        # Tài liệu Kling: prompt có thể chứa cả mô tả tích cực lẫn tiêu cực.
        sentences.append("Avoid: " + ", ".join(scene.avoid))

    body = " ".join(s.strip() for s in sentences if s.strip())
    prompt = (
        f"[Target: {profile.label} — compiled from official Kling docs, "
        "not verified by NOVAFILM]\n\n"
        f"{body}"
    ).strip()

    if scene.references or scene.continuity_frame_url:
        warnings.append(
            CompileWarning(
                "kling_needs_image_endpoint",
                "text-to-video không nhận ảnh; dùng image-to-video hoặc Omni với contents[]",
            )
        )
    if duration < 5:
        warnings.append(
            CompileWarning("kling_first_frame_duration", "chỉ khung hình đầu thì chỉ 5s hoặc 10s")
        )
    negative = ""
    parameters: dict[str, Any] = {
        "model": profile.id,
        "settings_aspect_ratio": ratio,
        "settings_duration": duration,
        "settings_resolution": resolution,
        "reference_plan": [],
        "image_field": "contents[].first_frame",
    }
    return prompt, parameters


# ---------------------------------------------------------------------------
# Veo 3.1 — theo công thức 5 phần trong hướng dẫn chính thức
# ---------------------------------------------------------------------------


def _compile_veo(
    profile: ModelPromptProfile, scene: SceneConfig, ratio: str, duration: int, resolution: str,
    warnings: list[CompileWarning],
) -> tuple[str, dict[str, Any]]:
    refs = [r for r in scene.references if (r.url or "").strip()]
    lines: list[str] = []

    if refs:
        # Hướng dẫn: mở đầu bằng cách gọi tên ảnh tham chiếu đang dùng.
        names = ", ".join((r.label or f"image {i + 1}").strip() for i, r in enumerate(refs))
        lines.append(f"Using the provided images for {names}, create the scene below.")

    cinematography = ", ".join(b for b in (scene.shot_size, scene.camera) if b.strip())
    lines.append(f"[Cinematography] {cinematography}." if cinematography else "[Cinematography] .")
    if scene.subject.strip():
        lines.append(f"[Subject] {scene.subject.strip()}.")
    if scene.action.strip():
        lines.append(f"[Action] {scene.action.strip()}.")
    context = ", ".join(b for b in (scene.setting, scene.light) if b.strip())
    if context:
        lines.append(f"[Context] {context}.")
    ambiance = scene.style.strip()
    if ambiance:
        lines.append(f"[Style & Ambiance] {ambiance}.")

    if scene.narration.strip():
        lines.append(f'Narration: "{scene.narration.strip()}"')
    for speaker, line in scene.dialogue:
        clean = (line or "").strip()
        if not clean:
            continue
        name = (speaker or "").strip() or "Speaker"
        lines.append(f'{name} says: "{clean}"')

    if scene.continuity_frame_url:
        lines.append(
            "Continue naturally from the given last frame; keep subject, setting and lighting "
            "consistent, and do not cut to an unrelated shot."
        )

    body = "\n".join(line.rstrip() for line in lines if line.strip()).strip()
    prompt = (
        f"[Target: {profile.label} — compiled from official Google docs, "
        "not verified by NOVAFILM]\n\n"
        f"{body}"
    ).strip()

    if not scene.light.strip():
        warnings.append(CompileWarning("veo_light_missing"))
    # Tài liệu Veo yêu cầu mô tả điều muốn có thay vì "no …", nên phần cấm đi vào
    # negativePrompt chứ không nhét vào prompt.
    negative = "; ".join(scene.avoid)
    parameters: dict[str, Any] = {
        "model": profile.id,
        "aspectRatio": ratio,
        "durationSec": duration,
        "outputResolution": resolution,
        "negativePrompt": negative,
        "reference_plan": [
            {"index": i + 1, "label": (r.label or "").strip(), "kind": r.kind, "url": r.url}
            for i, r in enumerate(refs)
        ],
        "image_field": "ingredients_to_video" if refs else "",
    }
    return prompt, parameters


# ---------------------------------------------------------------------------
# Trung tính — model chưa có hồ sơ, không được phát prompt tối ưu
# ---------------------------------------------------------------------------


def _compile_neutral(
    profile: ModelPromptProfile, scene: SceneConfig, ratio: str, duration: int, resolution: str,
    warnings: list[CompileWarning],
) -> tuple[str, dict[str, Any]]:
    visual = scene.visual_line(include_shot_size=False)
    if scene.shot_size.strip():
        visual = f"{scene.shot_size.strip()}：{visual}" if visual else scene.shot_size.strip()
    sentences = [visual or "A quiet establishing shot."]
    if scene.camera.strip():
        sentences.append(f"Camera: {scene.camera.strip()}.")
    if scene.narration.strip():
        sentences.append(f"Narration: {scene.narration.strip()}")
    for speaker, line in scene.dialogue:
        clean = (line or "").strip()
        if clean:
            sentences.append(f"{(speaker or '').strip() or 'Speaker'}: {clean}")
    if scene.avoid:
        sentences.append("Avoid: " + ", ".join(scene.avoid))

    prompt = (
        f"[Target: {profile.label} — no verified profile for this model, "
        "so this prompt is a plain description with no model-specific tuning]\n\n"
        + "\n".join(s.strip() for s in sentences if s.strip())
    ).strip()

    warnings.append(CompileWarning("profile_unverified"))
    warnings.append(CompileWarning("parameters_unverified"))
    parameters: dict[str, Any] = {
        "model": profile.id,
        "aspect_ratio": ratio,
        "duration_sec": duration,
        "resolution": resolution,
        "reference_plan": [
            {"index": i + 1, "label": (r.label or "").strip(), "kind": r.kind, "url": r.url}
            for i, r in enumerate(scene.references)
            if (r.url or "").strip()
        ],
        "image_field": "",
        "negative_prompt": "",
    }
    return prompt, parameters


# ---------------------------------------------------------------------------
# Điểm vào
# ---------------------------------------------------------------------------

_COMPILERS = {
    "seedance": _compile_seedance,
    "kling3": _compile_kling3,
    "veo": _compile_veo,
    "neutral": _compile_neutral,
}

_USED_FACT_KEYS = {
    "seedance": ("language", "structure", "timing_syntax", "reference_addressing",
                 "negation_style", "voice_cue", "shot_syntax", "aspect_ratio", "duration",
                 "per_segment_duration", "resolution", "native_audio", "reference_image_field",
                 "reference_image_max", "reference_roles"),
    "kling3": ("language", "structure", "negation_style", "voice_cue", "shot_syntax",
               "aspect_ratio", "duration", "resolution", "reference_image_field"),
    "veo": ("language", "structure", "timing_syntax", "reference_addressing", "negation_style",
            "voice_cue", "shot_syntax", "aspect_ratio", "duration", "resolution", "native_audio",
            "negative_prompt"),
    "neutral": (),
}


class UnknownModelError(ValueError):
    """Model không có trong hồ sơ — không được đoán, phải báo ra."""


def compile_prompt(
    model_id: str | None,
    scene: SceneConfig,
    *,
    aspect_ratio: str = "",
    duration_sec: int = DEFAULT_DURATION_SEC,
    resolution: str = "",
) -> CompileResult:
    """Dựng prompt cuối theo hồ sơ của model đích."""
    profile = get_profile(model_id)
    if profile is None:
        raise UnknownModelError(f"không có hồ sơ cho model: {model_id!r}")

    warnings: list[CompileWarning] = []
    hints = profile.hints
    ratio = _pick_ratio(aspect_ratio, hints, warnings)
    res = _pick_resolution(resolution, hints, warnings)
    duration = _pick_duration(duration_sec, hints, warnings)

    if not scene.subject.strip() and not scene.visual_line():
        warnings.append(CompileWarning("subject_missing"))

    prompt, parameters = _COMPILERS[profile.compiler_mode](
        profile, scene, ratio, duration, res, warnings
    )

    used = []
    for key in _USED_FACT_KEYS.get(profile.compiler_mode, ()):
        fact = _fact(profile, key)
        if fact is not None:
            used.append(fact)

    return CompileResult(
        model=profile.id,
        label=profile.label,
        readiness=profile.readiness,
        compiler_mode=profile.compiler_mode,
        prompt=prompt,
        parameters=parameters,
        warnings=warnings,
        evidence_counts=profile.evidence_counts(),
        used_facts=used,
    )


__all__ = [
    "CompileResult",
    "CompileWarning",
    "SceneConfig",
    "SceneReference",
    "UnknownModelError",
    "compile_prompt",
]
