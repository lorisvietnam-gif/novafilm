/** Ghép các MP4 của một tập ngay trong trình duyệt mà không mất chất lượng; khi codec lệch nhau thì lùi về ghép và mã hoá lại ở server */

import type { DramaFragment } from '../api/drama'
import { dramaApi, resolveDramaMediaUrl } from '../api/drama'
import { fetchMediaBlob } from './clientDownload'
import { sanitizeMediaBasename } from './canvasNodeMedia'
import { localized, type LocalizedText } from './localeStrings'

export type EpisodeComposeClip = {
  id: number
  label: string
  url: string
}

export type EpisodeComposeProgress = {
  phase: 'download' | 'concat' | 'server'
  done: number
  total: number
}

const COPY: Record<string, LocalizedText> = {
  shot: { zh: '分镜', en: 'Shot ', vi: 'Cảnh ' },
  episode: { zh: '本集', en: 'Episode', vi: 'Tap' },
  fullFilm: { zh: '全片', en: 'full-film', vi: 'toan-phim' },
  serverNoUrl: {
    zh: '服务端合成未返回可下载地址',
    en: 'The server did not return a download link for the merged video',
    vi: 'Máy chủ không trả về liên kết tải cho video đã ghép',
  },
  noClips: {
    zh: '本集还没有可拼接的分镜视频',
    en: 'This episode has no storyboard clips to join yet',
    vi: 'Tập này chưa có video cảnh nào để ghép',
  },
  notMp4: {
    zh: '{name} 不是可拼接的 MP4',
    en: '{name} is not a joinable MP4',
    vi: '{name} không phải MP4 có thể ghép',
  },
  mixedCodec: {
    zh: '各镜编码不一致，无法在浏览器里无损拼接。请用同一模型、比例和清晰度生成后再试。',
    en: 'The clips use different codecs, so they cannot be joined losslessly in the browser. Generate them with the same model, ratio and resolution, then try again.',
    vi: 'Các cảnh dùng codec khác nhau nên không thể ghép không mất chất lượng ngay trong trình duyệt. Hãy tạo lại bằng cùng mô hình, cùng tỉ lệ và cùng độ phân giải rồi thử lại.',
  },
}

/** Thu thập địa chỉ video có thể ghép, theo thứ tự các cảnh */
export function listEpisodeComposeClips(fragments: DramaFragment[]): EpisodeComposeClip[] {
  const clips: EpisodeComposeClip[] = []
  fragments.forEach((fragment, index) => {
    const url = resolveDramaMediaUrl(fragment.video)
    if (!url || fragment.id == null) return
    clips.push({
      id: fragment.id,
      label: `${localized(COPY.shot)}${index + 1}`,
      url,
    })
  })
  return clips
}

/** Tên tệp khi tải toàn bộ phim về */
export function episodeComposeFilename(episodeName: string) {
  return `${sanitizeMediaBasename(episodeName || localized(COPY.episode))}_${localized(COPY.fullFilm)}.mp4`
}

/** Nhờ server mã hoá lại cho đồng nhất rồi ghép, rồi tải Blob về */
async function composeEpisodeVideoServer(
  episodeId: number,
  clips: EpisodeComposeClip[],
  onProgress?: (progress: EpisodeComposeProgress) => void,
): Promise<Blob> {
  onProgress?.({ phase: 'server', done: 0, total: clips.length })
  const result = await dramaApi.composeEpisode(
    episodeId,
    clips.map((c) => c.id),
  )
  const url = resolveDramaMediaUrl(result.video_url)
  if (!url) throw new Error(localized(COPY.serverNoUrl))
  const blob = await fetchMediaBlob(url)
  onProgress?.({ phase: 'server', done: clips.length, total: clips.length })
  return blob
}

/** Tải từng cảnh và ghép thành một MP4 ngay trong máy; nếu ghép không mất chất lượng thì tự chuyển sang server */
export async function composeEpisodeVideoClient(
  clips: EpisodeComposeClip[],
  onProgress?: (progress: EpisodeComposeProgress) => void,
  options?: { episodeId?: number },
): Promise<Blob> {
  if (clips.length === 0) {
    throw new Error(localized(COPY.noClips))
  }

  const buffers: Uint8Array[] = new Array(clips.length)
  let downloaded = 0
  await Promise.all(
    clips.map(async (clip, index) => {
      const blob = await fetchMediaBlob(clip.url)
      buffers[index] = new Uint8Array(await blob.arrayBuffer())
      downloaded += 1
      onProgress?.({ phase: 'download', done: downloaded, total: clips.length })
    }),
  )

  if (clips.length === 1) {
    const single = buffers[0]
    return new Blob([copyToArrayBuffer(single)], { type: 'video/mp4' })
  }

  onProgress?.({ phase: 'concat', done: 0, total: clips.length })
  const { concatMp4, isMp4, mp4Compat } = await import('mp4cat')
  const names = clips.map((clip) => clip.label)
  for (let i = 0; i < buffers.length; i++) {
    if (!isMp4(buffers[i])) {
      throw new Error(localized(COPY.notMp4).replace('{name}', names[i]))
    }
  }
  const compat = mp4Compat(buffers, { names })
  if (!compat.ok) {
    const episodeId = options?.episodeId
    if (episodeId != null && episodeId > 0) {
      // HEVC SPS/PPS giữa các cảnh của Seedance hay lệch nhau, để server mã hoá lại cho đồng nhất là đủ
      return composeEpisodeVideoServer(episodeId, clips, onProgress)
    }
    throw new Error(
      `${localized(COPY.mixedCodec)}${compat.reason ? ` (${compat.reason})` : ''}`,
    )
  }
  const merged = concatMp4(buffers)
  onProgress?.({ phase: 'concat', done: clips.length, total: clips.length })
  return new Blob([copyToArrayBuffer(merged)], { type: 'video/mp4' })
}

// Chép sang một ArrayBuffer riêng, vì kiểu Uint8Array không được TS chấp nhận làm BlobPart
function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}
