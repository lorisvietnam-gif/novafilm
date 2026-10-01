/**
 * Bộ biên dịch prompt theo model — hộp thoại dàn cảnh rồi phát prompt cuối.
 *
 * Ba nguyên tắc dẫn giao diện này:
 *
 * 1. **Nói rõ prompt viết cho model nào.** Dòng nhắc ngay trên đầu khối prompt, và
 *    tên model cũng nằm trong nhãn của tab hồ sơ. Người dùng phải biết mình đang
 *    dán vào đâu trước khi bấm sao chép.
 * 2. **Không giấu mức bằng chứng.** Mỗi mục hồ sơ mang badge verified / assumed /
 *    unknown kèm nguồn. Mục unknown để trống chứ không điền bừa.
 * 3. **Nút sao chép không được im lặng.** `navigator.clipboard` hỏng trong HTTP không
 *    mã hoá; nếu hỏng thì lùi về `<textarea>` ẩn + `execCommand('copy')`; nếu cả hai
 *    hỏng thì báo rõ và chỉ ra cách tự bấm Ctrl+C.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../../components/ui/Modal'
import { dramaApi } from '../../api/drama'
import type {
  PromptCompileResult,
  PromptEvidenceLevel,
  PromptModelProfile,
  PromptProfileFact,
} from '../../api/drama'
import { useI18n } from '../../i18n'

type Props = {
  open: boolean
  onClose: () => void
}

type RefDraft = { id: number; label: string; url: string; kind: string }

type CopyState = 'idle' | 'copied' | 'manual'

const REFERENCE_KINDS = ['character', 'scene', 'prop'] as const

const LEVEL_TONE: Record<PromptEvidenceLevel, string> = {
  verified: 'is-verified',
  assumed: 'is-assumed',
  unknown: 'is-unknown',
}

/** Badge của hồ sơ dùng chung tone với badge của mục bằng chứng. */
function readinessTone(readiness: PromptModelProfile['readiness']): string {
  if (readiness === 'evidence-based') return LEVEL_TONE.verified
  if (readiness === 'docs-based') return LEVEL_TONE.assumed
  return LEVEL_TONE.unknown
}

let refSeq = 0
function nextRefId(): number {
  refSeq += 1
  return refSeq
}

/**
 * Sao chép có đường lùi.
 *
 * `navigator.clipboard` chỉ chạy trong ngữ cảnh bảo mật, nên trên http:// LAN nó
 * hoặc vắng mặt hoặc ném lỗi. `execCommand('copy')` là đường cũ nhưng vẫn chạy, và
 * đường lùi cuối cùng phải nói ra chứ không được nuốt lỗi.
 */
async function copyWithFallback(text: string): Promise<'api' | 'exec' | 'both'> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'api'
    }
  } catch {
    // Rơi xuống đường lùi bên dưới.
  }

  let area: HTMLTextAreaElement | null = null
  try {
    area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.setAttribute('aria-hidden', 'true')
    area.style.position = 'fixed'
    area.style.top = '0'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    return ok ? 'exec' : 'both'
  } catch {
    return 'both'
  } finally {
    if (area) {
      area.remove()
      window.getSelection()?.removeAllRanges()
    }
  }
}

function factLabelKey(fact: Pick<PromptProfileFact, 'key'>): string {
  return `promptCompiler.facts.${fact.key}`
}

