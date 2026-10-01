import logging
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import ValidationInfo, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"

logger = logging.getLogger("app.config")

# The placeholders shipped in code, in backend/.env.example and in
# deploy/.env.prod.example. They are public in the repository, so none of them can
# guard a real deployment.
DEFAULT_SECRET_KEY = "dev-secret-change-me"
PLACEHOLDER_SECRET_KEYS = frozenset(
    {
        DEFAULT_SECRET_KEY,
        "change-me-to-a-long-random-string",
    }
)

# APP_ENV values that unlock the production security gate. Anything else is
# development-like, which keeps a fresh clone runnable with zero configuration.
PRODUCTION_APP_ENVS = frozenset({"prod", "production"})
KNOWN_APP_ENVS = frozenset(
    {
        "dev",
        "development",
        "local",
        "test",
        "testing",
        "stage",
        "staging",
        "prod",
        "production",
    }
)

_weak_secret_warned = False


def parse_origin_list(value: str, *, variable: str) -> list[str]:
    """Parse a comma-separated origin list, failing loudly on a malformed entry.

    Browsers compare CORS origins against the exact scheme+host+port string, so an
    entry carrying a path or missing a scheme never matches anything and would be
    silently dead config. Raise instead, naming the variable at fault.
    """
    origins: list[str] = []
    for raw in (value or "").split(","):
        item = raw.strip()
        if not item:
            continue
        parts = urlsplit(item)
        if any(ch.isspace() for ch in item):
            raise ValueError(f"{variable} has an invalid origin {item!r}: contains whitespace")
        if parts.scheme not in ("http", "https") or not parts.netloc:
            raise ValueError(
                f"{variable} has an invalid origin {item!r}: expected http(s)://host[:port]"
            )
        if (parts.path or "").rstrip("/") or parts.query or parts.fragment:
            raise ValueError(
                f"{variable} has an invalid origin {item!r}: "
                "an origin must not carry a path, query or fragment"
            )
        origins.append(item.rstrip("/"))
    return origins


def parse_host_list(value: str, *, variable: str) -> list[str]:
    """Parse a comma-separated host[:port] list, failing loudly on a malformed entry."""
    hosts: list[str] = []
    for raw in (value or "").split(","):
        item = raw.strip()
        if not item:
            continue
        if any(ch.isspace() for ch in item):
            raise ValueError(f"{variable} has an invalid host {item!r}: contains whitespace")
        if "://" in item or "/" in item:
            raise ValueError(
                f"{variable} has an invalid host {item!r}: "
                "expected host[:port] without a scheme or a path"
            )
        hosts.append(item.lower())
    return hosts


