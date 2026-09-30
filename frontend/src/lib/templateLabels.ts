/**
 * Nhãn hiển thị cho dữ liệu template lấy từ backend.
 *
 * Template lưu trong database với `id` ASCII và tên/mô tả tiếng Trung, vì backend đối
 * chiếu `id` và seed lại từ chính những chuỗi đó. **Giá trị đó không được sửa** — chỉ
 * phần hiển thị mới dịch, và dịch ở đây chứ không ở trang, để mọi nơi render tên mẫu
 * (danh sách mẫu, trang tạo dự án, trang phong cách, storyboard, lịch sử) đều dùng
 * chung một bảng và không lệch nhau.
 *
 * Cùng cơ chế với `dramaImageStyles.ts`:
 * - Thiếu **ngôn ngữ** là lỗi kiểu, vì mọi thành viên của `LocalizedText` đều bắt buộc.
 *   Không ngôn ngữ nào lặng lẽ rơi về tiếng Trung.
 * - Thiếu **mục** thì trả về nguyên văn giá trị gốc, chấp nhận được hơn là trả chuỗi
 *   rỗng. Mục nào thiếu được liệt kê trong báo cáo.
 *
 * Bảng là `Record` thuần của `LocalizedText` và chỉ được đọc qua `templateName()` /
 * `templateDescription()`. Cố ý KHÔNG dùng getter và KHÔNG spread các mục này: spread
 * sẽ gọi getter ngay lúc khởi tạo module, đúng loại lỗi đã ghi ở `AGENTS.md` §7.
 */

import { localized, type LocalizedText } from './localeStrings'

/**
 * Khoá là `template.id` (ASCII, ổn định), KHÔNG phải tên tiếng Trung — tên có thể được
 * admin sửa trong database, còn `id` thì không.
 */
