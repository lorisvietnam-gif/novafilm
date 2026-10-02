# -*- coding: utf-8 -*-
"""`POST /api/wizard/generate_prompt` — hợp đồng, chất lượng prompt, và thu tiền.

Ba nhóm:
1. Dọn prompt (không ký tự Trung, không marker Seedance, đủ 7 nhãn, đúng thứ tự).
2. Endpoint qua HTTP thật với model giả — kiểm tra hợp đồng trả về.
3. Thu tiền: `charged > 0` và `refunded == est - charged`.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.services.billing.pricing import charge_fen_for_tokens
import app.services.wizard.prompt_writer as pw

from tests.conftest import make_user

# 7 nhãn đúng thứ tự. Đủ bộ này mới được nhận — thiếu một nhãn là model đã viết văn
# xuôi, tức là đã bịa.
GOOD_PROMPT = (
    "subject: a young woman in a leather jacket\n"
    "action: running down a wet street, stopping in front of a coffee shop\n"
    "setting: a rainy city street at night\n"
    "camera: tracking shot that settles into a medium close-up\n"
    "lighting: neon glow and reflections on wet pavement\n"
    "style: cinematic live action\n"
    "duration: 8 seconds"
)


def _reply(**overrides) -> str:
    data = {
        "script": "Một cô gái chạy dưới mưa rồi dừng trước quán cà phê.",
        "prompt": GOOD_PROMPT,
        "frames": [
            {"narration": "Cô gái chạy trên phố mưa.", "prompt": GOOD_PROMPT},
            {"narration": "Cô dừng trước quán cà phê.", "prompt": GOOD_PROMPT},
        ],
    }
    data.update(overrides)
    return json.dumps(data, ensure_ascii=False)


@pytest.fixture
def fake_model(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Chặn mọi lệnh gọi LLM, trả về câu trả lời cố định. Ghi lại payload để assert."""
    seen: dict = {"payloads": [], "channel": None}

    async def _fake_call(channel, model, system, user):
        seen["payloads"].append(
            {"model": model, "system": system, "user": user, "base": channel.base_url}
        )
        return _reply()

    def _fake_channel():
        from types import SimpleNamespace

        return SimpleNamespace(
            id="text-openai",
            enabled=True,
            base_url="https://provider.test/v1",
            api_key="sk-test",
            models=["ling-3.0-flash-free"],
        )

    monkeypatch.setattr(pw, "_resolve_channel", _fake_channel)
    # Một model trong chuỗi là đủ cho mọi assert bên dưới; chuỗi thật đã đo ở
    # docs/reports/WIZARD_ENDPOINT_B4.md.
    monkeypatch.setattr(pw, "WIZARD_MODEL_CHAIN", ("ling-3.0-flash-free",))
    monkeypatch.setattr(pw, "_call_model", _fake_call)
    return seen