def _warn_default_secret_once(app_env: str) -> None:
    """Warn at most once per process that the default SECRET_KEY is still in use."""
    global _weak_secret_warned
    if _weak_secret_warned:
        return
    _weak_secret_warned = True
    logger.warning(
        "SECRET_KEY is unset or still a public placeholder while APP_ENV=%s: anyone can mint "
        "valid JWTs (full user and admin takeover) and decrypt the provider API keys stored in "
        "the database. Set SECRET_KEY to a private value before going live.",
        app_env,
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.is_file() else ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Deployment environment. Unset means development, so a fresh clone runs with no
    # configuration at all; APP_ENV=prod|production turns on the SECRET_KEY startup gate.
    app_env: str = "development"
    app_name: str = "NOVAFILM"
    debug: bool = True
    # In raw SQLAlchemy SQL (off by default to avoid flooding; set SQL_ECHO=true to debug SQL)
    sql_echo: bool = False
    # Signs every JWT and derives the Fernet key that encrypts provider API keys in the database.
    # The default is public in the repository, so production refuses to start with it.
    secret_key: str = DEFAULT_SECRET_KEY
    access_token_expire_minutes: int = 60 * 24 * 7

    database_url: str = "postgresql+asyncpg://printfilm:change-me-strong-db-password@127.0.0.1:15432/printfilm"
    database_url_sync: str = "postgresql+psycopg2://printfilm:change-me-strong-db-password@127.0.0.1:15432/printfilm"
    # Postgres connection pool (shared by the task platform and the API)
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_recycle_sec: int = 1800
    db_pool_timeout_sec: int = 30
    redis_url: str = "redis://127.0.0.1:6379/0"

    ark_api_key: str = ""
    ark_base_url: str = "https://www.tokenfree.com/v1"
    # Text model: the open-source build is fixed to TokenFree New API; pick the model in the admin UI
    openai_api_key: str = ""
    openai_base_url: str = "https://www.tokenfree.com/v1"
    # Nhà cung cấp riêng cho model tạo ảnh. Kira AI dùng chuẩn OpenAI, đồng bộ, endpoint
    # `POST /v1/images/generations` trên base `https://kiraai.vn/api/v1`.
    # Base này **đã bao gồm `/v1`** — không cộng thêm `/v1` khi ghép URL.
    # Model: `hy-image-v3.5-free`. Kira nhận **tỉ lệ khung hình qua `extra_body.aspect_ratio`**,
    # không phải tham số `size` chuẩn.
    kira_base_url: str = "https://kiraai.vn/api/v1"
    kira_api_key: str = ""
    # kimi is just the default example; the real value comes from the admin channel models list, and can be deepseek-chat etc.
    model_llm: str = "kimi-k2.6"
    model_image: str = "doubao-seedream-5-0-260128"
    # Seedream 4.5 entry point (optional; falls back to model_image when unset)
    model_image_45: str = ""
    model_video: str = "doubao-seedance-2-5-260628"
    # Seedance 2.0 entry point (optional; when unset only MODEL_VIDEO is used)
    model_video_2: str = ""
    # Official Seedance 2.5 duration range is roughly 4-30 seconds
    seedance_duration_min: int = 4
    seedance_duration_max: int = 30
    model_audio: str = "qwen-tts-2025-05-22"
    # Doubao speech (openspeech) - a different product line from Ark, so a different key than ARK_API_KEY
    volc_tts_app_id: str = ""
    volc_tts_access_key: str = ""
    volc_tts_resource_id: str = "seed-tts-2.0"
    volc_tts_speaker: str = "zh_female_cancan_uranus_bigtts"
    volc_tts_url: str = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
    # New-style console API key (use instead of app_id/access_key; api_key wins)
    volc_tts_api_key: str = ""
    # Voice design: S_ slots bought in the console, comma separated; when set and auth is complete, drama uses voice_design
    volc_tts_voice_design_url: str = "https://openspeech.bytedance.com/api/v3/tts/voice_design"
    volc_tts_voice_design_speaker_ids: str = ""
    # Seedream: 2k|3k|4k or WIDTHxHEIGHT, and total pixels must be >= 3686400 (about 2560x1440)
    ark_image_size: str = "2k"
    ark_video_resolution: str = "480p"
    ark_video_ratio: str = "16:9"
    ark_video_poll_interval: float = 8.0
    ark_video_poll_timeout: float = 900.0
    # Parallel generation concurrency (per project)
    pipeline_image_concurrency: int = 3
    # Cap on image jobs TokenFree / New API watches at once (exceeding it returns 429)
    tokenfree_image_concurrency: int = 1
    # Official Seedance 2.5 concurrency cap is about 10
    pipeline_video_concurrency: int = 10
    pipeline_audio_concurrency: int = 4
    # Per-user cap on concurrent drama videos (submit and awaiting_poll together); the rest stay pending and queue
    drama_user_video_job_limit: int = 12
    # Max attempts for a single fragment video; past the limit the task fails outright instead of stalling on one shot
    drama_fragment_max_attempts: int = 3
    # kepu full mode: Seedance bakes narration and ambience into the video, so no external TTS is layered afterwards
    kepu_seedance_native_audio: bool = True
    # Only applies when native_audio=false: ask Seedance for sound effects only and add narration in post via TTS (on by default)
    kepu_seedance_sfx_audio: bool = True

    ark_mock: bool = False
    # In-process concurrency cap for the built-in task platform (worker slots for the whole site).
    task_runtime_max_concurrency: int = 4
    # Worker slots a single user may occupy at once (awaiting_poll rows do not count).
    task_user_max_concurrency: int = 4
    # Cap on concurrent non-blocking upstream queries per selector round (like an NIO select ready-channel batch).
    task_poll_max_concurrency: int = 20
    # Orphan recovery: a leased/running task untouched for this many seconds, with no live coroutine in this process, goes back on the queue.
    task_runtime_recover_grace_sec: int = 30
    # How often to scan for orphaned tasks while running (inside the scheduler tick).
    task_runtime_orphan_check_sec: int = 30
    # Scheduler tick heartbeat stale for this many seconds -> the watchdog soft-restarts the scheduling loop.
    task_runtime_tick_stale_sec: int = 60
    # Selector heartbeat stale for this many seconds -> the watchdog soft-restarts the poller.
    task_poll_stale_sec: int = 600
    # Watchdog check interval, in seconds.
    task_runtime_watchdog_interval_sec: float = 5.0

    max_shot_duration: int = 30
    default_preview_resolution: str = "480p"
    new_user_quota: int = 5
    # Legacy flag; prefer billing_enabled
    quota_enabled: bool = False

    # Token billing: the user is charged the official TokenFree cost (billing_markup is kept for compatibility and is no longer applied)
    billing_enabled: bool = False
    billing_markup: float = 1.0
    # Estimate buffer for tokens / video duration; per-image official pricing does not multiply by this factor (otherwise a 5 CNY grant cannot hold a single image)
    billing_estimate_buffer: float = 1.2
    # Yuan per million tokens (provider cost)
    billing_seedance_video0: float = 46.0
    billing_seedance_video1: float = 28.0
    # ASSUMPTION, NOT A MEASURED PRICE: this rate assumes a metered paid text provider.
    # The free-tier Gemini key in use does not bill per token, so llm_chat costs computed
    # from it are wrong (overstated). Harmless while billing_enabled is false; set this to
    # the real rate before turning credit charging on, or bills will drift from provider cost.
    billing_llm_per_m: float = 5.0
    billing_seedream_per_m: float = 8.0
    billing_tts_per_m: float = 2.0
    # Kie: 1 credit is worth this many fen (about $0.005 = 0.035 CNY -> 3.5)
    billing_kie_fen_per_credit: float = 3.5
    # TokenFree / New API: quota -> USD -> CNY (500000 quota = 1 USD)
    billing_usd_cny: float = 7.0
    # Fallback tokens when API omits usage
    billing_est_llm_tokens: int = 80_000
    # Seedream / gpt-image with no quota are settled by per-image price, no longer 45k tokens x 8 CNY per million
    billing_est_seedream_tokens: int = 45_000
    billing_est_tts_tokens: int = 5_000
    billing_est_seedance_tokens_per_sec: int = 32_000
    # Signup grant (fen)
    billing_signup_grant_fen: int = 500

    # User spending milestone popup (fires once every `interval` fen of cumulative charges; the default 10000 = 100 CNY)
    billing_user_alert_enabled: bool = True
    billing_user_alert_interval_fen: int = 10000

    # Platform-wide cost e-mail alert (aggregated by upstream cost_fen)
    billing_admin_cost_alert_enabled: bool = False
    billing_admin_cost_alert_threshold_fen: int = 0
    billing_admin_cost_alert_emails: str = ""
    billing_admin_cost_alert_period: str = "monthly"
    billing_admin_cost_alert_last_period_key: str = ""
    billing_admin_cost_alert_last_level: int = 0

    # SMTP (for the admin cost alert e-mail)
    smtp_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True

    # Epay (pay.gitcc.com)
    epay_api_url: str = "https://pay.gitcc.com"
    epay_pid: str = ""
    epay_key: str = ""
    epay_notify_url: str = ""
    epay_return_url: str = ""

    # OAuth login (Authorization Code + PKCE, backend-held client secret).
    # A provider counts as available only when BOTH the client id and the client secret
    # are set: GET /api/auth/providers reads these very values, so the frontend can never
    # render a button the backend is unable to serve. Leaving them blank disables the
    # provider entirely and the endpoint reports an empty list.
    # Register the redirect URI in the provider console exactly as
    # OAUTH_REDIRECT_BASE_URL + /api/auth/<provider>/callback builds it, e.g.
    # http://localhost:8000/api/auth/google/callback
    google_client_id: str = ""
    google_client_secret: str = ""
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    facebook_client_id: str = ""
    facebook_client_secret: str = ""
    # TikTok's Login Kit calls the client id "client key"; the env var name follows it so
    # nobody pastes it into GOOGLE_CLIENT_ID by mistake.
    tiktok_client_key: str = ""
    tiktok_client_secret: str = ""
    # Scheme + host + port of the backend as the provider sees it. Every provider compares
    # the redirect_uri byte for byte, so http://localhost:8000 and
    # http://127.0.0.1:8000 are two different values and only the registered one works.
    # TikTok additionally requires https and a static path (no query, no fragment).
    oauth_redirect_base_url: str = "http://localhost:8000"
    # Where the callback sends the browser once the login succeeded or failed. This is the
    # frontend route that reads the one-time code and calls /api/auth/oauth/exchange.
    # An absolute ?next= is only accepted when its origin appears in this value or in
    # CORS_ORIGINS; anything else is refused, so a login link cannot bounce a visitor to
    # a third-party site with a fresh session behind it.
    oauth_post_login_redirect_url: str = "http://localhost:5173/auth"
    # Attach a provider-verified address to an already existing local account instead of
    # refusing the login. Turn off to force every returning user to sign in with a password
    # first and link the provider by hand.
    oauth_auto_link_email: bool = True
    # Requests per minute per IP across /api/auth/* (start, callback, exchange, setup).
    oauth_rate_limit_per_minute: int = 30

    public_base_url: str = "http://127.0.0.1:8000"
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"

    tos_endpoint: str = ""
    tos_bucket: str = ""
    tos_access_key: str = ""
    tos_secret_key: str = ""
    cdn_base: str = "http://localhost:8000/static"

    # Aliyun OSS - film and shot uploads; FFmpeg still reads the local files
    oss_enabled: bool = False
    oss_endpoint: str = "oss-cn-beijing.aliyuncs.com"
    oss_region: str = "cn-hangzhou"
    oss_bucket: str = ""
    oss_folder: str = "kepu"
    oss_access_key_id: str = ""
    oss_access_key_secret: str = ""
    # Optional custom domain; when empty, https://{bucket}.{endpoint} is used
    oss_public_base: str = ""
    # Generation chain: write to disk and return /static first, then enqueue an async upload and backfill the OSS URL
    oss_upload_async: bool = True
    oss_upload_queue: str = "oss"

    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174"
    )
    # Extra origins merged into the OSS bucket CORS rule, comma-separated
    # http(s)://host[:port]. Empty by default: loopback dev origins are hard-coded
    # in oss.cors_origin_list, so no real site host is baked in as a fallback.
    oss_cors_extra_origins: str = ""
    # Extra hosts whose /static/ URLs are served from backend/static, comma-separated
    # host[:port] (no scheme). Empty by default: loopback debug hosts are hard-coded
    # in storage.is_local_static_url for the same reason.
    static_host_allowlist: str = ""
    # Comma-separated emails promoted to admin on startup (existing users only)
    admin_bootstrap_emails: str = ""

    # Reject a malformed allowlist at settings construction rather than at first use,
    # so a typo surfaces on startup with the offending variable named.
    @field_validator("oss_cors_extra_origins")
    @classmethod
    def _validate_oss_cors_extra_origins(cls, value: str) -> str:
        parse_origin_list(value, variable="OSS_CORS_EXTRA_ORIGINS")
        return value

    @field_validator("static_host_allowlist")
    @classmethod
    def _validate_static_host_allowlist(cls, value: str) -> str:
        parse_host_list(value, variable="STATIC_HOST_ALLOWLIST")
        return value

    # Reject a typo in APP_ENV at settings construction rather than at first use: an
    # unrecognised value must never quietly downgrade production to development.
    @field_validator("app_env")
    @classmethod
    def _validate_app_env(cls, value: str) -> str:
        normalized = (value or "").strip().lower()
        if normalized not in KNOWN_APP_ENVS:
            raise ValueError(
                f"APP_ENV has an unknown value {value!r}: expected one of "
                f"{', '.join(sorted(KNOWN_APP_ENVS))}"
            )
        return normalized

    # Surrounding whitespace in a pasted client secret is the classic silent failure: the
    # provider answers invalid_client and the operator blames the console. Strip it here.
    @field_validator(
        "google_client_id",
        "google_client_secret",
        "microsoft_client_id",
        "microsoft_client_secret",
        "facebook_client_id",
        "facebook_client_secret",
        "tiktok_client_key",
        "tiktok_client_secret",
    )
    @classmethod
    def _strip_oauth_credentials(cls, value: str) -> str:
        return (value or "").strip()

    # An OAuth redirect URI that is not absolute http(s) can never be registered with a
    # provider, so refuse the typo at startup instead of at the first login attempt.
    @field_validator("oauth_redirect_base_url", "oauth_post_login_redirect_url")
    @classmethod
    def _validate_oauth_urls(cls, value: str, info: ValidationInfo) -> str:
        url = (value or "").strip().rstrip("/")
        variable = str(info.field_name).upper()
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.netloc:
            raise ValueError(
                f"{variable} has an invalid URL {value!r}: expected http(s)://host[:port]"
            )
        return url

    # Fail fast, in production only, when SECRET_KEY is unset or still a shipped placeholder.
    # The gate lives on Settings() itself, so every entry point (uvicorn, celery, scripts,
    # tests) is covered by the very first settings load, long before a request arrives.
    @model_validator(mode="after")
    def _gate_secret_key(self) -> "Settings":
        if self.secret_key.strip() and self.secret_key not in PLACEHOLDER_SECRET_KEYS:
            return self
        if self.app_env in PRODUCTION_APP_ENVS:
            raise ValueError(
                f"SECRET_KEY is unset or still a public placeholder ({self.secret_key!r}) while "
                f"APP_ENV={self.app_env!r}. Generate a private key and set it, for example: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\". "
                "With a placeholder key anyone can sign valid JWTs (admin and user takeover) "
                "and decrypt the provider API keys stored in the database."
            )
        _warn_default_secret_once(self.app_env)
        return self


@lru_cache
def get_settings() -> Settings:
    base = Settings()
    try:
        from app.services.model_settings import get_overlay_dict

        overlay = get_overlay_dict()
        if overlay:
            return base.model_copy(update=overlay)
    except Exception:  # noqa: BLE001
        pass
    return base


def reload_settings() -> Settings:
    get_settings.cache_clear()
    try:
        from app.services.oss import reset_oss_client

        reset_oss_client()
    except Exception:  # noqa: BLE001
        pass
    return get_settings()
