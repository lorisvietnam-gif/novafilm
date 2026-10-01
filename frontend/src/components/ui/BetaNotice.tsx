/**
 * Thông báo beta: bản này tạo prompt, chưa render video trong hệ thống.
 *
 * Vì sao có: slogan ở đầu trang nói về ý nghĩa sản phẩm nên giữ nguyên, nhưng nơi
 * người dùng **bấm** thì phải nói thật chuyện gì sẽ xảy ra. Bấm «Tạo» mà không có
 * phim thì người dùng nghĩ phần mềm hỏng — dù slogan có đẹp đến đâu. Vì vậy dòng
 * này đứng ngay cạnh nút, và xuất hiện **trước** lần bấm, không phải sau khi thất bại.
 *
 * Đóng được và nhớ trạng thái, nhưng khoá ghi nhớ tách theo `placement`: đóng ở
 * trang chủ không được phép làm mất cảnh báo ở chỗ bấm tạo, vì đó mới là chỗ người
 * dùng dễ bỏ qua nhất.
 *
 * Văn bản lấy từ `i18n/locales/**` nên đủ cả ba ngôn ngữ; `zh` là hợp đồng kiểu nên
 * thiếu khoá là `tsc` báo lỗi.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Info, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import './BetaNotice.css'

/** Mỗi nơi đặt thông báo một khoá riêng, để đóng một chỗ không tắt chỗ khác. */
const STORAGE_PREFIX = 'novafilm.beta-notice.dismissed.'

function readDismissed(placement: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + placement) === '1'
  } catch {
    return false
  }
}

function writeDismissed(placement: string, dismissed: boolean): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + placement, dismissed ? '1' : '0')
  } catch {
    /* Khoá riêng tư có thể bị chặn; thông báo vẫn hiện, chỉ mất trạng thái đã đóng. */
  }
}

type BetaNoticeProps = {
  /** Tên nơi đặt; cũng là khoá ghi nhớ trạng thái đã đóng. */
  placement: string
  /** `banner` ở trang chủ, `inline` sát nút, `compact` cho bảng nổi hẹp. */
  variant?: 'banner' | 'inline' | 'compact'
  className?: string
}

/**
 * Dòng cảnh báo trước khi bấm. Trả `null` khi người dùng đã đóng ở nơi này.
 *
 * `compact` không cho đóng: nó nằm trong bảng nổi 400px trên canvas, bảng này mở
 * lại mỗi lần chọn node nên coi như chưa từng đóng được. Giữ nó lại là điều kiện
 * để người dùng luôn đọc được trước lần bấm.
 */
export function BetaNotice({ placement, variant = 'banner', className }: BetaNoticeProps) {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(() => readDismissed(placement))

  useEffect(() => {
    writeDismissed(placement, dismissed)
  }, [placement, dismissed])

  const dismiss = useCallback(() => setDismissed(true), [])

  if (dismissed) return null

  const isCompact = variant === 'compact'

  return (
    <aside
      className={`pf-beta-notice${variant === 'inline' ? ' is-inline' : ''}${isCompact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      role="note"
    >
      <span className="pf-beta-notice-icon" aria-hidden>
        <Info size={16} strokeWidth={2} />
      </span>
      <div className="pf-beta-notice-text">
        <strong className="pf-beta-notice-title">{t('betaNotice.title')}</strong>
        <p className="pf-beta-notice-body">{t(isCompact ? 'betaNotice.inlineBody' : 'betaNotice.body')}</p>
        {!isCompact ? <p className="pf-beta-notice-model">{t('betaNotice.modelNote')}</p> : null}
      </div>
      {isCompact ? null : (
        <button
          type="button"
          className="pf-beta-notice-dismiss"
          onClick={dismiss}
          title={t('betaNotice.dismiss')}
        >
          <X size={16} strokeWidth={2} aria-hidden />
          <span className="pf-beta-notice-dismiss-text">{t('betaNotice.dismiss')}</span>
        </button>
      )}
    </aside>
  )
}

/**
 * Sao chép văn bản, có đường lùi khi Clipboard API bị chặn.
 *
 * Nút sao chép là đường thoát chính của bản beta này — người dùng mang prompt đi
 * dùng ở công cụ khác — nên nó không được chỉ dựa vào `navigator.clipboard`, vốn
 * cần ngữ cảnh bảo mật và sẽ hỏng trên HTTP.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* Rơi xuống đường lùi bên dưới. */
    }
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

type BetaPromptResultProps = {
  /** Prompt vừa tạo; đây là thứ người dùng mang đi. */
  prompt: string
  className?: string
}

/**
 * Kết quả sau khi bấm: nói thẳng là **prompt**, không phải video, và đưa nút sao
 * chép ngay cạnh. Không dùng từ nào gợi ý đã có phim.
 */
export function BetaPromptResult({ prompt, className }: BetaPromptResultProps) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const copy = useCallback(async () => {
    const ok = await copyToClipboard(prompt)
    setState(ok ? 'copied' : 'failed')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2400)
  }, [prompt])

  return (
    <div
      className={`pf-beta-result${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="pf-beta-result-head">
        <strong>{t('betaNotice.generatedTitle')}</strong>
        <button type="button" className="pf-beta-result-copy" onClick={() => void copy()}>
          {state === 'copied' ? (
            <Check size={14} strokeWidth={2.2} aria-hidden />
          ) : (
            <Copy size={14} strokeWidth={2} aria-hidden />
          )}
          {state === 'copied' ? t('betaNotice.copied') : t('betaNotice.copy')}
        </button>
      </div>
      <p className="pf-beta-result-note">{t('betaNotice.generatedBody')}</p>
      {state === 'failed' ? (
        <p className="pf-beta-result-failed">{t('betaNotice.copyFailed')}</p>
      ) : null}
      <pre className="pf-beta-result-prompt">{prompt}</pre>
    </div>
  )
}