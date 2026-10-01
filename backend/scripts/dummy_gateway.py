"""DUMMY AI GATEWAY — a fake provider that speaks the real Ark/TokenFree wire protocol.

WHY THIS EXISTS
`backend/.env` carries `OPENAI_API_KEY=replace-me`, so no real upstream runs and the
full UI flow (script -> shots -> generate -> save -> upload) cannot be exercised. The
built-in `ARK_MOCK` covers the UI but fabricates URLs without ever producing a file, so
the download step and the object-storage upload stay unproven.

This server closes that gap. It is deliberately ASYNCHRONOUS, matching what the app
actually does — see `app/services/ark.py`:

    POST /v1/contents/generations/tasks      -> {"id": "task_xxx"}
    GET  /v1/contents/generations/tasks/task_xxx
            first polls: {"status": "running"}
            then:       {"status": "succeeded", "url": "http://host:port/media/x.mp4"}
    -> the app THEN downloads that URL and publishes it (storage.publish_local)

A synchronous "sleep 5s and return a URL" stub would never touch the path the app uses,
and the part that matters most — real bytes on disk, then upload — would never run.

SAFETY — this must never be mistaken for a real provider
- Refuses to start when APP_ENV is prod/production. Non-negotiable: a dummy running on
  production is a disaster, and the app would quietly bill users for fake media.
- Logs a large banner plus a line per request, so any log tail proves a fake is running.
- Own port, never 8000 (that is the real backend).
- Reads no credentials and writes nothing outside its own media directory.

This tool serves generated placeholder media only. It performs no real AI inference.

Run:
    python -m scripts.dummy_gateway            # listens on 127.0.0.1:8001
    DUMMY_GATEWAY_PORT=8010 python -m scripts.dummy_gateway

Point the app at it (backend/.env, which is gitignored):
    OPENAI_BASE_URL=http://localhost:8001/v1
    OPENAI_API_KEY=dummy-local
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response

# Same guard the app itself uses, duplicated on purpose: this script must not import
# app.config, because importing it would pull in the whole app (and its settings) just
# to start a throwaway server.
PRODUCTION_APP_ENVS = frozenset({"prod", "production"})

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8001

# How many polls report "running" before a task flips to "succeeded". The app polls with
# ARK_VIDEO_POLL_INTERVAL (8s in .env), so 2 keeps the UI's waiting state visible without
# making a manual test tedious.
RUNNING_POLLS = 2

# Model ids the app may ask for. The app resolves upstream names from the routing config,
# so accept whatever arrives and echo it back rather than 400 on an unknown id.
VIDEO_MODELS = ("doubao-seedance-2-5-260628", "seedance-2.5", "seedance-2-5", "seedance-2")
IMAGE_MODELS = (
    "doubao-seedream-5-0-260128",
    "seedream-5-0-pro",
    "seedream-4-5",
    "seedream-4.5",
    "gpt-image",
)
TEXT_MODELS = ("dummy-text", "gpt-4o", "gpt-4o-mini", "deepseek-chat")
AUDIO_MODELS = ("qwen-tts-2025-05-22", "seed-tts-2.0")

BANNER = "\n".join(
    [
        "#" * 78,
        "#  D U M M Y   A I   G A T E W A Y",
        "#",
        "#  EVERY RESPONSE FROM THIS SERVER IS FAKE.",
        "#  No AI model is running. Media is generated locally as solid-colour clips.",
        "#  Content or billing produced through this server is meaningless.",
        "#  Point production at this and you will ship placeholder video to real users.",
        "#" * 78,
    ]
)

logger = logging.getLogger("dummy_gateway")


@dataclass
class Task:
    """One in-flight fake generation."""

    task_id: str
    kind: str  # video | image
    model: str
    duration: int
    polls_left: int
    created_at: float = field(default_factory=time.time)
    prompt: str = ""


class MediaFactory:
    """Generates real media files on demand, locally.

    Files must actually exist and be playable: `download_result_media` streams them to
    disk, ffmpeg reads them for poster frames and final composition, and the object
    storage upload ships the same bytes. A stub that returned a URL with no bytes behind
    it would break the download step and look like a storage bug.
    """

    def __init__(self, root: Path, *, ffmpeg: str | None = None) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._ffmpeg = ffmpeg
        self._lock = threading.Lock()
        self._resolved_ffmpeg: str | None | bool = False

    # -- ffmpeg discovery -------------------------------------------------
    @property
    def ffmpeg(self) -> str | None:
        """Locate ffmpeg once. None means we fall back to a hand-written file."""
        with self._lock:
            if self._resolved_ffmpeg is False:
                self._resolved_ffmpeg = self._find_ffmpeg()
            return self._resolved_ffmpeg  # type: ignore[return-value]

    def _find_ffmpeg(self) -> str | None:
        configured = (os.environ.get("DUMMY_GATEWAY_FFMPEG") or "").strip()
        if configured and Path(configured).is_file():
            return configured
        found = shutil.which("ffmpeg")
        if found:
            return found
        # The app resolves ffmpeg through FFMPEG_PATH; reuse whatever it can see.
        app_ffmpeg = (os.environ.get("FFMPEG_PATH") or "").strip()
        if app_ffmpeg and Path(app_ffmpeg).is_file():
            return app_ffmpeg
        logger.warning(
            "DUMMY: no ffmpeg found. Video will be a minimal non-playable stub. "
            "Set DUMMY_GATEWAY_FFMPEG=<path to ffmpeg.exe> for real playable clips."
        )
        return None

    # -- file builders ----------------------------------------------------
    def video(self, name: str, *, duration: int = 4) -> Path:
        """A short solid-colour clip with a burned-in frame counter.

        The counter is not decoration: it makes it obvious in the UI that the clip is a
        placeholder rather than a rendered scene.
        """
        dest = self.root / f"{name}.mp4"
        if dest.is_file() and dest.stat().st_size > 0:
            return dest
        ffmpeg = self.ffmpeg
        seconds = max(1, min(int(duration or 4), 30))
        if not ffmpeg:
            return self._video_stub(dest)
        # drawtext needs a font file; without one the filter graph fails. Fall back to a
        # plain colour clip rather than serving nothing.
        cmd = [
            ffmpeg,
            "-nostdin",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0x101828:s=720x1280:r=12:d={seconds}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "veryfast",
            str(dest),
        ]
        proc = subprocess.run(cmd, capture_output=True, stdin=subprocess.DEVNULL, check=False)
        if proc.returncode != 0 or not dest.is_file() or dest.stat().st_size == 0:
            logger.warning(
                "DUMMY: ffmpeg video failed (%s): %s",
                proc.returncode,
                (proc.stderr or b"").decode("utf-8", "replace")[:300],
            )
            return self._video_stub(dest)
        logger.info("DUMMY: generated video %s (%s bytes, %ss)", dest.name, dest.stat().st_size, seconds)
        return dest

    def _video_stub(self, dest: Path) -> Path:
        """Last-resort bytes so the download path still has something to move.

        Not a valid MP4. This exists only so `download_to` / upload can be traced when
        ffmpeg is unavailable; composition will fail, which is the honest signal.
        """
        dest.write_bytes(b"DUMMY-FAKE-VIDEO-NOT-PLAYABLE\n" * 64)
        logger.warning("DUMMY: wrote non-playable video stub %s", dest.name)
        return dest

    def image(self, name: str, *, width: int = 720, height: int = 1280) -> Path:
        """A real PNG. Pure stdlib zlib+struct, so no Pillow dependency."""
        dest = self.root / f"{name}.png"
        if dest.is_file() and dest.stat().st_size > 0:
            return dest
        png = _solid_png(width=width, height=height, rgb=(16, 24, 40))
        dest.write_bytes(png)
        logger.info("DUMMY: generated image %s (%s bytes)", dest.name, dest.stat().st_size)
        return dest


def _solid_png(*, width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """Build a minimal valid greyscale-free RGB PNG without any imaging library."""
    import struct
    import zlib

    w = max(1, int(width))
    h = max(1, int(height))
    raw = bytearray()
    row = bytes(rgb) * w
    for _ in range(h):
        raw.append(0)  # filter type 0 (None) for this scanline
        raw.extend(row)

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
        + chunk(b"IEND", b"")
    )


class DummyGateway:
    def __init__(self, media_root: Path) -> None:
        self.media = MediaFactory(media_root)
        self.tasks: dict[str, Task] = {}
        self.host = os.environ.get("DUMMY_GATEWAY_HOST", DEFAULT_HOST).strip() or DEFAULT_HOST
        self.public_base = os.environ.get("DUMMY_GATEWAY_PUBLIC_BASE", "").strip().rstrip("/")
        self._lock = threading.Lock()
        self.request_count = 0

    # -- helpers ----------------------------------------------------------
    def base_url(self, request: Request) -> str:
        """Absolute base for URLs we hand back.

        The app downloads these URLs itself. If we advertised 127.0.0.1 while the app
        runs in a container (or on another host), the download would fail. So an explicit
        override wins, otherwise we echo the host the request arrived on.
        """
        if self.public_base:
            return self.public_base
        return str(request.base_url).rstrip("/")

    def media_url(self, request: Request, filename: str) -> str:
        return f"{self.base_url(request)}/media/{filename}"

    def new_task(self, kind: str, model: str, duration: int, prompt: str) -> Task:
        task = Task(
            task_id=f"task_{secrets.token_hex(8)}",
            kind=kind,
            model=model,
            duration=duration,
            polls_left=RUNNING_POLLS,
            prompt=prompt,
        )
        with self._lock:
            self.tasks[task.task_id] = task
        return task

    def poll(self, task_id: str) -> Task | None:
        with self._lock:
            task = self.tasks.get(task_id)
            if task is None:
                return None
            if task.polls_left > 0:
                task.polls_left -= 1
            return task


def _extract_prompt(body: dict[str, Any]) -> str:
    """Pull a human-readable prompt out of any of the shapes the app sends."""
    prompt = str(body.get("prompt") or "").strip()
    if prompt:
        return prompt
    content = body.get("content")
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text = str(item.get("text") or "").strip()
                if text:
                    return text
    if isinstance(content, str):
        return content.strip()
    # New API wraps the Seedance payload under metadata.input
    meta = body.get("metadata")
    if isinstance(meta, dict):
        inner = meta.get("input")
        if isinstance(inner, dict):
            return str(inner.get("prompt") or inner.get("input") or "").strip()
        if isinstance(inner, str):
            return inner.strip()
    return str(body.get("input") or "").strip()


def _storyboard_json(prompt: str) -> dict[str, Any]:
    """A minimal storyboard the app's parser accepts.

    `ArkGateway._parse_storyboard` requires a JSON object with `shots`, and each shot
    wants `text` plus a `segments` array. Keeping it small but structurally complete is
    what matters — the point is to exercise parsing, not to write good drama.
    """
    lines = [ln.strip() for ln in prompt.replace("\r", "\n").split("\n") if ln.strip()]
    chunks = [c.strip() for c in lines if len(c.strip()) > 1] or [prompt.strip() or "开场镜头"]
    shots: list[dict[str, Any]] = []
    for idx, chunk in enumerate(chunks[:3], start=1):
        shots.append(
            {
                "shot": idx,
                "duration": 4,
                "title": f"镜头{idx}",
                "subtitle": "占位分镜",
                "text": chunk[:80],
                "segments": [
                    {"duration": 2, "kind": "visual", "text": f"画面：{chunk[:40]}"},
                    {"duration": 2, "kind": "narration", "text": chunk[:40]},
                ],
                "img_prompt": f"{chunk[:60]}，竖屏构图，画面无文字",
                "video_prompt": f"{chunk[:60]}，轻微推近",
                "camera": "缓慢推近",
                "bgm": "平稳",
            }
        )
    return {
        "character_bible": "占位人物设定：中等身材，简洁服饰，全片外形不变",
        "bgm_lock": "平稳",
        "shots": shots,
    }


def create_app(media_root: Path | None = None) -> FastAPI:
    gw = DummyGateway(Path(media_root) if media_root is not None else _media_root())
    app = FastAPI(title="DUMMY AI GATEWAY", docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def loud(request: Request, call_next):  # type: ignore[no-untyped-def]
        gw.request_count += 1
        logger.warning(
            "DUMMY GATEWAY (FAKE UPSTREAM) #%s %s %s from %s",
            gw.request_count,
            request.method,
            request.url.path,
            request.client.host if request.client else "?",
        )
        response = await call_next(request)
        logger.warning(
            "DUMMY GATEWAY (FAKE UPSTREAM) -> %s %s (%s bytes)",
            response.status_code,
            request.url.path,
            response.headers.get("content-length", "?"),
        )
        return response

    @app.get("/")
    async def index() -> JSONResponse:
        return JSONResponse(
            {
                "service": "DUMMY AI GATEWAY — ALL OUTPUT IS FAKE",
                "warning": "No real AI model runs here. Never point production at this.",
                "requests_served": gw.request_count,
                "video_tasks": len(gw.tasks),
                "endpoints": [
                    "POST /v1/contents/generations/tasks",
                    "GET  /v1/contents/generations/tasks/{id}",
                    "POST /v1/videos",
                    "GET  /v1/videos/{id}",
                    "GET  /v1/videos/{id}/content",
                    "POST /v1/images/generations",
                    "POST /v1/responses",
                    "POST /v1/chat/completions",
                    "POST /v1/audio/speech",
                    "GET  /v1/models",
                    "GET  /media/{file}",
                ],
            }
        )

    @app.get("/v1/models")
    async def models() -> JSONResponse:
        ids = [*TEXT_MODELS, *IMAGE_MODELS, *VIDEO_MODELS, *AUDIO_MODELS]
        return JSONResponse(
            {
                "object": "list",
                "data": [
                    {"id": mid, "object": "model", "owned_by": "dummy-gateway", "fake": True}
                    for mid in ids
                ],
            }
        )

    # -- video: Ark native path ------------------------------------------
    @app.post("/v1/contents/generations/tasks")
    async def create_ark_video(request: Request) -> JSONResponse:
        body = await _json_body(request)
        prompt = _extract_prompt(body)
        duration = _coerce_int(body.get("duration"), default=4)
        model = str(body.get("model") or "").strip()
        task = gw.new_task("video", model, duration, prompt)
        logger.warning("DUMMY: created VIDEO task %s model=%s duration=%ss", task.task_id, model, duration)
        # Wrapped in {"data": ...} on purpose: unwrap_video_task_payload accepts both
        # shapes, and New API really does wrap, so we match production.
        return JSONResponse({"data": {"task_id": task.task_id, "status": "running"}})

    @app.get("/v1/contents/generations/tasks/{task_id}")
    async def get_ark_video(task_id: str, request: Request) -> JSONResponse:
        return _video_status_payload(gw, request, task_id)

    # -- video: New API path (what the app actually uses today) ----------
    @app.post("/v1/videos")
    async def create_newapi_video(request: Request) -> JSONResponse:
        body = await _json_body(request)
        meta = body.get("metadata") if isinstance(body.get("metadata"), dict) else {}
        inner = meta.get("input") if isinstance(meta.get("input"), dict) else {}
        prompt = _extract_prompt(body)
        duration = _coerce_int(body.get("seconds") or inner.get("duration"), default=4)
        model = str(body.get("model") or "").strip()
        task = gw.new_task("video", model, duration, prompt)
        logger.warning("DUMMY: created VIDEO task %s model=%s duration=%ss", task.task_id, model, duration)
        return JSONResponse(
            {
                "id": f"video_{secrets.token_hex(8)}",
                "object": "video",
                "task_id": task.task_id,
                "status": "queued",
                "model": model,
            }
        )

    @app.get("/v1/videos/{task_id}")
    async def get_newapi_video(task_id: str, request: Request) -> JSONResponse:
        return _video_status_payload(gw, request, task_id)

    @app.get("/v1/videos/{task_id}/content")
    async def get_newapi_video_content(task_id: str, request: Request) -> Response:
        """Serve the bytes for a task.

        `_finalize_video_result` falls back to this URL when a success payload carries no
        public URL, and `is_tokenfree_content_url` makes the app attach a Bearer header
        here. We accept any Authorization value rather than validating it — this gateway
        holds no secrets and exists to be permissive.
        """
        task = gw.poll(task_id)
        path = gw.media.video(f"video_{task_id}", duration=task.duration if task else 4)
        logger.warning("DUMMY: serving video content for %s from %s", task_id, path.name)
        return FileResponse(path, media_type="video/mp4")

    # -- image ------------------------------------------------------------
    @app.post("/v1/images/generations")
    async def create_image(request: Request) -> JSONResponse:
        body = await _json_body(request)
        prompt = _extract_prompt(body)
        url = _image_url(gw, request, prompt)
        logger.warning("DUMMY: created IMAGE task, url=%s", url)
        return JSONResponse(
            {
                # Ark native shape: data[0].url, read by _extract_image_url
                "created": int(time.time()),
                "data": [{"url": url}],
                "usage": {"total_tokens": 0},
            }
        )

    @app.post("/v1/responses")
    async def create_responses_image(request: Request) -> JSONResponse:
        """New API image path used when the channel is TokenFree.

        `extract_tokenfree_image_url` walks output[].content[].url, so match that shape
        rather than the Ark one.
        """
        body = await _json_body(request)
        prompt = _extract_prompt(body)
        url = _image_url(gw, request, prompt)
        logger.warning("DUMMY: created IMAGE (responses) task, url=%s", url)
        return JSONResponse(
            {
                "id": f"resp_{secrets.token_hex(8)}",
                "object": "response",
                "status": "succeeded",
                "model": str(body.get("model") or ""),
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_image", "url": url}],
                    }
                ],
            }
        )

    # -- text -------------------------------------------------------------
    @app.post("/v1/chat/completions")
    async def chat_completions(request: Request) -> JSONResponse:
        body = await _json_body(request)
        messages = body.get("messages") or []
        joined = "\n".join(
            str(m.get("content") or "") for m in messages if isinstance(m, dict)
        )
        storyboard = _storyboard_json(joined)
        content = json.dumps(storyboard, ensure_ascii=False)
        wants_json = isinstance(body.get("response_format"), dict)
        logger.warning(
            "DUMMY: chat/completions model=%s messages=%s response_format=%s -> fake storyboard (%s shots)",
            body.get("model"),
            len(messages),
            wants_json,
            len(storyboard["shots"]),
        )
        return JSONResponse(
            {
                "id": f"chatcmpl_{secrets.token_hex(8)}",
                "object": "chat.completion",
                "model": str(body.get("model") or "dummy-text"),
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            }
        )

    # -- audio ------------------------------------------------------------
    @app.post("/v1/audio/speech")
    async def audio_speech(request: Request) -> JSONResponse:
        """Speech is not synthesised here.

        Returning 501 is deliberate. A fake audio file would look like a working TTS
        integration, and `is_near_silent_audio` in the app would reject it anyway. A loud
        failure keeps the missing capability visible.
        """
        body = await _json_body(request)
        logger.warning(
            "DUMMY: audio/speech requested model=%s — NOT IMPLEMENTED (returns 501 on purpose)",
            body.get("model"),
        )
        return JSONResponse(
            {"error": {"message": "DUMMY gateway does not synthesise speech", "code": "dummy_tts_unsupported"}},
            status_code=501,
        )

    # -- media ------------------------------------------------------------
    @app.get("/media/{filename}")
    async def media(filename: str) -> Response:
        """Serve a generated file.

        Guards against path traversal: the name is reduced to its basename and must live
        under the media root, and only extensions this gateway generates are served.
        """
        safe = Path(filename).name
        if safe != filename or Path(safe).suffix.lower() not in {".mp4", ".png", ".jpg", ".jpeg"}:
            logger.warning("DUMMY: rejected media path %r", filename)
            return JSONResponse({"error": "not found"}, status_code=404)
        if safe.endswith(".mp4"):
            path = gw.media.video(Path(safe).stem)
            media_type = "video/mp4"
        else:
            path = gw.media.image(Path(safe).stem)
            media_type = "image/png"
        if not path.is_file():
            return JSONResponse({"error": "not found"}, status_code=404)
        logger.warning("DUMMY: serving media %s (%s bytes)", path.name, path.stat().st_size)
        return FileResponse(path, media_type=media_type)

    return app


def _image_url(gw: DummyGateway, request: Request, prompt: str) -> str:
    """Generate (or reuse) a placeholder image and return its absolute URL."""
    import hashlib

    digest = hashlib.sha1((prompt or "image").encode("utf-8")).hexdigest()[:12]
    gw.media.image(f"image_{digest}")
    return gw.media_url(request, f"image_{digest}.png")


def _video_status_payload(gw: DummyGateway, request: Request, task_id: str) -> JSONResponse:
    """The two-step status contract: running a couple of times, then succeeded + a URL."""
    task = gw.poll(task_id)
    if task is None:
        logger.warning("DUMMY: poll for unknown task %s", task_id)
        return JSONResponse(
            {"data": {"status": "failed", "error": {"message": f"unknown task {task_id}"}}},
            status_code=404,
        )
    if task.polls_left > 0:
        logger.warning("DUMMY: task %s status=running (polls left=%s)", task.task_id, task.polls_left)
        return JSONResponse({"data": {"task_id": task.task_id, "status": "running"}})

    name = f"video_{task.task_id}"
    gw.media.video(name, duration=task.duration)
    url = gw.media_url(request, f"{name}.mp4")
    logger.warning("DUMMY: task %s status=succeeded url=%s", task.task_id, url)
    # `data` wrapping + a top-level `id` mirrors New API. `content.video_url` is included
    # because extract_video_result_url checks that too (Ark's native field).
    return JSONResponse(
        {
            "id": task.task_id,
            "data": {
                "task_id": task.task_id,
                "status": "succeeded",
                "url": url,
                "content": {"video_url": url},
            },
        }
    )


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001 - a malformed body is not worth a 500 here
        return {}
    return payload if isinstance(payload, dict) else {}


def _coerce_int(value: Any, *, default: int) -> int:
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return default


def _refuse_on_production() -> None:
    """Hard stop: a fake provider must never run where real users are served."""
    app_env = (os.environ.get("APP_ENV") or "development").strip().lower()
    if app_env in PRODUCTION_APP_ENVS:
        print(
            f"REFUSING TO START: APP_ENV={app_env!r}. This is a DUMMY AI GATEWAY that "
            "fabricates all media. Running it in production would serve fake content and "
            "record fake billing. Unset APP_ENV (or set it to dev/staging) to run locally.",
            file=sys.stderr,
        )
        raise SystemExit(2)


def main() -> None:
    _refuse_on_production()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    port = _coerce_int(os.environ.get("DUMMY_GATEWAY_PORT"), default=DEFAULT_PORT)
    host = os.environ.get("DUMMY_GATEWAY_HOST", DEFAULT_HOST).strip() or DEFAULT_HOST
    if port == 8000:
        print(
            "REFUSING TO START: port 8000 is the real backend. Pick another "
            "(DUMMY_GATEWAY_PORT=8001).",
            file=sys.stderr,
        )
        raise SystemExit(2)
    print(BANNER)
    print(f"  media dir : {_media_root()}")
    print(f"  ffmpeg    : {_truncated_ffmpeg_note()}")
    print(f"  listening : http://{host}:{port}")
    print(f"  point app : OPENAI_BASE_URL=http://{host}:{port}/v1")
    print("#" * 78 + "\n")
    import uvicorn

    uvicorn.run(create_app(), host=host, port=port, log_level="info")


def _media_root() -> Path:
    override = (os.environ.get("DUMMY_GATEWAY_MEDIA_DIR") or "").strip()
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[1] / "static" / "dummy-gateway"


def _truncated_ffmpeg_note() -> str:
    probe = MediaFactory(_media_root() / ".probe")
    found = probe.ffmpeg
    return found or "NOT FOUND — videos will be non-playable stubs"


if __name__ == "__main__":
    main()
