/**
 * Hộp thoại "Toàn bộ prompt phân cảnh": liệt kê prompt của từng cảnh để **sao chép**.
 *
 * Đây là công cụ dàn prompt, và vì vậy nó phải trung thực trên ba điểm:
 *
 * 1. Nó không thay thế nút tạo video. Khi backend chưa có nhà cung cấp AI thì nút
 *    tạo video mở hộp thoại này kèm một dòng nói rõ chuyện gì đang chặn, và vẫn
 *    có nút "Vẫn thử tạo video" để đường tạo thật không bao giờ bị chặn cứng.
 * 2. Không ghim địa chỉ công cụ bên ngoài nào — ta không kiểm chứng được chúng tồn
 *    tại, nên chỉ nói chung là dán vào công cụ tạo video của bạn.
 * 3. Nói rõ prompt viết cho mô hình nào. Ta chỉ đổi được phần **tham số** theo giới
 *    hạn mà catalog công bố, và ghi ra từng thay đổi; phần cách diễn đạt thì không
 *    bịa ra cho hãng khác.
 *
 * Cảnh chưa có prompt thì hiện lời giải thích, không dựng khung rỗng.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, Copy, Info, TriangleAlert } from 'lucide-react'
import Modal from '../ui/Modal'
import { useI18n } from '../../i18n'
import type { MediaModelOption } from '../../api'
import type { DramaAsset, DramaFragment } from '../../api/drama'
import { copyText, type CopyOutcome } from '../../lib/clipboardCopy'
import type { AiReadinessReason, AiRenderReadiness } from '../../lib/dramaAiReadiness'
import {
  buildPromptScenes,
  countPromptScenes,
  resolvePromptTargetModel,
  type PromptAdjustment,
  type PromptSceneEntry,
} from '../../pages/drama/dramaPromptBundle'
import './dramaPromptBundle.css'

type Props = {
  open: boolean
  onClose: () => void
  fragments: DramaFragment[]
  assets: DramaAsset[]
  episodeParams: Record<string, unknown> | null
  projectParams: Record<string, unknown> | null
  episodeName: string
  /** Mô hình video mà tập này đang dùng để sinh. */
  renderModelId: string
  videoModels: MediaModelOption[]
  readiness: AiRenderReadiness
  /** Chạy thật luôn dù có cảnh báo — đường tạo video không bao giờ bị chặn cứng. */
  onStillRender?: () => void
}

type Toast = {
  id: number
  outcome: CopyOutcome
  text: string
}

const STATUS_TONE: Record<CopyOutcome, 'ok' | 'fallback' | 'error'> = {
  copied: 'ok',
  copiedFallback: 'fallback',
  failed: 'error',
}

/**
 * Bảng tra lý do → khoá văn bản. Viết bằng khoá **nguyên văn** thay vì ghép tên, để
 * một khoá đổi tên là biết ngay mà không phải săn chuỗi trong mã.
 */
const REASON_KEY: Record<AiReadinessReason, string> = {
  mock: 'dramaPromptBundle.reasonMock',
  noTextModel: 'dramaPromptBundle.reasonNoTextModel',
  noVideoModel: 'dramaPromptBundle.reasonNoVideoModel',
  runtimeDown: 'dramaPromptBundle.reasonRuntimeDown',
}

const ADJUST_KEY: Record<PromptAdjustment['kind'], string> = {
  durationSec: 'dramaPromptBundle.adjustDuration',
  aspectRatio: 'dramaPromptBundle.adjustAspectRatio',
  resolution: 'dramaPromptBundle.adjustResolution',
}

/**
 * Chọn sẵn toàn bộ vùng prompt khi sao chép thất bại, để lời nhắc «bấm Ctrl+C»
 * nói đúng với điều sẽ xảy ra: bấm là xong, không phải tự đi tìm và bôi đen.
 */
