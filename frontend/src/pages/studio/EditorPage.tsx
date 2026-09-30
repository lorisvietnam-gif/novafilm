import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Project, Shot } from '../../api'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import AppShell from '../../components/layout/AppShell'
import ComingSoon from '../../components/ui/ComingSoon'
import { STATUS_CN, shotsByNo } from '../../lib/status'
import { downloadSingleVideo } from '../../lib/clientDownload'
import { getDramaImageStylePreviewUrl } from '../../lib/dramaImageStylePreviews'
import type { ImageStyleId } from '../../lib/dramaImageStyles'
import './studio.css'

const SCRIPT_TAB = 'Lời dẫn'
const VISUAL_TAB = 'Hình ảnh'
const VOICE_TAB = 'Lồng tiếng'
const TRANSITION_TAB = 'Chuyển cảnh'

const PANEL_TABS = [SCRIPT_TAB, VISUAL_TAB, VOICE_TAB, TRANSITION_TAB] as const

/** Ảnh trang trí cho các ô trống — đổi theo ngữ cảnh để không lặp cảm giác */
const EMPTY_ART: Record<string, ImageStyleId> = {
  list: '90s-realistic-film',
  preview: 'retro-narrative-film',
  strip: 'japanese-daily-natural',
  library: 'korean-urban-soft',
}

