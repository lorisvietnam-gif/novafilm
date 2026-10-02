/**
 * `/wizard` — trạm đẻ prompt bốn bước.
 *
 * NOVAFILM là **trạm đẻ prompt**, không phải trình render: không có API video nào
 * chạy được (TokenFree không khoá, Veo hết hạn ngạch). Nên trang này chỉ soạn prompt
 * rồi đưa cho người dùng dán sang Google Flow / Muse / Kling. **Không khoá nào ở
 * đây gọi tới API video** — bước 4 chỉ có nút sao chép.
 *
 *   1. Ảnh tham chiếu (nhân vật + bối cảnh)   3. Đích đến (Veo/Muse/Kling/Seedance) + giọng
 *   2. Ý tưởng → kịch bản & prompt           4. Sao chép prompt từng khung
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type WizardFrame } from '../../api'
import ErrorNotice from '../../components/errors/ErrorNotice'
import AppShell from '../../components/layout/AppShell'
import Button from '../../components/ui/Button'
import { IconCheck, IconClose, IconCopy, IconImage } from '../../components/ui/Icons'
import { useI18n } from '../../i18n'
import {
  MAX_REFERENCE_IMAGES,
  formatReferenceImageLimitMessage,
} from '../../lib/referenceImages'
import { boardCardText, buildArtDirectionBoard, type BoardCard } from './artDirection'
import './wizard.css'

/** Thứ tự cố định của bốn đích đến; chỉ số dùng để tra nhãn trong pack i18n. */
const TARGETS = ['veo', 'muse', 'kling', 'seedance'] as const
type TargetId = (typeof TARGETS)[number]

/**
 * Đuôi bối cảnh cho **bản nháp dựng trong trình duyệt**.
 *
 * Cố ý viết thẳng tiếng Anh ở đây chứ không đưa vào pack i18n: đây là **payload
 * gửi cho mô hình video**, không phải văn bản người dùng đọc trên trang. Nếu đưa
 * vào pack thì người dùng locale `vi` sẽ nhận prompt tiếng Việt rồi dán vào Veo —
 * đúng thứ họ không cần. Kiểm tra ảnh chụp chỉ đếm ký tự Trung nên không ảnh hưởng.
 */
const DRAFT_FRAMING =
  'Medium shot, gentle dolly-in, soft rim light, shallow depth of field, cinematic, 8 seconds.'

/** Một ảnh đang chờ ở bước 1. Chỉ tồn tại trong trình duyệt — xem `wizard.refs.localOnly`. */
type RefImage = { url: string; name: string }

/** Câu tiếng Anh hay dùng để bọc mỗi câu của ý tưởng thành khung. */
const DRAFT_PER_FRAME = 'Cinematic shot, consistent character, natural lighting.'

/** Số câu tối đa khi tự tách prompt thành khung. */
const MAX_DRAFT_FRAMES = 4

/** Tách câu để dựng khung nháp từ ý tưởng của người dùng. */
function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Cắt bớt một ảnh khỏi danh sách và **thu hồi** object URL của nó. */
function without(images: RefImage[], url: string): RefImage[] {
  URL.revokeObjectURL(url)
  return images.filter((img) => img.url !== url)
}

