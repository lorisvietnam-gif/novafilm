/** Xem ảnh tài nguyên toàn màn hình (bấm lớp nền hoặc Esc để đóng) */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  src: string
  alt?: string
  onClose: () => void
}

// Render lớp phóng to ảnh
export function DramaImageLightbox({ src, alt = 'Xem trước', onClose }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return createPortal(
    <div
      className="drama-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Xem trước ảnh"
      onClick={onClose}
    >
      <button type="button" className="drama-lightbox-close" aria-label="Đóng" onClick={onClose}>
        ×
      </button>
      <img
        className="drama-lightbox-img"
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  )
}
