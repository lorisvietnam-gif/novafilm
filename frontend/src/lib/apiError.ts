import { notifyBillingErrorIfNeeded } from './billingError'

/**
 * LỐI THÔ từ backend — **một lối duy nhất** để phân loại.
 *
 * Vì sao phải có một chỗ duy nhất: lỗi hiện lên giao diện đến từ **hai** nguồn khác nhau.
 * Một là lỗi HTTP trả về cho `fetch` (`throwApiError`), một là chuỗi đã được backend
 * **ghi vào database** (`projects.error_msg`, `tasks.error_message`) rồi frontend đọc lại
 * và dán thẳng ra trang — đường này không đi qua `throwApiError` nào cả.
 *
 * Trước khi có file này, chuỗi thứ hai đi thẳng lên màn hình, nên trang
 * `/studio/{id}` hiện nguyên văn dòng `LLM error 401: {"error":{...}}`. Vì vậy bộ phân
 * loại phải nhận **chuỗi thô bất kỳ**, không chỉ `detail` của HTTP.
 */
export type ApiErrorKind =
  /** Dịch vụ AI từ chối khoá: `LLM error 401`, `Invalid token`, `API key ...` */
  | 'ai_auth'
  /** Dịch vụ AI bị giới hạn tần suất: `429` từ phía nhà cung cấp */
  | 'ai_rate_limit'
  /** Dịch vụ AI không phản hồi: `5xx` từ nhà cung cấp, quá tải, hết thời gian chờ */
  | 'ai_unavailable'
  /** Hết tiền / thiếu số dư — đi kèm liên kết nạp tiền */
  | 'billing'
  /** Hết lượt của gói, cần nâng cấp hoặc chờ kỳ tính dụng sau */
  | 'quota'
  /** Phiên đăng nhập hết hạn hoặc không có quyền */
  | 'auth'
  /** Không tìm thấy dữ liệu */
  | 'not_found'
  /** Dữ liệu gửi lên không hợp lệ */
  | 'validation'
  /** Bị giới hạn tần suất bởi API của chúng ta */
  | 'rate_limit'
  /** Không kết nối được máy chủ */
  | 'network'
  /** Máy chủ trả về thứ không phải JSON */
  | 'invalid'
  /** Không khớp mẫu nào */
  | 'unknown'

/** Kết quả phân loại. `raw` chỉ dùng để in ra console, tuyệt đối không lên màn hình. */
export type ParsedApiError = {
  kind: ApiErrorKind
  /** Nguyên văn lỗi từ backend. CHỈ để điều tra trong console. */
  raw: string
  /** Mã HTTP của chính API, khi biết */
  status?: number
  /** Dịch vụ bị lỗi trong chuỗi thô, ví dụ `LLM` của `LLM error 401: ...` */
  service?: string
  /** Mã lỗi của chính dịch vụ đó, ví dụ `401` */
  serviceStatus?: number
  /** Định danh yêu cầu để đối chiếu log, ví dụ `request id: 2026...` */
  requestId?: string
}

/** `LLM error 401: <phần còn lại>` — bắt tên dịch vụ và mã lỗi ở đầu chuỗi. */
const SERVICE_ERROR_RE = /^\s*([A-Za-z][A-Za-z0-9 _-]{0,23}?)\s+error\s+(\d{3})\s*:\s*([\s\S]*)$/i
/** `request id: …` / `trace_id=…` — chỉ để in ra console khi điều tra. */
const REQUEST_ID_RE = /\b(?:request[\s_-]?id|req[\s_-]?id|trace[\s_-]?id)\s*[:=]\s*([A-Za-z0-9._-]+)/i

/**
 * Phân loại một chuỗi lỗi thô bất kỳ.
 *
 * Không ném lỗi và không cần `t()`: hàm này chỉ **gán nhãn**, còn câu chữ hiển thị do
 * `ErrorNotice` tra theo `kind`. Nhờ vậy `api.ts` không phụ thuộc i18n và việc thêm
 * ngôn ngữ mới không phải sửa lại tầng API.
 */
