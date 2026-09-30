/**
 * Popup giải thích cách truyền giá trị và quy tắc viết kịch bản cho Seedance
 * (trang sửa tập, khớp docs/EPISODE_RULES.md).
 *
 * RANH GIỚI — token trong nội dung ví dụ giữ nguyên tiếng Trung:
 *
 * Các marker 【强制约束：…】, nhãn cảnh quay (`空镜：`, `远景：`…) và các dòng mẫu
 * là đúng những chuỗi mà `dramaEpisodeScriptValidate.ts` và phía backend dò bằng
 * regex. Đổi chúng thì người dùng gõ theo mà mô hình không hiểu, và mọi kiểm tra
 * ở trên sẽ trượt. Chỉ phần giải thích xung quanh mới dịch.
 */
import { useState } from 'react'
import Modal from '../ui/Modal'
import {
  DRAMA_SEGMENT_DURATION_MAX,
  DRAMA_SEGMENT_DURATION_MIN,
  DRAMA_SHOT_DURATION_HARD_MAX,
  FRAGMENT_CONTENT_DURATION_MAX,
} from '../../lib/dramaEpisodePromptEditor'
import {
  DIALOGUE_PREFIX,
  DRAMA_NARRATION_PREFIX,
  DRAMA_SUBTITLE_CUE,
  VISUAL_PREFIX,
} from '../../lib/dramaEpisodeScriptValidate'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Tab = 'payload' | 'script' | 'usage'

type Props = {
  open: boolean
  onClose: () => void
}

