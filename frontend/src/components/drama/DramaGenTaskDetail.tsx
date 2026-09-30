/** Chi tiết một tác vụ trong hàng đợi: đang chạy thì xem tiến độ, lỗi thì mới đào nguyên nhân */
import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { tasksApi, type TaskRunOut } from '../../api/tasks'
import { formatDramaGenError, pickRootDramaGenError } from '../../lib/dramaGenError'
import BillingTopupLink from '../billing/BillingTopupLink'
import type { DramaGenJob } from '../../lib/dramaGenQueue'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Props = {
  job: DramaGenJob
  onClose: () => void
}

// Khoá là trạng thái nội bộ của hàng đợi, chỉ nhãn hiển thị mới dịch
const STATUS_LABEL: Record<DramaGenJob['status'], LocalizedText> = {
  queued: { zh: '排队中', en: 'Queued', vi: 'Đang chờ' },
  running: { zh: '生成中', en: 'Generating', vi: 'Đang tạo' },
  done: { zh: '已完成', en: 'Done', vi: 'Đã xong' },
  failed: { zh: '失败', en: 'Failed', vi: 'Thất bại' },
}

const COPY: Record<string, LocalizedText> = {
  titleFailed: { zh: '失败原因', en: 'Why it failed', vi: 'Lý do thất bại' },
  titleProgress: { zh: '任务进度', en: 'Job progress', vi: 'Tiến độ tác vụ' },
  titleDetail: { zh: '任务详情', en: 'Job details', vi: 'Chi tiết tác vụ' },
  close: { zh: '关闭', en: 'Close', vi: 'Đóng' },
  parsing: { zh: '正在解析错误…', en: 'Reading the error…', vi: 'Đang phân tích lỗi…' },
  suggestion: { zh: '建议：', en: 'Try this: ', vi: 'Nên làm: ' },
  upstreamShort: {
    zh: '需管理员充值 TokenFree Seedream 账户。',
    en: 'The admin needs to top up the TokenFree Seedream account.',
    vi: 'Quản trị viên cần nạp tiền cho tài khoản TokenFree Seedream.',
  },
  upstreamLong: {
    zh: '需管理员充值 TokenFree Seedream 账户，用户端充值无法解决。',
    en: 'The admin needs to top up the TokenFree Seedream account. Paying from the user wallet cannot fix this.',
    vi: 'Quản trị viên cần nạp tiền cho tài khoản TokenFree Seedream. Người dùng nạp tiền không giải quyết được.',
  },
  hideRaw: { zh: '收起原始错误', en: 'Hide raw error', vi: 'Ẩn lỗi gốc' },
  showRaw: { zh: '查看原始错误', en: 'Show raw error', vi: 'Xem lỗi gốc' },
  doneTip: {
    zh: '成片已写回分镜，可在时间轴预览。',
    en: 'The finished clip has been written back to the shot. Preview it on the timeline.',
    vi: 'Video đã được ghi lại vào cảnh quay. Xem trước ở thanh thời gian.',
  },
  hintQueued: {
    zh: '任务已入队，等待调度器领取。',
    en: 'The job is queued and waiting for the scheduler to pick it up.',
    vi: 'Tác vụ đã vào hàng đợi, đang chờ bộ lập lịch nhận.',
  },
  hintVideo: {
    zh: '正在生成分镜视频，完成后会自动更新封面与成片。',
    en: 'Rendering the storyboard clip. The cover and the final film update automatically when it finishes.',
    vi: 'Đang tạo video storyboard. Ảnh bìa và phim hoàn chỉnh sẽ tự cập nhật khi xong.',
  },
  hintImage: {
    zh: '正在生成图片，完成后会自动写回资产。',
    en: 'Rendering the image. It is written back to the asset automatically when it finishes.',
    vi: 'Đang tạo ảnh. Ảnh sẽ tự được ghi lại vào tài nguyên khi xong.',
  },
}

// Lấy các tác vụ lịch sử liên quan tới mục tiêu này (để tìm ra nguyên nhân bị câu "vượt giới hạn retry" che)
async function listRelatedTasks(job: DramaGenJob): Promise<TaskRunOut[]> {
  if (job.kind === 'video' && job.targetId > 0) {
    const list = await tasksApi.list({
      domain: 'drama',
      task_type: 'fragment_video',
      target_type: 'fragment',
      target_id: job.targetId,
      page: 1,
      page_size: 20,
    })
    return list.items || []
  }
  if (job.kind === 'image' && job.targetId > 0) {
    const list = await tasksApi.list({
      domain: 'drama',
      target_type: 'asset',
      target_id: job.targetId,
      page: 1,
      page_size: 20,
    })
    return list.items || []
  }
  if (job.taskId && job.taskId > 0) {
    try {
      const one = await tasksApi.get(job.taskId)
      return one ? [one] : []
    } catch {
      return []
    }
  }
  return []
}