function selectPromptRegion(root: HTMLElement | null) {
  if (!root) return
  const blocks = [...root.querySelectorAll<HTMLElement>('.drama-prompt-bundle__prompt')]
  const range = document.createRange()
  if (blocks.length === 0) return
  range.setStartBefore(blocks[0])
  range.setEndAfter(blocks[blocks.length - 1])
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

export function DramaPromptBundleModal({
  open,
  onClose,
  fragments,
  assets,
  episodeParams,
  projectParams,
  episodeName,
  renderModelId,
  videoModels,
  readiness,
  onStillRender,
}: Props) {
  const { t } = useI18n()
  const [targetId, setTargetId] = useState(renderModelId)
  const [raw, setRaw] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | null>(null)
  /** Vùng chứa các khối prompt — dùng để chọn sẵn khi sao chép thất bại. */
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Mô hình đích mặc định là mô hình đang sinh; chỉ nắm lại khi mở lại hộp thoại.
  useEffect(() => {
    if (!open) return
    setTargetId(renderModelId)
  }, [open, renderModelId])

  useEffect(
    () => () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    },
    [],
  )

  const target = useMemo(
    () => resolvePromptTargetModel(videoModels.find((model) => model.id === targetId) ?? null),
    [videoModels, targetId],
  )

  const scenes = useMemo(
    () => buildPromptScenes({ fragments, assets, episodeParams, projectParams, target, raw }),
    [fragments, assets, episodeParams, projectParams, target, raw],
  )

  const withPrompt = useMemo(() => countPromptScenes(scenes), [scenes])
  const targetLabel = target?.label || t('dramaPromptBundle.targetModel')
  const formLabel = t(raw ? 'dramaPromptBundle.formRaw' : 'dramaPromptBundle.formExternal')

  const announce = useCallback(
    (outcome: CopyOutcome, text: string) => {
      setToast({ id: Date.now(), outcome, text })
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(null), 8000)
    },
    [],
  )

  const handleCopy = useCallback(
    async (text: string, successText: string) => {
      const outcome = await copyText(text)
      if (outcome === 'copied') {
        announce(outcome, successText)
        return
      }
      if (outcome === 'copiedFallback') {
        announce(outcome, t('dramaPromptBundle.copiedFallback'))
        return
      }
      // Cả hai đường đều bị chặn: chọn sẵn vùng prompt để Ctrl+C là có kết quả.
      selectPromptRegion(scrollRef.current)
      announce(outcome, t('dramaPromptBundle.copyFailed'))
    },
    [announce, t],
  )

  /** Văn bản "sao chép tất cả": nói rõ tập nào, model nào, dạng nào, rồi từng cảnh. */
  const buildBundleText = useCallback((): string => {
    const lines: string[] = [
      t('dramaPromptBundle.bundleHeading', { episode: episodeName || t('dramaPromptBundle.title') }),
      t('dramaPromptBundle.bundleTarget', { label: targetLabel }),
      t('dramaPromptBundle.bundleForm', { form: formLabel }),
      t('dramaPromptBundle.shotCount', { with: withPrompt, total: scenes.length }),
      '',
    ]
    for (const scene of scenes) {
      if (!scene.hasPrompt) continue
      lines.push(
        t('dramaPromptBundle.bundleSceneHead', {
          n: scene.ordinal,
          ratio: scene.aspectRatio,
          resolution: scene.resolution,
          sec: scene.durationSec,
        }),
      )
      if (scene.assets.length > 0) {
        lines.push(
          t('dramaPromptBundle.bundleRefs', {
            list: scene.assets
              .map((asset) => (asset.resolved ? asset.name : `#${asset.id}`))
              .join(', '),
          }),
        )
      }
      lines.push(scene.prompt, '')
    }
    lines.push(t('dramaPromptBundle.bundleDisclaimer', { model: targetLabel }))
    return lines.join('\n')
  }, [episodeName, formLabel, scenes, targetLabel, t, withPrompt])

  /** Khối thông số của một cảnh: tỉ lệ khung hình, thời lượng, độ phân giải. */
  const renderParams = (scene: PromptSceneEntry) => (
    <ul className="drama-prompt-bundle__params">
      <li className="drama-prompt-bundle__param">{scene.aspectRatio}</li>
      <li className="drama-prompt-bundle__param">{`${scene.durationSec}s`}</li>
      <li className="drama-prompt-bundle__param">{scene.resolution}</li>
    </ul>
  )

  const renderScene = (scene: PromptSceneEntry) => {
    const label = t('dramaPromptBundle.sceneLabel', { n: scene.ordinal })
    return (
      <li key={scene.key} className="drama-prompt-bundle__scene">
        <div className="drama-prompt-bundle__scene-head">
          <h4 className="drama-prompt-bundle__scene-name">{label}</h4>
          {renderParams(scene)}
          <div className="drama-prompt-bundle__spacer" />
          <button
            type="button"
            className="drama-prompt-bundle__btn"
            disabled={!scene.hasPrompt}
            onClick={() =>
              void handleCopy(scene.prompt, t('dramaPromptBundle.copiedScene', { label }))
            }
          >
            <Copy size={15} strokeWidth={2} aria-hidden />
            {t('dramaPromptBundle.copyScene')}
          </button>
        </div>

        {scene.assets.length > 0 ? (
          <p className="drama-prompt-bundle__refs">
            {`${t('dramaPromptBundle.refsLabel')}: `}
            {scene.assets
              .map((asset) =>
                asset.resolved
                  ? asset.name
                  : t('dramaPromptBundle.refsMissing', { id: asset.id }),
              )
              .join(' · ')}
          </p>
        ) : null}

        {scene.adjustments.length > 0 ? (
          <p className="drama-prompt-bundle__adjust">
            {scene.adjustments
              .map((adjustment) =>
                t(ADJUST_KEY[adjustment.kind], { from: adjustment.from, to: adjustment.to }),
              )
              .join(' · ')}
          </p>
        ) : null}

        {scene.hasPrompt ? (
          // pre-wrap trong CSS: xuống dòng được ở mọi độ rộng, không bị cắt.
          <pre className="drama-prompt-bundle__prompt">{scene.prompt}</pre>
        ) : (
          <p className="drama-prompt-bundle__empty">{t('dramaPromptBundle.noPrompt')}</p>
        )}
      </li>
    )
  }

  const renderReason = (reason: AiReadinessReason) => t(REASON_KEY[reason])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('dramaPromptBundle.title')}
      size="xl"
      className="drama-prompt-bundle"
    >
      <div className="drama-prompt-bundle__shell">
        <div className="drama-prompt-bundle__top">
          <p className="drama-prompt-bundle__subtitle">{t('dramaPromptBundle.subtitle')}</p>

          {toast ? (
            <p
              key={toast.id}
              className={`drama-prompt-bundle__status is-${STATUS_TONE[toast.outcome]}`}
              role="status"
              aria-live="polite"
            >
              {toast.outcome === 'copied' ? (
                <Info size={15} strokeWidth={2.2} aria-hidden />
              ) : (
                <TriangleAlert size={15} strokeWidth={2.2} aria-hidden />
              )}
              {toast.text}
            </p>
          ) : null}

          {readiness.state === 'unconfigured' ? (
            <div className="drama-prompt-bundle__notice">
              <h4 className="drama-prompt-bundle__notice-title">
                <CircleAlert size={16} strokeWidth={2.2} aria-hidden />
                {t('dramaPromptBundle.noticeTitle')}
              </h4>
              <p className="drama-prompt-bundle__notice-body">
                {t('dramaPromptBundle.noticeBody', {
                  reasons: readiness.reasons.map(renderReason).join('; '),
                })}
              </p>
              {onStillRender ? (
                <div className="drama-prompt-bundle__notice-actions">
                  <button
                    type="button"
                    className="drama-prompt-bundle__btn is-quiet"
                    onClick={() => {
                      onClose()
                      onStillRender()
                    }}
                  >
                    {t('dramaPromptBundle.noticeStillRender')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/*
           * Đoạn này dài năm dòng. Ghim sẵn thì trên 390px người dùng mở hộp thoại ra
           * chỉ thấy cảnh báo, không thấy prompt nào — nên gập lại, chỉ hiện tiêu đề.
           */}
          <details className="drama-prompt-bundle__model-note">
            <summary>
              <strong>{t('dramaPromptBundle.modelTitle')}</strong>
              {` — ${targetLabel}`}
            </summary>
            <p>
              {t('dramaPromptBundle.modelBody', { model: targetLabel })}{' '}
              {t('dramaPromptBundle.modelSymbols')}
            </p>
          </details>

          <div className="drama-prompt-bundle__toolbar">
            <div className="drama-prompt-bundle__field">
              <label className="drama-prompt-bundle__field-label" htmlFor="drama-prompt-target">
                {t('dramaPromptBundle.targetModel')}
              </label>
              <select
                id="drama-prompt-target"
                className="drama-prompt-bundle__select"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              >
                {videoModels.length === 0 ? <option value="">{t('dramaPromptBundle.targetModel')}</option> : null}
                {videoModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label || model.id}
                  </option>
                ))}
              </select>
              <span className="drama-prompt-bundle__field-hint">
                {t(targetId === renderModelId ? 'dramaPromptBundle.targetSame' : 'dramaPromptBundle.targetModelHint')}
              </span>
            </div>

            <div className="drama-prompt-bundle__field">
              <span className="drama-prompt-bundle__field-label" id="drama-prompt-form-label">
                {t('dramaPromptBundle.formLabel')}
              </span>
              <div
                className="drama-prompt-bundle__toggle"
                role="group"
                aria-labelledby="drama-prompt-form-label"
              >
                <button
                  type="button"
                  className="drama-prompt-bundle__btn"
                  aria-pressed={!raw}
                  onClick={() => setRaw(false)}
                >
                  {t('dramaPromptBundle.formExternal')}
                </button>
                <button
                  type="button"
                  className="drama-prompt-bundle__btn"
                  aria-pressed={raw}
                  onClick={() => setRaw(true)}
                >
                  {t('dramaPromptBundle.formRaw')}
                </button>
              </div>
              <span className="drama-prompt-bundle__field-hint">
                {t(raw ? 'dramaPromptBundle.formRawHint' : 'dramaPromptBundle.formExternalHint')}
              </span>
            </div>

            <div className="drama-prompt-bundle__spacer" />

            <div className="drama-prompt-bundle__field">
              <span className="drama-prompt-bundle__field-label">
                {t('dramaPromptBundle.shotCount', { with: withPrompt, total: scenes.length })}
              </span>
              <button
                type="button"
                className="drama-prompt-bundle__btn is-primary"
                disabled={withPrompt === 0}
                onClick={() =>
                  void handleCopy(
                    buildBundleText(),
                    t('dramaPromptBundle.copiedAll', { count: withPrompt }),
                  )
                }
              >
                <Copy size={15} strokeWidth={2.2} aria-hidden />
                {t('dramaPromptBundle.copyAll')}
              </button>
            </div>
          </div>
        </div>

        <div className="drama-prompt-bundle__scroll" ref={scrollRef}>
          {scenes.length === 0 ? (
            <p className="drama-prompt-bundle__none">{t('dramaPromptBundle.allEmpty')}</p>
          ) : (
            <ul className="drama-prompt-bundle__list">{scenes.map(renderScene)}</ul>
          )}
        </div>
      </div>
    </Modal>
  )
}