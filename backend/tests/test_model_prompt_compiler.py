"""Hồ sơ model và bộ biên dịch prompt — trọng tâm là KHÔNG ĐOAN.

Các test ở đây cố tình bảo vệ điều dễ vỡ nhất: một mục `unknown` bị điền ý, một mục
`verified` mất nguồn, và một model chưa xác minh bị "tối ưu hoá" hoá ra prompt bịa.
"""

from __future__ import annotations

import pytest

from app.services.model_prompt_compiler import (
    SceneConfig,
    SceneReference,
    UnknownModelError,
    compile_prompt,
)
from app.services.model_prompt_profiles import (
    EVIDENCE_LEVELS,
    PROFILE_ORDER,
    PROFILES,
    KnownFailure,
    ProfileFact,
    get_profile,
    list_profiles,
)

ZH_SCENE = SceneConfig(
    subject="穿绿裙的年轻女子",
    action="在草坪上奔跑并回头",
    setting="月下花园",
    shot_size="远景",
    camera="缓慢横移跟随",
    light="冷蓝月光与银白星空",
    style="浪漫写实电影感，冷蓝夜色",
    narration="一百年后，人们仍记得这一夜。",
    dialogue=[("禹", "花谢了。")],
    references=[
        SceneReference(label="阿灵", url="https://cdn.example.com/ling.png", kind="character"),
        SceneReference(label="花园", url="https://cdn.example.com/garden.png", kind="scene"),
    ],
    avoid=["水印", "字幕条"],
)


# ---------------------------------------------------------------------------
# Hồ sơ
# ---------------------------------------------------------------------------


def test_every_profile_appears_once_in_display_order() -> None:
    assert set(PROFILE_ORDER) == set(PROFILES)
    assert len(PROFILE_ORDER) == len(set(PROFILE_ORDER))
    assert [p["id"] for p in list_profiles()] == list(PROFILE_ORDER)


def test_verified_facts_always_carry_a_source() -> None:
    for profile in PROFILES.values():
        for fact in profile.facts():
            if fact.level == "verified":
                assert fact.sources, f"{profile.id}.{fact.key} verified mà không có nguồn"
                assert all(s.strip() for s in fact.sources)
                assert fact.value.strip(), f"{profile.id}.{fact.key} verified mà để trống"


def test_assumed_facts_say_so() -> None:
    for profile in PROFILES.values():
        for fact in profile.facts():
            if fact.level == "assumed":
                assert fact.note.strip(), f"{profile.id}.{fact.key} assumed mà không ghi là suy luận"


def test_unknown_facts_are_blank_not_guessed() -> None:
    for profile in PROFILES.values():
        for fact in profile.facts():
            if fact.level == "unknown":
                assert fact.value == "", f"{profile.id}.{fact.key} unknown mà lại có giá trị"
                assert not fact.sources, f"{profile.id}.{fact.key} unknown mà lại dẫn nguồn"


def test_fact_level_is_validated_at_construction() -> None:
    with pytest.raises(ValueError):
        ProfileFact(key="x", level="probably")  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        ProfileFact(key="x", level="verified", value="something")
    with pytest.raises(ValueError):
        ProfileFact(key="x", level="unknown", value="guessed")
    with pytest.raises(ValueError):
        ProfileFact(key="x", level="assumed", value="something")
    with pytest.raises(ValueError):
        KnownFailure(key="x", level="verified", summary="no source")


def test_all_levels_are_part_of_the_public_contract() -> None:
    assert EVIDENCE_LEVELS == ("verified", "assumed", "unknown")


def test_evidence_counts_match_the_declared_facts() -> None:
    payload = next(p for p in list_profiles() if p["id"] == "seedance-2-0")
    counts = payload["evidence_counts"]
    listed = payload["dialect"] + payload["parameters"] + payload["references"] + payload["failures"]
    for level in EVIDENCE_LEVELS:
        assert counts[level] == sum(1 for item in listed if item["level"] == level)


def test_seedance_is_the_only_evidence_based_family() -> None:
    for profile in PROFILES.values():
        if profile.family == "seedance":
            assert profile.readiness == "evidence-based"
            assert profile.compiler_mode == "seedance"
        else:
            assert profile.readiness in {"docs-based", "skeleton"}


