/** Trình soạn thảo kịch bản của tập: render và nối lại các chip thời lượng / tài nguyên dạng inline */
import { localized, type LocalizedText } from './localeStrings'

/** Văn bản hiển thị trên chip của trình soạn thảo; tiếng Trung chỉ phục vụ locale zh. */
const COPY: Record<string, LocalizedText> = {
  unnamedAsset: { zh: '资产', en: 'Asset', vi: 'Tài nguyên' },
  assetInitial: { zh: '资', en: 'A', vi: 'T' },
  durationChipTitle: {
    zh: '时长 {seconds}s，编辑时点击切换',
    en: '{seconds}s. Click to change it while editing.',
    vi: '{seconds} giây. Bấm để đổi khi đang soạn.',
  },
}

export type DramaMentionChipData = {
  assetId: number
  label: string
  previewUrl: string | null
}

export const DURATION_CHIP_SELECTOR = '[data-duration-sec]'
export const MENTION_CHIP_SELECTOR = "[data-mention='true']"
export const CONTENT_TOKEN_PATTERN = /@(asset:\d+|duration:\d+)/g
export const DURATION_PRESET_OPTIONS = [3, 4, 5, 8, 10, 12, 15] as const
/** Storyboard mới khuyến nghị: tổng @duration tối đa trong một cảnh (giây) */
export const FRAGMENT_CONTENT_DURATION_MAX = 15
/** Trần cứng của Seedance cho một cảnh / API (giây); bản cũ có thể cao hơn giá trị khuyến nghị */
export const DRAMA_SHOT_DURATION_HARD_MAX = 30
/** @duration nhỏ nhất của một đoạn (giây) */
export const DRAMA_SEGMENT_DURATION_MIN = 3
/** Storyboard mới khuyến nghị: @duration lớn nhất của một đoạn (giây) */
export const DRAMA_SEGMENT_DURATION_MAX = 15
/** Trần cứng API cho @duration của một đoạn (giây) */
export const DRAMA_SEGMENT_DURATION_HARD_MAX = 30

const BLOCK_ELEMENT_TAGS = new Set(['DIV', 'P'])

export type MentionCaretRect = {
  top: number
  left: number
  bottom: number
}

// Icon bảng ghi (SVG nội tuyến, tránh phụ thuộc react-dom/server)
function createClapperboardIconElement() {
  const iconWrap = document.createElement('span')
  iconWrap.className = 'drama-ep-chip-icon'
  iconWrap.setAttribute('aria-hidden', 'true')
  iconWrap.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>'
  return iconWrap
}

// Kiểm tra một node có nằm trong chip tham chiếu hay không
function isInsideMentionChip(node: Node | null) {
  if (!node) return false
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return Boolean(element?.closest(MENTION_CHIP_SELECTOR))
}

// Có phải là phần tử chip tài nguyên / thời lượng không
function isEditorChipElement(node: Node | null): node is HTMLElement {
  return Boolean(
    node &&
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).dataset?.mention === 'true',
  )
}

// Khoảng trắng rỗng hoặc ký tự zero-width có thể bỏ qua
function isIgnorableEditorText(node: Node | null) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  return !(node.textContent || '').replace(/[\u200b\uFEFF]/g, '')
}

// Node chữ chỉ gồm dấu cách (khoảng tách chèn sau chip)
function isSpacerTextNode(node: Node | null): node is Text {
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  const text = node.textContent || ''
  return text.length > 0 && /^[\s\u00a0]+$/.test(text)
}

// Đi ngược từ node lên để tìm chip chủ sở hữu
function closestEditorChip(node: Node | null, root: HTMLElement): HTMLElement | null {
  if (!node || !root.contains(node)) return null
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const chip = element?.closest(MENTION_CHIP_SELECTOR) as HTMLElement | null
  return chip && root.contains(chip) ? chip : null
}

/**
 * Xoá chip contentEditable=false kề vị trí con trỏ.
 * Trình duyệt thường không xử lý Backspace/Delete trên chip không sửa được, nên phải tự gỡ.
 * Trả về true nghĩa là đã xử lý.
 */
