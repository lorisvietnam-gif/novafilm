import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { isBillingError, PRICING_PATH } from '../../lib/billingError'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Props = {
  message: string | null | undefined
  className?: string
  style?: CSSProperties
  /** Văn bản của liên kết nội tuyến */
  linkText?: string
  /** Dùng span thay vì p (lỗi nội tuyến trong thanh công cụ) */
  inline?: boolean
}

const TOPUP_LABEL: LocalizedText = {
  zh: '去充值 →',
  en: 'Top up →',
  vi: 'Nạp tiền →',
}

/** Thông báo lỗi: khi hết tiền sẽ kèm liên kết nạp tiền nhanh */
export default function BillingErrorNotice({
  message,
  className = 'pf-error',
  style,
  linkText,
  inline = false,
}: Props) {
  const lt = useLocalizedText()
  const text = String(message || '').trim()
  if (!text) return null
  const Tag = inline ? 'span' : 'p'
  if (!isBillingError(text)) {
    return (
      <Tag className={className} style={style} role={inline ? undefined : 'alert'}>
        {text}
      </Tag>
    )
  }
  return (
    <Tag className={className} style={style} role={inline ? undefined : 'alert'}>
      {text}{' '}
      <Link to={PRICING_PATH} className="pf-link pf-billing-topup-link">
        {linkText || lt(TOPUP_LABEL)}
      </Link>
    </Tag>
  )
}
