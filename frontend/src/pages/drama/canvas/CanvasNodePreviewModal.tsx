/** Xem trước toàn màn hình cho node trên canvas: ảnh / video / âm thanh / văn bản, có thể tải về */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import {
  canvasMediaFilename,
  downloadCanvasMedia,
  downloadCanvasText,
  isAudioUrl,
  isPlayableVideoUrl,
} from '../../../lib/canvasNodeMedia'
import type { CanvasNodeKind } from './canvasTypes'

export type CanvasNodePreviewPayload = {
  kind: CanvasNodeKind
  title: string
  mediaUrl?: string | null
  voiceUrl?: string | null
  textContent?: string | null
}

type CanvasNodePreviewModalProps = {
  payload: CanvasNodePreviewPayload
  onClose: () => void
}

/** Chọn cách hiển thị toàn màn hình dựa trên nội dung của node */
function previewMode(payload: CanvasNodePreviewPayload) {
  const media = (payload.mediaUrl || '').trim()
  const voice = (payload.voiceUrl || '').trim()
  const text = (payload.textContent || '').trim()
  if (payload.kind === 'video' && media && isPlayableVideoUrl(media)) return 'video' as const
  if (payload.kind === 'audio' && (voice || media)) return 'audio' as const
  if (voice && isAudioUrl(voice) && !media) return 'audio' as const
  if (payload.kind === 'text' || (text && !media)) return 'text' as const
  if (media) return 'image' as const
  if (voice) return 'audio' as const
  if (text) return 'text' as const
  return 'empty' as const
}

/** Lớp popover xem trước media của node */
export function CanvasNodePreviewModal({ payload, onClose }: CanvasNodePreviewModalProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const media = (payload.mediaUrl || '').trim()
  const voice = (payload.voiceUrl || '').trim()
  const text = (payload.textContent || '').trim()
  const mode = previewMode(payload)
  const audioSrc = payload.kind === 'audio' ? voice || media : voice
  const canDownload = mode === 'text' ? Boolean(text) : Boolean(media || audioSrc)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const handleDownload = async () => {
    if (!canDownload || busy) return
    setError('')
    setBusy(true)
    try {
      if (mode === 'text') {
        downloadCanvasText(text, payload.title)
        return
      }
      const url = mode === 'audio' ? audioSrc : media
      if (!url) return
      const fallback =
        mode === 'video' ? 'mp4' : mode === 'audio' ? 'mp3' : 'png'
      await downloadCanvasMedia(url, canvasMediaFilename(payload.title, url, fallback))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải về thất bại')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fc-node-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Xem trước ${payload.title}`}
      onClick={onClose}
    >
      <div className="fc-node-preview-bar" onClick={(event) => event.stopPropagation()}>
        <strong>{payload.title}</strong>
        <div className="fc-node-preview-actions">
          {error ? <em className="fc-node-preview-error">{error}</em> : null}
          <button
            type="button"
            className="fc-node-preview-btn"
            disabled={!canDownload || busy}
            onClick={() => void handleDownload()}
          >
            <Download size={16} strokeWidth={2} />
            {busy ? 'Đang tải…' : 'Tải về'}
          </button>
          <button type="button" className="fc-node-preview-btn is-ghost" onClick={onClose} aria-label="Đóng">
            <X size={16} strokeWidth={2} />
            Đóng
          </button>
        </div>
      </div>
      <div className="fc-node-preview-stage" onClick={(event) => event.stopPropagation()}>
        {mode === 'video' ? (
          <video className="fc-node-preview-media" src={media} controls autoPlay playsInline />
        ) : mode === 'audio' ? (
          <div className="fc-node-preview-audio">
            {media && !isAudioUrl(media) ? (
              <img className="fc-node-preview-media is-still" src={media} alt={payload.title} />
            ) : null}
            <audio src={audioSrc} controls autoPlay />
          </div>
        ) : mode === 'text' ? (
          <pre className="fc-node-preview-text">{text || '(văn bản trống)'}</pre>
        ) : mode === 'image' ? (
          <div className="fc-node-preview-still">
            <img className="fc-node-preview-media" src={media} alt={payload.title} />
            {audioSrc ? <audio src={audioSrc} controls /> : null}
          </div>
        ) : (
          <p className="fc-node-preview-empty">Chưa có nội dung nào để xem trước</p>
        )}
      </div>
    </div>,
    document.body,
  )
}
