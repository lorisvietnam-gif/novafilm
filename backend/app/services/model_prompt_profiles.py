# -*- coding: utf-8 -*-
"""Hồ sơ prompt theo từng model — nguồn của bộ biên dịch prompt.

Vì sao file này tồn tại
----------------------
Đầu ra của bản beta là prompt để người dùng dán vào nền tảng của họ. Người dùng
dán prompt viết sai ngôn ngữ của model đích vào Kling thì ra kết quả tệ, quay lại
đánh giá NOVAFILM tệ hơn. Vậy nên **không được đoán**. Mỗi mục trong hồ sơ đều phải
ghi mức bằng chứng:

- ``verified`` — có bằng chứng trong chính repo này, hoặc tài liệu chính thức đã
  dẫn đường dẫn. ``sources`` không được rỗng.
- ``assumed`` — suy luận hợp lý; ``note`` phải nói rõ là suy luận.
- ``unknown`` — chưa biết. ``value`` để trống. Tuyệt đối không điền.

Vì sao Seedance đầy đủ còn phần còn lại là khung
------------------------------------------------
Hồ sơ Seedance dựng từ lỗi thật đã gặp, nên từng mục đều truy được về một dòng cụ
thể trong repo (xem ``sources``). Những model khác thì không có gì trong repo; phần
tài liệu chính thức tìm được thì dẫn URL, còn lại để ``unknown`` nguyên trạng.
Một khung trung thực tốt hơn một khối prompt bịa.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.media_model_presets import model_generation_options

EvidenceLevel = Literal["verified", "assumed", "unknown"]
EVIDENCE_LEVELS: tuple[str, ...] = ("verified", "assumed", "unknown")

# Mức hoàn thiện của hồ sơ — dùng cho badge ở giao diện.
#   evidence-based  : có bằng chứng do chính hệ thống này kiểm chứng bằng lỗi thật
#   docs-based      : dựng từ tài liệu chính thức, hệ thống này chưa tự chạy thử
#   skeleton        : chưa có gì đáng tin; compiler phát prompt trung tính, không tối ưu
Readiness = Literal["evidence-based", "docs-based", "skeleton"]


@dataclass(frozen=True)
class ProfileFact:
    """Một mục trong hồ sơ, kèm mức bằng chứng và nguồn."""

    key: str
    level: EvidenceLevel
    value: str = ""
    sources: tuple[str, ...] = ()
    note: str = ""

    def __post_init__(self) -> None:
        if self.level not in EVIDENCE_LEVELS:
            raise ValueError(f"mức bằng chứng không hợp lệ: {self.level!r} ({self.key})")
        if self.level == "verified" and not self.sources:
            raise ValueError(f"mục verified bắt buộc phải có nguồn: {self.key}")
        if self.level == "unknown" and self.value.strip():
            raise ValueError(f"mục unknown phải để trống, không được đoán: {self.key}")
        if self.level == "assumed" and not self.note.strip():
            raise ValueError(f"mục assumed bắt buộc phải ghi rõ là suy luận: {self.key}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "level": self.level,
            "value": self.value,
            "sources": list(self.sources),
            "note": self.note,
        }


@dataclass(frozen=True)
class KnownFailure:
    """Một lỗi model đã từng làm hỏng — loại lỗi người dùng không tự đoán được."""

    key: str
    level: EvidenceLevel
    summary: str = ""
    source: str = ""

    def __post_init__(self) -> None:
        if self.level not in EVIDENCE_LEVELS:
            raise ValueError(f"mức bằng chứng không hợp lệ: {self.level!r} ({self.key})")
        if self.level == "verified" and not self.source:
            raise ValueError(f"lỗi verified bắt buộc phải có nguồn: {self.key}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "level": self.level,
            "summary": self.summary,
            "source": self.source,
        }


@dataclass(frozen=True)
class CompilerHints:
    """Giới hạn máy-đọc-được để bộ biên dịch không phát ra giá trị ngoài khả năng.

    Rỗng nghĩa là **chưa biết**, không phải "không giới hạn". Bộ biên dịch không
    clamp khi không có danh sách, và báo cho người dùng biết là chưa kiểm chứng.
    """

    aspect_ratios: tuple[str, ...] = ()
    resolutions: tuple[str, ...] = ()
    duration_values: tuple[int, ...] = ()
    duration_min: int = 0
    duration_max: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "aspect_ratios": list(self.aspect_ratios),
            "resolutions": list(self.resolutions),
            "duration_values": list(self.duration_values),
            "duration_min": self.duration_min,
            "duration_max": self.duration_max,
        }


@dataclass(frozen=True)
class ModelPromptProfile:
    """Hồ sơ đầy đủ của một model đích."""

    id: str
    label: str
    family: str
    readiness: Readiness
    # seedance | kling3 | veo | neutral — quyết định cấu trúc prompt phát ra
    compiler_mode: str
    dialect: tuple[ProfileFact, ...] = ()
    parameters: tuple[ProfileFact, ...] = ()
    references: tuple[ProfileFact, ...] = ()
    failures: tuple[KnownFailure, ...] = ()
    hints: CompilerHints = field(default_factory=CompilerHints)

    def facts(self) -> tuple[ProfileFact, ...]:
        return (*self.dialect, *self.parameters, *self.references)

    def evidence_counts(self) -> dict[str, int]:
        counts = {level: 0 for level in EVIDENCE_LEVELS}
        for fact in self.facts():
            counts[fact.level] += 1
        counts["verified"] += sum(1 for f in self.failures if f.level == "verified")
        counts["assumed"] += sum(1 for f in self.failures if f.level == "assumed")
        counts["unknown"] += sum(1 for f in self.failures if f.level == "unknown")
        return counts

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "family": self.family,
            "readiness": self.readiness,
            "compiler_mode": self.compiler_mode,
            "evidence_counts": self.evidence_counts(),
            "dialect": [f.to_dict() for f in self.dialect],
            "parameters": [f.to_dict() for f in self.parameters],
            "references": [f.to_dict() for f in self.references],
            "failures": [f.to_dict() for f in self.failures],
            "hints": self.hints.to_dict(),
        }


# ---------------------------------------------------------------------------
# Nguồn trong repo — dùng lại nhiều lần nên đặt hằng để không lệch chỗ
# ---------------------------------------------------------------------------

SRC_TOKENFREE_WRAP = (
    "backend/app/services/tokenfree_video.py:70-181 (wrap_seedance_payload_for_newapi)"
)
SRC_TOKENFREE_DOCTYPE = (
    "backend/app/services/tokenfree_video.py:74-75 (docstring: reference_image_urls / "
    "first_frame_url only, no content/images, double counting)"
)
SRC_SEG_CONSTANTS = (
    "backend/app/services/seedance_segments.py:13-28 (segment 3-12s, shot 4-30s, cue prefixes)"
)
SRC_SEG_PRODUCTION = (
    "backend/app/services/seedance_segments.py:446-578 (build_seedance_production_section, "
    "numbered 【强制约束：音频、字幕与配乐】 clauses)"
)
SRC_SEG_TIMELINE = (
    "backend/app/services/seedance_segments.py:606-619 (replace_duration_with_time_ranges -> "
    "HH:MM-HH:MM)"
)
SRC_SEG_PROMPT = (
    "backend/app/services/seedance_segments.py:835-882 (build_seedance_prompt assembly order)"
)
SRC_SEG_VOICE_GUARD = (
    "backend/app/services/seedance_segments.py:212-232 (rewrite_misclassified_visual_voice_lines: "
    "plain visual shots must not carry dialogue/narration prefixes)"
)
SRC_PRESET_VIDEO_ROWS = (
    "backend/app/services/media_model_presets.py:48-77 (PRESET_MODELS['video'] rows)"
)
SRC_PRESET_OPTIONS = (
    "backend/app/services/media_model_presets.py:231-291 (model_generation_options whitelist)"
)
SRC_PRESET_RATIOS = (
    "backend/app/services/media_model_presets.py:104-108 (VIDEO_ASPECT_RATIOS + resolution tiers)"
)
SRC_ARK_JSON_PROMPT = (
    "backend/app/services/ark.py:1099-1115 and 1226-1233 (_seedance_prompt_text JSON wrapper, "
    "plain-text retry on 4xx)"
)
SRC_ARK_SCRIPT_PLAIN = (
    "backend/app/services/ark.py:1154-1160 (script-shaped prompts always sent as plain text)"
)
SRC_ARK_RATIO_FIRSTFRAME = (
    "backend/app/services/ark.py:1161-1178 and 1253-1275 (ratio must be dropped with pure "
    "first_frame; adaptive fallback can return landscape)"
)
SRC_ARK_UNKNOWN_FIELDS = (
    "backend/app/services/ark.py:1208 (character_consistency deliberately not sent: unknown "
    "fields caused BodyFormat failures)"
)
SRC_ARK_PRIVACY = (
    "backend/app/services/ark.py:374-393 and 1360-1370 (PrivacyInformation / "
    "InputImageSensitive on real-person reference images)"
)
SRC_ARK_AUDIO_MIN = (
    "backend/app/services/ark.py:398-406 (r2v reference audio must be >= 1.8s)"
)
SRC_ARK_CHINESE = (
    "backend/app/services/ark.py:673-689 (storyboard system prompt: all fields in Simplified "
    "Chinese, no English sentences in img_prompt / video_prompt)"
)
SRC_AR_IMAGE_AR = (
    "backend/app/services/seedance_image_aspect.py:1 and 17-21 (reference image aspect must be "
    "within [0.40, 2.50]; safe band [0.41, 2.49]; measured 1983x793 ~2.5006 rejected)"
)
SRC_REF_LIMIT = (
    "backend/app/services/media_ref_limits.py:6 (MAX_REFERENCE_IMAGES = 9 downstream hard cap)"
)
SRC_DRAMA_SECTIONS = (
    "backend/app/services/drama/build_seedance_generate_body.py:36-62 (constraint block headers) "
    "and 523-597 (build_seedance_prompt_text order)"
)
SRC_DRAMA_INDEX = (
    "backend/app/services/drama/build_seedance_generate_body.py:379-383 and 474-497 "
    "(references addressed by 1-based index: 名称（参考图N）)"
)
SRC_DRAMA_CONTENT_ORDER = (
    "backend/app/services/drama/build_seedance_generate_body.py:628-679 (content[] order: text, "
    "reference images, style board, reference audio, continuity last frame; "
    "first_frame only when no reference media)"
)
SRC_DRAMA_RATIO_OMIT = (
    "backend/app/services/drama/build_seedance_generate_body.py:725-729 and 760-761 (ratio "
    "omitted in pure first-frame mode)"
)
SRC_RESOLUTIONS = (
    "backend/app/services/seedance_resolutions.py:8-43 (only Seedance 2.5 reaches 1080p)"
)
SRC_FE_EDIT_WORDING = (
    "frontend/src/components/drama/SeedanceRulesModal.tsx:236-239 (repo rule text: writing "
    "edit/extend wording into a normal-generation script reclassifies the job)"
)

DOC_KLING_T2V = "https://kling.ai/document-api/api/video/3-0-turbo/text-to-video"
DOC_KLING_T2V_MD = "https://kling.ai/document-api/api/video/3-0-turbo/text-to-video.md"
DOC_KLING_I2V_26 = "https://kling.ai/document-api/api/video/2-6/image-to-video.md"
DOC_KLING_OMNI_O1 = "https://kling.ai/document-api/api/video/o1/video-omni.md"
DOC_KLING_GUIDE_30 = "https://kling.ai/quickstart/klingai-video-3-model-user-guide"
DOC_VEO_BLOG_31 = (
    "https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1"
)
DOC_VEO_DEEPMIND_GUIDE = "https://deepmind.google/models/veo/prompt-guide/"
DOC_VEO_VERTEX_T2V = (
    "https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-text"
)
DOC_VEO_30_MODEL = "https://cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-0-generate-preview"
DOC_MUSE_BLOG = "https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/"
DOC_MUSE_MODELS = "https://dev.meta.ai/docs/models"


# ---------------------------------------------------------------------------
# Seedance — hồ sơ có bằng chứng, làm kỹ
# ---------------------------------------------------------------------------

SEEDANCE_DIALECT: tuple[ProfileFact, ...] = (
    ProfileFact(
        key="language",
        level="verified",
        value=(
            "Tiếng Trung giản thảo. Hệ thống bắt mọi trường phải viết bằng tiếng Trung giản và "
            "cấm câu tiếng Anh trong img_prompt / video_prompt."
        ),
        sources=(SRC_ARK_CHINESE,),
    ),
    ProfileFact(
        key="structure",
        level="verified",
        value=(
            "Prompt là các khối 【强制约束：…】 đánh số theo thứ tự, rồi mới tới phần thân có "
            "mốc thời gian. Thứ tự mà hệ thống thật sự ghép: 画面风格 → 音频、字幕与配乐 → "
            "角色形象 → 场景 → 道具 → thân có 时间轴."
        ),
        sources=(SRC_DRAMA_SECTIONS, SRC_SEG_PROMPT, SRC_SEG_PRODUCTION),
    ),
    ProfileFact(
        key="timing_syntax",
        level="verified",
        value=(
            "Thân prompt dùng khoảng thời gian HH:MM-HH:MM, sinh ra từ thẻ @duration:N trong "
            "kịch bản. Đây là đường duy nhất hệ thống đã kiểm chứng là Seedance đọc theo nhịp."
        ),
        sources=(SRC_SEG_TIMELINE,),
    ),
    ProfileFact(
        key="reference_addressing",
        level="verified",
        value=(
            "Ảnh tham chiếu được gọi tên trong chữ bằng số thứ tự: 名称（参考图1）, 参考图2… "
            "Số thứ tự là vị trí trong mảng ảnh gửi đi, tính từ 1."
        ),
        sources=(SRC_DRAMA_INDEX,),
    ),
    ProfileFact(
        key="negation_style",
        level="verified",
        value=(
            "Không có trường negative riêng. Mọi điều cấm viết thẳng vào trong khối ràng buộc "
            "bằng văn phong cấm đoán: 严禁… / 禁止…"
        ),
        sources=(SRC_DRAMA_SECTIONS, SRC_SEG_PRODUCTION),
    ),
    ProfileFact(
        key="voice_cue",
        level="verified",
        value=(
            "Lời thoại và lời dẫn phải mang nhãn cue: 【旁白·…】【对白·…】【画面·…】. Cảnh thuần "
            "hình ảnh tuyệt đối không được gắn nhãn đối thoại/lời dẫn, nếu không model sẽ đọc "
            "to mô tả hình và đốt phụ đề."
        ),
        sources=(SRC_SEG_CONSTANTS, SRC_SEG_VOICE_GUARD),
    ),
    ProfileFact(
        key="text_payload",
        level="verified",
        value=(
            "Prompt dạng kịch bản phải gửi văn bản thuần. Dạng JSON summary_caption chỉ là "
            "đường dự phòng và từng gây lỗi BodyFormat; khi gặp 4xx hệ thống phải thử lại bằng "
            "văn bản thuần."
        ),
        sources=(SRC_ARK_JSON_PROMPT, SRC_ARK_SCRIPT_PLAIN),
    ),
    ProfileFact(
        key="shot_syntax",
        level="verified",
        value=(
            "Cỡ cảnh viết dạng nhãn ở đầu dòng: 空镜：… 远景：… 近景：… 特写：… 跟拍：… 推镜：… "
            "Hệ thống dò những nhãn này bằng regex để quyết định cảnh đó có lời hay không."
        ),
        sources=(SRC_SEG_CONSTANTS,),
    ),
)

SEEDANCE_REFERENCES: tuple[ProfileFact, ...] = (
    ProfileFact(
        key="reference_image_field",
        level="verified",
        value=(
            "Nhiều ảnh tham chiếu chỉ đi qua reference_image_urls. first_frame_url / "
            "last_frame_url là đường riêng và bị cấm trộn với reference_image_urls; trộn vào "
            "sẽ hỏng."
        ),
        sources=(SRC_TOKENFREE_WRAP, SRC_TOKENFREE_DOCTYPE, SRC_DRAMA_CONTENT_ORDER),
    ),
    ProfileFact(
        key="reference_image_max",
        level="verified",
        value="Tối đa 9 ảnh tham chiếu mỗi lần gửi (trần cứng của plugin downstream).",
        sources=(SRC_REF_LIMIT, SRC_TOKENFREE_WRAP),
    ),
    ProfileFact(
        key="reference_image_url",
        level="verified",
        value=(
            "Ảnh phải là URL https công khai mà Seedance tải được. data URI bị từ chối."
        ),
        sources=("backend/app/services/ark.py:1152-1153", "backend/app/services/ark.py:1302-1312"),
    ),
    ProfileFact(
        key="reference_image_aspect",
        level="verified",
        value=(
            "Tỉ lệ bề rộng cao của ảnh tham chiếu phải nằm trong [0.40, 2.50]; dải an toàn là "
            "[0.41, 2.49]. Ảnh vượt biên bị từ chối kể cả khi chỉ vượt rất nhẹ."
        ),
        sources=(SRC_AR_IMAGE_AR,),
    ),
    ProfileFact(
        key="reference_roles",
        level="verified",
        value=(
            "role hợp lệ: reference_image, first_frame, last_frame, reference_audio. Khung hình "
            "cuối nối tiếp giữa các cảnh phải là reference_image khi cảnh đó đã có ảnh hoặc "
            "audio tham chiếu; chỉ khi không có gì mới được dùng first_frame."
        ),
        sources=(SRC_DRAMA_CONTENT_ORDER,),
    ),
    ProfileFact(
        key="reference_audio",
        level="verified",
        value=(
            "reference_audio_urls tối đa 10, và mỗi đoạn âm thanh phải dài ≥ 1.8 giây. Hiện "
            "hệ thống cố ý không gửi (SEEDANCE_ATTACH_REFERENCE_AUDIO = False) vì khó khống "
            "chế — lời đọc để generate_audio tự diễn."
        ),
        sources=(
            "backend/app/services/tokenfree_video.py:168-169",
            SRC_ARK_AUDIO_MIN,
            "backend/app/services/drama/build_seedance_generate_body.py:40-42",
        ),
    ),
    ProfileFact(
        key="real_person_images",
        level="verified",
        value=(
            "Ảnh tham chiếu nhìn là người thật bị chặn (PrivacyInformation / InputImageSensitive). "
            "Lỗi này không sửa được bằng cách đổi lời văn — phải đổi ảnh."
        ),
        sources=(SRC_ARK_PRIVACY,),
    ),
)

SEEDANCE_FAILURES: tuple[KnownFailure, ...] = (
    KnownFailure(
        key="duplicate_reference_counting",
        level="verified",
        summary=(
            "Gửi cùng một lô ảnh ở cả reference_image_urls lẫn content[] (hoặc thêm image/images "
            "ở top-level) khiến downstream đếm trùng và chạm trần ảnh tham chiếu."
        ),
        source=SRC_TOKENFREE_DOCTYPE,
    ),
    KnownFailure(
        key="ratio_with_pure_first_frame",
        level="verified",
        summary=(
            "Dùng first_frame thuần mà vẫn gửi ratio thì request lỗi phải gửi lại bỏ ratio. "
            "Nếu không có mục tiêu khung hình mà rơi về adaptive, kết quả có thể ra ngang dù "
            "cảnh gốc dọc."
        ),
        source=SRC_ARK_RATIO_FIRSTFRAME,
    ),
    KnownFailure(
        key="json_payload_body_format",
        level="verified",
        summary=(
            "Gửi prompt dạng JSON thay vì văn bản thuần từng dính lỗi BodyFormat; phải có "
            "đường thử lại bằng văn bản thuần."
        ),
        source=SRC_ARK_JSON_PROMPT,
    ),
    KnownFailure(
        key="image_aspect_out_of_band",
        level="verified",
        summary=(
            "Ảnh tham chiếu có tỉ lệ 2.5006 bị Seedance báo thành 2.50 rồi từ chối; phải pad "
            "đen về trong [0.41, 2.49] trước khi gửi."
        ),
        source=SRC_AR_IMAGE_AR,
    ),
    KnownFailure(
        key="real_person_reference",
        level="verified",
        summary=(
            "Ảnh nhân vật giống người thật bị chặn ở tầng kiểm duyệt; đổi câu chữ prompt không "
            "cứu được, phải thay ảnh."
        ),
        source=SRC_ARK_PRIVACY,
    ),
    KnownFailure(
        key="portrait_still_comes_back_landscape",
        level="verified",
        summary=(
            "Ngay cả khi ảnh tĩnh đã dọc, Seedance vẫn có thể trả video ngang — đó là lý do hệ "
            "thống luôn giữ ratio và không cho rơi về adaptive khi có mục tiêu khung hình."
        ),
        source=SRC_ARK_RATIO_FIRSTFRAME,
    ),
    KnownFailure(
        key="unknown_fields_rejected",
        level="verified",
        summary=(
            "Gửi thừa trường lạ (ví dụ character_consistency) đã từng gây lỗi BodyFormat; hệ "
            "thống cố ý không gửi trường không biết."
        ),
        source=SRC_ARK_UNKNOWN_FIELDS,
    ),
    KnownFailure(
        key="edit_or_extend_wording",
        level="assumed",
        summary=(
            "Viết các cụm kiểu chỉnh sửa / kéo dài vào kịch bản khi tạo bình thường có thể bị "
            "phân loại lại thành tác vụ khác."
        ),
        source=SRC_FE_EDIT_WORDING,
    ),
)


def _seedance_hints(model_id: str, resolutions: tuple[str, ...]) -> CompilerHints:
    """Giới hạn lấy thẳng từ bảng preset của chính hệ thống, không chép tay."""
    opts = model_generation_options(model_id)
    return CompilerHints(
        aspect_ratios=tuple(str(x) for x in opts.get("allowed_aspect_ratios") or ()),
        resolutions=resolutions,
        duration_min=int(opts.get("duration_min") or 0),
        duration_max=int(opts.get("duration_max") or 0),
    )


SEEDANCE_PARAMETER_FACTS = {
    "seedance-2-0": (
        ProfileFact(
            key="aspect_ratio",
            level="verified",
            value=(
                "ratio nhận tự do trong 9:16 / 16:9 / 1:1. adaptive chỉ là giá trị dự phòng khi "
                "không có mục tiêu khung hình — không dùng adaptive nếu bạn cần dọc."
            ),
            sources=(SRC_PRESET_RATIOS, SRC_DRAMA_RATIO_OMIT, SRC_ARK_RATIO_FIRSTFRAME),
        ),
        ProfileFact(
            key="duration",
            level="verified",
            value="4–30 giây mỗi cảnh.",
            sources=(SRC_PRESET_OPTIONS, SRC_SEG_CONSTANTS),
        ),
        ProfileFact(
            key="per_segment_duration",
            level="verified",
            value="Mỗi đoạn trong cảnh 3–12 giây.",
            sources=(SRC_SEG_CONSTANTS,),
        ),
        ProfileFact(
            key="resolution",
            level="verified",
            value="Chỉ 480p và 720p. Seedance 2.0 không có 1080p.",
            sources=(SRC_PRESET_VIDEO_ROWS, SRC_RESOLUTIONS, SRC_PRESET_RATIOS),
        ),
        ProfileFact(
            key="native_audio",
            level="verified",
            value=(
                "generate_audio bật sẵn: có ý định lời thoại thì Seedance tự đọc và tự đốt phụ đề. "
                "Cảnh thuần hình ảnh chỉ có tiếng không khí."
            ),
            sources=(
                "backend/app/services/drama/build_seedance_generate_body.py:750-759",
                SRC_SEG_PRODUCTION,
            ),
        ),
        ProfileFact(
            key="negative_prompt",
            level="verified",
            value="Không có trường negative riêng — cấm viết thẳng trong khối 【强制约束】.",
            sources=(SRC_DRAMA_SECTIONS,),
        ),
    ),
    "seedance-2-0-mini": (
        ProfileFact(
            key="aspect_ratio",
            level="verified",
            value=(
                "ratio nhận tự do trong 9:16 / 16:9 / 1:1. adaptive chỉ là giá trị dự phòng khi "
                "không có mục tiêu khung hình — không dùng adaptive nếu bạn cần dọc."
            ),
            sources=(SRC_PRESET_RATIOS, SRC_DRAMA_RATIO_OMIT, SRC_ARK_RATIO_FIRSTFRAME),
        ),
        ProfileFact(
            key="duration",
            level="verified",
            value="4–30 giây mỗi cảnh.",
            sources=(SRC_PRESET_OPTIONS,),
        ),
        ProfileFact(
            key="per_segment_duration",
            level="verified",
            value="Mỗi đoạn trong cảnh 3–12 giây.",
            sources=(SRC_SEG_CONSTANTS,),
        ),
        ProfileFact(
            key="resolution",
            level="verified",
            value="Chỉ 480p và 720p — kênh của bản mini chỉ mở hai mức này.",
            sources=(SRC_RESOLUTIONS, SRC_PRESET_RATIOS),
        ),
        ProfileFact(
            key="native_audio",
            level="verified",
            value=(
                "generate_audio bật sẵn, giống hệt Seedance 2.0 — mini khác ở tốc độ và giá, "
                "khác ở ngôn ngữ prompt."
            ),
            sources=(
                "backend/app/services/drama/build_seedance_generate_body.py:750-759",
                SRC_PRESET_VIDEO_ROWS,
            ),
            note="Hành vi lấy từ phần dựng chung của hệ thống, chưa tách riêng cho mini.",
        ),
        ProfileFact(
            key="negative_prompt",
            level="verified",
            value="Không có trường negative riêng — cấm viết thẳng trong khối 【强制约束】.",
            sources=(SRC_DRAMA_SECTIONS,),
        ),
    ),
    "seedance-2-5": (
        ProfileFact(
            key="aspect_ratio",
            level="verified",
            value=(
                "ratio nhận tự do trong 9:16 / 16:9 / 1:1. adaptive chỉ là giá trị dự phòng khi "
                "không có mục tiêu khung hình — không dùng adaptive nếu bạn cần dọc."
            ),
            sources=(SRC_PRESET_RATIOS, SRC_DRAMA_RATIO_OMIT, SRC_ARK_RATIO_FIRSTFRAME),
        ),
        ProfileFact(
            key="duration",
            level="verified",
            value="4–30 giây mỗi cảnh.",
            sources=(SRC_PRESET_OPTIONS,),
        ),
        ProfileFact(
            key="per_segment_duration",
            level="verified",
            value="Mỗi đoạn trong cảnh 3–12 giây.",
            sources=(SRC_SEG_CONSTANTS,),
        ),
        ProfileFact(
            key="resolution",
            level="verified",
            value="480p / 720p / 1080p — bản 2.5 là bản Seedance duy nhất mở 1080p.",
            sources=(SRC_RESOLUTIONS, SRC_PRESET_VIDEO_ROWS, SRC_PRESET_RATIOS),
        ),
        ProfileFact(
            key="native_audio",
            level="verified",
            value=(
                "generate_audio bật sẵn; hệ thống ưu tiên gửi kịch bản có mốc thời gian dạng văn "
                "bản thuần, JSON summary_caption chỉ còn là đường dự phòng."
            ),
            sources=(
                "backend/app/services/ark.py:1154-1156",
                "backend/app/services/drama/build_seedance_generate_body.py:750-759",
            ),
        ),
        ProfileFact(
            key="negative_prompt",
            level="verified",
            value="Không có trường negative riêng — cấm viết thẳng trong khối 【强制约束】.",
            sources=(SRC_DRAMA_SECTIONS,),
        ),
    ),
}


SEEDANCE_PROFILES: tuple[ModelPromptProfile, ...] = (
    ModelPromptProfile(
        id="seedance-2-0",
        label="Seedance 2.0",
        family="seedance",
        readiness="evidence-based",
        compiler_mode="seedance",
        dialect=SEEDANCE_DIALECT,
        parameters=SEEDANCE_PARAMETER_FACTS["seedance-2-0"],
        references=SEEDANCE_REFERENCES,
        failures=SEEDANCE_FAILURES,
        hints=_seedance_hints("seedance-2-0", ("480p", "720p")),
    ),
    ModelPromptProfile(
        id="seedance-2-0-mini",
        label="Seedance 2.0 Mini",
        family="seedance",
        readiness="evidence-based",
        compiler_mode="seedance",
        dialect=SEEDANCE_DIALECT,
        parameters=SEEDANCE_PARAMETER_FACTS["seedance-2-0-mini"],
        references=SEEDANCE_REFERENCES,
        failures=SEEDANCE_FAILURES,
        hints=_seedance_hints("seedance-2-0-mini", ("480p", "720p")),
    ),
    ModelPromptProfile(
        id="seedance-2-5",
        label="Seedance 2.5",
        family="seedance",
        readiness="evidence-based",
        compiler_mode="seedance",
        dialect=SEEDANCE_DIALECT,
        parameters=SEEDANCE_PARAMETER_FACTS["seedance-2-5"],
        references=SEEDANCE_REFERENCES,
        failures=SEEDANCE_FAILURES,
        hints=_seedance_hints("seedance-2-5", ("480p", "720p", "1080p")),
    ),
)


# ---------------------------------------------------------------------------
# Kling — có tài liệu chính thức, chưa tự chạy thử
# ---------------------------------------------------------------------------

KLING_DIALECT: tuple[ProfileFact, ...] = (
    ProfileFact(
        key="language",
        level="verified",
        value=(
            "Prompt viết bằng tiếng Anh trong mọi ví dụ chính thức. Kling VIDEO 3.0 đọc được lời "
            "thoại tiếng Trung, Anh, Nhật, Hàn, Tây Ban Nha; ngôn ngữ khác sẽ được dịch sang "
            "tiếng Anh."
        ),
        sources=(DOC_KLING_GUIDE_30, DOC_KLING_T2V_MD),
    ),
    ProfileFact(
        key="structure",
        level="verified",
        value=(
            "Một cảnh: prompt văn xuôi tự do. Nhiều cảnh: dùng định dạng cố định "
            "“shot n, m, words; shot n, m, words;” phân tách bằng dấu chấm phẩy nửa độ rộng — "
            "n là số thứ tự cảnh, m là số giây của cảnh, words là mô tả cảnh."
        ),
        sources=(DOC_KLING_T2V_MD, DOC_KLING_GUIDE_30),
    ),
    ProfileFact(
        key="timing_syntax",
        level="verified",
        value=(
            "Trong prompt nhiều cảnh: tối đa 6 storyboard, mỗi cảnh ≥ 1 giây, tổng số giây phải "
            "bằng đúng settings.duration, mỗi cảnh tối đa 512 ký tự."
        ),
        sources=(DOC_KLING_T2V_MD,),
    ),
    ProfileFact(
        key="reference_addressing",
        level="unknown",
        value="",
        note="",
    ),
    ProfileFact(
        key="negation_style",
        level="verified",
        value=(
            "Không có trường negative riêng — tài liệu nói rõ prompt có thể chứa cả mô tả tích "
            "cực lẫn tiêu cực trong cùng một chuỗi."
        ),
        sources=(DOC_KLING_T2V_MD,),
    ),
    ProfileFact(
        key="voice_cue",
        level="verified",
        value=(
            "Gán lời thoại trực tiếp cho từng nhân vật trong prompt theo dạng "
            "‘Tên nhân vật (giọng cảm xúc): “lời thoại”’ — Kling VIDEO 3.0 tự khớp đúng người "
            "nói, hỗ trợ từ 3 nhân vật trở lên. Có thể ghi chú giọng vùng/lỗ để đổi giọng địa "
            "phương."
        ),
        sources=(DOC_KLING_GUIDE_30,),
    ),
    ProfileFact(
        key="text_payload",
        level="verified",
        value=(
            "Prompt là một chuỗi văn bản đơn lẻ trong trường prompt, tối đa 3072 ký tự "
            "(khuyến nghị không quá 2500)."
        ),
        sources=(DOC_KLING_T2V_MD,),
    ),
    ProfileFact(
        key="shot_syntax",
        level="verified",
        value=(
            "Thuật ngữ điện ảnh viết thẳng trong văn xuôi: “Low-angle side close-up, tracking "
            "shot” — không có nhãn bắt buộc nào."
        ),
        sources=(DOC_KLING_GUIDE_30,),
    ),
)

KLING_PARAMETERS: tuple[ProfileFact, ...] = (
    ProfileFact(
        key="aspect_ratio",
        level="verified",
        value="settings.aspect_ratio: 16:9 / 9:16 / 1:1, mặc định 16:9.",
        sources=(DOC_KLING_T2V_MD,),
    ),
    ProfileFact(
        key="duration",
        level="verified",
        value="settings.duration: số nguyên 3–15 giây, mặc định 5 (bản 3.0).",
        sources=(DOC_KLING_T2V_MD, DOC_KLING_GUIDE_30),
    ),
    ProfileFact(
        key="per_segment_duration",
        level="verified",
        value="Trong prompt nhiều cảnh, mỗi cảnh ≥ 1 giây và tổng phải bằng settings.duration.",
        sources=(DOC_KLING_T2V_MD,),
    ),
    ProfileFact(
        key="resolution",
        level="verified",
        value="settings.resolution: 720p / 1080p, mặc định 720p.",
        sources=(DOC_KLING_T2V_MD,),
    ),
    ProfileFact(
        key="native_audio",
        level="verified",
        value=(
            "Có âm thanh gốc. Trên 2.6 và O1, settings.audio: native / off; trên 3.0 Turbo "
            "text-to-video chưa có trường audio, nhưng bản hướng dẫn 3.0 nói rõ bản này xuất "
            "âm thanh gốc kèm thoại."
        ),
        sources=(DOC_KLING_I2V_26, DOC_KLING_OMNI_O1, DOC_KLING_GUIDE_30),
        note="Khác nhau giữa các bản Kling; kiểm tra đúng endpoint trước khi dựng vào.",
    ),
    ProfileFact(
        key="negative_prompt",
        level="verified",
        value="Không có trường negative riêng; mô tả điều cần tránh nằm trong prompt.",
        sources=(DOC_KLING_T2V_MD,),
    ),
)

KLING_REFERENCES: tuple[ProfileFact, ...] = (
    ProfileFact(
        key="reference_image_field",
        level="verified",
        value=(
            "Endpoint text-to-video không nhận ảnh. Ảnh chỉ đi qua mảng contents[] với "
            "type = first_frame / last_frame / refer_image (bản Omni), mỗi phần tử có url và id."
        ),
        sources=(DOC_KLING_I2V_26, DOC_KLING_OMNI_O1),
    ),
    ProfileFact(
        key="reference_image_max",
        level="unknown",
        value="",
        note="",
    ),
    ProfileFact(
        key="reference_image_url",
        level="verified",
        value=(
            "Ảnh first_frame / last_frame phải là .jpg / .jpeg / .png, dưới 50MB, cạnh ≥ 300px, "
            "tỉ lệ nằm trong 1:2.5 – 2.5:1."
        ),
        sources=(DOC_KLING_I2V_26,),
    ),
    ProfileFact(
        key="reference_image_aspect",
        level="verified",
        value="Tỉ lệ ảnh phải nằm trong 1:2.5 – 2.5:1 (tức 0.40 – 2.50).",
        sources=(DOC_KLING_I2V_26,),
    ),
    ProfileFact(
        key="reference_roles",
        level="verified",
        value=(
            "type hợp lệ trong contents[]: prompt, first_frame, last_frame, refer_image, "
            "feature_video, base_video, element."
        ),
        sources=(DOC_KLING_OMNI_O1,),
    ),
    ProfileFact(
        key="reference_audio",
        level="verified",
        value=(
            "Có type = voice với voice_id (bản 2.6). Trên O1, settings.audio: original giữ âm "
            "thanh gốc của video tham chiếu, off thì không có âm thanh."
        ),
        sources=(DOC_KLING_I2V_26, DOC_KLING_OMNI_O1),
    ),
    ProfileFact(
        key="real_person_images",
        level="unknown",
        value="",
        note="",
    ),
)

KLING_FAILURES: tuple[KnownFailure, ...] = (
    KnownFailure(
        key="last_frame_only_unsupported",
        level="verified",
        summary="Chỉ dùng khung hình cuối mà không có khung hình đầu không được hỗ trợ.",
        source=DOC_KLING_I2V_26,
    ),
    KnownFailure(
        key="first_and_last_frame_1080p_only",
        level="verified",
        summary="Dùng cả khung hình đầu và cuối thì chỉ chạy được ở 1080p.",
        source=DOC_KLING_I2V_26,
    ),
    KnownFailure(
        key="native_audio_1080p_only",
        level="verified",
        summary="Bật âm thanh gốc (audio = native) thì chỉ chạy được ở 1080p.",
        source=DOC_KLING_I2V_26,
    ),
    KnownFailure(
        key="first_frame_only_duration_fixed",
        level="verified",
        summary=(
            "Chỉ dùng khung hình đầu, không kèm refer_image hay video tham chiếu, thì chỉ sinh "
            " được video 5 giây hoặc 10 giây."
        ),
        source=DOC_KLING_OMNI_O1,
    ),
    KnownFailure(
        key="aspect_ratio_required_without_first_frame",
        level="verified",
        summary=(
            "Khi không có khung hình đầu và không có video tham chiếu, settings.aspect_ratio là "
            "bắt buộc."
        ),
        source=DOC_KLING_OMNI_O1,
    ),
)


# ---------------------------------------------------------------------------
# Veo — có tài liệu chính thức, chưa tự chạy thử
# ---------------------------------------------------------------------------

VEO_DIALECT: tuple[ProfileFact, ...] = (
    ProfileFact(
        key="language",
        level="verified",
        value=(
            "Prompt viết bằng tiếng Anh trong mọi ví dụ chính thức, kể cả hướng dẫn của DeepMind. "
            "Hệ thống này chưa tự chạy thử bằng tiếng Việt hay tiếng Trung."
        ),
        sources=(DOC_VEO_BLOG_31, DOC_VEO_DEEPMIND_GUIDE),
    ),
    ProfileFact(
        key="structure",
        level="verified",
        value=(
            "Công thức 5 phần: [Cinematography] + [Subject] + [Action] + [Context] + "
            "[Style & Ambiance]. Yếu tố cinematography đứng đầu là mạnh nhất trong năm yếu tố."
        ),
        sources=(DOC_VEO_BLOG_31,),
    ),
    ProfileFact(
        key="timing_syntax",
        level="verified",
        value=(
            "Prompt theo mốc thời gian dạng [00:00-00:02] mô tả cảnh, [00:02-00:04] mô tả tiếp — "
            "một lần tạo ra được cả chuỗi nhiều cảnh."
        ),
        sources=(DOC_VEO_BLOG_31,),
    ),
    ProfileFact(
        key="reference_addressing",
        level="verified",
        value=(
            "Khi dùng ingredients to video, mở đầu prompt bằng cách gọi tên ảnh tham chiếu: "
            "“Using the provided images for the detective, the woman, and the office "
            "setting, create …”"
        ),
        sources=(DOC_VEO_BLOG_31,),
    ),
    ProfileFact(
        key="negation_style",
        level="verified",
        value=(
            "Không nên viết “no …”. Hướng dẫn chính thức yêu cầu mô tả thứ muốn có: "
            "“a desolate landscape with no buildings or roads” thay cho “no man-made structures”."
        ),
        sources=(DOC_VEO_BLOG_31,),
    ),
    ProfileFact(
        key="voice_cue",
        level="verified",
        value=(
            "Lời thoại đặt trong dấu nháy kép, ví dụ: A woman says, “We have to leave now.”. "
            "Âm thanh nền và hiệu ứng viết rõ bằng nhãn: SFX: …, Ambient noise: …"
        ),
        sources=(DOC_VEO_BLOG_31,),
    ),
    ProfileFact(
        key="text_payload",
        level="verified",
        value="Một chuỗi prompt văn bản đơn lẻ; có trường negativePrompt riêng trong API.",
        sources=(DOC_VEO_VERTEX_T2V,),
    ),
    ProfileFact(
        key="shot_syntax",
        level="verified",
        value=(
            "Thuật ngữ điện ảnh chuẩn viết thẳng: dolly shot, tracking shot, crane shot, "
            "slow pan, POV shot; bố cục: wide shot, close-up, extreme close-up, low angle, "
            "two-shot; ống kính: shallow depth of field, wide-angle lens, macro lens, deep focus."
        ),
        sources=(DOC_VEO_BLOG_31,),
    ),
)

VEO_PARAMETERS: tuple[ProfileFact, ...] = (
    ProfileFact(
        key="aspect_ratio",
        level="verified",
        value="Chỉ 16:9 và 9:16. Không có 1:1.",
        sources=(DOC_VEO_BLOG_31, DOC_VEO_30_MODEL),
    ),
    ProfileFact(
        key="duration",
        level="verified",
        value="Chỉ 4, 6 hoặc 8 giây — không có giá trị tùy ý.",
        sources=(DOC_VEO_BLOG_31, DOC_VEO_30_MODEL),
    ),
    ProfileFact(
        key="per_segment_duration",
        level="verified",
        value="Mốc thời gian chia video 4/6/8 giây thành các đoạn 2 giây trong ví dụ chính thức.",
        sources=(DOC_VEO_BLOG_31,),
        note="Tài liệu không nêu giới hạn cứng cho một đoạn; đây là cách chia trong ví dụ.",
    ),
    ProfileFact(
        key="resolution",
        level="verified",
        value="720p hoặc 1080p; 4k chỉ có ở bản Veo 3.1 Preview.",
        sources=(DOC_VEO_BLOG_31, DOC_VEO_VERTEX_T2V),
    ),
    ProfileFact(
        key="native_audio",
        level="verified",
        value=(
            "Có âm thanh đồng bộ sinh từ chính prompt: thoại, SFX, tiếng không khí nền. Mọi video "
            "sinh ra đều mang watermark SynthID."
        ),
        sources=(DOC_VEO_BLOG_31,),
    ),
    ProfileFact(
        key="negative_prompt",
        level="verified",
        value=(
            "API có trường negativePrompt riêng (mặc định để trống), nhưng hướng dẫn chính thức "
            "vẫn khuyên mô tả điều muốn có thay vì liệt kê điều cấm."
        ),
        sources=(DOC_VEO_VERTEX_T2V, DOC_VEO_BLOG_31),
    ),
)

VEO_REFERENCES: tuple[ProfileFact, ...] = (
    ProfileFact(
        key="reference_image_field",
        level="verified",
        value=(
            "Hai đường: ingredients to video (ảnh tham chiếu bối cảnh / nhân vật / vật thể / "
            "phong cách để giữ nhất quán giữa các cảnh) và first frame + last frame để tạo "
            "chuyển cảnh."
        ),
        sources=(DOC_VEO_BLOG_31,),
    ),
    ProfileFact(
        key="reference_image_max",
        level="unknown",
        value="",
        note="",
    ),
    ProfileFact(
        key="reference_image_url",
        level="verified",
        value="Ảnh đầu vào image-to-video tối đa 20 MB.",
        sources=(DOC_VEO_30_MODEL,),
    ),
    ProfileFact(
        key="reference_image_aspect",
        level="unknown",
        value="",
        note="",
    ),
    ProfileFact(
        key="reference_roles",
        level="unknown",
        value="",
        note="",
    ),
    ProfileFact(
        key="reference_audio",
        level="unknown",
        value="",
        note="",
    ),
    ProfileFact(
        key="real_person_images",
        level="unknown",
        value="",
        note="",
    ),
)

VEO_FAILURES: tuple[KnownFailure, ...] = (
    KnownFailure(
        key="duration_not_arbitrary",
        level="verified",
        summary="Chỉ nhận 4, 6 hoặc 8 giây. Truyền số lẻ sẽ không hợp lệ.",
        source=DOC_VEO_30_MODEL,
    ),
    KnownFailure(
        key="no_square_aspect_ratio",
        level="verified",
        summary="Chỉ 16:9 và 9:16 — không có 1:1.",
        source=DOC_VEO_30_MODEL,
    ),
    KnownFailure(
        key="negative_no_wording",
        level="verified",
        summary=(
            "Viết “no …” trong prompt cho ra kết quả nghịch. Hướng dẫn chính thức yêu cầu mô tả "
            "thứ muốn có."
        ),
        source=DOC_VEO_BLOG_31,
    ),
)


# ---------------------------------------------------------------------------
# MiniMax H3 — chỉ có clamp phía hệ thống, không có tài liệu
# ---------------------------------------------------------------------------

MINIMAX_H3_PROFILE = ModelPromptProfile(
    id="MiniMax-H3",
    label="MiniMax H3",
    family="minimax",
    readiness="skeleton",
    compiler_mode="neutral",
    dialect=(
        ProfileFact(key="language", level="unknown"),
        ProfileFact(key="structure", level="unknown"),
        ProfileFact(key="timing_syntax", level="unknown"),
        ProfileFact(key="reference_addressing", level="unknown"),
        ProfileFact(key="negation_style", level="unknown"),
        ProfileFact(key="voice_cue", level="unknown"),
        ProfileFact(key="text_payload", level="unknown"),
        ProfileFact(key="shot_syntax", level="unknown"),
    ),
    parameters=(
        ProfileFact(
            key="aspect_ratio",
            level="assumed",
            value="9:16 / 16:9 / 1:1 theo danh sách mà hệ thống này đang cho chọn.",
            sources=(SRC_PRESET_RATIOS, SRC_PRESET_OPTIONS),
            note=(
                "Suy luận. Đây là danh sách phía giao diện của chúng ta, không phải tài liệu "
                "MiniMax — chưa biết MiniMax thật sự nhận những tỉ lệ nào."
            ),
        ),
        ProfileFact(
            key="duration",
            level="verified",
            value="4–15 giây theo clamp phía kênh của hệ thống này.",
            sources=(SRC_PRESET_VIDEO_ROWS, SRC_PRESET_OPTIONS),
            note=(
                "Bằng chứng là hành vi kênh đang chạy trên chính hệ thống này, không phải tài liệu "
                "chính thức của MiniMax."
            ),
        ),
        ProfileFact(
            key="per_segment_duration",
            level="unknown",
        ),
        ProfileFact(
            key="resolution",
            level="verified",
            value="Chỉ 720p theo clamp phía kênh của hệ thống này.",
            sources=(SRC_PRESET_VIDEO_ROWS, SRC_PRESET_OPTIONS),
            note="Bằng chứng là hành vi kênh đang chạy, không phải tài liệu chính thức.",
        ),
        ProfileFact(key="native_audio", level="unknown"),
        ProfileFact(key="negative_prompt", level="unknown"),
    ),
    references=(
        ProfileFact(key="reference_image_field", level="unknown"),
        ProfileFact(key="reference_image_max", level="unknown"),
        ProfileFact(key="reference_image_url", level="unknown"),
        ProfileFact(key="reference_image_aspect", level="unknown"),
        ProfileFact(key="reference_roles", level="unknown"),
        ProfileFact(key="reference_audio", level="unknown"),
        ProfileFact(key="real_person_images", level="unknown"),
    ),
    failures=(),
    hints=_seedance_hints("MiniMax-H3", ("720p",)),
)


# ---------------------------------------------------------------------------
# Muse Video — chỉ có thông báo ra mắt, không có tài liệu API cho video
# ---------------------------------------------------------------------------

MUSE_PROFILE = ModelPromptProfile(
    id="muse-video",
    label="Muse Video",
    family="meta",
    readiness="skeleton",
    compiler_mode="neutral",
    dialect=(
        ProfileFact(key="language", level="unknown"),
        ProfileFact(key="structure", level="unknown"),
        ProfileFact(key="timing_syntax", level="unknown"),
        ProfileFact(key="reference_addressing", level="unknown"),
        ProfileFact(key="negation_style", level="unknown"),
        ProfileFact(key="voice_cue", level="unknown"),
        ProfileFact(key="text_payload", level="unknown"),
        ProfileFact(key="shot_syntax", level="unknown"),
    ),
    parameters=(
        ProfileFact(key="aspect_ratio", level="unknown"),
        ProfileFact(key="duration", level="unknown"),
        ProfileFact(key="per_segment_duration", level="unknown"),
        ProfileFact(key="resolution", level="unknown"),
        ProfileFact(
            key="native_audio",
            level="verified",
            value="Muse Video có hỗ trợ âm thanh gốc, nhưng chưa có tài liệu kỹ thuật.",
            sources=(DOC_MUSE_BLOG,),
        ),
        ProfileFact(key="negative_prompt", level="unknown"),
    ),
    references=(
        ProfileFact(key="reference_image_field", level="unknown"),
        ProfileFact(key="reference_image_max", level="unknown"),
        ProfileFact(key="reference_image_url", level="unknown"),
        ProfileFact(key="reference_image_aspect", level="unknown"),
        ProfileFact(key="reference_roles", level="unknown"),
        ProfileFact(key="reference_audio", level="unknown"),
        ProfileFact(key="real_person_images", level="unknown"),
    ),
    failures=(),
    hints=CompilerHints(),
)


KLING_PROFILE = ModelPromptProfile(
    id="kling-3-0",
    label="Kling VIDEO 3.0",
    family="kling",
    readiness="docs-based",
    compiler_mode="kling3",
    dialect=KLING_DIALECT,
    parameters=KLING_PARAMETERS,
    references=KLING_REFERENCES,
    failures=KLING_FAILURES,
    hints=CompilerHints(
        aspect_ratios=("16:9", "9:16", "1:1"),
        resolutions=("720p", "1080p"),
        duration_min=3,
        duration_max=15,
    ),
)

VEO_PROFILE = ModelPromptProfile(
    id="veo-3-1",
    label="Veo 3.1",
    family="veo",
    readiness="docs-based",
    compiler_mode="veo",
    dialect=VEO_DIALECT,
    parameters=VEO_PARAMETERS,
    references=VEO_REFERENCES,
    failures=VEO_FAILURES,
    hints=CompilerHints(
        aspect_ratios=("16:9", "9:16"),
        resolutions=("720p", "1080p"),
        duration_values=(4, 6, 8),
        duration_min=4,
        duration_max=8,
    ),
)


PROFILES: dict[str, ModelPromptProfile] = {
    p.id: p for p in (*SEEDANCE_PROFILES, KLING_PROFILE, VEO_PROFILE, MINIMAX_H3_PROFILE, MUSE_PROFILE)
}

# Thứ tự hiển thị: bằng chứng mạnh nhất lên trước.
PROFILE_ORDER: tuple[str, ...] = (
    "seedance-2-5",
    "seedance-2-0",
    "seedance-2-0-mini",
    "veo-3-1",
    "kling-3-0",
    "MiniMax-H3",
    "muse-video",
)


def list_profiles() -> list[dict[str, Any]]:
    """Hồ sơ theo thứ tự hiển thị, đã kèm số đếm bằng chứng."""
    out: list[dict[str, Any]] = []
    for pid in PROFILE_ORDER:
        profile = PROFILES.get(pid)
        if profile is not None:
            out.append(profile.to_dict())
    return out


def get_profile(model_id: str | None) -> ModelPromptProfile | None:
    """Tra hồ sơ theo id, không phân biệt hoa thường."""
    raw = (model_id or "").strip()
    if not raw:
        return None
    lowered = raw.lower()
    for pid, profile in PROFILES.items():
        if pid.lower() == lowered:
            return profile
    return None
