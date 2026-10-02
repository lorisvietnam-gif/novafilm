import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { isBillingError, PRICING_PATH } from '../../lib/billingError'
import { localizeBackendMessage } from '../../lib/backendMessages'
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

  // PHÂN LOẠI TRÊN CHUỖI THÔ, HIỂN THỊ CHUỖI ĐÃ DỊCH — thứ tự này là bắt buộc.
  //
  // `isBillingError()` dò chính xác tiếng Trung mà backend trả về (`余额不足`,
  // `请先充值`…). Nếu dịch trước rồi mới phân loại, regex không còn trúng và mất
  // luôn liên kết nạp tiền — đúng loại lỗi "thông báo biến mất im lặng" mà
  // `dramaGenError.ts` đã ghi. Vì vậy: `isBillingError` nhận `text` thô, còn cái
  // in ra là `shown`.
  const shown = localizeBackendMessage(text)

  if (!isBillingError(text)) {
    return (
      <Tag className={className} style={style} role={inline ? undefined : 'alert'}>
        {shown}
      </Tag>
    )
  }
  return (
    <Tag className={className} style={style} role={inline ? undefined : 'alert'}>
      {shown}{' '}
      <Link to={PRICING_PATH} className="pf-link pf-billing-topup-link">
        {linkText || lt(TOPUP_LABEL)}
      </Link>
    </Tag>
  )
}