def test_unverified_models_never_claim_evidence_based_readiness() -> None:
    for model_id in ("MiniMax-H3", "muse-video"):
        profile = PROFILES[model_id]
        assert profile.readiness == "skeleton"
        assert profile.compiler_mode == "neutral"
        unknown = [f for f in profile.facts() if f.level == "unknown"]
        assert len(unknown) >= 15, f"{model_id} đang điền quá nhiều so với cái ta biết"


def test_docs_based_models_cite_only_official_urls() -> None:
    for model_id in ("veo-3-1", "kling-3-0"):
        for fact in PROFILES[model_id].facts():
            for src in fact.sources:
                assert src.startswith("https://"), f"{model_id}.{fact.key} nguồn không phải URL"
                assert any(
                    host in src
                    for host in (
                        "cloud.google.com",
                        "deepmind.google",
                        "googleblog.com",
                        "kling.ai",
                    )
                ), f"{model_id}.{fact.key} nguồn không phải tài liệu chính thức: {src}"


def test_seedance_sources_point_inside_this_repo() -> None:
    for fact in PROFILES["seedance-2-5"].facts():
        for src in fact.sources:
            assert not src.startswith("http"), f"nguồn Seedance phải là bằng chứng trong repo: {src}"


def test_lookup_is_case_insensitive_and_rejects_unknown() -> None:
    assert get_profile("SEEDANCE-2-0") is not None
    assert get_profile("  veo-3-1 ") is not None
    assert get_profile("") is None
    assert get_profile("sora") is None


# ---------------------------------------------------------------------------
# Bộ biên dịch — Seedance
# ---------------------------------------------------------------------------


def test_seedance_prompt_uses_the_verified_block_order() -> None:
    result = compile_prompt("seedance-2-5", ZH_SCENE, aspect_ratio="9:16", duration_sec=12)
    blocks = [b for b in result.prompt.split("\n\n") if b.strip()]
    heads = [b.split("\n", 1)[0] for b in blocks]
    assert heads[0].startswith("【强制约束：视频画面风格】")
    assert heads[1].startswith("【强制约束：音频、字幕与配乐】")
    assert heads[2].startswith("【强制约束：角色形象】")
    assert heads[3].startswith("【强制约束：场景】")
    # Khối 【强制约束：…】 phải nằm trước phần thân có mốc thời gian.
    body_index = next(i for i, b in enumerate(blocks) if b.startswith("00:00-"))
    assert all(h.startswith("【强制约束：") for h in heads[:body_index])


def test_seedance_body_carries_time_ranges_not_raw_tags() -> None:
    result = compile_prompt("seedance-2-0", ZH_SCENE, duration_sec=12)
    assert "@duration:" not in result.prompt
    assert "@" not in result.prompt.replace("@duration", "")
    assert "00:00-" in result.prompt


def test_seedance_voice_lines_are_cued() -> None:
    result = compile_prompt("seedance-2-0", ZH_SCENE, duration_sec=12)
    assert "【旁白·" in result.prompt
    assert "【对白·" in result.prompt
    assert "【画面·" in result.prompt


def test_seedance_references_are_numbered_in_submission_order() -> None:
    result = compile_prompt("seedance-2-0", ZH_SCENE, duration_sec=12)
    plan = result.parameters["reference_plan"]
    assert [p["index"] for p in plan] == [1, 2]
    assert plan[0]["label"] == "阿灵" and plan[0]["kind"] == "character"
    assert plan[1]["label"] == "花园" and plan[1]["kind"] == "scene"
    assert "阿灵：参考图1" in result.prompt
    assert "花园：参考图2" in result.prompt


def test_continuity_frame_alone_uses_first_frame_mode() -> None:
    scene = SceneConfig(
        subject="一个人", action="坐下", setting="咖啡馆", continuity_frame_url="https://x/last.jpg"
    )
    result = compile_prompt("seedance-2-0", scene, aspect_ratio="9:16", duration_sec=5)
    plan = result.parameters["reference_plan"]
    assert [p["kind"] for p in plan] == ["continuity"]
    # Không có ảnh/ audio tham chiếu nào khác thì được dùng first_frame và bỏ ratio.
    assert result.parameters["image_field"] == "first_frame_url"
    assert result.parameters["ratio"] == ""
    assert "以首帧图为开场画面" in result.prompt


