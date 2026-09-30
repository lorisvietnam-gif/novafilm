/** Câu lệnh trên canvas: gõ @ rồi chọn node nhân vật / bối cảnh để chèn (không dùng portal, tránh việc bấm chọn làm canvas bỏ chọn node) */
import { Landmark, UserRound, Image as ImageIcon, PlaySquare } from 'lucide-react'
import { resolveDramaMediaUrl } from '../../../../api/drama'
import type { CanvasNodeKind } from '../canvasTypes'

export type CanvasMentionItem = {
  nodeId: string
  assetId: number
  kind: CanvasNodeKind
  label: string
  mediaUrl?: string | null
}

type CanvasMentionPopoverProps = {
  open: boolean
  query: string
  items: CanvasMentionItem[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onSelect: (item: CanvasMentionItem) => void
  onClose: () => void
}

/** Icon theo loại node */
function KindIcon({ kind }: { kind: CanvasNodeKind }) {
  if (kind === 'character') return <UserRound size={14} strokeWidth={1.8} />
  if (kind === 'scene') return <Landmark size={14} strokeWidth={1.8} />
  if (kind === 'video') return <PlaySquare size={14} strokeWidth={1.8} />
  return <ImageIcon size={14} strokeWidth={1.8} />
}

/** Nhãn tiếng Việt của loại node */
function kindLabel(kind: CanvasNodeKind) {
  if (kind === 'character') return 'Nhân vật'
  if (kind === 'scene') return 'Bối cảnh'
  if (kind === 'video') return 'Video'
  if (kind === 'image') return 'Hình ảnh'
  return 'Tư liệu'
}

/** Lọc các node có thể trích dẫn theo từ khoá */
export function filterCanvasMentionItems(items: CanvasMentionItem[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => {
    const label = item.label.toLowerCase()
    const type = kindLabel(item.kind)
    return label.includes(q) || type.includes(q) || String(item.assetId).includes(q)
  })
}

/** Dựng danh sách ứng viên cho trích dẫn @ */
export function CanvasMentionPopover({
  open,
  query,
  items,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  onClose,
}: CanvasMentionPopoverProps) {
  if (!open) return null

  const filtered = filterCanvasMentionItems(items, query)

  return (
    <div
      className="fc-mention-popover nodrag nopan nowheel"
      role="listbox"
      aria-label="Trích dẫn node trên canvas"
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className="fc-mention-head">
        <span>Trích dẫn node</span>
        <button
          type="button"
          className="fc-mention-close"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }}
          aria-label="Đóng"
        >
          ×
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="fc-mention-empty">Không có node phù hợp · hãy tạo nhân vật / bối cảnh trước</div>
      ) : (
        <ul className="fc-mention-list">
          {filtered.map((item, index) => {
            const thumb = resolveDramaMediaUrl(item.mediaUrl)
            const active = index === activeIndex
            return (
              <li key={item.nodeId}>
                <button
                  type="button"
                  className={`fc-mention-item${active ? ' is-active' : ''}`}
                  onMouseEnter={() => onActiveIndexChange(index)}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onSelect(item)
                  }}
                >
                  <span className="fc-mention-thumb">
                    {thumb ? <img src={thumb} alt="" /> : <KindIcon kind={item.kind} />}
                  </span>
                  <span className="fc-mention-meta">
                    <strong>{item.label}</strong>
                    <em>{kindLabel(item.kind)}</em>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