export default function WizardPage() {
  const { t, m, locale } = useI18n()

  const [step, setStep] = useState(0)
  /** Bước cao nhất đã tới — dùng để biết bước nào được bấm ngược lại. */
  const [maxStep, setMaxStep] = useState(0)
  const [character, setCharacter] = useState<RefImage[]>([])
  const [background, setBackground] = useState<RefImage[]>([])
  const [refError, setRefError] = useState('')
  const [idea, setIdea] = useState('')
  const [script, setScript] = useState('')
  const [frames, setFrames] = useState<WizardFrame[]>([])
  /** Bản nháp tự soạn: đánh dấu để không bị nhầm là kết quả từ mô hình. */
  const [drafted, setDrafted] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Lỗi từ API — đi qua `ErrorNotice` để hiện câu đã dịch. */
  const [error, setError] = useState<unknown>(null)
  /** Lỗi kiểm tra ngay tại ô nhập: không phải lỗi máy chủ nên không đi qua `ErrorNotice`. */
  const [ideaError, setIdeaError] = useState('')
  const [target, setTarget] = useState<TargetId>('veo')
  const [voice, setVoice] = useState(0)
  /** Mã của nút vừa bấm: `all`, `frame-<n>`, hoặc `field-<tên trường>`. */
  const [copied, setCopied] = useState('')
  /** Câu báo cho trình đọc màn hình. Rỗng nghĩa là chưa có gì để báo. */
  const [toast, setToast] = useState('')
  const [copyFailed, setCopyFailed] = useState(false)

  /*
   * Object URL không tự giải phóng — cứ mở trang nhiều lần là rò bộ nhớ ảnh trong
   * tab. Gom vào ref rồi thu hồi một lể khi rời trang.
   */
  const objectUrls = useRef<string[]>([])
  useEffect(() => {
    const urls = objectUrls.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  /**
   * Timer của nút "đã sao chép" phải bị **huỷ** khi rời trang.
   *
   * Trước đây gọi `window.setTimeout` rồi bỏ mặc: điều hướng đi trước khi 2 giây trôi
   * là callback giữ nguyên closure cũ và `setCopied` gọi vào state của một component đã
   * bỏ rơi. React thì chịu được, nhưng đó là một việc làm mà không ai nhờ, và vài lượt
   * liên tiếp thì tích tụ timer. Dòng `useEffect(() => clearCopyTimer, [])` dưới đây là
   * chỗ dọn.
   */
  const copyTimer = useRef<number | null>(null)
  function clearCopyTimer() {
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current)
      copyTimer.current = null
    }
  }
  useEffect(() => clearCopyTimer, [])

  const stepLabels = useMemo(() => m.wizard.steps, [m])
  const targetLabels = useMemo(() => m.wizard.target.labels, [m])
  const targetHints = useMemo(() => m.wizard.target.hints, [m])
  const voiceNames = useMemo(() => m.wizard.target.voiceNames, [m])
  const voiceName = voiceNames[voice] ?? voiceNames[0]
  const targetName = targetLabels[TARGETS.indexOf(target)] ?? targetLabels[0]

  /**
   * Bảng chỉ đạo nghệ thuật — bảy thẻ của bước 4.
   *
   * Tính lại từ `frames` mỗi khi nó đổi, không lưu vào state: nó thuần tuý, và giữ nó
   * trong state là mở đường cho một bản cũ tồn tại sau khi `frames` đã đổi.
   */
  const board = useMemo(() => buildArtDirectionBoard(frames.map((f) => f.prompt)), [frames])
  const boardFilled = board.cards.filter((c) => c.slots.length).length

  const refTotal = character.length + background.length

  function goTo(next: number) {
    setStep(next)
    setMaxStep((prev) => Math.max(prev, next))
  }

  /** Nhận ảnh từ `<input type="file">` của một trong hai nhóm. */
  function addImages(kind: 'character' | 'background', files: FileList | null) {
    if (!files || files.length === 0) return
    const accepted: RefImage[] = []
    let rejected = false

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        rejected = true
        continue
      }
      const url = URL.createObjectURL(file)
      objectUrls.current.push(url)
      accepted.push({ url, name: file.name })
    }
    if (rejected) setRefError(t('wizard.refs.notAnImage'))

    if (accepted.length) {
      setRefError('')
      setCharacter((prev) => (kind === 'character' ? [...prev, ...accepted] : prev))
      setBackground((prev) => (kind === 'background' ? [...prev, ...accepted] : prev))
    }

    /*
     * Chặn theo đúng trần của Canvas (9 ảnh / lượt) và **không** cắt bớt âm thầm:
     * cắt nhầm ảnh nhân vật là đổi nhân vật. Người dùng tự bỏ ảnh.
     */
    if (refTotal + accepted.length > MAX_REFERENCE_IMAGES) {
      setRefError(formatReferenceImageLimitMessage(refTotal + accepted.length))
    }
  }

  function removeImage(kind: 'character' | 'background', url: string) {
    if (kind === 'character') setCharacter((prev) => without(prev, url))
    else setBackground((prev) => without(prev, url))
    setRefError('')
  }

  function clearGroup(kind: 'character' | 'background') {
    const images = kind === 'character' ? character : background
    images.forEach((img) => URL.revokeObjectURL(img.url))
    if (kind === 'character') setCharacter([])
    else setBackground([])
    setRefError('')
  }

  /**
   * Bước 2. Nộp ý tưởng lên `POST /api/wizard/generate_prompt`.
   *
   * Khi hỏng thì **không** chặn luồng: giữ lỗi cho người dọc và dựng bản nháp trong
   * trình duyệt, để bước 4 vẫn tới được và có gì để sao chép. Đây là yêu cầu rõ của
   * brief — trang hỏng vì một lệnh gọi lỗi là tự nó làm hỏng trang.
   */
  async function generate() {
    const trimmed = idea.trim()
    if (!trimmed) {
      setIdeaError(t('wizard.idea.empty'))
      return
    }
    setIdeaError('')
    setBusy(true)
    setError(null)
    try {
      const result = await api.wizardGeneratePrompt({
        idea: trimmed,
        language: locale === 'en' ? 'en' : 'vi',
      })
      setScript((result.script || '').trim())
      setFrames(normalizeFrames(result.frames, result.prompt))
      setDrafted(false)
    } catch (e) {
      setError(e)
      setDrafted(true)
      setFrames(buildDraftFrames(trimmed))
    } finally {
      setBusy(false)
    }
  }

  /**
 * Bấm nút sao chép: ghi vào bộ nhớ tạm, đổi trạng thái nút, và **báo** việc vừa làm.
 *
 * `message` là câu sẽ được trình đọc màn hình đọc lên. Nội dung của nó do **chỗ gọi**
 * quyết định, không suy ra ở đây — vì lời báo phải nói đúng việc vừa xảy ra, và "vừa
 * sao chép phần Máy quay" khác "vừa sao chép cả bài".
 */
