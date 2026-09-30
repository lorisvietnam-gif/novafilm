/** Bộ chọn nút mặc định hiện giữa canvas khi canvas còn trống */
import { MousePointer2 } from 'lucide-react'
import { CANVAS_NODE_OPTIONS, type CanvasNodeKind } from './canvasTypes'

type CanvasNodeSelectorProps = {
  onSelect: (kind: CanvasNodeKind) => void
}

/** Render bộ chọn loại nút để tạo nhanh */
export function CanvasNodeSelector({ onSelect }: CanvasNodeSelectorProps) {
  return (
    <div className="fc-overlay fc-node-selector">
      <div className="fc-node-selector-inner">
        <div className="fc-node-selector-row">
          {CANVAS_NODE_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.id}
                type="button"
                className="fc-node-chip"
                onClick={() => onSelect(option.id)}
              >
                <span className="fc-node-chip-icon">
                  <Icon size={16} strokeWidth={1.8} />
                </span>
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
        <p className="fc-node-hint">
          <MousePointer2 size={16} strokeWidth={1.8} />
          Bấm để thêm nhanh · Cũng có thể double-click vùng trống để tạo
        </p>
      </div>
    </div>
  )
}