@asynccontextmanager
async def _client(db: AsyncSession, user: User):
    import app.main as main_module

    async def _override_db():
        yield db

    main_module.app.dependency_overrides[get_db] = _override_db
    main_module.app.dependency_overrides[get_current_user] = lambda: user
    try:
        transport = httpx.ASGITransport(app=main_module.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
    finally:
        main_module.app.dependency_overrides.pop(get_db, None)
        main_module.app.dependency_overrides.pop(get_current_user, None)


# --------------------------------------------------------------------------
# 1. Dọn prompt — không mạng, không DB
# --------------------------------------------------------------------------


def test_sanitize_strips_chinese_and_seedance_markers():
    raw = "subject: 【字幕】một cô gái @duration:8\naction: 她在雨里跑"
    out = pw.sanitize_prompt_text(raw)
    assert not pw.has_cjk(out)
    assert "\u3010" not in out
    assert "@duration" not in out.lower()


def test_has_cjk_detects_chinese():
    # Tiếng Việt KHÔNG phải CJK: `một cô gái` phải qua. Chỉ Hán tự mới bị loại.
    assert not pw.has_cjk("một cô gái")
    assert not pw.has_cjk("thở dài")
    assert pw.has_cjk("一个女孩")
    assert pw.has_cjk("カラス")


def test_sanitize_keeps_vietnamese_diacritics():
    """`narration` là tiếng Việt — dọn ký tự Trung không được ăn mất dấu."""
    out = pw.sanitize_prompt_text("narration: Một cô gái thở dài, 【字幕】。")
    assert "Một cô gái thở dài" in out
    assert not pw.has_cjk(out)


def test_normalize_prompt_restores_canonical_order():
    scrambled = (
        "duration: 8 seconds\n"
        "style: cinematic\n"
        "subject: a girl\n"
        "action: she runs\n"
        "setting: rainy street\n"
        "camera: pan\n"
        "lighting: neon"
    )
    lines = pw.normalize_prompt(scrambled).split("\n")
    assert [ln.split(":")[0] for ln in lines] == list(pw.PROMPT_FIELDS)


def test_prose_prompt_is_rejected():
    """Văn xuôi phải bị loại — đó là thứ làm model bịa chi tiết."""
    prose = (
        "A girl runs through a rainy street at night and stops outside a coffee "
        "shop to look at the neon sign, shot cinematically over eight seconds."
    )
    assert not pw.is_usable_prompt(prose)


def test_prompt_missing_a_label_is_rejected():
    six = "\n".join(ln for ln in GOOD_PROMPT.split("\n") if not ln.startswith("action:"))
    assert not pw.is_usable_prompt(six)


def test_prompt_containing_chinese_is_rejected():
    cn = GOOD_PROMPT.replace("subject: a young woman in a leather jacket", "subject: 一个女孩")
    assert not pw.is_usable_prompt(cn)


def test_good_prompt_accepted():
    assert pw.is_usable_prompt(GOOD_PROMPT)


def test_extract_json_salvages_fenced_reply():
    raw = "```json\n" + _reply() + "\n```"
    assert pw._extract_json(raw)["prompt"] == GOOD_PROMPT


# --------------------------------------------------------------------------
# 2. Endpoint — hợp đồng trả về
# --------------------------------------------------------------------------


async def test_endpoint_returns_english_prompt_without_chinese(db_session, fake_model):
    user = await make_user(db_session)
    async with _client(db_session, user) as client:
        res = await client.post(
            "/api/wizard/generate_prompt",
            json={"idea": "Một cô gái chạy dưới mưa.", "language": "vi"},
        )
    assert res.status_code == 200, res.text
    # Giao diện coi content-type không phải JSON là lỗi mạng (api.ts:46-53).
    assert "application/json" in res.headers["content-type"]

    body = res.json()
    assert body["prompt"] == GOOD_PROMPT
    assert not pw.has_cjk(json.dumps(body, ensure_ascii=False))
    assert body["task_id"] > 0
    assert len(body["frames"]) == 2
    assert body["frames"][0]["prompt"] == GOOD_PROMPT


async def test_endpoint_accepts_request_without_target(db_session, fake_model):
    """Trang `/wizard` gửi đúng hai trường `idea` + `language` (api.ts:816)."""
    user = await make_user(db_session)
    async with _client(db_session, user) as client:
        res = await client.post(
            "/api/wizard/generate_prompt", json={"idea": "A cyclist at sunrise."}
        )
    assert res.status_code == 200, res.text


async def test_endpoint_rejects_empty_idea(db_session, fake_model):
    user = await make_user(db_session)
    async with _client(db_session, user) as client:
        res = await client.post("/api/wizard/generate_prompt", json={"idea": "   "})
    # 400 (lớp dịch vụ chặn idea rỗng) hoặc 422 (pydantic). Cả hai đều ra
    # `kind: 'validation'` nên giao diện hiện cùng một câu tiếng Việt.
    assert res.status_code in (400, 422)


async def test_endpoint_requires_auth(db_session, fake_model):
    import app.main as main_module

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main_module.app), base_url="http://test"
    ) as client:
        res = await client.post(
            "/api/wizard/generate_prompt", json={"idea": "A cyclist at sunrise."}
        )
    assert res.status_code in (401, 403)


async def test_prompt_sent_to_model_forbids_chinese_and_seedance(db_session, fake_model):
    """Ràng buộc chất lượng phải nằm trong prompt hệ thống, không chỉ ở hậu xử lý."""
    user = await make_user(db_session)
    async with _client(db_session, user) as client:
        await client.post(
            "/api/wizard/generate_prompt",
            json={"idea": "Một cô gái chạy dưới mưa.", "language": "vi"},
        )
    system = fake_model["payloads"][0]["system"]
    assert "English only" in system
    assert "【" in system
    assert "NEVER write prose" in system
    assert all(field in system for field in pw.PROMPT_FIELDS)


