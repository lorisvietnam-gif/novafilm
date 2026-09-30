import { Link } from 'react-router-dom'
import { PRICING_PATH } from '../../lib/billingError'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Props = {
  className?: string
  children?: string
}

const TOPUP_LABEL: LocalizedText = {
  zh: '去充值 →',
  en: 'Top up →',
  vi: 'Nạp tiền →',
}

/** Liên kết nội tuyến "nạp tiền" */
export default function BillingTopupLink({ className = 'pf-link pf-billing-topup-link', children }: Props) {
  const lt = useLocalizedText()
  return (
    <Link to={PRICING_PATH} className={className}>
      {children || lt(TOPUP_LABEL)}
    </Link>
  )
}
