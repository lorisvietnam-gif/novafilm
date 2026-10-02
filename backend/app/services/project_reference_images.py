"""项目级参考图：把 Canvas 选的主体/画风参考图接到 Seedance 多图参考。

这里只做**校验与拼装**，不重写既有规则：
- 主体优先、画风板保留一个名额 → style_lock.split_seedream_subject_style_refs
- 单次 9 张上限 → media_ref_limits.MAX_REFERENCE_IMAGES
- first_frame 与 reference_image 互斥 → drama.seedance_i2v_role.resolve_seedance_i2v_image_role

四个 chốt chặn（宁可报错，不悄悄少发图；少发图会让角色画错）：
1. 单次参考图不超过 9 张，超了报可读错误。
2. first_frame 模式与参考图二选一，报错而不是两种 role 混发。
3. 同一张图重复提交会被上游按张数计，发送前必须去重。
4. 名额按本镜实际还要用的静帧/衔接尾帧/画风板扣减，不够就报错，不截断。
"""

from __future__ import annotations

from app.services.drama.seedance_i2v_role import resolve_seedance_i2v_image_role
from app.services.media_ref_limits import (
    MAX_REFERENCE_IMAGES,
    ReferenceImageError,
    cap_url_list,
    subject_image_budget,
)
from app.services.style_lock import seedream_ref_urls, split_seedream_subject_style_refs

__all__ = [
    "MAX_REFERENCE_IMAGES",
    "ReferenceImageError",
    "ensure_reference_image_mode",
    "merge_video_extra_refs",
    "reference_image_budget",
    "resolve_project_reference_images",
]


# 本镜静帧永远占一张（ark content[1]）
_STILL_FRAME_SLOTS = 1


def reference_image_budget(
    *,
    has_style_ref: bool,
    has_continuity_ref: bool = True,
) -> int:
    """用户参考图还能占几张：9 张上限扣掉静帧、衔接尾帧与画风板。"""
    return max(
        1,
        subject_image_budget(
            has_style_board=has_style_ref,
            has_continuity=has_continuity_ref,
        )
        - _STILL_FRAME_SLOTS,
    )


def _public_ref_urls(raw_urls: list[str] | None, label: str) -> list[str]:
    """只收公网 http(s) 地址；不可用的直接报错，不静默丢图。"""
    out: list[str] = []
    for raw in raw_urls or []:
        url = str(raw or "").strip()
        if not url:
            continue
        if not seedream_ref_urls(url, limit=1):
            raise ReferenceImageError(
                f"{label}参考图「{url[:80]}」不是公网可访问的 http(s) 地址，Seedance 拉不到。"
            )
        out.append(url)
    return out


def ensure_reference_image_mode(ratio: str | None, *, has_reference: bool) -> None:
    """chốt chặn 2：``first_frame`` 与参考图二选一，绝不同发。

    有参考图却没有目标画幅时，ark 会退回纯首帧模式，此时再带参考图就成了混发，
    所以这里直接报可读错误。画幅只有流水线算得出来，故与请求校验分开。
    """
    if not has_reference:
        return
    if resolve_seedance_i2v_image_role(ratio)[0] == "first_frame":
        raise ReferenceImageError(
            "首帧模式（first_frame）不能与参考图同时发送："
            "请先设定画面比例以启用多图参考，或去掉参考图。"
        )


def resolve_project_reference_images(
    subject_ref_urls: list[str] | None,
    style_ref_urls: list[str] | None,
) -> list[str]:
    """校验请求里的参考图，返回可直接作为 Seedance ``extra_image_urls`` 的列表。

    没有参考图时返回空列表，行为与接入前完全一致。规则与画幅无关，
    所以 API 层可以在建任务前先跑一遍，把错误直接回给用户。

    Raises:
        ReferenceImageError: 地址不可公网访问、超 9 张、或超出本镜可用名额。
    """
    subjects = _public_ref_urls(subject_ref_urls, "主体")
    styles = _public_ref_urls(style_ref_urls, "画风")
    if not subjects and not styles:
        return []

    # 同一张图重复提交会被上游按张数计，先按 URL 去重再算张数。
    # 用 seedream_ref_urls 而不是 cap_url_list：后者会顺手截到 9 张，那样就看不出超限了。
    candidates = [*subjects, *styles]
    unique = seedream_ref_urls(*candidates, limit=len(candidates))
    if len(unique) > MAX_REFERENCE_IMAGES:
        raise ReferenceImageError(
            f"参考图共 {len(unique)} 张，超过单次上限 {MAX_REFERENCE_IMAGES} 张，请删减后重试。"
        )

    subject_refs, style_refs = split_seedream_subject_style_refs(
        subjects,
        styles,
        max_total=MAX_REFERENCE_IMAGES,
    )
    budget = reference_image_budget(has_style_ref=bool(style_refs))
    if len(subject_refs) > budget:
        raise ReferenceImageError(
            f"主体参考图 {len(subject_refs)} 张，超出本镜可用名额 {budget} 张"
            f"（{MAX_REFERENCE_IMAGES} 张上限还要留给本镜静帧、上一镜尾帧"
            f"{'与画风板' if style_refs else ''}），请删减后再生成。"
        )
    return cap_url_list([*subject_refs, *style_refs])


def merge_video_extra_refs(
    continuity_refs: list[str] | None,
    reference_urls: list[str] | None,
) -> list[str]:
    """衔接尾帧优先、用户参考图随后；去重并守住含静帧的 9 张上限。"""
    refs = cap_url_list([*(continuity_refs or []), *(reference_urls or [])])
    total = len(refs) + _STILL_FRAME_SLOTS
    if total > MAX_REFERENCE_IMAGES:
        raise ReferenceImageError(
            f"本镜参考图合计 {total} 张，超过单次上限 {MAX_REFERENCE_IMAGES} 张。"
        )
    return refs