const TEMPLATE_LABELS: Record<string, { name: LocalizedText; description: LocalizedText }> = {
  huoke_douyin_hook: {
    name: { zh: '获客·抖音钩子', en: 'Sales · TikTok hook', vi: 'Thu hút khách · Móc TikTok' },
    description: {
      zh: '竖屏口播节奏：前 3 秒钩子→场景画面→1–2 个可核验体验→到店/下单号召。适合投放获客。',
      en: 'Vertical talking-head rhythm: 3-second hook → scene shot → 1–2 checkable experiences → visit or order call to action. Built for paid acquisition.',
      vi: 'Nhịp dẫn dọc: móc 3 giây → cảnh → 1–2 trải nghiệm kiểm chứng được → lời kêu gọi đến cửa hàng hoặc đặt hàng. Phù hợp chạy quảng cáo thu hút.',
    },
  },
  huoke_xhs_recommend: {
    name: { zh: '获客·小红书安利', en: 'Sales · Xiaohongshu share', vi: 'Thu hút khách · Chia sẻ Xiaohongshu' },
    description: {
      zh: '竖屏闺蜜安利结构：钩子标题→第一印象→分点真实体验→推荐给谁。封面信息量高、口语化。',
      en: 'Vertical best-friend recommendation: hook headline → first impression → real experience in points → who should get it. Cover carries a lot of information and reads casually.',
      vi: 'Dọc dọc kiểu bạn thân giới thiệu: tiêu đề móc → ấn tượng đầu tiên → trải nghiệm thật theo điểm → nên giới thiệu cho ai. Ảnh bìa nhiều thông tin, văn phong tự nhiên.',
    },
  },
  opensource_showcase: {
    name: { zh: '开源项目展示', en: 'Open source showcase', vi: 'Giới thiệu dự án mở nguồn' },
    description: {
      zh: '按项目内容动态规划：人物操作系统界面与真实使用场景，适合开源工具与平台介绍。',
      en: 'Plans itself around the project: a person working in the interface plus real usage scenes. Suits open source tools and platform introductions.',
      vi: 'Tự động bám theo nội dung dự án: người dùng thao tác trên giao diện và bối cảnh sử dụng thật. Hợp với công cụ mở nguồn và giới thiệu nền tảng.',
    },
  },
  opensource_live_work: {
    name: { zh: '真人工作场景', en: 'Real person at work', vi: 'Người thật trong công việc' },
    description: {
      zh: '真人写实工位操作：侧脸/过肩操作系统，适合开源工具与产品工作流科普。',
      en: 'Realistic desk work: side profile or over-the-shoulder while using the software. Suits walkthroughs of open source tools and product workflows.',
      vi: 'Thao tác bàn làm việc chân thực: góc nghiêng hoặc qua vai khi dùng phần mềm. Hợp với hướng dẫn công cụ mở nguồn và quy trình sản phẩm.',
    },
  },
  huoke_review_facts: {
    name: { zh: '获客·口碑拆解', en: 'Sales · Review breakdown', vi: 'Thu hút khách · Phân tích đánh giá' },
    description: {
      zh: '横屏客观详实：总体评价→环境/服务→推荐项+理由→性价比→适合谁。帮别人做决策，不抒情。',
      en: 'Landscape and factual: overall rating → place or service → recommended items with reasons → value for money → who it suits. Helps people decide instead of gushing.',
      vi: 'Ngang và khách quan: đánh giá chung → không gian/dịch vụ → mục đề xuất kèm lý do → giá trị xứng đáng → hợp với ai. Giúp người khác ra quyết định, không tình cảm hóa.',
    },
  },
  huoke_soft_invite: {
    name: { zh: '获客·熟人轻推', en: 'Sales · Soft referral', vi: 'Thu hút khách · Giới thiệu nhẹ' },
    description: {
      zh: '竖屏生活化短片：一句真实感受→一个具体细节→一句轻推荐。克制、不像广告，适合转发给熟人。',
      en: 'Vertical everyday short: one honest impression → one concrete detail → one understated recommendation. Restrained, does not read as an ad, easy to forward to friends.',
      vi: 'Dọc ngắn đời thường: một cảm nhận thật → một chi tiết cụ thể → một lời giới thiệu nhẹ nhàng. Tiết chế, không giống quảng cáo, dễ gửi cho người quen.',
    },
  },
  live_street_interview: {
    name: { zh: '真人街访口播', en: 'Street interview to camera', vi: 'Phỏng vấn đường phố' },
    description: {
      zh: '街头/通勤场景的真人出镜口播感，适合观点、体验与轻访谈科普。',
      en: 'On-camera talking head in a street or commuting setting. Suits opinions, experiences and light interview explainers.',
      vi: 'Cảnh người thật nói chuyện trên đường phố hoặc lúc đi làm. Hợp với video giải thích quan điểm, trải nghiệm và phỏng vấn nhẹ.',
    },
  },
  live_product_desk: {
    name: { zh: '真人桌面演示', en: 'Real hands-on desk demo', vi: 'Trình diễn tại bàn làm việc' },
    description: {
      zh: '桌面俯拍/斜俯写实：真人双手演示产品或笔记本流程，适合工具评测与教程。',
      en: 'Overhead or angled realistic desk shot: real hands showing a product or a notebook flow. Suits tool reviews and tutorials.',
      vi: 'Quay từ trên xuống hoặc góc nghiêng chân thực: đôi tay thật trình diễn sản phẩm hoặc quy trình trên giấy. Hợp với đánh giá công cụ và hướng dẫn.',
    },
  },
  anim_3d: {
    name: { zh: '3D 动画', en: '3D animation', vi: 'Hoạt hình 3D' },
    description: {
      zh: '电影级三维动画质感，圆润造型与柔和体积光，适合科普讲解与故事短片。',
      en: 'Cinematic 3D look, rounded shapes and soft volumetric light. Suits explainers and short story films.',
      vi: 'Chất 3D điện ảnh, dáng khối tròn và ánh sáng thể tích dịu. Hợp với video giải thích và phim truyện ngắn.',
    },
  },
  portrait_story: {
    name: { zh: '竖屏图文故事', en: 'Vertical illustrated story', vi: 'Câu chuyện minh hoạ dọc' },
    description: {
      zh: '竖屏插画叙事，电影感构图，适合历史人文短片。',
      en: 'Vertical illustrated storytelling with cinematic composition. Suits history and culture shorts.',
      vi: 'Kể chuyện minh hoạ theo khung dọc, bố cục mang chất điện ảnh. Hợp với phim ngắn lịch sử và văn hoá.',
    },
  },
  live_cinematic: {
    name: { zh: '真人电影感', en: 'Cinematic live action', vi: 'Người thật chất điện ảnh' },
    description: {
      zh: '真人实拍电影质感，戏剧光影与浅景深，适合叙事短片。',
      en: 'Live action shot with a cinematic finish, dramatic light and shallow depth of field. Suits narrative shorts.',
      vi: 'Quay người thật với chất điện ảnh, ánh sáng tương phản và trường độ nông. Hợp với phim tự sự ngắn.',
    },
  },
  live_person: {
    name: { zh: '真人感叙事', en: 'Everyday live action', vi: 'Tự sự đời thường' },
    description: {
      zh: '生活化真人出镜感，适合人物故事、口播与纪实短片。',
      en: 'Natural on-camera presence, everyday. Suits character stories, talking head and documentary shorts.',
      vi: 'Cảm giác người thật xuất hiện tự nhiên, đời thường. Hợp với chuyện về con người, dẫn dắt và phim tài liệu ngắn.',
    },
  },
  photo_realism: {
    name: { zh: '写实摄影', en: 'Realistic photography', vi: 'Ảnh chân thực' },
    description: {
      zh: '照片级写实质感，适合产品、风光与纪实科普。',
      en: 'Photo-grade realism. Suits products, scenery and documentary explainers.',
      vi: 'Chất chân thực như ảnh chụp. Hợp với sản phẩm, phong cảnh và video giải thích kiểu tài liệu.',
    },
  },
  film_cinematic: {
    name: { zh: '电影感胶片', en: 'Cinematic film stock', vi: 'Film chất điện ảnh' },
    description: {
      zh: '宽银幕胶片质感与戏剧光影，适合叙事短片与氛围故事。',
      en: 'Widescreen film texture with dramatic light. Suits narrative shorts and mood pieces.',
      vi: 'Chất film khung rộng cùng ánh sáng tương phản. Hợp với phim tự sự ngắn và truyện theo không khí.',
    },
  },
  noir_thriller: {
    name: { zh: '黑色悬疑', en: 'Noir thriller', vi: 'Trinh thám noir' },
    description: {
      zh: '高对比光影与冷调氛围，适合悬疑、案件与暗夜叙事。',
      en: 'High contrast light and a cool palette. Suits mysteries, cases and night-time narratives.',
      vi: 'Tương phản cao, tông màu lạnh. Hợp với trinh thám, vụ án và truyện kể về đêm.',
    },
  },
  vox_papercut: {
    name: { zh: 'Vox剪纸科普', en: 'Vox papercut explainer', vi: 'Vox giấy cắt giải thích' },
    description: {
      zh: '低饱和扁平剪纸，以人物操作电脑/系统界面为主画面，适合硬核科普与产品讲解。',
      en: 'Flat low-saturation papercut style, built around a person operating a computer or system screen. Suits technical explainers and product walkthroughs.',
      vi: 'Phong cách giấy cắt phẳng, tông màu nhạt, lấy người thao tác máy tính hoặc giao diện hệ thống làm hình ảnh chính. Hợp với giải thích kỹ thuật và giới thiệu sản phẩm.',
    },
  },
  docu_warm: {
    name: { zh: '温暖纪实', en: 'Warm documentary', vi: 'Tài liệu ấm áp' },
    description: {
      zh: '纪实插画气质与暖色调，适合人物故事与人文纪录短片。',
      en: 'Documentary illustration feel with warm tones. Suits character stories and human-interest shorts.',
      vi: 'Khí chất minh hoạ tài liệu, tông màu ấm. Hợp với chuyện về con người và phim nhân văn ngắn.',
    },
  },
  kids_flat: {
    name: { zh: '儿童绘本扁平', en: 'Flat children’s picture book', vi: 'Sách tranh trẻ em phẳng' },
    description: {
      zh: '柔和配色与圆润造型，适合儿童科普与故事。',
      en: 'Soft palette and rounded shapes. Suits explainers and stories for children.',
      vi: 'Bảng màu dịu và dáng khối tròn. Hợp với video giải thích và câu chuyện cho trẻ.',
    },
  },
  soft_anime: {
    name: { zh: '柔光动漫', en: 'Soft-light anime', vi: 'Hoạt hình anime ánh sáng dịu' },
    description: {
      zh: '日系柔光赛璐璐，适合青春故事与情感短片。',
      en: 'Japanese cel shading with soft light. Suits youth stories and emotional shorts.',
      vi: 'Cel-shading Nhật với ánh sáng dịu. Hợp với chuyện thanh xuân và phim cảm xúc ngắn.',
    },
  },
  chalk_whiteboard: {
    name: { zh: '粉笔白板手绘', en: 'Chalk whiteboard', vi: 'Phấn trên bảng trắng' },
    description: {
      zh: '黑板粉笔讲解风，突出人物操作系统/画流程图的课堂演示。',
      en: 'Blackboard and chalk teaching look, built around a person using software or drawing a flow diagram.',
      vi: 'Phong cách giảng trên bảng đen, nổi bật người thao tác phần mềm hoặc vẽ lưu đồ.',
    },
  },
  cyber_neon: {
    name: { zh: '赛博霓虹', en: 'Cyber neon', vi: 'Neon cyberpunk' },
    description: {
      zh: '霓虹夜城与未来感，适合科技、都市与科幻话题。',
      en: 'Neon city nights and a future feel. Suits technology, urban and sci-fi topics.',
      vi: 'Thành phố đêm neon và cảm giác tương lai. Hợp với chủ đề công nghệ, đô thị và khoa huyền viễn.',
    },
  },
  epic_fantasy: {
    name: { zh: '奇幻史诗', en: 'Epic fantasy', vi: 'Giả tưởng sử thi' },
    description: {
      zh: '宏大场景与奇幻光影，适合神话、冒险与世界观短片。',
      en: 'Vast scenes and fantasy light. Suits mythology, adventure and world-building shorts.',
      vi: 'Bối cảnh rộng lớn và ánh sáng giả tưởng. Hợp với thần thoại, phiêu lưu và phim ngắn xây dựng thế giới.',
    },
  },
  magazine_collage: {
    name: { zh: '杂志拼贴', en: 'Magazine collage', vi: 'Collage tạp chí' },
    description: {
      zh: '剪报拼贴与印刷纹理，适合文化话题与品牌故事。',
      en: 'Cut-paper collage and print texture. Suits culture topics and brand stories.',
      vi: 'Collage báo cắt và bề mặt in ấn. Hợp với chủ đề văn hoá và câu chuyện thương hiệu.',
    },
  },
  brand_clean: {
    name: { zh: '极简品牌', en: 'Minimal brand', vi: 'Thương hiệu tối giản' },
    description: {
      zh: '干净色块与强留白，适合产品解说与品牌短片。',
      en: 'Clean colour blocks and generous white space. Suits product explainers and brand films.',
      vi: 'Khối màu gọn và khoảng trắng rộng. Hợp với video giải thích sản phẩm và phim thương hiệu.',
    },
  },
  pixel_retro: {
    name: { zh: '像素复古科普', en: 'Pixel retro explainer', vi: 'Giải thích pixel cổ điển' },
    description: {
      zh: '8-bit/16-bit 像素风，适合科技史与游戏化讲解。',
      en: '8-bit and 16-bit pixel look. Suits the history of technology and game-like walkthroughs.',
      vi: 'Phong cách pixel 8-bit/16-bit. Hợp với lịch sử công nghệ và cách giải thích lấy cảm hứng game.',
    },
  },
  retro_vhs: {
    name: { zh: '复古 VHS', en: 'Retro VHS', vi: 'VHS cổ điển' },
    description: {
      zh: '磁带录像与扫描线质感，适合怀旧故事与年代感内容。',
      en: 'Tape recording texture and scanlines. Suits nostalgic stories and period content.',
      vi: 'Chất băng ghi hình và vạch quét. Hợp với truyện hoài niệm và nội dung mang màu sắc thời đại.',
    },
  },
  ink_guofeng: {
    name: { zh: '水墨国风', en: 'Ink wash', vi: 'Thủy mặc cổ điển' },
    description: {
      zh: '水墨留白与写意笔触，适合历史与文化短故事。',
      en: 'Ink wash with open space and expressive strokes. Suits historical and cultural short stories.',
      vi: 'Thủy mặc, khoảng trắng và nét bút viết ý. Hợp với truyện ngắn lịch sử và văn hoá.',
    },
  },
}

/**
 * Tên mẫu theo ngôn ngữ đang dùng.
 *
 * Khoá lạ (mẫu admin vừa thêm, bảng nhãn chưa kịp cập nhật) thì trả về đúng `fallback`
 * từ backend — hiển thị tiếng Trung còn hơn hiển thị rỗng.
 */
export function templateName(id: string, fallback = ''): string {
  const entry = TEMPLATE_LABELS[id]
  return entry ? localized(entry.name) : fallback
}

/**
 * Mô tả mẫu theo ngôn ngữ đang dùng; mẫu không có mô tả thì trả chuỗi rỗng.
 */
export function templateDescription(id: string, fallback = ''): string {
  const entry = TEMPLATE_LABELS[id]
  if (!entry) return fallback || ''
  return localized(entry.description)
}

/** Danh sách id đã có bảng nhãn — dùng để báo cáo mục nào còn thiếu. */
export function labelledTemplateIds(): string[] {
  return Object.keys(TEMPLATE_LABELS)
}

/** Ids that have a translated label. Used by tests and audits. */
export const TRANSLATED_TEMPLATE_IDS: string[] = Object.keys(TEMPLATE_LABELS)
