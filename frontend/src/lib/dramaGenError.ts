/**
 * 漫剧生成队列：把上游/平台原始错误翻成可读文案，并附处理建议
 *
 * RANH GIỚI QUAN TRỌNG — regex giữ tiếng Trung, chuỗi trả về thì dịch:
 *
 * `formatDramaGenError` nhận `raw` là thông báo lỗi nguyên văn từ backend hoặc từ
 * nhà cung cấp mô hình. Các regex bên dưới dò chính xác những chuỗi tiếng Trung đó
 * (`生图失败`, `余额不足`, `上一镜失败`, `分镜已变更`…). Nếu dịch chúng, mọi nhánh xử
 * lý sẽ trượt và rơi xuống fallback cuối — tức là mọi thông báo lỗi biến mất
 * im lặng. Vì vậy: **regex và điều kiện `includes()` giữ nguyên**, chỉ `title` /
 * `message` / `suggestion` do ta tự viết mới được dịch.
 *
 * Một hệ quả chưa giải quyết được ở frontend: vài nhánh đặt `message: text`, tức
 * hiển thị lại nguyên văn thông báo lỗi của backend. Chuỗi đó vẫn là tiếng Trung cho
 * tới khi backend có bản `vi`. `title` và `suggestion` của chính ta thì đã là
 * tiếng Việt.
 */

import { dialog } from './dialog'
import { isBillingError } from './billingError'
import { localized, type LocalizedText } from './localeStrings'

export type DramaGenErrorView = {
  /** 短标题 */
  title: string
  /** 用户可读说明 */
  message: string
  /** 建议操作 */
  suggestion?: string
  /** 是否余额不足（展示充值跳转） */
  billingBlocked?: boolean
  /** 是否上游模型账户欠费（提醒管理员，非用户钱包） */
  upstreamAccountBlocked?: boolean
}

/** 是否为上游 Seedream 账户欠费 */
export function isUpstreamAccountError(message: string): boolean {
  return /AccountOverdueError|上游 Seedream 账户欠费|上游.*账户欠费/i.test(message)
}

