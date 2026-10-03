"""剧本摘要 Agent 提示词与用户消息（对齐 manju scriptSummary）。"""

from __future__ import annotations

from app.services.ark import resolve_output_language_spec
from app.services.drama.image_styles import (
    IMAGE_STYLE_IDS,
    get_image_style_label,
    resolve_image_style_prompt,
)

# `default_locale` 从 `settings` 取（config.py 里是 vi）；这里只兜底“调用方没给 locale”。
DEFAULT_SUMMARY_LOCALE = "vi"

# SCRIPT_SUMMARY_SYSTEM_PROMPT 指导 LLM 将原始创意转为结构化剧本摘要
#
# Vì sao phần này cũng phải theo locale (đo thật 2026-10-03, project 41, locale=vi):
# tóm tắt là **đầu vào** của mọi prompt phân tập. Tóm tắt bằng tiếng Trung thì tên nhân
# vật, tên địa điểm và synopsis đều bằng tiếng Trung, và chúng kéo `episode_content`
# theo (project 37 của đợt 1: `cjk_prose=690` dù system prompt phân tập đã sạch).
# Ba câu mang lệnh ngôn ngữ — quy tắc 6 (độ dài tên phim), quy tắc 10 (ngôn ngữ
# synopsis) và quy tắc 11 (ngôn ngữ chung) — là ba câu **trực tiếp** bảo model viết
# bằng tiếng Trung, nên chúng phải đi theo locale. Phần còn lại của mẫu vẫn viết lệnh
# bằng tiếng Trung: đó là chuẩn chung của mọi prompt trong dự án, và đổi nó thì phải
# có phép đo riêng.
#
# `__LANGUAGE_RULE__` là câu ép ngôn ngữ dùng chung của `ark.py`.
_SCRIPT_SUMMARY_SYSTEM_PROMPT = """你是专业的短剧/网剧剧本策划，负责把用户提供的原始创意、故事大纲或灵感，整理成可直接用于立项与编剧开工的结构化「剧本摘要」。

输出要求：
1. 忠实于用户创意，可合理补全细节，但不要擅自改掉核心设定、主线与结局
2. 若用户提供了目标集数，episodeCount 必须与该值完全一致；未提供时根据故事体量合理估算（短篇 12–24 集，中篇 30–60 集，长篇可更高）
3. 若用户提供了画面风格，人物 visualImage 须体现该风格的视觉美学，storyType 可融合风格相关标签
4. storyType、coreHook 用「+」连接多个标签，风格参考：古风奇幻+神话后传+反乌托邦
5. targetAudience 简洁，如：男频 / 大众、女频 / 青年 等
6. __TITLE_LENGTH_RULE__
7. oneLineStory 一句话说清主线 + 最大反转或钩子（与 seriesTitle 不同：前者是剧名，后者是卖点句）
8. characters 须覆盖故事中全部具名出场角色（主角、重要配角、反派）；群演/路人可合并为 1 个群体角色；每人字段须饱满、可拍摄、有戏剧张力；不要只写 2–3 个主角而漏掉其余具名人物。禁止把「音色 / 声音 / 旁白音色」或带（声音）（音色）后缀的名字写成角色；旁白若需出场可写「某某旁白」本体，不要单独建「某某（声音）」
9. 人物小传中 growthArc 必须用「阶段A -> 阶段B -> 阶段C」格式
10. __SYNOPSIS_LANGUAGE_RULE__
11. __LANGUAGE_RULE__
12. 每人 visualImage 须 100–200 字：写清性别年龄、脸型五官、发型、体型、服饰材质与配色、气质神态、标志性道具或细节；可直接作 AI 定妆照提示词；禁止仅写「英俊」「美丽」等空泛词
13. characters 建议 5–12 人；确有大量具名配角时宁可多列，也不要省略会反复出场的名字

__LANGUAGE_DIRECTIVE__

必须输出严格 JSON 对象（不要 markdown、不要代码围栏），字段：
{
  "episodeCount": number,
  "seriesTitle": string,
  "storyType": string,
  "targetAudience": string,
  "coreHook": string,
  "oneLineStory": string,
  "characters": [
    {
      "name": string,
      "title": string,
      "roleType": string,
      "visualImage": string,
      "coreTags": string,
      "identityBackground": string,
      "growthExperience": string,
      "personality": string,
      "relationships": string,
      "growthArc": string
    }
  ],
  "synopsis": string
}"""


def script_summary_system_prompt(locale: str = "") -> str:
    """System prompt của agent tóm tắt, đã điền câu ngôn ngữ theo locale."""
    lang = resolve_output_language_spec(locale, default=DEFAULT_SUMMARY_LOCALE)
    text = lang.summary
    return (
        _SCRIPT_SUMMARY_SYSTEM_PROMPT.replace(
            "__TITLE_LENGTH_RULE__",
            text.title_length_rule.format(unit=lang.length_unit),
        )
        .replace(
            "__SYNOPSIS_LANGUAGE_RULE__",
            text.synopsis_language_rule.format(name=lang.name, unit=lang.length_unit),
        )
        .replace(
            "__LANGUAGE_RULE__",
            text.language_rule.format(name=lang.name, unit=lang.length_unit),
        )
        .replace("__LANGUAGE_DIRECTIVE__", lang.directive)
    )


# 解析合法的画面风格 ID
def _resolve_image_style_id(style_id: str | None) -> str | None:
    if not style_id:
        return None
    sid = style_id.strip()
    return sid if sid in IMAGE_STYLE_IDS else None


# 将入参格式化为 LLM 用户消息（对齐 manju buildScriptSummaryUserMessage）
def build_script_summary_user_message(
    creative: str,
    *,
    episode_count: int | None = None,
    image_style_id: str | None = None,
    locale: str = "",
) -> str:
    trimmed = (creative or "").strip()
    text = resolve_output_language_spec(locale, default=DEFAULT_SUMMARY_LOCALE).summary
    sections = [f"{text.creative_heading}\n{trimmed}"]
    production_params: list[str] = []

    if episode_count is not None:
        production_params.append(text.episode_count_rule.format(count=episode_count))

    resolved_style = _resolve_image_style_id(image_style_id)
    if resolved_style:
        label = get_image_style_label(resolved_style)
        style_prompt = resolve_image_style_prompt(resolved_style)
        production_params.append(
            text.style_rule.format(label=label, style_id=resolved_style)
        )
        if style_prompt:
            production_params.append(text.style_note.format(note=style_prompt))
        production_params.append(text.style_must_match)

    if production_params:
        sections.append("\n".join([text.params_heading, *production_params]))

    return "\n\n".join(sections)
