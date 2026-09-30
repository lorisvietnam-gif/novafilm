/** Thanh công cụ canh giữa dọc bên trái canvas cùng bảng thêm nút */
import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import { useCanvasStore } from './CanvasStore'
import { ADD_NODE_OPTIONS, CANVAS_NODE_OPTION_BY_KIND, type CanvasNodeKind } from './canvasTypes'

type CanvasLeftToolbarProps = {
  onSelectNode: (kind: CanvasNodeKind) => void
}

/** Render thanh công cụ nổi bên trái canvas */
export function CanvasLeftToolbar({ onSelectNode }: CanvasLeftToolbarProps) {
  const { nodes, requestFocusNode } = useCanvasStore()
  /*
   * panelOpen bảng thêm nút
   * folderOpen bảng danh sách nút
   */
  const [panelOpen, setPanelOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const addAnchorRef = useRef<HTMLDivElement>(null)

  // Bấm ra ngoài để đóng bảng thêm
  useEffect(() => {
    if (!panelOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const root = addAnchorRef.current
      if (!root) return
      if (event.target instanceof Node && root.contains(event.target)) return
      setPanelOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [panelOpen])

  return (
    <div className="fc-overlay fc-left-toolbar">
      <div className="fc-left-stack">
        <div
          ref={addAnchorRef}
          className={`fc-add-anchor${panelOpen ? ' is-open' : ''}`}
          onMouseEnter={() => setPanelOpen(true)}
          onMouseLeave={() => setPanelOpen(false)}
        >
          <button
            type="button"
            className={`fc-icon-btn is-primary${panelOpen ? ' is-open' : ''}`}
            aria-label={panelOpen ? 'Đóng bảng thêm' : 'Thêm nút'}
            aria-expanded={panelOpen}
            title="Thêm nút"
            onClick={(event) => {
              event.stopPropagation()
              setPanelOpen((v) => !v)
              setFolderOpen(false)
            }}
          >
            {panelOpen ? <X size={18} strokeWidth={2} /> : <Plus size={18} strokeWidth={2} />}
          </button>

          {panelOpen ? (
            <div className="fc-add-panel-bridge" role="menu" aria-label="Loại nút có thể thêm">
              <div className="fc-add-panel">
                {ADD_NODE_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSelectNode(option.id)
                        setPanelOpen(false)
                      }}
                    >
                      <span className="fc-add-panel-icon">
                        <Icon size={14} strokeWidth={1.8} />
                      </span>
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={`fc-icon-btn${folderOpen ? ' is-active' : ''}`}
          aria-label="Thư mục tài nguyên"
          title="Thư mục tài nguyên"
          aria-expanded={folderOpen}
          onClick={() => {
            setFolderOpen((v) => !v)
            setPanelOpen(false)
          }}
        >
          <FolderOpen size={18} strokeWidth={1.8} />
        </button>

        {folderOpen ? (
          <div className="fc-folder-panel" role="dialog" aria-label="Danh sách nút canvas">
            <h4>Nút canvas</h4>
            {nodes.length === 0 ? (
              <p className="fc-folder-empty">Chưa có nút nào, bấm + để thêm</p>
            ) : (
              nodes.map((node) => {
                const option = CANVAS_NODE_OPTION_BY_KIND[node.data.kind]
                const Icon = option.icon
                return (
                  <button
                    key={node.id}
                    type="button"
                    className="fc-folder-item"
                    onClick={() => {
                      requestFocusNode(node.id)
                      setFolderOpen(false)
                    }}
                  >
                    <Icon size={14} strokeWidth={1.8} />
                    <span>
                      {option.label} · {node.data.label}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
