import { useCallback, useEffect, useState } from 'react'
import { api, type UsageChargeRecord } from '../../api'
import Pagination from '../ui/Pagination'
import { pageCountOf } from '../../lib/pagination'
import { LOCALE_DATE, getActiveLocale } from '../../i18n/detect'
import { localized, type LocalizedText } from '../../lib/localeStrings'
import { useLocalizedText } from '../../lib/useLocalizedText'

/** Định dạng thời gian tương đối để hiển thị */
function formatWhen(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(LOCALE_DATE[getActiveLocale()], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Định dạng số token */
function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return n.toLocaleString(LOCALE_DATE[getActiveLocale()])
}

type UsageChargeRecordsProps = {
  /** compact khi nhúng vào trang cài đặt */
  variant?: 'panel' | 'compact'
}

const COPY: Record<string, LocalizedText> = {
  title: { zh: '使用扣费记录', en: 'Charges', vi: 'Lịch sử chi phí' },
  lede: {
    zh: '每次 AI 调用的 token 用量与扣费明细',
    en: 'Tokens and charges for every AI call',
    vi: 'Token và chi phí của từng lượt gọi AI',
  },
  loadFailed: { zh: '加载扣费记录失败', en: 'Could not load charges', vi: 'Không tải được lịch sử chi phí' },
  loading: { zh: '加载中…', en: 'Loading…', vi: 'Đang tải…' },
  empty: { zh: '暂无扣费记录', en: 'No charges yet', vi: 'Chưa có khoản chi nào' },
  estimated: { zh: ' · 估算', en: ' · estimated', vi: ' · ước tính' },
  paginationLabel: { zh: '扣费记录分页', en: 'Charge history pages', vi: 'Phân trang lịch sử chi phí' },
}

/** Danh sách khấu trừ: hiện chi tiết tính phí LLM / tạo ảnh / tạo video */
export default function UsageChargeRecords({ variant = 'compact' }: UsageChargeRecordsProps) {
  const lt = useLocalizedText()
  /*
   * items  bản ghi của trang hiện tại
   * page   số trang
   * pageSize số bản ghi mỗi trang
   * total  tổng số bản ghi
   * loading đang tải
   * error  thông báo lỗi
   */
  const [items, setItems] = useState<UsageChargeRecord[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const pageCount = pageCountOf(total, pageSize)

  // Lấy một trang cụ thể
  const loadPage = useCallback(async (nextPage: number, size: number) => {
    if (!localStorage.getItem('token')) {
      setItems([])
      setTotal(0)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.usageEvents(nextPage, size)
      setTotal(res.meta.total)
      setPage(nextPage)
      setItems(res.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : localized(COPY.loadFailed))
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage(page, pageSize)
  }, [loadPage, page, pageSize])

  function handlePageSizeChange(nextSize: number) {
    setPageSize(nextSize)
    setPage(1)
  }

  return (
    <section className={`pf-usage-records${variant === 'compact' ? ' is-compact' : ''}`}>
      <header className="pf-usage-records-head">
        <h3>{lt(COPY.title)}</h3>
        <p className="pf-muted">{lt(COPY.lede)}</p>
      </header>

      {loading ? <p className="pf-muted">{lt(COPY.loading)}</p> : null}
      {error ? <p className="pf-error">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="pf-settings-empty">
          <p>{lt(COPY.empty)}</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="pf-settings-list pf-usage-records-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="pf-settings-list-row pf-usage-record-row">
                <span className="pf-settings-list-main">
                  <strong>{item.billing_label}</strong>
                  <em className="pf-muted">
                    {item.context}
                    {item.total_tokens > 0 ? ` · ${formatTokens(item.total_tokens)} tokens` : ''}
                    {item.estimated ? lt(COPY.estimated) : ''}
                  </em>
                </span>
                <span className="pf-settings-list-meta pf-usage-record-meta">
                  <strong className="pf-usage-record-charge">
                    {item.charge_fen > 0 ? `-¥${item.charge_yuan.toFixed(2)}` : '—'}
                  </strong>
                  <em className="pf-muted">{formatWhen(item.created_at)}</em>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && total > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          onChange={setPage}
          ariaLabel={lt(COPY.paginationLabel)}
        />
      ) : null}
    </section>
  )
}
