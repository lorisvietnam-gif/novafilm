import { cn } from '../../lib/cn'
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../lib/pagination'
import { useI18n } from '../../i18n'

type Props = {
  page: number
  pageCount: number
  onChange: (page: number) => void
  /** Tổng số bản ghi; truyền vào thì hiện dòng tóm tắt */
  total?: number
  /** Số bản ghi mỗi trang hiện tại */
  pageSize?: number
  /** Các lựa chọn số bản ghi mỗi trang; dùng cùng onPageSizeChange để hiện bộ chuyển */
  pageSizeOptions?: readonly number[]
  onPageSizeChange?: (pageSize: number) => void
  className?: string
  ariaLabel?: string
  /** Có hiện dòng tóm tắt kiểu "Trang x / y · tổng z mục" không */
  showSummary?: boolean
}

// Dựng dãy số trang có dấu ba chấm
function buildPageItems(page: number, pageCount: number): Array<number | '…'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }
  const items: Array<number | '…'> = [1]
  if (page > 3) items.push('…')
  for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) {
    items.push(i)
  }
  if (page < pageCount - 2) items.push('…')
  items.push(pageCount)
  return items
}

/** Bộ phân trang dùng chung: điều hướng trang + tuỳ chọn số bản ghi mỗi trang + dòng tóm tắt */
export default function Pagination({
  page,
  pageCount,
  onChange,
  total,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageSizeChange,
  className,
  ariaLabel,
  showSummary = true,
}: Props) {
  const { t } = useI18n()
  const navLabel = ariaLabel || t('common.pagination')
  const sizeOptions = onPageSizeChange ? pageSizeOptions : undefined
  const canPickSize = Boolean(sizeOptions?.length && pageSize && onPageSizeChange)
  const showNav = pageCount > 1
  const summaryVisible = showSummary && total != null && total >= 0

  if (!showNav && !canPickSize && !summaryVisible) return null

  const items = buildPageItems(page, pageCount)
  const pageSizeBefore = t('common.pageSizeBefore')
  const pageSizeAfter = t('common.pageSizeAfter')

  return (
    <div className={cn('pf-list-pagination', className)}>
      {summaryVisible ? (
        <p className="pf-list-pagination-summary">
          {t('common.pageSummary', { page, pageCount, total: total ?? 0 })}
        </p>
      ) : null}

      {(showNav || canPickSize) && (
        <div className="pf-list-pagination-bar">
          {canPickSize ? (
            <label className="pf-page-size">
              {pageSizeBefore ? <span>{pageSizeBefore}</span> : null}
              <select
                value={pageSize}
                aria-label={t('common.pageSize')}
                onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              >
                {sizeOptions!.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {pageSizeAfter ? <span>{pageSizeAfter}</span> : null}
            </label>
          ) : null}

          {showNav ? (
            <nav className="pf-pagination" aria-label={navLabel}>
              <button
                type="button"
                className="pf-page-btn"
                disabled={page <= 1}
                aria-label={t('common.prevPage')}
                onClick={() => onChange(Math.max(1, page - 1))}
              >
                ‹
              </button>
              {items.map((item, i) =>
                item === '…' ? (
                  <span key={`e-${i}`} className="pf-page-ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={cn('pf-page-btn', page === item && 'active')}
                    aria-current={page === item ? 'page' : undefined}
                    onClick={() => onChange(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                className="pf-page-btn"
                disabled={page >= pageCount}
                aria-label={t('common.nextPage')}
                onClick={() => onChange(Math.min(pageCount, page + 1))}
              >
                ›
              </button>
            </nav>
          ) : null}
        </div>
      )}
    </div>
  )
}
