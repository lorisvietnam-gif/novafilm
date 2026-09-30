/** Trang sửa tập: trình phát video có thanh tiến độ chia theo từng cảnh (phát nối tiếp ở phía client) */
import { Download, Maximize, Minimize, MonitorPlay, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveDramaMediaUrl, type DramaFragment } from '../../api/drama'
import EmptyState from '../ui/EmptyState'
import {
  buildEpisodeVideoTimelineSegments,
  formatVideoTimelineClock,
  resolveEpisodeTimelineSegmentFillRatio,
  resolveEpisodeVideoTimelineTotalDuration,
  resolveFragmentPlaybackFromGlobalTime,
  resolveGlobalTimeFromFragmentPlayback,
  resolveNextPlayableFragmentId,
  resolveVideoTimelineSeekTime,
  type DramaEpisodeVideoTimelineSegment,
} from '../../lib/dramaEpisodeVideoTimeline'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Props = {
  fragments: DramaFragment[]
  playingFragmentId: number | null
  onPlayingFragmentChange: (fragmentId: number) => void
  aspectRatio: string
  /** Ghi đè địa chỉ video của cảnh khi đang xem bản lịch sử */
  overrideVideoUrl?: string | null
  overridePosterUrl?: string | null
}

const COPY: Record<string, LocalizedText> = {
  exitFullscreen: { zh: '退出全屏', en: 'Exit full screen', vi: 'Thoát toàn màn hình' },
  fullscreen: { zh: '全屏预览', en: 'Full screen', vi: 'Xem toàn màn hình' },
  downloadVideo: { zh: '下载视频', en: 'Download the video', vi: 'Tải video xuống' },
  posterAlt: { zh: '分镜预览', en: 'Shot preview', vi: 'Ảnh xem trước của cảnh' },
  pending: { zh: '视频待生成', en: 'The video is still being generated', vi: 'Video đang được tạo' },
  pause: { zh: '暂停', en: 'Pause', vi: 'Tạm dừng' },
  play: { zh: '播放', en: 'Play', vi: 'Phát' },
  autolinkOff: {
    zh: '关闭自动衔接下一片段',
    en: 'Turn off playing the next shot automatically',
    vi: 'Tắt tự phát tiếp cảnh sau',
  },
  autolinkOn: {
    zh: '开启自动衔接下一片段',
    en: 'Play the next shot automatically when this one ends',
    vi: 'Tự phát cảnh tiếp theo khi cảnh này hết',
  },
  unmute: { zh: '取消静音', en: 'Unmute', vi: 'Bật tiếng' },
  mute: { zh: '静音', en: 'Mute', vi: 'Tắt tiếng' },
}

