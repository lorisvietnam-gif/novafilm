/** Danh sách chọn mô hình ảnh/video: icon + mô tả + thời gian + gợi ý dùng */
import type { ReactNode } from 'react'
import { Check, Clapperboard, Film, Image as ImageIcon, Sparkles, Wand2, Zap } from 'lucide-react'
import type { MediaModelOption } from '../../api'
import {
  mediaModelCapabilityBadge,
  mediaModelClipDurationLabel,
  mediaModelHoverText,
  mediaModelIconKind,
  type MediaModelIconKind,
} from '../../lib/dramaMediaModelMeta'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Props = {
  models: MediaModelOption[]
  selectedId: string
  emptyHint?: string
  onSelect: (model: MediaModelOption) => void
}

const EMPTY_HINT: LocalizedText = {
  zh: '请先在管理后台「模型」保存预设默认模型',
  en: 'Save a default preset under Models in the admin first',
  vi: 'Hãy lưu một bộ mặc định trong mục "Mô hình" ở trang quản trị trước',
}

const RECOMMENDED: LocalizedText = {
  zh: '默认',
  en: 'Default',
  vi: 'Mặc định',
}

/** Dấu phân cách ghép các mảnh thông tin trong aria-label, đúng với từng ngôn ngữ. */
const ITEM_SEPARATOR: LocalizedText = { zh: '，', en: ', ', vi: ', ' }

/** Render icon theo họ mô hình */
function ModelIcon({ kind }: { kind: MediaModelIconKind }) {
  const common = { size: 16, strokeWidth: 1.9 } as const
  switch (kind) {
    case 'seedance25':
      return <Wand2 {...common} />
    case 'seedanceMini':
      return <Zap {...common} />
    case 'seedance':
      return <Clapperboard {...common} />
    case 'minimax':
      return <Sparkles {...common} />
    case 'seedream':
      return <ImageIcon {...common} />
    case 'gptImage':
      return <Film {...common} />
    default:
      return <Clapperboard {...common} />
  }
}

/** Render danh sách thẻ mô hình bấm được */
export function DramaMediaModelPicker({
  models,
  selectedId,
  emptyHint,
  onSelect,
}: Props) {
  const lt = useLocalizedText()
  if (models.length === 0) {
    return <p className="fc-gen-model-empty">{emptyHint || lt(EMPTY_HINT)}</p>
  }

  return (
    <div className="fc-gen-model-list fc-gen-model-list--rich">
      {models.map((m) => {
        const selected = selectedId === m.id
        const kind = mediaModelIconKind(m.id)
        const badge = mediaModelCapabilityBadge(m)
        const desc = (m.description || '').trim()
        const price = (m.pricing_hint || '').trim()
        const eta = (m.eta_hint || '').trim()
        const clip = mediaModelClipDurationLabel(m)
        const metaBits = [clip, eta].filter(Boolean)
        const sep = lt(ITEM_SEPARATOR)
        const spoken = [m.label, desc, metaBits.join(sep), price].filter(Boolean).join(sep)
        return (
          <button
            key={m.id}
            type="button"
            className={`fc-gen-model-card${selected ? ' selected' : ''}`}
            title={mediaModelHoverText(m)}
            aria-label={spoken}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(m)}
          >
            <span className={`fc-gen-model-card-icon is-${kind}`} aria-hidden>
              <ModelIcon kind={kind} />
            </span>
            <span className="fc-gen-model-card-body">
              <span className="fc-gen-model-card-head">
                <strong>{m.label}</strong>
                {m.recommended ? <em className="fc-gen-model-card-rec">{lt(RECOMMENDED)}</em> : null}
                <em className="fc-gen-model-card-badge">{badge}</em>
                {selected ? (
                  <Check className="fc-gen-model-card-check" size={15} strokeWidth={2.4} aria-hidden />
                ) : null}
              </span>
              {desc ? <span className="fc-gen-model-card-desc">{desc}</span> : null}
              {metaBits.length ? (
                <span className="fc-gen-model-card-meta">{metaBits.join(' · ')}</span>
              ) : null}
              {price ? <span className="fc-gen-model-card-price">{price}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Cho bên ngoài tái dùng node icon khi cần tự xử lý click */
export function dramaMediaModelIconNode(modelId: string): ReactNode {
  return <ModelIcon kind={mediaModelIconKind(modelId)} />
}
