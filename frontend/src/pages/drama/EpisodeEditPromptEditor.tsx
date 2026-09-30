/** contentEditable cho kịch bản tập: chip thời lượng/tài nguyên + popover khi gõ @ */
import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveDramaMediaUrl, type DramaAsset } from '../../api/drama'
import {
  deleteAdjacentEditorChip,
  detectMentionTriggerFromSelection,
  getCaretClientRect,
  insertDurationChipAtRange,
  insertMentionChipAtRange,
  insertPlainTextAtRange,
  nextDurationPresetSeconds,
  renderPromptEditorContent,
  resolveChipFromAsset,
  serializePromptEditorContent,
  sumContentDurationSeconds,
  updateDurationChipElement,
  type MentionCaretRect,
} from '../../lib/dramaEpisodePromptEditor'
import { localizeScriptContent } from '../../lib/dramaScriptLabels'
import { useI18n } from '../../i18n'
import type { AssetScope } from './dramaEpisodeEditUtils'
import { EpisodeEditMentionPopover } from './EpisodeEditMentionPopover'

type Props = {
  content: string
  assets: DramaAsset[]
  referencedIds: Set<number>
  editing: boolean
  placeholder?: string
  onContentChange: (content: string) => void
  onOpenAsset?: (assetId: number) => void
}

