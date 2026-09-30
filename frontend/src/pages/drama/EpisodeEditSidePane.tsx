/** Cột phải khi sửa tập: xem trước video từng đoạn + lối mở canvas storyboard toàn màn hình */
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import type { DramaFragment } from '../../api/drama'
import { DramaSubtitleBoard } from '../../components/drama/DramaSubtitleBoard'
import { DramaFragmentSegmentedVideoPlayer } from '../../components/drama/DramaFragmentSegmentedVideoPlayer'
import { triggerBlobDownload } from '../../lib/clientDownload'
import {
  composeEpisodeVideoClient,
  episodeComposeFilename,
  listEpisodeComposeClips,
  type EpisodeComposeProgress,
} from '../../lib/composeEpisodeVideoClient'
import { dialog } from '../../lib/dialog'
import type { DramaSubtitleMode } from '../../lib/dramaSubtitleBoard'

type Props = {
  fragments: DramaFragment[]
  playingFragmentId: number | null
  onPlayingFragmentChange: (fragmentId: number) => void
  aspectRatio: string
  episodeId?: number
  episodeName?: string
  subtitleMode: DramaSubtitleMode
  onOpenStoryboard: () => void
  /** Khi xem trước phiên bản cũ thì ghi đè src video của cảnh hiện tại */
  previewVideoUrl?: string | null
  previewPosterUrl?: string | null
  previewLabel?: string
  onClearPreview?: () => void
  onActivatePreview?: () => void
}

/** Chuyển tiến độ ghép thành chữ trên nút */
function composeProgressLabel(progress: EpisodeComposeProgress | null, busy: boolean) {
  if (!busy) return 'Ghép & tải xuống toàn bộ'
  if (!progress) return 'Đang ghép toàn bộ…'
  if (progress.phase === 'download') return `Tải cảnh quay ${progress.done}/${progress.total}`
  if (progress.phase === 'server') return 'Đang ghép lại và mã hoá trên máy chủ…'
  return 'Đang ghép…'
}

// Render phần xem trước và lối mở canvas ở cột phải của tập
export function EpisodeEditSidePane({
  fragments,
  playingFragmentId,
  onPlayingFragmentChange,
  aspectRatio,
  episodeId,
  episodeName = 'Tập này',
  subtitleMode,
  onOpenStoryboard,
  previewVideoUrl = null,
  previewPosterUrl = null,
  previewLabel = '',
  onClearPreview,
  onActivatePreview,
}: Props) {
  const hasSelection = playingFragmentId !== null
  /*
   * composeBusy: đang ghép ở máy người dùng
   * composeProgress: tiến độ tải/ghép
   * composeError: lý do thất bại
   */
  const [composeBusy, setComposeBusy] = useState(false)
  const [composeProgress, setComposeProgress] = useState<EpisodeComposeProgress | null>(null)
  const [composeError, setComposeError] = useState('')
  const composeClips = listEpisodeComposeClips(fragments)
  const missingCount = fragments.length - composeClips.length

  // Ghép các cảnh đã tạo ngay trong trình duyệt rồi tải bản dựng xuống
  async function handleComposeDownload() {
    if (composeBusy || composeClips.length === 0) return
    if (missingCount > 0) {
      const ok = await dialog.confirm({
        title: 'Một số cảnh chưa được tạo',
        message: `Có ${missingCount} cảnh chưa có video, sẽ chỉ ghép ${composeClips.length} cảnh đã tạo. Bạn có muốn tiếp tục không?`,
        confirmText: 'Ghép tiếp',
      })
      if (!ok) return
    }
    setComposeError('')
    setComposeBusy(true)
    setComposeProgress({ phase: 'download', done: 0, total: composeClips.length })
    try {
      const blob = await composeEpisodeVideoClient(composeClips, setComposeProgress, {
        episodeId,
      })
      triggerBlobDownload(blob, episodeComposeFilename(episodeName))
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Ghép toàn bộ thất bại')
    } finally {
      setComposeBusy(false)
      setComposeProgress(null)
    }
  }

  return (
    <aside className="drama-ep-preview">
      <div className="drama-ep-side-header">
        <div className="drama-ep-side-tabs" role="tablist" aria-label="Bảng bên phải">
          <button type="button" role="tab" aria-selected className="active">
            Xem trước
          </button>
          <button type="button" role="tab" onClick={onOpenStoryboard}>
            Canvas
          </button>
        </div>
        <button
          type="button"
          className="drama-ep-compose-btn drama-ep-compose-btn--header"
          disabled={composeBusy || composeClips.length === 0}
          title={
            composeClips.length === 0
              ? 'Hãy tạo video storyboard trước'
              : 'Ghép các cảnh đã tạo của tập này thành một bản dựng ngay trong trình duyệt rồi tải xuống'
          }
          onClick={() => void handleComposeDownload()}
        >
          {composeBusy ? (
            <Loader2 size={14} className="drama-ep-compose-spin" />
          ) : (
            <Download size={14} strokeWidth={1.8} />
          )}
          {composeProgressLabel(composeProgress, composeBusy)}
        </button>
      </div>
      {composeError ? <p className="drama-ep-compose-error drama-ep-compose-error--header">{composeError}</p> : null}

      {previewVideoUrl ? (
        <div className="drama-ep-preview-banner">
          <span>Xem trước phiên bản cũ{previewLabel ? ` · ${previewLabel}` : ''}</span>
          <div className="drama-ep-preview-banner-actions">
            {onActivatePreview ? (
              <button type="button" className="drama-ep-preview-banner-btn" onClick={onActivatePreview}>
                Đặt làm hiện tại
              </button>
            ) : null}
            {onClearPreview ? (
              <button type="button" className="drama-ep-preview-banner-btn is-ghost" onClick={onClearPreview}>
                Thoát xem trước
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!hasSelection || fragments.length === 0 ? (
        <p className="drama-ep-empty">Hãy chọn một cảnh ở danh sách dưới</p>
      ) : (
        <>
          <div className="drama-ep-preview-inner">
            <DramaFragmentSegmentedVideoPlayer
              fragments={fragments}
              playingFragmentId={playingFragmentId}
              onPlayingFragmentChange={onPlayingFragmentChange}
              aspectRatio={aspectRatio}
              overrideVideoUrl={previewVideoUrl}
              overridePosterUrl={previewPosterUrl}
            />
            {!fragments.some((f) => f.video) && (
              <button type="button" className="drama-ep-open-canvas" onClick={onOpenStoryboard}>
                Mở canvas storyboard
              </button>
            )}
          </div>
          <DramaSubtitleBoard
            fragments={fragments}
            episodeName={episodeName}
            subtitleMode={subtitleMode}
          />
        </>
      )}
    </aside>
  )
}