async def test_endpoint_reports_chinese_stripped_from_reply(db_session, monkeypatch):
    """Model trả lời lẫn tiếng Trung thì ký tự Trung phải không còn trong response."""
    user = await make_user(db_session)

    def _fake_channel():
        from types import SimpleNamespace

        return SimpleNamespace(
            id="text-openai", enabled=True, base_url="https://provider.test/v1",
            api_key="sk-test", models=[],
        )

    async def _fake_call(channel, model, system, user_):
        return _reply(script="Một cô gái chạy dưới mưa。カラス。")

    monkeypatch.setattr(pw, "_resolve_channel", _fake_channel)
    monkeypatch.setattr(pw, "WIZARD_MODEL_CHAIN", ("ling-3.0-flash-free",))
    monkeypatch.setattr(pw, "_call_model", _fake_call)

    async with _client(db_session, user) as client:
        res = await client.post(
            "/api/wizard/generate_prompt",
            json={"idea": "Một cô gái chạy dưới mưa.", "language": "vi"},
        )
    assert res.status_code == 200, res.text
    assert not pw.has_cjk(json.dumps(res.json(), ensure_ascii=False))


async def test_falls_back_to_next_model_when_one_is_rejected(db_session, monkeypatch):
    """Model bị từ chối thì thử model kế tiếp, không phải báo lỗi cho người dùng."""
    from app.services.llm_client import LlmUpstreamError

    user = await make_user(db_session)
    tried: list[str] = []

    def _fake_channel():
        from types import SimpleNamespace

        return SimpleNamespace(
            id="text-openai", enabled=True, base_url="https://provider.test/v1",
            api_key="sk-test", models=[],
        )

    async def _fake_call(channel, model, system, user_):
        tried.append(model)
        if model == "gemini-3-flash-preview":
            raise LlmUpstreamError('LLM error 403: "code":"model_not_allowed"', 403)
        return _reply()

    monkeypatch.setattr(pw, "_resolve_channel", _fake_channel)
    monkeypatch.setattr(
        pw, "WIZARD_MODEL_CHAIN", ("gemini-3-flash-preview", "ling-3.0-flash-free")
    )
    monkeypatch.setattr(pw, "_call_model", _fake_call)

    async with _client(db_session, user) as client:
        res = await client.post(
            "/api/wizard/generate_prompt",
            json={"idea": "Một cô gái chạy dưới mưa.", "language": "vi"},
        )
    assert res.status_code == 200, res.text
    assert tried == ["gemini-3-flash-preview", "ling-3.0-flash-free"]


async def test_every_model_failing_returns_5xx_with_translatable_detail(
    db_session, monkeypatch
):
    """Frontend tra `detail` theo mẫu `apiError.ts:57` rồi tự dịch sang tiếng Việt."""
    from app.services.llm_client import LlmUpstreamError

    user = await make_user(db_session)

    def _fake_channel():
        from types import SimpleNamespace

        return SimpleNamespace(
            id="text-openai", enabled=True, base_url="https://provider.test/v1",
            api_key="sk-test", models=[],
        )

    async def _fake_call(channel, model, system, user_):
        raise LlmUpstreamError("upstream exploded", 500)

    monkeypatch.setattr(pw, "_resolve_channel", _fake_channel)
    monkeypatch.setattr(pw, "WIZARD_MODEL_CHAIN", ("ling-3.0-flash-free",))
    monkeypatch.setattr(pw, "_call_model", _fake_call)

    async with _client(db_session, user) as client:
        res = await client.post(
            "/api/wizard/generate_prompt",
            json={"idea": "Một cô gái chạy dưới mưa.", "language": "vi"},
        )
    assert res.status_code >= 500
    detail = res.json()["detail"]
    assert detail.lower().startswith("text model error:")
    assert not pw.has_cjk(detail)


# --------------------------------------------------------------------------
# 3. Thu tiền
# --------------------------------------------------------------------------


