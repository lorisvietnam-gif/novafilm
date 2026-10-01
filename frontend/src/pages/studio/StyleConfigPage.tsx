import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, defaultsFromTemplate, resolveVoiceId } from '../../api'
import type { MediaModelOption, MediaModelsCatalog, PipelineMode, Project, Template, VoicePreset } from '../../api'
import AppShell from '../../components/layout/AppShell'
import Stepper from '../../components/ui/Stepper'
import ComingSoon from '../../components/ui/ComingSoon'
import { IconChevronLeft, IconPlay } from '../../components/ui/Icons'
import ErrorNotice from '../../components/errors/ErrorNotice'
import { useI18n } from '../../i18n'
import { handleBillingError } from '../../lib/billingError'
import { homeCategoryLabel } from '../../lib/categories'
import { mediaModelDescription } from '../../lib/mediaModelLabels'
import { studioProjectTitle } from '../../lib/projectTitleLabels'
import { kepuStepIndex, kepuSteps } from '../../lib/status'
import { getDramaImageStylePreviewUrl } from '../../lib/dramaImageStylePreviews'
import { templateName } from '../../lib/templateLabels'
import { voiceLabel } from '../../lib/voiceLabels'
import './studio.css'

/** Chỉ giữ giá trị API của chế độ dựng; nhãn và mô tả lấy từ gói i18n */
const OUTPUT_MODES: { id: PipelineMode; image: string }[] = [
  { id: 'full', image: '/mode-presets/full.jpg' },
  { id: 'image_text', image: '/mode-presets/image_text.jpg' },
]

const RATIOS: { id: string; label: string; w: number; h: number }[] = [
  { id: '16:9', label: '16:9', w: 36, h: 20 },
  { id: '9:16', label: '9:16', w: 18, h: 32 },
  { id: '1:1', label: '1:1', w: 24, h: 24 },
  { id: '4:3', label: '4:3', w: 28, h: 21 },
  { id: '21:9', label: '21:9', w: 40, h: 17 },
]

/** Khung hình có dọc không (cao > rộng), dùng cho thẻ xem trước và tỉ lệ xem trước trực tiếp */
/** Khó speaker dùng chung cho thẻ giọng và API nghe thử */
function voiceKey(v: VoicePreset): string {
  return v.speaker || v.id
}

function isPortraitRatio(ratio: string | undefined | null): boolean {
  const raw = String(ratio || '').trim()
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/i)
  if (!m) return false
  return Number(m[2]) > Number(m[1])
}

