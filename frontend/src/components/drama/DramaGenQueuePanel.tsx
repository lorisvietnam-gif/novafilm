/** Hàng đợi sinh toàn cục của AI Drama: nút tròn ở góc phải dưới, gom tác vụ ảnh / video */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clapperboard, ImageIcon, Layers, Octagon, Trash2, X } from 'lucide-react'
import { dramaApi } from '../../api/drama'
import { DramaGenTaskDetail } from './DramaGenTaskDetail'
import { formatDramaGenError } from '../../lib/dramaGenError'
import BillingTopupLink from '../billing/BillingTopupLink'
import {
  clearFinishedDramaGenJobs,
  dramaGenSubtypeLabel,
  ensureEpisodeVideoStatusPoll,
  FRAGMENT_VIDEO_SUBTYPE,
  markVideoJobsCancelled,
  subscribeDramaGenQueueOpen,
  useDramaGenQueue,
  type DramaGenJob,
} from '../../lib/dramaGenQueue'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'
import '../../pages/drama/drama.css'

const OPEN_STORAGE_KEY = 'drama-gen-queue-fab-open'

// Khoá trạng thái là giá trị API, chỉ tên hiển thị mới cần dịch.
const STATUS_LABEL: Record<string, LocalizedText> = {
  queued: { zh: '排队中', en: 'Queued', vi: 'Đang chờ' },
  running: { zh: '生成中', en: 'Generating', vi: 'Đang tạo' },
  done: { zh: '已完成', en: 'Done', vi: 'Đã xong' },
  failed: { zh: '失败', en: 'Failed', vi: 'Thất bại' },
}

// `subtype` của ảnh là loại tài nguyên do backend trả về: khoá là dữ liệu, giá trị mới dịch
const IMAGE_SUBTYPE_LABEL: Record<string, LocalizedText> = {
  character: { zh: '角色图', en: 'Character art', vi: 'Ảnh nhân vật' },
  scene: { zh: '场景图', en: 'Scene art', vi: 'Ảnh bối cảnh' },
  prop: { zh: '道具图', en: 'Prop art', vi: 'Ảnh đạo cụ' },
  material: { zh: '素材图', en: 'Material art', vi: 'Ảnh tư liệu' },
}

const COPY: Record<string, LocalizedText> = {
  panelLabel: { zh: '生成队列', en: 'Generation queue', vi: 'Hàng đợi tạo' },
  panelTitle: { zh: '生成队列', en: 'Generation queue', vi: 'Hàng đợi tạo' },
  activeCount: { zh: '{n} 项进行中', en: '{n} in progress', vi: '{n} đang chạy' },
  failedCount: { zh: '{n} 项失败', en: '{n} failed', vi: '{n} thất bại' },
  allDone: { zh: '全部完成', en: 'All done', vi: 'Đã xong hết' },
  cancelAllVideo: {
    zh: '取消全部视频任务',
    en: 'Cancel all video jobs',
    vi: 'Huỷ toàn bộ tác vụ video',
  },
  clearFinished: { zh: '清空已结束', en: 'Clear finished', vi: 'Xoá mục đã xong' },
  closePanel: { zh: '关闭队列', en: 'Close queue', vi: 'Đóng hàng đợi' },
  openPanel: { zh: '展开生成队列', en: 'Open generation queue', vi: 'Mở hàng đợi tạo' },
  collapsePanel: { zh: '收起生成队列', en: 'Collapse generation queue', vi: 'Thu gọn hàng đợi tạo' },
  kindVideo: { zh: '视频', en: 'Video', vi: 'Video' },
  kindImage: { zh: '图片', en: 'Image', vi: 'Ảnh' },
  queuePosition: { zh: '排队 #{n}', en: 'Queued #{n}', vi: 'Xếp hàng #{n}' },
  viewReason: { zh: '查看原因', en: 'See why', vi: 'Xem nguyên nhân' },
  viewDetail: { zh: '查看详情', en: 'View details', vi: 'Xem chi tiết' },
  upstreamTip: {
    zh: '需管理员充值 TokenFree Seedream 账户，用户端充值无法解决。',
    en: 'The admin needs to top up the TokenFree Seedream account. Paying from the user wallet cannot fix this.',
    vi: 'Quản trị viên cần nạp tiền cho tài khoản TokenFree Seedream. Người dùng nạp tiền không giải quyết được.',
  },
  fallbackVideo: { zh: '分镜视频', en: 'Storyboard clip', vi: 'Video storyboard' },
  fallbackImage: { zh: '图片', en: 'Image', vi: 'Ảnh' },
}

