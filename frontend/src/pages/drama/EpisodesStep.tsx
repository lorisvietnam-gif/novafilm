/** Bước tạo video theo tập: vào trang sẽ cắt theo quy tắc; có cắt lại toàn bộ bằng quy tắc và lập storyboard AI cho từng tập */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clapperboard, Film, Layers, Sparkles, Wand2 } from 'lucide-react'
import { dramaApi, resolveDramaMediaUrl, type DramaEpisode } from '../../api/drama'
import { dialog } from '../../lib/dialog'
import { loadDramaEpisodes } from '../../lib/dramaStoryboardNav'
import { readEpisodeSubtitleMode, subtitleModeUsesModelOutput } from '../../lib/dramaSubtitleBoard'
import { FragmentPlanSkillModal } from '../../components/drama/FragmentPlanSkillModal'
import { DramaImageStylePreviewImg } from '../../components/drama/DramaImageStylePreviewImg'
import { readFragmentGenerationStatus } from './dramaEpisodeEditUtils'

type EpisodesStepProps = {
  projectId: number
  onError: (m: string) => void
}

type EpisodeSummary = {
  epNo: number
  fragmentCount: number
  videoDone: number
  videoRunning: number
  videoFailed: number
  totalSec: number
  previewUrl: string
  planStatus: string
}

// Đọc trạng thái storyboard AI của tập
function readPlanStatus(ep: DramaEpisode): string {
  const active = (ep.active_tasks || []).find((task) => task.task_type === 'fragment_plan')
  if (
    active &&
    !active.cancel_requested &&
    ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(active.status)
  ) {
    return 'generating'
  }
  const st = ep.params?.fragment_plan_status
  return typeof st === 'string' ? st : ''
}

// Tổng hợp tiến độ storyboard và video của một tập
function summarizeEpisode(ep: DramaEpisode): EpisodeSummary {
  const frags = ep.fragments || []
  const activeFragmentIds = new Set<number>()
  for (const task of ep.active_tasks || []) {
    if (
      task.task_type === 'fragment_video' &&
      typeof task.fragment_id === 'number' &&
      !task.cancel_requested &&
      ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(task.status)
    ) {
      activeFragmentIds.add(task.fragment_id)
    }
  }
  let videoDone = 0
  let videoRunning = 0
  let videoFailed = 0
  let totalSec = 0
  let previewUrl = ''
  for (const frag of frags) {
    totalSec += frag.duration_sec && frag.duration_sec > 0 ? frag.duration_sec : 8
    const st = readFragmentGenerationStatus(frag).status
    if (st === 'done') videoDone += 1
    else if (st === 'queued' || st === 'running' || st === 'generating' || activeFragmentIds.has(frag.id))
      videoRunning += 1
    else if (st === 'failed') videoFailed += 1
    if (!previewUrl) {
      const raw = (frag.cover || frag.video || '').trim()
      if (raw) previewUrl = resolveDramaMediaUrl(raw)
    }
  }
  const epNo = Number(ep.params?.episodeNumber) || 0
  return {
    epNo,
    fragmentCount: frags.length,
    videoDone,
    videoRunning,
    videoFailed,
    totalSec,
    previewUrl,
    planStatus: readPlanStatus(ep),
  }
}

