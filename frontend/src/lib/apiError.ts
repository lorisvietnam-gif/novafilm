import { notifyBillingErrorIfNeeded } from './billingError'

/** Phân tích `detail` của FastAPI rồi ném lỗi; 402 / hết số dư thì bật hướng dẫn nạp tiền */
export function throwApiError(status: number, detail: unknown, fallback = 'Yêu cầu thất bại'): never {
  const message =
    typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join('; ')
        : fallback
  const finalMessage = message || fallback
  notifyBillingErrorIfNeeded(status, finalMessage)
  throw new Error(finalMessage)
}
