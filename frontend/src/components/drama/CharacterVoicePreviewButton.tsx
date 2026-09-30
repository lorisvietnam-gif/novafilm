/** Nút nghe thử giọng nhân vật (phát trong card, không mở popup) */
import { useEffect, useRef, useState } from 'react'
import { Pause, Volume2 } from 'lucide-react'
import { resolveDramaMediaUrl } from '../../api/drama'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Props = {
  url: string
  label?: string
  className?: string
  size?: 'sm' | 'md'
  variant?: 'button' | 'chip' | 'inline'
  onError?: (message: string) => void
}

const COPY: Record<string, LocalizedText> = {
  badUrl: { zh: '试听地址无效', en: 'That preview link is not usable', vi: 'Đường dẫn nghe thử không dùng được' },
  playFailed: { zh: '播放失败', en: 'Playback failed', vi: 'Không phát được âm thanh' },
  previewOf: { zh: '试听：{label}', en: 'Preview the voice: {label}', vi: 'Nghe thử giọng: {label}' },
  previewVoice: { zh: '试听音色', en: 'Preview the voice', vi: 'Nghe thử giọng đọc' },
  stop: { zh: '停止', en: 'Stop', vi: 'Dừng' },
  preview: { zh: '试听', en: 'Preview', vi: 'Nghe thử' },
}

/** Mỗi thời điểm chỉ phát một đoạn, tránh nhiều card chồng tiếng */
let sharedAudio: HTMLAudioElement | null = null
let sharedStop: (() => void) | null = null

// Bấm để phát đoạn nghe thử của giọng đã gắn, bấm lần nữa để dừng
export function CharacterVoicePreviewButton({
  url,
  label,
  className = '',
  size = 'sm',
  variant = 'button',
  onError,
}: Props) {
  const lt = useLocalizedText()
  const [playing, setPlaying] = useState(false)
  const src = resolveDramaMediaUrl(url)
  const stopRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    return () => {
      if (sharedStop === stopRef.current) {
        sharedAudio?.pause()
        sharedStop = null
      }
    }
  }, [])

  function stop() {
    sharedAudio?.pause()
    if (sharedAudio) sharedAudio.currentTime = 0
    setPlaying(false)
    if (sharedStop === stopRef.current) sharedStop = null
  }

  stopRef.current = stop

  function handlePreview() {
    if (!src) {
      onError?.(lt(COPY.badUrl))
      return
    }
    if (playing) {
      stop()
      return
    }
    sharedStop?.()
    if (!sharedAudio) sharedAudio = new Audio()
    sharedAudio.src = src
    sharedAudio.onended = () => {
      setPlaying(false)
      if (sharedStop === stopRef.current) sharedStop = null
    }
    sharedStop = () => stop()
    setPlaying(true)
    void sharedAudio.play().catch(() => {
      setPlaying(false)
      onError?.(lt(COPY.playFailed))
    })
  }

  if (!src) return null

  let btnClass = 'drama-voice-preview-btn'
  if (variant === 'button') {
    const sizeClass = size === 'md' ? 'pf-btn pf-btn-ghost' : 'pf-btn pf-btn-ghost pf-btn-sm'
    btnClass = `${sizeClass} drama-voice-preview-btn`
  } else if (variant === 'chip') {
    btnClass = 'fc-toolbar-chip'
  }
  if (playing) btnClass = `${btnClass} is-playing`
  if (className) btnClass = `${btnClass} ${className}`

  return (
    <button
      type="button"
      className={btnClass}
      onClick={(e) => {
        e.stopPropagation()
        handlePreview()
      }}
      title={label ? lt(COPY.previewOf).replace('{label}', label) : lt(COPY.previewVoice)}
    >
      {playing ? <Pause size={14} strokeWidth={1.8} aria-hidden /> : <Volume2 size={14} strokeWidth={1.8} aria-hidden />}
      {playing ? lt(COPY.stop) : lt(COPY.preview)}
    </button>
  )
}
