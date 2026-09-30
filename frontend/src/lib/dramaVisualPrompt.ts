/** Đọc/ghép prompt tạo ảnh từ params của tài nguyên (khớp manju buildCharacterParams và phát hiện prompt yếu) */
import type { DramaAsset } from '../api/drama'

const WEAK_PROMPT = /^(character|scene|prop|material|none|image|audio|video)\s+\S+$/i

const GENERIC_MARKERS = [
  '影视级写实环境空间',
  '构图层次分明、光影有戏剧张力',
  '适合短剧横屏拍摄',
  '影视级写实场景，构图清晰，适合短剧拍摄',
  '影视级写实人物',
  '白底全身定妆照',
]

const MIN_LEN: Record<string, number> = {
  character: 120,
  scene: 100,
  prop: 70,
  material: 70,
  video: 8,
}

//  có phải câu bộc lệch mẫu không
function isGenericTemplate(text: string): boolean {
  if (text.length >= 180) return false
  return GENERIC_MARKERS.some((m) => text.includes(m))
}

// Kiểm tra prompt có quá ngắn, là placeholder hay bộc lệch mẫu không
function isWeakVisualPrompt(prompt: string, assetName: string, kind: string): boolean {
  const text = prompt.trim()
  /* Nội dung có tham chiếu @asset: là chữ người dùng viết, không được xoá như placeholder yếu */
  if (/@asset:\d+/.test(text)) return false
  const kindLower = kind.toLowerCase()
  const minLen = MIN_LEN[kindLower] ?? 60
  if (text.length < minLen) return true
  const name = assetName.trim()
  if (name && (text.toLowerCase() === `${kindLower} ${name}`.toLowerCase() || text === name)) {
    return true
  }
  if (WEAK_PROMPT.test(text)) return true
  if (isGenericTemplate(text)) return true
  return false
}

// Ghép theo quy tắc buildCharacterParams của manju
function manjuJoinCharacterPrompt(params: Record<string, unknown>): string {
  const visual = String(params.visualImage || params.visualPrompt || '').trim()
  const title = String(params.title || '').trim()
  const roleType = String(params.roleType || '').trim()
  const coreTags = String(params.coreTags || '').trim()
  const personality = String(params.personality || '').trim()
  const parts = [
    visual,
    title ? `身份：${title}` : '',
    roleType ? `定位：${roleType}` : '',
    coreTags ? `标签：${coreTags}` : '',
    personality ? `性格：${personality}` : '',
  ].filter(Boolean)
  return parts.join('。')
}

/**
 * Đọc prompt hình ảnh của tài nguyên: ưu tiên mô tả đầy đủ, nếu quá ngắn hoặc bộc lệch mẫu thì ghép từ các trường nhân vật.
 */
export function readVisualPrompt(asset: DramaAsset): string {
  const params = (asset.params || {}) as Record<string, unknown>
  const kind = (asset.type || '').toLowerCase()
  const name = asset.name || ''

  const canvas = params.canvas
  const canvasGen =
    canvas && typeof canvas === 'object'
      ? (canvas as Record<string, unknown>).generation
      : null
  const canvasPrompt =
    canvasGen && typeof canvasGen === 'object'
      ? String((canvasGen as Record<string, unknown>).prompt || '').trim()
      : ''
  const stored =
    String(params.visualPrompt || params.visualImage || canvasPrompt || '').trim()

  if (stored && !isWeakVisualPrompt(stored, name, kind)) {
    return stored
  }

  if (kind === 'character') {
    const composed = manjuJoinCharacterPrompt(params)
    if (composed && !isWeakVisualPrompt(composed, name, kind)) return composed
  }

  if (kind === 'scene' && name) {
    return `场景：${name}，影视级写实场景，构图清晰，适合短剧拍摄`
  }

  if (stored) return stored
  return `${kind} ${name}`.trim()
}

/**
 * Prompt dùng cho canvas / trình sửa: lọc các placeholder yếu kiểu "character 新角色" để không lấp nhầm.
 */
export function readEditableVisualPrompt(asset: DramaAsset): string {
  const kind = (asset.type || '').toLowerCase()
  const name = asset.name || ''
  const prompt = readVisualPrompt(asset).trim()
  if (!prompt || isWeakVisualPrompt(prompt, name, kind)) return ''
  return prompt
}

/** Văn bản có phải prompt hình ảnh yếu (placeholder / quá ngắn / bộc lệch mẫu) không */
export function isWeakEditablePrompt(prompt: string, name = '', kind = ''): boolean {
  return isWeakVisualPrompt(prompt, name, kind)
}
