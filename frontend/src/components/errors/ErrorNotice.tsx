import { useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  ApiError,
  parseRawApiError,
  reportApiError,
  type ApiErrorKind,
  type ParsedApiError,
} from '../../lib/apiError'
import { isBillingError, PRICING_PATH } from '../../lib/billingError'
import { useI18n } from '../../i18n'
import { IconAlert, IconClose } from '../ui/Icons'
import './error-notice.css'

/** Mỗi loại lỗi có đúng một câu, tra theo khoá i18n tương ứng trong pack `shell.ts` của mỗi locale. */
const KIND_KEY: Record<ApiErrorKind, string> = {
  ai_auth: 'errors.aiAuth',
  ai_rate_limit: 'errors.aiRateLimit',
  ai_unavailable: 'errors.aiUnavailable',
  billing: 'errors.billing',
  quota: 'errors.quota',
  auth: 'errors.auth',
  not_found: 'errors.notFound',
  validation: 'errors.validation',
  rate_limit: 'errors.rateLimit',
  network: 'errors.network',
  invalid: 'errors.invalid',
  unknown: 'errors.unknown',
}

type Props = {
  /**
   * Lỗi cần báo. Nhận cả `Error` (kể cả `ApiError`), chuỗi thô lưu trong database
   * (`project.error_msg`, `task.error_message`) và `null`.
   *
   * Thành phần **không bao giờ** hiện nguyên văn giá trị này: nó chỉ dùng để gán nhãn
   * loại lỗi rồi in ra console để điều tra.
   */
  error: unknown
  /** Đặt nút thử lại kèm hành động của người dùng. */
  onRetry?: () => void
  /** Gọi thêm khi người dùng đóng khung, để trang xoá lỗi khỏi state. */
  onDismiss?: () => void
  className?: string
  style?: CSSProperties
}

/**
 * Khung thông báo lỗi duy nhất của sản phẩm.
 *
 * Ba điều nó bảo đảm:
 * 1. Người dùng chỉ đọc được câu đã dịch theo loại lỗi, không đọc được lỗi thô.
 * 2. Mã lỗi và request id vẫn còn, nhưng chỉ trong console để điều tra.
 * 3. Có nền, viền, biểu tượng và nút đóng — không phải văn bản trần dán giữa trang.
 */
export default function ErrorNotice({ error, onRetry, onDismiss, className, style }: Props) {
  const { t } = useI18n()
  // Khung bị đóng thì `dismissed` giữ đúng chuỗi lỗi đã đóng; lỗi mới sẽ hiện lại
  // vì giá trị so sánh không khớp.
  const [dismissed, setDismissed] = useState<string | null>(null)
  const logged = useRef<string | null>(null)

  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const text = raw.trim()

  const status = error instanceof ApiError ? error.status : undefined
  const parsed: ParsedApiError | null = text ? parseRawApiError(text, status) : null

  // In ra console đúng một lần cho mỗi chuỗi lỗi. Không dùng `useEffect` với `text` làm
  // phụ thuộc vì bố cục kéo dài xuống danh sách sẽ gọi lại nhiều lần trong một lần render.
  if (text && logged.current !== text) {
    logged.current = text
    reportApiError('error-notice', text, status)
  }

  if (!text || !parsed || dismissed === text) return null

  const needsTopUp = parsed.kind === 'billing' || isBillingError(text)
  const classNames = ['pf-error-notice', className].filter(Boolean).join(' ')

  return (
    <div className={classNames} style={style} role="alert">
      <span className="pf-error-notice-icon" aria-hidden>
        <IconAlert size={18} />
      </span>
      <div className="pf-error-notice-body">
        <strong className="pf-error-notice-title">{t('errors.title')}</strong>
        <p className="pf-error-notice-text">{t(KIND_KEY[parsed.kind])}</p>
        {needsTopUp ? (
          <Link to={PRICING_PATH} className="pf-link pf-error-notice-topup">
            {t('errors.topUp')}
          </Link>
        ) : null}
      </div>
      {onRetry ? (
        <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={onRetry}>
          {t('errors.retry')}
        </button>
      ) : null}
      <button
        type="button"
        className="pf-error-notice-close"
        aria-label={t('errors.dismiss')}
        title={t('errors.dismiss')}
        onClick={() => {
          setDismissed(text)
          onDismiss?.()
        }}
      >
        <IconClose size={16} />
      </button>
    </div>
  )
}