/** Văn bản trang pháp lý và liên hệ: điều khoản sử dụng, chính sách bảo mật, kênh liên hệ */

import type { Locale } from '../i18n/detect'
import { localized, localizedList, type LocalizedText } from './localeStrings'

/**
 * TODO(vi): thay bằng địa chỉ hỗ trợ chính thức của NOVAFILM khi đã có.
 * Tạm để `example.com` — domain dành riêng cho ví dụ theo RFC 2606, không thể bị
 * đăng ký — để không trỏ người dùng tới hộp thư của bên khác.
 */
export const SUPPORT_EMAIL = 'support@example.com'

export type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

export type LegalDoc = {
  slug: 'terms' | 'privacy'
  title: string
  updatedAt: string
  intro: string
  sections: LegalSection[]
}

export const LEGAL_DOCS: Record<'terms' | 'privacy', LegalDoc> = {
  terms: {
    slug: 'terms',
    title: '用户协议',
    updatedAt: '2026-08-17',
    intro:
      '欢迎使用 NOVAFILM（以下简称「本平台」）。在注册或使用本平台服务前，请仔细阅读本协议。一旦您开始使用，即视为已阅读并同意以下条款。',
    sections: [
      {
        title: '1. 服务说明',
        paragraphs: [
          'NOVAFILM 提供 AI 漫剧、AI短视频及创作工具（含文生图、图生图、文生视频等）相关服务。服务内容可能随产品迭代调整，我们将尽可能在页面或公告中说明重大变更。',
          '本平台按实际上游模型用量计费，余额充值后永久有效，不设强制订阅。具体价格与赠送规则以定价页及下单时展示为准。',
        ],
      },
      {
        title: '2. 账号与安全',
        bullets: [
          '您应使用真实、有效的信息进行注册，并对账号下的全部行为负责。',
          '请妥善保管登录凭证；因账号泄露、共用导致的损失，由您自行承担。',
          '如发现未经授权的使用，请及时通过「联系我们」告知我们。',
          '我们有权在发现违规、欺诈或滥用时限制、冻结或注销相关账号。',
        ],
      },
      {
        title: '3. 内容与知识产权',
        paragraphs: [
          '您输入的提示词、脚本、素材等仍归您或原权利人所有。您保证对上传内容拥有合法权利，不得侵犯第三方知识产权、肖像权、隐私权等。',
          '使用 AI 生成的内容可能存在不准确、不完整或与预期不符的情况，请在正式发布前自行审核。因您对外发布、商用使用生成内容引发的纠纷，由您自行负责。',
          '本平台的界面、商标、软件与文档等知识产权归 NOVAFILM 或相关权利人所有，未经许可不得复制、反向工程或用于与本服务无关的商业用途。',
        ],
      },
      {
        title: '4. 计费与充值',
        bullets: [
          '生成类任务按 TokenFree 官方成本计费（与上游一致，不再加价）；开始任务时可能预扣估算金额，结束后按实际用量结算（多退少补）。',
          '充值通过支付宝、微信支付等渠道完成，到账以系统记录为准。',
          '除法律法规另有规定或本平台明确约定外，已到账的充值余额一般不予退款。',
          '若因系统故障导致重复扣款或未到账，请保留订单号并联系客服核实处理。',
        ],
      },
      {
        title: '5. 禁止行为',
        bullets: [
          '利用本服务制作、传播违法、色情、暴力、仇恨、欺诈或侵犯他人权益的内容。',
          '对平台进行攻击、爬取、绕过计费、滥用接口或干扰其他用户。',
          '未经授权转售账号、批量注册或从事其他损害平台公平运营的行为。',
        ],
      },
      {
        title: '6. 免责与责任限制',
        paragraphs: [
          '在法律允许的范围内，本平台对因网络故障、第三方服务中断、不可抗力导致的服务中断或数据损失不承担责任。',
          'AI 输出仅为辅助创作工具，不构成专业建议。因依赖生成内容造成的直接或间接损失，本平台不承担超出您已支付服务费范围以外的责任（法律另有强制规定的除外）。',
        ],
      },
      {
        title: '7. 协议变更与终止',
        paragraphs: [
          '我们可能适时修订本协议，修订后的版本将在本页面公布，并以「更新日期」为准。若您继续使用服务，视为接受修订后的协议。',
          '您可随时停止使用并申请注销账号；我们也可在您严重违反本协议时终止向您提供服务。',
        ],
      },
      {
        title: '8. 联系方式',
        paragraphs: [
          `如对本协议有疑问，请前往「联系我们」页面提交反馈，或发送邮件至 ${SUPPORT_EMAIL}。`,
        ],
      },
    ],
  },
  privacy: {
    slug: 'privacy',
    title: '隐私政策',
    updatedAt: '2026-08-17',
    intro:
      'NOVAFILM 重视您的隐私。本政策说明我们如何收集、使用、存储与保护您的个人信息。使用本平台即表示您理解本政策所述处理方式。',
    sections: [
      {
        title: '1. 我们收集的信息',
        bullets: [
          '账号信息：注册邮箱、昵称、头像、登录与鉴权相关数据。',
          '使用数据：创作项目、提示词、生成任务状态、工具运行记录、资产库内容等业务数据。',
          '计费信息：余额、冻结金额、充值订单、用量与扣费明细（支付由第三方渠道完成，我们不存储完整银行卡号等敏感支付信息）。',
          '技术日志：IP、浏览器类型、访问时间等用于安全与故障排查的必要日志。',
        ],
      },
      {
        title: '2. 信息的使用目的',
        bullets: [
          '提供、维护与改进漫剧、AI短视频与工具等创作服务。',
          '完成身份验证、计费结算、订单查询与客服支持。',
          '保障账号与系统安全，防范欺诈与滥用。',
          '在获得同意或法律法规允许的情况下，向您发送服务通知或产品更新。',
        ],
      },
      {
        title: '3. 存储与第三方',
        paragraphs: [
          '您的媒体与创作文件可能存储于云端对象存储（如阿里云 OSS），以便预览与下载。',
          '支付由易支付等合作方处理；大模型推理由上游模型服务商完成。我们仅向其提供完成服务所必需的数据，并要求其按约定保护信息。',
          '除法律法规要求、获得您明确同意，或为保护本平台及用户合法权益所必需外，我们不会向无关第三方出售您的个人信息。',
        ],
      },
      {
        title: '4. Cookie 与本地存储',
        paragraphs: [
          '为维持登录态与偏好设置，我们可能使用 Cookie 或浏览器本地存储（如 token）。您可在浏览器中清除，但这可能导致需要重新登录。',
        ],
      },
      {
        title: '5. 您的权利',
        bullets: [
          '查阅、更正账号资料（可在个人中心操作）。',
          '导出或下载您有权访问的创作成果（在产品功能允许范围内）。',
          '申请注销账号；注销后我们将按法规要求删除或匿名化相关个人信息，法律法规要求保留的除外。',
          '对隐私相关问题进行咨询或投诉。',
        ],
      },
      {
        title: '6. 未成年人保护',
        paragraphs: [
          '本平台主要面向具备完全民事行为能力的用户。若您为未成年人，请在监护人指导下阅读本政策并使用服务。',
        ],
      },
      {
        title: '7. 政策更新',
        paragraphs: [
          '我们可能更新本政策，并在本页公布最新版本与更新日期。重大变更时，我们会通过站内提示等方式尽量告知。',
        ],
      },
      {
        title: '8. 联系我们',
        paragraphs: [
          `如对本政策有任何疑问，请访问「联系我们」或发送邮件至 ${SUPPORT_EMAIL}。`,
        ],
      },
    ],
  },
}

