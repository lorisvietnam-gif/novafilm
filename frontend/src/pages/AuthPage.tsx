import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { OAuthProvider } from '../api'
import BrandMark from '../components/BrandMark'
import LanguageSwitch from '../components/layout/LanguageSwitch'
import { useI18n } from '../i18n'
import {
  oauthErrorKey,
  readOAuthCallback,
  rememberOAuthChoice,
  takeOAuthChoice,
  OAUTH_CODE_QUERY,
  OAUTH_ERROR_QUERY,
  OAUTH_SETUP_QUERY,
} from '../lib/oauthCallback'
import { isValidAuthPassword, isValidEmailInput } from '../lib/validateAuthForm'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'oauthSetup'

// Chỉ cho phép quay lại bằng đường dẫn tương đối trong cùng site, để chặn open redirect
function safeNextPath(raw: string | null, fallback = '/') {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return fallback
  return raw
}

// Chế độ Auth khởi tạo lấy từ ?mode= / ?token= trên URL
function modeFromParams(params: URLSearchParams): AuthMode {
  const mode = (params.get('mode') || '').toLowerCase()
  if (mode === 'reset' || params.get('token')) return 'reset'
  if (mode === 'forgot') return 'forgot'
  if (mode === 'register') return 'register'
  return 'login'
}