def test_continuity_frame_rides_last_as_a_reference_image() -> None:
    scene = SceneConfig(
        subject="一个人",
        action="坐下",
        setting="咖啡馆",
        continuity_frame_url="https://x/last.jpg",
        references=[SceneReference(label="阿灵", url="https://x/ling.png", kind="character")],
    )
    result = compile_prompt("seedance-2-0", scene, aspect_ratio="9:16", duration_sec=5)
    plan = result.parameters["reference_plan"]
    assert [p["kind"] for p in plan] == ["character", "continuity"]
    # Có ảnh tham chiếu thì mọi ảnh kể cả khung hình cuối đều đi qua reference_image_urls.
    assert result.parameters["image_field"] == "reference_image_urls"
    assert result.parameters["ratio"] == "9:16"
    assert "参考图序列最后一张" in result.prompt


def test_pure_first_frame_uses_first_frame_and_drops_ratio() -> None:
    scene = SceneConfig(
        subject="一个人", action="坐下", setting="咖啡馆", continuity_frame_url="https://x/last.jpg"
    )
    result = compile_prompt("seedance-2-0", scene, aspect_ratio="9:16", duration_sec=5)
    assert result.parameters["image_field"] == "first_frame_url"
    assert result.parameters["ratio"] == ""
    assert "ratio_omitted_for_first_frame" in [w.code for w in result.warnings]


def test_references_force_reference_image_field_and_keep_ratio() -> None:
    result = compile_prompt("seedance-2-0", ZH_SCENE, aspect_ratio="9:16", duration_sec=12)
    assert result.parameters["image_field"] == "reference_image_urls"
    assert result.parameters["ratio"] == "9:16"


def test_seedance_warns_when_the_body_is_not_chinese() -> None:
    scene = SceneConfig(subject="cô gái", action="chạy", setting="vườn")
    codes = [w.code for w in compile_prompt("seedance-2-0", scene, duration_sec=5).warnings]
    assert "seedance_body_not_chinese" in codes


def test_seedance_clamps_parameters_to_the_model_allowlist() -> None:
    result = compile_prompt(
        "seedance-2-0", ZH_SCENE, aspect_ratio="4:5", duration_sec=90, resolution="4k"
    )
    codes = {w.code for w in result.warnings}
    assert "aspect_ratio_clamped" in codes
    assert "duration_clamped" in codes
    assert "resolution_clamped" in codes
    assert result.parameters["resolution"] == "720p"
    assert result.parameters["duration_sec"] == 30


def test_seedance_25_is_the_only_seedance_model_reaching_1080p() -> None:
    for model_id in ("seedance-2-0", "seedance-2-0-mini"):
        result = compile_prompt(model_id, ZH_SCENE, duration_sec=8, resolution="1080p")
        assert result.parameters["resolution"] == "720p"
    result = compile_prompt("seedance-2-5", ZH_SCENE, duration_sec=8, resolution="1080p")
    assert result.parameters["resolution"] == "1080p"


def test_minimax_h3_clamps_to_720p_and_15_seconds() -> None:
    result = compile_prompt(
        "MiniMax-H3", ZH_SCENE, aspect_ratio="9:16", duration_sec=40, resolution="1080p"
    )
    assert result.parameters["resolution"] == "720p"
    assert result.parameters["duration_sec"] == 15


def test_too_much_content_for_the_chosen_duration_is_reported() -> None:
    codes = {w.code for w in compile_prompt("seedance-2-0", ZH_SCENE, duration_sec=4).warnings}
    assert "segments_overflow" in codes


def test_empty_scene_falls_back_to_a_usable_line() -> None:
    result = compile_prompt("seedance-2-0", SceneConfig(), duration_sec=5)
    assert result.prompt.strip()
    assert "画面轻微动态" in result.prompt
    assert "subject_missing" in {w.code for w in result.warnings}