export function deleteAdjacentEditorChip(
  root: HTMLElement,
  direction: 'backward' | 'forward',
): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false
  const { anchorNode, anchorOffset } = selection
  if (!anchorNode || !root.contains(anchorNode)) return false

  const inside = closestEditorChip(anchorNode, root)
  if (inside) {
    placeCaretAndRemoveChip(selection, inside, null)
    return true
  }

  let chip: HTMLElement | null = null
  let spacer: Node | null = null

  if (direction === 'backward') {
    if (anchorNode.nodeType === Node.TEXT_NODE) {
      const text = anchorNode.textContent || ''
      if (anchorOffset === 0) {
        let prev: Node | null = anchorNode.previousSibling
        while (prev && isIgnorableEditorText(prev)) prev = prev.previousSibling
        if (isSpacerTextNode(prev) && isEditorChipElement(prev.previousSibling)) {
          chip = prev.previousSibling
          spacer = prev
        } else if (isEditorChipElement(prev)) {
          chip = prev
        }
      } else if (anchorOffset === text.length && isSpacerTextNode(anchorNode) && text.length <= 2) {
        /* Con trỏ ở cuối khoảng tách sau chip: xoá cả khoảng trắng lẫn chip */
        const prev = anchorNode.previousSibling
        if (isEditorChipElement(prev)) {
          chip = prev
          spacer = anchorNode
        }
      } else if (
        anchorOffset > 0 &&
        isSpacerTextNode(anchorNode) &&
        /^[\s\u00a0]$/.test(text.slice(anchorOffset - 1, anchorOffset)) &&
        isEditorChipElement(anchorNode.previousSibling)
      ) {
        /* Con trỏ nằm trong khoảng tách: xoá khoảng trắng và chip */
        chip = anchorNode.previousSibling
        spacer = anchorNode
      }
    } else if (anchorNode.nodeType === Node.ELEMENT_NODE && anchorOffset > 0) {
      let prev: Node | null = anchorNode.childNodes[anchorOffset - 1] || null
      while (prev && isIgnorableEditorText(prev)) {
        prev = prev.previousSibling
      }
      if (isSpacerTextNode(prev) && isEditorChipElement(prev.previousSibling)) {
        chip = prev.previousSibling
        spacer = prev
      } else if (isEditorChipElement(prev)) {
        chip = prev
      }
    }
  } else if (direction === 'forward') {
    if (anchorNode.nodeType === Node.TEXT_NODE) {
      const text = anchorNode.textContent || ''
      if (anchorOffset >= text.length) {
        let next: Node | null = anchorNode.nextSibling
        while (next && isIgnorableEditorText(next)) next = next.nextSibling
        if (isEditorChipElement(next)) {
          chip = next
          const after = next.nextSibling
          if (isSpacerTextNode(after)) spacer = after
        } else if (isSpacerTextNode(next) && isEditorChipElement(next.nextSibling)) {
          spacer = next
          chip = next.nextSibling
        }
      }
    } else if (anchorNode.nodeType === Node.ELEMENT_NODE) {
      let next: Node | null = anchorNode.childNodes[anchorOffset] || null
      while (next && isIgnorableEditorText(next)) next = next.nextSibling
      if (isEditorChipElement(next)) {
        chip = next
        const after = next.nextSibling
        if (isSpacerTextNode(after)) spacer = after
      } else if (isSpacerTextNode(next) && isEditorChipElement(next.nextSibling)) {
        spacer = next
        chip = next.nextSibling
      }
    }
  }

  if (!chip || !root.contains(chip)) return false
  placeCaretAndRemoveChip(selection, chip, spacer)
  return true
}

// Gỡ chip (kèm khoảng tách nếu có), đặt con trỏ về đúng chỗ cũ
function placeCaretAndRemoveChip(
  selection: Selection,
  chip: HTMLElement,
  spacer: Node | null,
) {
  const caretRange = document.createRange()
  caretRange.setStartBefore(chip)
  caretRange.collapse(true)
  spacer?.parentNode?.removeChild(spacer)
  chip.remove()
  selection.removeAllRanges()
  selection.addRange(caretRange)
}

// Nối văn bản có ký tự xuống dòng thành Text + <br>
function appendTextWithLineBreaks(root: HTMLElement, text: string) {
  const parts = text.split('\n')
  parts.forEach((part, index) => {
    if (part) root.appendChild(document.createTextNode(part))
    if (index < parts.length - 1) root.appendChild(document.createElement('br'))
  })
}

// Tạo chip tham chiếu tài nguyên dạng inline
export function createMentionChipElement(chip: DramaMentionChipData) {
  const chipEl = document.createElement('span')
  chipEl.className = 'drama-ep-mention-chip drama-ep-editor-chip'
  chipEl.contentEditable = 'false'
  chipEl.dataset.mention = 'true'
  chipEl.dataset.assetId = String(chip.assetId)

  const thumbEl = document.createElement('span')
  thumbEl.className = 'drama-ep-mention-chip-thumb'
  if (chip.previewUrl) {
    const image = document.createElement('img')
    image.src = chip.previewUrl
    image.alt = chip.label
    image.draggable = false
    thumbEl.appendChild(image)
  } else {
    thumbEl.className += ' is-fallback'
    thumbEl.textContent = chip.label[0] || localized(COPY.assetInitial)
  }
  chipEl.appendChild(thumbEl)

  const labelEl = document.createElement('span')
  labelEl.className = 'drama-ep-mention-chip-label'
  labelEl.textContent = chip.label
  chipEl.appendChild(labelEl)
  return chipEl
}

