import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type UsageSummary } from '../../api'
import { LOCALE_DATE, getActiveLocale } from '../../i18n/detect'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

/** Định dạng số token, rút gọn bằng k/M khi quá lớn */
function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return n.toLocaleString(LOCALE_DATE[getActiveLocale()])
}

type MonthlyUsageCardProps = {
  /** compact nhúng vào card bảng giá / cài đặt; panel là kiểu cột bên độc lập */
  variant?: 'panel' | 'compact'
  /** Có hiện nút "nạp tiền" không (trang bảng giá đã nạp trực tiếp thì tắt) */
  showTopup?: boolean
}

const COPY: Record<string, LocalizedText> = {
  title: { zh: '本月使用情况', en: 'This month', vi: 'Mức dùng tháng này' },
  lede: {
    zh: '按上游 token 实际用量计费',
    en: 'Billed on the tokens actually used upstream',
    vi: 'Tính phí theo số token thực tế đã dùng ở phía nhà cung cấp',
  },
  tokens: { zh: 'Token 用量', en: 'Tokens used', vi: 'Token đã dùng' },
  charge: { zh: '本月费用', en: 'Charges this month', vi: 'Chi phí tháng này' },
  balance: { zh: '可用余额', en: 'Available balance', vi: 'Số dư khả dụng' },
  frozen: { zh: '冻结中', en: 'Frozen', vi: 'Đang đóng băng' },
  calls: { zh: '调用 {n} 次', en: '{n} calls', vi: '{n} lượt gọi' },
  topup: { zh: '去充值', en: 'Top up', vi: 'Nạp tiền' },
}

/** Card mức dùng tháng: Token / chi phí / số dư, dùng lại ở trang bảng giá và trung tâm cá nhân */
export default function MonthlyUsageCard({
  variant = 'panel',
  showTopup = true,
}: MonthlyUsageCardProps) {
  const lt = useLocalizedText()
  const [usage, setUsage] = useState<UsageSummary | null>(null)

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      setUsage(null)
      return
    }
    api
      .usageSummary()
      .then(setUsage)
      .catch(() => setUsage(null))
  }, [])

  const tokenPct = Math.min(100, Math.log10((usage?.tokens || 0) + 1) * 18)
  const chargePct = Math.min(100, (usage?.charge_fen || 0) / 20)

  return (
    <div className={`pf-usage-card${variant === 'compact' ? ' is-compact' : ''}`}>
      <header className="pf-usage-card-head">
        <h3>{lt(COPY.title)}</h3>
        <p>{lt(COPY.lede)}</p>
      </header>

      <div className="pf-usage-row">
        <span>{lt(COPY.tokens)}</span>
        <span className="pf-usage-val">{formatTokens(usage?.tokens ?? 0)}</span>
      </div>
      <div className="pf-meter">
        <i style={{ width: `${tokenPct}%` }} />
      </div>

      <div className="pf-usage-row">
        <span>{lt(COPY.charge)}</span>
        <span className="pf-usage-val">¥{(usage?.charge_yuan ?? 0).toFixed(2)}</span>
      </div>
      <div className="pf-meter">
        <i style={{ width: `${chargePct}%` }} />
      </div>

      <div className="pf-usage-row">
        <span>{lt(COPY.balance)}</span>
        <span className="pf-usage-val">¥{(usage?.balance_yuan ?? 0).toFixed(2)}</span>
      </div>
      {(usage?.frozen_fen ?? 0) > 0 ? (
        <div className="pf-usage-row">
          <span>{lt(COPY.frozen)}</span>
          <span className="pf-muted">¥{(usage?.frozen_yuan ?? 0).toFixed(2)}</span>
        </div>
      ) : null}

      <div className="pf-usage-foot">
        <span className="pf-muted">{lt(COPY.calls).replace('{n}', String(usage?.calls ?? 0))}</span>
        {showTopup ? (
          <Link to="/pricing" className="pf-btn pf-btn-lime pf-btn-sm">
            {lt(COPY.topup)}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