const COPY: Record<string, LocalizedText> = {
  modalTitle: {
    zh: 'Seedance 传值与使用规则',
    en: 'How Seedance receives values, and how to use it',
    vi: 'Cách Seedance nhận dữ liệu và cách dùng',
  },
  gotIt: { zh: '知道了', en: 'Got it', vi: 'Đã hiểu' },
  lede: {
    zh: '分镜视频由 Seedance 多模态接口生成。下方说明系统如何把脚本、资产与顶栏参数组装成请求，以及漫剧分集脚本写法（详见 docs/EPISODE_RULES.md）。',
    en: 'Storyboard clips are rendered by Seedance’s multimodal API. Below is how the system assembles the script, assets and header settings into a request, plus how to write an AI Drama episode script (see docs/EPISODE_RULES.md).',
    vi: 'Video storyboard được tạo bởi giao diện đa phương thức của Seedance. Bên dưới là cách hệ thống ghép kịch bản, tài nguyên và tham số thanh trên thành một request, cùng cách viết kịch bản cho một tập AI Drama (xem docs/EPISODE_RULES.md).',
  },
  tablistLabel: {
    zh: 'Seedance 规则分类',
    en: 'Seedance rule categories',
    vi: 'Các nhóm quy tắc Seedance',
  },
  tabPayload: { zh: '传值规则', en: 'Values sent', vi: 'Giá trị gửi đi' },
  tabScript: { zh: '脚本写法', en: 'Writing the script', vi: 'Viết kịch bản' },
  tabUsage: { zh: '使用建议', en: 'Practical advice', vi: 'Lời khuyên dùng' },

  hHeader: { zh: '顶栏参数 → API 字段', en: 'Header settings → API fields', vi: 'Tham số thanh trên → trường API' },
  lblModel: { zh: '模型', en: 'Model', vi: 'Mô hình' },
  lblRatio: { zh: '画幅 · 清晰度', en: 'Frame · resolution', vi: 'Khung hình · độ phân giải' },
  ratioWhere: { zh: '（分集顶栏设置）', en: ' (set in the episode header)', vi: ' (đặt ở thanh trên của tập)' },
  lblDuration: { zh: '时长', en: 'Duration', vi: 'Thời lượng' },
  durationDesc: {
    zh: '：脚本内 @duration 合计（建议 4–{max} 秒）；无标签时用本镜「时长」字段',
    en: ' — the sum of @duration in the script ({min}–{max}s suggested). Without a tag it falls back to this shot’s duration field.',
    vi: ' — tổng các @duration trong kịch bản (nên từ {min}–{max} giây). Khi không có nhãn thì lấy từ trường "Thời lượng" của cảnh.',
  },
  lblVideoStyle: { zh: '视频风格', en: 'Video style', vi: 'Phong cách video' },
  videoStyleDesc: {
    zh: '：写入提示词「画面风格」强制约束块',
    en: ' — written into the "visual style" mandatory-constraint block of the prompt.',
    vi: ' — được ghi vào khối ràng buộc bắt buộc "phong cách hình ảnh" của prompt.',
  },

  hContent: {
    zh: 'content 多模态数组（按顺序提交）',
    en: 'The content multimodal array (submitted in this order)',
    vi: 'Mảng đa phương thức content (gửi theo thứ tự này)',
  },
  contentText: {
    zh: '：自动组装的完整提示词（见下方各约束块 + 正文）',
    en: ': the fully assembled prompt (see the constraint blocks below plus the body).',
    vi: ': prompt đầy đủ do hệ thống tự ghép (xem các khối ràng buộc bên dưới cộng phần nội dung).',
  },
  contentImage: {
    zh: '：本镜引用角色 / 场景 / 道具的封面或主图',
    en: ': the cover or main image of the character, scene or prop referenced by this shot.',
    vi: ': ảnh bìa hoặc ảnh chính của nhân vật / bối cảnh / đạo cụ mà cảnh này tham chiếu.',
  },
  audioNote: {
    zh: '：系统默认开启 generate_audio：有口播意图时 Seedance 原生配音并烧录字幕；纯画面镜仅环境音、不烧字幕。',
    en: ': the system turns on generate_audio by default. When the script has spoken lines, Seedance voices them and burns in subtitles. Plain visual shots get ambience only, with no subtitles.',
    vi: ': hệ thống bật generate_audio mặc định. Khi kịch bản có lời thoại, Seedance tự đọc và ghi phụ đề vào hình. Cảnh thuần hình ảnh chỉ có tiếng không khí, không ghi phụ đề.',
  },

  hAssembly: { zh: '提示词自动组装顺序', en: 'How the prompt is assembled', vi: 'Thứ tự ghép prompt' },
  assemblyBodyLabel: { zh: '正文', en: 'Body', vi: 'Nội dung' },
  assemblyBody: {
    zh: '：将 @asset:ID 替换为「名称（参考图 N）」；将 @duration:N 替换为时间区间（如 00:00-00:04）',
    en: ' — @asset:ID becomes "name (reference image N)", and @duration:N becomes a time range such as 00:00-00:04.',
    vi: ' — @asset:ID trở thành "tên (ảnh tham chiếu N)", còn @duration:N trở thành khoảng thời gian, ví dụ 00:00-00:04.',
  },
  assemblyStyle: { zh: '：项目所选画风描述', en: ': the visual style chosen for the project.', vi: ': mô tả phong cách hình đã chọn cho dự án.' },
  assemblyAudio: {
    zh: '：根据脚本旁白 / 对白 / 画面 cue 推断',
    en: ': inferred from the script’s narration, dialogue and visual cues.',
    vi: ': suy ra từ lời dẫn, đối thoại và các cue hình ảnh trong kịch bản.',
  },

  hDurationTag: { zh: '时长标签', en: 'Duration tags', vi: 'Nhãn thời lượng' },
  durationTagItem: {
    zh: '：标记一段内容的时长（秒），单段建议 {min}–{max} 秒',
    en: ' — marks how long one segment runs, in seconds. {min}–{max}s per segment is a good rule.',
    vi: ' — đánh dấu thời lượng của một đoạn, tính bằng giây. Mỗi đoạn nên khoảng {min}–{max} giây.',
  },
  durationTotalLabel: { zh: '镜内合计', en: 'Total per shot', vi: 'Tổng trong một cảnh' },
  durationNew: {
    zh: '：新分镜建议 ≤ {max} 秒；旧稿最高 {hard} 秒',
    en: ': keep new shots at {max}s or less; older scripts may run up to {hard}s.',
    vi: ': storyboard mới nên ≤ {max} giây; bản cũ tối đa {hard} giây.',
  },
  durationChip: {
    zh: '：键入 @ 可插入时长 chip 或引用资产',
    en: ' — type @ to insert a duration chip or an asset reference.',
    vi: ' — gõ @ để chèn chip thời lượng hoặc tham chiếu tài nguyên.',
  },

  hAssetRef: { zh: '资产引用', en: 'Asset references', vi: 'Tham chiếu tài nguyên' },
  assetRefItem: {
    zh: '：在正文中引用 ID 为 123 的角色 / 场景 / 道具',
    en: ' — references the character, scene or prop with ID 123 from the body.',
    vi: ' — tham chiếu nhân vật / bối cảnh / đạo cụ có ID là 123 trong phần nội dung.',
  },
  assetRefPanel: {
    zh: '：左侧资产面板点击资产，或本镜「参与资产」条，也会自动写入引用',
    en: ' — clicking an asset in the panel on the left, or using this shot’s asset chips, writes the reference for you.',
    vi: ' — bấm vào một tài nguyên ở bảng bên trái, hoặc dùng dải tài nguyên của cảnh, cũng sẽ tự ghi tham chiếu.',
  },
  assetRefVoice: {
    zh: '：被引用的角色需有参考图；口播由 Seedance 按对白/旁白自行发挥，无需绑定音色',
    en: ': a referenced character needs a reference image. Seedance voices the lines from the dialogue and narration on its own, so no voice binding is required.',
    vi: ': nhân vật được tham chiếu cần có ảnh tham chiếu. Seedance tự đọc lời theo đối thoại và lời dẫn, nên không cần gắn giọng đọc.',
  },

  hCue: {
    zh: '漫剧常用 cue（勿用科普版「全程旁白烧录」字幕句）',
    en: 'Cues AI Drama uses often (do not paste a generic "burn in narration subtitles" line)',
    vi: 'Cue thường dùng cho AI Drama (đừng dán câu phụ đề chung chung kiểu "ghi toàn bộ lời dẫn vào hình")',
  },
  cueShotSize: {
    zh: '：写成「空镜：…」「远景：…」「特写：…」或',
    en: ': write it as 空镜：…, 远景：…, 特写：… or',
    vi: ': viết dạng 空镜：…, 远景：…, 特写：… hoặc',
  },
  cueForbidden: {
    zh: '；禁止标成对白/旁白（会口播并烧字幕）',
    en: '. Never label it dialogue or narration: those get spoken aloud and burn in subtitles.',
    vi: '. Tuyệt đối đừng gắn thành đối thoại hay lời dẫn, vì chúng sẽ bị đọc to và ghi phụ đề vào hình.',
  },
  cueDialogueShape: { zh: '：角色名：台词 或 ', en: ': name: line, or ', vi: ': tên nhân vật: lời thoại, hoặc ' },
  cueNarrationShape: { zh: '：', en: ': ', vi: ': ' },
  cueNarrationTail: {
    zh: '；字幕逐句轮换、与当前口播句同步，禁止整段叠满屏幕',
    en: '. Subtitles rotate line by line in step with the current spoken line; never stack a whole paragraph across the screen.',
    vi: '. Phụ đề lần lượt theo từng câu, khớp với câu đang đọc; không được chồng cả đoạn lên màn hình.',
  },
  cueIntroBody: {
    zh: '：本剧首次出场重要角色叠字贴在该角色身旁（非底部字幕、非居中大标题）',
    en: ': when a major character first appears, the name goes next to that character — not in the bottom subtitle bar, and not as a big centred title.',
    vi: ': khi nhân vật quan trọng lần đầu xuất hiện, tên đặt cạnh chính nhân vật đó, không đặt ở dải phụ đề dưới và không làm tiêu đề lớn ở giữa màn hình.',
  },
  cueBgm: { zh: '：音量低于人声，不抢戏', en: ': keep the level under the voice so it never fights the dialogue.', vi: ': để nhỏ hơn giọng đọc, không lấn át diễn.' },

  hShotSize: { zh: '景别 / 运镜（@ → 小工具）', en: 'Shot size / camera move (via @ → insert menu)', vi: 'Cỡ cảnh / cử động máy (qua @ → menu chèn)' },
  shotSizeTool: {
    zh: '：编辑器键入 @ →「小工具」→「景别 / 运镜」，可一键插入「空镜：」「特写：」「推镜：」等前缀',
    en: ': in the editor, type @, then "Insert" → "Shot size / camera move" to drop in prefixes such as 空镜：, 特写： or 推镜：.',
    vi: ': trong trình soạn thảo, gõ @ rồi chọn "Chèn" → "Cỡ cảnh / cử động máy" để thêm nhanh các tiền tố như 空镜：, 特写： hay 推镜：.',
  },
  shotSizeFormula: {
    zh: '：主体 + 动作 + 场景 +（景别/运镜）+（光影）；每段运动轴建议 ≤ 2',
    en: ': subject + action + setting + (shot size / camera move) + (light). Keep it to two or fewer camera moves per segment.',
    vi: ': chủ thể + hành động + bối cảnh + (cỡ cảnh / cử động máy) + (ánh sáng). Mỗi đoạn nên có không quá 2 trục cử động.',
  },
  shotSizeSpin: {
    zh: '：近景大旋转易崩脸，环绕留给中景以上',
    en: ': a large orbit on a close-up distorts faces; save orbits for medium shots and wider.',
    vi: ': xoay vòng lớn ở cận cảnh hay làm méo khuôn mặt; nên để vòng quanh cho cảnh trung và rộng hơn.',
  },

  hPrecheck: { zh: '生成前检查', en: 'Before you generate', vi: 'Kiểm tra trước khi tạo' },
  precheckScript: {
    zh: '：脚本校验：时长合法；空镜未被标成对白/旁白（编辑区会即时提示，有错误不可生成）',
    en: ': script check: durations are valid and plain visual shots are not labelled dialogue or narration. The editor flags these immediately, and a blocking error stops generation.',
    vi: ': kiểm tra kịch bản: thời lượng hợp lệ, cảnh không lời không bị gắn thành đối thoại hay lời dẫn. Trình soạn thảo báo ngay, và có lỗi chặn thì không tạo được.',
  },
  precheckAsset: {
    zh: '：本镜「参与资产」中的角色已有参考图（缺图会警告）；口播无需绑定音色',
    en: ': characters in this shot’s asset list already have a reference image (a missing one triggers a warning). Voice binding is not needed.',
    vi: ': nhân vật trong danh sách tài nguyên của cảnh đã có ảnh tham chiếu (thiếu ảnh sẽ có cảnh báo). Không cần gắn giọng đọc.',
  },
  precheckHeader: {
    zh: '：项目顶栏确认画幅与清晰度；分集顶栏确认视频风格、模型后再点「生成」',
    en: ': confirm frame size and resolution in the project header, and video style and model in the episode header, then press Generate.',
    vi: ': xác nhận khung hình và độ phân giải ở thanh trên của dự án, xác nhận phong cách video và mô hình ở thanh trên của tập, rồi mới bấm "Tạo".',
  },

  hQueue: { zh: '队列与并行', en: 'Queue and parallelism', vi: 'Hàng đợi và chạy song song' },
  queueParallel: {
    zh: '：分镜视频走独立 video 队列，Seedance 最多 10 路并行',
    en: ': storyboard clips run on their own video queue, with up to 10 in parallel on Seedance.',
    vi: ': video storyboard đi hàng đợi video riêng, Seedance chạy song song tối đa 10 luồng.',
  },
  queueEdit: {
    zh: '：某一镜生成中时，仍可编辑其他镜脚本、预览已完成的视频',
    en: ': while one shot is rendering you can still edit the other scripts and preview finished clips.',
    vi: ': khi một cảnh đang tạo, bạn vẫn sửa được kịch bản của cảnh khác và xem trước các video đã xong.',
  },
  queueBatch: {
    zh: '：「一键生成」会为本集各镜依次入队；单镜「生成」仅提交当前镜',
    en: ': Generate all queues every shot in the episode; Generate on a single shot submits only that shot.',
    vi: ': "Tạo tất cả" sẽ lần lượt cho các cảnh của tập vào hàng đợi; "Tạo" ở một cảnh chỉ gửi riêng cảnh đó.',
  },

  hContinuity: { zh: '镜间尾帧衔接', en: 'Carrying the last frame between shots', vi: 'Nối khung hình cuối giữa các cảnh' },
  continuityDefault: {
    zh: '：生成时默认 return_last_frame=true，成功后把尾帧写入分镜 params.lastFrameUrl',
    en: ': generation sets return_last_frame=true by default and, on success, writes the last frame to params.lastFrameUrl on the shot.',
    vi: ': lúc tạo, return_last_frame=true được bật mặc định; thành công thì ghi khung hình cuối vào params.lastFrameUrl của cảnh.',
  },
  continuityHeader: {
    zh: '：分集顶栏「镜间衔接」开启时：若本镜有角色/场景参考图或音色，尾帧以 reference_image 附在末尾（Seedance 禁止与 first_frame 混用）；无参考媒体时才用 first_frame',
    en: ': with "Continuity between shots" on in the episode header, if this shot has character or scene references or a voice, the last frame rides along at the end as reference_image. Seedance forbids mixing it with first_frame, so first_frame is only used when there is no reference media at all.',
    vi: ': khi bật "Nối giữa các cảnh" ở thanh trên của tập, nếu cảnh có ảnh tham chiếu nhân vật/bối cảnh hoặc giọng đọc thì khung hình cuối được gắn vào cuối dưới dạng reference_image. Seedance cấm trộn với first_frame, nên first_frame chỉ dùng khi hoàn toàn không có tư liệu tham chiếu.',
  },
  continuityEdit: {
    zh: '：普通生成请勿在脚本里写「编辑 / 延长」类措辞，以免任务被重分类；真正的「延长路径」仍未产品化',
    en: ': do not write edit or extend wording into the script for a normal generation, or the job gets reclassified. The real extend path is not productised yet.',
    vi: ': khi tạo bình thường, đừng viết các cụm kiểu "chỉnh sửa / kéo dài" vào kịch bản, nếu không tác vụ sẽ bị phân loại lại. Tính năng kéo dài thật vẫn chưa có trong sản phẩm.',
  },

  hVoice: { zh: '音色与参考音频（暂关）', en: 'Voice and reference audio (currently off)', vi: 'Giọng đọc và audio tham chiếu (đang tắt)' },
  voiceOff: {
    zh: '：暂不提交 reference_audio、不绑定角色/旁白试听；口播由 Seedance 原生配音自行发挥',
    en: ': reference_audio is not submitted and no character or narration voice is bound; Seedance voices the lines with its own native speech.',
    vi: ': chưa gửi reference_audio và không gắn giọng thử cho nhân vật/lời dẫn; lời thoại do chính Seedance đọc bằng giọng gốc.',
  },
  voiceAutoImage: {
    zh: '：缺少参考图时，系统会尝试自动补图后再提交 Seedance',
    en: ': when a reference image is missing the system tries to fill it in before submitting to Seedance.',
    vi: ': khi thiếu ảnh tham chiếu, hệ thống sẽ thử tự bổ ảnh rồi mới gửi lên Seedance.',
  },

  hRestory: { zh: 'AI 重新分镜', en: 'Rebuilding the storyboard with AI', vi: 'Dựng lại storyboard bằng AI' },
  restoryNote: {
    zh: '：会按剧本与资产重新规划各镜脚本与 @duration 结构；进行中的视频生成需等待完成后再操作，以免状态冲突。空镜须用「空镜：…」等画面写法，勿写成对白。',
    en: ': replans each shot’s script and @duration structure from the script and assets. Wait for any video that is still generating before you start, so the states do not clash. Plain visual shots must use the 空镜：… form, never dialogue.',
    vi: ': lập kế hoạch lại kịch bản và cấu trúc @duration của từng cảnh dựa trên kịch bản và tài nguyên. Hãy chờ các video đang tạo xong trước khi thao tác để trạng thái không xung đột. Cảnh không lời phải dùng cách viết dạng hình ảnh như 空镜：…, tuyệt đối không viết thành đối thoại.',
  },
}