async def test_generation_is_billed_and_refunds_the_difference(db_session, fake_model):
    """`charged > 0` và `refunded == est - charged` — đúng yêu cầu brief."""
    from app.models_tasks import TaskRun
    from app.services.billing.settlement import settle_task
    from app.services.billing.usage import record_line  # noqa: F401  (import path check)
    from sqlalchemy import select

    # conftest ép buffer=1.0; trả lại 1.2 để "hoàn phần chênh lệch" không rỗng.
    settings = get_settings()
    original_buffer = settings.billing_estimate_buffer
    settings.billing_estimate_buffer = 1.2

    balance_before = 100_000
    user = await make_user(db_session, balance_fen=balance_before)
    try:
        async with _client(db_session, user) as client:
            res = await client.post(
                "/api/wizard/generate_prompt",
                json={"idea": "Một cô gái chạy dưới mưa.", "language": "vi"},
            )
        assert res.status_code == 200, res.text
        task_id = res.json()["task_id"]

        task = await db_session.get(TaskRun, task_id)
        assert task.domain == "wizard"
        assert task.task_type == "generate_prompt"
        assert task.billing_status == "settled"

        estimate = int(task.billing_estimate_fen)
        charged = int(task.billing_charged_fen)
        refunded = int(task.billing_refunded_fen)
        assert estimate > 0
        assert charged > 0
        assert estimate > charged
        assert refunded == estimate - charged

        _, expected_price = charge_fen_for_tokens(
            int(settings.billing_est_llm_tokens), "llm_chat", settings=settings
        )
        assert charged == int(expected_price)

        await db_session.refresh(user)
        assert int(user.frozen_fen) == 0
        assert int(user.balance_fen) == balance_before - charged

        # Dòng usage phải ghi đúng model thật, không phải model mặc định của hệ thống.
        from app.models import UsageEvent

        rows = (
            await db_session.execute(
                select(UsageEvent).where(UsageEvent.task_run_id == task_id)
            )
        ).scalars().all()
        assert [r.billing_key for r in rows] == ["llm_chat"]
        assert rows[0].model == "ling-3.0-flash-free"
        assert rows[0].domain == "wizard"
    finally:
        settings.billing_estimate_buffer = original_buffer


async def test_failed_generation_still_settles_and_refunds(db_session, monkeypatch):
    """Hỏng giữa chừng thì vẫn phải trả tiền cho phần đã tiêu, không giữ tiền."""
    from app.models_tasks import TaskRun
    from app.services.llm_client import LlmUpstreamError

    user = await make_user(db_session, balance_fen=100_000)

    def _fake_channel():
        from types import SimpleNamespace

        return SimpleNamespace(
            id="text-openai", enabled=True, base_url="https://provider.test/v1",
            api_key="sk-test", models=[],
        )

    async def _fake_call(channel, model, system, user_):
        raise LlmUpstreamError("upstream exploded", 500)

    monkeypatch.setattr(pw, "_resolve_channel", _fake_channel)
    monkeypatch.setattr(pw, "WIZARD_MODEL_CHAIN", ("ling-3.0-flash-free",))
    monkeypatch.setattr(pw, "_call_model", _fake_call)

    async with _client(db_session, user) as client:
        res = await client.post(
            "/api/wizard/generate_prompt",
            json={"idea": "Một cô gái chạy dưới mưa.", "language": "vi"},
        )
    assert res.status_code >= 500

    from sqlalchemy import select

    task = (
        await db_session.execute(
            select(TaskRun).where(
                TaskRun.domain == "wizard", TaskRun.task_type == "generate_prompt"
            )
        )
    ).scalar_one()
    assert task.billing_status == "settled"
    estimate = int(task.billing_estimate_fen)
    assert int(task.billing_refunded_fen) == estimate - int(task.billing_charged_fen)
    await db_session.refresh(user)
    assert int(user.frozen_fen) == 0


async def test_insufficient_balance_returns_402(db_session, fake_model):
    from app.models_tasks import TaskRun
    from sqlalchemy import select

    user = await make_user(db_session, balance_fen=0)
    async with _client(db_session, user) as client:
        res = await client.post(
            "/api/wizard/generate_prompt",
            json={"idea": "Một cô gái chạy dưới mưa.", "language": "vi"},
        )
    assert res.status_code == 402

    task = (
        await db_session.execute(
            select(TaskRun).where(TaskRun.domain == "wizard")
        )
    ).scalar_one()
    # Chưa freeze được thì không được đánh dấu "skipped" — nghĩa là "bị bật".
    assert task.billing_status == "none"
    assert task.error_code == "insufficient_balance"