// Render kịch bản storyboard có thể sửa
export function EpisodeEditPromptEditor({
  content,
  assets,
  referencedIds,
  editing,
  placeholder = 'Nhập mô tả hình ảnh, thoại, lời dẫn; gõ @ để tham chiếu tài nguyên hoặc chèn thời lượng…',
  onContentChange,
  onOpenAsset,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastEmittedRef = useRef(content)
  const mentionTriggerRangeRef = useRef<Range | null>(null)
  const paintedAsDisplayRef = useRef(false)

  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionAnchorRect, setMentionAnchorRect] = useState<MentionCaretRect | null>(null)
  const [mentionScope, setMentionScope] = useState<AssetScope>('episode')
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0)
  const [mentionItemsCount, setMentionItemsCount] = useState(0)

  // DOM của trình soạn thảo do tay vẽ vào chứ không phải do React render, nên đổi ngôn ngữ
  // sẽ không tự vẽ lại. Hook này chỉ để đưa `locale` vào dependency của effect vẽ.
  const { locale } = useI18n()

  // Tra chip theo id tài nguyên để hiển thị
  const resolveChip = useCallback(
    (assetId: number) => {
      const asset = assets.find((a) => a.id === assetId)
      if (!asset) return null
      return resolveChipFromAsset(asset, resolveDramaMediaUrl(asset.cover || asset.url))
    },
    [assets],
  )

  // Đóng popover @
  const closeMentionPopover = useCallback(() => {
    setMentionOpen(false)
    setMentionQuery('')
    setMentionActiveIndex(0)
    setMentionScope('episode')
    mentionTriggerRangeRef.current = null
  }, [])

  // Đẩy content vào DOM của trình soạn thảo.
  //
  // Ở chế độ soạn phải dán **nguyên văn**: DOM được serialize ngược thành `content` và gửi
  // lên backend, mà backend khớp marker `【字幕…】` / `【对白…】` bằng tiếng Trung — hiển thị bản
  // dịch rồi bấm "Lưu" là hỏng luôn bài kiểm tra định dạng. Chỉ khi xem mới dùng bản dịch.
  const paint = useCallback(
    (next: string) => {
      const editor = editorRef.current
      if (!editor) return
      const asDisplay = !editing
      renderPromptEditorContent(
        editor,
        next,
        resolveChip,
        asDisplay ? localizeScriptContent : undefined,
      )
      paintedAsDisplayRef.current = asDisplay
    },
    [resolveChip, editing],
  )

  // Đồng bộ content từ ngoài vào DOM (khi đang sửa thì bỏ qua chính lần ghi của trình soạn thảo).
  // `paintedAsDisplayRef` bắt buộc vẽ lại lúc bật chế độ soạn: nếu không, DOM còn giữ bản dịch
  // và lần ghi kế tiếp sẽ lưu nhầm bản dịch đó lên backend.
  useEffect(() => {
    if (editing && !paintedAsDisplayRef.current && content === lastEmittedRef.current) return
    paint(content)
    lastEmittedRef.current = content
  }, [content, editing, paint, locale])

  // Ở chế độ chỉ đọc, làm mới chip khi danh sách tài nguyên đổi
  useEffect(() => {
    if (editing) return
    paint(content)
  }, [assets, content, editing, paint, locale])

  // Vào chế độ sửa thì focus
  useEffect(() => {
    if (!editing) {
      closeMentionPopover()
      return
    }
    requestAnimationFrame(() => editorRef.current?.focus())
  }, [closeMentionPopover, editing])

  // Đồng bộ trạng thái kích hoạt @
  const syncMentionTrigger = useCallback(() => {
    const editor = editorRef.current
    if (!editor || !editing) {
      closeMentionPopover()
      return
    }
    const trigger = detectMentionTriggerFromSelection(editor)
    const caretRect = getCaretClientRect()
    if (!trigger || !caretRect) {
      closeMentionPopover()
      return
    }
    mentionTriggerRangeRef.current = trigger.range
    setMentionOpen(true)
    setMentionQuery(trigger.query)
    setMentionAnchorRect(caretRect)
    setMentionActiveIndex(0)
  }, [closeMentionPopover, editing])

  // Gửi nội dung trình soạn thảo lên component cha
  const emitContent = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const next = serializePromptEditorContent(editor)
    lastEmittedRef.current = next
    onContentChange(next)
  }, [onContentChange])

  // Chọn tài nguyên để chèn chip
  const handleSelectAsset = useCallback(
    (asset: DramaAsset) => {
      const editor = editorRef.current
      const triggerRange = mentionTriggerRangeRef.current
      if (!editor || !triggerRange) return
      const chip = resolveChipFromAsset(asset, resolveDramaMediaUrl(asset.cover || asset.url))
      insertMentionChipAtRange(triggerRange, chip)
      mentionTriggerRangeRef.current = null
      closeMentionPopover()
      emitContent()
      editor.focus()
    },
    [closeMentionPopover, emitContent],
  )

  // Chọn thời lượng để chèn chip
  const handleSelectDuration = useCallback(
    (seconds: number) => {
      const editor = editorRef.current
      const triggerRange = mentionTriggerRangeRef.current
      if (!editor || !triggerRange) return
      insertDurationChipAtRange(triggerRange, seconds)
      mentionTriggerRangeRef.current = null
      closeMentionPopover()
      emitContent()
      editor.focus()
    },
    [closeMentionPopover, emitContent],
  )

  // Chèn tiền tố cỡ cảnh / cử động máy dạng text thuần
  const handleSelectCameraPhrase = useCallback(
    (text: string) => {
      const editor = editorRef.current
      const triggerRange = mentionTriggerRangeRef.current
      if (!editor || !triggerRange || !text) return
      insertPlainTextAtRange(triggerRange, text)
      mentionTriggerRangeRef.current = null
      closeMentionPopover()
      emitContent()
      editor.focus()
    },
    [closeMentionPopover, emitContent],
  )

  const contentDurationTotal = sumContentDurationSeconds(
    mentionOpen && editorRef.current
      ? serializePromptEditorContent(editorRef.current)
      : content,
  )

  return (
    <>
      <div
        ref={editorRef}
        className={`drama-ep-prompt-editor${editing ? ' is-editing' : ''}`}
        role="textbox"
        aria-multiline="true"
        aria-label="Kịch bản storyboard"
        aria-readonly={!editing}
        contentEditable={editing}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => {
          emitContent()
          syncMentionTrigger()
        }}
        onKeyUp={syncMentionTrigger}
        onClick={(e) => {
          if (!editing) {
            const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-asset-id]')
            if (chip?.dataset.assetId) onOpenAsset?.(Number(chip.dataset.assetId))
            return
          }
          const durationChip = (e.target as HTMLElement).closest<HTMLElement>('[data-duration-sec]')
          if (durationChip && editorRef.current?.contains(durationChip)) {
            e.preventDefault()
            const current = Number(durationChip.dataset.durationSec)
            updateDurationChipElement(durationChip, nextDurationPresetSeconds(current))
            emitContent()
            closeMentionPopover()
            return
          }
          syncMentionTrigger()
        }}
        onKeyDown={(e) => {
          if (editing && (e.key === 'Backspace' || e.key === 'Delete') && editorRef.current) {
            const removed = deleteAdjacentEditorChip(
              editorRef.current,
              e.key === 'Backspace' ? 'backward' : 'forward',
            )
            if (removed) {
              e.preventDefault()
              emitContent()
              closeMentionPopover()
              return
            }
          }
          if (!mentionOpen) return
          if (e.key === 'Escape') {
            e.preventDefault()
            closeMentionPopover()
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setMentionActiveIndex((i) => Math.min(i + 1, Math.max(mentionItemsCount - 1, 0)))
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setMentionActiveIndex((i) => Math.max(i - 1, 0))
            return
          }
          if (e.key === 'Enter' && mentionItemsCount > 0) {
            e.preventDefault()
            // Enter do danh sách tài nguyên trong popover xử lý qua activeIndex ở component cha, phức tạp hơn; ở đây chỉ chặn để xuống dòng không làm đứt trigger
          }
        }}
      />

      <EpisodeEditMentionPopover
        open={mentionOpen && editing}
        query={mentionQuery}
        scope={mentionScope}
        assets={assets}
        referencedIds={referencedIds}
        anchorRect={mentionAnchorRect}
        activeIndex={mentionActiveIndex}
        contentDurationTotal={contentDurationTotal}
        onScopeChange={setMentionScope}
        onActiveIndexChange={setMentionActiveIndex}
        onItemsCountChange={setMentionItemsCount}
        onSelectAsset={handleSelectAsset}
        onSelectDuration={handleSelectDuration}
        onSelectCameraPhrase={handleSelectCameraPhrase}
        onClose={closeMentionPopover}
      />
    </>
  )
}
