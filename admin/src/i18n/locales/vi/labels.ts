/**
 * Bảng nhãn cho mã trạng thái / enum. Khoá bên trái là **giá trị API** dùng để so
 * sánh với dữ liệu backend nên tuyệt đối không đổi; chỉ vế phải là văn bản hiển
 * thị và được dịch.
 *
 * Thuật ngữ dịch không được (tên trường, mã trạng thái, tên model) giữ nguyên.
 * Với trạng thái dự án, dùng đúng câu chữ đã dịch ở frontend để người vận hành
 * thấy cùng một từ ở cả hai nơi.
 */
export const viLabels = {
  /** Trạng thái dự án (giá trị so sánh với backend) */
  projectStatus: {
    DRAFT: "Bản nháp",
    SCRIPTING: "Đang chia cảnh",
    SCRIPT_READY: "Kịch bản đã sẵn sàng",
    IMAGING: "Đang tạo ảnh",
    IMAGE_READY: "Đã xong ảnh storyboard",
    VIDEOING: "Đang tạo video",
    VIDEO_READY: "Đã xong video từng cảnh",
    AUDIOING: "Đang tạo lồng tiếng",
    COMPOSING: "Đang ghép phim",
    AUDITING: "Đang duyệt",
    DONE: "Đã hoàn thành",
    REJECTED: "Đã từ chối",
    FAILED: "Thất bại",
    CANCELLED: "Đã huỷ",
  },
  /** Trạng thái thanh toán của đơn hàng */
  orderStatus: {
    pending: "Chờ thanh toán",
    paid: "Đã thanh toán",
    closed: "Đã đóng",
  },
  /** Kết quả kiểm duyệt / hiển thị của tác phẩm */
  auditStatus: {
    pending: "Chờ duyệt",
    passed: "Đã duyệt",
    rejected: "Đã từ chối",
  },
  /** Mức hiển thị công khai */
  visibility: {
    public: "Công khai",
    private: "Riêng tư",
    unlisted: "Không hiển thị công khai",
  },
  /** Loại bút toán ví */
  ledgerKind: {
    topup: "Nạp tiền",
    grant: "Tặng",
    adjust: "Điều chỉnh",
    freeze: "Đóng băng",
    unfreeze: "Giải phóng",
    settle: "Quyết toán",
    refund: "Hoàn tiền",
  },
  /** Kênh thanh toán (tên thương hiệu, giữ nguyên ở mọi ngôn ngữ) */
  payType: {
    alipay: "Alipay",
    wxpay: "WeChat Pay",
  },
  /** Trạng thái tác vụ ở trung tâm tác vụ thống nhất */
  taskStatus: {
    pending: "Trong hàng đợi",
    leased: "Đã nhận lease",
    running: "Đang chạy",
    awaiting_poll: "Chờ thăm dò",
    awaiting_review: "Chờ duyệt",
    cancel_requested: "Đang huỷ",
    succeeded: "Thành công",
    failed: "Thất bại",
    cancelled: "Đã huỷ",
  },
  /** Lĩnh vực tác vụ */
  taskDomain: {
    drama: "Drama",
    kepu: "AI Short Video",
    tools: "Công cụ",
    studio: "Xưởng",
    api: "API mở",
  },
  /** Loại tác vụ */
  taskType: {
    agent_chat: "Trợ lý Drama — trò chuyện",
    skill_optimize: "Tối ưu prompt của Skill",
    voice_prompt: "Mô tả chất giọng nhân vật",
    content_expand: "Mở rộng chủ đề",
    script_summary: "Tóm tắt kịch bản",
    episode_script: "Kịch bản từng tập",
    fragment_plan: "AI storyboard",
    fragment_video: "Video từng cảnh",
    seed_assets: "Trích xuất tài nguyên",
    asset_image: "Tạo ảnh tài nguyên",
    asset_video: "Tạo video tài nguyên",
    voice_synthesis: "Ghép lồng tiếng",
    project_pipeline: "Dây chuyền AI Short Video",
    shot_regen_image: "Vẽ lại một cảnh",
    shot_regen_video: "Video một cảnh",
    shot_regen_audio: "Lồng tiếng một cảnh",
    project_regen_audio: "Lồng tiếng toàn phim",
    project_compose_only: "Chỉ ghép phim",
    v1_image: "API tạo ảnh",
    v1_video: "API tạo video",
    v1_seedance: "API Seedance",
    tool_image: "Công cụ tạo ảnh",
    tool_video: "Công cụ tạo video",
  },
  /** Trạng thái sinh tài nguyên của tài sản (params.generation.status) */
  dramaGeneration: {
    queued: "Trong hàng đợi",
    running: "Đang tạo",
    generating: "Đang tạo",
    done: "Đã xong",
    failed: "Thất bại",
    cancelled: "Đã huỷ",
    idle: "Chưa bắt đầu",
  },
  /** Loại tài sản của dự án truyện tranh */
  dramaAssetType: {
    character: "Nhân vật",
    scene: "Bối cảnh",
    prop: "Đạo cụ",
    material: "Tư liệu",
    narration: "Lời dẫn",
    video: "Video",
    audio: "Âm thanh",
    text: "Văn bản",
    none: "Chưa phân loại",
  },
  /** Năng lực tính phí hiển thị trên biểu đồ (mã như usage_by_capability) */
  capability: {
    llm: "Văn bản LLM",
    image: "Tạo ảnh",
    video: "Video",
    tts: "Lồng tiếng",
    unknown: "Khác",
    other: "Khác",
  },
  /** Năng lực mô hình trong trang cấu hình (text/image/video/audio) */
  modelCapability: {
    text: "Văn bản",
    image: "Hình ảnh",
    video: "Video",
    audio: "Lồng tiếng",
  },
  /** Căn cứ tính phí (billing_basis) */
  billingBasis: {
    estimate: "Ước tính",
    upstream: "Thực đo (thượng nguồn)",
    upstream_usage: "Thực đo (token)",
    upstream_cost: "Thực đo (chi phí)",
  },
  /** Trạng thái tính phí của tác vụ (billing_status) */
  billingStatus: {
    none: "Chưa tính phí",
    frozen: "Tạm giữ",
    charged: "Đã trừ phí",
    refunded: "Đã hoàn lại",
  },
  /** Trạng thái từng cảnh trong dự án (shot.status) */
  shotStatus: {
    PENDING: "Chờ xử lý",
    IMAGE_READY: "Đã có ảnh storyboard",
    VIDEO_READY: "Đã có video",
    AUDIO_READY: "Đã có lồng tiếng",
    DONE: "Đã xong",
    FAILED: "Thất bại",
  },
  /** Nhãn cho các trường payload tác vụ; khoá là tên trường backend */
  payloadField: {
    prompt: "Prompt",
    name: "Tên",
    kind: "Loại",
    model_id: "Mô hình",
    image_style_id: "Phong cách",
    aspect_ratio: "Tỷ lệ khung hình",
    resolution: "Độ phân giải",
    duration_sec: "Thời lượng (giây)",
    duration: "Thời lượng",
    force: "Bắt buộc chạy lại",
    total: "Tổng số",
    project_id: "ID dự án Short Video",
    user_id: "ID người dùng",
    asset_id: "ID tài nguyên",
    episode_count: "Số tập",
    phase: "Giai đoạn",
    sync: "Đồng bộ",
    refresh_prompts: "Làm mới prompt",
    reextract_props: "Trích lại đạo cụ",
  },
  /** Lựa chọn "tất cả" của các ô lọc (giá trị vẫn là chuỗi rỗng) */
  filter: {
    allStatus: "Mọi trạng thái",
    allType: "Mọi loại",
    allDomain: "Mọi lĩnh vực",
    allCapability: "Mọi năng lực",
    allBillingBasis: "Mọi căn cứ tính phí",
    allVisibility: "Mọi mức hiển thị",
    allAudit: "Mọi trạng thái duyệt",
  },
} as const
