import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, defaultsFromTemplate, resolveVoiceId } from '../../api'
import type { MediaModelOption, MediaModelsCatalog, PipelineMode, Project, Template, VoicePreset } from '../../api'
import AppShell from '../../components/layout/AppShell'
import Stepper from '../../components/ui/Stepper'
import ComingSoon from '../../components/ui/ComingSoon'
import { IconChevronLeft, IconPlay } from '../../components/ui/Icons'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import { handleBillingError } from '../../lib/billingError'
import { kepuStepIndex, kepuSteps } from '../../lib/status'
import { getDramaImageStylePreviewUrl } from '../../lib/dramaImageStylePreviews'
import './studio.css'

const IMAGE_TEXT_LABEL = 'Ảnh tĩnh'
const FULL_LABEL = 'AI video'

const OUTPUT_MODES: { id: PipelineMode; label: string; desc: string; image: string }[] = [
  { id: 'full', label: FULL_LABEL, desc: 'Ảnh → video → lồng tiếng → ghép phim', image: '/mode-presets/full.jpg' },
  {
    id: 'image_text',
    label: IMAGE_TEXT_LABEL,
    desc: 'Ảnh tĩnh + chữ đè + lồng tiếng, không tạo AI video',
    image: '/mode-presets/image_text.jpg',
  },
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
      .catch((err) => setError(err instanceof Error ? err.message : 'Không tải được dự án.'))
  }, [nav, projectId])

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
        setError('Không phát được mẫu âm thanh.')
      }
      setPlayingId(vid)
      await audio.play()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không nghe thử được giọng này.')
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
      const msg = err instanceof Error ? err.message : 'Không khởi động được quy trình tạo.'
      if (msg.includes('合成成片')) {
        try {
          const composed = await api.compose(project.id)
          nav(`/studio/${composed.id}`)
          return
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : 'Không ghép được phim.')
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
          {error ? <BillingErrorNotice message={error} /> : <p className="pf-muted">Đang tải…</p>}
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
              Quay lại bàn tạo dự án
            </button>
            <h1 className="pf-page-title">{project?.title || 'Cấu hình phong cách'}</h1>
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
          <h3>Thông tin dự án</h3>
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
              <p style={{ margin: '0.5rem 0 0', fontWeight: 600 }}>{currentTpl.name}</p>
              <div className="pf-tags">
                {currentTpl.category.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          ) : null}
          <ul className="pf-meta-list" style={{ marginTop: '0.85rem' }}>
            <li>
              <span>Chủ đề</span>
              <span style={{ maxWidth: '55%', textAlign: 'right' }}>
                {(project?.source_text || '').slice(0, 40)}
              </span>
            </li>
            <li>
              <span>Thời lượng</span>
              <span>~1–3 phút</span>
            </li>
            <li>
              <span>Số storyboard</span>
              <span>AI tự tính</span>
            </li>
          </ul>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm" disabled>
            Xem trước mẫu <ComingSoon />
          </button>
        </aside>

        <section className="pf-create-col">
          <div className="pf-style-block">
            <h3>Phong cách hình ảnh</h3>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
              Đã bị khoá bởi mẫu bạn chọn ở bước trước, nên ảnh và video tạo ra đều mang đúng phong cách
              đó. Có nhân vật xuất hiện hay không do AI quyết dựa trên quy tắc của mẫu và chủ đề, bạn
              không cần chọn thêm bộ nhân vật.
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
                <div className="cap">{currentTpl.name}</div>
                <div className="cap-sub">Phong cách của mẫu</div>
              </div>
            ) : null}
            <label className="pf-field" style={{ marginTop: '0.75rem' }}>
              <span className="pf-field-label">Prompt phong cách (ghi đè nếu cần)</span>
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
              Giọng lồng tiếng
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
                Thêm giọng <ComingSoon />
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
                    <strong className="pf-voice-name">{v.label}</strong>
                    <span className="pf-voice-meta">
                      {v.gender === 'female' ? 'Giọng nữ' : v.gender === 'male' ? 'Giọng nam' : v.gender}
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
                        'Đang tải…'
                      ) : playing ? (
                        'Đang phát'
                      ) : (
                        <>
                          <IconPlay size={12} />
                          Nghe thử
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            {selectedVoice ? (
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0.55rem 0 0' }}>
                Đang chọn: {selectedVoice.label} · Cả phim sẽ lồng tiếng bằng giọng này. Bấm “Nghe
                thử” để nghe đoạn mẫu khoảng 5 giây.
              </p>
            ) : null}
          </div>

          <div className="pf-style-block">
            <h3>Cách dựng phim</h3>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
              Mọi mẫu đều có thể chọn có tạo AI video hay không, không phụ thuộc khung hình.
            </p>
            <div className="pf-style-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {OUTPUT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={pipelineMode === m.id ? 'pf-style-opt selected' : 'pf-style-opt'}
                  onClick={() => setPipelineMode(m.id)}
                >
                  <img src={m.image} alt="" loading="lazy" />
                  <div className="cap">{m.label}</div>
                  <div className="cap-sub">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {mediaCatalog ? (
            <div className="pf-style-block">
              <h3>Mô hình ảnh</h3>
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
                Dùng các mô hình TokenFree đã bật trong mục “Mô hình” của trang quản trị.
              </p>
              <div className="pf-model-grid">
                {mediaCatalog.image_models.map((m: MediaModelOption) => (
                  <button
                    key={m.id}
                    type="button"
                    className={imageModel === m.id ? 'pf-model-opt selected' : 'pf-model-opt'}
                    onClick={() => setImageModel(m.id)}
                  >
                    <div className="pf-model-opt-title">
                      <span>{m.label}</span>
                      {m.recommended ? <span className="pf-model-badge">Khuyên dùng</span> : null}
                    </div>
                    <div className="pf-model-opt-desc">{m.description}</div>
                    <div className="pf-model-opt-provider">TokenFree</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mediaCatalog && pipelineMode === 'full' ? (
            <div className="pf-style-block">
              <h3>Mô hình video</h3>
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
                Mô hình dùng cho bước tạo video từ ảnh; chế độ ảnh tĩnh sẽ không gọi tới.
              </p>
              <div className="pf-model-grid">
                {mediaCatalog.video_models.map((m: MediaModelOption) => (
                  <button
                    key={m.id}
                    type="button"
                    className={videoModel === m.id ? 'pf-model-opt selected' : 'pf-model-opt'}
                    onClick={() => setVideoModel(m.id)}
                  >
                    <div className="pf-model-opt-title">
                      <span>{m.label}</span>
                      {m.recommended ? <span className="pf-model-badge">Khuyên dùng</span> : null}
                    </div>
                    <div className="pf-model-opt-desc">{m.description}</div>
                    <div className="pf-model-opt-provider">TokenFree</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pf-style-block">
            <h3>Tỉ lệ khung hình</h3>
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
          <h3>Xem trước trực tiếp</h3>
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
                <span className="studio-still-note">Chưa có mẫu để xem trước</span>
              </div>
            )}
          </div>
          <p className="pf-muted" style={{ fontSize: '0.8rem' }}>
            Sau khi tạo, bạn xem được khung hình thật ở bàn storyboard. Hiện tại đang là ảnh xem
            trước của mẫu.
          </p>
          <h3 style={{ marginTop: '1rem' }}>Tóm tắt cấu hình</h3>
          <ul className="pf-meta-list">
            <li>
              <span>Phong cách</span>
              <span>{currentTpl?.name || '—'}</span>
            </li>
            <li>
              <span>Nhân vật</span>
              <span>AI tự quyết theo mẫu và chủ đề</span>
            </li>
            <li>
              <span>Lồng tiếng</span>
              <span>{selectedVoice?.label || 'Mặc định'}</span>
            </li>
            <li>
              <span>Tỉ lệ</span>
              <span>{ratio}</span>
            </li>
            <li>
              <span>Cách dựng</span>
              <span>{pipelineMode === 'image_text' ? IMAGE_TEXT_LABEL : FULL_LABEL}</span>
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
                ? 'Dừng nghe thử'
                : `Nghe thử “${selectedVoice.label}”`}
            </button>
          ) : null}
          {error ? <BillingErrorNotice message={error} style={{ marginTop: '0.75rem' }} /> : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime pf-btn-block pf-btn-lg pf-btn-icon"
            style={{ marginTop: '0.75rem' }}
            disabled={busy || Boolean(previewBusy)}
            onClick={generate}
          >
            {busy ? 'Đang khởi động…' : project.shots?.length ? 'Lưu và tiếp tục' : 'Tạo storyboard'}
            {!busy ? <span aria-hidden>→</span> : null}
          </button>
          <p className="pf-muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
            Bước này tạo kịch bản storyboard. Xem và sửa xong bạn mới bắt đầu tạo ảnh và lồng tiếng.
          </p>
        </aside>
      </div>
    </AppShell>
  )
}
