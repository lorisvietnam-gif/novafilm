/** Double-click vùng trống của canvas: mở menu chọn loại nút mới */
import { useEffect, useRef } from 'react'
import { ADD_NODE_OPTIONS, type CanvasNodeKind } from './canvasTypes'

type CanvasPaneAddMenuProps = {
  /** Toạ độ màn hình tương đối với viewport */
  screen: { x: number; y: number }
  onSelect: (kind: CanvasNodeKind) => void
  onClose: () => void
}

/** Hiện danh sách loại nút ngay cạnh vị trí double-click */
export function CanvasPaneAddMenu({ screen, onSelect, onClose }: CanvasPaneAddMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root) return
      if (event.target instanceof Node && root.contains(event.target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const left = Math.min(Math.max(12, screen.x), window.innerWidth - 180)
  const top = Math.min(Math.max(12, screen.y), window.innerHeight - 280)

  return (
    <div
      ref={rootRef}
      className="fc-pane-add-menu"
      style={{ left, top }}
      role="menu"
      aria-label="Double-click để tạo nút"
    >
      {ADD_NODE_OPTIONS.map((option) => {
        const Icon = option.icon
        return (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            className="nodrag nopan"
            onClick={(event) => {
              event.stopPropagation()
              onSelect(option.id)
            }}
          >
            <span className="fc-pane-add-menu-icon">
              <Icon size={14} strokeWidth={1.8} />
            </span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
