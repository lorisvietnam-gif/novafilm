/**
 * Nhãn hiển thị cho **prompt mặc định của mẫu** lấy từ backend.
 *
 * `templateLabels.ts` dịch *tên* và *mô tả* mẫu. File này dịch phần còn lại: ba chuỗi
 * prompt mà `defaultsFromTemplate()` đọc ra — `style_prefix` (tiền tố phong cách),
 * `seedream_config.character_prompt` (mô tả nhân vật) và `seedream_config.extra_prompt`
 * (yêu cầu bổ sung). Chúng hiện ra ở trang storyboard và trang cấu hình phong cách.
 *
 * VÌ SAO PHẢI LÀ BẢNG NHÃN CHỨ KHÔNG SỬA GIÁ TRỊ GỐC
 * Ba chuỗi này không chỉ hiển thị — chúng được gửi thẳng cho **mô hình ảnh** khi sinh
 * cảnh. Đổi chúng trong database là đổi kết quả ảnh. Bảng này chỉ đổi phần người đọc,
 * giá trị gửi cho model vẫn là bản gốc.
 *
 * Cơ chế "giống mẫu thì để trống" ở `StoryboardPage.saveProjectPrompts()` và
 * `StyleConfigPage.generate()` so **hiển thị** với **mặc định của mẫu** để quyết định có
 * ghi đè lớp vào dự án hay không. Vì vậy cả hai vế phải đi qua cùng một hàm
 * `defaultsFromTemplate()`: nếu một vế là tiếng Việt còn vế kia là tiếng Trung thì so
 * sánh luôn sai và bản dịch bị ghi đè vào database, đổi cả prompt sinh ảnh. Vì vậy
 * bảng này được đọc **bên trong** `defaultsFromTemplate()` chứ không phải ở từng trang.
 *
 * Cùng cơ chế với `templateLabels.ts`:
 * - Thiếu **mục** thì trả nguyên văn giá trị gốc từ backend, chấp nhận được hơn là trả
 *   rỗng. Mục nào thiếu được liệt kê trong báo cáo.
 * - Bảng là `Record` thuần và chỉ đọc qua ba hàm bên dưới. Cố ý KHÔNG dùng getter và
 *   KHÔNG spread các mục này: spread gọi getter lúc khởi tạo module, đúng loại lỗi
 *   ghi ở `AGENTS.md` §7.
 */

import { localized, type LocalizedText } from './localeStrings'

/** Mỗi mục là LocalizedText tùy chọn: mẫu nào không có prompt thì không cần khoá đó. */
type TemplatePromptLabels = {
  stylePrefix?: LocalizedText
  characterPrompt?: LocalizedText
  extraPrompt?: LocalizedText
}

/**
 * Khoá là `template.id` (ASCII, ổn định) — cùng khoá và cùng lý do như `templateLabels.ts`.
 * Mỗi mục `zh` là **nguyên văn** giá trị backend đang trả về, nên khi chạy ở `zh` thì
 * hành vi y hệt trước khi có bảng này.
 */