# ---------------------------------------------------------------------------
# Bộ biên dịch — model chưa xác minh
# ---------------------------------------------------------------------------


def test_unknown_model_is_refused_rather_than_guessed() -> None:
    with pytest.raises(UnknownModelError):
        compile_prompt("sora", ZH_SCENE, duration_sec=6)
    with pytest.raises(UnknownModelError):
        compile_prompt("", ZH_SCENE, duration_sec=6)


def test_unverified_model_gets_a_neutral_prompt_and_says_so() -> None:
    result = compile_prompt("muse-video", ZH_SCENE, aspect_ratio="9:16", duration_sec=8)
    assert result.compiler_mode == "neutral"
    assert "no verified profile" in result.prompt
    assert "Muse Video" in result.prompt
    codes = {w.code for w in result.warnings}
    assert "profile_unverified" in codes
    assert "parameters_unverified" in codes


def test_unverified_model_never_clamps_into_fake_limits() -> None:
    result = compile_prompt("muse-video", ZH_SCENE, aspect_ratio="4:5", duration_sec=99,
                            resolution="8k")
    assert result.parameters["aspect_ratio"] == "4:5"
    assert result.parameters["duration_sec"] == 99
    assert result.parameters["resolution"] == "8k"
    assert "aspect_ratio_clamped" not in {w.code for w in result.warnings}


def test_docs_based_prompt_states_the_target_and_the_lack_of_our_own_evidence() -> None:
    for model_id in ("veo-3-1", "kling-3-0"):
        result = compile_prompt(model_id, ZH_SCENE, duration_sec=8)
        assert result.prompt.startswith("[Target: ")
        assert "not verified by NOVAFILM" in result.prompt


def test_veo_uses_the_documented_five_part_formula() -> None:
    result = compile_prompt("veo-3-1", ZH_SCENE, duration_sec=8)
    for part in ("[Cinematography]", "[Subject]", "[Action]", "[Context]", "[Style & Ambiance]"):
        assert part in result.prompt


def test_veo_snaps_duration_to_the_documented_set() -> None:
    result = compile_prompt("veo-3-1", ZH_SCENE, duration_sec=7)
    assert result.parameters["durationSec"] == 6
    assert "duration_snapped" in {w.code for w in result.warnings}


def test_veo_rejects_square_by_clamping_to_a_documented_ratio() -> None:
    result = compile_prompt("veo-3-1", ZH_SCENE, aspect_ratio="1:1", duration_sec=8)
    assert result.parameters["aspectRatio"] == "16:9"
    assert "aspect_ratio_clamped" in {w.code for w in result.warnings}


def test_veo_keeps_prohibitions_out_of_the_prompt_and_in_negative_prompt() -> None:
    result = compile_prompt("veo-3-1", ZH_SCENE, duration_sec=8)
    assert "水印" not in result.prompt
    assert "水印" in result.parameters["negativePrompt"]


def test_kling_tells_the_user_text_to_video_takes_no_images() -> None:
    result = compile_prompt("kling-3-0", ZH_SCENE, duration_sec=8)
    assert "kling_needs_image_endpoint" in {w.code for w in result.warnings}
    assert result.parameters["reference_plan"] == []


def test_kling_keeps_positive_and_negative_descriptions_in_one_prompt() -> None:
    result = compile_prompt("kling-3-0", ZH_SCENE, duration_sec=8)
    assert "Avoid:" in result.prompt
    assert "水印" in result.prompt


def test_every_prompt_is_non_empty_and_newline_safe() -> None:
    for model_id in PROFILE_ORDER:
        result = compile_prompt(model_id, ZH_SCENE, aspect_ratio="9:16", duration_sec=8,
                                resolution="720p")
        assert result.prompt.strip(), model_id
        assert "\r" not in result.prompt
        assert not result.prompt.endswith(" ")


def test_compile_result_reports_which_facts_backed_the_prompt() -> None:
    result = compile_prompt("seedance-2-0", ZH_SCENE, duration_sec=12)
    keys = {f.key for f in result.used_facts}
    assert {"structure", "timing_syntax", "reference_addressing", "language"} <= keys
    assert all(f.level != "unknown" for f in result.used_facts)
