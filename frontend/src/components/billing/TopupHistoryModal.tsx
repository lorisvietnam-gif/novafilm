import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import { api, type BillingOrder } from '../../api'
import { localized, type LocalizedText } from '../../lib/localeStrings'
import { useLocalizedText } from '../../lib/useLocalizedText'

type Props = {
  open: boolean
  onClose: () => void
}

// Khoá là sku_id và status do backend trả về: dữ liệu, chỉ nhãn hiển thị mới dịch
const SKU_LABELS: Record<string, LocalizedText> = {
  topup_10: { zh: '体验充值', en: 'Starter top-up', vi: 'Nạp thử nghiệm' },
  topup_49: { zh: '基础充值', en: 'Basic top-up', vi: 'Nạp cơ bản' },
  topup_99: { zh: '进阶充值', en: 'Plus top-up', vi: 'Nạp nâng cao' },
  topup_199: { zh: '专业充值', en: 'Pro top-up', vi: 'Nạp chuyên nghiệp' },
}

const STATUS_LABEL: Record<string, LocalizedText> = {
  pending: { zh: '待支付', en: 'Awaiting payment', vi: 'Chờ thanh toán' },
  paid: { zh: '已到账', en: 'Credited', vi: 'Đã vào số dư' },
  closed: { zh: '已关闭', en: 'Closed', vi: 'Đã đóng' },
}

const COPY: Record<string, LocalizedText> = {
  title: { zh: '充值记录', en: 'Top-up history', vi: 'Lịch sử nạp tiền' },
  loading: { zh: '加载中…', en: 'Loading…', vi: 'Đang tải…' },
  loadFailed: { zh: '加载失败', en: 'Could not load the history', vi: 'Không tải được lịch sử' },
  empty: { zh: '暂无充值记录', en: 'No top-ups yet', vi: 'Chưa có lần nạp nào' },
  credited: { zh: '到账 ¥{amount}', en: 'Adds ¥{amount}', vi: 'Cộng ¥{amount}' },
}

function yuan(fen: number) {
  return (fen / 100).toFixed(2)
}

function formatTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Popup lịch sử nạp: liệt kê đơn gần đây và trạng thái vào số dư (đơn quá hạn do backend tự đóng) */
export default function TopupHistoryModal({ open, onClose }: Props) {
  const lt = useLocalizedText()
  /*
   * orders  danh sách đơn
   * loading đang tải
   * error   thông báo lỗi
   */
  const [orders, setOrders] = useState<BillingOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .listBillingOrders(50)
      .then((r) => {
        if (!cancelled) setOrders(r.orders || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : localized(COPY.loadFailed))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title={lt(COPY.title)} size="lg" className="pf-topup-history-modal">
      {loading ? <p className="pf-muted">{lt(COPY.loading)}</p> : null}
      {error ? <p className="pf-error">{error}</p> : null}
      {!loading && !error && orders.length === 0 ? (
        <p className="pf-muted">{lt(COPY.empty)}</p>
      ) : null}
      {!loading && orders.length > 0 ? (
        <ul className="pf-topup-list">
          {orders.map((o) => {
            const sku = SKU_LABELS[o.sku_id]
            const status = STATUS_LABEL[o.status]
            return (
              <li key={o.out_trade_no} className="pf-topup-item">
                <div className="pf-topup-main">
                  <strong>{sku ? lt(sku) : o.sku_name}</strong>
                  <span className="pf-muted">{formatTime(o.paid_at || o.created_at)}</span>
                </div>
                <div className="pf-topup-meta">
                  <em>¥{yuan(o.amount_fen)}</em>
                  <span className="pf-muted">
                    {lt(COPY.credited).replace('{amount}', yuan(o.credit_fen))}
                  </span>
                  <span className={`pf-topup-status is-${o.status}`}>
                    {status ? lt(status) : o.status}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </Modal>
  )
}