export default function AuthPage() {
  const nav = useNavigate()
  const { t } = useI18n()
  const [params, setSearchParams] = useSearchParams()
  const nextPath = safeNextPath(params.get('next'), '/')
  /*
   * mode        chế độ form hiện tại
   * email / password / confirmPassword / nickname  các trường của form
   * notice      thông báo thành công (đã gửi email khôi phục, đã đặt lại mật khẩu)
   * error / loading  trạng thái đang gửi
   */
  const [mode, setMode] = useState<AuthMode>(() => modeFromParams(params))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const resetToken = (params.get('token') || '').trim()

  /*
   * Nút xã hội: danh sách lấy từ GET /api/auth/providers, không hard-code. Backend chỉ
   * liệt kê provider đã có đủ client_id + client_secret, nên không bao giờ có nút chết.
   * `providersLoaded` tách "chưa hỏi" khỏi "hỏi rồi, rỗng" để không nháy dòng chờ.
   */
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [pendingProvider, setPendingProvider] = useState('')
  // Nhánh B: provider không cho email, cần điền thêm trước khi có JWT.
  const [setupToken, setSetupToken] = useState('')
  const [setupProviderLabel, setSetupProviderLabel] = useState('')
  // Điểm đến đã nhớ trước khi rời trang; nhánh setup dùng lại sau khi điền form.
  const [setupNext, setSetupNext] = useState('')
  // Callback xử lý đúng một lần cho mỗi lần quay về từ backend.
  const handledCallback = useRef(false)

  useEffect(() => {
    let cancelled = false
    api
      .oauthProviders()
      .then((res) => {
        if (cancelled) return
        setProviders(Array.isArray(res.providers) ? res.providers : [])
      })
      .catch(() => {
        // Không hỏi được thì cũng không hiện nút: im lặng hơn là hiện nút chết.
        if (!cancelled) setProviders([])
      })
      .finally(() => {
        if (!cancelled) setProvidersLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Callback từ backend: hoặc `?oauth_code=`, hoặc `?oauth_error=`.
   * Mọi nhánh đều đưa người dùng về một trạng thái nhìn thấy được — không màn hình trắng.
   */
  useEffect(() => {
    if (handledCallback.current) return
    const callback = readOAuthCallback(params)
    if (!callback) return
    handledCallback.current = true

    // Dọn query ngay để tải lại trang không đổi mã hai lần (mã chỉ dùng một lần).
    const clean = new URLSearchParams(params)
    clean.delete(OAUTH_CODE_QUERY)
    clean.delete(OAUTH_ERROR_QUERY)
    clean.delete(OAUTH_SETUP_QUERY)
    setSearchParams(clean, { replace: true })

    if (callback.kind === 'error') {
      setMode('login')
      setError(t(oauthErrorKey(callback.code)))
      return
    }

    const choice = takeOAuthChoice()
    setSetupNext(choice.next || nextPath)
    const label = providers.find((p) => p.id === choice.providerId)?.label || ''
    setSetupProviderLabel(label)

    if (callback.setupRequired) {
      setSetupToken(callback.code)
      setMode('oauthSetup')
      setNotice('')
      setError('')
      return
    }

    setNotice(t('auth.oauthFinishing'))
    api
      .oauthExchange(callback.code)
      .then((res) => {
        if (res.setup_required && res.setup_token) {
          setSetupToken(res.setup_token)
          setMode('oauthSetup')
          setNotice('')
          return
        }
        if (!res.access_token) throw new Error(t('auth.oauthErrorGeneric'))
        localStorage.setItem('token', res.access_token)
        nav(choice.next || nextPath)
      })
      .catch(() => {
        setMode('login')
        setNotice('')
        setError(t('auth.oauthErrorGeneric'))
      })
  }, [params, nextPath, nav, setSearchParams, t, providers])

  // Bắt đầu luồng: nhớ điểm đến rồi để backend tự phát state + PKCE và 302 sang provider.
  function startOAuth(provider: OAuthProvider) {
    rememberOAuthChoice(nextPath, provider.id)
    setPendingProvider(provider.id)
    window.location.assign(api.oauthLoginUrl(provider.id))
  }

  // Đổi chế độ và đồng bộ URL, giữ lại tham số next
  function switchMode(next: AuthMode) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
    if (next === 'oauthSetup') setSetupToken('')
    if (next === 'register') setNickname('')
    const nextParams = new URLSearchParams()
    if (nextPath && nextPath !== '/') nextParams.set('next', nextPath)
    if (next === 'forgot') nextParams.set('mode', 'forgot')
    else if (next === 'reset' && resetToken) {
      nextParams.set('mode', 'reset')
      nextParams.set('token', resetToken)
    }     else if (next === 'register') nextParams.set('mode', 'register')
    // oauthSetup chỉ tồn tại trong RAM: setup token nằm trong state, không nên lên URL.
    setSearchParams(nextParams, { replace: true })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')

    if (mode === 'forgot') {
      const trimmedEmail = email.trim()
      if (!isValidEmailInput(trimmedEmail)) {
        setError(t('auth.emailInvalid'))
        return
      }
      setLoading(true)
      try {
        const res = await api.forgotPassword(trimmedEmail)
        setNotice(res.message || t('auth.forgotSent'))
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.fail'))
      } finally {
        setLoading(false)
      }
      return
    }

    if (mode === 'reset') {
      if (!resetToken) {
        setError(t('auth.resetTokenMissing'))
        return
      }
      if (!isValidAuthPassword(password)) {
        setError(password.length > 64 ? t('auth.passwordTooLong') : t('auth.passwordTooShort'))
        return
      }
      if (password !== confirmPassword) {
        setError(t('auth.passwordMismatch'))
        return
      }
      setLoading(true)
      try {
        await api.resetPassword(resetToken, password)
        setPassword('')
        setConfirmPassword('')
        switchMode('login')
        setNotice(t('auth.resetSuccess'))
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.fail'))
      } finally {
        setLoading(false)
      }
      return
    }

    if (mode === 'oauthSetup') {
      if (!setupToken) {
        switchMode('login')
        setError(t('auth.oauthErrorStateInvalid'))
        return
      }
      const trimmedEmail = email.trim()
      if (!isValidEmailInput(trimmedEmail)) {
        setError(t('auth.emailInvalid'))
        return
      }
      if (!isValidAuthPassword(password)) {
        setError(password.length > 64 ? t('auth.passwordTooLong') : t('auth.passwordTooShort'))
        return
      }
      if (password !== confirmPassword) {
        setError(t('auth.passwordMismatch'))
        return
      }
      setLoading(true)
      try {
        const res = await api.oauthSetup({
          setup_token: setupToken,
          email: trimmedEmail,
          password,
          nickname: nickname.trim(),
        })
        localStorage.setItem('token', res.access_token)
        nav(setupNext || nextPath)
      } catch (err) {
        // `detail` của endpoint này là tiếng Trung, không đưa ra giao diện.
        console.error('[auth] oauth setup failed', err)
        setError(t('auth.oauthSetupFailed'))
      } finally {
        setLoading(false)
      }
      return
    }

    const trimmedEmail = email.trim()
    if (mode === 'register' && !nickname.trim()) {
      setError(t('auth.nicknameRequired'))
      return
    }
    if (!isValidEmailInput(trimmedEmail)) {
      setError(t('auth.emailInvalid'))
      return
    }
    if (!isValidAuthPassword(password)) {
      setError(password.length > 64 ? t('auth.passwordTooLong') : t('auth.passwordTooShort'))
      return
    }

    setLoading(true)
    try {
      const res =
        mode === 'login'
          ? await api.login(trimmedEmail, password)
          : await api.register(trimmedEmail, password, nickname.trim())
      localStorage.setItem('token', res.access_token)
      nav(nextPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.fail'))
    } finally {
      setLoading(false)
    }
  }

  const title =
    mode === 'login'
      ? t('auth.loginTitle')
      : mode === 'register'
        ? t('auth.registerTitle')
        : mode === 'forgot'
          ? t('auth.forgotTitle')
          : mode === 'oauthSetup'
            ? t('auth.oauthSetupTitle')
            : t('auth.resetTitle')

  const submitLabel =
    mode === 'login'
      ? t('auth.login')
      : mode === 'register'
        ? t('auth.register')
        : mode === 'forgot'
          ? t('auth.sendReset')
          : mode === 'oauthSetup'
            ? t('auth.register')
            : t('auth.savePassword')

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-panel-top">
          <BrandMark />
          <LanguageSwitch />
        </div>
        <h1>{title}</h1>
        {mode === 'oauthSetup' && (
          <p className="lede">
            {setupProviderLabel
              ? t('auth.oauthSetupLede', { provider: setupProviderLabel })
              : t('auth.oauthSetupLedeUnknown')}
          </p>
        )}
        <form onSubmit={onSubmit} className="stack" noValidate>
          {(mode === 'register' || mode === 'oauthSetup') && (
            <label>
              {t('auth.nickname')}
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </label>
          )}
          {(mode === 'login' || mode === 'register' || mode === 'forgot' || mode === 'oauthSetup') && (
            <label>
              {t('auth.email')}
              <input
                type="email"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError('')
                }}
              />
            </label>
          )}
          {(mode === 'login' || mode === 'register' || mode === 'reset' || mode === 'oauthSetup') && (
            <label>
              {mode === 'reset' ? t('auth.newPassword') : t('auth.password')}
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
              />
            </label>
          )}
          {(mode === 'reset' || mode === 'oauthSetup') && (
            <label>
              {t('auth.confirmPassword')}
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (error) setError('')
                }}
              />
            </label>
          )}
          {notice ? <p className="auth-notice" role="status">{notice}</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="btn primary" disabled={loading}>
            {loading ? t('auth.processing') : submitLabel}
          </button>
        </form>
        {/* Nút xã hội chỉ hiện ở chế độ đăng nhập / đăng ký, và chỉ theo provider backend trả về. */}
        {providersLoaded && (mode === 'login' || mode === 'register') && (
          <div className="auth-oauth">
            <p className="auth-oauth-divider">{t('auth.oauthDivider')}</p>
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className="btn"
                disabled={Boolean(pendingProvider)}
                onClick={() => startOAuth(provider)}
              >
                {pendingProvider === provider.id
                  ? t('auth.oauthConnecting', { provider: provider.label })
                  : provider.label}
              </button>
            ))}
            {providers.length === 0 && <p className="auth-oauth-note">{t('auth.oauthPending')}</p>}
          </div>
        )}
        {mode === 'oauthSetup' && (
          <button type="button" className="linkish" onClick={() => switchMode('login')}>
            {t('auth.backToLogin')}
          </button>
        )}
        {mode === 'login' && (
          <button type="button" className="linkish" onClick={() => switchMode('forgot')}>
            {t('auth.forgotLink')}
          </button>
        )}
        {(mode === 'login' || mode === 'register') && (
          <button
            type="button"
            className="linkish"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
          </button>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <button type="button" className="linkish" onClick={() => switchMode('login')}>
            {t('auth.backToLogin')}
          </button>
        )}
      </div>
      <div className="auth-visual" aria-hidden>
        <div className="ink-wash" />
      </div>
    </div>
  )
}