// Render trình phát video có thanh tiến độ chia theo từng cảnh
export function DramaFragmentSegmentedVideoPlayer({
  fragments,
  playingFragmentId,
  onPlayingFragmentChange,
  aspectRatio,
  overrideVideoUrl = null,
  overridePosterUrl = null,
}: Props) {
  const lt = useLocalizedText()
  // videoRef tham chiếu phần tử video
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // screenRef khung xem (đích của chế độ toàn màn hình)
  const screenRef = useRef<HTMLDivElement | null>(null)
  // trackRef tham chiếu khung thanh tiến độ
  const trackRef = useRef<HTMLDivElement | null>(null)
  // isSeekingRef đang kéo thanh tiến độ
  const isSeekingRef = useRef(false)
  // autoLinkNextRef có tự nối sang cảnh kế tiếp không
  const autoLinkNextRef = useRef(true)
  // playingFragmentIdRef id của cảnh đang phát
  const playingFragmentIdRef = useRef(playingFragmentId)
  // timelineSegmentsRef cache các đoạn của thanh thời gian
  const timelineSegmentsRef = useRef(buildEpisodeVideoTimelineSegments(fragments))
  // shouldResumePlayRef có tiếp tục phát sau khi đổi cảnh không
  const shouldResumePlayRef = useRef(false)
  // pendingSeekTimeRef thời gian cục bộ cần nhảy tới sau khi đổi cảnh
  const pendingSeekTimeRef = useRef<number | null>(null)
  // autoPlayAttemptedRef video hiện tại đã thử tự phát chưa
  const autoPlayAttemptedRef = useRef(false)
  // playingSegmentRef đoạn đang phát (để callback sự kiện đọc, tránh gắn lại sự kiện khi poll làm mới fragments)
  const playingSegmentRef = useRef<DramaEpisodeVideoTimelineSegment | null>(null)
  // prevPlayingFragmentIdRef lần đổi cảnh đã xử lý trước đó
  const prevPlayingFragmentIdRef = useRef<number | null>(playingFragmentId)
  // isPlaying đang phát
  const [isPlaying, setIsPlaying] = useState(false)
  // globalCurrentTime vị trí hiện tại trên thanh thời gian chung (giây)
  const [globalCurrentTime, setGlobalCurrentTime] = useState(0)
  // autoLinkNext tự phát cảnh kế tiếp sau khi cảnh hiện tại hết
  const [autoLinkNext, setAutoLinkNext] = useState(true)
  // muted tắt tiếng
  const [muted, setMuted] = useState(false)
  // isFullscreen khung xem đang ở chế độ toàn màn hình
  const [isFullscreen, setIsFullscreen] = useState(false)

  playingFragmentIdRef.current = playingFragmentId
  autoLinkNextRef.current = autoLinkNext

  // timelineSegments các đoạn của toàn bộ storyboard trong tập
  const timelineSegments = useMemo(
    () => buildEpisodeVideoTimelineSegments(fragments),
    [fragments],
  )

  timelineSegmentsRef.current = timelineSegments

  // totalDuration tổng thời lượng của thanh thời gian tập
  const totalDuration = useMemo(
    () => resolveEpisodeVideoTimelineTotalDuration(timelineSegments),
    [timelineSegments],
  )

  // playingFragment cảnh đang phát
  const playingFragment = useMemo(
    () => fragments.find((fragment) => fragment.id === playingFragmentId) ?? null,
    [fragments, playingFragmentId],
  )

  // playingSegment khoảng thời gian của cảnh đang phát trên thanh thời gian
  const playingSegment = useMemo(
    () => timelineSegments.find((segment) => segment.fragmentId === playingFragmentId) ?? null,
    [playingFragmentId, timelineSegments],
  )

  playingSegmentRef.current = playingSegment

  // videoUrl địa chỉ video của cảnh (có thể bị ghi đè khi xem bản lịch sử)
  const videoUrl =
    overrideVideoUrl ||
    (playingFragment?.video ? resolveDramaMediaUrl(playingFragment.video) : null)
  // posterUrl địa chỉ ảnh bìa của cảnh
  const posterUrl =
    overridePosterUrl ||
    (playingFragment?.cover ? resolveDramaMediaUrl(playingFragment.cover) : null)
  // hasCurrentVideo cảnh hiện tại có phát được không
  const hasCurrentVideo = Boolean(videoUrl)
  // hasAnyVideo có cảnh nào có video không
  const hasAnyVideo = timelineSegments.some((segment) => segment.hasVideo)

  // ratioClass tên class CSS của khung hình
  const ratioClass = `ratio-${aspectRatio.replace(':', 'x')}`

  // Bật/tạm dừng phát
  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current

    if (!video || !hasCurrentVideo) {
      return
    }

    if (video.paused) {
      void video.play().catch(() => undefined)
      return
    }

    video.pause()
  }, [hasCurrentVideo])

  // Nhảy tới một vị trí trên thanh thời gian chung
  const seekToGlobalTime = useCallback(
    (globalTimeSec: number) => {
      const playback = resolveFragmentPlaybackFromGlobalTime(timelineSegments, globalTimeSec)

      if (!playback) {
        return
      }

      setGlobalCurrentTime(
        resolveGlobalTimeFromFragmentPlayback(
          playback.segment,
          playback.localTimeSec,
          playback.segment.durationSec,
        ),
      )

      if (playback.segment.fragmentId !== playingFragmentIdRef.current) {
        pendingSeekTimeRef.current = playback.localTimeSec
        shouldResumePlayRef.current = isPlaying
        onPlayingFragmentChange(playback.segment.fragmentId)
        return
      }

      const video = videoRef.current

      if (video && hasCurrentVideo) {
        video.currentTime = playback.localTimeSec
      }
    },
    [hasCurrentVideo, isPlaying, onPlayingFragmentChange, timelineSegments],
  )

  // Nhảy theo vị trí được bấm
  const seekByClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current

      if (!track || totalDuration <= 0) {
        return
      }

      const rect = track.getBoundingClientRect()
      const ratio = (clientX - rect.left) / rect.width
      const nextGlobalTime = resolveVideoTimelineSeekTime(ratio, totalDuration)

      seekToGlobalTime(nextGlobalTime)
    },
    [seekToGlobalTime, totalDuration],
  )

  // Gắn sự kiện video (chỉ gắn lại khi địa chỉ video hiện tại đổi)
  useEffect(() => {
    const video = videoRef.current

    if (!video || !videoUrl) {
      return
    }

    autoPlayAttemptedRef.current = false

    const tryAutoPlay = () => {
      if (autoPlayAttemptedRef.current) {
        return
      }

      autoPlayAttemptedRef.current = true

      if (shouldResumePlayRef.current) {
        void video.play().catch(() => undefined)
        shouldResumePlayRef.current = false
      }
    }

    const handleLoadedMetadata = () => {
      if (pendingSeekTimeRef.current !== null) {
        video.currentTime = pendingSeekTimeRef.current
        pendingSeekTimeRef.current = null
      }
    }

    const handleDurationChange = () => {
      if (pendingSeekTimeRef.current !== null) {
        video.currentTime = pendingSeekTimeRef.current
        pendingSeekTimeRef.current = null
      }
    }

    const handleCanPlay = () => {
      if (pendingSeekTimeRef.current !== null) {
        video.currentTime = pendingSeekTimeRef.current
        pendingSeekTimeRef.current = null
      }

      tryAutoPlay()
    }

    const handleTimeUpdate = () => {
      const segment = playingSegmentRef.current

      if (isSeekingRef.current || !segment) {
        return
      }

      const nextGlobalTime = resolveGlobalTimeFromFragmentPlayback(
        segment,
        video.currentTime,
        Number.isFinite(video.duration) ? video.duration : segment.durationSec,
      )

      setGlobalCurrentTime(nextGlobalTime)
    }

    const handlePlay = () => {
      setIsPlaying(true)
    }

    const handlePause = () => {
      setIsPlaying(false)
    }

    const handleEnded = () => {
      if (!autoLinkNextRef.current) {
        setIsPlaying(false)
        return
      }

      const nextFragmentId = resolveNextPlayableFragmentId(
        timelineSegmentsRef.current,
        playingFragmentIdRef.current ?? 0,
      )

      if (!nextFragmentId) {
        setIsPlaying(false)
        return
      }

      shouldResumePlayRef.current = true
      onPlayingFragmentChange(nextFragmentId)
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('durationchange', handleDurationChange)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      tryAutoPlay()
    }

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('durationchange', handleDurationChange)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [onPlayingFragmentChange, videoUrl])

  // Chỉ nhảy về đầu cảnh khi người dùng tự đổi cảnh (poll lúc tạo làm mới fragments không được ngắt phát)
  useEffect(() => {
    if (playingFragmentId === prevPlayingFragmentIdRef.current) {
      return
    }

    prevPlayingFragmentIdRef.current = playingFragmentId

    if (!playingSegment) {
      setGlobalCurrentTime(0)
      return
    }

    if (shouldResumePlayRef.current || pendingSeekTimeRef.current !== null) {
      return
    }

    setGlobalCurrentTime(playingSegment.startSec)

    const video = videoRef.current

    if (video && videoUrl) {
      video.pause()
      video.currentTime = 0
      setIsPlaying(false)
    }
  }, [playingFragmentId, playingSegment, videoUrl])

  useEffect(() => {
    const video = videoRef.current

    if (!video) {
      return
    }

    video.muted = muted
  }, [muted])

  // Đồng bộ trạng thái toàn màn hình của trình duyệt
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === screenRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Bật/tắt toàn màn hình cho khung xem
  const handleToggleFullscreen = useCallback(async () => {
    const screen = screenRef.current

    if (!screen || !hasCurrentVideo) {
      return
    }

    try {
      if (document.fullscreenElement === screen) {
        await document.exitFullscreen()
        return
      }

      await screen.requestFullscreen()
    } catch {
      /* trình duyệt có thể từ chối toàn màn hình */
    }
  }, [hasCurrentVideo])

  // Tải video của cảnh hiện tại xuống
  const handleDownloadVideo = useCallback(() => {
    if (!videoUrl) {
      return
    }

    const link = document.createElement('a')

    link.href = videoUrl
    link.download = ''
    link.rel = 'noopener noreferrer'
    link.target = '_blank'
    link.click()
  }, [videoUrl])

  // playheadLeft vị trí ngang của đầu phát, tính bằng phần trăm
  const playheadLeft = totalDuration > 0 ? (globalCurrentTime / totalDuration) * 100 : 0

  return (
    <div className="drama-ep-segmented-player">
      <div
        ref={screenRef}
        className={`drama-ep-player drama-ep-segmented-screen ${ratioClass}${
          !hasCurrentVideo ? ' is-empty' : ''
        }${isFullscreen ? ' is-fullscreen' : ''}`}
      >
        {hasCurrentVideo ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl ?? undefined}
              poster={posterUrl ?? undefined}
              playsInline
              preload="auto"
            />
            <div className="drama-ep-video-overlay-actions">
              <button
                type="button"
                aria-label={isFullscreen ? lt(COPY.exitFullscreen) : lt(COPY.fullscreen)}
                className="drama-ep-video-overlay-btn"
                onClick={() => void handleToggleFullscreen()}
              >
                {isFullscreen ? (
                  <Minimize size={16} strokeWidth={1.8} />
                ) : (
                  <Maximize size={16} strokeWidth={1.8} />
                )}
              </button>
              <button
                type="button"
                aria-label={lt(COPY.downloadVideo)}
                className="drama-ep-video-overlay-btn"
                onClick={handleDownloadVideo}
              >
                <Download size={16} strokeWidth={1.8} />
              </button>
            </div>
          </>
        ) : posterUrl ? (
          <img src={posterUrl} alt={lt(COPY.posterAlt)} />
        ) : (
          <div className="drama-ep-player-placeholder">
            <EmptyState
              imageStyle="wuxia-realistic-photo"
              tone="dark"
              className="drama-ep-player-empty"
              message={lt(COPY.pending)}
            />
          </div>
        )}
      </div>

      <div className="drama-ep-video-controls">
        <p className="drama-ep-video-clock">
          {formatVideoTimelineClock(globalCurrentTime)} / {formatVideoTimelineClock(totalDuration)}
        </p>

        <div className="drama-ep-video-toolbar">
          <button
            type="button"
            aria-label={isPlaying ? lt(COPY.pause) : lt(COPY.play)}
            disabled={!hasCurrentVideo}
            className="drama-ep-video-icon-btn"
            onClick={handleTogglePlay}
          >
            {isPlaying ? (
              <Pause size={16} strokeWidth={2} />
            ) : (
              <Play size={16} strokeWidth={2} />
            )}
          </button>

          <div
            ref={trackRef}
            className={`drama-ep-video-track${totalDuration <= 0 ? ' is-disabled' : ''}`}
            onPointerDown={(event) => {
              if (totalDuration <= 0) {
                return
              }

              isSeekingRef.current = true
              seekByClientX(event.clientX)
            }}
            onPointerMove={(event) => {
              if (totalDuration <= 0 || !isSeekingRef.current) {
                return
              }

              seekByClientX(event.clientX)
            }}
            onPointerUp={() => {
              isSeekingRef.current = false
            }}
            onPointerLeave={() => {
              isSeekingRef.current = false
            }}
          >
            {timelineSegments.map((segment, index) => (
              <div
                key={segment.fragmentId}
                className={`drama-ep-video-track-seg${
                  index < timelineSegments.length - 1 ? ' has-divider' : ''
                }`}
                style={{ flex: segment.durationSec }}
              >
                <div
                  className="drama-ep-video-track-fill"
                  style={{
                    width: `${resolveEpisodeTimelineSegmentFillRatio(segment, globalCurrentTime) * 100}%`,
                  }}
                />
              </div>
            ))}

            <div className="drama-ep-video-playhead" style={{ left: `${playheadLeft}%` }} />
          </div>

          <button
            type="button"
            aria-label={autoLinkNext ? lt(COPY.autolinkOff) : lt(COPY.autolinkOn)}
            title={autoLinkNext ? lt(COPY.autolinkOff) : lt(COPY.autolinkOn)}
            disabled={!hasAnyVideo}
            className={`drama-ep-video-autolink${autoLinkNext ? ' is-on' : ''}`}
            onClick={() => setAutoLinkNext((value) => !value)}
          >
            <MonitorPlay size={16} strokeWidth={1.8} />
            <span className="drama-ep-video-autolink-bar" />
          </button>

          <button
            type="button"
            aria-label={muted ? lt(COPY.unmute) : lt(COPY.mute)}
            disabled={!hasCurrentVideo}
            className="drama-ep-video-icon-btn is-muted"
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? (
              <VolumeX size={16} strokeWidth={1.8} />
            ) : (
              <Volume2 size={16} strokeWidth={1.8} />
            )}
          </button>

          <button
            type="button"
            aria-label={isFullscreen ? lt(COPY.exitFullscreen) : lt(COPY.fullscreen)}
            title={isFullscreen ? lt(COPY.exitFullscreen) : lt(COPY.fullscreen)}
            disabled={!hasCurrentVideo}
            className="drama-ep-video-icon-btn"
            onClick={() => void handleToggleFullscreen()}
          >
            {isFullscreen ? (
              <Minimize size={16} strokeWidth={1.8} />
            ) : (
              <Maximize size={16} strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
