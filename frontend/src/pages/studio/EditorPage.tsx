import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Project, Shot } from '../../api'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import AppShell from '../../components/layout/AppShell'
import ComingSoon from '../../components/ui/ComingSoon'
import { useI18n } from '../../i18n'
import { STATUS_CN, shotsByNo } from '../../lib/status'
import { downloadSingleVideo } from '../../lib/clientDownload'
import { getDramaImageStylePreviewUrl } from '../../lib/dramaImageStylePreviews'
import type { ImageStyleId } from '../../lib/dramaImageStyles'
import './studio.css'

/** Tab của bảng điều khiển dùng khoá ổn định, nhãn hiển thị lấy từ gói i18n */
type PanelTab = 'script' | 'visual' | 'voice' | 'transition'
const PANEL_TABS: PanelTab[] = ['script', 'visual', 'voice', 'transition']
const PANEL_TAB_SUFFIX: Record<PanelTab, string> = {
  script: 'Script',
  visual: 'Visual',
  voice: 'Voice',
  transition: 'Transition',
}

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
  const { t, m } = useI18n()
  const [project, setProject] = useState<Project | null>(null)
  const [activeShotId, setActiveShotId] = useState<number | null>(null)
  const [tab, setTab] = useState<PanelTab>('script')
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
      .catch((err) => setError(err instanceof Error ? err.message : t('studio.shared.loadProjectFailed')))
  }, [nav, projectId, t])

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
      setError(err instanceof Error ? err.message : t('studio.editor.saveNarrationFailed'))
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
      setError(err instanceof Error ? err.message : t('studio.editor.regenImageFailed'))
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
      setError(err instanceof Error ? err.message : t('studio.editor.addShotFailed'))
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
      setError(err instanceof Error ? err.message : t('studio.editor.reorderFailed'))
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
      setError(err instanceof Error ? err.message : t('studio.editor.uploadImageFailed'))
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
      setError(err instanceof Error ? err.message : t('studio.editor.exportFailed'))
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
      setError(err instanceof Error ? err.message : t('studio.editor.regenAudioFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (!project && !error) {
    return (
      <AppShell active="studio" flush>
        <p className="pf-muted" style={{ padding: '2rem' }}>
          {t('studio.shared.loading')}
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
              {t('studio.editor.back')}
            </button>
            <strong>{project.title}</strong>
            <span className="studio-status-chip">{STATUS_CN[project.status] || project.status}</span>
          </div>
          <div className="studio-editor-bar-ops">
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
              {t('studio.editor.undo')} <ComingSoon />
            </button>
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
              {t('studio.editor.redo')} <ComingSoon />
            </button>
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
              {t('studio.editor.saveDraft')} <ComingSoon />
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
              {t('studio.editor.preview')}
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-lime pf-btn-sm"
              disabled={busy || !project.final_video_url}
              onClick={() => void exportFilm()}
            >
              {t('studio.editor.exportVideo')}
            </button>
          </div>
        </div>

        {error ? (
          <BillingErrorNotice message={error} style={{ padding: '0.5rem 1.25rem' }} />
        ) : null}

        <div className="pf-editor">
          <aside>
            <div className="studio-panel-head">
              <strong>{t('studio.editor.shotListHeading')}</strong>
              <button
                type="button"
                className="pf-link"
                disabled={busy}
                onClick={() => void addShot()}
              >
                {t('studio.editor.addShot')}
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
                    {String(s.shot_no).padStart(2, '0')}{' '}
                    {s.overlay_title || t('studio.editor.shotFallbackTitle')}
                  </strong>
                  <div className="pf-muted" style={{ fontSize: '0.72rem' }}>
                    {(s.narration || '').slice(0, 28)}
                  </div>
                </div>
              </button>
            ))}
            <p className="pf-muted studio-total-time">
              {t('studio.editor.totalDuration')}{' '}
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
                {t('studio.editor.moveUp')}
              </button>
              <button
                type="button"
                className="pf-btn pf-btn-ghost pf-btn-sm"
                disabled={busy || !shot || shotIndex < 0 || shotIndex >= orderedShots.length - 1}
                onClick={() => void moveShot(1)}
              >
                {t('studio.editor.moveDown')}
              </button>
            </div>
          </aside>

          <section>
            <div className="studio-panel-head">
              <strong>
                {shot
                  ? t('studio.editor.shotHeading', { no: shot.shot_no })
                  : t('studio.editor.previewHeading')}{' '}
                · {isPortrait ? '9:16' : '16:9'}
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
                  {t('studio.editor.uploadImage')}
                </button>
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm"
                  disabled={busy}
                  onClick={regenImage}
                >
                  {t('studio.editor.regenImage')}
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
                      ? t('studio.editor.previewEmptyShot')
                      : t('studio.editor.previewEmptyPick')}
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
                  aria-label={t('studio.editor.stripAria', { no: s.shot_no })}
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
                {t('studio.editor.dropzone', {
                  upload: t('studio.editor.uploadImage'),
                  regen: t('studio.editor.regenImage'),
                })}
              </p>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div className="pf-panel-tabs">
                {m.studio.editor.libraryTabs.map((label) => (
                  <button key={label} type="button" disabled>
                    {label}
                  </button>
                ))}
              </div>
              <div className="studio-library-teaser">
                <span className="studio-library-art" aria-hidden>
                  <img
                    src={getDramaImageStylePreviewUrl(EMPTY_ART.library)}
                    alt=""
                    loading="lazy"
                  />
                </span>
                <p className="pf-muted">{t('studio.editor.libraryTeaser')}</p>
              </div>
            </div>
          </section>

          <aside>
            <div className="pf-panel-tabs">
              {PANEL_TABS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={tab === key ? 'active' : ''}
                  onClick={() => setTab(key)}
                >
                  {t(`studio.editor.tab${PANEL_TAB_SUFFIX[key]}`)}
                </button>
              ))}
            </div>

            {tab === 'script' ? (
              <>
                <label className="pf-muted studio-panel-label">
                  {t('studio.editor.narrationLabel')}
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
                  {t('studio.editor.aiOptimizeSoon')} <ComingSoon />
                </button>
                <div style={{ marginTop: '0.85rem' }}>
                  <strong style={{ fontSize: '0.88rem' }}>
                    {t('studio.editor.textOverlay')} <ComingSoon />
                  </strong>
                  <p className="pf-muted" style={{ fontSize: '0.8rem' }}>
                    {t('studio.editor.textOverlayHint')}
                  </p>
                </div>
                <button
                  type="button"
                  className="pf-btn pf-btn-lime pf-btn-block"
                  style={{ marginTop: '1rem' }}
                  disabled={busy}
                  onClick={saveNarration}
                >
                  {t('studio.editor.saveNarration')}
                </button>
              </>
            ) : null}

            {tab === 'visual' ? (
              <>
                <p className="pf-muted" style={{ fontSize: '0.88rem' }}>
                  {t('studio.editor.visualHint')}
                </p>
                <button
                  type="button"
                  className="pf-btn pf-btn-lime pf-btn-block"
                  disabled={busy}
                  onClick={regenImage}
                >
                  {t('studio.editor.regenThisShot')}
                </button>
              </>
            ) : null}

            {tab === 'voice' ? (
              <>
                <p className="pf-muted" style={{ fontSize: '0.88rem' }}>
                  {t('studio.editor.voiceHint')}
                </p>
                <button
                  type="button"
                  className="pf-btn pf-btn-lime pf-btn-block"
                  disabled={busy}
                  onClick={regenAudio}
                >
                  {t('studio.editor.regenVoice')}
                </button>
              </>
            ) : null}

            {tab === 'transition' ? (
              <div className="pf-hint">{t('studio.editor.transitionHint')}</div>
            ) : null}

            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-block"
              style={{ marginTop: '1rem' }}
              disabled
            >
              {t('studio.editor.applyToAllSoon')} <ComingSoon />
            </button>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
