/**
 * Bảng nhãn cho mã trạng thái / enum. Khoá bên trái là **giá trị API** dùng để so
 * sánh với dữ liệu backend nên tuyệt đối không đổi; chỉ vế phải là văn bản hiển
 * thị và được dịch.
 *
 * Thêm một mã mới vào đây thì mọi ngôn ngữ phải có cùng bộ khoá — thiếu khoá là
 * `tsc` báo đỏ (xem `i18n/messages.ts`).
 */
export const zhLabels = {
  /** Trạng thái dự án (giá trị so sánh với backend) */
  projectStatus: {
    DRAFT: "草稿",
    SCRIPTING: "脚本生成中",
    SCRIPT_READY: "脚本就绪",
    IMAGING: "分镜图生成中",
    IMAGE_READY: "分镜图就绪",
    VIDEOING: "视频生成中",
    VIDEO_READY: "视频就绪",
    AUDIOING: "配音中",
    COMPOSING: "合成中",
    AUDITING: "审核中",
    DONE: "已完成",
    REJECTED: "已拒绝",
    FAILED: "失败",
    CANCELLED: "已取消",
  },
  /** Trạng thái thanh toán của đơn hàng */
  orderStatus: {
    pending: "待支付",
    paid: "已支付",
    closed: "已关闭",
  },
  /** Kết quả kiểm duyệt / hiển thị của tác phẩm */
  auditStatus: {
    pending: "待审核",
    passed: "已通过",
    rejected: "已拒绝",
  },
  /** Mức hiển thị công khai */
  visibility: {
    public: "公开",
    private: "私密",
    unlisted: "不公开列出",
  },
  /** Loại bút toán ví */
  ledgerKind: {
    topup: "充值",
    grant: "赠送",
    adjust: "调账",
    freeze: "冻结",
    unfreeze: "解冻",
    settle: "结算",
    refund: "退款",
  },
  /** Kênh thanh toán (tên thương hiệu, giữ nguyên ở mọi ngôn ngữ) */
  payType: {
    alipay: "支付宝",
    wxpay: "微信",
  },
  /** Trạng thái tác vụ ở trung tâm tác vụ thống nhất */
  taskStatus: {
    pending: "排队中",
    leased: "已租约",
    running: "执行中",
    awaiting_poll: "等待轮询",
    awaiting_review: "待审核",
    cancel_requested: "取消中",
    succeeded: "已成功",
    failed: "失败",
    cancelled: "已取消",
  },
  /** Lĩnh vực tác vụ */
  taskDomain: {
    drama: "漫剧",
    kepu: "AI短视频",
    tools: "工具",
    studio: "工作室",
    api: "开放 API",
  },
  /** Loại tác vụ */
  taskType: {
    agent_chat: "漫剧助手聊天",
    skill_optimize: "Skill 优化提示词",
    voice_prompt: "角色音色描述",
    content_expand: "选题扩写",
    script_summary: "剧本摘要",
    episode_script: "分集剧本",
    fragment_plan: "AI 分镜",
    fragment_video: "分镜视频",
    seed_assets: "资产抽取",
    asset_image: "资产生图",
    asset_video: "资产视频",
    voice_synthesis: "配音合成",
    project_pipeline: "科普流水线",
    shot_regen_image: "单镜重绘",
    shot_regen_video: "单镜视频",
    shot_regen_audio: "单镜配音",
    project_regen_audio: "全片配音",
    project_compose_only: "仅合成",
    v1_image: "API 生图",
    v1_video: "API 生视频",
    v1_seedance: "API Seedance",
    tool_image: "工具生图",
    tool_video: "工具生视频",
  },
  /** Trạng thái sinh tài nguyên của tài sản (params.generation.status) */
  dramaGeneration: {
    queued: "排队中",
    running: "生成中",
    generating: "生成中",
    done: "已完成",
    failed: "失败",
    cancelled: "已取消",
    idle: "未开始",
  },
  /** Loại tài sản của dự án truyện tranh */
  dramaAssetType: {
    character: "角色",
    scene: "场景",
    prop: "道具",
    material: "素材",
    narration: "旁白",
    video: "视频",
    audio: "音频",
    text: "文本",
    none: "未分类",
  },
  /** Năng lực tính phí hiển thị trên biểu đồ (mã như usage_by_capability) */
  capability: {
    llm: "LLM 文本",
    image: "生图",
    video: "视频",
    tts: "配音",
    unknown: "其他",
    other: "其他",
  },
  /** Năng lực mô hình trong trang cấu hình (text/image/video/audio) */
  modelCapability: {
    text: "文本",
    image: "图像",
    video: "视频",
    audio: "配音",
  },
  /** Căn cứ tính phí (billing_basis) */
  billingBasis: {
    estimate: "估算",
    upstream: "实测（上游）",
    upstream_usage: "实测(token)",
    upstream_cost: "实测(费用)",
  },
  /** Trạng thái tính phí của tác vụ (billing_status) */
  billingStatus: {
    none: "未计费",
    frozen: "预扣",
    charged: "已扣费",
    refunded: "已退回",
  },
  /** Trạng thái từng cảnh trong dự án (shot.status) */
  shotStatus: {
    PENDING: "待处理",
    IMAGE_READY: "分镜图就绪",
    VIDEO_READY: "视频就绪",
    AUDIO_READY: "配音就绪",
    DONE: "已完成",
    FAILED: "失败",
  },
  /** Nhãn cho các trường payload tác vụ; khoá là tên trường backend */
  payloadField: {
    prompt: "提示词",
    name: "名称",
    kind: "类型",
    model_id: "模型",
    image_style_id: "风格",
    aspect_ratio: "画幅",
    resolution: "分辨率",
    duration_sec: "时长(秒)",
    duration: "时长",
    force: "强制重跑",
    total: "总数",
    project_id: "科普项目 ID",
    user_id: "用户 ID",
    asset_id: "资产 ID",
    episode_count: "集数",
    phase: "阶段",
    sync: "同步",
    refresh_prompts: "刷新提示词",
    reextract_props: "重抽道具",
  },
  /** Lựa chọn "tất cả" của các ô lọc (giá trị vẫn là chuỗi rỗng) */
  filter: {
    allStatus: "全部状态",
    allType: "全部类型",
    allDomain: "全部领域",
    allCapability: "全部能力",
    allBillingBasis: "全部计费依据",
    allVisibility: "全部可见性",
    allAudit: "全部审核状态",
  },
} as const