const TEMPLATE_PROMPT_LABELS: Record<string, TemplatePromptLabels> = {
  huoke_douyin_hook: {
    stylePrefix: {
      zh: '竖屏获客短视频静帧：门店外立面、产品特写、服务动作或操作界面交替出现，强对比自然光，主体清晰、留白便于叠大字，电影级产品演示质感，非卡通非动漫',
      en: 'Vertical acquisition short-video stills: store exterior, product close-ups, service actions and operation screens alternate. High-contrast natural light, clear subject, open space for large overlay text, cinematic product-demo finish. Not cartoon, not anime.',
      vi: 'Ảnh tĩnh dọc cho video ngắn thu hút khách: xen kẽ mặt tiền cửa hàng, cận cảnh sản phẩm, thao tác phục vụ và màn hình thao tác. Ánh sáng tự nhiên tương phản mạnh, chủ thể rõ, chừa khoảng trắng để chồng chữ lớn, chất trình diễn sản phẩm chất điện ảnh. Không hoạt hình, không anime.',
    },
    extraPrompt: {
      zh: '竖屏主体清晰，顶部与底部留白叠字；各镜构图必须不同；画面内不要出现文字',
      en: 'Vertical frame, clear subject, top and bottom left open for overlay text; every shot must use a different composition; no text in frame.',
      vi: 'Khung dọc, chủ thể rõ, chừa trên và dưới để chồng chữ; mỗi cảnh phải khác bố cục; không có chữ trong hình.',
    },
  },
  huoke_xhs_recommend: {
    stylePrefix: {
      zh: '竖屏生活安利静帧：明亮自然光，浅色桌面或门店角落，产品/空间细节清楚，杂志封面气质、留白分层，适合叠标题，非浓妆棚拍、非卡通',
      en: 'Vertical lifestyle recommendation stills: bright natural light, a pale desk or shop corner, product and space details legible, magazine-cover feel with layered white space. Good for headline overlays. Not heavy-makeup studio shots, not cartoon.',
      vi: 'Ảnh tĩnh dọc kiểu giới thiệu đời thường: ánh sáng tự nhiên sáng, bàn màu nhạt hoặc góc cửa hàng, chi tiết sản phẩm và không gian rõ, khí chất bìa tạp chí với khoảng trắng phân lớp. Hợp chồng tiêu đề. Không phải ảnh chụp studio trang điểm đậm, không phải hoạt hình.',
    },
    extraPrompt: {
      zh: '明亮竖屏，顶部大留白叠标题，画面内不要出现文字，各镜场景不同',
      en: 'Bright vertical frame, wide white space at the top for a headline, no text in frame, a different setting for each shot.',
      vi: 'Khung dọc sáng, chừa trên rộng để chồng tiêu đề, không có chữ trong hình, mỗi cảnh một bối cảnh khác nhau.',
    },
  },
  opensource_showcase: {
    stylePrefix: {
      zh: '高品质产品演示静帧：人物在真实工位前操作软件/文档站/工作台，手部点击与屏幕界面清晰，排版克制、信息层级清楚，材质与配色由内容决定（浅色SaaS、纸感文档、深色IDE、终端均可），电影级产品演示质感，干净留白便于叠字，非任务清单界面',
      en: 'High-quality product demo stills: a person working at a real desk, operating software, a docs site or a work console. Hand clicks and the screen interface stay legible. Restrained layout with a clear information hierarchy. Materials and palette follow the content — light SaaS, paper-like docs, dark IDE or terminal all work. Cinematic product-demo finish, clean white space for overlay text. Not a to-do list interface.',
      vi: 'Ảnh tĩnh trình diễn sản phẩm chất lượng cao: người dùng ngồi tại bàn làm việc thật, thao tác phần mềm, trang tài liệu hay bảng điều khiển. Cử chỉ bấm và giao diện màn hình vẫn đọc rõ. Bố cục tiết chế với thứ bậc thông tin rõ ràng. Vật liệu và bảng màu theo nội dung — SaaS màu nhạt, tài liệu giấy, IDE tối hay terminal đều được. Chất trình diễn sản phẩm chất điện ảnh, khoảng trắng gọn để chồng chữ. Không phải giao diện danh sách việc cần làm.',
    },
    characterPrompt: {
      zh: '产品演示操作员：侧脸或过肩视角，坐在工位前操作笔记本电脑或双屏，商务休闲着装，手部与屏幕为视觉重点，五官不必抢戏，全片气质统一',
      en: 'Product demo operator: side profile or over-the-shoulder, seated at a desk with a laptop or dual monitors, business-casual clothing. Hands and screen carry the focus; facial features need not compete. One consistent look across the whole piece.',
      vi: 'Người thao tác trình diễn sản phẩm: góc nghiêng hoặc qua vai, ngồi tại bàn với máy tính xách tay hoặc hai màn hình, mặc trang phục công sở giản dị. Tay và màn hình là điểm nhấn thị giác; nét mặt không cần nổi bật. Giữ một dáng dấp xuyên suốt.',
    },
    extraPrompt: {
      zh: '主体为人操作系统界面，手部点击可读，禁止霓虹蓝赛博大屏；顶部与底部留白便于叠大字，画面内不要出现任何文字；本镜布局与操作动作须与其他镜头明显不同',
      en: 'Subject is a person operating a system interface, hand clicks legible. No neon-blue cyberpunk walls. Top and bottom left open for large overlay text, no text of any kind in frame. This shot’s layout and action must differ clearly from the others.',
      vi: 'Chủ thể là người thao tác giao diện hệ thống, cử chỉ bấm đọc rõ. Không dùng vách neon xanh kiểu cyberpunk. Chừa trên và dưới để chồng chữ lớn, không có bất kỳ chữ nào trong hình. Bố cục và thao tác của cảnh này phải khác rõ các cảnh khác.',
    },
  },
  opensource_live_work: {
    stylePrefix: {
      zh: '真人写实摄影，真实办公室工位，侧脸或过肩视角操作笔记本电脑/双屏，手部点击与屏幕界面清晰，自然窗光与显示器补光，商务休闲着装，皮肤与材质真实，非卡通非动漫，干净留白便于叠字',
      en: 'Real live-action photography in a genuine office workspace, side profile or over-the-shoulder while operating a laptop or dual monitors. Hand clicks and the screen interface stay legible. Natural window light with monitor fill. Business-casual clothing, realistic skin and materials. Not cartoon, not anime. Clean white space for overlay text.',
      vi: 'Ảnh chụp người thật chân thực tại văn phòng, góc nghiêng hoặc qua vai khi thao tác máy tính xách tay hoặc hai màn hình. Cử chỉ bấm và giao diện màn hình vẫn đọc rõ. Ánh sáng cửa sổ tự nhiên có bù từ màn hình. Mặc trang phục công sở giản dị, da và vật liệu chân thực. Không hoạt hình, không anime. Khoảng trắng gọn để chồng chữ.',
    },
    characterPrompt: {
      zh: '写实产品演示操作员：侧脸或过肩，坐在工位前操作笔记本或双屏，商务休闲着装，手部与屏幕为视觉重点，五官不抢戏，气质全片统一',
      en: 'Realistic product demo operator: side profile or over-the-shoulder, seated at a desk with a laptop or dual monitors, business-casual clothing. Hands and screen carry the focus; facial features do not compete. One consistent look across the whole piece.',
      vi: 'Người thao tác trình diễn sản phẩm chân thực: góc nghiêng hoặc qua vai, ngồi tại bàn với máy tính xách tay hoặc hai màn hình, mặc trang phục công sở giản dị. Tay và màn hình là điểm nhấn thị giác; nét mặt không nổi bật. Giữ một dáng dấp xuyên suốt.',
    },
    extraPrompt: {
      zh: '真人写实工位，手部点击可读，界面类型随内容变化；禁止正脸大特写与霓虹赛博大屏；画面内不要出现文字',
      en: 'Realistic live-action desk work, hand clicks legible, interface type follows the content. No full-face close-ups and no neon cyberpunk walls. No text in frame.',
      vi: 'Bàn làm việc người thật chân thực, cử chỉ bấm đọc rõ, loại giao diện theo nội dung. Không cận cảnh chính diện và không vách neon cyberpunk. Không có chữ trong hình.',
    },
  },
  huoke_review_facts: {
    stylePrefix: {
      zh: '干净讲解静帧：浅色桌面或门店信息分区，产品/空间/价目氛围（无可读文字），信息层级清楚、光线均匀，纪录片式克制，非卡通非霓虹',
      en: 'Clean explainer stills: a pale desk or a zoned shop interior, a product, space and price-list feel with no readable text. Clear information hierarchy, even light, documentary restraint. Not cartoon, not neon.',
      vi: 'Ảnh tĩnh phần giải thích gọn gàng: bàn màu nhạt hoặc không gian cửa hàng chia vùng, cảm giác về sản phẩm, không gian và bảng giá (không có chữ đọc được). Thứ bậc thông tin rõ, ánh sáng đều, tiết chế kiểu tài liệu. Không hoạt hình, không neon.',
    },
    extraPrompt: {
      zh: '横屏讲解构图，左右或上下留白叠字，画面内不要出现文字，各镜明显不同',
      en: 'Landscape explainer composition, open left-right or top-bottom for overlay text, no text in frame, each shot clearly different.',
      vi: 'Bố cục giải thích ngang, chừa hai bên hoặc trên dưới để chồng chữ, không có chữ trong hình, mỗi cảnh khác biệt rõ.',
    },
  },
  huoke_soft_invite: {
    stylePrefix: {
      zh: '竖屏生活纪实静帧：窗光、街角、桌面一角或门店日常，暖色克制，真实材质与皮肤，像随手拍的一张，非棚拍硬广、非卡通',
      en: 'Vertical lifestyle documentary stills: window light, a street corner, a corner of a desk or an ordinary shop day. Restrained warm tones, real materials and skin, the feel of a casual snapshot. Not a hard-sell studio shot, not cartoon.',
      vi: 'Ảnh tĩnh tài liệu đời thường khung dọc: ánh sáng cửa sổ, góc phố, một góc bàn hay ngày thường ở cửa hàng. Tông ấm tiết chế, vật liệu và làn da thật, cảm giác như một tấm ảnh chụp thoáng qua. Không phải ảnh quảng cáo cứng chụp studio, không phải hoạt hình.',
    },
    characterPrompt: {
      zh: '生活感路人视角，可露侧脸或只出手部与场景，着装日常，全片气质统一',
      en: 'Everyday passer-by perspective, showing a side profile or only hands against the scene, ordinary clothing, one consistent look across the whole piece.',
      vi: 'Góc nhìn người qua đường, có thể lộ mặt nghiêng hoặc chỉ thấy tay cùng bối cảnh, trang phục đời thường, giữ một dáng dấp xuyên suốt.',
    },
    extraPrompt: {
      zh: '暖色窗光，竖屏生活感，顶部可留白，画面内不要出现文字',
      en: 'Warm window light, vertical everyday feel, room at the top for white space, no text in frame.',
      vi: 'Ánh sáng cửa sổ ấm, cảm giác đời thường khung dọc, chừa khoảng trắng ở phía trên, không có chữ trong hình.',
    },
  },
  live_street_interview: {
    stylePrefix: {
      zh: '真人纪实街访摄影，自然光与轻微手持感，城市街道或通勤场景，真实皮肤与环境噪音感克制，非棚拍浓妆，非卡通非动漫',
      en: 'Live-action documentary street-interview photography, natural light with a slight handheld feel, a city street or commuting setting, real skin with restrained ambient noise. Not studio heavy makeup, not cartoon, not anime.',
      vi: 'Ảnh chụp phỏng vấn đường phố tài liệu người thật, ánh sáng tự nhiên với chút cảm giác cầm tay, phố đô thị hoặc cảnh đi làm, làn da thật với độ nhiễu môi trường vừa phải. Không phải trang điểm đậm chụp studio, không phải hoạt hình, không phải anime.',
    },
    characterPrompt: {
      zh: '真人街访主角：年龄气质、发型服装日常感固定，自然表情，全片同一人',
      en: 'Street-interview subject: age and demeanour, hair and clothing stay fixed and everyday. Natural expression, the same person across the whole piece.',
      vi: 'Nhân vật phỏng vấn đường phố: độ tuổi và thần thái, kiểu tóc và trang phục giữ cố định, đời thường. Biểu cảm tự nhiên, cùng một người xuyên suốt.',
    },
    extraPrompt: {
      zh: '自然光街景或通勤场景，竖屏主体清晰，顶部可留白叠字',
      en: 'Natural-light street or commuting setting, vertical frame with a clear subject, room at the top for overlay text.',
      vi: 'Phố hoặc cảnh đi làm dưới ánh sáng tự nhiên, khung dọc với chủ thể rõ, chừa phía trên để chồng chữ.',
    },
  },
  live_product_desk: {
    stylePrefix: {
      zh: '真人桌面产品演示摄影，斜俯或过肩，木质/浅色桌面，笔记本与手部清晰，柔和棚灯或窗光，材质真实，非卡通非插画',
      en: 'Live-action desk product-demo photography, angled overhead or over-the-shoulder, a wood or pale desk surface, laptop and hands clearly readable, soft studio light or window light, real materials. Not cartoon, not illustration.',
      vi: 'Ảnh chụp trình diễn sản phẩm tại bàn người thật, góc nghiêng từ trên hoặc qua vai, mặt bàn gỗ hoặc màu nhạt, máy tính và đôi tay rõ nét, đèn studio dịu hoặc ánh sáng cửa sổ, vật liệu thật. Không hoạt hình, không tranh vẽ.',
    },
    characterPrompt: {
      zh: '写实双手与小臂为主，可露侧脸；着装简洁，全片气质统一',
      en: 'Realistic hands and forearms carry the frame, with an optional side profile. Simple clothing, one consistent look across the whole piece.',
      vi: 'Đôi tay và cẳng tay chân thực là chủ đạo, có thể lộ mặt nghiêng. Trang phục đơn giản, giữ một dáng dấp xuyên suốt.',
    },
    extraPrompt: {
      zh: '桌面斜俯，手部与产品/屏幕清晰，画面内无文字',
      en: 'Angled overhead desk shot, hands and product or screen clearly readable, no text in frame.',
      vi: 'Góc nghiêng từ trên xuống bàn làm việc, tay và sản phẩm hoặc màn hình rõ nét, không có chữ trong hình.',
    },
  },
  anim_3d: {
    stylePrefix: {
      zh: '电影级三维动画渲染，皮克斯/梦工厂气质，圆润造型与清晰轮廓，柔和体积光与次表面散射，干净材质与饱和配色，浅景深，非写实摄影、非日系赛璐璐平面、非剪纸扁平',
      en: 'Cinematic 3D animation render, a Pixar or DreamWorks feel, rounded shapes and clean silhouettes, soft volumetric light with subsurface scattering, clean materials and a saturated palette, shallow depth of field. Not photorealistic, not flat Japanese cel shading, not flat papercut.',
      vi: 'Dựng 3D hoạt hình chất điện ảnh, khí chất Pixar hoặc DreamWorks, dáng khối tròn và đường viền rõ, ánh sáng thể tích dịu kèm tán xạ bề mặt, vật liệu gọn và bảng màu bão hoà, trường độ nông. Không chụp chân thực, không phẳng cel-shading Nhật, không phẳng giấy cắt.',
    },
    characterPrompt: {
      zh: '固定 3D 动画角色：圆润比例、简洁五官、识别度高的发型发色与服装配色，塑料感柔和皮肤与布料材质，全片同一人物设定',
      en: 'Fixed 3D animated character: rounded proportions, simple features, a distinctive hairstyle, hair colour and clothing palette, soft plastic-feel skin and fabric. One character design across the whole piece.',
      vi: 'Nhân vật hoạt hình 3D cố định: tỉ lệ tròn, nét mặt đơn giản, kiểu tóc cùng màu tóc và bảng màu trang phục dễ nhận, da và vật liệu vải mềm mại cảm giác nhựa. Giữ một thiết kế nhân vật xuyên suốt.',
    },
    extraPrompt: {
      zh: '三维渲染体积光，干净材质，饱和但不刺眼，主体清晰，画面内不要出现文字；可留白便于叠字',
      en: 'Volumetric light in the 3D render, clean materials, saturated but not harsh, clear subject, no text in frame. Leave white space for overlay text.',
      vi: 'Ánh sáng thể tích trong bản dựng 3D, vật liệu gọn, màu bão hoà nhưng không chói, chủ thể rõ, không có chữ trong hình. Có thể chừa khoảng trắng để chồng chữ.',
    },
  },
  portrait_story: {
    stylePrefix: {
      zh: '统一二维概念插画，细腻光影与电影感构图，非写实摄影、非日系赛璐璐动漫，竖屏主体偏中下，顶部留白便于叠字，画面干净无文字',
      en: 'Consistent 2D concept illustration, delicate light and shadow, cinematic composition. Not photorealistic, not Japanese cel-shaded anime. Vertical frame with the subject slightly low, open space at the top for overlay text, a clean image with no text.',
      vi: 'Minh hoạ phong cách 2D thống nhất, đổ bóng tinh tế, bố cục chất điện ảnh. Không chụp chân thực, không anime cel-shading Nhật. Khung dọc với chủ thể hơi thấp, chừa khoảng trên để chồng chữ, hình sạch không chữ.',
    },
    characterPrompt: {
      zh: '故事主角外形固定：年龄感、发型发色、服装配色与辨识物全片一致，细腻插画五官，非真人照片',
      en: 'Story protagonist with a fixed look: perceived age, hairstyle, hair colour, clothing palette and signature detail stay consistent throughout. Finely drawn illustrated features, not a real photograph.',
      vi: 'Nhân vật chính có ngoại hình cố định: cảm giác tuổi, kiểu tóc, màu tóc, bảng màu trang phục và đặc điểm nhận dạng giữ nhất quán xuyên suốt. Nét mặt minh hoạ tinh tế, không phải ảnh chụp người thật.',
    },
    extraPrompt: {
      zh: '竖屏构图，主体偏中下，顶部约1/4留白，电影感光影，画面内无文字',
      en: 'Vertical composition, subject slightly low, about a quarter of the top left as white space, cinematic light and shadow, no text in frame.',
      vi: 'Bố cục dọc, chủ thể hơi thấp, chừa khoảng 1/4 phía trên làm khoảng trắng, đổ bóng chất điện ảnh, không có chữ trong hình.',
    },
  },
  live_cinematic: {
    stylePrefix: {
      zh: '真人电影感摄影，电影级打光与浅景深，胶片质感与轻微颗粒，青橙调色，写实皮肤与真实材质，宽银幕构图，非卡通非动漫',
      en: 'Live-action cinematic photography, film-grade lighting and shallow depth of field, film texture with light grain, a teal-and-orange grade, realistic skin and real materials, widescreen composition. Not cartoon, not anime.',
      vi: 'Ảnh chụp người thật chất điện ảnh, ánh sáng cấp điện ảnh và trường độ nông, chất film kèm hạt nhẹ, tông xanh lam-vàng, da và vật liệu chân thực, bố cục khung rộng. Không hoạt hình, không anime.',
    },
    characterPrompt: {
      zh: '真人演员外形固定：年龄、发型发色、面部特征、服装全片一致，写实皮肤质感',
      en: 'Live-action performer with a fixed look: age, hairstyle, hair colour, facial features and clothing stay consistent throughout, with realistic skin texture.',
      vi: 'Diễn viên người thật có ngoại hình cố định: tuổi, kiểu tóc, màu tóc, nét mặt và trang phục giữ nhất quán xuyên suốt, với chất da chân thực.',
    },
    extraPrompt: {
      zh: '电影打光、浅景深、胶片颗粒，真实场景材质',
      en: 'Cinematic lighting, shallow depth of field, film grain, real location materials.',
      vi: 'Ánh sáng điện ảnh, trường độ nông, hạt film, vật liệu bối cảnh thật.',
    },
  },
  live_person: {
    stylePrefix: {
      zh: '真人感生活摄影，自然光与柔和环境光，真实人物五官与皮肤质感，纪实构图，非棚拍浓妆，非卡通非动漫',
      en: 'Everyday live-action photography, natural light with soft ambient fill, real facial features and skin texture, documentary composition. Not studio heavy makeup, not cartoon, not anime.',
      vi: 'Ảnh chụp đời thường cảm giác người thật, ánh sáng tự nhiên pha thêm ánh sáng môi trường dịu, nét mặt và chất da thật, bố cục tài liệu. Không phải trang điểm đậm chụp studio, không phải hoạt hình, không phải anime.',
    },
    characterPrompt: {
      zh: '真人出镜主角：年龄气质、发型发色、服装日常感固定，自然表情，全片同一人',
      en: 'On-camera subject: age and demeanour, hairstyle, hair colour and everyday clothing stay fixed. Natural expression, the same person across the whole piece.',
      vi: 'Nhân vật xuất hiện trước ống kính: tuổi và thần thái, kiểu tóc, màu tóc và trang phục đời thường giữ cố định. Biểu cảm tự nhiên, cùng một người xuyên suốt.',
    },
    extraPrompt: {
      zh: '自然光、生活场景、竖屏主体清晰，顶部可留白叠字',
      en: 'Natural light, everyday setting, vertical frame with a clear subject, room at the top for overlay text.',
      vi: 'Ánh sáng tự nhiên, bối cảnh đời thường, khung dọc với chủ thể rõ, chừa phía trên để chồng chữ.',
    },
  },
  photo_realism: {
    stylePrefix: {
      zh: '照片级写实摄影，清晰细节与真实材质，自然色彩，高动态范围，微距或风光皆可，非卡通非插画非动漫',
      en: 'Photo-grade realism, crisp detail and real materials, natural colour, high dynamic range. Macro or landscape both work. Not cartoon, not illustration, not anime.',
      vi: 'Chân thực cấp ảnh chụp, chi tiết sắc nét và vật liệu thật, màu tự nhiên, dải động cao. Cận cảnh macro hay phong cảnh đều được. Không hoạt hình, không tranh vẽ, không anime.',
    },
    characterPrompt: {
      zh: '若出现人物：写实五官与发型服装固定；若无人物则专注真实场景与材质',
      en: 'If a person appears: realistic features, with hair and clothing fixed. If no person appears, focus on the real setting and materials.',
      vi: 'Nếu có người xuất hiện: nét mặt chân thực, kiểu tóc và trang phục cố định. Nếu không có người, tập trung vào bối cảnh và vật liệu thật.',
    },
    extraPrompt: {
      zh: '照片级细节、真实材质、自然色彩，清晰主体',
      en: 'Photo-grade detail, real materials, natural colour, a clear subject.',
      vi: 'Chi tiết cấp ảnh chụp, vật liệu thật, màu tự nhiên, chủ thể rõ nét.',
    },
  },
  film_cinematic: {
    stylePrefix: {
      zh: '电影感概念插画，宽银幕构图，胶片颗粒与轻微暗角，戏剧光影（侧光/逆光），青橙调色倾向，浅景深氛围，非写实摄影、非赛璐璐动漫',
      en: 'Cinematic concept illustration, widescreen composition, film grain and a slight vignette, dramatic side or back light, a teal-and-orange leaning grade, shallow-focus atmosphere. Not photorealistic, not cel-shaded anime.',
      vi: 'Minh hoạ phong cách chất điện ảnh, bố cục khung rộng, hạt film và tối viền nhẹ, ánh sáng bên hoặc ngược tạo tương phản, tông nghiêng xanh lam-vàng, không khí trường độ nông. Không chụp chân thực, không anime cel-shading.',
    },
    characterPrompt: {
      zh: '电影感插画主角，明确年龄与发型发色，服装轮廓与辨识物固定，面部细节适中非照片，全片同一人设',
      en: 'Cinematic illustration protagonist with a clear age, hairstyle and hair colour, a fixed clothing silhouette and signature detail, a moderately detailed face rather than a photograph. One character design across the whole piece.',
      vi: 'Nhân vật chính minh hoạ chất điện ảnh, có tuổi rõ, kiểu tóc và màu tóc, dáng trang phục cùng đặc điểm nhận dạng cố định, chi tiết khuôn mặt vừa phải chứ không như ảnh chụp. Giữ một thiết kế nhân vật xuyên suốt.',
    },
    extraPrompt: {
      zh: '胶片颗粒、暗角、戏剧光影，青橙氛围，宽银幕主体明确',
      en: 'Film grain, vignette, dramatic light, a teal-and-orange atmosphere, a clear widescreen subject.',
      vi: 'Hạt film, tối viền, ánh sáng tương phản, không khí xanh lam-vàng, chủ thể khung rộng rõ ràng.',
    },
  },
  noir_thriller: {
    stylePrefix: {
      zh: '黑色电影概念插画，高对比明暗交界，冷青灰与少量暖光点缀，雨夜或室内台灯氛围，剪影与侧脸，非写实摄影',
      en: 'Noir concept illustration, high contrast between light and dark, a cool teal-grey with a few warm accents, a rainy night or a desk-lamp interior, silhouettes and side profiles. Not photorealistic.',
      vi: 'Minh hoạ phong cách noir, tương phản cao giữa sáng và tối, tông xám lạnh pha chút điểm ấm, đêm mưa hoặc không gian trong nhà dưới đèn bàn, bóng đổ và mặt nghiêng. Không chụp chân thực.',
    },
    characterPrompt: {
      zh: 'Noir 风插画角色，轮廓清晰，大衣或标志性剪影，面部少光，外形全片一致',
      en: 'Noir illustration character with a clear silhouette, a coat or a signature outline, the face kept mostly in shadow, and one consistent look throughout.',
      vi: 'Nhân vật minh hoạ noir với đường viền rõ, áo khoác hoặc dáng đặc trưng, khuôn mặt phần lớn chìm trong bóng, ngoại hình nhất quán xuyên suốt.',
    },
    extraPrompt: {
      zh: '高对比阴影、冷调、雨夜或台灯，强构图张力',
      en: 'High-contrast shadows, a cool palette, a rainy night or a desk lamp, strong compositional tension.',
      vi: 'Bóng tối tương phản cao, tông lạnh, đêm mưa hoặc đèn bàn, căng thẳng bố cục mạnh.',
    },
  },
  vox_papercut: {
    stylePrefix: {
      zh: 'Vox剪纸扁平插画，层叠剪纸边缘，低饱和，干净剪影，科普解说片气质；画面以人物操作电脑或业务系统为主：工位前操作、手指点击界面、多屏监控、配置参数、流程演示，屏幕与手部动作清晰，信息图表为辅',
      en: 'Vox-style flat papercut illustration, layered cut-paper edges, low saturation, clean silhouettes, the feel of an explainer documentary. The frame centres on a person operating a computer or business system: working at a desk, fingers clicking the interface, monitoring several screens, configuring settings, walking through a flow. Screen content and hand actions stay readable, with simple information graphics as support.',
      vi: 'Minh hoạ phẳng kiểu giấy cắt phong cách Vox, mép giấy xếp lớp, bão hoà thấp, bóng đổ gọn, khí chất phim giải thích kiểu tài liệu. Khung hình lấy người thao tác máy tính hoặc hệ thống nghiệp vụ làm chính: ngồi tại bàn, ngón tay bấm giao diện, theo dõi nhiều màn hình, cấu hình tham số, trình bày quy trình. Nội dung màn hình và cử chỉ tay vẫn đọc rõ, có thêm biểu đồ thông tin đơn giản hỗ trợ.',
    },
    characterPrompt: {
      zh: '固定剪纸操作员：简洁人形剪影、低细节面部、工装或休闲色块服装固定，常坐工位前操作笔记本电脑或双屏控制台，发型与配色全片一致',
      en: 'Fixed papercut operator: a simple human silhouette, a low-detail face, fixed workwear or casual colour-block clothing, usually seated at a desk with a laptop or dual-screen console, hair and palette consistent throughout.',
      vi: 'Người thao tác giấy cắt cố định: bóng đổ hình người đơn giản, khuôn mặt ít chi tiết, trang phục công sở hoặc khối màu đời thường cố định, thường ngồi tại bàn với máy tính xách tay hoặc bảng điều khiển hai màn hình, kiểu tóc và bảng màu nhất quán xuyên suốt.',
    },
    extraPrompt: {
      zh: '主体为人操作电脑/系统界面，屏幕区块与点击手势可读，层叠纸片边缘清晰，低饱和，单镜一个视觉焦点，避免写实皮肤',
      en: 'Subject is a person operating a computer or system interface, screen blocks and click gestures readable, layered paper edges crisp, low saturation, one visual focus per shot, avoid photorealistic skin.',
      vi: 'Chủ thể là người thao tác máy tính hoặc giao diện hệ thống, khối màn hình và cử chỉ bấm đọc rõ, mép giấy xếp lớp sắc nét, bão hoà thấp, mỗi cảnh chỉ một điểm nhấn thị giác, tránh da chụp chân thực.',
    },
  },
  docu_warm: {
    stylePrefix: {
      zh: '温暖纪实概念插画，自然光感，柔和暖棕与米白，生活场景细节，纪录片构图，非写实照片、非动漫赛璐璐',
      en: 'Warm documentary concept illustration, a natural-light feel, soft warm brown and off-white, everyday setting detail, documentary composition. Not a photorealistic image, not cel-shaded anime.',
      vi: 'Minh hoạ phong cách tài liệu ấm áp, cảm giác ánh sáng tự nhiên, nâu ấm và trắng ngà dịu, chi tiết bối cảnh đời thường, bố cục tài liệu. Không phải ảnh chụp chân thực, không phải anime cel-shading.',
    },
    characterPrompt: {
      zh: '纪实插画人物，生活化发型服装，亲切五官，年龄感明确，全片同一人设',
      en: 'Documentary illustration figure with everyday hair and clothing, friendly features, a clear sense of age. One character design across the whole piece.',
      vi: 'Nhân vật minh hoạ tài liệu với kiểu tóc và trang phục đời thường, nét mặt thân thiện, cảm giác tuổi rõ ràng. Giữ một thiết kế nhân vật xuyên suốt.',
    },
    extraPrompt: {
      zh: '暖色自然光，生活场景，纪录片式构图，柔和颗粒',
      en: 'Warm natural light, an everyday setting, documentary composition, soft grain.',
      vi: 'Ánh sáng tự nhiên ấm, bối cảnh đời thường, bố cục kiểu tài liệu, hạt dịu.',
    },
  },
  kids_flat: {
    stylePrefix: {
      zh: '儿童绘本扁平插画，柔和粉彩，圆润造型，友好角色，简洁背景',
      en: 'Flat children’s picture-book illustration, soft pastels, rounded shapes, friendly characters, simple backgrounds.',
      vi: 'Minh hoạ phẳng kiểu sách tranh trẻ em, màu pastel dịu, dáng khối tròn, nhân vật thân thiện, nền đơn giản.',
    },
    characterPrompt: {
      zh: '圆润可爱卡通角色，大眼睛简化五官，柔和配色服装，友好表情，全片同一角色外形',
      en: 'Rounded, cute cartoon character, large eyes and simplified features, a soft palette and clothing, friendly expression, the same character shape throughout.',
      vi: 'Nhân vật hoạt hình tròn xinh, mắt to và nét mặt đơn giản, trang phục và bảng màu dịu, biểu cảm thân thiện, cùng một dáng nhân vật xuyên suốt.',
    },
    extraPrompt: {
      zh: '粉彩柔光，背景简洁，造型圆润，适合儿童观看',
      en: 'Pastel soft light, simple backgrounds, rounded shapes, suitable for children.',
      vi: 'Ánh sáng pastel dịu, nền đơn giản, dáng khối tròn, phù hợp cho trẻ em.',
    },
  },
  soft_anime: {
    stylePrefix: {
      zh: '日系柔光赛璐璐动漫，干净线稿，柔和渐变天空，大眼睛精致五官，统一角色设定，非写实摄影、非水墨、非剪纸',
      en: 'Japanese soft-light cel animation, clean line art, soft gradient skies, large expressive eyes and refined features, one consistent character design. Not photorealistic, not ink wash, not papercut.',
      vi: 'Anime Nhật cel-shading ánh sáng dịu, nét vẽ sạch, bầu trời chuyển sắc dịu, mắt to và nét mặt tinh tế, một thiết kế nhân vật thống nhất. Không chụp chân thực, không thủy mặc, không giấy cắt.',
    },
    characterPrompt: {
      zh: '日系动漫主角，发型发色瞳色固定，校服或常服配色固定，赛璐璐五官，全片同一人设',
      en: 'Japanese anime lead with a fixed hairstyle, hair and eye colour, and a fixed school-uniform or casual palette, cel-shaded features, one character design throughout.',
      vi: 'Nhân vật chính anime Nhật với kiểu tóc, màu tóc và màu mắt cố định, bảng màu đồng phục hoặc đồ thường cố định, nét mặt cel-shading, cùng một nhân vật xuyên suốt.',
    },
    extraPrompt: {
      zh: '柔光、干净线稿、柔和天空，统一赛璐璐上色',
      en: 'Soft light, clean line art, gentle skies, consistent cel colouring.',
      vi: 'Ánh sáng dịu, nét vẽ sạch, bầu trời nhẹ nhàng, tô màu cel thống nhất.',
    },
  },
  chalk_whiteboard: {
    stylePrefix: {
      zh: '黑板粉笔与白板手绘讲解风，粉笔笔触，示意图箭头；画面常含简笔人物在白板或电脑前操作系统、画流程、指点界面',
      en: 'Blackboard-chalk and whiteboard hand-drawn explainer look, chalk strokes, diagram arrows. The frame often shows a simple line figure at a whiteboard or computer, working a system, drawing a flow or pointing at the interface.',
      vi: 'Phong cách giảng vẽ tay bằng phấn đen và bảng trắng, nét phấn, mũi tên sơ đồ. Khung hình thường có nhân vật vẽ đơn giản bên bảng trắng hoặc máy tính, thao tác hệ thống, vẽ quy trình hoặc chỉ vào giao diện.',
    },
    characterPrompt: {
      zh: '粉笔简笔讲解者/操作员，线条简洁特征固定，常站在白板前或坐在电脑前指点界面',
      en: 'Chalk line-drawing presenter or operator, simple lines with fixed features, usually standing at a whiteboard or seated at a computer pointing at the interface.',
      vi: 'Người giảng hoặc thao tác vẽ nét phấn, đường nét đơn giản với đặc điểm cố định, thường đứng trước bảng trắng hoặc ngồi trước máy tính chỉ vào giao diện.',
    },
    extraPrompt: {
      zh: '黑板/白板底，人物操作系统或画流程图，箭头清晰，教学感构图',
      en: 'Blackboard or whiteboard background, a person working a system or drawing a flow chart, clear arrows, a teaching-oriented composition.',
      vi: 'Nền bảng đen hoặc bảng trắng, người thao tác hệ thống hoặc vẽ lưu đồ, mũi tên rõ, bố cục mang tính giảng dạy.',
    },
  },
  cyber_neon: {
    stylePrefix: {
      zh: '赛博朋克概念插画，霓虹粉青对比，雨夜反光街道，未来都市剪影，高对比夜景，非写实摄影、非儿童绘本',
      en: 'Cyberpunk concept illustration, neon pink against teal, wet reflective streets on a rainy night, futuristic city silhouettes, high-contrast night scenes. Not photorealistic, not a children’s picture book.',
      vi: 'Minh hoạ phong cách cyberpunk, hồng neon tương phản với xanh lam, phố ướt phản chiếu trong đêm mưa, bóng đổ đô thị tương lai, cảnh đêm tương phản cao. Không chụp chân thực, không phải sách tranh trẻ em.',
    },
    characterPrompt: {
      zh: '赛博风插画角色，外套剪裁与发色固定，霓虹边缘光，面部非照片，全片同一人设',
      en: 'Cyber illustration character with a fixed coat cut and hair colour, neon rim light, a face that does not read as a photograph, one character design throughout.',
      vi: 'Nhân vật minh hoạ cyber với kiểu cắt áo khoác và màu tóc cố định, ánh sáng viền neon, khuôn mặt không mang dáng ảnh chụp, cùng một nhân vật xuyên suốt.',
    },
    extraPrompt: {
      zh: '霓虹粉青、雨夜反光、未来都市，强对比夜景',
      en: 'Neon pink and teal, a wet reflective night, a futuristic city, strong night contrast.',
      vi: 'Hồng neon và xanh lam, đêm mưa phản chiếu, đô thị tương lai, đêm tương phản mạnh.',
    },
  },
  epic_fantasy: {
    stylePrefix: {
      zh: '奇幻史诗概念插画，宏大远景与英雄中景，暮光与神性光束，岩石城堡与云海，戏剧构图，非写实摄影、非现代都市',
      en: 'Epic fantasy concept illustration, vast wide shots and heroic mid-shots, twilight and god rays, a rock citadel above a sea of clouds, dramatic composition. Not photorealistic, not a modern city.',
      vi: 'Minh hoạ phong cách giả tưởng sử thi, cảnh toàn cảnh rộng lớn và cảnh trung nhân vật, ánh sáng chiều và tia thần thánh, thành đá trên biển mây, bố cục tương phản. Không chụp chân thực, không phải đô thị hiện đại.',
    },
    characterPrompt: {
      zh: '奇幻主角外形固定：盔甲或斗篷轮廓、发色、武器辨识物全片一致，插画五官非照片',
      en: 'Fantasy lead with a fixed look: an armour or cloak silhouette, hair colour and a signature weapon stay consistent throughout, illustrated features rather than a photograph.',
      vi: 'Nhân vật chính giả tưởng có ngoại hình cố định: dáng giáp hoặc áo choàng, màu tóc và vũ khí đặc trưng giữ nhất quán xuyên suốt, nét mặt minh hoạ chứ không phải ảnh chụp.',
    },
    extraPrompt: {
      zh: '宏大场景、暮光神性光束、戏剧构图，史诗氛围',
      en: 'Vast setting, twilight god rays, dramatic composition, epic atmosphere.',
      vi: 'Bối cảnh rộng lớn, tia sáng thần thánh lúc chiều, bố cục tương phản, không khí sử thi.',
    },
  },
  magazine_collage: {
    stylePrefix: {
      zh: '杂志纸质拼贴，撕边，网纹印刷质感，层叠剪贴，大胆平面构图',
      en: 'Magazine paper collage, torn edges, halftone print texture, layered cutouts, bold flat composition.',
      vi: 'Collage giấy tạp chí, mép xé, chất in lưới chấm, lớp giấy cắt chồng, bố cục phẳng táo bạo.',
    },
    characterPrompt: {
      zh: '杂志剪贴人像剪影或印刷半调人物，外形与配色全片统一',
      en: 'A collaged portrait silhouette or a halftone-printed figure, with one consistent look and palette throughout.',
      vi: 'Bóng đời chân dung kiểu cắt dán từ tạp chí hoặc nhân vật in nửa tông, ngoại hình và bảng màu thống nhất xuyên suốt.',
    },
    extraPrompt: {
      zh: '撕边纸质、网纹印刷、大胆色块，竖屏强构图',
      en: 'Torn paper texture, halftone print, bold colour blocks, a strong vertical composition.',
      vi: 'Bề mặt giấy xé, in lưới chấm, khối màu táo bạo, bố cục dọc mạnh mẽ.',
    },
  },
  brand_clean: {
    stylePrefix: {
      zh: '极简品牌概念插画，大面积留白，有限色板（黑白+一强调色），几何构图，干净产品感，非写实摄影、非杂乱拼贴',
      en: 'Minimal brand concept illustration, generous white space, a limited palette (black and white plus one accent), geometric composition, a clean product feel. Not photorealistic, not a cluttered collage.',
      vi: 'Minh hoạ phong cách thương hiệu tối giản, khoảng trắng rộng, bảng màu giới hạn (đen trắng cộng một màu nhấn), bố cục hình học, cảm giác sản phẩm gọn gàng. Không chụp chân thực, không phải collage lộn xộn.',
    },
    characterPrompt: {
      zh: '极简几何化人物或手部剪影，配色固定，低细节面部，全片外形一致',
      en: 'Minimal geometric figure or hand silhouette, a fixed palette, a low-detail face, one consistent look throughout.',
      vi: 'Nhân vật hình học tối giản hoặc bóng đổ bàn tay, bảng màu cố định, khuôn mặt ít chi tiết, ngoại hình nhất quán xuyên suốt.',
    },
    extraPrompt: {
      zh: '大留白、有限色板、几何构图，竖屏品牌感',
      en: 'Generous white space, a limited palette, geometric composition, a vertical brand feel.',
      vi: 'Khoảng trắng rộng, bảng màu giới hạn, bố cục hình học, cảm giác thương hiệu khung dọc.',
    },
  },
  pixel_retro: {
    stylePrefix: {
      zh: '复古像素画，16位有限色板，清晰像素块，简单游戏场景，无抗锯齿',
      en: 'Retro pixel art, a 16-bit limited palette, crisp pixel blocks, a simple game scene, no anti-aliasing.',
      vi: 'Pixel art cổ điển, bảng màu giới hạn 16 bit, khối pixel rõ nét, cảnh game đơn giản, không khử răng cưa.',
    },
    characterPrompt: {
      zh: '16位像素小人操作员，坐在电脑前，有限色板，外形与调色全片不变',
      en: 'A 16-bit pixel operator sitting at a computer, a limited palette, with shape and colouring unchanged throughout.',
      vi: 'Nhân vật pixel 16 bit ngồi trước máy tính, bảng màu giới hạn, dáng và bảng màu không đổi xuyên suốt.',
    },
    extraPrompt: {
      zh: '像素小人操作系统界面，清晰像素块，无抗锯齿，游戏关卡式场景',
      en: 'A pixel character operating a system interface, crisp pixel blocks, no anti-aliasing, a game-level setting.',
      vi: 'Nhân vật pixel thao tác giao diện hệ thống, khối pixel rõ nét, không khử răng cưa, bối cảnh kiểu màn chơi.',
    },
  },
  retro_vhs: {
    stylePrefix: {
      zh: '复古 VHS 概念插画，轻微色差与扫描线暗示，1980–90s 色调，圆角电视框感构图，怀旧氛围，非写实照片、非现代超清UI',
      en: 'Retro VHS concept illustration, slight colour fringing and implied scanlines, 1980s–90s tones, a rounded television-frame composition, a nostalgic mood. Not a photorealistic photo, not a modern ultra-clean UI.',
      vi: 'Minh hoạ phong cách VHS cổ điển, lệch màu nhẹ và gợi vạch quét, tông màu thập niên 80–90, bố cục khung tròn như màn hình TV, không khí hoài niệm. Không phải ảnh chụp chân thực, không phải giao diện siêu sạch hiện đại.',
    },
    characterPrompt: {
      zh: '怀旧风插画人物，年代感发型服装固定，轻微色差边缘，非照片，全片同一人设',
      en: 'Nostalgic illustration figure with a fixed period hairstyle and clothing, slight colour fringing at the edges, not a photograph, one character design throughout.',
      vi: 'Nhân vật minh hoạ hoài niệm với kiểu tóc và trang phục thời kỳ cố định, viền lệch màu nhẹ, không phải ảnh chụp, cùng một nhân vật xuyên suốt.',
    },
    extraPrompt: {
      zh: '扫描线暗示、轻微色差、80/90年代色调，怀旧构图',
      en: 'Implied scanlines, slight colour fringing, 80s and 90s tones, a nostalgic composition.',
      vi: 'Gợi vạch quét, lệch màu nhẹ, tông màu thập niên 80/90, bố cục hoài niệm.',
    },
  },
  ink_guofeng: {
    stylePrefix: {
      zh: '中国水墨写意插画，富有表现力的笔触，大量留白，诗意氛围，淡雅墨色，非写实摄影',
      en: 'Chinese ink-wash freehand illustration, expressive brush strokes, generous white space, a poetic mood, muted ink tones. Not photorealistic.',
      vi: 'Minh hoạ thủy mặc viết ý Trung Hoa, nét bút biểu đạt, khoảng trắng rộng, không khí thơ, mực nhạt thanh nhã. Không chụp chân thực.',
    },
    characterPrompt: {
      zh: '水墨写意人物，简笔眉眼，宽袍或古装轮廓固定，墨色淡雅，全片同一人设',
      en: 'Ink-wash figure drawn with simple brows and eyes, a fixed silhouette of a wide robe or period costume, muted ink tones, one character design throughout.',
      vi: 'Nhân vật thủy mặc vẽ đơn giản với lông mày và mắt gọn, dáng áo rộng hoặc cổ phục cố định, mực nhạt thanh nhã, cùng một nhân vật xuyên suốt.',
    },
    extraPrompt: {
      zh: '大量留白，淡墨渲染，诗意意境，竖屏顶部可叠字',
      en: 'Generous white space, light ink rendering, a poetic mood, room at the top of the vertical frame for overlay text.',
      vi: 'Khoảng trắng rộng, nhuộm mực nhạt, không khí thơ, chừa phía trên khung dọc để chồng chữ.',
    },
  },
}

