/**
 * Hợp đồng callback OAuth, đọc từ `backend/app/api/oauth.py`.
 *
 * Backend không dựng URL authorize ở phía trình duyệt và cũng không đưa JWT vào URL.
 * Nó quay về `OAUTH_POST_LOGIN_REDIRECT_URL` (mặc định `/auth`) kèm đúng một trong
 * hai query param:
 *
 *   thành công : ?oauth_code=<mã dùng một lần>  [&oauth_setup_required=1]
 *   thất bại   : ?oauth_error=<mã lỗi cố định>
 *
 * Mã lỗi tới từ `OAuthFlowError.code` / `OAuthIdentityError.code` / hai hằng số
 * `provider_unavailable` và `provider_error` trong chính `oauth.py`. Nguyên văn lỗi từ
 * phía trên có thể chứa access token nên không bao giờ ra khỏi backend.
 */

/** Query param mang mã một lần (hoặc setup token) khi đăng nhập thành công. */
export const OAUTH_CODE_QUERY = 'oauth_code'
/** Query param mang mã lỗi cố định khi đăng nhập hỏng. */
export const OAUTH_ERROR_QUERY = 'oauth_error'
/** Cờ đi kèm `oauth_code`: mã đó là setup token, tài khoản còn thiếu email/mật khẩu. */
export const OAUTH_SETUP_QUERY = 'oauth_setup_required'

/**
 * `?next=` của trang đăng nhập không đi thẳng cho backend.
 *
 * `safe_next_target()` ở backend coi một đường dẫn tương đối bắt đầu bằng `/` là hợp lệ
 * và sẽ dùng nó làm URL quay về — nghĩa là callback đổ thẳng `?oauth_code=` vào
 * `/studio?oauth_code=…`, nơi không có logic xử lý. Ta giữ ý định điểm đến và provider
 * đã bấm ở sessionStorage, rồi luôn để backend quay về trang `/auth` mà nó đã cấu hình.
 */
const CHOICE_STORAGE_KEY = 'novafilm.oauth.choice'

export type OAuthCallback =
  | { kind: 'grant'; code: string; setupRequired: boolean }
  | { kind: 'error'; code: string }
  | null

/** Đọc callback từ query string. `null` = không có callback nào trên URL. */
export function readOAuthCallback(params: URLSearchParams): OAuthCallback {
  const error = (params.get(OAUTH_ERROR_QUERY) || '').trim()
  if (error) return { kind: 'error', code: error }
  const code = (params.get(OAUTH_CODE_QUERY) || '').trim()
  if (code) {
    return {
      kind: 'grant',
      code,
      setupRequired: (params.get(OAUTH_SETUP_QUERY) || '').trim() === '1',
    }
  }
  return null
}

/**
 * Mã lỗi của backend → khoá i18n. Mã lạ (backend thêm mã mới, hoặc URL bị sửa tay) rơi
 * về thông báo chung thay vì in thẳng chuỗi kỹ thuật ra giao diện.
 */
const OAUTH_ERROR_KEYS: Record<string, string> = {
  access_denied: 'auth.oauthErrorAccessDenied',
  state_invalid: 'auth.oauthErrorStateInvalid',
  missing_code: 'auth.oauthErrorMissingCode',
  redirect_invalid: 'auth.oauthErrorRedirectInvalid',
  provider_unavailable: 'auth.oauthErrorProviderUnavailable',
  provider_error: 'auth.oauthErrorProviderFailed',
  service_unavailable: 'auth.oauthErrorServiceUnavailable',
  email_taken: 'auth.oauthErrorEmailTaken',
  identity_conflict: 'auth.oauthErrorIdentityConflict',
}

export function oauthErrorKey(code: string): string {
  return OAUTH_ERROR_KEYS[code] || 'auth.oauthErrorGeneric'
}

export type OAuthChoice = { next: string; providerId: string }

/** Nhớ điểm đến và provider đã bấm, đọc lại đúng một lần rồi xoá. */
export function rememberOAuthChoice(next: string, providerId: string): void {
  try {
    sessionStorage.setItem(CHOICE_STORAGE_KEY, JSON.stringify({ next, providerId }))
  } catch {
    // Trình duyệt chặn storage (chế độ riêng tư): mất thông tin này cũng không nên chặn đăng nhập.
  }
}

export function takeOAuthChoice(): OAuthChoice {
  try {
    const raw = sessionStorage.getItem(CHOICE_STORAGE_KEY) || ''
    sessionStorage.removeItem(CHOICE_STORAGE_KEY)
    const parsed: Partial<OAuthChoice> = JSON.parse(raw)
    return {
      next: typeof parsed.next === 'string' ? parsed.next : '',
      providerId: typeof parsed.providerId === 'string' ? parsed.providerId : '',
    }
  } catch {
    return { next: '', providerId: '' }
  }
}