// Phần mô tả tiến độ cho tác vụ đang chạy
function activeJobHint(job: DramaGenJob, lt: (v: LocalizedText) => string): string {
  if (job.message?.trim()) return job.message.trim()
  if (job.status === 'queued') return lt(COPY.hintQueued)
  if (job.kind === 'video') return lt(COPY.hintVideo)
  return lt(COPY.hintImage)
}

// Ngăn kéo chi tiết tác vụ (đang chạy = tiến độ; lỗi = văn bản lỗi)
export function DramaGenTaskDetail({ job, onClose }: Props) {
  const lt = useLocalizedText()
  const isFailed = job.status === 'failed'
  const isActive = job.status === 'queued' || job.status === 'running'
  const [loading, setLoading] = useState(isFailed)
  const [rawError, setRawError] = useState(job.error || '')
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    // Tác vụ không lỗi thì không đào lịch sử lỗi, tránh coi "bỏ qua tác vụ trùng" cũ là lỗi hiện tại
    if (!isFailed) {
      setRawError('')
      setLoading(false)
      return
    }

    let cancelled = false
    setRawError(job.error || '')
    setLoading(true)
    void (async () => {
      try {
        const tasks = await listRelatedTasks(job)
        if (cancelled) return
        const candidates: Array<string | null | undefined> = [job.error]
        for (const task of tasks) {
          // Ưu tiên tác vụ mà job hiện tại đang gắn; lịch sử cancelled kiểu "bỏ qua trùng" không được cướp chỗ nguyên nhân
          if (job.taskId && task.id === job.taskId) {
            candidates.unshift(task.error_message)
            continue
          }
          if (
            task.status === 'cancelled' &&
            /跳过重复任务|分镜已生成完成/.test(String(task.error_message || ''))
          ) {
            continue
          }
          candidates.push(task.error_message)
        }
        let best = pickRootDramaGenError(candidates)
        if (!best || /重试超过|超过上限/.test(best)) {
          for (const task of tasks.slice(0, 5)) {
            if (!task.id) continue
            if (
              task.status === 'cancelled' &&
              /跳过重复任务|分镜已生成完成/.test(String(task.error_message || ''))
            ) {
              continue
            }
            try {
              const detail = await tasksApi.get(task.id)
              if (cancelled) return
              candidates.push(detail.error_message)
              for (const ev of detail.events || []) {
                candidates.push(ev.message)
              }
            } catch {
              /* ignore */
            }
          }
          best = pickRootDramaGenError(candidates)
        }
        if (best) setRawError(best)
      } catch {
        /* Không có tác vụ nền tảng thì vẫn dùng job.error */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [job, isFailed])

  const errView = isFailed ? formatDramaGenError(rawError || job.message) : null
  const panelTitle = isFailed ? lt(COPY.titleFailed) : isActive ? lt(COPY.titleProgress) : lt(COPY.titleDetail)

  return (
    <div className="drama-gen-detail" role="dialog" aria-label={panelTitle}>
      <header className="drama-gen-detail-head">
        <div>
          <strong>{panelTitle}</strong>
          <span>{job.title}</span>
        </div>
        <button type="button" className="drama-gen-fab-icon-btn" onClick={onClose} aria-label={lt(COPY.close)}>
          <X size={18} />
        </button>
      </header>

      <div className="drama-gen-detail-body">
        {loading ? (
          <div className="drama-gen-detail-loading">
            <Loader2 size={18} className="drama-gen-detail-spin" />
            <span>{lt(COPY.parsing)}</span>
          </div>
        ) : null}

        {isFailed && errView ? (
          <section className="drama-gen-detail-card is-error">
            <h4>{errView.title}</h4>
            <p>{errView.message}</p>
            {errView.suggestion ? (
              <p className="drama-gen-detail-tip">
                <strong>{lt(COPY.suggestion)}</strong>
                {errView.suggestion}
                {errView.billingBlocked ? (
                  <>
                    {' '}
                    <BillingTopupLink />
                  </>
                ) : null}
                {errView.upstreamAccountBlocked ? <> {lt(COPY.upstreamShort)}</> : null}
              </p>
            ) : errView.billingBlocked ? (
              <p className="drama-gen-detail-tip">
                <BillingTopupLink />
              </p>
            ) : errView.upstreamAccountBlocked ? (
              <p className="drama-gen-detail-tip">{lt(COPY.upstreamLong)}</p>
            ) : null}
            {rawError ? (
              <button
                type="button"
                className="drama-gen-detail-raw-toggle"
                onClick={() => setShowRaw((v) => !v)}
              >
                {showRaw ? lt(COPY.hideRaw) : lt(COPY.showRaw)}
              </button>
            ) : null}
            {showRaw && rawError ? <pre className="drama-gen-detail-raw">{rawError}</pre> : null}
          </section>
        ) : (
          <section className={`drama-gen-detail-card${isActive ? '' : ' is-done'}`}>
            <h4>{lt(STATUS_LABEL[job.status])}</h4>
            <p>{activeJobHint(job, lt)}</p>
            {job.status === 'done' ? (
              <p className="drama-gen-detail-tip">{lt(COPY.doneTip)}</p>
            ) : null}
          </section>
        )}
      </div>
    </div>
  )
}