export function parseRawApiError(raw: string, status?: number): ParsedApiError {
  const text = (raw || '').trim()
  const out: ParsedApiError = { kind: 'unknown', raw: text, status }

  const service = SERVICE_ERROR_RE.exec(text)
  if (service) {
    out.service = service[1].trim()
    out.serviceStatus = Number(service[2])
    // Phần sau dấu `:` là nơi có thông tin điều tra (request id, payload lỗi của nhà
    // cung cấp); giữ nguyên trong `raw` để console có đủ bối cảnh.
  }

  const requestId = REQUEST_ID_RE.exec(text)
  if (requestId) out.requestId = requestId[1]

  const code = out.serviceStatus ?? status
  const hay = `${text.toLowerCase()} ${(out.service || '').toLowerCase()}`
  const upstream = Boolean(out.service) || out.serviceStatus !== undefined

  if (code === 401 || code === 403) {
    // `401` kèm tên dịch vụ là khoá AI bị từ chối; `401` trần là phiên đăng nhập.
    out.kind =
      upstream || /token|api[\s_-]?key|credential|unauthor|forbidden|令牌|密钥|鉴权|无权限/.test(hay)
        ? 'ai_auth'
        : 'auth'
  } else if (code === 402 || /余额|insufficient|余额不足|số dư|not enough credit/.test(hay)) {
    out.kind = 'billing'
  } else if (code === 429) {
    out.kind = upstream ? 'ai_rate_limit' : 'rate_limit'
  } else if (/quota|plan limit|exceeded/.test(hay)) {
    out.kind = 'quota'
  } else if (code === 404 || /不存在|not found|no such/.test(hay)) {
    out.kind = 'not_found'
  } else if (code === 400 || code === 422) {
    out.kind = 'validation'
  } else if (code !== undefined && code >= 500) {
    out.kind = upstream ? 'ai_unavailable' : 'network'
  } else if (/rate limit|too many requests|频率|并发|超出配额|quota/.test(hay)) {
    out.kind = upstream ? 'ai_rate_limit' : 'rate_limit'
  } else if (/timeout|timed out|econnrefused|failed to fetch|networkerror|超时|网络/.test(hay)) {
    out.kind = 'network'
  } else if (/invalid token|invalid api key|unauthorized/.test(hay)) {
    out.kind = 'ai_auth'
  }
  return out
}

/** Lỗi do API báo. `message` là thô; giao diện phải hiện câu tra theo `kind`, không hiện `message`. */
export class ApiError extends Error {
  readonly status: number
  readonly kind: ApiErrorKind
  readonly raw: string
  readonly service: string | undefined
  readonly serviceStatus: number | undefined
  readonly requestId: string | undefined

  constructor(status: number, message: string, kind?: ApiErrorKind) {
    super(message)
    this.name = 'ApiError'
    const parsed = parseRawApiError(message, status)
    this.status = status
    this.kind = kind || parsed.kind
    this.raw = parsed.raw
    this.service = parsed.service
    this.serviceStatus = parsed.serviceStatus
    this.requestId = parsed.requestId
  }
}

/**
 * In lỗi thô ra console để điều tra, theo đúng một định dạng.
 *
 * Giao diện **không** được hiện phần này. Đây là chỗ duy nhất giữ lại mã lỗi và
 * request id sau khi đã thay bằng câu chữ thân thiện cho người dùng.
 */
export function reportApiError(where: string, raw: string, status?: number): ParsedApiError {
  const parsed = parseRawApiError(raw, status)
  console.error(
    `[${where}] ${parsed.kind}`,
    parsed.service ? `${parsed.service} ${parsed.serviceStatus ?? ''}`.trim() : '',
    {
      raw: parsed.raw,
      status: parsed.status,
      service: parsed.service,
      serviceStatus: parsed.serviceStatus,
      requestId: parsed.requestId,
    },
  )
  return parsed
}

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
  throw new ApiError(status, finalMessage)
}