const LABELS: Record<string, LocalizedText> = {
  shotSize: { zh: '空镜 / 景别', en: 'Plain visual shot / shot size', vi: 'Cảnh không lời / cỡ cảnh' },
  dialogue: { zh: '对白', en: 'Dialogue', vi: 'Đối thoại' },
  narration: { zh: '旁白', en: 'Narration', vi: 'Lời dẫn' },
  characterIntro: { zh: '人物介绍', en: 'Character intro', vi: 'Giới thiệu nhân vật' },
  bgm: { zh: 'BGM', en: 'BGM', vi: 'Nhạc nền' },
}

/** Thay {min} / {max} / {hard} bằng hằng số của dự án. */
function fill(
  template: LocalizedText,
  lt: (v: LocalizedText) => string,
  values: { min?: number; max?: number; hard?: number } = {},
): string {
  return lt(template)
    .replace('{min}', String(values.min ?? ''))
    .replace('{max}', String(values.max ?? ''))
    .replace('{hard}', String(values.hard ?? ''))
}

/** Render popup giải thích quy tắc Seedance. */
export function SeedanceRulesModal({ open, onClose }: Props) {
  const lt = useLocalizedText()
  const [tab, setTab] = useState<Tab>('payload')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lt(COPY.modalTitle)}
      size="lg"
      className="pf-help-modal seedance-rules-modal"
      footer={
        <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" onClick={onClose}>
          {lt(COPY.gotIt)}
        </button>
      }
    >
      <div className="pf-help">
        <p className="pf-help-lede">{lt(COPY.lede)}</p>

        <div className="pf-help-tabs" role="tablist" aria-label={lt(COPY.tablistLabel)}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'payload'}
            className={tab === 'payload' ? 'active' : undefined}
            onClick={() => setTab('payload')}
          >
            {lt(COPY.tabPayload)}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'script'}
            className={tab === 'script' ? 'active' : undefined}
            onClick={() => setTab('script')}
          >
            {lt(COPY.tabScript)}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'usage'}
            className={tab === 'usage' ? 'active' : undefined}
            onClick={() => setTab('usage')}
          >
            {lt(COPY.tabUsage)}
          </button>
        </div>

        {tab === 'payload' ? (
          <div className="seedance-rules-section">
            <h4>{lt(COPY.hHeader)}</h4>
            <ul className="seedance-rules-list">
              <li>
                <strong>{lt(COPY.lblModel)}</strong> → <code>model</code>（Seedance 2.5 / 1.5）
              </li>
              <li>
                <strong>
                  {lt(COPY.lblRatio)}
                  {lt(COPY.ratioWhere)}
                </strong>{' '}
                → <code>ratio</code>、<code>resolution</code>
              </li>
              <li>
                <strong>{lt(COPY.lblDuration)}</strong> → <code>duration</code>
                {fill(COPY.durationDesc, lt, {
                  min: DRAMA_SEGMENT_DURATION_MIN,
                  max: FRAGMENT_CONTENT_DURATION_MAX,
                })}
              </li>
              <li>
                <strong>{lt(COPY.lblVideoStyle)}</strong>
                {lt(COPY.videoStyleDesc)}
              </li>
            </ul>

            <h4>{lt(COPY.hContent)}</h4>
            <ol className="seedance-rules-list">
              <li>
                <strong>text</strong>
                {lt(COPY.contentText)}
              </li>
              <li>
                <strong>reference_image</strong>
                {lt(COPY.contentImage)}
              </li>
              {/* Giọng đọc khó khống chế: tạm không gửi reference_audio, lời đọc để generate_audio tự xử lý
              <li>
                <strong>reference_audio</strong>：已绑定音色的角色与旁白试听音频
              </li>
              */}
            </ol>
            <p className="seedance-rules-note">
              <code>generate_audio</code>
              {lt(COPY.audioNote)}
            </p>

            <h4>{lt(COPY.hAssembly)}</h4>
            <ol className="seedance-rules-list">
              <li>【强制约束：视频画面风格】{lt(COPY.assemblyStyle)}</li>
              <li>【强制约束：音频、字幕与配乐】{lt(COPY.assemblyAudio)}</li>
              {/*
              <li>【强制约束：角色音色】— 角色名 → 参考音频序号</li>
              <li>【强制约束：旁白音色】— 旁白 → 参考音频序号</li>
              */}
              <li>【强制约束：角色形象】— 角色名 → 参考图序号</li>
              <li>【强制约束：场景】— 场景名 → 参考图序号</li>
              <li>【强制约束：道具】— 道具名 → 参考图序号</li>
              <li>
                <strong>{lt(COPY.assemblyBodyLabel)}</strong>
                {lt(COPY.assemblyBody)}
              </li>
            </ol>
          </div>
        ) : null}

        {tab === 'script' ? (
          <div className="seedance-rules-section">
            <h4>{lt(COPY.hDurationTag)}</h4>
            <ul className="seedance-rules-list">
              <li>
                <code>@duration:N</code>
                {fill(COPY.durationTagItem, lt, {
                  min: DRAMA_SEGMENT_DURATION_MIN,
                  max: DRAMA_SEGMENT_DURATION_MAX,
                })}
              </li>
              <li>
                <strong>{lt(COPY.durationTotalLabel)}</strong>
                {fill(COPY.durationNew, lt, {
                  max: FRAGMENT_CONTENT_DURATION_MAX,
                  hard: DRAMA_SHOT_DURATION_HARD_MAX,
                })}
              </li>
              <li>
                <code>@</code>
                {lt(COPY.durationChip)}
              </li>
            </ul>

            <h4>{lt(COPY.hAssetRef)}</h4>
            <ul className="seedance-rules-list">
              <li>
                <code>@asset:123</code>
                {lt(COPY.assetRefItem)}
              </li>
              <li>{lt(COPY.assetRefPanel)}</li>
              <li>{lt(COPY.assetRefVoice)}</li>
            </ul>
            <h4>{lt(COPY.hCue)}</h4>
            <div className="seedance-rules-examples">
              <code>{DRAMA_SUBTITLE_CUE}</code>
              <code>【BGM：低沉史诗，音量低于人声】</code>
              <code>@duration:4</code>
              <code>{VISUAL_PREFIX}空镜：浑浊黄河拍击老石……</code>
              <code>@duration:6</code>
              <code>{DIALOGUE_PREFIX}禹：水患未平，岂能退！</code>
              <code>{DRAMA_NARRATION_PREFIX}千年后，人们仍记得这一战。</code>
            </div>
            <ul className="seedance-rules-list">
              <li>
                <strong>{lt(LABELS.shotSize)}</strong>
                {lt(COPY.cueShotSize)} <code>{VISUAL_PREFIX}</code>
                {lt(COPY.cueForbidden)}
              </li>
              <li>
                <strong>{lt(LABELS.dialogue)}</strong>
                {lt(COPY.cueDialogueShape)}
                <code>{DIALOGUE_PREFIX}</code>
              </li>
              <li>
                <strong>{lt(LABELS.narration)}</strong>
                {lt(COPY.cueNarrationShape)}
                <code>{DRAMA_NARRATION_PREFIX}</code>
                {lt(COPY.cueNarrationTail)}
              </li>
              <li>
                <strong>{lt(LABELS.characterIntro)}</strong>
                {lt(COPY.cueIntroBody)}
              </li>
              <li>
                <strong>{lt(LABELS.bgm)}</strong>
                {lt(COPY.cueBgm)}
              </li>
            </ul>

            <h4>{lt(COPY.hShotSize)}</h4>
            <ul className="seedance-rules-list">
              <li>{lt(COPY.shotSizeTool)}</li>
              <li>{lt(COPY.shotSizeFormula)}</li>
              <li>{lt(COPY.shotSizeSpin)}</li>
            </ul>
          </div>
        ) : null}

        {tab === 'usage' ? (
          <div className="seedance-rules-section">
            <h4>{lt(COPY.hPrecheck)}</h4>
            <ul className="seedance-rules-list">
              <li>{lt(COPY.precheckScript)}</li>
              <li>{lt(COPY.precheckAsset)}</li>
              <li>{lt(COPY.precheckHeader)}</li>
            </ul>

            <h4>{lt(COPY.hQueue)}</h4>
            <ul className="seedance-rules-list">
              <li>{lt(COPY.queueParallel)}</li>
              <li>{lt(COPY.queueEdit)}</li>
              <li>{lt(COPY.queueBatch)}</li>
            </ul>

            <h4>{lt(COPY.hContinuity)}</h4>
            <ul className="seedance-rules-list">
              <li>{lt(COPY.continuityDefault)}</li>
              <li>{lt(COPY.continuityHeader)}</li>
              <li>{lt(COPY.continuityEdit)}</li>
            </ul>

            <h4>{lt(COPY.hVoice)}</h4>
            <ul className="seedance-rules-list">
              <li>{lt(COPY.voiceOff)}</li>
              <li>{lt(COPY.voiceAutoImage)}</li>
            </ul>

            <h4>{lt(COPY.hRestory)}</h4>
            <p className="seedance-rules-note">{lt(COPY.restoryNote)}</p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