/** Đọc lựa chọn gập/expand đã lưu */
function readOpenPreference(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Nhãn loại tác vụ. `subtype` là token hợp đồng (tiếng Trung), nên phải qua bảng tra.
function jobTypeLabel(job: DramaGenJob, lt: (v: LocalizedText) => string): string {
  if (job.kind === 'video') {
    return job.subtype ? dramaGenSubtypeLabel(job.subtype) : lt(COPY.fallbackVideo)
  }
  const known = IMAGE_SUBTYPE_LABEL[job.subtype]
  if (known) return lt(known)
  return job.subtype || lt(COPY.fallbackImage)
}

// Icon theo loại tác vụ
function JobKindIcon({ kind }: { kind: DramaGenJob['kind'] }) {
  if (kind === 'video') return <Clapperboard size={16} strokeWidth={1.75} aria-hidden />
  return <ImageIcon size={16} strokeWidth={1.75} aria-hidden />
}

// Thay {n} trong bản dịch
function fill(text: string, n: number): string {
  return text.replace('{n}', String(n))
}

// Render panel hàng đợi sinh thống nhất ở góc phải dưới
export function DramaGenQueuePanel() {
  const lt = useLocalizedText()
  const queue = useDramaGenQueue()
  const [open, setOpen] = useState(readOpenPreference)
  const [detailJob, setDetailJob] = useState<DramaGenJob | null>(null)

  const active = useMemo(
    () => queue.filter((j) => j.status === 'queued' || j.status === 'running'),
    [queue],
  )
  const finished = useMemo(
    () => queue.filter((j) => j.status === 'done' || j.status === 'failed'),
    [queue],
  )
  const failed = useMemo(() => queue.filter((j) => j.status === 'failed'), [queue])

  // Danh sách sắp theo thời điểm vào hàng đợi (mới nhất lên trên); số thứ tự xếp hàng vẫn theo thứ tự vào
  const sortedQueue = useMemo(
    () => [...queue].sort((a, b) => b.createdAt - a.createdAt),
    [queue],
  )
  const queuedOnly = useMemo(
    () =>
      queue
        .filter((j) => j.status === 'queued' || j.status === 'running')
        .sort((a, b) => a.createdAt - b.createdAt),
    [queue],
  )

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [open])

  // Mở panel ngay sau khi có tác vụ mới vào hàng đợi
  useEffect(() => {
    return subscribeDramaGenQueueOpen(() => {
      setOpen(true)
    })
  }, [])

  // Còn video storyboard đang chạy thì poll nền, rời trang sửa vẫn không bị cắt
  useEffect(() => {
    if (active.some((job) => job.kind === 'video' && job.subtype === FRAGMENT_VIDEO_SUBTYPE)) {
      ensureEpisodeVideoStatusPoll()
    }
  }, [active])

  // Mỗi lần hàng đợi làm mới thì chi tiết bám theo đúng job đó
  useEffect(() => {
    if (!detailJob) return
    const latest = queue.find((j) => j.id === detailJob.id)
    if (!latest) {
      setDetailJob(null)
      return
    }
    if (latest !== detailJob) setDetailJob(latest)
  }, [queue, detailJob])

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setDetailJob(null)
  }, [])

  const cancelAllVideo = useCallback(async () => {
    try {
      await dramaApi.cancelAllVideoJobs()
      markVideoJobsCancelled()
    } catch {
      /* ignore */
    }
  }, [])

  if (queue.length === 0) return null

  const badgeCount = active.length

  return (
    <div className="drama-gen-fab-root">
      {open ? (
        <div
          className="drama-gen-fab-panel"
          role="dialog"
          aria-label={lt(COPY.panelLabel)}
        >
          {detailJob ? (
            <DramaGenTaskDetail job={detailJob} onClose={() => setDetailJob(null)} />
          ) : (
            <>
              <header className="drama-gen-fab-head">
                <div className="drama-gen-fab-title">
                  <Layers size={18} strokeWidth={1.75} aria-hidden />
                  <div>
                    <strong>{lt(COPY.panelTitle)}</strong>
                    <span>
                      {active.length > 0
                        ? fill(lt(COPY.activeCount), active.length)
                        : failed.length > 0
                          ? fill(lt(COPY.failedCount), failed.length)
                          : finished.length > 0
                            ? lt(COPY.allDone)
                            : ''}
                    </span>
                  </div>
                </div>
                <div className="drama-gen-fab-actions">
                  {active.some((j) => j.kind === 'video') ? (
                    <button
                      type="button"
                      className="drama-gen-fab-icon-btn"
                      onClick={cancelAllVideo}
                      title={lt(COPY.cancelAllVideo)}
                      aria-label={lt(COPY.cancelAllVideo)}
                    >
                      <Octagon size={16} />
                    </button>
                  ) : null}
                  {finished.length > 0 ? (
                    <button
                      type="button"
                      className="drama-gen-fab-icon-btn"
                      onClick={clearFinishedDramaGenJobs}
                      title={lt(COPY.clearFinished)}
                      aria-label={lt(COPY.clearFinished)}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="drama-gen-fab-icon-btn"
                    onClick={close}
                    title={lt(COPY.closePanel)}
                    aria-label={lt(COPY.closePanel)}
                  >
                    <X size={18} />
                  </button>
                </div>
              </header>

              <ul className="drama-gen-fab-list">
                {sortedQueue.map((job) => {
                  const queueIndex = queuedOnly.findIndex((j) => j.id === job.id)
                  const errView = job.status === 'failed' ? formatDramaGenError(job.error) : null
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        className={`drama-gen-fab-item is-${job.status} is-clickable`}
                        onClick={() => setDetailJob(job)}
                      >
                        <div className="drama-gen-fab-item-head">
                          <div className="drama-gen-fab-item-main">
                            <span className="drama-gen-fab-kind">
                              <JobKindIcon kind={job.kind} />
                              <em>{job.kind === 'video' ? lt(COPY.kindVideo) : lt(COPY.kindImage)}</em>
                            </span>
                            <span className="drama-gen-fab-name">{job.title}</span>
                            <span className="drama-gen-fab-type">{jobTypeLabel(job, lt)}</span>
                            {job.message && (job.status === 'queued' || job.status === 'running') ? (
                              <span className="drama-gen-fab-msg">{job.message}</span>
                            ) : null}
                          </div>
                          <span className="drama-gen-fab-status">
                            {job.status === 'queued' && queueIndex >= 0
                              ? queuedOnly.length <= 1 || queueIndex === 0
                                ? lt(STATUS_LABEL.queued)
                                : fill(lt(COPY.queuePosition), queueIndex + 1)
                              : lt(STATUS_LABEL[job.status] ?? { zh: job.status, en: job.status, vi: job.status })}
                          </span>
                        </div>
                        {errView ? (
                          <div className="drama-gen-fab-error-block">
                            <p className="drama-gen-fab-error-title">{errView.title}</p>
                            <p className="drama-gen-fab-error">{errView.message}</p>
                            {errView.suggestion ? (
                              <p className="drama-gen-fab-error-tip">{errView.suggestion}</p>
                            ) : null}
                            {errView.billingBlocked ? (
                              <p className="drama-gen-fab-error-tip">
                                <BillingTopupLink className="pf-link pf-billing-topup-link drama-gen-fab-topup-link" />
                              </p>
                            ) : null}
                            {errView.upstreamAccountBlocked ? (
                              <p className="drama-gen-fab-error-tip drama-gen-fab-upstream-tip">
                                {lt(COPY.upstreamTip)}
                              </p>
                            ) : null}
                            <span className="drama-gen-fab-open-hint">{lt(COPY.viewReason)}</span>
                          </div>
                        ) : (
                          <span className="drama-gen-fab-open-hint">{lt(COPY.viewDetail)}</span>
                        )}
                        {(job.status === 'queued' || job.status === 'running') && (
                          <div className="drama-gen-fab-bar" aria-hidden />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>

              {active.length > 0 ? (
                <footer className="drama-gen-fab-foot">
                  <span className="drama-gen-fab-foot-dot" aria-hidden />
                </footer>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <button
        type="button"
        className={`drama-gen-fab-btn${active.length > 0 ? ' is-busy' : ''}${failed.length > 0 && active.length === 0 ? ' is-failed' : ''}`}
        onClick={toggleOpen}
        title={open ? lt(COPY.collapsePanel) : lt(COPY.openPanel)}
        aria-expanded={open}
        aria-label={lt(COPY.panelLabel)}
      >
        <Layers size={22} strokeWidth={1.75} aria-hidden />
        {badgeCount > 0 ? <span className="drama-gen-fab-badge">{badgeCount}</span> : null}
      </button>
    </div>
  )
}