// 从 Seedance JSON 文案里取出 content[n]
function extractContentIndex(raw: string): number | null {
  const m = raw.match(/content\[(\d+)\]/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** 判断文案是否像「具体根因」（优先于「重试上限」等包装句） */
function looksLikeRootCause(text: string): boolean {
  return /PrivacyInformation|InputImageSensitive|SensitiveContentDetected|参考图疑似|参考音频过短|may contain real person|Seedance create error|上一镜失败|无法衔接|分镜已变更|分镜上下文|InputTextSensitive|resource download failed|audio_url|audio duration|Credits insufficient|File type not supported|参考图格式不支持/i.test(
    text,
  )
}

/**
 * Nhãn槽位 do backend ghi kèm (content_labels). Regex bắt tiếng Trung vì đó là
 * giá trị backend trả về, nhưng phần hiển thị thì dịch lại.
 */
const SLOT_LABELS: Record<string, LocalizedText> = {
  角色: { zh: '角色', en: 'Character', vi: 'Nhân vật' },
  场景: { zh: '场景', en: 'Scene', vi: 'Bối cảnh' },
  道具: { zh: '道具', en: 'Prop', vi: 'Đạo cụ' },
  旁白: { zh: '旁白', en: 'Narration', vi: 'Lời dẫn' },
  参考图: { zh: '参考图', en: 'Reference image', vi: 'Ảnh tham chiếu' },
  音色: { zh: '音色', en: 'Voice', vi: 'Giọng đọc' },
}

function slotLabel(name: string): string {
  const known = SLOT_LABELS[name]
  return known ? localized(known) : name
}

// 从错误里尽量抽出已标注的槽位名（后端 content_labels）
function extractNamedSlot(text: string): string | null {
  const named = text.match(/(角色|场景|道具|旁白|参考图|音色)「([^」]+)」/)
  if (named) return `${slotLabel(named[1])}「${named[2]}」`
  return null
}

/**
 * 从多条候选错误里挑出最具体的根因（例如隐私图审核），
 * 避免只展示「重试超过上限」这类包装文案。
 */
export function pickRootDramaGenError(
  candidates: Array<string | null | undefined>,
): string {
  const cleaned = candidates.map((c) => String(c || '').trim()).filter(Boolean)
  const root = cleaned.find(looksLikeRootCause)
  if (root) return root
  return cleaned[0] || ''
}

/**
 * 将任务 error / error_message 转为前端展示文案。
 * 已是中文短句时尽量保留，仅补建议。
 */
export function formatDramaGenError(raw: string | null | undefined): DramaGenErrorView {
  const text = String(raw || '').trim()
  if (!text) {
    return {
      title: localized({ zh: '生成失败', en: 'Generation failed', vi: 'Tạo thất bại' }),
      message: localized({
        zh: '任务未能完成，且未记录具体错误信息。',
        en: 'The job did not finish, and no specific error was recorded.',
        vi: 'Tác vụ không hoàn thành và không ghi lại thông tin lỗi cụ thể.',
      }),
      suggestion: localized({
        zh: '请稍后重试；若反复失败，检查网络/代理是否能访问 TokenFree，以及后台模型渠道密钥。',
        en: 'Retry in a moment. If it keeps failing, check that the network or proxy can reach TokenFree, and that the model channel key in the admin is valid.',
        vi: 'Hãy thử lại sau ít phút. Nếu vẫn lỗi, kiểm tra mạng hoặc proxy có truy cập được TokenFree không, cùng khoá kênh mô hình trong trang quản trị.',
      }),
    }
  }

  if (/ReadTimeout|WriteTimeout|等待上游超时|响应超时/i.test(text)) {
    return {
      title: localized({
        zh: '上游响应超时',
        en: 'Upstream timed out',
        vi: 'Mô hình thượng nguồn phản hồi quá hạn',
      }),
      message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
      suggestion: localized({
        zh: '已经连上 TokenFree，但出图/出视频等待超过上限。请稍后重试；若文本能生成、只有图/视频超时，多半是上游排队较慢，不是代理断网。',
        en: 'TokenFree is reachable, but waiting for the image or video exceeded the limit. Retry shortly. If text generates and only images or videos time out, upstream is most likely queueing slowly rather than your proxy dropping.',
        vi: 'Đã kết nối được TokenFree nhưng thời gian chờ tạo ảnh hoặc video vượt quá giới hạn. Hãy thử lại sau ít phút. Nếu văn bản tạo được mà riêng ảnh hoặc video thì hết thời gian chờ, gần như chắc phía thượng nguồn đang xếp hàng chậm chứ không phải proxy bị rớt mạng.',
      }),
    }
  }

  if (/网络错误|ConnectError|ConnectTimeout|无法连接上游|tokenfree\.com|api\.kie\.ai/i.test(text)) {
    return {
      title: localized({
        zh: '无法连接图片/视频服务',
        en: 'Cannot reach the image or video service',
        vi: 'Không kết nối được dịch vụ ảnh hoặc video',
      }),
      message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
      suggestion: localized({
        zh: '本机当前连不上上游（常见于代理未放行或网络中断）。请检查网络/代理后重试，并确认后台 TokenFree 渠道密钥有效。',
        en: 'This machine cannot reach upstream right now (usually the proxy is blocking it, or the network dropped). Check the network or proxy and retry, and confirm the TokenFree channel key in the admin is valid.',
        vi: 'Máy này hiện không kết nối được phía thượng nguồn (thường do proxy chưa cho phép hoặc mạng bị đứt). Hãy kiểm tra mạng hoặc proxy rồi thử lại, đồng thời xác nhận khoá kênh TokenFree trong trang quản trị còn hiệu lực.',
      }),
    }
  }

  if (/^生图失败$/.test(text)) {
    return {
      title: localized({ zh: '生图失败', en: 'Image generation failed', vi: 'Tạo ảnh thất bại' }),
      message: localized({
        zh: '生图未成功，但旧任务未保存具体原因（多为上游连接失败且错误文案为空）。',
        en: 'The image was not generated, but the old job saved no reason (usually an upstream connection failure with an empty error message).',
        vi: 'Ảnh không tạo được, nhưng tác vụ cũ không lưu lại lý do cụ thể (thường là kết nối thượng nguồn thất bại mà thông báo lỗi bị bỏ trống).',
      }),
      suggestion: localized({
        zh: '请重新生成一次；新版本会写出明确错误。仍失败时检查 TokenFree 网络与密钥。',
        en: 'Generate it again; the new version reports a clear error. If it still fails, check TokenFree connectivity and the key.',
        vi: 'Hãy tạo lại một lần; phiên bản mới sẽ ghi rõ lỗi. Nếu vẫn lỗi, kiểm tra kết nối tới TokenFree và khoá truy cập.',
      }),
    }
  }

  if (isUpstreamAccountError(text) || (/Seedream error 403/i.test(text) && /AccountOverdue/i.test(text))) {
    return {
      title: localized({
        zh: '平台上游账户欠费',
        en: 'The platform upstream account is overdue',
        vi: 'Tài khoản thượng nguồn của hệ thống đã nợ phí',
      }),
      message: localized({
        zh: '上游 Seedream 模型账户余额不足，生图请求被拒绝。这是站点上游模型账户欠费，不是您个人钱包余额问题。',
        en: 'The upstream Seedream model account is out of credit, so the image request was rejected. This is the site’s upstream model account owing money, not your own wallet balance.',
        vi: 'Tài khoản mô hình Seedream phía thượng nguồn không đủ số dư nên yêu cầu tạo ảnh bị từ chối. Đây là tài khoản mô hình thượng nguồn của hệ thống bị nợ phí, không phải số dư ví của bạn.',
      }),
      suggestion: localized({
        zh: '请联系站点管理员在 TokenFree 控制台充值；充值完成后请重试生图。',
        en: 'Ask the site administrator to top up in the TokenFree console, then generate the image again.',
        vi: 'Vui lòng liên hệ quản trị viên để nạp thêm trên bảng điều khiển TokenFree, xong hãy tạo ảnh lại.',
      }),
      upstreamAccountBlocked: true,
    }
  }

  if (isBillingError(text)) {
    return {
      title: localized({ zh: '余额不足', en: 'Insufficient balance', vi: 'Số dư không đủ' }),
      message: /余额不足|请先充值/.test(text)
        ? text
        : localized({
            zh: '当前余额不足，无法继续生成。',
            en: 'Your balance is too low to keep generating.',
            vi: 'Số dư hiện tại không đủ để tiếp tục tạo.',
          }),
      suggestion: localized({
        zh: '请先充值后再重试该任务。',
        en: 'Top up first, then retry this job.',
        vi: 'Vui lòng nạp tiền rồi thử lại tác vụ này.',
      }),
      billingBlocked: true,
    }
  }

  if (
    /参考图疑似真人|PrivacyInformation|InputImageSensitive|SensitiveContentDetected|may contain real person/i.test(
      text,
    )
  ) {
    const idx = extractContentIndex(text)
    const named = text.match(/(角色|场景|道具|参考图)「([^」]+)」/)
    if (named) {
      return {
        title: localized({
          zh: '参考图疑似真人',
          en: 'Reference image looks like a real person',
          vi: 'Ảnh tham chiếu có thể là người thật',
        }),
        message: localized({
          zh: `视频服务审核未通过：${slotLabel(named[1])}「${named[2]}」的参考图可能含真人肖像，已拒绝生成。`,
          en: `The video service rejected this: the reference image for ${slotLabel(named[1])} “${named[2]}” may contain a real person’s likeness, so generation was refused.`,
          vi: `Dịch vụ video đã không duyệt: ảnh tham chiếu của ${slotLabel(named[1])} «${named[2]}» có thể chứa chân dung người thật nên đã bị từ chối tạo.`,
        }),
        suggestion: localized({
          zh: `请在左侧资产中打开「${named[2]}」，重新生成或上传偏动漫/插画的形象后再生成该分镜。`,
          en: `Open “${named[2]}” in the assets on the left, regenerate or upload a more illustrated look, then generate this shot again.`,
          vi: `Hãy mở «${named[2]}» trong phần tài nguyên bên trái, tạo lại hoặc tải lên một hình ảnh theo phong cách hoạt hình rồi tạo lại cảnh này.`,
        }),
      }
    }
    const where =
      idx != null
        ? localized({
            zh: `（提交内容第 ${idx + 1} 项 / content[${idx}]，多为角色或场景参考图）`,
            en: ` (item ${idx + 1} of the submitted content / content[${idx}], usually a character or scene reference image)`,
            vi: ` (mục thứ ${idx + 1} trong nội dung gửi đi / content[${idx}], thường là ảnh tham chiếu của nhân vật hoặc bối cảnh)`,
          })
        : localized({
            zh: '（某张参考图）',
            en: ' (one of the reference images)',
            vi: ' (một trong các ảnh tham chiếu)',
          })
    return {
      title: localized({
        zh: '参考图疑似真人',
        en: 'Reference image looks like a real person',
        vi: 'Ảnh tham chiếu có thể là người thật',
      }),
      message: localized({
        zh: `视频服务审核未通过：输入图片${where}可能含真人肖像，已拒绝生成。`,
        en: `The video service rejected this: the input image ${where} may contain a real person’s likeness, so generation was refused.`,
        vi: `Dịch vụ video đã không duyệt: ảnh đầu vào ${where} có thể chứa chân dung người thật nên đã bị từ chối tạo.`,
      }),
      suggestion: localized({
        zh: '打开左侧资产，为相关角色/场景重新用 AI 生成偏动漫或插画的形象（避免真人照片），或上传合规图后再重新生成该分镜。',
        en: 'Open the assets on the left and regenerate a more illustrated look for the character or scene with AI (avoid real photos), or upload a compliant image, then generate this shot again.',
        vi: 'Hãy mở phần tài nguyên bên trái và dùng AI tạo lại hình ảnh theo phong cách hoạt hình cho nhân vật hoặc bối cảnh liên quan (tránh ảnh người thật), hoặc tải lên một ảnh phù hợp quy định rồi tạo lại cảnh này.',
      }),
    }
  }

  if (/重试超过上限|超过重试上限|内部自动重试超过上限/.test(text)) {
    return {
      title: localized({
        zh: '多次生成仍失败',
        en: 'Still failing after several attempts',
        vi: 'Tạo nhiều lần vẫn thất bại',
      }),
      message: text,
      suggestion: localized({
        zh: '这是同一次任务内的自动重试耗尽，不是禁止你再点生成。请根据真实原因（常见是参考图真人审核）改素材或文案后，再重新点生成。',
        en: 'This is the automatic retry budget for one job running out, not a block on you generating again. Fix the asset or the text for the real reason (most often a real-person check on a reference image), then generate again.',
        vi: 'Đây là số lần tự thử lại trong cùng một tác vụ đã hết, không có nghĩa bạn không được bấm tạo lại. Hãy sửa tư liệu hoặc văn bản theo nguyên nhân thật, thường là ảnh tham chiếu bị kiểm tra vì có người thật, rồi bấm tạo lại.',
      }),
    }
  }

  if (/上一镜失败|无法衔接尾帧/.test(text)) {
    return {
      title: localized({
        zh: '无法衔接上一镜',
        en: 'Cannot continue from the previous shot',
        vi: 'Không nối được với cảnh trước',
      }),
      message: localized({
        zh: '本镜依赖上一镜的尾帧衔接，但上一镜未成功，因此本镜未开始生成。',
        en: 'This shot depends on the tail frame of the previous one, but that shot failed, so this one never started.',
        vi: 'Cảnh này phụ thuộc vào khung hình cuối của cảnh trước, nhưng cảnh trước đã thất bại nên cảnh này chưa bắt đầu tạo.',
      }),
      suggestion: localized({
        zh: '先修复并重新生成失败的上一镜，再按镜序生成后续片段。',
        en: 'Fix and regenerate the failed shot first, then generate the rest in order.',
        vi: 'Hãy sửa và tạo lại cảnh trước đã lỗi, rồi tạo tiếp các cảnh còn lại theo đúng thứ tự.',
      }),
    }
  }

  if (/分镜已变更|分镜上下文丢失|分镜不存在/.test(text)) {
    return {
      title: localized({
        zh: '分镜已更新',
        en: 'The storyboard has changed',
        vi: 'Storyboard đã được cập nhật',
      }),
      message: localized({
        zh: '分镜在生成过程中被保存或重切，旧任务已失效。',
        en: 'The storyboard was saved or re-split during generation, so the old job is no longer valid.',
        vi: 'Storyboard bị lưu lại hoặc chia lại trong lúc đang tạo, nên tác vụ cũ không còn hiệu lực.',
      }),
      suggestion: localized({
        zh: '请回到分集页，用当前分镜列表重新点生成；不要重试旧任务。',
        en: 'Go back to the episode page and generate again from the current storyboard list. Do not retry the old job.',
        vi: 'Hãy quay lại trang tập, dùng danh sách storyboard hiện tại rồi bấm tạo lại. Đừng thử lại tác vụ cũ.',
      }),
    }
  }

  if (/InputTextSensitive|text.*sensitive|敏感/i.test(text) && /Seedance|create error/i.test(text)) {
    return {
      title: localized({
        zh: '文案未通过审核',
        en: 'The text failed review',
        vi: 'Văn bản không qua duyệt',
      }),
      message: localized({
        zh: '分镜脚本或提示词触发了内容安全审核。',
        en: 'The storyboard script or prompt triggered the content-safety check.',
        vi: 'Kịch bản storyboard hoặc prompt đã kích hoạt bộ lọc an toàn nội dung.',
      }),
      suggestion: localized({
        zh: '请修改分镜中的敏感表述后重试。',
        en: 'Reword the sensitive parts of the storyboard and try again.',
        vi: 'Hãy sửa các từ ngữ nhạy cảm trong storyboard rồi thử lại.',
      }),
    }
  }

  if (/resource download failed|audio_url/i.test(text) && !/audio duration/i.test(text)) {
    return {
      title: localized({
        zh: '参考音频无法下载',
        en: 'Cannot download the reference audio',
        vi: 'Không tải được âm thanh tham chiếu',
      }),
      message: localized({
        zh: '音色参考文件地址无效或暂时无法访问。',
        en: 'The voice sample file address is invalid or temporarily unreachable.',
        vi: 'Địa chỉ tệp âm thanh mẫu không hợp lệ hoặc tạm thời không truy cập được.',
      }),
      suggestion: localized({
        zh: '检查角色绑定的试听音频，重新生成或更换音色后再试。',
        en: 'Check the voice sample attached to the character, then regenerate or switch voice and retry.',
        vi: 'Kiểm tra âm thanh thử đang gắn với nhân vật, rồi tạo lại hoặc đổi giọng đọc rồi thử tiếp.',
      }),
    }
  }

  // Seedance r2v：reference_audio 须 ≥ 1.8 秒（不是参考图）
  if (/audio duration|参考音频过短|1\.8/i.test(text) && /audio|音色|reference_audio|content\[/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null
        ? localized({
            zh: `提交内容第 ${idx + 1} 项 / content[${idx}]（参考音频，不是图片）`,
            en: `item ${idx + 1} of the submitted content / content[${idx}] (reference audio, not an image)`,
            vi: `mục thứ ${idx + 1} trong nội dung gửi đi / content[${idx}] (âm thanh tham chiếu, không phải ảnh)`,
          })
        : localized({
            zh: '某条角色/旁白音色',
            en: 'one of the character or narration voices',
            vi: 'một trong các giọng nhân vật hoặc lời dẫn',
          }))
    return {
      title: localized({
        zh: '参考音频过短',
        en: 'The reference audio is too short',
        vi: 'Âm thanh tham chiếu quá ngắn',
      }),
      message: localized({
        zh: `视频服务要求参考音频时长 ≥ 1.8 秒，当前过短：${where}。`,
        en: `The video service requires reference audio of at least 1.8 seconds, and this one is shorter: ${where}.`,
        vi: `Dịch vụ video yêu cầu âm thanh tham chiếu dài ít nhất 1,8 giây, nhưng âm thanh này quá ngắn: ${where}.`,
      }),
      suggestion: localized({
        zh: '打开左侧对应角色或旁白资产，重新生成/上传更长的试听音频（建议 ≥ 2 秒）后再生成该分镜。这不是参考图问题。',
        en: 'Open the matching character or narration asset on the left, regenerate or upload a longer sample (at least 2 seconds), then generate this shot. This is not a reference-image problem.',
        vi: 'Hãy mở tài nguyên nhân vật hoặc lời dẫn tương ứng bên trái, tạo lại hoặc tải lên âm thanh thử dài hơn, khuyến nghị ít nhất 2 giây, rồi tạo lại cảnh này. Đây không phải vấn đề ảnh tham chiếu.',
      }),
    }
  }

  if (/only support adaptive aspect ratio|adaptive aspect ratio/i.test(text)) {
    return {
      title: localized({
        zh: '画幅参数不兼容',
        en: 'Incompatible aspect ratio',
        vi: 'Tham số khung hình không tương thích',
      }),
      message: localized({
        zh: '当前视频通道的图生视频若走单首帧，固定比例可能被拒绝。',
        en: 'For image-to-video on this video channel, a fixed ratio may be rejected when only the first frame is used.',
        vi: 'Với ảnh ra video trên kênh video này, nếu chỉ dùng khung hình đầu thì tỉ lệ cố định có thể bị từ chối.',
      }),
      suggestion: localized({
        zh: '请重新生成该分镜；服务端会按参考图自适应画幅。',
        en: 'Generate this shot again; the server adapts the frame to the reference image.',
        vi: 'Hãy tạo lại cảnh này; máy chủ sẽ tự điều chỉnh khung hình theo ảnh tham chiếu.',
      }),
    }
  }

  if (/Credits insufficient|积分不足|余额不足.*[Kk]ie|Kie.*积分/i.test(text)) {
    return {
      title: localized({
        zh: '视频渠道积分不足',
        en: 'The video channel is out of credits',
        vi: 'Kênh video đã hết điểm',
      }),
      message: localized({
        zh: '上游账户积分不足，无法创建视频生成任务（不是参考图或音频时长问题）。',
        en: 'The upstream account is out of credits, so the video job could not be created (this is not a reference-image or audio-length problem).',
        vi: 'Tài khoản thượng nguồn không đủ điểm nên không tạo được tác vụ tạo video. Đây không phải vấn đề ảnh tham chiếu hay thời lượng âm thanh.',
      }),
      suggestion: localized({
        zh: '请联系管理员在 TokenFree 控制台充值后再重试；充值后重新生成该分镜即可。',
        en: 'Ask the administrator to top up in the TokenFree console, then retry. Once topped up, just generate this shot again.',
        vi: 'Vui lòng liên hệ quản trị viên để nạp thêm trên bảng điều khiển TokenFree rồi thử lại. Nạp xong chỉ cần tạo lại cảnh này.',
      }),
      upstreamAccountBlocked: true,
    }
  }

  if (/File type not supported|参考图格式不支持|不支持 SVG/i.test(text)) {
    return {
      title: localized({
        zh: '参考图格式不支持',
        en: 'Unsupported reference image format',
        vi: 'Định dạng ảnh tham chiếu không được hỗ trợ',
      }),
      message: text.includes('参考图格式不支持')
        ? text
        : localized({
            zh: '上游拒绝了参考图：File type not supported（常见原因是 SVG 占位图或非位图）。',
            en: 'Upstream rejected the reference image: File type not supported (usually an SVG placeholder or a non-bitmap file).',
            vi: 'Phía thượng nguồn đã từ chối ảnh tham chiếu: File type not supported (nguyên nhân thường gặp là ảnh SVG dự phòng hoặc ảnh không phải bitmap).',
          }),
      suggestion: localized({
        zh: '检查本镜引用的角色/场景/道具封面是否为 PNG/JPG/WEBP。若仍是 SVG 占位图，请对该资产重新生图或上传位图后再生成视频。',
        en: 'Check that the character, scene, or prop covers this shot uses are PNG, JPG, or WEBP. If they are still SVG placeholders, regenerate the image for that asset or upload a bitmap, then generate the video again.',
        vi: 'Kiểm tra ảnh bìa của nhân vật, bối cảnh hoặc đạo cụ mà cảnh này dùng có phải PNG, JPG hay WEBP không. Nếu vẫn là SVG dự phòng, hãy tạo lại ảnh cho tài nguyên đó hoặc tải lên ảnh bitmap rồi tạo video lại.',
      }),
    }
  }

  if (/Seedance create error\s*400|Kie createTask error/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null
        ? localized({
            zh: `（提交内容第 ${idx + 1} 项 / content[${idx}]）`,
            en: ` (item ${idx + 1} of the submitted content / content[${idx}])`,
            vi: ` (mục thứ ${idx + 1} trong nội dung gửi đi / content[${idx}])`,
          })
        : '')
    return {
      title: localized({
        zh: '视频服务拒绝请求',
        en: 'The video service refused the request',
        vi: 'Dịch vụ video từ chối yêu cầu',
      }),
      message: localized({
        zh: `上游返回参数或内容错误，未能创建生成任务${where}。`,
        en: `Upstream returned a parameter or content error, so the job could not be created${where}.`,
        vi: `Phía thượng nguồn trả về lỗi tham số hoặc nội dung nên không tạo được tác vụ${where}.`,
      }),
      suggestion: localized({
        zh: '检查本镜参考图、参考音频时长（须 ≥ 1.8 秒）与脚本后重试；若持续失败请联系客服并提供任务号。',
        en: 'Check this shot’s reference image, reference audio length (at least 1.8 seconds), and script, then retry. If it keeps failing, contact support with the job ID.',
        vi: 'Kiểm tra ảnh tham chiếu, thời lượng âm thanh tham chiếu (ít nhất 1,8 giây) và kịch bản của cảnh này rồi thử lại. Nếu vẫn lỗi, hãy liên hệ bộ phận hỗ trợ kèm mã tác vụ.',
      }),
    }
  }

  if (/Seedance|上游生成失败/i.test(text)) {
    return {
      title: localized({ zh: '视频生成失败', en: 'Video generation failed', vi: 'Tạo video thất bại' }),
      message: text.length > 160 ? `${text.slice(0, 160)}…` : text,
      suggestion: localized({
        zh: '可稍后重试该分镜；连续失败时请更换参考图或简化脚本。',
        en: 'Retry this shot later. If it keeps failing, change the reference image or simplify the script.',
        vi: 'Bạn có thể thử lại cảnh này sau. Nếu liên tục lỗi, hãy đổi ảnh tham chiếu hoặc rút gọn kịch bản.',
      }),
    }
  }

  if (/跳过重复任务|分镜已生成完成/.test(text)) {
    return {
      title: localized({ zh: '旧任务已跳过', en: 'The old job was skipped', vi: 'Tác vụ cũ đã bị bỏ qua' }),
      message: localized({
        zh: '调度器发现该分镜已有成片，因此取消了这条重复入队的旧任务。',
        en: 'The scheduler found this shot already has a finished film, so it cancelled this duplicate older job.',
        vi: 'Bộ lập lịch thấy cảnh này đã có phim hoàn chỉnh nên đã huỷ tác vụ cũ bị xếp hàng lặp lại.',
      }),
      suggestion: localized({
        zh: '若你是在「重新生成」，请看队列里是否还有进行中的新任务；没有的话再点一次重新生成。不要把这条旧取消当成当前失败。',
        en: 'If you clicked regenerate, check whether a newer job is still running in the queue. If there is none, click regenerate once more. Do not read this cancellation as a current failure.',
        vi: 'Nếu bạn vừa bấm tạo lại, hãy xem trong hàng đợi còn tác vụ mới nào đang chạy không. Nếu không có thì bấm tạo lại thêm một lần. Đừng hiểu dòng huỷ này là lỗi hiện tại.',
      }),
    }
  }

  if (/已取消|任务已中断/.test(text)) {
    return {
      title: text.includes('取消')
        ? localized({ zh: '已取消', en: 'Cancelled', vi: 'Đã huỷ' })
        : localized({ zh: '任务已中断', en: 'The job was interrupted', vi: 'Tác vụ đã bị gián đoạn' }),
      message: text,
      suggestion: localized({
        zh: '需要成片时请重新入队生成。',
        en: 'Queue a new job when you need the finished film.',
        vi: 'Khi cần phim hoàn chỉnh, hãy tạo tác vụ mới.',
      }),
    }
  }

  // Đã là câu tiếng Trung ngắn: hiển thị nguyên văn, chỉ bổ sung gợi ý chung
  if (!/[{[\]"]/.test(text) && text.length <= 120 && /[\u4e00-\u9fff]/.test(text)) {
    return {
      title: localized({ zh: '生成失败', en: 'Generation failed', vi: 'Tạo thất bại' }),
      message: text,
      suggestion: localized({
        zh: '请按提示处理后重新生成该分镜。',
        en: 'Handle what the message says, then generate this shot again.',
        vi: 'Hãy xử lý theo thông báo rồi tạo lại cảnh này.',
      }),
    }
  }

  return {
    title: localized({ zh: '生成失败', en: 'Generation failed', vi: 'Tạo thất bại' }),
    message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
    suggestion: localized({
      zh: '请检查本镜参考图与脚本后重试。',
      en: 'Check this shot’s reference image and script, then retry.',
      vi: 'Hãy kiểm tra ảnh tham chiếu và kịch bản của cảnh này rồi thử lại.',
    }),
  }
}

/** Hiện popup khi tạo thất bại (gồm cả nợ phía upstream / hết tiền trong ví người dùng) */
export async function alertDramaGenError(raw: unknown): Promise<void> {
  const text = raw instanceof Error ? raw.message : String(raw || '')
  const view = formatDramaGenError(text)
  const body = [view.message, view.suggestion].filter(Boolean).join('\n\n')
  await dialog.alert({
    title: view.title,
    message: body || view.title,
    tone: 'danger',
  })
}