export default function EditorPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const nav = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [activeShotId, setActiveShotId] = useState<number | null>(null)
  const [tab, setTab] = useState<(typeof PANEL_TABS)[number]>(SCRIPT_TAB)
  const [narration, setNarration] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const shotFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    if (!projectId) {
      nav('/studio/new')
      return
    }
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p)
        const first = p.shots[0]
        if (first) {
          setActiveShotId(first.id)
          setNarration(first.narration || '')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Không tải được dự án.'))
  }, [nav, projectId])

  const orderedShots = useMemo(() => shotsByNo(project?.shots), [project?.shots])
  const shot: Shot | undefined = useMemo(
    () => orderedShots.find((s) => s.id === activeShotId),
    [orderedShots, activeShotId],
  )
  const shotIndex = shot ? orderedShots.findIndex((s) => s.id === shot.id) : -1

  const totalDuration = useMemo(
    () => (project?.shots || []).reduce((s, x) => s + (Number(x.duration) || 0), 0),
    [project?.shots],
  )

  function selectShot(s: Shot) {
    setActiveShotId(s.id)
    setNarration(s.narration || '')
  }

  async function saveNarration() {
    if (!project || !shot) return
    setBusy(true)
    setError('')
    try {
      await api.updateShot(project.id, shot.id, { narration })
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu lời dẫn thất bại.')
    } finally {
      setBusy(false)
    }
  }

  async function regenImage() {
    if (!project || !shot) return
    setBusy(true)
    try {
      await api.regenImage(project.id, shot.id)
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo lại hình ảnh thất bại.')
    } finally {
      setBusy(false)
    }
  }

  /** Thêm một cảnh quay vào cuối phim và chọn cảnh mới tạo. */
  async function addShot() {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      const created = await api.createShot(project.id)
      const next = await api.getProject(project.id)
      setProject(next)
      const s = next.shots.find((x) => x.id === created.id)
      if (s) selectShot(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thêm cảnh quay thất bại.')
    } finally {
      setBusy(false)
    }
  }

  /** Đổi chỗ cảnh quay hiện tại với cảnh kế bên. */
  async function moveShot(delta: number) {
    if (!project || !shot) return
    const ordered = orderedShots
    const i = ordered.findIndex((s) => s.id === shot.id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= ordered.length) return
    const ids = ordered.map((s) => s.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setBusy(true)
    setError('')
    try {
      setProject(await api.reorderShots(project.id, ids))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đổi thứ tự thất bại.')
    } finally {
      setBusy(false)
    }
  }

  /** Tải lên khung hình cho cảnh này; thay xong phải tạo lại video. */
  async function onShotImageFile(file: File | null) {
    if (!project || !shot || !file) return
    setBusy(true)
    setError('')
    try {
      setProject(await api.uploadShotImage(project.id, shot.id, file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải ảnh lên thất bại.')
    } finally {
      setBusy(false)
      if (shotFileRef.current) shotFileRef.current.value = ''
    }
  }

  /** Tải phim hoàn chỉnh đã ghép. */
  async function exportFilm() {
    if (!project?.final_video_url) return
    setBusy(true)
    setError('')
    try {
      await downloadSingleVideo({
        projectId: project.id,
        title: project.title,
        url: api.assetUrl(project.final_video_url, project.updated_at),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xuất video thất bại.')
    } finally {
      setBusy(false)
    }
  }

  async function regenAudio() {
    if (!project || !shot) return
    setBusy(true)
    try {
      await api.regenAudio(project.id, shot.id)
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lồng tiếng lại thất bại.')
    } finally {
      setBusy(false)
    }
  }

  if (!project && !error) {
    return (
      <AppShell active="studio" flush>
        <p className="pf-muted" style={{ padding: '2rem' }}>
          Đang tải…
        </p>
      </AppShell>
    )
  }

  if (!project) {
    return (
      <AppShell active="studio">
        <BillingErrorNotice message={error} />
      </AppShell>
    )
  }

  const isPortrait =
    (project.output_ratio || '') === '9:16' ||
    (!project.output_ratio && project.pipeline_mode === 'image_text')
  // Ưu tiên tư liệu của cảnh đang chọn; phim hoàn chỉnh dành cho mục xem trước, không dùng để sửa cảnh.
  const shotVideo = shot?.video_url ? api.assetUrl(shot.video_url, shot.version) : null
  const shotImage = shot?.image_url ? api.assetUrl(shot.image_url, shot.version) : null

  return (
    <AppShell active="studio" flush>
      <div className="studio-scoped">
        <div className="studio-editor-bar">
          <div className="studio-editor-bar-id">
            <button type="button" className="pf-link" onClick={() => nav(`/studio/${project.id}`)}>
              ← Quay lại dự án
            </button>
            <strong>{project.title}</strong>
            <span className="studio-status-chip">{STATUS_CN[project.status] || project.status}</span>
          </div>
          <div className="studio-editor-bar-ops">
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
              Hoàn tác <ComingSoon />
            </button>
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
              Làm lại <ComingSoon />
            </button>
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
              Lưu nháp <ComingSoon />
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm"
              disabled={!shot?.video_url && !project.final_video_url}
              onClick={() => {
                const el = document.getElementById('pf-editor-player') as HTMLVideoElement | null
                if (el) {
                  el.play()
                  return
                }
                if (project.final_video_url) {
                  window.open(api.assetUrl(project.final_video_url, project.updated_at), '_blank')
                }
              }}
            >
              Xem thử
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-lime pf-btn-sm"
              disabled={busy || !project.final_video_url}
              onClick={() => void exportFilm()}
            >
              Xuất video
            </button>
          </div>
        </div>

        {error ? (
          <BillingErrorNotice message={error} style={{ padding: '0.5rem 1.25rem' }} />
        ) : null}

        <div className="pf-editor">
          <aside>
            <div className="studio-panel-head">
              <strong>Danh sách cảnh quay</strong>
              <button
                type="button"
                className="pf-link"
                disabled={busy}
                onClick={() => void addShot()}
              >
                + Thêm cảnh quay
              </button>
            </div>
            {orderedShots.map((s) => (
              <button
                key={s.id}
                type="button"
                className={activeShotId === s.id ? 'pf-scene-item active' : 'pf-scene-item'}
                onClick={() => selectShot(s)}
              >
                {s.image_url ? (
                  <img src={api.assetUrl(s.image_url, s.version)} alt="" loading="lazy" />
                ) : (
                  <span className="studio-thumb-empty" aria-hidden>
                    <img
                      src={getDramaImageStylePreviewUrl(EMPTY_ART.list)}
                      alt=""
                      loading="lazy"
                    />
                  </span>
                )}
                <div>
                  <strong style={{ fontSize: '0.82rem' }}>
                    {String(s.shot_no).padStart(2, '0')} {s.overlay_title || 'Cảnh quay'}
                  </strong>
                  <div className="pf-muted" style={{ fontSize: '0.72rem' }}>
                    {(s.narration || '').slice(0, 28)}
                  </div>
                </div>
              </button>
            ))}
            <p className="pf-muted studio-total-time">
              Tổng thời lượng{' '}
              {Math.floor(totalDuration / 60)
                .toString()
                .padStart(2, '0')}
              :
              {Math.floor(totalDuration % 60)
                .toString()
                .padStart(2, '0')}
            </p>
            <div className="studio-reorder-row">
              <button
                type="button"
                className="pf-btn pf-btn-ghost pf-btn-sm"
                disabled={busy || !shot || shotIndex <= 0}
                onClick={() => void moveShot(-1)}
              >
                Lên
              </button>
              <button
                type="button"
                className="pf-btn pf-btn-ghost pf-btn-sm"
                disabled={busy || !shot || shotIndex < 0 || shotIndex >= orderedShots.length - 1}
                onClick={() => void moveShot(1)}
              >
                Xuống
              </button>
            </div>
          </aside>

          <section>
            <div className="studio-panel-head">
              <strong>
                {shot ? `Cảnh quay ${shot.shot_no}` : 'Xem trước'} ·{' '}
                {isPortrait ? '9:16' : '16:9'}
              </strong>
              <div className="studio-panel-ops">
                <input
                  ref={shotFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  onChange={(e) => void onShotImageFile(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm"
                  disabled={busy || !shot}
                  onClick={() => shotFileRef.current?.click()}
                >
                  Tải ảnh lên
                </button>
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm"
                  disabled={busy}
                  onClick={regenImage}
                >
                  AI vẽ lại
                </button>
              </div>
            </div>
            <div className={isPortrait ? 'pf-editor-preview portrait' : 'pf-editor-preview'}>
              {shotVideo ? (
                <video
                  id="pf-editor-player"
                  key={`v-${shot?.id}-${shot?.version}`}
                  src={shotVideo}
                  poster={shotImage || undefined}
                  controls
                  playsInline
                />
              ) : shotImage ? (
                <img key={`i-${shot?.id}-${shot?.version}`} src={shotImage} alt="" />
              ) : (
                <div className="studio-still studio-still--placeholder studio-preview-empty">
                  <img
                    src={getDramaImageStylePreviewUrl(EMPTY_ART.preview)}
                    alt=""
                    loading="lazy"
                  />
                  <span className="studio-still-note">
                    {shot
                      ? 'Cảnh này chưa có hình. Tạo ảnh hoặc tải ảnh của bạn lên.'
                      : 'Chọn một cảnh quay ở cột bên trái để xem trước.'}
                  </span>
                </div>
              )}
            </div>
            {shot?.audio_url ? (
              <audio
                src={api.assetUrl(shot.audio_url)}
                controls
                style={{ width: '100%', marginTop: '0.65rem' }}
              />
            ) : null}

            <div className="studio-strip">
              {orderedShots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={activeShotId === s.id ? 'is-active' : ''}
                  onClick={() => selectShot(s)}
                  aria-label={`Cảnh quay ${s.shot_no}`}
                  aria-pressed={activeShotId === s.id}
                >
                  {s.image_url ? (
                    <img
                      src={api.assetUrl(s.image_url, s.version)}
                      alt=""
                      loading="lazy"
                      style={{ width: 88, height: 50, objectFit: 'cover', display: 'block', borderRadius: 6 }}
                    />
                  ) : (
                    <span className="studio-strip-empty" aria-hidden>
                      <img
                        src={getDramaImageStylePreviewUrl(EMPTY_ART.strip)}
                        alt=""
                        loading="lazy"
                      />
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="studio-dropzone">
              <p>
                Bạn có thể dùng <strong>“Tải ảnh lên”</strong> để thay ảnh của cảnh này, hoặc dùng{' '}
                <strong>“AI vẽ lại”</strong> để tạo lại từ prompt.
              </p>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div className="pf-panel-tabs">
                {['Thư viện tư liệu', 'Tư liệu đã lưu', 'Tư liệu AI tạo', 'Tư liệu tôi tải lên'].map(
                  (t) => (
                    <button key={t} type="button" disabled>
                      {t}
                    </button>
                  ),
                )}
              </div>
              <div className="studio-library-teaser">
                <span className="studio-library-art" aria-hidden>
                  <img
                    src={getDramaImageStylePreviewUrl(EMPTY_ART.library)}
                    alt=""
                    loading="lazy"
                  />
                </span>
                <p className="pf-muted">
                  Thư viện tư liệu sắp có. Hiện tại bạn dùng “Tải ảnh lên” hoặc “AI vẽ lại” ở phía
                  trên để thay ảnh cho cảnh này.
                </p>
              </div>
            </div>
          </section>

          <aside>
            <div className="pf-panel-tabs">
              {PANEL_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tab === t ? 'active' : ''}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === SCRIPT_TAB ? (
              <>
                <label className="pf-muted studio-panel-label">
                  Nội dung lời dẫn
                  <textarea
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    rows={5}
                    className="studio-narration-input"
                  />
                </label>
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-block"
                  style={{ marginTop: 8 }}
                  disabled
                >
                  AI tối ưu cảnh này <ComingSoon />
                </button>
                <div style={{ marginTop: '0.85rem' }}>
                  <strong style={{ fontSize: '0.88rem' }}>
                    Trang trí chữ <ComingSoon />
                  </strong>
                  <p className="pf-muted" style={{ fontSize: '0.8rem' }}>
                    Font chữ / cỡ chữ / màu / căn lề — đang phát triển
                  </p>
                </div>
                <button
                  type="button"
                  className="pf-btn pf-btn-lime pf-btn-block"
                  style={{ marginTop: '1rem' }}
                  disabled={busy}
                  onClick={saveNarration}
                >
                  Lưu lời dẫn
                </button>
              </>
            ) : null}

            {tab === VISUAL_TAB ? (
              <>
                <p className="pf-muted" style={{ fontSize: '0.88rem' }}>
                  Dùng “Tải ảnh lên” ở vùng xem trước để thay ảnh cho cảnh này, hoặc “AI vẽ lại” để
                  tạo lại từ prompt.
                </p>
                <button
                  type="button"
                  className="pf-btn pf-btn-lime pf-btn-block"
                  disabled={busy}
                  onClick={regenImage}
                >
                  Tạo lại cảnh quay này
                </button>
              </>
            ) : null}

            {tab === VOICE_TAB ? (
              <>
                <p className="pf-muted" style={{ fontSize: '0.88rem' }}>
                  Lồng tiếng lại cho cảnh quay này, vẫn dùng giọng đã chọn cho dự án.
                </p>
                <button
                  type="button"
                  className="pf-btn pf-btn-lime pf-btn-block"
                  disabled={busy}
                  onClick={regenAudio}
                >
                  Lồng tiếng lại
                </button>
              </>
            ) : null}

            {tab === TRANSITION_TAB ? (
              <div className="pf-hint">
                Hiệu ứng chuyển cảnh (mờ dần, chớp sáng, nối bằng cử động máy…) sẽ có ở bản cập nhật
                sau.
              </div>
            ) : null}

            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-block"
              style={{ marginTop: '1rem' }}
              disabled
            >
              Áp dụng cho mọi cảnh cùng loại <ComingSoon />
            </button>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
