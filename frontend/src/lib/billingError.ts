import { dialog } from './dialog'
import { localized, type LocalizedText } from './localeStrings'

export const PRICING_PATH = '/pricing'

// Các thông báo người dùng đọc. `余额不足` ở regex bên dưới là giá trị backend trả về,
// nên regex giữ nguyên còn chỉ văn bản hiển thị mới dịch.
const COPY: Record<string, LocalizedText> = {
  title: { zh: '余额不足', en: 'Not enough balance', vi: 'Số dư không đủ' },
  message: {
    zh: '当前余额不足以开始生成，请先充值。',
    en: 'Your balance is too low to start generating. Top up first.',
    vi: 'Số dư hiện tại không đủ để bắt đầu tạo. Vui lòng nạp tiền trước.',
  },
  confirm: { zh: '去充值', en: 'Top up', vi: 'Nạp tiền' },
  cancel: { zh: '知道了', en: 'Got it', vi: 'Đã hiểu' },
}

/** Có phải lỗi hết tiền hay bị chặn tính phí không */
export function isBillingError(message: string) {
  return /余额不足|请先充值|402|insufficient_balance/i.test(message)
}

/** Chuyển tới trang bảng giá để nạp tiền */
export function goToTopup() {
  if (typeof window !== 'undefined') {
    window.location.assign(PRICING_PATH)
  }
}

/**
 * Bật hộp thoại báo hết tiền; nếu người dùng chọn nạp tiền thì chuyển tới trang bảng giá.
 * @returns đã xử lý như lỗi tính phí hay chưa
 */
export async function handleBillingError(
  err: unknown,
  navigate?: (path: string) => void,
): Promise<boolean> {
  const message = err instanceof Error ? err.message : String(err || '')
  if (!isBillingError(message)) return false
  const go = await dialog.confirm({
    title: localized(COPY.title),
    message: message || localized(COPY.message),
    confirmText: localized(COPY.confirm),
    cancelText: localized(COPY.cancel),
    tone: 'danger',
  })
  if (go) {
    if (navigate) navigate(PRICING_PATH)
    else goToTopup()
  }
  return true
}

/**
 * Chặn ở tầng API: gặp 402 / hết tiền thì bật hộp thoại hướng tới nạp tiền (không nuốt lỗi gốc).
 */
export function notifyBillingErrorIfNeeded(status: number, message: string) {
  if (status === 402 || isBillingError(message)) {
    void handleBillingError(new Error(message))
  }
}
