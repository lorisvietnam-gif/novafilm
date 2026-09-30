/**
 * Bảng nhãn cho mã trạng thái / enum. Khoá bên trái là **giá trị API** dùng để so
 * sánh với dữ liệu backend nên tuyệt đối không đổi; chỉ vế phải là văn bản hiển
 * thị và được dịch.
 */
export const enLabels = {
  /** Trạng thái dự án (giá trị so sánh với backend) */
  projectStatus: {
    DRAFT: "Draft",
    SCRIPTING: "Scripting",
    SCRIPT_READY: "Script ready",
    IMAGING: "Rendering boards",
    IMAGE_READY: "Boards ready",
    VIDEOING: "Rendering video",
    VIDEO_READY: "Video ready",
    AUDIOING: "Recording voice",
    COMPOSING: "Composing",
    AUDITING: "Reviewing",
    DONE: "Done",
    REJECTED: "Rejected",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
  },
  /** Trạng thái thanh toán của đơn hàng */
  orderStatus: {
    pending: "Awaiting payment",
    paid: "Paid",
    closed: "Closed",
  },
  /** Kết quả kiểm duyệt / hiển thị của tác phẩm */
  auditStatus: {
    pending: "Awaiting review",
    passed: "Approved",
    rejected: "Rejected",
  },
  /** Mức hiển thị công khai */
  visibility: {
    public: "Public",
    private: "Private",
    unlisted: "Unlisted",
  },
  /** Loại bút toán ví */
  ledgerKind: {
    topup: "Top-up",
    grant: "Grant",
    adjust: "Adjustment",
    freeze: "Freeze",
    unfreeze: "Unfreeze",
    settle: "Settlement",
    refund: "Refund",
  },
  /** Kênh thanh toán (tên thương hiệu, giữ nguyên ở mọi ngôn ngữ) */
  payType: {
    alipay: "Alipay",
    wxpay: "WeChat Pay",
  },
  /** Trạng thái tác vụ ở trung tâm tác vụ thống nhất */
  taskStatus: {
    pending: "Queued",
    leased: "Leased",
    running: "Running",
    awaiting_poll: "Awaiting poll",
    awaiting_review: "Awaiting review",
    cancel_requested: "Cancelling",
    succeeded: "Succeeded",
    failed: "Failed",
    cancelled: "Cancelled",
  },
  /** Lĩnh vực tác vụ */
  taskDomain: {
    drama: "Drama",
    kepu: "AI Short Video",
    tools: "Tools",
    studio: "Studio",
    api: "Public API",
  },
  /** Loại tác vụ */
  taskType: {
    agent_chat: "Drama assistant chat",
    skill_optimize: "Skill prompt tuning",
    voice_prompt: "Character voice brief",
    content_expand: "Topic expansion",
    script_summary: "Script summary",
    episode_script: "Episode script",
    fragment_plan: "AI storyboard",
    fragment_video: "Shot clip",
    seed_assets: "Asset extraction",
    asset_image: "Asset image",
    asset_video: "Asset video",
    voice_synthesis: "Voice synthesis",
    project_pipeline: "Short-video pipeline",
    shot_regen_image: "Single-shot redraw",
    shot_regen_video: "Single-shot video",
    shot_regen_audio: "Single-shot voice",
    project_regen_audio: "Full-film voice",
    project_compose_only: "Compose only",
    v1_image: "API image",
    v1_video: "API video",
    v1_seedance: "API Seedance",
    tool_image: "Tool image",
    tool_video: "Tool video",
  },
  /** Trạng thái sinh tài nguyên của tài sản (params.generation.status) */
  dramaGeneration: {
    queued: "Queued",
    running: "Generating",
    generating: "Generating",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
    idle: "Not started",
  },
  /** Loại tài sản của dự án truyện tranh */
  dramaAssetType: {
    character: "Character",
    scene: "Scene",
    prop: "Prop",
    material: "Material",
    narration: "Narration",
    video: "Video",
    audio: "Audio",
    text: "Text",
    none: "Uncategorised",
  },
  /** Năng lực tính phí hiển thị trên biểu đồ (mã như usage_by_capability) */
  capability: {
    llm: "LLM text",
    image: "Image",
    video: "Video",
    tts: "Voice",
    unknown: "Other",
    other: "Other",
  },
  /** Năng lực mô hình trong trang cấu hình (text/image/video/audio) */
  modelCapability: {
    text: "Text",
    image: "Image",
    video: "Video",
    audio: "Voice",
  },
  /** Căn cứ tính phí (billing_basis) */
  billingBasis: {
    estimate: "Estimated",
    upstream: "Measured (upstream)",
    upstream_usage: "Measured (tokens)",
    upstream_cost: "Measured (cost)",
  },
  /** Trạng thái tính phí của tác vụ (billing_status) */
  billingStatus: {
    none: "Not billed",
    frozen: "Held",
    charged: "Charged",
    refunded: "Refunded",
  },
  /** Trạng thái từng cảnh trong dự án (shot.status) */
  shotStatus: {
    PENDING: "Pending",
    IMAGE_READY: "Board ready",
    VIDEO_READY: "Video ready",
    AUDIO_READY: "Voice ready",
    DONE: "Done",
    FAILED: "Failed",
  },
  /** Lựa chọn "tất cả" của các ô lọc (giá trị vẫn là chuỗi rỗng) */
  filter: {
    allStatus: "All statuses",
    allType: "All types",
    allDomain: "All domains",
    allCapability: "All capabilities",
    allBillingBasis: "All billing bases",
    allVisibility: "All visibility",
    allAudit: "All review statuses",
  },
} as const