/** Mục lấy được hay không; không có thì trả nguyên văn giá trị backend (`fallback`). */
function pick(
  id: string,
  field: keyof TemplatePromptLabels,
  fallback: string,
): string {
  const entry = TEMPLATE_PROMPT_LABELS[id]?.[field]
  if (!entry) return fallback
  return localized(entry) || fallback
}

/**
 * Tiền tố phong cách mặc định của mẫu, theo ngôn ngữ đang dùng.
 *
 * Gọi từ `defaultsFromTemplate()` — xem lý do ở đầu file.
 */
export function templateStylePrompt(id: string, fallback = ''): string {
  return pick(id, 'stylePrefix', fallback)
}

/** Mô tả nhân vật mặc định của mẫu; mẫu không có thì trả rỗng. */
export function templateCharacterPrompt(id: string, fallback = ''): string {
  return pick(id, 'characterPrompt', fallback)
}

/** Yêu cầu bổ sung mặc định của mẫu; mẫu không có thì trả rỗng. */
export function templateExtraPrompt(id: string, fallback = ''): string {
  return pick(id, 'extraPrompt', fallback)
}

/**
 * Các trường prompt còn thiếu nhãn, để báo cáo. `ids` là id mẫu backend đang có, nên
 * dùng để bắt mẫu admin vừa thêm mà bảng nhãn chưa kịp cập nhật.
 */
export function missingTemplatePromptLabels(ids: string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const entry = TEMPLATE_PROMPT_LABELS[id]
    if (!entry) {
      out.push(id)
      continue
    }
    for (const field of ['stylePrefix', 'characterPrompt', 'extraPrompt'] as const) {
      if (!entry[field]) out.push(`${id}.${field}`)
    }
  }
  return out
}
