"""TokenFree 视频参考图张数上限（与漫剧分镜资产规则解耦）。"""

from __future__ import annotations

from collections.abc import Iterable

# 下游插件硬上限：一次提交最多 9 张参考图
MAX_REFERENCE_IMAGES = 9


class ReferenceImageError(ValueError):
    """参考图违规；``str(exc)`` 直接就是给用户看的报错文案。

    住在本模块而不是各调用方，因为上限是全局的、错误类型也必须是**同一个**：
    谁都可能在拼请求体时撞上限（API 层校验、Seedance 拼装、TokenFree 包装），
    上层只需要 ``except ReferenceImageError`` 就能一网打尽。
    """


def dedupe_reference_urls(urls: Iterable[str] | None) -> list[str]:
    """按地址去重并丢掉空串。**不截断** —— 张数判定交给调用方显式决定。"""
    out: list[str] = []
    seen: set[str] = set()
    for raw in urls or []:
        url = str(raw or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(url)
    return out


def ensure_within_reference_image_limit(urls: Iterable[str] | None) -> list[str]:
    """按地址去重后若仍超上限就**报错**，绝不截断。返回去重后的列表。

    为什么不能像 ``cap_url_list`` 那样悄悄丢掉多余的：被丢掉的那张很可能正是角色
    定妆照，用户却毫不知情，只会觉得「AI 画错人了」。少发一张图比直接失败更糟，
    所以宁可报错。

    去重放在这里而不是让调用方先做：上游按张数计费，同一张图发 10 次就是 10 张，
    但**去重这一步很容易漏**，而漏了会让本该放行的请求被误拒，或者让超限请求蒙混
    过关。收在函数内部，调用方就没有机会用错。

    Raises:
        ReferenceImageError: 去重后超过 ``MAX_REFERENCE_IMAGES`` 张。
    """
    unique = dedupe_reference_urls(urls)
    count = len(unique)
    if count > MAX_REFERENCE_IMAGES:
        raise ReferenceImageError(
            f"Yêu cầu có {count} ảnh tham chiếu, vượt trần {MAX_REFERENCE_IMAGES} ảnh mỗi lượt "
            f"(sẽ bị bỏ {count - MAX_REFERENCE_IMAGES} ảnh). "
            "Hệ thống không tự cắt bớt — bạn xoá bớt ảnh rồi tạo lại."
        )
    return unique


def cap_url_list(urls: list[str] | None, *, limit: int = MAX_REFERENCE_IMAGES) -> list[str]:
    """去重并截到上游可上传张数。

    只给**已经校验过张数**的调用方用（配额分摊、asset 上传列表）。参考图数量校验
    必须走 ``ensure_within_reference_image_limit``，不要用这里。
    """
    out: list[str] = []
    seen: set[str] = set()
    for raw in urls or []:
        url = str(raw or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(url)
        if len(out) >= max(1, int(limit)):
            break
    return out


def subject_image_budget(*, has_style_board: bool = False, has_continuity: bool = False) -> int:
    """主体参考图名额：总张数减去画风板与衔接尾帧。"""
    n = MAX_REFERENCE_IMAGES
    if has_style_board:
        n -= 1
    if has_continuity:
        n -= 1
    return max(1, n)
