/**
 * Kiểm chứng bằng ảnh chụp thật: bật Edge headless, đăng nhập bằng tài khoản thử,
 * ép locale qua localStorage, chụp từng route, đếm ký tự Trung còn sót trong
 * phần chữ nhìn thấy và bắt lỗi JS lúc chạy.
 *
 * Chạy: node scripts\visual-audit.mjs --base=http://127.0.0.1:5193
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = (() => {
  const arg = process.argv.find((a) => a.startsWith("--base="));
  return arg ? arg.slice("--base=".length) : "http://127.0.0.1:5193";
})();
const OUT = join(tmpdir(), "kilo", "admin-audit");
const LOCALES = ["vi", "en"];

/**
 * Database local KHÔNG có tài khoản admin, nên không đăng nhập được để lấy dữ
 * liệu thật. Script chặn /api/** và trả fixture tối thiểu: phần khung, tiêu đề
 * cột, nút, tab và ô lọc vẫn render từ mã thật, chỉ là số liệu là dữ liệu giả.
 * Ảnh chụp vì vậy chứng minh được phần BẢN DỊCH, không chứng minh được số liệu.
 */
const FIXTURES = {
  "/api/auth/me": { id: 1, email: "ops@novafilm.vn", nickname: "Ops", role: "admin", plan: "pro" },
  "/api/admin/stats": {
    user_count: 3,
    order_paid_total_fen: 1280000,
    order_paid_today_fen: 12500,
    project_status_counts: { DONE: 2, VIDEOING: 1, FAILED: 1, DRAFT: 3 },
    drama_project_count: 2,
    usage_calls_today: 42,
    usage_calls_month: 1180,
    usage_calls_total: 20431,
    usage_charge_today_fen: 3400,
    usage_charge_month_fen: 96500,
    usage_charge_total_fen: 1642000,
    usage_cost_today_fen: 1500,
    usage_cost_month_fen: 51200,
    usage_cost_total_fen: 903000,
    usage_by_capability: [
      { key: "llm", calls: 900, charge_fen: 42000, cost_fen: 21000 },
      { key: "image", calls: 300, charge_fen: 38000, cost_fen: 22000 },
      { key: "video", calls: 40, charge_fen: 14000, cost_fen: 9000 },
      { key: "tts", calls: 60, charge_fen: 2500, cost_fen: 1200 },
    ],
    usage_by_domain: [
      { key: "drama", calls: 700, charge_fen: 55000, cost_fen: 30000 },
      { key: "kepu", calls: 400, charge_fen: 30000, cost_fen: 16000 },
      { key: "api", calls: 200, charge_fen: 11500, cost_fen: 7200 },
    ],
    daily_usage: [
      { date: "2026-09-20", calls: 120, charge_fen: 9000, cost_fen: 4800 },
      { date: "2026-09-22", calls: 260, charge_fen: 18000, cost_fen: 9600 },
      { date: "2026-09-24", calls: 310, charge_fen: 21000, cost_fen: 11000 },
      { date: "2026-09-26", calls: 280, charge_fen: 17500, cost_fen: 9400 },
      { date: "2026-09-28", calls: 210, charge_fen: 14000, cost_fen: 7600 },
    ],
    top_users_by_charge: [
      { user_id: 1, email: "lorisvietnam@gmail.com", calls: 620, charge_fen: 41000, cost_fen: 22000 },
      { user_id: 2, email: "second@example.com", calls: 380, charge_fen: 25000, cost_fen: 13000 },
      { user_id: 3, email: "third@example.com", calls: 210, charge_fen: 14000, cost_fen: 7200 },
    ],
  },
  "/api/admin/stats/upstream-usage": {
    configured: true,
    days: 30,
    last_sync_at: "2026-09-30T08:00:00Z",
    series: [
      { date: "2026-09-28", local_tokens: 120000, official_tokens: 118000, local_cost_fen: 6000, official_cost_fen: 5900 },
      { date: "2026-09-29", local_tokens: 90000, official_tokens: 91000, local_cost_fen: 4500, official_cost_fen: 4550 },
      { date: "2026-09-30", local_tokens: 150000, official_tokens: 148000, local_cost_fen: 7500, official_cost_fen: 7400 },
    ],
  },
  "/api/admin/orders": {
    items: [
      { id: 1, out_trade_no: "NF20260930001", user_id: 1, user_email: "lorisvietnam@gmail.com", sku_id: "topup_100", amount_fen: 10000, credit_fen: 10000, pay_type: "alipay", status: "paid", trade_no: "2026093022001", paid_at: "2026-09-30T03:12:00Z", created_at: "2026-09-30T03:10:00Z" },
      { id: 2, out_trade_no: "NF20260929004", user_id: 2, user_email: "second@example.com", sku_id: "topup_500", amount_fen: 50000, credit_fen: 50000, pay_type: "wxpay", status: "paid", trade_no: "2026092922004", paid_at: "2026-09-29T09:41:00Z", created_at: "2026-09-29T09:40:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 2 },
  },
  "/api/admin/ledger": {
    items: [
      { id: 1, user_id: 1, user_email: "lorisvietnam@gmail.com", delta_fen: 10000, balance_after: 32000, kind: "topup", ref_type: "order", ref_id: "1", note: "recharge", created_at: "2026-09-30T03:12:00Z" },
      { id: 2, user_id: 1, user_email: "lorisvietnam@gmail.com", delta_fen: -1200, balance_after: 22000, kind: "settle", ref_type: "task", ref_id: "88", note: "task charge", created_at: "2026-09-30T05:02:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 2 },
  },
  "/api/admin/usage-events": {
    items: [
      { id: 1, user_id: 1, user_email: "lorisvietnam@gmail.com", task_run_id: 88, domain: "drama", capability: "llm", billing_key: "llm_model", model: "qwen-max", total_tokens: 12000, charge_fen: 900, cost_fen: 420, estimated: false, billing_basis: "upstream_usage", created_at: "2026-09-30T05:02:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 1 },
  },
  "/api/admin/finance/daily": {
    configured: true,
    days: 30,
    last_sync_at: "2026-09-30T08:00:00Z",
    totals: { charge_fen: 96500, cost_fen: 51200, tokens: 480000, actual_cost_fen: 49800, profit_fen: 46700 },
    series: [
      { date: "2026-09-28", charge_fen: 14000, cost_fen: 7600, tokens: 61000, actual_cost_fen: 7400, profit_fen: 6600 },
      { date: "2026-09-29", charge_fen: 17500, cost_fen: 9400, tokens: 78000, actual_cost_fen: 9100, profit_fen: 8400 },
    ],
  },
  "/api/admin/users": {
    items: [
      { id: 1, email: "lorisvietnam@gmail.com", nickname: "Loris", phone: "0900000001", quota_left: 12000, balance_fen: 22000, frozen_fen: 0, plan: "pro", role: "admin", created_at: "2026-08-01T02:00:00Z" },
      { id: 2, email: "second@example.com", nickname: "Second", phone: "", quota_left: 0, balance_fen: 150000, frozen_fen: 500, plan: "free", role: "user", created_at: "2026-08-14T07:30:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 2 },
  },
  "/api/admin/projects": {
    items: [
      { id: 1, user_id: 1, user_email: "lorisvietnam@gmail.com", template_id: "live_street_interview", title: "Street interview script", status: "DONE", progress: 100, pipeline_mode: "full", shot_count: 12, charge_fen: 4200, created_at: "2026-09-20T02:00:00Z", updated_at: "2026-09-20T05:00:00Z" },
      { id: 2, user_id: 2, user_email: "second@example.com", template_id: "product_review", title: "Product review", status: "VIDEOING", progress: 60, pipeline_mode: "full", shot_count: 8, charge_fen: 2100, created_at: "2026-09-28T02:00:00Z", updated_at: "2026-09-29T02:00:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 2 },
  },
  "/api/admin/works": {
    items: [
      { id: 1, project_id: 1, user_id: 1, user_email: "lorisvietnam@gmail.com", title: "Street interview script", video_url: "", visibility: "public", audit_status: "passed", published_at: "2026-09-20T06:00:00Z" },
      { id: 2, project_id: 2, user_id: 2, user_email: "second@example.com", title: "Product review", video_url: "", visibility: "unlisted", audit_status: "pending", published_at: "2026-09-29T06:00:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 2 },
  },
  "/api/admin/templates": {
    items: [
      { id: "live_street_interview", name: "Street interview", description: "Documentary street style", category: ["realistic", "documentary"], preview_cover: "", style_prefix: "documentary", negative_prompt: "", default_ratio: "16:9", shot_duration_min: 3, shot_duration_max: 8, llm_system_addon: "", sort_order: 1, is_active: true, is_premium: false, seedream_config: {} },
      { id: "product_review", name: "Product review", description: "", category: ["commercial"], preview_cover: "", style_prefix: "", negative_prompt: "", default_ratio: "9:16", shot_duration_min: 3, shot_duration_max: 6, llm_system_addon: "", sort_order: 2, is_active: false, is_premium: true, seedream_config: {} },
    ],
    meta: { page: 1, page_size: 24, total: 2 },
  },
  "/api/admin/templates/meta": { categories: ["realistic", "documentary", "commercial"] },
  "/api/admin/drama-projects": {
    items: [
      { id: 1, user_id: 1, user_email: "lorisvietnam@gmail.com", title: "Detective story ep1", description: "A short drama episode", episode_count: 3, asset_count: 14, fragment_count: 22, charge_fen: 8800, summary_status: "done", assets_seed_status: "done", episode_content_status: "done", created_at: "2026-09-18T02:00:00Z", updated_at: "2026-09-19T04:00:00Z" },
      { id: 2, user_id: 2, user_email: "second@example.com", title: "Office romance ep1", description: "", episode_count: 1, asset_count: 6, fragment_count: 9, charge_fen: 3100, summary_status: "done", assets_seed_status: "running", episode_content_status: "pending", created_at: "2026-09-27T02:00:00Z", updated_at: "2026-09-28T02:00:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 2 },
  },
  "/api/admin/drama-assets": {
    items: [
      { id: 1, project_id: 1, project_title: "Detective story ep1", user_id: 1, user_email: "lorisvietnam@gmail.com", type: "character", asset_type: "image", name: "Detective Lin", has_cover: true, generation_status: "done", derive_id: "char_detective", created_at: "2026-09-18T03:00:00Z", updated_at: "2026-09-18T04:00:00Z" },
      { id: 2, project_id: 1, project_title: "Detective story ep1", user_id: 1, user_email: "lorisvietnam@gmail.com", type: "scene", asset_type: "image", name: "Alley at night", has_cover: false, generation_status: "failed", derive_id: "scene_alley", created_at: "2026-09-18T03:10:00Z", updated_at: "2026-09-18T03:40:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 2 },
  },
  "/api/admin/drama-episodes": {
    items: [
      { id: 1, project_id: 1, project_title: "Detective story ep1", user_id: 1, user_email: "lorisvietnam@gmail.com", name: "Episode 1", fragment_count: 8, fragment_plan_status: "done", created_at: "2026-09-18T05:00:00Z", updated_at: "2026-09-18T06:00:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 1 },
  },
  "/api/admin/drama-fragments": {
    items: [
      { id: 1, episode_id: 1, episode_name: "Episode 1", project_id: 1, project_title: "Detective story ep1", user_id: 1, user_email: "lorisvietnam@gmail.com", sort_order: 1, content: "Detective Lin walks into the alley.", cover: "", video: "", duration_sec: 5, generation_status: "done", asset_ref_count: 2, created_at: "2026-09-18T07:00:00Z", updated_at: "2026-09-18T08:00:00Z" },
    ],
    meta: { page: 1, page_size: 20, total: 1 },
  },
  "/api/admin/tasks": {
    items: [
      { id: 88, domain: "drama", task_type: "fragment_video", status: "running", priority: 0, requested_by: 1, user_email: "lorisvietnam@gmail.com", progress_percent: 40, cancel_requested: false, cancelable: true, current_step_key: "clip", current_step_status: "running", drama_project_id: 1, episode_id: 1, fragment_id: 1, created_at: "2026-09-30T05:00:00Z", started_at: "2026-09-30T05:01:00Z", payload: { prompt: "short drama clip", model_id: "seedance-2.5", duration_sec: 5, force: false }, result_payload: null, billing_status: "frozen", billing_estimate_fen: 900, billing_charged_fen: 0, billing_refunded_fen: 0 },
      { id: 87, domain: "kepu", task_type: "project_pipeline", status: "succeeded", priority: 0, requested_by: 2, user_email: "second@example.com", progress_percent: 100, cancel_requested: false, cancelable: false, project_id: 2, created_at: "2026-09-29T02:00:00Z", started_at: "2026-09-29T02:01:00Z", payload: { template_id: "product_review" }, result_payload: { video_url: "/static/x.mp4" }, billing_status: "charged", billing_estimate_fen: 2000, billing_charged_fen: 1800, billing_refunded_fen: 0 },
    ],
    meta: { page: 1, page_size: 20, total: 2 },
  },
  "/api/admin/tasks/stats": {
    pending_count: 3,
    active_count: 2,
    leased_count: 1,
    running_count: 1,
    awaiting_poll_count: 1,
    cancel_requested_count: 0,
    succeeded_count: 120,
    failed_count: 7,
    cancelled_count: 2,
    scheduler_running_jobs: 2,
    max_concurrency: 6,
    domains: [
      { domain: "drama", pending: 2, active: 1, succeeded: 80, failed: 4, cancelled: 1 },
      { domain: "kepu", pending: 1, active: 1, succeeded: 40, failed: 3, cancelled: 1 },
    ],
    fetched_at: "2026-09-30T08:00:00Z",
  },
  "/api/admin/settings/models": {
    ark_image_size: "2k",
    ark_video_resolution: "480p",
    ark_video_ratio: "16:9",
    seedance_duration_min: 4,
    seedance_duration_max: 12,
    ark_video_poll_interval: 8,
    ark_video_poll_timeout: 900,
    ark_image_concurrency: 4,
    ark_video_concurrency: 2,
    ark_tts_concurrency: 4,
    task_runtime_max_concurrency: 4,
    task_user_max_concurrency: 2,
    task_poll_max_concurrency: 6,
    drama_user_max_jobs: 2,
    drama_fragment_max_attempts: 3,
    ark_mock: false,
    oss_enabled: false,
    oss_endpoint: "oss-cn-beijing.aliyuncs.com",
    oss_region: "cn-hangzhou",
    oss_bucket: "",
    oss_folder: "kepu",
    oss_public_base: "",
    oss_upload_async: true,
    oss_upload_queue: "media",
    has_oss_access_key_id: false,
    has_oss_access_key_secret: false,
    source: "db",
    epay_enabled: false,
    epay_gateway: "",
    epay_pid: "",
    epay_mch_id: "",
    has_epay_key: false,
    epay_notify_url: "",
    epay_return_url: "",
    billing_enabled: true,
    billing_estimate_buffer: "1.1",
    billing_signup_grant_fen: 1000,
    billing_llm_per_m: 12,
    billing_seedream_per_m: 9,
    billing_tts_per_m: 3000,
    billing_seedance_video0: 24,
    billing_seedance_video1: 48,
    billing_est_llm_tokens: 2000,
    billing_est_seedream_tokens: 1800,
    billing_est_tts_chars: 260,
    billing_est_seedance_tokens_per_sec: 760,
    user_alert_enabled: true,
    user_alert_interval_fen: 10000,
    admin_alert_enabled: true,
    admin_alert_threshold_fen: 30000,
    admin_alert_period: "daily",
    admin_alert_emails: "ops@novafilm.vn",
    smtp_enabled: false,
    smtp_host: "",
    smtp_port: 465,
    smtp_from: "",
    smtp_user: "",
    has_smtp_password: false,
    smtp_use_tls: true,
    public_base_url: "http://127.0.0.1:8000",
    ffmpeg_path: "",
    ffprobe_path: "",
    readiness: [
      { capability: "text", label: "text", ready: true, model: "qwen-max" },
      { capability: "image", label: "image", ready: true, model: "doubao-seedream-5-0" },
      { capability: "video", label: "video", ready: true, model: "seedance-2.5" },
      { capability: "audio", label: "audio", ready: false, model: "" },
    ],
  },
  "/api/admin/settings/routing": {
    default_models: { text_model: "qwen-max", image_model: "doubao-seedream-5-0", video_model: "seedance-2.5", audio_model: "qwen-tts" },
    system_channels: [{ id: "tokenfree", name: "TokenFree New API", base_url: "https://www.tokenfree.com/v1", has_api_key: true, models: [] }],
    validation_errors: [],
  },
};

const EMPTY_LIST = { items: [], meta: { page: 1, page_size: 20, total: 0 } };

function fixtureFor(pathname) {
  // Đăng nhập chỉ cần một token giả: không có tài khoản admin trong DB local.
  if (pathname === "/api/auth/login") return { access_token: "fixture-token", token_type: "bearer" };
  if (pathname.endsWith("/cancel")) return { ok: true };
  if (pathname in FIXTURES) return FIXTURES[pathname];
  if (/\/(cancel|sync)$/.test(pathname)) return { ok: true };
  if (/\/models$|\/routing$/.test(pathname)) return FIXTURES["/api/admin/settings/models"];
  return EMPTY_LIST;
}

/** Mã trạng thái đi từ backend, cần giữ nguyên ở mọi ngôn ngữ */
const KEEP = /^(DRAFT|SCRIPTING|SCRIPT_READY|IMAGING|IMAGE_READY|VIDEOING|VIDEO_READY|AUDIOING|COMPOSING|AUDITING|DONE|REJECTED|FAILED|CANCELLED|pending|paid|closed|public|private|unlisted|topup|grant|adjust|freeze|unfreeze|settle|refund|alipay|wxpay|leased|running|awaiting_poll|awaiting_review|cancel_requested|succeeded|queued|generating|done|idle|character|scene|prop|material|narration|video|audio|text|none|drama|kepu|tools|studio|api|agent_chat|skill_optimize|voice_prompt|content_expand|script_summary|episode_script|fragment_plan|fragment_video|seed_assets|asset_image|asset_video|voice_synthesis|project_pipeline|shot_regen_image|shot_regen_video|shot_regen_audio|project_regen_audio|project_compose_only|v1_image|v1_video|v1_seedance|tool_image|tool_video|llm|image|tts|active|inactive|premium|estimate|upstream|upstream_usage|upstream_cost|passed|frozen|charged|refunded|walk|run|cat|sit|stand|fight|fall|close|drinking|action|pose|custom)$/;

const ROUTES = [
  { name: "dashboard", path: "/" },
  { name: "users", path: "/users" },
  { name: "orders", path: "/orders" },
  { name: "orders-ledger", path: "/orders?tab=ledger" },
  { name: "orders-usage", path: "/orders?tab=usage" },
  { name: "finance", path: "/finance" },
  { name: "projects", path: "/projects" },
  { name: "works", path: "/works" },
  { name: "drama-projects", path: "/drama-projects" },
  { name: "drama-assets", path: "/drama-assets" },
  { name: "drama-episodes", path: "/drama-episodes" },
  { name: "drama-fragments", path: "/drama-fragments" },
  { name: "templates", path: "/templates" },
  { name: "queues", path: "/queues" },
  { name: "settings", path: "/settings" },
  { name: "login", path: "/login" },
];

function findAdminRoutes() {
  // Trang chi tiết cần id thật; nếu không có dữ liệu thì render trống nên bỏ qua.
  return ROUTES;
}

const PORT = 9300 + (process.pid % 400);
const PROFILE = join(tmpdir(), "kilo", `admin-audit-profile-${process.pid}`);

async function cdpTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

async function main() {
  if (!existsSync(EDGE)) {
    console.log(`Khong tim thay Edge tai ${EDGE}`);
    process.exit(2);
  }
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  for (const l of LOCALES) mkdirSync(join(OUT, l), { recursive: true });

  const userDataDir = PROFILE;
  const edge = spawn(EDGE, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1600,1200",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    for (let i = 0; i < 40; i += 1) {
      try {
        await cdpTargets();
        break;
      } catch {
        await sleep(500);
      }
    }
    console.log("CDP da len.");

    const targets = (await cdpTargets()).filter((t) => t.type === "page");
    if (targets.length === 0) throw new Error("Khong tim thay tab nao tren Edge");
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const n = ++id;
        pending.set(n, resolve);
        ws.send(JSON.stringify({ id: n, method, params }));
      });

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Log.enable");

    // ---- chặn /api và trả fixture ----
    await send("Fetch.enable", { patterns: [{ urlPattern: `${BASE}/api/*`, requestStage: "Request" }] });
    const intercepted = new Set();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method !== "Fetch.requestPaused") return;
      const { requestId, request } = msg.params;
      const { pathname } = new URL(request.url);
      const body = JSON.stringify(fixtureFor(pathname));
      intercepted.add(pathname);
      send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "Content-Type", value: "application/json; charset=utf-8" },
          { name: "Access-Control-Allow-Origin", value: "*" },
        ],
        body: Buffer.from(body).toString("base64"),
      });
    });

    /** @type {string[]} */
    const jsErrors = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
        jsErrors.push(`${msg.params.entry.source}: ${msg.params.entry.text}`);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        jsErrors.push(
          `EXCEPTION: ${d?.exception?.description ?? d?.text ?? "?"}`.split("\n").slice(0, 4).join(" | "),
        );
      }
    });

    const goto = async (url) => {
      await send("Page.navigate", { url });
      await sleep(1400);
    };

    const evaluate = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      return r.result?.result?.value;
    };

    // ---- đăng nhập giả: chỉ có token + profile trong localStorage ----
    await goto(`${BASE}/login`);
    await evaluate(`(async () => {
      localStorage.setItem('admin_token', 'fixture-token');
      localStorage.setItem('admin_user', JSON.stringify({
        id: 1, email: 'ops@novafilm.vn', nickname: 'Ops', role: 'admin', plan: 'pro',
      }));
      return 'OK';
    })()`);
    const token = await evaluate(`localStorage.getItem('admin_token')`);
    if (!token) {
      console.log("KHONG LAY DUOC TOKEN — can xem log may chu dich.");
      process.exitCode = 3;
      return;
    }

    // ---- chụp từng route cho từng locale ----
    const results = {};
    for (const locale of LOCALES) {
      console.log(`Chup ${locale}...`);
      for (const route of findAdminRoutes()) {
        console.log(`  ${locale}${route.path}`);
        const url = `${BASE}${route.path}`;
        await goto(url);
        await evaluate(
          `localStorage.setItem('novafilm.admin.locale', ${JSON.stringify(locale)}); true`,
        );
        await goto(url);
        await sleep(900);

        const found = await evaluate(`(() => {
          const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const out = [];
          let n;
          while ((n = walk.nextNode())) {
            const el = n.parentElement;
            if (!el) continue;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
            const text = n.nodeValue || '';
            const m = text.match(/[\\u4e00-\\u9fff]+/g);
            if (m) out.push(...m);
          }
          return { cjk: out, title: document.title, lang: document.documentElement.lang, head: document.body.innerText };
        })()`);

        const cjk = (found?.cjk ?? []).filter((s) => !KEEP.test(s));
        results[`${locale}${route.path}`] = {
          count: (found?.cjk ?? []).length,
          samples: [...new Set(cjk)].slice(0, 8),
          lang: found?.lang,
          title: found?.title,
          head: (found?.head ?? "").replace(/\s+/g, " ").slice(0, 160),
        };

        const shot = await send("Page.captureScreenshot", { format: "png" });
        const file = join(OUT, locale, `${route.name}.png`);
        writeFileSync(file, Buffer.from(shot.result.data, "base64"));
      }
    }

    console.log("\n=== Ket qua dem ky tu Trung trong chu nhin thay (truoc khi loc ma trang thai) ===");
    for (const locale of LOCALES) {
      const rows = Object.entries(results)
        .filter(([k]) => k.startsWith(locale))
        .map(([k, v]) => [k.slice(locale.length) || "/", v]);
      const total = rows.reduce((s, [, v]) => s + v.count, 0);
      console.log(`\n[${locale}] tong ${total}`);
      for (const [path, v] of rows) {
        const flag = v.count === 0 ? "OK  " : "SO  ";
        console.log(`  ${flag}${String(v.count).padStart(4)}  ${path}  ${v.samples.join(" ")}`);
      }
    }
    console.log(`\nlang attribute: vi=${results["vi/"]?.lang} en=${results["en/"]?.lang}`);
    console.log(`document.title  : vi=${results["vi/"]?.title} | en=${results["en/"]?.title}`);
    console.log(`vi/ head: ${results["vi/"]?.head}`);
    console.log(`vi/queues head: ${results["vi/queues"]?.head}`);
    console.log(`\n=== Loi JS luc chay ===\n${jsErrors.length ? jsErrors.join("\n") : "khong co loi JS nao"}`);
    console.log(`\nSo endpoint duoc chan: ${intercepted.size}`);
    console.log(`\nAnh chup: ${OUT}`);
    const remaining = LOCALES.flatMap((l) =>
      Object.entries(results)
        .filter(([k, v]) => k.startsWith(l) && v.count > 0)
        .map(([k, v]) => `${l} ${k.slice(l.length) || "/"} -> ${v.samples.join(" ")}`),
    );
    console.log(remaining.length ? `\n=== Con sot ===\n${remaining.join("\n")}` : "\nKhong con ky tu Trung nao o phan chu nhin thay.");
  } finally {
    edge.kill();
    // Edge còn giữ file profile vài giây; dọn sau, lỗi thì bỏ qua.
    await sleep(800);
    try {
      if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });
    } catch {
      /* thư mục tạm, để lần sau dọn */
    }
  }
}

await main();