export default function StyleConfigPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const nav = useNavigate()
  const { t } = useI18n()
  const [project, setProject] = useState<Project | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [voices, setVoices] = useState<VoicePreset[]>([])
  const [stylePrompt, setStylePrompt] = useState('')
  const [extraPrompt, setExtraPrompt] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('full')
  const [ratio, setRatio] = useState('16:9')
  const [imageModel, setImageModel] = useState('')
  const [videoModel, setVideoModel] = useState('')
  const [mediaCatalog, setMediaCatalog] = useState<MediaModelsCatalog | null>(null)
  const [busy, setBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    if (!projectId) {
      nav('/studio/new')
    }
    api.templates().then(setTemplates)
    api.voices().then(setVoices)
    api
      .mediaModels()
      .then((cat) => {
        setMediaCatalog(cat)
        setImageModel((prev) => prev || cat.defaults.image_model)
        setVideoModel((prev) => prev || cat.defaults.video_model)
      })
      .catch(() => setMediaCatalog(null))
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p)
        setStylePrompt(p.style_prompt || '')
        setExtraPrompt(p.extra_prompt || '')
        setVoiceId(p.voice_id || '')
        setPipelineMode(p.pipeline_mode || 'full')
        setRatio(p.output_ratio || (p.pipeline_mode === 'image_text' ? '9:16' : '16:9'))
        if (p.image_model) setImageModel(p.image_model)
        if (p.video_model) setVideoModel(p.video_model)
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('studio.shared.loadProjectFailed')))
  }, [nav, projectId, t])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!voices.length) return
    setVoiceId((prev) => {
      const next = resolveVoiceId(prev, voices)
      return next === prev ? prev : next
    })
  }, [voices])

  const currentTpl = useMemo(
    () => templates.find((t) => t.id === project?.template_id),
    [templates, project?.template_id],
  )

  const selectedVoice = voices.find((v) => voiceKey(v) === voiceId || v.id === voiceId)

  useEffect(() => {
    if (!project || !currentTpl) return
    if (!stylePrompt) {
      const d = defaultsFromTemplate(currentTpl)
      setStylePrompt((v) => v || d.style_prompt)
      setExtraPrompt((v) => v || d.extra_prompt)
      setVoiceId((v) => v || d.voice_id)
    }
  }, [project, currentTpl])

  useEffect(() => {
    if (!project || project.output_ratio || !currentTpl?.default_ratio) return
    setRatio(currentTpl.default_ratio)
  }, [project?.id, project?.output_ratio, currentTpl?.default_ratio])

  function pickRatio(r: (typeof RATIOS)[0]) {
    setRatio(r.id)
  }

  function stopPreview() {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
  }

  function selectVoice(v: VoicePreset) {
    const vid = voiceKey(v)
    if (vid !== voiceId) stopPreview()
    setVoiceId(vid)
  }

  async function previewVoice(v: VoicePreset, e: MouseEvent) {
    e.stopPropagation()
    const vid = voiceKey(v)
    selectVoice(v)
    setError('')

    if (playingId === vid && audioRef.current && !audioRef.current.paused) {
      stopPreview()
      return
    }

    stopPreview()
    setPreviewBusy(vid)
    try {
      const res = await api.previewVoice(vid)
      const url = api.assetUrl(res.url)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setPlayingId(null)
      audio.onerror = () => {
        setPlayingId(null)
        setError(t('studio.style.voicePlaybackFailed'))
      }
      setPlayingId(vid)
      await audio.play()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('studio.style.voicePreviewFailed'))
      setPlayingId(null)
    } finally {
      setPreviewBusy(null)
    }
  }

  async function generate() {
    if (!project) return
    stopPreview()
    setBusy(true)
    setError('')
    try {
      const d = currentTpl ? defaultsFromTemplate(currentTpl) : null
      /*
       * styleOut prompt phong cách; giống mẫu thì để trống, lúc tạo sẽ đọc ở trang quản trị
       * extraOut yêu cầu bổ sung
       */
      const styleOut = stylePrompt.trim()
      const extraOut = extraPrompt.trim()
      const sameStyle = Boolean(d) && styleOut === d!.style_prompt
      const sameExtra = Boolean(d) && extraOut === d!.extra_prompt
      await api.updateProject(project.id, {
        style_prompt: sameStyle ? '' : styleOut,
        character_prompt: '',
        extra_prompt: sameExtra ? '' : extraOut,
        voice_id: voiceId,
        pipeline_mode: pipelineMode,
        output_ratio: ratio,
        image_model: imageModel,
        video_model: videoModel,
      })
      const started = await api.generate(project.id)
      nav(`/studio/${started.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('studio.style.startFailed')
      if (msg.includes('合成成片')) {
        try {
          const composed = await api.compose(project.id)
          nav(`/studio/${composed.id}`)
          return
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : t('studio.shared.composeFailed'))
          return
        }
      }
      setError(msg)
      await handleBillingError(err, nav)
    } finally {
      setBusy(false)
    }
  }

  // project chưa tải được thì không được lọt xuống phần chính (bên dưới có project.xxx không null-check, sẽ trắng màn hình)
  if (!project) {
    return (
      <AppShell active="studio">
        <div className="studio-scoped">
          {error ? (
            <ErrorNotice error={error} onDismiss={() => setError('')} />
          ) : (
            <p className="pf-muted">{t('studio.shared.loading')}</p>
          )}
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell active="studio" wide>
      <header className="pf-page-head studio-scoped">
        <div className="pf-page-head-row">
          <div>
            <button type="button" className="pf-back" onClick={() => nav('/studio/new')}>
              <IconChevronLeft size={18} />
              {t('studio.style.back')}
            </button>
            <h1 className="pf-page-title">{studioProjectTitle(project?.title) || t('studio.style.titleFallback')}</h1>
          </div>
          <Stepper
            steps={kepuSteps(pipelineMode)}
            current={kepuStepIndex('style', { status: 'DRAFT', pipeline_mode: pipelineMode })}
            doneThrough={0}
          />
        </div>
      </header>

      <div className="pf-style-layout studio-scoped">
        <aside className="pf-create-col">
          <h3>{t('studio.style.projectInfo')}</h3>
          {currentTpl ? (
            <div>
              <div
                className={[
                  'pf-style-side-thumb',
                  isPortraitRatio(currentTpl.default_ratio) ? 'portrait' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <img src={api.assetUrl(currentTpl.preview_cover)} alt="" />
              </div>
              <p style={{ margin: '0.5rem 0 0', fontWeight: 600 }}>
                {templateName(currentTpl.id, currentTpl.name)}
              </p>
              <div className="pf-tags">
                {currentTpl.category.map((c) => (
                  <span key={c}>{homeCategoryLabel(c)}</span>
                ))}
              </div>
            </div>
          ) : null}
          <ul className="pf-meta-list" style={{ marginTop: '0.85rem' }}>
            <li>
              <span>{t('studio.style.topicLabel')}</span>
              <span style={{ maxWidth: '55%', textAlign: 'right' }}>
                {(project?.source_text || '').slice(0, 40)}
              </span>
            </li>
            <li>
              <span>{t('studio.style.durationLabel')}</span>
              <span>{t('studio.shared.durationShort')}</span>
            </li>
            <li>
              <span>{t('studio.style.shotCountLabel')}</span>
              <span>{t('studio.style.shotCountValue')}</span>
            </li>
          </ul>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm" disabled>
            {t('studio.style.previewTemplateSoon')} <ComingSoon />
          </button>
        </aside>

        <section className="pf-create-col">
          <div className="pf-style-block">
            <h3>{t('studio.style.imageStyleHeading')}</h3>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
              {t('studio.style.imageStyleLocked')}
            </p>
            {currentTpl ? (
              <div
                className={[
                  'pf-style-opt',
                  'selected',
                  isPortraitRatio(currentTpl.default_ratio) ? 'portrait' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ maxWidth: 280, textAlign: 'left' }}
              >
                <span className="pf-style-opt-media">
                  <img src={api.assetUrl(currentTpl.preview_cover)} alt="" />
                  {currentTpl.default_ratio ? (
                    <span className="pf-style-opt-ratio">{currentTpl.default_ratio}</span>
                  ) : null}
                </span>
                <div className="cap">{templateName(currentTpl.id, currentTpl.name)}</div>
                <div className="cap-sub">{t('studio.style.templateStyleCaption')}</div>
              </div>
            ) : null}
            <label className="pf-field" style={{ marginTop: '0.75rem' }}>
              <span className="pf-field-label">{t('studio.style.stylePromptLabel')}</span>
              <textarea
                className="pf-field-input"
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                rows={2}
                style={{ resize: 'vertical', minHeight: 64 }}
              />
            </label>
          </div>

          <div className="pf-style-block">
            <h3>
              {t('studio.style.voiceHeading')}
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
                {t('studio.style.addVoiceSoon')} <ComingSoon />
              </button>
            </h3>
            <div className="pf-voice-row">
              {voices.map((v) => {
                const vid = voiceKey(v)
                const selected = voiceId === vid
                const loading = previewBusy === vid
                const playing = playingId === vid
                return (
                  <div
                    key={v.id}
                    className={selected ? 'pf-voice-card selected' : 'pf-voice-card'}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectVoice(v)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectVoice(v)
                      }
                    }}
                  >
                    <strong className="pf-voice-name">{voiceLabel(v)}</strong>
                    <span className="pf-voice-meta">
                      {v.gender === 'female'
                        ? t('studio.style.voiceFemale')
                        : v.gender === 'male'
                          ? t('studio.style.voiceMale')
                          : v.gender}
                    </span>
                    <button
                      type="button"
                      className={[
                        'pf-btn',
                        'pf-btn-sm',
                        'pf-btn-icon',
                        playing ? 'pf-btn-lime' : 'pf-btn-ghost',
                        'pf-voice-preview',
                      ].join(' ')}
                      disabled={loading || busy}
                      onClick={(e) => previewVoice(v, e)}
                    >
                      {loading ? (
                        t('studio.style.voiceLoading')
                      ) : playing ? (
                        t('studio.style.voicePlaying')
                      ) : (
                        <>
                          <IconPlay size={12} />
                          {t('studio.style.voicePreview')}
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            {selectedVoice ? (
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0.55rem 0 0' }}>
                {t('studio.style.voiceSelected', { name: voiceLabel(selectedVoice) })}
              </p>
            ) : null}
          </div>

          <div className="pf-style-block">
            <h3>{t('studio.style.modeHeading')}</h3>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
              {t('studio.style.modeHint')}
            </p>
            <div className="pf-style-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {OUTPUT_MODES.map((mode) => {
                const isImage = mode.id === 'image_text'
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={
                      pipelineMode === mode.id ? 'pf-style-opt selected' : 'pf-style-opt'
                    }
                    onClick={() => setPipelineMode(mode.id)}
                  >
                    <img src={mode.image} alt="" loading="lazy" />
                    <div className="cap">
                      {isImage ? t('studio.shared.modeImageLabel') : t('studio.shared.modeFullLabel')}
                    </div>
                    <div className="cap-sub">
                      {isImage ? t('studio.shared.modeImageDesc') : t('studio.shared.modeFullDesc')}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {mediaCatalog ? (
            <div className="pf-style-block">
              <h3>{t('studio.style.imageModelHeading')}</h3>
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
                {t('studio.style.imageModelHint')}
              </p>
              <div className="pf-model-grid">
                {mediaCatalog.image_models.map((opt: MediaModelOption) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={imageModel === opt.id ? 'pf-model-opt selected' : 'pf-model-opt'}
                    onClick={() => setImageModel(opt.id)}
                  >
                    <div className="pf-model-opt-title">
                      <span>{opt.label}</span>
                      {opt.recommended ? (
                        <span className="pf-model-badge">{t('studio.style.recommended')}</span>
                      ) : null}
                    </div>
                    <div className="pf-model-opt-desc">
                      {mediaModelDescription(opt.id, opt.description)}
                    </div>
                    <div className="pf-model-opt-provider">TokenFree</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mediaCatalog && pipelineMode === 'full' ? (
            <div className="pf-style-block">
              <h3>{t('studio.style.videoModelHeading')}</h3>
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
                {t('studio.style.videoModelHint')}
              </p>
              <div className="pf-model-grid">
                {mediaCatalog.video_models.map((opt: MediaModelOption) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={videoModel === opt.id ? 'pf-model-opt selected' : 'pf-model-opt'}
                    onClick={() => setVideoModel(opt.id)}
                  >
                    <div className="pf-model-opt-title">
                      <span>{opt.label}</span>
                      {opt.recommended ? (
                        <span className="pf-model-badge">{t('studio.style.recommended')}</span>
                      ) : null}
                    </div>
                    <div className="pf-model-opt-desc">
                      {mediaModelDescription(opt.id, opt.description)}
                    </div>
                    <div className="pf-model-opt-provider">TokenFree</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pf-style-block">
            <h3>{t('studio.style.ratioHeading')}</h3>
            <div className="pf-ratio-row">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={ratio === r.id ? 'pf-ratio selected' : 'pf-ratio'}
                  onClick={() => pickRatio(r)}
                >
                  <div className="box" style={{ width: r.w, height: r.h }} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="pf-create-col">
          <h3>{t('studio.style.livePreviewHeading')}</h3>
          <div
            className={[
              'pf-editor-preview',
              isPortraitRatio(ratio) ? 'portrait' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ marginBottom: '0.85rem' }}
          >
            {currentTpl ? (
              <img src={api.assetUrl(currentTpl.preview_cover)} alt="" />
            ) : (
              <div className="studio-still studio-still--placeholder">
                <img src={getDramaImageStylePreviewUrl('neon-cyberpunk-film')} alt="" />
                <span className="studio-still-note">{t('studio.style.livePreviewEmpty')}</span>
              </div>
            )}
          </div>
          <p className="pf-muted" style={{ fontSize: '0.8rem' }}>
            {t('studio.style.livePreviewNote')}
          </p>
          <h3 style={{ marginTop: '1rem' }}>{t('studio.style.summaryHeading')}</h3>
          <ul className="pf-meta-list">
            <li>
              <span>{t('studio.style.summaryStyle')}</span>
              <span>
                {currentTpl
                  ? templateName(currentTpl.id, currentTpl.name)
                  : t('studio.shared.dash')}
              </span>
            </li>
            <li>
              <span>{t('studio.style.summaryCharacter')}</span>
              <span>{t('studio.style.summaryCharacterValue')}</span>
            </li>
            <li>
              <span>{t('studio.style.summaryVoice')}</span>
              <span>
                {selectedVoice ? voiceLabel(selectedVoice) : t('studio.style.summaryVoiceDefault')}
              </span>
            </li>
            <li>
              <span>{t('studio.style.summaryRatio')}</span>
              <span>{ratio}</span>
            </li>
            <li>
              <span>{t('studio.style.summaryMode')}</span>
              <span>
                {pipelineMode === 'image_text'
                  ? t('studio.shared.modeImageLabel')
                  : t('studio.shared.modeFullLabel')}
              </span>
            </li>
          </ul>
          {selectedVoice ? (
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm pf-btn-icon"
              style={{ marginTop: '0.75rem' }}
              disabled={busy || previewBusy === voiceKey(selectedVoice)}
              onClick={(e) => previewVoice(selectedVoice, e)}
            >
              <IconPlay size={14} />
              {playingId === voiceKey(selectedVoice)
                ? t('studio.style.stopPreview')
                : t('studio.style.previewNamed', { name: voiceLabel(selectedVoice) })}
            </button>
          ) : null}
          {error ? <ErrorNotice error={error} onDismiss={() => setError('')} style={{ marginTop: '0.75rem' }} /> : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime pf-btn-block pf-btn-lg pf-btn-icon"
            style={{ marginTop: '0.75rem' }}
            disabled={busy || Boolean(previewBusy)}
            onClick={generate}
          >
            {busy
              ? t('studio.style.starting')
              : project.shots?.length
                ? t('studio.style.saveContinue')
                : t('studio.style.createStoryboard')}
            {!busy ? <span aria-hidden>→</span> : null}
          </button>
          <p className="pf-muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
            {t('studio.style.footNote')}
          </p>
        </aside>
      </div>
    </AppShell>
  )
}
