/** Media của node trên canvas: nhận biết loại phát được và tên file tải về */
import { fetchMediaBlob, triggerBlobDownload } from './clientDownload'
import { localized, type LocalizedText } from './localeStrings'

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|#|$)/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i

const UNNAMED: LocalizedText = { zh: '未命名', en: 'Untitled', vi: 'Chưa đặt tên' }

/** URL của phim có phát được như video không */
export function isPlayableVideoUrl(url: string) {
  return VIDEO_EXT.test(url)
}

/** URL có phải tệp âm thanh không */
export function isAudioUrl(url: string) {
  return AUDIO_EXT.test(url)
}

/** Tạo phần tên tệp an toàn từ tên hiển thị */
export function sanitizeMediaBasename(label: string) {
  const cleaned = (label || localized(UNNAMED))
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return cleaned || localized(UNNAMED)
}

/** Suy ra phần mở rộng từ URL */
export function extFromMediaUrl(url: string, fallback: string) {
  const path = url.split('?')[0]?.split('#')[0] || ''
  const match = path.match(/\.([a-z0-9]{2,5})$/i)
  return match ? match[1].toLowerCase() : fallback
}

/** Ghép tên tệp tải về */
export function canvasMediaFilename(label: string, url: string, fallbackExt: string) {
  return `${sanitizeMediaBasename(label)}.${extFromMediaUrl(url, fallbackExt)}`
}

/** Tải media bằng trình duyệt; nếu khác origin thì mở tab mới */
export async function downloadCanvasMedia(url: string, filename: string) {
  try {
    const blob = await fetchMediaBlob(url)
    triggerBlobDownload(blob, filename)
  } catch {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.rel = 'noopener noreferrer'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }
}

/** Lưu một đoạn văn bản ra tệp để tải về */
export function downloadCanvasText(text: string, label: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  triggerBlobDownload(blob, `${sanitizeMediaBasename(label)}.txt`)
}