// Tạo chip thời lượng dạng inline
export function createDurationChipElement(seconds: number) {
  const chipEl = document.createElement('span')
  chipEl.className = 'drama-ep-duration-chip drama-ep-editor-chip'
  chipEl.contentEditable = 'false'
  chipEl.dataset.mention = 'true'
  chipEl.dataset.durationSec = String(seconds)
  chipEl.title = localized(COPY.durationChipTitle).replace('{seconds}', String(seconds))

  const labelEl = document.createElement('span')
  labelEl.dataset.durationLabel = 'true'
  labelEl.textContent = `${seconds}s`

  chipEl.appendChild(createClapperboardIconElement())
  chipEl.appendChild(labelEl)
  return chipEl
}

// Cập nhật số giây của chip thời lượng đã có
export function updateDurationChipElement(chipEl: HTMLElement, seconds: number) {
  chipEl.dataset.durationSec = String(seconds)
  chipEl.title = localized(COPY.durationChipTitle).replace('{seconds}', String(seconds))
  const labelEl = chipEl.querySelector<HTMLElement>('[data-duration-label]')
  if (labelEl) labelEl.textContent = `${seconds}s`
}

// Khi bấm chip thời lượng trên bảng ghi, xoay vòng qua các mốc đã đặt
export function nextDurationPresetSeconds(current: number) {
  const presets = DURATION_PRESET_OPTIONS
  const idx = presets.findIndex((sec) => sec === current)
  if (idx < 0) {
    const next = presets.find((sec) => sec > current)
    return next ?? presets[presets.length - 1]
  }
  return presets[(idx + 1) % presets.length]
}

// Chèn chip thời lượng tại vị trí Range
export function insertDurationChipAtRange(range: Range, seconds: number) {
  const selection = window.getSelection()
  range.deleteContents()
  const chipEl = createDurationChipElement(seconds)
  const trailingSpace = document.createTextNode(' ')
  range.insertNode(trailingSpace)
  range.insertNode(chipEl)
  if (!selection) return
  const caretRange = document.createRange()
  caretRange.setStartAfter(trailingSpace)
  caretRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(caretRange)
}

// Chèn văn bản thuần tại vị trí Range (tiền tố cử động máy / cỡ cảnh…)
export function insertPlainTextAtRange(range: Range, text: string) {
  const selection = window.getSelection()
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  if (!selection) return
  const caretRange = document.createRange()
  caretRange.setStartAfter(node)
  caretRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(caretRange)
}

// Chèn chip tài nguyên tại vị trí Range
export function insertMentionChipAtRange(range: Range, chip: DramaMentionChipData) {
  const selection = window.getSelection()
  range.deleteContents()
  const chipEl = createMentionChipElement(chip)
  const trailingSpace = document.createTextNode(' ')
  range.insertNode(trailingSpace)
  range.insertNode(chipEl)
  if (!selection) return
  const caretRange = document.createRange()
  caretRange.setStartAfter(trailingSpace)
  caretRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(caretRange)
}

// Nối DOM của trình soạn thảo thành chuỗi content
export function serializePromptEditorContent(root: HTMLElement) {
  let result = ''

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (isInsideMentionChip(node)) return
      result += node.textContent ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.tagName === 'BR') {
      result += '\n'
      return
    }
    if (element.dataset.mention === 'true' && element.dataset.durationSec) {
      result += `@duration:${element.dataset.durationSec}`
      return
    }
    if (element.dataset.mention === 'true' && element.dataset.assetId) {
      result += `@asset:${element.dataset.assetId}`
      return
    }
    if (BLOCK_ELEMENT_TAGS.has(element.tagName) && element !== root) {
      if (result.length > 0 && !result.endsWith('\n')) result += '\n'
      element.childNodes.forEach((child) => walk(child))
      return
    }
    element.childNodes.forEach((child) => walk(child))
  }

  root.childNodes.forEach((child) => walk(child))
  return result
}

