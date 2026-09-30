/** Menu "Thêm" của thẻ dự án: chọn mục, rời chuột hoặc bấm ra ngoài là đóng */
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

type Props = {
  onRename: () => void
  onDelete: () => void
}

// Đóng trễ sau khi rời chuột, tránh đóng ngay lúc đang trượt tới mục menu
const HIDE_DELAY_MS = 120

// Render menu đổi tên / xoá của thẻ dự án
export function DramaProjectCardMenu({ onRename, onDelete }: Props) {
  /*
   * open menu đã mở hay chưa
   * rootRef dùng để đóng khi bấm ra ngoài
   * hideTimerRef đóng trễ sau khi rời chuột
   * ignoreToggleRef chặn cú click xuyên xuống nút "⋯" ngay sau khi menu bị gỡ
   */
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ignoreToggleRef = useRef(false)

  // Huỷ đếm ngược đóng
  function cancelHide() {
    if (!hideTimerRef.current) return
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
  }

  // Hẹn đóng menu sau trễ
  function scheduleHide() {
    cancelHide()
    hideTimerRef.current = setTimeout(() => {
      setOpen(false)
      hideTimerRef.current = null
    }, HIDE_DELAY_MS)
  }

  // Đóng ngay rồi mới chạy hành động, tránh menu còn treo sau khi hộp thoại mở
  function closeThenRun(action: () => void) {
    cancelHide()
    ignoreToggleRef.current = true
    flushSync(() => setOpen(false))
    action()
    window.setTimeout(() => {
      ignoreToggleRef.current = false
    }, 0)
  }

  useEffect(() => () => cancelHide(), [])

  // Đóng khi bấm ra ngoài, cuộn trang hoặc bấm Esc
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const node = event.target
      if (node instanceof Node && rootRef.current?.contains(node)) return
      setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    function onScroll() {
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className="drama-project-row-more"
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      <button
        type="button"
        className="drama-project-row-more-btn"
        aria-label="Thao tác khác"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation()
          if (ignoreToggleRef.current) return
          cancelHide()
          setOpen((curr) => !curr)
        }}
      >
        <MoreHorizontal size={16} strokeWidth={1.8} />
      </button>
      {open ? (
        <div className="drama-project-row-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              closeThenRun(onRename)
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (ignoreToggleRef.current) return
              closeThenRun(onRename)
            }}
          >
            Đổi tên
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              closeThenRun(onDelete)
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (ignoreToggleRef.current) return
              closeThenRun(onDelete)
            }}
          >
            Xoá
          </button>
        </div>
      ) : null}
    </div>
  )
}
