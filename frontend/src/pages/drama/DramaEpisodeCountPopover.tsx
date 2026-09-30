/** Popover chọn số tập tuỳ chỉnh: có sẵn + tự nhập 1–999 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { EPISODE_COUNT_PRESETS } from '../../lib/dramaImageStyles'

const CUSTOM_MIN = 1
const CUSTOM_MAX = 999

type Props = {
  value: number
  onChange: (count: number) => void
  disabled?: boolean
}

// Có phải số tập nằm trong bộ có sẵn không
function isPreset(count: number) {
  return (EPISODE_COUNT_PRESETS as readonly number[]).includes(count)
}

// Phân tích số tập tuỳ chỉnh
function parseCustom(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n < CUSTOM_MIN || n > CUSTOM_MAX) return null
  return n
}

// Render popover chọn số tập
export function DramaEpisodeCountPopover({ value, onChange, disabled = false }: Props) {
  /*
   * open popover đang mở hay không
   * customInput giá trị nhập tuỳ chỉnh
   * rootRef / panelRef đóng khi bấm ra ngoài
   */
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [customInput, setCustomInput] = useState(isPreset(value) ? '' : String(value))

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node | null
      if (rootRef.current && t && !rootRef.current.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Đổi trạng thái mở / đóng
  function toggle() {
    if (disabled) return
    setOpen((cur) => {
      const next = !cur
      if (next && !isPreset(value)) setCustomInput(String(value))
      return next
    })
  }

  // Chọn số tập có sẵn
  function selectPreset(count: number) {
    onChange(count)
    setCustomInput('')
    setOpen(false)
  }

  // Áp dụng giá trị tuỳ chỉnh
  function applyCustom() {
    const parsed = parseCustom(customInput)
    if (parsed == null) return
    onChange(parsed)
    setOpen(false)
  }

  function onCustomKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyCustom()
    }
  }

  const usingCustom = !isPreset(value)

  return (
    <div ref={rootRef} className="drama-ep-count-popover">
      <button
        type="button"
        className={`drama-agent-opt-trigger${open ? ' is-active' : ''}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <span>{value} tập</span>
        <ChevronDown size={13} strokeWidth={2} className={open ? 'is-open' : ''} />
      </button>

      {open ? (
        <div className="drama-ep-count-panel" role="dialog" aria-label="Số tập tuỳ chỉnh">
          <p className="drama-ep-count-title">Số tập tuỳ chỉnh</p>
          <div className="drama-ep-count-presets">
            {EPISODE_COUNT_PRESETS.map((count) => (
              <button
                key={count}
                type="button"
                className={value === count ? 'is-active' : ''}
                onClick={() => selectPreset(count)}
              >
                {count} tập
              </button>
            ))}
          </div>
          <div className="drama-ep-count-custom">
            <p>Số tập tuỳ chỉnh</p>
            <div className="drama-ep-count-custom-row">
              <input
                type="number"
                min={CUSTOM_MIN}
                max={CUSTOM_MAX}
                value={customInput}
                placeholder={`${CUSTOM_MIN}-${CUSTOM_MAX}`}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={onCustomKeyDown}
                className={usingCustom ? 'is-custom' : ''}
              />
              <button type="button" className="drama-ep-count-confirm" onClick={applyCustom}>
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