// Render DOM của trình soạn thảo theo content
export function renderPromptEditorContent(
  root: HTMLElement,
  content: string,
  resolveChip: (assetId: number) => DramaMentionChipData | null,
) {
  root.replaceChildren()
  if (!content) return

  let lastIndex = 0
  for (const match of content.matchAll(CONTENT_TOKEN_PATTERN)) {
    const matchIndex = match.index ?? 0
    const token = match[1]
    if (matchIndex > lastIndex) {
      appendTextWithLineBreaks(root, content.slice(lastIndex, matchIndex))
    }
    if (token.startsWith('duration:')) {
      const seconds = Number(token.slice('duration:'.length))
      if (Number.isFinite(seconds) && seconds > 0) {
        root.appendChild(createDurationChipElement(seconds))
      } else {
        appendTextWithLineBreaks(root, match[0])
      }
    } else if (token.startsWith('asset:')) {
      const assetId = Number(token.slice('asset:'.length))
      const chipData = resolveChip(assetId)
      if (chipData) root.appendChild(createMentionChipElement(chipData))
      else appendTextWithLineBreaks(root, match[0])
    } else {
      appendTextWithLineBreaks(root, match[0])
    }
    lastIndex = matchIndex + match[0].length
  }
  if (lastIndex < content.length) {
    appendTextWithLineBreaks(root, content.slice(lastIndex))
  }
}

// @asset:id / @duration:n đã lưu không tính là dấu @ đang được gõ
function isCompletedContentToken(token: string) {
  return /^@(asset|duration):\d+$/.test(token)
}

// Nối phần nội dung "từ đầu trình soạn thảo tới con trỏ" (chip vẫn là @asset:id)
export function serializePromptEditorContentBeforeCaret(root: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const anchorNode = selection.anchorNode
  if (!anchorNode || !root.contains(anchorNode) || isInsideMentionChip(anchorNode)) {
    return null
  }
  try {
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(anchorNode, selection.anchorOffset)
    const holder = document.createElement('div')
    holder.appendChild(range.cloneContents())
    return serializePromptEditorContent(holder)
  } catch {
    return null
  }
}

/**
 * Phân tích xem hiện có đang gõ tham chiếu @ hay không.
 * Ưu tiên node chữ đang chứa con trỏ; nếu không có thì dùng phần đã nối trước con trỏ (bỏ khoảng trắng cuối để xuống dòng sau chip không phá kết quả khớp).
 */
export function detectActiveMentionTrigger(root: HTMLElement): {
  query: string
  range: Range | null
} | null {
  const fromSel = detectMentionTriggerFromSelection(root)
  if (fromSel) {
    if (/^(asset|duration):\d+$/.test(fromSel.query)) return null
    return { query: fromSel.query, range: fromSel.range }
  }
  const before = serializePromptEditorContentBeforeCaret(root)
  const text = (before ?? serializePromptEditorContent(root)).replace(/\s+$/u, '')
  const match = text.match(/@([^\s@]*)$/)
  if (!match || isCompletedContentToken(match[0])) return null
  return { query: match[1] || '', range: null }
}

// Phân tích dấu @ kích hoạt từ vùng chọn
export function detectMentionTriggerFromSelection(root: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const anchorNode = selection.anchorNode
  if (
    !anchorNode ||
    !root.contains(anchorNode) ||
    anchorNode.nodeType !== Node.TEXT_NODE ||
    isInsideMentionChip(anchorNode)
  ) {
    return null
  }
  const textNode = anchorNode as Text
  const textBefore = textNode.textContent?.slice(0, selection.anchorOffset) ?? ''
  const match = textBefore.match(/@([^\s@]*)$/)
  if (!match || match.index === undefined) return null
  const triggerRange = document.createRange()
  triggerRange.setStart(textNode, match.index)
  triggerRange.setEnd(textNode, selection.anchorOffset)
  return { query: match[1], range: triggerRange }
}

// Lấy toạ độ con trỏ trên màn hình
export function getCaretClientRect(): MentionCaretRect | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0).cloneRange()
  range.collapse(true)
  const rects = range.getClientRects()
  if (rects.length > 0) {
    const rect = rects[rects.length - 1]
    return { top: rect.top, left: rect.left, bottom: rect.bottom }
  }
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  range.insertNode(marker)
  const rect = marker.getBoundingClientRect()
  marker.parentNode?.removeChild(marker)
  selection.removeAllRanges()
  selection.addRange(range)
  return { top: rect.top, left: rect.left, bottom: rect.bottom }
}

// Cộng tổng số giây @duration trong content
export function sumContentDurationSeconds(content: string) {
  let total = 0
  const re = /@duration:(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const sec = Number(m[1])
    if (Number.isFinite(sec) && sec > 0) total += sec
  }
  return total
}

// Dựng dữ liệu chip từ DramaAsset
export function resolveChipFromAsset(
  asset: { id: number; name?: string | null; cover?: string | null; url?: string | null },
  previewUrl: string,
): DramaMentionChipData {
  return {
    assetId: asset.id,
    label: asset.name || `${localized(COPY.unnamedAsset)} ${asset.id}`,
    previewUrl: previewUrl || null,
  }
}