// Tiêu đề tập hiển thị dọc (cắt bớt nếu quá dài)
function verticalTitleLabel(name: string, max = 14): string {
  const clean = (name || '').replace(/\s+/g, '')
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

// Render bước tạo video theo tập
export function EpisodesStep({ projectId, onError }: EpisodesStepProps) {
  const navigate = useNavigate()
  const [episodes, setEpisodes] = useState<DramaEpisode[]>([])
  const [loading, setLoading] = useState(true)
  const [reseeding, setReseeding] = useState(false)
  const [planningId, setPlanningId] = useState<number | null>(null)
  // planTarget tập đang chờ xác nhận lập storyboard AI
  const [planTarget, setPlanTarget] = useState<DramaEpisode | null>(null)
  const seeded = useRef(false)

  useEffect(() => {
    seeded.current = false
  }, [projectId])

  // Vào trang chỉ đọc các tập đã có; chỉ khi force mới cắt lại theo kịch bản
  async function loadEpisodes(force = false) {
    const rows = await loadDramaEpisodes(projectId, force)
    setEpisodes(rows)
    return rows
  }

  useEffect(() => {
    async function enter() {
      setLoading(true)
      try {
        if (!seeded.current) {
          seeded.current = true
          await loadEpisodes(false)
        } else {
          setEpisodes(await dramaApi.listEpisodes(projectId))
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Tải danh sách tập thất bại')
        try {
          setEpisodes(await dramaApi.listEpisodes(projectId))
        } catch {
          /* ignore */
        }
      } finally {
        setLoading(false)
      }
    }
    void enter()
  }, [projectId, onError])

  async function handleReseed() {
    if (reseeding || planningId != null) return
    const ok = await dialog.confirm({
      title: 'Cắt lại toàn bộ storyboard bằng quy tắc',
      message:
        'Sẽ cắt lại nhanh toàn bộ storyboard bằng bộ quy tắc (kể cả các tập đã sửa hoặc đã tạo video). Muốn chia cảnh tinh tế cho một tập thì dùng “Storyboard AI”. Tiếp tục?',
      confirmText: 'Tiếp tục cắt',
      tone: 'danger',
    })
    if (!ok) return
    setReseeding(true)
    try {
      const rows = await loadEpisodes(true)
      await dialog.alert({
        title: 'Đã cắt xong',
        message: `Đã cập nhật storyboard cho ${rows.length} tập; vào từng tập để xem.`,
        tone: 'success',
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Cắt lại thất bại')
    } finally {
      setReseeding(false)
    }
  }

  // Mở hộp thoại xác nhận storyboard AI (có chọn Skill)
  function handlePlanEpisode(ep: DramaEpisode) {
    if (reseeding || planningId != null) return
    setPlanTarget(ep)
  }

  // Đưa storyboard LLM của một tập vào hàng đợi rồi thăm dò (cách làm phụ đề lấy theo cài đặt hiện tại của tập)
  async function startPlanEpisode(ep: DramaEpisode, skillIds: number[]) {
    setPlanTarget(null)
    setPlanningId(ep.id)
    try {
      const subtitleMode = readEpisodeSubtitleMode(ep.params)
      await dramaApi.planEpisodeFragments(ep.id, {
        force: true,
        fallback_rules: true,
        skill_ids: skillIds,
        subtitle_enabled: subtitleModeUsesModelOutput(subtitleMode),
      })
      const started = Date.now()
      while (Date.now() - started < 10 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 2500))
        const cur = await dramaApi.getEpisode(ep.id)
        const st = readPlanStatus(cur)
        if (st === 'completed') {
          setEpisodes((prev) => prev.map((row) => (row.id === cur.id ? cur : row)))
          const count = Number(cur.params?.fragment_plan_count) || (cur.fragments || []).length
          const mode = String(cur.params?.fragment_plan_mode || 'llm')
          await dialog.alert({
            title: 'Đã lập xong storyboard',
            message:
              mode === 'rules_fallback'
                ? `“${cur.name}” đã lùi về cắt bằng quy tắc, gồm ${count} cảnh quay.`
                : `“${cur.name}” đã lập xong storyboard AI, gồm ${count} cảnh quay.`,
            tone: 'success',
          })
          return
        }
        if (st === 'failed') {
          throw new Error(String(cur.params?.fragment_plan_error || 'Storyboard AI thất bại'))
        }
      }
      throw new Error('Storyboard AI quá thời gian chờ, hãy tải lại trang sau')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Storyboard AI thất bại')
    } finally {
      setPlanningId(null)
    }
  }

  const totalFragments = episodes.reduce((n, ep) => n + (ep.fragments?.length || 0), 0)
  const totalVideos = episodes.reduce(
    (n, ep) =>
      n + (ep.fragments || []).filter((f) => readFragmentGenerationStatus(f).status === 'done').length,
    0,
  )

  return (
    <div className="drama-episodes-step">
      <header className="drama-episodes-hero">
        <div className="drama-episodes-hero-main">
          <div className="drama-episodes-hero-icon" aria-hidden>
            <Film size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h2>Video theo tập</h2>
            <p className="drama-episodes-hero-sub">
              Tổng <strong>{episodes.length}</strong> tập ·{' '}
              <strong>{totalFragments}</strong> cảnh quay · Đã ra phim{' '}
              <strong>{totalVideos}</strong>
            </p>
          </div>
        </div>
        <div className="drama-episodes-hero-actions">
          <button
            type="button"
            className="drama-btn-ghost drama-episodes-reseed-btn"
            disabled={reseeding || planningId != null || loading}
            onClick={() => void handleReseed()}
          >
            <Layers size={16} strokeWidth={1.75} aria-hidden />
            {reseeding ? 'Đang cắt…' : 'Cắt lại toàn bộ bằng quy tắc'}
          </button>
        </div>
      </header>

      <div className="drama-episodes-tips" role="note">
        <Sparkles size={15} strokeWidth={1.75} aria-hidden />
        <span>Từng tập có thể bấm <strong>Storyboard AI</strong> để lên kế hoạch tinh tế; vào <strong>Sửa</strong> để chỉnh kịch bản và tạo video.</span>
      </div>

      {loading ? (
        <div className="drama-episode-grid" aria-busy="true" aria-label="Đang tải các tập">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="drama-ep-card drama-ep-card-skeleton" />
          ))}
        </div>
      ) : episodes.length === 0 ? (
        <div className="drama-episodes-empty">
          <DramaImageStylePreviewImg
            styleId="retro-narrative-film"
            alt=""
            loading="lazy"
          />
          <Clapperboard size={40} strokeWidth={1.25} aria-hidden />
          <p>Chưa có tập nào; hãy hoàn tất bước viết kịch bản theo tập trước.</p>
        </div>
      ) : (
        <div className="drama-episode-grid">
          {episodes.map((ep) => {
            const planning = planningId === ep.id
            const summary = summarizeEpisode(ep)
            const progress =
              summary.fragmentCount > 0
                ? Math.round((summary.videoDone / summary.fragmentCount) * 100)
                : 0
            const epLabel =
              summary.epNo > 0 ? `Tập ${summary.epNo}` : `Tập ${ep.id}`
            const statusLabel = planning
              ? 'Đang lập storyboard AI'
              : summary.videoRunning > 0
                ? `${summary.videoRunning} cảnh đang tạo`
                : summary.videoFailed > 0
                  ? `${summary.videoFailed} cảnh thất bại`
                  : summary.videoDone > 0
                    ? `Đã ra phim ${summary.videoDone}/${summary.fragmentCount}`
                    : `${summary.fragmentCount} cảnh quay`

            return (
              <article
                key={ep.id}
                className={`drama-ep-card${planning ? ' is-planning' : ''}${
                  summary.videoRunning > 0 ? ' is-generating' : ''
                }`}
              >
                <button
                  type="button"
                  className="drama-ep-card-poster"
                  onClick={() => navigate(`/drama/projects/${projectId}/episodes/${ep.id}`)}
                  aria-label={`Sửa ${ep.name}`}
                >
                  {summary.previewUrl ? (
                    <img src={summary.previewUrl} alt="" className="drama-ep-card-poster-img" />
                  ) : (
                    <div className="drama-ep-card-poster-fallback">
                      <span className="drama-ep-card-poster-vertical">
                        {verticalTitleLabel(ep.name)}
                      </span>
                    </div>
                  )}
                  <span className="drama-ep-card-ep-badge">{epLabel}</span>
                  {summary.previewUrl ? (
                    <span className="drama-ep-card-play" aria-hidden>
                      <Film size={18} strokeWidth={1.75} />
                    </span>
                  ) : null}
                  {summary.videoRunning > 0 ? (
                    <span className="drama-ep-card-busy" aria-hidden />
                  ) : null}
                </button>

                <div className="drama-ep-card-body">
                  <h3 className="drama-ep-card-title">{ep.name}</h3>
                  <div className="drama-ep-card-meta">
                    <span className="drama-ep-card-meta-item">
                      <Layers size={14} strokeWidth={1.75} aria-hidden />
                      {statusLabel}
                    </span>
                    {summary.totalSec > 0 ? (
                      <span className="drama-ep-card-meta-item">
                        <Clapperboard size={14} strokeWidth={1.75} aria-hidden />
                        Khoảng {summary.totalSec}s
                      </span>
                    ) : null}
                  </div>
                  {summary.fragmentCount > 0 ? (
                    <div className="drama-ep-card-progress" aria-hidden>
                      <div
                        className="drama-ep-card-progress-bar"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="drama-ep-card-actions">
                  <button
                    type="button"
                    className="drama-ep-card-ai-btn"
                    disabled={reseeding || planningId != null}
                    onClick={() => void handlePlanEpisode(ep)}
                  >
                    <Wand2 size={15} strokeWidth={1.75} aria-hidden />
                    {planning ? 'Đang lập…' : 'Storyboard AI'}
                  </button>
                  <button
                    type="button"
                    className="drama-btn-primary drama-ep-card-edit-btn"
                    disabled={planning}
                    onClick={() => navigate(`/drama/projects/${projectId}/episodes/${ep.id}`)}
                  >
                    Sửa
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <FragmentPlanSkillModal
        open={planTarget != null}
        message={`Sẽ gọi mô hình ngôn ngữ lớn để lập lại storyboard cho “${planTarget?.name || ''}” (ghi đè storyboard và video hiện có của tập này), thường mất vài chục giây. Có thể chọn Skill dùng cho lần này. Cách làm phụ đề lấy theo cài đặt hiện tại của tập.`}
        onCancel={() => setPlanTarget(null)}
        onConfirm={(skillIds) => {
          if (planTarget) void startPlanEpisode(planTarget, skillIds)
        }}
      />
    </div>
  )
}