function FactRow({ fact }: { fact: PromptProfileFact }) {
  const { t } = useI18n()
  return (
    <li className="pc-fact">
      <div className="pc-fact-head">
        <span className="pc-fact-name">{t(factLabelKey(fact))}</span>
        <span
          className={`pc-badge ${LEVEL_TONE[fact.level]}`}
          title={t(`promptCompiler.${fact.level}Help`)}
        >
          {t(`promptCompiler.level${fact.level[0].toUpperCase()}${fact.level.slice(1)}`)}
        </span>
      </div>
      {fact.level === 'unknown' ? (
        <p className="pc-fact-unknown">{t('promptCompiler.unknownHelp')}</p>
      ) : (
        <p className="pc-fact-value">{fact.value}</p>
      )}
      {fact.note ? <p className="pc-fact-note">{fact.note}</p> : null}
      {fact.sources.length ? (
        <ul className="pc-fact-sources">
          {fact.sources.map((src) => (
            <li key={src}>
              <code>{src}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function FactGroup({
  title,
  facts,
}: {
  title: string
  facts: PromptProfileFact[]
}) {
  return (
    <section className="pc-profile-group">
      <h4>{title}</h4>
      <ul className="pc-fact-list">
        {facts.map((fact) => (
          <FactRow key={fact.key} fact={fact} />
        ))}
      </ul>
    </section>
  )
}

function ProfileTab({ profile }: { profile: PromptModelProfile | null }) {
  const { t } = useI18n()
  if (!profile) {
    return <p className="pc-empty">{t('promptCompiler.notInProfile')}</p>
  }
  const counts = profile.evidence_counts
  return (
    <div className="pc-profile">
      <header className="pc-profile-head">
        <h4>{t('promptCompiler.profileTitle', { model: profile.label })}</h4>
        <span className={`pc-badge ${readinessTone(profile.readiness)}`}>
          {profile.readiness}
        </span>
      </header>
      <p className="pc-profile-note">{profile.readiness_note}</p>
      <p className="pc-profile-counts">
        {t('promptCompiler.evidenceCounts', {
          verified: counts.verified,
          assumed: counts.assumed,
          unknown: counts.unknown,
        })}
      </p>
      <p className="pc-profile-legend">{t('promptCompiler.evidenceLegend')}</p>

      <FactGroup title={t('promptCompiler.sectionDialect')} facts={profile.dialect} />
      <FactGroup title={t('promptCompiler.sectionParameters')} facts={profile.parameters} />
      <FactGroup title={t('promptCompiler.sectionReferences')} facts={profile.references} />

      <section className="pc-profile-group">
        <h4>{t('promptCompiler.sectionFailures')}</h4>
        {profile.failures.length ? (
          <ul className="pc-fact-list">
            {profile.failures.map((failure) => (
              <li key={failure.key} className="pc-fact pc-fact-failure">
                <div className="pc-fact-head">
                  <span className="pc-fact-name">{t(`promptCompiler.failures.${failure.key}`)}</span>
                  <span className={`pc-badge ${LEVEL_TONE[failure.level]}`}>
                    {t(`promptCompiler.level${failure.level[0].toUpperCase()}${failure.level.slice(1)}`)}
                  </span>
                </div>
                {failure.summary ? <p className="pc-fact-value">{failure.summary}</p> : null}
                {failure.source ? (
                  <ul className="pc-fact-sources">
                    <li>
                      <code>{failure.source}</code>
                    </li>
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pc-empty">{t('promptCompiler.noFailures')}</p>
        )}
      </section>
    </div>
  )
}

export function PromptCompilerDialog({ open, onClose }: Props) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<PromptModelProfile[]>([])
  const [modelId, setModelId] = useState('')
  const [subject, setSubject] = useState('')
  const [action, setAction] = useState('')
  const [setting, setSetting] = useState('')
  const [shotSize, setShotSize] = useState('')
  const [camera, setCamera] = useState('')
  const [light, setLight] = useState('')
  const [style, setStyle] = useState('')
  const [narration, setNarration] = useState('')
  const [dialogue, setDialogue] = useState('')
  const [avoid, setAvoid] = useState('')
  const [refs, setRefs] = useState<RefDraft[]>([])
  const [continuityUrl, setContinuityUrl] = useState('')
  const [aspectRatio, setAspectRatio] = useState('')
  const [durationSec, setDurationSec] = useState(8)
  const [resolution, setResolution] = useState('')
  const [burnSubtitles, setBurnSubtitles] = useState(true)

  const [result, setResult] = useState<PromptCompileResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'prompt' | 'profile'>('prompt')
  const [copy, setCopy] = useState<CopyState>('idle')
  const promptRef = useRef<HTMLPreElement>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void dramaApi
      .listPromptProfiles()
      .then((data) => {
        if (cancelled) return
        setProfiles(data.models)
        setModelId((prev) => prev || data.models[0]?.id || '')
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('promptCompiler.failed'))
      })
    return () => {
      cancelled = true
    }
  }, [open, t])

  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
    },
    [],
  )

  const profile = useMemo(
    () => profiles.find((p) => p.id === modelId) ?? null,
    [profiles, modelId],
  )

  // Chuyển model thì các giá trị đã vượt ngoài danh sách cho phép phải bị bỏ trống,
  // để không mang nhầm giá trị của model trước sang model sau.
  useEffect(() => {
    setAspectRatio('')
    setResolution('')
    setResult(null)
    setCopy('idle')
  }, [modelId])

  const hasScene = Boolean(subject.trim() || action.trim())

  const splitLines = (raw: string) =>
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

  async function handleCompile() {
    if (!modelId || !hasScene) return
    setBusy(true)
    setError('')
    setCopy('idle')
    try {
      const dialogueList = splitLines(dialogue).map((line) => {
        const idx = line.indexOf(':')
        const ascii = line.indexOf('：')
        const cut = idx >= 0 ? idx : ascii
        if (cut < 0) return { speaker: '', text: line }
        return {
          speaker: line.slice(0, cut).trim(),
          text: line.slice(cut + 1).trim(),
        }
      })
      const data = await dramaApi.compilePrompt({
        model: modelId,
        scene: {
          subject: subject.trim(),
          action: action.trim(),
          setting: setting.trim(),
          shot_size: shotSize.trim(),
          camera: camera.trim(),
          light: light.trim(),
          style: style.trim(),
          narration: narration.trim(),
          dialogue: dialogueList,
          references: refs.map((r) => ({ label: r.label, url: r.url.trim(), kind: r.kind })),
          continuity_frame_url: continuityUrl.trim(),
          burn_subtitles: burnSubtitles,
          avoid: splitLines(avoid),
        },
        aspect_ratio: aspectRatio,
        duration_sec: durationSec,
        resolution,
      })
      setResult(data)
      setTab('prompt')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('promptCompiler.failed'))
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = useCallback(async () => {
    if (!result?.prompt) return
    const outcome = await copyWithFallback(result.prompt)
    if (outcome === 'both') {
      setCopy('manual')
      promptRef.current?.focus()
      return
    }
    setCopy('copied')
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopy('idle'), 2200)
  }, [result])

  const field = (label: string, value: string, setValue: (v: string) => void) => (
    <label className="pc-field">
      <span className="pc-field-label">{label}</span>
      <input value={value} onChange={(e) => setValue(e.target.value)} />
    </label>
  )

  const ratios = profile?.hints.aspect_ratios ?? []
  const resolutions = profile?.hints.resolutions ?? []
  const durationValues = profile?.hints.duration_values ?? []
  const canCompile = Boolean(modelId) && hasScene && !busy

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('promptCompiler.title')}
      size="xl"
      className="prompt-compiler-modal"
    >
      <div className="pc-root">
        <aside className="pc-form">
          <label className="pc-field">
            <span className="pc-field-label">{t('promptCompiler.targetModel')}</span>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              aria-label={t('promptCompiler.targetModel')}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {profile ? (
            <p className={`pc-readiness ${readinessTone(profile.readiness)}`}>
              {profile.readiness_note}
            </p>
          ) : null}

          <h4 className="pc-section-title">{t('promptCompiler.scene')}</h4>
          {field(t('promptCompiler.fields.subject'), subject, setSubject)}
          {field(t('promptCompiler.fields.action'), action, setAction)}
          {field(t('promptCompiler.fields.setting'), setting, setSetting)}
          {field(t('promptCompiler.fields.shotSize'), shotSize, setShotSize)}
          {field(t('promptCompiler.fields.camera'), camera, setCamera)}
          {field(t('promptCompiler.fields.light'), light, setLight)}
          {field(t('promptCompiler.fields.style'), style, setStyle)}
          <label className="pc-field">
            <span className="pc-field-label">{t('promptCompiler.fields.narration')}</span>
            <textarea rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} />
          </label>
          <label className="pc-field">
            <span className="pc-field-label">{t('promptCompiler.fields.dialogue')}</span>
            <textarea
              rows={3}
              value={dialogue}
              placeholder={t('promptCompiler.fields.dialogueHint')}
              onChange={(e) => setDialogue(e.target.value)}
            />
          </label>
          <label className="pc-field">
            <span className="pc-field-label">{t('promptCompiler.fields.avoid')}</span>
            <textarea rows={2} value={avoid} onChange={(e) => setAvoid(e.target.value)} />
          </label>

          <h4 className="pc-section-title">{t('promptCompiler.refs')}</h4>
          {refs.map((ref) => (
            <div key={ref.id} className="pc-ref">
              <input
                value={ref.label}
                placeholder={t('promptCompiler.refLabel')}
                onChange={(e) =>
                  setRefs((prev) =>
                    prev.map((r) => (r.id === ref.id ? { ...r, label: e.target.value } : r)),
                  )
                }
              />
              <input
                value={ref.url}
                placeholder={t('promptCompiler.refUrl')}
                onChange={(e) =>
                  setRefs((prev) =>
                    prev.map((r) => (r.id === ref.id ? { ...r, url: e.target.value } : r)),
                  )
                }
              />
              <select
                value={ref.kind}
                aria-label={t('promptCompiler.refKind')}
                onChange={(e) =>
                  setRefs((prev) =>
                    prev.map((r) => (r.id === ref.id ? { ...r, kind: e.target.value } : r)),
                  )
                }
              >
                {REFERENCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`promptCompiler.refKind${kind[0].toUpperCase()}${kind.slice(1)}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="pc-ref-remove"
                onClick={() => setRefs((prev) => prev.filter((r) => r.id !== ref.id))}
              >
                {t('promptCompiler.refRemove')}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="pc-btn-ghost"
            onClick={() =>
              setRefs((prev) => [...prev, { id: nextRefId(), label: '', url: '', kind: 'character' }])
            }
          >
            {t('promptCompiler.refAdd')}
          </button>

          <label className="pc-field">
            <span className="pc-field-label">{t('promptCompiler.continuity')}</span>
            <input
              value={continuityUrl}
              placeholder={t('promptCompiler.continuityUrl')}
              onChange={(e) => setContinuityUrl(e.target.value)}
            />
          </label>

          <h4 className="pc-section-title">{t('promptCompiler.params')}</h4>
          <div className="pc-params">
            <label className="pc-field">
              <span className="pc-field-label">{t('promptCompiler.aspectRatio')}</span>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
              >
                <option value="">—</option>
                {ratios.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="pc-field">
              <span className="pc-field-label">{t('promptCompiler.resolution')}</span>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option value="">—</option>
                {resolutions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="pc-field">
              <span className="pc-field-label">{t('promptCompiler.duration')}</span>
              {durationValues.length ? (
                <select
                  value={String(durationSec)}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                >
                  {durationValues.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={1}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value) || 1)}
                />
              )}
            </label>
          </div>
          <label className="pc-check">
            <input
              type="checkbox"
              checked={burnSubtitles}
              onChange={(e) => setBurnSubtitles(e.target.checked)}
            />
            <span>{t('promptCompiler.burnSubtitles')}</span>
          </label>

          {error ? <p className="pc-error">{error}</p> : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime pc-compile"
            disabled={!canCompile}
            onClick={() => void handleCompile()}
          >
            {busy ? t('promptCompiler.compiling') : t('promptCompiler.compile')}
          </button>
          {!hasScene ? <p className="pc-empty">{t('promptCompiler.empty')}</p> : null}
        </aside>

        <section className="pc-out">
          <div className="pc-tabs" role="tablist" aria-label={t('promptCompiler.title')}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'prompt'}
              className={tab === 'prompt' ? 'active' : undefined}
              onClick={() => setTab('prompt')}
            >
              {t('promptCompiler.tabPrompt')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'profile'}
              className={tab === 'profile' ? 'active' : undefined}
              onClick={() => setTab('profile')}
            >
              {t('promptCompiler.tabProfile')}
            </button>
          </div>

          {tab === 'profile' ? (
            <ProfileTab profile={profile} />
          ) : !result ? (
            <p className="pc-empty">{t('promptCompiler.empty')}</p>
          ) : (
            <div className="pc-result">
              <div className="pc-result-head">
                <div>
                  <h4>{t('promptCompiler.result')}</h4>
                  <p className="pc-target">
                    {t('promptCompiler.targetNotice', { model: result.label })}
                  </p>
                  <p className="pc-meta">
                    {t('promptCompiler.chars', { n: result.prompt.length })}
                  </p>
                </div>
                <button
                  type="button"
                  className="pf-btn pf-btn-lime pc-copy"
                  onClick={() => void handleCopy()}
                >
                  {copy === 'copied' ? t('promptCompiler.copied') : t('promptCompiler.copy')}
                </button>
              </div>

              <pre className="pc-prompt" ref={promptRef} tabIndex={0}>
                {result.prompt}
              </pre>

              {copy === 'manual' ? (
                <p className="pc-manual" role="status">
                  <strong>{t('promptCompiler.copyFailed')}</strong>{' '}
                  {t('promptCompiler.copyManual')}
                </p>
              ) : null}

              {result.warnings.length ? (
                <div className="pc-warnings">
                  <h5>{t('promptCompiler.warningsTitle')}</h5>
                  <ul>
                    {result.warnings.map((warning, idx) => (
                      <li key={`${warning.code}-${idx}`}>
                        <code>{warning.code}</code> {t(`promptCompiler.warn.${warning.code}`)}
                        {warning.detail ? <em> ({warning.detail})</em> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
