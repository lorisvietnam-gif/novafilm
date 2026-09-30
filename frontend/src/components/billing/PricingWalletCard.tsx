import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { UsageSummary, Wallet } from '../../api'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Props = {
  wallet: Wallet | null
  usage: UsageSummary | null
  loggedIn: boolean
  updatedAt: Date | null
  onHistory: () => void
}

const COPY: Record<string, LocalizedText> = {
  balance: { zh: '可用余额', en: 'Available balance', vi: 'Số dư khả dụng' },
  hide: { zh: '隐藏余额', en: 'Hide balance', vi: 'Ẩn số dư' },
  show: { zh: '显示余额', en: 'Show balance', vi: 'Hiện số dư' },
  history: { zh: '充值记录', en: 'Top-up history', vi: 'Lịch sử nạp tiền' },
  needLogin: { zh: '请先登录', en: 'Sign in first', vi: 'Hãy đăng nhập trước' },
  monthCharge: { zh: '本次消耗', en: 'Spent this month', vi: 'Đã tiêu tháng này' },
  frozen: { zh: '冻结金额', en: 'Frozen amount', vi: 'Số tiền đang đóng băng' },
  updated: { zh: '更新于 {when}', en: 'Updated {when}', vi: 'Cập nhật {when}' },
}

function formatUpdated(d: Date | null) {
  if (!d) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Card số dư nền tối ở trang bảng giá: số dư, chi phí tháng này, đang đóng băng, lịch sử nạp */
export default function PricingWalletCard({ wallet, usage, loggedIn, updatedAt, onHistory }: Props) {
  const lt = useLocalizedText()
  const [balanceVisible, setBalanceVisible] = useState(true)

  const balanceYuan = wallet?.balance_yuan ?? usage?.balance_yuan ?? 0
  const frozenYuan = wallet?.frozen_yuan ?? usage?.frozen_yuan ?? 0
  const monthCharge = usage?.charge_yuan ?? 0

  return (
    <aside className="pf-pricing-wallet-dark">
      <div className="pf-pricing-wallet-dark-head">
        <span className="pf-pricing-wallet-dark-label">{lt(COPY.balance)}</span>
        <div className="pf-pricing-wallet-dark-actions">
          <button
            type="button"
            className="pf-pricing-wallet-eye"
            aria-label={lt(balanceVisible ? COPY.hide : COPY.show)}
            onClick={() => setBalanceVisible((v) => !v)}
          >
            {balanceVisible ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button
            type="button"
            className="pf-pricing-wallet-history"
            disabled={!loggedIn}
            title={loggedIn ? lt(COPY.history) : lt(COPY.needLogin)}
            onClick={onHistory}
          >
            {lt(COPY.history)}
          </button>
        </div>
      </div>

      <strong className="pf-pricing-wallet-dark-balance">
        {balanceVisible ? `¥${balanceYuan.toFixed(2)}` : '¥ ****'}
      </strong>

      <dl className="pf-pricing-wallet-dark-meta">
        <div>
          <dt>{lt(COPY.monthCharge)}</dt>
          <dd>{loggedIn ? `¥${monthCharge.toFixed(2)}` : '—'}</dd>
        </div>
        <div>
          <dt>{lt(COPY.frozen)}</dt>
          <dd>{loggedIn ? `¥${frozenYuan.toFixed(2)}` : '—'}</dd>
        </div>
      </dl>

      <p className="pf-pricing-wallet-dark-updated">
        {lt(COPY.updated).replace('{when}', formatUpdated(updatedAt))}
      </p>
    </aside>
  )
}