export const LEGAL_DOCS_EN: Record<'terms' | 'privacy', LegalDoc> = {
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    updatedAt: '2026-08-17',
    intro:
      'Welcome to NOVAFILM (“the Platform”). Please read these terms before you register or use the service. Using the Platform means you have read and agree to them.',
    sections: [
      {
        title: '1. The service',
        paragraphs: [
          'NOVAFILM provides AI drama, explainer video, and creation tools (including text-to-image, image-to-image, and text-to-video). Features may change as the product evolves; we will try to note material changes on the site or in notices.',
          'Billing follows actual upstream model usage. Topped-up balance does not expire and there is no forced subscription. Prices and bonuses follow the Pricing page and the checkout screen.',
        ],
      },
      {
        title: '2. Accounts and security',
        bullets: [
          'Register with accurate information and you are responsible for activity under the account.',
          'Keep credentials safe. Losses from leaks or sharing are yours to bear.',
          'If you see unauthorized use, tell us via Contact.',
          'We may limit, freeze, or close accounts for abuse, fraud, or policy violations.',
        ],
      },
      {
        title: '3. Content and IP',
        paragraphs: [
          'Prompts, scripts, and uploads remain yours or the original rights holder’s. You warrant you have the right to upload them and will not infringe IP, portrait, or privacy rights.',
          'AI output may be inaccurate or unexpected. Review it before publishing. Disputes from your public or commercial use are your responsibility.',
          'The Platform UI, marks, software, and docs belong to NOVAFILM or licensors. Do not copy, reverse-engineer, or use them outside this service without permission.',
        ],
      },
      {
        title: '4. Billing and top-ups',
        bullets: [
          'Generation jobs are billed at the TokenFree official cost, the same figure as upstream, with no markup. We may pre-authorize an estimate when a job starts and settle the real usage afterward (refund or top-up the difference).',
          'Top-ups go through Alipay, WeChat Pay, and similar channels. Arrival follows system records.',
          'Except where law requires otherwise or we explicitly agree, arrived credits are generally non-refundable.',
          'If a fault causes a double charge or missing credit, keep the order ID and contact support.',
        ],
      },
      {
        title: '5. Prohibited use',
        bullets: [
          'Do not create or spread illegal, pornographic, violent, hateful, fraudulent, or otherwise infringing content.',
          'Do not attack, scrape, bypass billing, abuse APIs, or disrupt other users.',
          'Do not resell accounts, bulk-register, or otherwise harm fair operation.',
        ],
      },
      {
        title: '6. Disclaimers',
        paragraphs: [
          'To the extent allowed by law, we are not liable for outages or data loss from network faults, third-party interruptions, or force majeure.',
          'AI output is a creation aid, not professional advice. We are not liable beyond fees you paid for losses from relying on generated content, except where law requires otherwise.',
        ],
      },
      {
        title: '7. Changes and termination',
        paragraphs: [
          'We may revise these terms and post the new version here with an updated date. Continued use means you accept the revision.',
          'You may stop using the service and request account deletion. We may also stop serving you if you seriously breach these terms.',
        ],
      },
      {
        title: '8. Contact',
        paragraphs: [
          `Questions about these terms: use Contact or email ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    updatedAt: '2026-08-17',
    intro:
      'NOVAFILM respects your privacy. This policy explains how we collect, use, store, and protect personal information. Using the Platform means you understand this processing.',
    sections: [
      {
        title: '1. Information we collect',
        bullets: [
          'Account data: email, display name, avatar, and authentication data.',
          'Usage data: projects, prompts, job status, tool runs, and asset library content.',
          'Billing data: balance, holds, top-up orders, and usage ledgers (payment is handled by third parties; we do not store full card numbers).',
          'Technical logs: IP, browser type, and access time for security and debugging.',
        ],
      },
      {
        title: '2. How we use it',
        bullets: [
          'Provide, maintain, and improve drama, explainer, and tool services.',
          'Identity checks, billing, order queries, and support.',
          'Account and system security, fraud and abuse prevention.',
          'Service notices or product updates where you consent or law allows.',
        ],
      },
      {
        title: '3. Storage and third parties',
        paragraphs: [
          'Media and project files may live in cloud object storage (such as Alibaba Cloud OSS) for preview and download.',
          'Payments go through partners such as Epay; model inference goes through upstream providers. We share only what is needed to complete the service.',
          'We do not sell personal information to unrelated third parties except as required by law, with your consent, or to protect the Platform and users.',
        ],
      },
      {
        title: '4. Cookies and local storage',
        paragraphs: [
          'We may use cookies or local storage (such as a token) to keep you signed in and remember preferences. Clearing them may require signing in again.',
        ],
      },
      {
        title: '5. Your rights',
        bullets: [
          'View and correct profile data in Account.',
          'Export or download creative output where the product allows.',
          'Request account deletion; we will delete or anonymize personal data as required, except records the law keeps.',
          'Ask questions or complain about privacy.',
        ],
      },
      {
        title: '6. Children',
        paragraphs: [
          'The Platform is intended for users with full civil capacity. If you are a minor, read this policy and use the service with a guardian.',
        ],
      },
      {
        title: '7. Policy updates',
        paragraphs: [
          'We may update this policy and post the latest version and date here. For material changes we will try to notify you in-product.',
        ],
      },
      {
        title: '8. Contact',
        paragraphs: [
          `Questions: use Contact or email ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
}

export const LEGAL_DOCS_VI: Record<'terms' | 'privacy', LegalDoc> = {
  terms: {
    slug: 'terms',
    title: 'Điều khoản sử dụng',
    updatedAt: '2026-08-17',
    intro:
      'Chào mừng bạn đến với NOVAFILM (sau đây gọi là «Nền tảng»). Trước khi đăng ký hoặc sử dụng dịch vụ, vui lòng đọc kỹ các điều khoản này. Ngay khi bạn bắt đầu sử dụng, điều đó được hiểu là bạn đã đọc và đồng ý với các điều khoản dưới đây.',
    sections: [
      {
        title: '1. Giới thiệu dịch vụ',
        paragraphs: [
          'NOVAFILM cung cấp các dịch vụ AI Drama, AI Short Video và công cụ sáng tạo (gồm văn bản ra ảnh, ảnh ra ảnh, văn bản ra video…). Nội dung dịch vụ có thể thay đổi theo vòng lặp sản phẩm; chúng tôi sẽ cố gắng thông báo thay đổi quan trọng trên trang hoặc qua thông báo.',
          'Nền tảng tính phí theo mức dùng mô hình thượng nguồn thực tế, số dư sau khi nạp không hết hạn và không bắt buộc đăng ký thuê bao. Giá và quy tắc tặng kèm theo trang Bảng giá và màn hình đặt hàng.',
        ],
      },
      {
        title: '2. Tài khoản và bảo mật',
        bullets: [
          'Bạn đăng ký bằng thông tin chính xác, hợp lệ và chịu trách nhiệm về toàn bộ hoạt động dưới tài khoản đó.',
          'Hãy giữ gìn thông tin đăng nhập. Thiệt hại do lộ thông tin hoặc chia sẻ tài khoản là bạn tự gánh chịu.',
          'Nếu phát hiện bị sử dụng trái phép, vui lòng báo lại qua trang «Liên hệ».',
          'Chúng tôi có quyền hạn chế, đóng băng hoặc huỷ tài khoản khi phát hiện vi phạm, gian lận hoặc lạm dụng.',
        ],
      },
      {
        title: '3. Nội dung và quyền sở hữu trí tuệ',
        paragraphs: [
          'Prompt, kịch bản và tư liệu bạn nhập vẫn thuộc về bạn hoặc chủ sở hữu quyền gốc. Bạn bảo đảm mình có quyền hợp pháp đối với nội dung tải lên và không xâm phạm quyền sở hữu trí tuệ, quyền nhân thân hay quyền riêng tư của bên thứ ba.',
          'Nội dung do AI tạo có thể không chính xác, không đầy đủ hoặc không đúng như mong đợi; vui lòng tự kiểm tra trước khi phát hành chính thức. Mọi tranh chấp phát sinh từ việc bạn phát hành hoặc dùng thương mại nội dung tạo ra là trách nhiệm của bạn.',
          'Giao diện, nhãn hiệu, phần mềm và tài liệu của Nền tảng thuộc sở hữu của NOVAFILM hoặc chủ sở hữu quyền liên quan; không được sao chép, dịch ngược hoặc dùng cho mục đích thương mại ngoài dịch vụ này khi chưa được cho phép.',
        ],
      },
      {
        title: '4. Tính phí và nạp tiền',
        bullets: [
          'Tác vụ tạo nội dung được tính phí theo chi phí chính thức của TokenFree (giống hệt thượng nguồn, không cộng thêm giá); khi bắt đầu tác vụ có thể tạm giữ ước tính, xong thì quyết toán theo mức dùng thực tế (thừa trả lại, thiếu thì bù).',
          'Việc nạp tiền thực hiện qua Alipay, WeChat Pay và các kênh tương tự; thời điểm ghi nhận căn cứ vào hệ thống.',
          'Trừ khi pháp luật có quy định khác hoặc Nền tảng có thoả thuận riêng, số dư đã ghi nhận thường không được hoàn lại.',
          'Nếu lỗi hệ thống dẫn tới bị trừ tiền trùng hoặc không ghi nhận, vui lòng giữ mã đơn hàng và liên hệ bộ phận hỗ trợ để kiểm tra và xử lý.',
        ],
      },
      {
        title: '5. Hành vi bị cấm',
        bullets: [
          'Dùng dịch vụ này để sản xuất, phát tán nội dung vi phạm pháp luật, khiêu dâm, bạo lực, thù hận, lừa đảo hoặc xâm phạm quyền lợi người khác.',
          'Tấn công nền tảng, thu thập dữ liệu hàng loạt, vượt cơ chế tính phí, lạm dụng giao diện hoặc gây gián đoạn cho người dùng khác.',
          'Bán lại tài khoản, đăng ký hàng loạt hoặc thực hiện hành vi khác gây tổn hại tới vận hành công bằng của nền tảng.',
        ],
      },
      {
        title: '6. Miễn trừ và giới hạn trách nhiệm',
        paragraphs: [
          'Trong phạm vi pháp luật cho phép, Nền tảng không chịu trách nhiệm đối với việc dịch vụ gián đoạn hoặc dữ liệu bị mất do sự cố mạng, bên thứ ba gián đoạn hay sự kiện bất khả kháng.',
          'Kết quả AI chỉ là công cụ hỗ trợ sáng tạo, không phải tư vấn chuyên môn. Nền tảng không chịu trách nhiệm đối với thiệt hại trực tiếp hay gián tiếp phát sinh do dựa vào nội dung tạo ra, vượt quá phạm vi phí dịch vụ bạn đã trả (trừ trường hợp pháp luật có quy định bắt buộc khác).',
        ],
      },
      {
        title: '7. Điều chỉnh và chấm dứt điều khoản',
        paragraphs: [
          'Chúng tôi có thể sửa đổi các điều khoản này khi cần; bản sửa đổi sẽ được đăng trên trang này và mốc «Ngày cập nhật» là mốc áp dụng. Nếu bạn tiếp tục sử dụng dịch vụ, điều đó được hiểu là bạn chấp nhận bản sửa đổi.',
          'Bạn có thể ngừng sử dụng và yêu cầu huỷ tài khoản bất cứ lúc nào; chúng tôi cũng có thể ngừng cung cấp dịch vụ cho bạn nếu bạn vi phạm nghiêm trọng các điều khoản này.',
        ],
      },
      {
        title: '8. Liên hệ',
        paragraphs: [
          `Nếu bạn có thắc mắc về các điều khoản này, vui lòng gửi phản hồi qua trang «Liên hệ» hoặc email tới ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
  privacy: {
    slug: 'privacy',
    title: 'Chính sách quyền riêng tư',
    updatedAt: '2026-08-17',
    intro:
      'NOVAFILM tôn trọng quyền riêng tư của bạn. Chính sách này giải thích cách chúng tôi thu thập, sử dụng, lưu trữ và bảo vệ thông tin cá nhân của bạn. Sử dụng Nền tảng đồng nghĩa với việc bạn đã hiểu về cách xử lý được mô tả ở đây.',
    sections: [
      {
        title: '1. Thông tin chúng tôi thu thập',
        bullets: [
          'Thông tin tài khoản: email đăng ký, tên hiển thị, ảnh đại diện, dữ liệu đăng nhập và xác thực.',
          'Dữ liệu sử dụng: dự án sáng tạo, prompt, trạng thái tác vụ tạo, lịch sử chạy công cụ, nội dung thư viện tài nguyên và các dữ liệu nghiệp vụ liên quan.',
          'Thông tin tính phí: số dư, khoản tạm giữ, đơn nạp tiền, mức dùng và chi tiết trừ phí (việc thanh toán do bên thứ ba xử lý, chúng tôi không lưu số thẻ đầy đủ hay thông tin thanh toán nhạy cảm khác).',
          'Nhật ký kỹ thuật: IP, loại trình duyệt, thời gian truy cập và các nhật ký cần thiết cho bảo mật và xử lý sự cố.',
        ],
      },
      {
        title: '2. Mục đích sử dụng thông tin',
        bullets: [
          'Cung cấp, duy trì và cải thiện các dịch vụ sáng tạo Drama, AI Short Video và công cụ.',
          'Thực hiện xác thực định danh, quyết toán tính phí, tra cứu đơn hàng và hỗ trợ khách hàng.',
          'Bảo đảm an toàn cho tài khoản và hệ thống, phòng ngừa gian lận và lạm dụng.',
          'Gửi thông báo dịch vụ hoặc cập nhật sản phẩm khi bạn đồng ý hoặc pháp luật cho phép.',
        ],
      },
      {
        title: '3. Lưu trữ và bên thứ ba',
        paragraphs: [
          'Tệp media và tệp sáng tạo của bạn có thể được lưu trên lưu trữ đám mây dạng đối tượng (ví dụ Alibaba Cloud OSS) để xem trước và tải xuống.',
          'Thanh toán được xử lý bởi các đối tác như Epay; suy luận mô hình ngôn ngữ lớn do các nhà cung cấp mô hình thượng nguồn thực hiện. Chúng tôi chỉ chia sẻ dữ liệu cần thiết để hoàn thành dịch vụ và yêu cầu họ bảo vệ thông tin theo thỏa thuận.',
          'Ngoài trường hợp pháp luật bắt buộc, bạn đã đồng ý rõ ràng, hoặc cần thiết để bảo vệ quyền lợi của Nền tảng và người dùng, chúng tôi không bán thông tin cá nhân của bạn cho bên thứ ba không liên quan.',
        ],
      },
      {
        title: '4. Cookie và bộ nhớ cục bộ',
        paragraphs: [
          'Để duy trì trạng thái đăng nhập và lưu tuỳ chọn, chúng tôi có thể dùng Cookie hoặc bộ nhớ cục bộ của trình duyệt (ví dụ token). Bạn có thể xoá trong trình duyệt, nhưng việc đó có thể khiến bạn phải đăng nhập lại.',
        ],
      },
      {
        title: '5. Quyền của bạn',
        bullets: [
          'Xem và sửa thông tin tài khoản (thực hiện trong Tài khoản).',
          'Xuất hoặc tải xuống các sản phẩm sáng tạo mà bạn có quyền truy cập (trong phạm vi tính năng cho phép).',
          'Yêu cầu huỷ tài khoản; sau khi huỷ chúng tôi sẽ xoá hoặc ẩn danh hóa thông tin cá nhân theo quy định, trừ dữ liệu mà pháp luật yêu cầu phải giữ.',
          'Đặt câu hỏi hoặc khiếu nại về quyền riêng tư.',
        ],
      },
      {
        title: '6. Bảo vệ người chưa thành niên',
        paragraphs: [
          'Nền tảng chủ yếu dành cho người dùng có năng lực pháp lý đầy đủ. Nếu bạn chưa thành niên, vui lòng đọc chính sách này và sử dụng dịch vụ dưới sự hướng dẫn của người giám hộ.',
        ],
      },
      {
        title: '7. Cập nhật chính sách',
        paragraphs: [
          'Chúng tôi có thể cập nhật chính sách này và đăng bản mới nhất cùng ngày cập nhật tại đây. Khi có thay đổi quan trọng, chúng tôi sẽ cố gắng thông báo qua thông báo trong sản phẩm.',
        ],
      },
      {
        title: '8. Liên hệ',
        paragraphs: [
          `Nếu có bất kỳ thắc mắc nào về chính sách này, vui lòng vào trang «Liên hệ» hoặc gửi email tới ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
}

  /** Mỗi ngôn ngữ giao diện có một bộ văn bản riêng; thêm ngôn ngữ mới thì khai báo ở đây */
const LEGAL_DOCS_BY_LOCALE: Record<Locale, Record<'terms' | 'privacy', LegalDoc>> = {
  zh: LEGAL_DOCS,
  en: LEGAL_DOCS_EN,
  vi: LEGAL_DOCS_VI,
}

/** Lấy điều khoản sử dụng / chính sách bảo mật theo ngôn ngữ giao diện */
export function getLegalDoc(slug: 'terms' | 'privacy', locale: Locale): LegalDoc {
  return LEGAL_DOCS_BY_LOCALE[locale][slug]
}

export type ContactChannel = {
  title: string
  desc: string
  href?: string
  actionLabel?: string
}

type ContactChannelCopy = {
  title: LocalizedText
  desc: LocalizedText
  actionLabel: LocalizedText
  subject?: string
}

/**
 * Kênh liên hệ: `title`, `desc` và `actionLabel` định nghĩa bằng getter để đọc ra
 * đúng ngôn ngữ đang dùng, vì bên ngoài sẽ duyệt mảng này rồi render thẳng.
 */
const CONTACT_CHANNEL_COPY: ContactChannelCopy[] = [
  {
    title: { zh: '邮箱支持', en: 'Email support', vi: 'Hỗ trợ qua email' },
    desc: {
      zh: '工作日一般 1–2 个工作日内回复；请附上账号邮箱与订单号（如有）。',
      en: 'We reply within one to two business days. Include your account email and the order ID, if you have one.',
      vi: 'Chúng tôi trả lời trong một đến hai ngày làm việc. Vui lòng kèm email tài khoản và mã đơn hàng nếu có.',
    },
    actionLabel: { zh: '发送邮件', en: 'Send an email', vi: 'Gửi email' },
  },
  {
    title: { zh: '帮助中心', en: 'Help centre', vi: 'Trung tâm trợ giúp' },
    desc: {
      zh: '充值、下载、漫剧与工具等常见问题可先在帮助中心自助查询。',
      en: 'Answers to common questions about top-ups, downloads, drama and the tools are in the help centre.',
      vi: 'Các câu hỏi thường gặp về nạp tiền, tải về, Drama và công cụ đều có trong trung tâm trợ giúp.',
    },
    actionLabel: { zh: '前往帮助中心', en: 'Open the help centre', vi: 'Mở trung tâm trợ giúp' },
  },
  {
    title: {
      zh: '企业合作 / 对公转账',
      en: 'Business enquiries / bank transfer',
      vi: 'Hợp tác doanh nghiệp / chuyển khoản',
    },
    desc: {
      zh: '企业批量充值、API 合作或发票需求，请邮件说明公司名称与需求，我们会安排对接。',
      en: 'For bulk top-ups, API partnerships, or invoices, email us your company name and what you need and we will set up contact.',
      vi: 'Với nhu cầu nạp tiền số lượng lớn, hợp tác API hoặc xuất hoá đơn, hãy gửi email kèm tên công ty và nhu cầu, chúng tôi sẽ sắp xếp liên hệ.',
    },
    actionLabel: { zh: '发送合作邮件', en: 'Email us', vi: 'Gửi email cho chúng tôi' },
    subject: 'NOVAFILM 企业合作',
  },
]

export const CONTACT_CHANNELS: ContactChannel[] = CONTACT_CHANNEL_COPY.map(
  (copy, index) => ({
    href:
      index === 0
        ? `mailto:${SUPPORT_EMAIL}`
        : index === 1
          ? '/help'
          : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(copy.subject || '')}`,
    get title() {
      return localized(copy.title)
    },
    get desc() {
      return localized(copy.desc)
    },
    get actionLabel() {
      // Kênh đầu hiển thị luôn địa chỉ email, nên nhãn hành động là chính địa chỉ.
      return index === 0 ? SUPPORT_EMAIL : localized(copy.actionLabel)
    },
  }),
)

export const CONTACT_TOPICS: readonly string[] = localizedList([
  { zh: '账号与登录', en: 'Account and sign-in', vi: 'Tài khoản và đăng nhập' },
  { zh: '充值与到账', en: 'Top-ups and credits', vi: 'Nạp tiền và ghi nhận' },
  { zh: '创作任务异常', en: 'Failed generation jobs', vi: 'Tác vụ tạo bị lỗi' },
  { zh: '下载与素材', en: 'Downloads and assets', vi: 'Tải về và tư liệu' },
  { zh: '隐私与账号注销', en: 'Privacy and account deletion', vi: 'Quyền riêng tư và huỷ tài khoản' },
  { zh: '其他', en: 'Something else', vi: 'Khác' },
])
