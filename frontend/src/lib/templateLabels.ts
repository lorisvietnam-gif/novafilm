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
 */

import { localized, type LocalizedText } from './localeStrings'

/**
 * Khoá là `template.id` (ASCII, ổn định), KHÔNG phải tên tiếng Trung — tên có thể được
 * admin sửa trong database, còn `id` thì không.
 */
const TEMPLATE_LABELS: Record<
  string,
  { name: LocalizedText; description: LocalizedText }
> = {
  huoke_douyin_hook: {
    name: { zh: '获客·抖音钩子', en: 'Sales video · TikTok hook', vi: 'Thu hút khách · TikTok' },
    description: {
      zh: '竖屏口播节奏：前 3 秒钩子→场景画面→1–2 个可核验体验→到店/下单号召。适合投放获客。',
      en: 'Vertical talking-head rhythm: hook in the first 3 seconds → scene → 1–2 verifiable experiences → call to visit or buy. Built for paid acquisition.',
      vi: 'Nhịp dọng nói trước ảnh dọng: mồi câu 3 giây đầu → cảnh → 1–2 trải nghiệm kiểm chứng được → lời kêu gọi tới cửa hàng hoặc đặt hàng. Hợp chạy quảng cáo thu hút khách.',
    },
  },
  huoke_xhs_recommend: {
    name: { zh: '获客·小红书安利', en: 'Sales video · Xiaohongshu review', vi: 'Thu hút khách · Xiaohongshu' },
    description: {
      zh: '竖屏闺蜜安利结构：钩子标题→第一印象→分点真实体验→推荐给谁。封面信息量高、口语化。',
      en: 'Vertical best-friend recommendation: hook title → first impression → real experiences, point by point → who should try it. Information-dense, conversational cover.',
      vi: 'Cấu trúc giới thiệu kiểu bạn thân, ảnh dọng: tiêu đề mồi câu → ấn tượng đầu tiên → từng trải nghiệm thật → hợp với ai. Ảnh bìa nhiều thông tin, văn phong nói.',
    },
  },
  opensource_showcase: {
    name: { zh: '开源项目展示', en: 'Open source showcase', vi: 'Dự án mã nguồn mở' },
    description: {
      zh: '按项目内容动态规划：人物操作系统界面与真实使用场景，适合开源工具与平台介绍。',
      en: 'Plans itself around the project: a person operating the interface in real use. Suits open source tools and platform intros.',
      vi: 'Tự động bám theo nội dung dự án: người dùng thao tác với giao diện trong bối cảnh thật. Hợp giới thiệu công cụ mã nguồn mở và nền tảng.',
    },
  },
  opensource_live_work: {
    name: { zh: '真人工作场景', en: 'Real workplace footage', vi: 'Làm việc thật' },
    description: {
      zh: '真人写实工位操作：侧脸/过肩操作系统，适合开源工具与产品工作流科普。',
      en: 'Realistic desk work: side or over-the-shoulder view of someone operating the system. Suits open source tools and workflow explainers.',
      vi: 'Thao tác tại bàn làm việc, chân thực: góc nghiêng hoặc qua vai khi người dùng vận hành hệ thống. Hợp giải thích công cụ mã nguồn mở và quy trình sản phẩm.',
    },
  },
  huoke_review_facts: {
    name: { zh: '获客·口碑拆解', en: 'Sales video · Review breakdown', vi: 'Thu hút khách · Đánh giá' },
    description: {
      zh: '横屏客观详实：总体评价→环境/服务→推荐项+理由→性价比→适合谁。帮别人做决策，不抒情。',
      en: 'Landscape, objective and detailed: overall verdict → place and service → recommended items with reasons → value for money → who it suits. Helps people decide, without sentimentality.',
      vi: 'Ảnh ngang, lạnh lùng và đầy chi tiết: đánh giá chung → không gian và dịch vụ → mục nên chọn kèm lý do → giá trị so với giá → hợp với ai. Giúp người khác ra quyết định, không mềm mại.',
    },
  },
  huoke_soft_invite: {
    name: { zh: '获客·熟人轻推', en: 'Sales video · Soft mention', vi: 'Thu hút khách · Nhẹ nhàng' },
    description: {
      zh: '竖屏生活化短片：一句真实感受→一个具体细节→一句轻推荐。克制、不像广告，适合转发给熟人。',
      en: 'Vertical slice-of-life short: one honest impression → one concrete detail → a light recommendation. Restrained, does not read as an ad. Easy to forward to someone you know.',
      vi: 'Video dọng đời thường ngắn: một cảm nhận thật → một chi tiết cụ thể → một lời giới thiệu nhẹ. Tiết chế, không giống quảng cáo, dễ gửi cho người quen.',
    },
  },
  live_street_interview: {
    name: { zh: '真人街访口播', en: 'Street interview on camera', vi: 'Phỏng vấn ngoài trời' },
    description: {
      zh: '街头/通勤场景的真人出镜口播感，适合观点、体验与轻访谈科普。',
      en: 'On-camera talking head in a street or commuting setting. Suits opinions, hands-on experience and light interviews.',
      vi: 'Cảnh người thật nói trước ống kính ngoài đường hoặc trên đường đi làm. Hợp bài nêu quan điểm, trải nghiệm và phỏng vấn nhẹ.',
    },
  },
  live_product_desk: {
    name: { zh: '真人桌面演示', en: 'Real desk demonstration', vi: 'Trình diễn trên bàn' },
    description: {
      zh: '桌面俯拍/斜俯写实：真人双手演示产品或笔记本流程，适合工具评测与教程。',
      en: 'Realistic overhead or angled shot of real hands walking through a product or laptop flow. Suits tool reviews and walkthroughs.',
      vi: 'Góc nhìn từ trên xuống hoặc chéo, chân thực: bàn tay thật trình diễn quy trình sản phẩm hoặc máy tính. Hợp đánh giá công cụ và hướng dẫn.',
    },
  },
  anim_3d: {
    name: { zh: '3D 动画', en: '3D animation', vi: 'Hoạt hình 3D' },
    description: {
      zh: '电影级三维动画质感，圆润造型与柔和体积光，适合科普讲解与故事短片。',
      en: 'Cinematic 3D animation: rounded shapes and soft volumetric light. Suits explainers and narrative shorts.',
      vi: 'Hoạt hình 3D chất điện ảnh: dáng người bo tròn và ánh sáng thể tích dịu dàng. Hợp phần giải thích và phim ngắn kể chuyện.',
    },
  },
  portrait_story: {
    name: { zh: '竖屏图文故事', en: 'Vertical image-and-text story', vi: 'Truyện ảnh dọc' },
    description: {
      zh: '竖屏插画叙事，电影感构图，适合历史人文短片。',
      en: 'Vertical illustrated storytelling with cinematic framing. Suits history and culture shorts.',
      vi: 'Kể chuyện bằng tranh minh hoạ bố cục dọng, chất điện ảnh. Hợp phim ngắn lịch sử và văn hoá.',
    },
  },
  live_cinematic: {
    name: { zh: '真人电影感', en: 'Live-action cinematic', vi: 'Điện ảnh chân thực' },
    description: {
      zh: '真人实拍电影质感，戏剧光影与浅景深，适合叙事短片。',
      en: 'Live-action film quality: dramatic lighting and shallow depth of field. Suits narrative shorts.',
      vi: 'Chất phim quay người thật: ánh sáng tương phản và độ nông trường ảnh nông. Hợp phim ngắn tự sự.',
    },
  },
  live_person: {
    name: { zh: '真人感叙事', en: 'Slice-of-life story', vi: 'Kể chuyện đời thường' },
    description: {
      zh: '生活化真人出镜感，适合人物故事、口播与纪实短片。',
      en: 'Everyday on-camera feel. Suits character stories, talking heads and documentary shorts.',
      vi: 'Cảm giác người thật giữa đời thường. Hợp câu chuyện về nhân vật, dạng nói trước ống kính và phim tài liệu ngắn.',
    },
  },
  photo_realism: {
    name: { zh: '写实摄影', en: 'Realistic photography', vi: 'Nhiếp ảnh chân thực' },
    description: {
      zh: '照片级写实质感，适合产品、风光与纪实科普。',
      en: 'Photo-grade realism. Suits products, landscapes and documentary explainers.',
      vi: 'Chất chân thực như ảnh chụp. Hợp sản phẩm, phong cảnh và phần giải thích kiến thức.',
    },
  },
  film_cinematic: {
    name: { zh: '电影感胶片', en: 'Cinematic film look', vi: 'Chất film điện ảnh' },
    description: {
      zh: '宽银幕胶片质感与戏剧光影，适合叙事短片与氛围故事。',
      en: 'Widescreen film texture with dramatic lighting. Suits narrative shorts and mood pieces.',
      vi: 'Chất film khung rộng cùng ánh sáng tương phản. Hợp phim ngắn tự sự và câu chuyện theo không khí.',
    },
  },
  noir_thriller: {
    name: { zh: '黑色悬疑', en: 'Film noir mystery', vi: 'Trinh thám noir' },
    description: {
      zh: '高对比光影与冷调氛围，适合悬疑、案件与暗夜叙事。',
      en: 'High-contrast lighting and a cold palette. Suits mysteries, cases and night narratives.',
      vi: 'Ánh sáng tương phản mạnh, tông màu lạnh. Hợp trinh thám, vụ án và truyện kể về đêm.',
    },
  },
  vox_papercut: {
    name: { zh: 'Vox剪纸科普', en: 'Paper-cut explainer', vi: 'Kiến thức · Cắt giấy' },
    description: {
      zh: '低饱和扁平剪纸，以人物操作电脑/系统界面为主画面，适合硬核科普与产品讲解。',
      en: 'Flat low-saturation paper cut, centred on a person working at a computer or system interface. Suits in-depth explainers and product walkthroughs.',
      vi: 'Phong cách cắt giấy phẳng, màu trầm, chủ thể là người dùng thao tác máy tính hoặc giao diện hệ thống. Hợp giải thích chuyên sâu và hướng dẫn sản phẩm.',
    },
  },
  docu_warm: {
    name: { zh: '温暖纪实', en: 'Warm documentary', vi: 'Tài liệu ấm áp' },
    description: {
      zh: '纪实插画气质与暖色调，适合人物故事与人文纪录短片。',
      en: 'Documentary illustration feel in warm tones. Suits character stories and human-interest shorts.',
      vi: 'Không khí minh hoạ tài liệu với tông màu ấm. Hợp câu chuyện nhân vật và phim ngắn về con người.',
    },
  },
  kids_flat: {
    name: { zh: '儿童绘本扁平', en: 'Flat picture book', vi: 'Truyện tranh trẻ em' },
    description: {
      zh: '柔和配色与圆润造型，适合儿童科普与故事。',
      en: 'Soft palette and rounded shapes. Suits explainers and stories for children.',
      vi: 'Bảng màu dịu và dáng bo tròn. Hợp phần giải thích và câu chuyện cho trẻ em.',
    },
  },
  soft_anime: {
    name: { zh: '柔光动漫', en: 'Soft-lit anime', vi: 'Hoạt hình ánh sáng dịu' },
    description: {
      zh: '日系柔光赛璐璐，适合青春故事与情感短片。',
      en: 'Japanese soft-lit cel animation. Suits coming-of-age stories and emotional shorts.',
      vi: 'Hoạt hình cel Nhật với ánh sáng dịu. Hợp câu chuyện tuổi trẻ và phim ngắn tình cảm.',
    },
  },
  chalk_whiteboard: {
    name: { zh: '粉笔白板手绘', en: 'Chalk whiteboard drawing', vi: 'Bảng đen vẽ tay' },
    description: {
      zh: '黑板粉笔讲解风，突出人物操作系统/画流程图的课堂演示。',
      en: 'Blackboard and chalk explainer style, centred on a person operating the system or drawing a flow chart. Classroom feel.',
      vi: 'Phong cách giảng bằng bảng đen và phấn, nhấn mạnh người thao tác hệ thống hoặc vẽ sơ đồ quy trình. Cảm giác lớp học.',
    },
  },
  cyber_neon: {
    name: { zh: '赛博霓虹', en: 'Cyber neon', vi: 'Cyberpunk neon' },
    description: {
      zh: '霓虹夜城与未来感，适合科技、都市与科幻话题。',
      en: 'Neon city at night with a futuristic feel. Suits technology, urban and sci-fi topics.',
      vi: 'Thành phố neon về đêm với chất tương lai. Hợp chủ đề công nghệ, đô thị và khoa huyền viễn.',
    },
  },
  epic_fantasy: {
    name: { zh: '奇幻史诗', en: 'Epic fantasy', vi: 'Giả tưởng sử thi' },
    description: {
      zh: '宏大场景与奇幻光影，适合神话、冒险与世界观短片。',
      en: 'Sweeping scenes and fantasy lighting. Suits myths, adventures and world-building shorts.',
      vi: 'Bối cảnh hoành và ánh sáng giả tưởng. Hợp thần thoại, phiêu lưu và phim ngắn xây dựng thế giới.',
    },
  },
  magazine_collage: {
    name: { zh: '杂志拼贴', en: 'Magazine collage', vi: 'Collage tạp chí' },
    description: {
      zh: '剪报拼贴与印刷纹理，适合文化话题与品牌故事。',
      en: 'Clipping collage with print texture. Suits cultural topics and brand stories.',
      vi: 'Collage từ bài báo cắt với bề mặt in ấn. Hợp chủ đề văn hoá và câu chuyện thương hiệu.',
    },
  },
  brand_clean: {
    name: { zh: '极简品牌', en: 'Minimal brand', vi: 'Thương hiệu tối giản' },
    description: {
      zh: '干净色块与强留白，适合产品解说与品牌短片。',
      en: 'Clean colour blocks and generous white space. Suits product explainers and brand shorts.',
      vi: 'Mảng màu gọn và khoảng trắng rộng. Hợp phần giải thích sản phẩm và phim ngắn thương hiệu.',
    },
  },
  pixel_retro: {
    name: { zh: '像素复古科普', en: 'Retro pixel explainer', vi: 'Kiến thức · Pixel cổ điển' },
    description: {
      zh: '8-bit/16-bit 像素风，适合科技史与游戏化讲解。',
      en: '8-bit and 16-bit pixel art. Suits the history of technology and game-like explainers.',
      vi: 'Đồ hoạ pixel 8-bit và 16-bit. Hợp lịch sử công nghệ và phần giải thích theo kiểu trò chơi.',
    },
  },
  retro_vhs: {
    name: { zh: '复古 VHS', en: 'Retro VHS', vi: 'VHS cổ điển' },
    description: {
      zh: '磁带录像与扫描线质感，适合怀旧故事与年代感内容。',
      en: 'Tape footage with scan lines. Suits nostalgic stories and period content.',
      vi: 'Hình ảnh băng cassette với các vạch quét. Hợp câu chuyện hoài niệm và nội dung mang dấu ấn thời.',
    },
  },
  ink_guofeng: {
    name: { zh: '水墨国风', en: 'Ink wash classic', vi: 'Thủy mặc cổ điển' },
    description: {
      zh: '水墨留白与写意笔触，适合历史与文化短故事。',
      en: 'Ink wash, generous white space and free brush strokes. Suits historical and cultural short stories.',
      vi: 'Mực loãng, khoảng trắng rộng và nét bút giói. Hợp truyện ngắn mang tính lịch sử và văn hoá.',
    },
  },
}

/**
 * Tên mẫu theo ngôn ngữ đang dùng.
 *
 * Khoá lạ (mẫu admin vừa thêm, bảng nhãn chưa kịp cập nhật) thì trả về đúng giá trị
 * gốc từ backend — hiển thị tiếng Trung còn hơn hiển thị rỗng.
 */
export function templateNameLabel(template: { id: string; name: string }): string {
  return localized(TEMPLATE_LABELS[template.id]?.name ?? passthrough(template.name))
}

/** Mô tả mẫu theo ngôn ngữ đang dùng; mẫu không có mô tả thì trả chuỗi rỗng. */
export function templateDescriptionLabel(template: { id: string; description?: string }): string {
  const entry = TEMPLATE_LABELS[template.id]
  if (!entry) return template.description || ''
  return localized(entry.description)
}

/** Danh sách id đã có bảng nhãn — dùng để báo cáo mục nào còn thiếu. */
export function labelledTemplateIds(): string[] {
  return Object.keys(TEMPLATE_LABELS)
}

function passthrough(value: string): LocalizedText {
  return { zh: value, en: value, vi: value }
}