async function copyText(value: string, token: string, message: string) {
    setCopyFailed(false)
    // Rỗng thì không báo: đó là nút bị tắt, không phải một cú bấm thất bại.
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(token)
      announce(message)
      clearCopyTimer()
      copyTimer.current = window.setTimeout(() => {
        copyTimer.current = null
        setCopied('')
      }, 2400)
    } catch {
      // Clipboard API cần ngữ cảnh bảo mật; localhost thì được, http trên LAN thì không.
      setCopyFailed(true)
    }
  }

  /**
   * Đẩy câu báo vào vùng sống.
   *
   * Xoá trước rồi mới gán ở khung hình kế tiếp: một `aria-live` **không** phát sự kiện
   * khi nội dung không đổi, nên sao chép cùng một thẻ hai lần liên tiếp sẽ im lặng ở lần
   * hai — đúng cái lần mà người dùng cần nghe nhất.
   */
  function announce(message: string) {
    setToast('')
    window.requestAnimationFrame(() => setToast(message))
  }

  const canGoBack = step > 0
  const isLast = step === 3

  return (
    <AppShell wide>
      <div className="wizard-scoped">
        <header className="pf-page-head">
          <div className="pf-page-head-row">
            <div>
              <h1 className="pf-page-title">{t('wizard.title')}</h1>
              <p className="wizard-notice">{t('wizard.lede')}</p>
            </div>
            <WizardStepNav
              labels={stepLabels}
              current={step}
              maxStep={maxStep}
              onPick={goTo}
            />
          </div>
        </header>

        <p className="wizard-draft-note">{t('wizard.notARenderer')}</p>

        {step === 0 ? (
          <section className="wizard-panel" aria-label={t('wizard.refs.title')}>
            <h2>{t('wizard.refs.title')}</h2>
            <p className="wizard-drop-hint">{t('wizard.refs.hint')}</p>

            {refError ? <p className="wizard-ref-note">{refError}</p> : null}

            <div className="wizard-ref-grid">
              <RefGroup
                title={t('wizard.refs.character')}
                hint={t('wizard.refs.characterHint')}
                empty={t('wizard.refs.empty')}
                countLabel={t('wizard.refs.count', { count: character.length })}
                addLabel={t('wizard.refs.addImage')}
                removeLabel={t('wizard.refs.removeImage')}
                clearLabel={t('wizard.refs.clearAll')}
                images={character}
                onFiles={(files) => addImages('character', files)}
                onRemove={(url) => removeImage('character', url)}
                onClear={() => clearGroup('character')}
              />
              <RefGroup
                title={t('wizard.refs.background')}
                hint={t('wizard.refs.backgroundHint')}
                empty={t('wizard.refs.empty')}
                countLabel={t('wizard.refs.count', { count: background.length })}
                addLabel={t('wizard.refs.addImage')}
                removeLabel={t('wizard.refs.removeImage')}
                clearLabel={t('wizard.refs.clearAll')}
                images={background}
                onFiles={(files) => addImages('background', files)}
                onRemove={(url) => removeImage('background', url)}
                onClear={() => clearGroup('background')}
              />
            </div>

            <p className="wizard-ref-note">
              {t('wizard.refs.localOnly')}{' '}
              <Link to="/assets" className="pf-link">
                {t('nav.assets')}
              </Link>
            </p>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="wizard-panel" aria-label={t('wizard.idea.title')}>
            <h2>{t('wizard.idea.title')}</h2>
            <p className="wizard-drop-hint">{t('wizard.idea.hint')}</p>

            <label className="pf-field">
              <span className="pf-field-label">{t('wizard.idea.label')}</span>
              <textarea
                className="wizard-textarea"
                value={idea}
                aria-invalid={ideaError ? true : undefined}
                placeholder={t('wizard.idea.placeholder')}
                onChange={(e) => {
                  setIdea(e.target.value)
                  if (ideaError) setIdeaError('')
                }}
              />
            </label>
            {ideaError ? <p className="wizard-field-error">{ideaError}</p> : null}

            <Button variant="lime" size="lg" className="wizard-generate" disabled={busy} onClick={generate}>
              {busy ? t('wizard.idea.generating') : t('wizard.idea.generate')}
            </Button>

            {error ? (
              <div className="wizard-readout">
                <ErrorNotice error={error} onRetry={generate} onDismiss={() => setError(null)} />
              </div>
            ) : null}

            {drafted ? <p className="wizard-draft-note">{t('wizard.idea.localDraftNotice')}</p> : null}

            <div className="wizard-readout">
              {script ? (
                <div>
                  <span className="wizard-readout-label">{t('wizard.idea.scriptLabel')}</span>
                  <p className="wizard-readout-body">{script}</p>
                </div>
              ) : null}
              {frames.length ? (
                <div>
                  <span className="wizard-readout-label">
                    {t('wizard.idea.framesLabel')} ({frames.length})
                  </span>
                  <p className="wizard-readout-body">
                    {frames.map((f) => f.prompt).join('\n\n')}
                  </p>
                </div>
              ) : !busy && !drafted ? (
                <p className="wizard-drop-empty">{t('wizard.idea.noResult')}</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="wizard-panel" aria-label={t('wizard.target.title')}>
            <h2>{t('wizard.target.title')}</h2>
            <p className="wizard-drop-hint">{t('wizard.target.hint')}</p>

            <div className="wizard-target-grid">
              {TARGETS.map((id, index) => (
                <button
                  key={id}
                  type="button"
                  className={`wizard-target${target === id ? ' is-active' : ''}`}
                  aria-pressed={target === id}
                  onClick={() => setTarget(id)}
                >
                  <span className="wizard-target-name">{targetLabels[index]}</span>
                  <span className="wizard-target-hint">{targetHints[index]}</span>
                </button>
              ))}
            </div>

            <label className="pf-field" style={{ marginTop: '1rem' }}>
              <span className="pf-field-label">{t('wizard.target.voice')}</span>
              <select
                className="wizard-select"
                value={voice}
                onChange={(e) => setVoice(Number(e.target.value))}
              >
                {voiceNames.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <p className="wizard-drop-hint">{t('wizard.target.voiceHint')}</p>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="wizard-panel" aria-label={t('wizard.export.title')}>
            <h2>{t('wizard.export.title')}</h2>
            <p className="wizard-drop-hint">{t('wizard.export.hint')}</p>

            <p className="wizard-summary">
              <span>{t('wizard.export.summaryLabel')}</span>
              <span>{t('wizard.export.summaryTarget', { target: targetName })}</span>
              <span>{t('wizard.export.summaryVoice', { voice: voiceName })}</span>
            </p>

            {copyFailed ? <p className="wizard-draft-note">{t('wizard.export.copyFailed')}</p> : null}

            {/*
              Vùng sống cho trình đọc màn hình. Phải có mặt trong DOM **trước** khi nội
              dung đổi: một phần tử sinh ra kèm nội dung thì không được đọc, vì không có
              gì để so sánh. Rỗng thì `:empty` trong `wizard.css` ẩn đi.
            */}
            <p className="wizard-toast" role="status" aria-live="polite">{toast}</p>

            {frames.length === 0 ? (
              <p className="wizard-drop-empty">{t('wizard.export.emptyFrames')}</p>
            ) : (
              <>
                <section className="wizard-board" aria-label={t('wizard.board.title')}>
                  <div className="wizard-board-head">
                    <h3>{t('wizard.board.title')}</h3>
                    <p className="wizard-drop-hint">{t('wizard.board.hint')}</p>
                    <p className="wizard-board-coverage">
                      {t('wizard.board.coverage', {
                        filled: boardFilled,
                        total: board.cards.length,
                      })}
                    </p>
                  </div>

                  {/*
                    Nút lớn, đặt **giữa** khối kết quả. Không nằm trong `.wizard-actions` —
                    `visual-audit.mjs` bấm `.wizard-actions .pf-btn` và lấy nút cuối làm
                    "Tiếp tục"; đặt nút sao chép vào đó là nó sẽ bấm nhầm.
                  */}
                  <div className="wizard-board-primary">
                    <Button
                      variant="lime"
                      size="lg"
                      onClick={() => copyText(
                        frames.map((f) => f.prompt).join('\n\n'),
                        'all',
                        t('wizard.export.toastAll'),
                      )}
                    >
                      {copied === 'all' ? t('wizard.export.copied') : t('wizard.export.copyAll')}
                    </Button>
                  </div>

                  <div className="wizard-board-grid">
                    {board.cards.map((card) => (
                      <BoardCardView
                        key={card.field}
                        card={card}
                        label={t(`wizard.board.labels.${card.field}`)}
                        copied={copied === `field-${card.field}`}
                        onCopy={(text, message) =>
                          copyText(text, `field-${card.field}`, message)
                        }
                      />
                    ))}
                  </div>
                </section>

                <div className="wizard-frames" style={{ marginTop: '1rem' }}>
                  {frames.map((frame, index) => {
                    const token = `frame-${index}`
                    return (
                      <article key={token} className="wizard-frame">
                        <p className="wizard-frame-title">
                          <span>{t('wizard.export.frameTitle', { no: index + 1 })}</span>
                          <Button
                            size="sm"
                            onClick={() => copyText(
                              frame.prompt,
                              token,
                              t('wizard.export.toastFrame', { no: index + 1 }),
                            )}
                            icon
                          >
                            {copied === token ? (
                              <IconCheck size={15} />
                            ) : (
                              <IconCopy size={15} />
                            )}
                            {copied === token
                              ? t('wizard.export.copied')
                              : t('wizard.export.copyFrame')}
                          </Button>
                        </p>
                        {frame.narration ? (
                          <p className="wizard-frame-narration">{frame.narration}</p>
                        ) : null}
                        <p className="wizard-frame-prompt">{frame.prompt}</p>
                      </article>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        ) : null}

        <div className="wizard-actions">
          {canGoBack ? (
            <Button variant="ghost" onClick={() => goTo(step - 1)}>
              {t('wizard.nav.back')}
            </Button>
          ) : null}
          {!isLast ? (
            <Button variant={step === 1 && !frames.length ? 'outline' : 'lime'} onClick={() => goTo(step + 1)}>
              {step === 1 && !frames.length ? t('wizard.nav.skip') : t('wizard.nav.next')}
            </Button>
          ) : null}
        </div>
      </div>
    </AppShell>
  )
}

/**
 * Một thẻ của bảng chỉ đạo: nhãn trường, những gì prompt nói về trường đó, nút Copy riêng.
 *
 * Nút **tắt** khi trường rỗng. Đây là điểm cố ý: một nút sao chép được mà bên trong rỗng
 * là một cú bấm nói dối, và nó tệ hơn cả việc không có nút — người dùng tưởng đã lấy đủ
 * thông tin. Thay vào đó thẻ nói thẳng là prompt không nhắc tới phần này.
 */
function BoardCardView({
  card,
  label,
  copied,
  onCopy,
}: {
  card: BoardCard
  label: string
  copied: boolean
  onCopy: (text: string, message: string) => void
}) {
  const { t } = useI18n()
  const text = boardCardText(card)
  const empty = !text

  return (
    <article className={`wizard-board-card${empty ? ' is-empty' : ''}`} data-field={card.field}>
      <p className="wizard-board-card-head">
        <span className="wizard-board-label">{label}</span>
        <Button
          size="sm"
          variant="outline"
          icon
          disabled={empty}
          /*
           * Chữ trên nút là `board.copy` (ngắn), còn tên truy cập là `board.copyField` (có
           * tên trường). Tách hai thứ là chủ ý: đặt tên trường vào chữ nút làm nút tràn ra
           * khỏi thẻ ở bản `vi`, còn đặt vào `aria-label` thì vừa đủ cho trình đọc màn
           * hình mà không tốn chỗ.
           */
          aria-label={t('wizard.board.copyField', { field: label })}
          onClick={() => onCopy(text, t('wizard.export.toastField', { field: label }))}
        >
          {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
          {copied ? t('wizard.export.copied') : t('wizard.board.copy')}
        </Button>
      </p>

      {empty ? (
        <p className="wizard-board-value is-empty">{t('wizard.board.emptyField')}</p>
      ) : (
        <ul className="wizard-board-slots">
          {card.slots.map((slot) => (
            <li key={slot.frameNo} className="wizard-board-slot">
              <span className="wizard-board-slot-no">
                {t('wizard.export.frameTitle', { no: slot.frameNo })}
              </span>
              <span className="wizard-board-value">{slot.text}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

/**
 * Thanh bốn bước có bấm được.
 *
 * Không dùng `components/ui/Stepper` vì nó render `<span>`: cần bấm ngược lại bước
 * đã đi qua, mà `span` không bấm được. Dùng lại nguyên class `pf-step*` của
 * printfilm.css nên hình dạng không đổi.
 */
function WizardStepNav({
  labels,
  current,
  maxStep,
  onPick,
}: {
  labels: readonly string[]
  current: number
  maxStep: number
  onPick: (index: number) => void
}) {
  return (
    <div className="pf-stepper" role="list">
      {labels.map((label, index) => {
        const done = index < current
        const active = index === current
        const reachable = index <= maxStep
        return (
          <button
            key={label}
            type="button"
            role="listitem"
            className="wizard-step-nav"
            disabled={!reachable}
            aria-current={active ? 'step' : undefined}
            onClick={() => onPick(index)}
          >
            {index > 0 ? (
              <span className={`pf-step-line${done || active ? ' done' : ''}`} aria-hidden />
            ) : null}
            <span
              className={['pf-step', done ? 'done' : '', active ? 'active' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <span className="pf-step-dot">{done && !active ? '✓' : index + 1}</span>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Một nhóm ảnh ở bước 1: tiêu đề, nút chọn ảnh, lưới thumbnail. */
function RefGroup({
  title,
  hint,
  empty,
  countLabel,
  addLabel,
  removeLabel,
  clearLabel,
  images,
  onFiles,
  onRemove,
  onClear,
}: {
  title: string
  hint: string
  empty: string
  countLabel: string
  addLabel: string
  removeLabel: string
  clearLabel: string
  images: RefImage[]
  onFiles: (files: FileList | null) => void
  onRemove: (url: string) => void
  onClear: () => void
}) {
  return (
    <div className="wizard-drop">
      <p className="wizard-drop-title">
        <span>{title}</span>
        {images.length ? <span className="wizard-drop-hint">{countLabel}</span> : null}
      </p>
      <p className="wizard-drop-hint">{hint}</p>

      <input
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          onFiles(e.target.files)
          // Cho phép chọn lại đúng tệp vừa bị bỏ, nếu không thì onChange không bắn.
          e.target.value = ''
        }}
      />
      <Button size="sm" variant="outline" icon onClick={(e) => openFilePicker(e, onFiles)}>
        <IconImage size={15} />
        {addLabel}
      </Button>

      {images.length === 0 ? <p className="wizard-drop-empty">{empty}</p> : null}

      <div className="wizard-thumbs">
        {images.map((img) => (
          <figure key={img.url} className="wizard-thumb">
            <img src={img.url} alt={img.name} />
            <button
              type="button"
              className="wizard-thumb-remove"
              title={removeLabel}
              aria-label={`${removeLabel}: ${img.name}`}
              onClick={() => onRemove(img.url)}
            >
              <IconClose size={13} />
            </button>
          </figure>
        ))}
      </div>

      {images.length ? (
        <Button size="sm" variant="text" style={{ marginTop: '0.5rem' }} onClick={onClear}>
          {clearLabel}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * `<input type="file">` bị ẩn nên không bấm trực tiếp được. `e.currentTarget` là
 * `<button>`; input nằm cùng khối, tìm ngược lại từ cha.
 */
function openFilePicker(
  e: MouseEvent<HTMLElement>,
  onFiles: (files: FileList | null) => void,
) {
  const input = e.currentTarget.parentElement?.querySelector('input[type="file"]')
  if (input instanceof HTMLInputElement) input.click()
  else onFiles(null)
}

/**
 * Chuẩn hoá kết quả backend về danh sách khung.
 *
 * Hợp đồng của B4 chỉ hứa "một prompt tiếng Anh", nên `frames` có thể vắng mặt.
 * Khi vắng thì tách prompt theo câu để bước 4 vẫn có từng khung để sao chép.
 */
function normalizeFrames(frames: WizardFrame[] | undefined, prompt: string): WizardFrame[] {
  const cleaned = (frames || [])
    .map((f) => ({ ...f, prompt: (f.prompt || '').trim() }))
    .filter((f) => f.prompt)
  if (cleaned.length) return cleaned
  return splitSentences(prompt || '')
    .slice(0, MAX_DRAFT_FRAMES)
    .map((sentence) => ({ prompt: `${sentence} ${DRAFT_PER_FRAME}`.trim() }))
}

/**
 * Bản nháp dựng ngay trong trình duyệt khi `generate_prompt` lỗi.
 *
 * Mục đích là **không chặn người dùng**: họ vẫn đi tới bước 4 và vẫn có gì để dán
 * thử. Vì vậy nó được đánh dấu `drafted` để giao diện nói rõ đây chưa qua AI.
 */
function buildDraftFrames(idea: string): WizardFrame[] {
  const sentences = splitSentences(idea)
  const parts = (sentences.length ? sentences : [idea]).slice(0, MAX_DRAFT_FRAMES)
  return parts.map((sentence) => ({ prompt: `${sentence} ${DRAFT_FRAMING}`.trim() }))
}