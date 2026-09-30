import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

export type FilterOption = {
  value: string
  label: string
}

type Props = {
  label?: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
}

const PLACEHOLDER: LocalizedText = {
  zh: '请选择',
  en: 'Select',
  vi: 'Chọn',
}

/** Dropdown tuỳ biến theo phong cách thương hiệu, tránh màu xanh mặc định của option gốc */
export default function FilterSelect({
  label,
  options,
  value,
  onChange,
  className,
  disabled,
}: Props) {
  const lt = useLocalizedText()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = options.find((opt) => opt.value === value) || options[0]

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={cn('pf-filter-select', open && 'is-open', className)} ref={rootRef}>
      {label ? <span className="sr-only">{label}</span> : null}
      <button
        type="button"
        className="pf-filter-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pf-filter-trigger-label">{current?.label || lt(PLACEHOLDER)}</span>
        <ChevronDown size={15} strokeWidth={2} className="pf-filter-chevron" aria-hidden />
      </button>
      {open ? (
        <ul id={listId} className="pf-filter-menu" role="listbox" aria-label={label}>
          {options.map((opt) => {
            const selected = opt.value === value
            return (
              <li key={opt.value || 'all'} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn('pf-filter-option', selected && 'is-selected')}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
