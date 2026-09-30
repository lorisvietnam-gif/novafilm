/** Lưới thẻ phong cách hình: ô "không phong cách" + các lựa chọn có ảnh nhỏ */
import { Check } from 'lucide-react'
import { DramaImageStylePreviewImg } from './DramaImageStylePreviewImg'
import { IMAGE_STYLE_OPTIONS, type ImageStyleId } from '../../lib/dramaImageStyles'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Props = {
  value: ImageStyleId | ''
  onChange: (id: ImageStyleId | '') => void
  allowNone?: boolean
  noneLabel?: string
  className?: string
}

const NONE_LABEL: LocalizedText = {
  zh: '无风格',
  en: 'No style',
  vi: 'Không phong cách',
}

// Render lưới thẻ phong cách hình bấm được
export function DramaImageStyleCardGrid({
  value,
  onChange,
  allowNone = true,
  noneLabel,
  className,
}: Props) {
  const lt = useLocalizedText()
  return (
    <div className={['drama-style-modal-grid', className].filter(Boolean).join(' ')}>
      {allowNone ? (
        <button
          type="button"
          className={`drama-style-modal-none${!value ? ' is-selected' : ''}`}
          onClick={() => onChange('')}
        >
          {!value ? <Check className="drama-style-modal-check" size={12} strokeWidth={2.5} /> : null}
          {noneLabel || lt(NONE_LABEL)}
        </button>
      ) : null}
      {IMAGE_STYLE_OPTIONS.map((opt) => {
        const selected = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            className={`drama-style-modal-card${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            <DramaImageStylePreviewImg styleId={opt.id} alt={opt.label} />
            <span>{opt.label}</span>
            {selected ? (
              <Check className="drama-style-modal-check on-media" size={12} strokeWidth={2.5} />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
