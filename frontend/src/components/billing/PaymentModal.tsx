import { useEffect, useEffectEvent, useState } from 'react'
import QRCode from 'qrcode'
import Modal from '../ui/Modal'
import PaymentBrandIcon from './PaymentBrandIcon'
import { api } from '../../api'
import { useLocalizedText } from '../../lib/useLocalizedText'
import { localized, type LocalizedText } from '../../lib/localeStrings'

export type PayCheckout = {
  out_trade_no: string
  sku_id: string
  sku_name: string
  pay_type: 'alipay' | 'wxpay' | string
  amount_fen: number
  credit_fen: number
  /** qr = quét mã trong popup; redirect = mở tab thu ngân mới */
  pay_mode?: 'qr' | 'redirect' | string
  qr_payload: string
  payurl?: string
  img?: string
  expire_seconds?: number
}

type Props = {
  open: boolean
  checkout: PayCheckout | null
  onClose: () => void
  onPaid: () => void
}

const COPY: Record<string, LocalizedText> = {
  noPayUrl: {
    zh: '未获取到支付链接，请稍后重试',
    en: 'No payment link came back. Please try again in a moment.',
    vi: 'Không nhận được liên kết thanh toán. Vui lòng thử lại sau ít phút.',
  },
  noQr: {
    zh: '未获取到支付二维码，请稍后重试',
    en: 'No payment QR code came back. Please try again in a moment.',
    vi: 'Không nhận được mã QR thanh toán. Vui lòng thử lại sau ít phút.',
  },
  qrFailed: { zh: '二维码生成失败', en: 'Could not build the QR code', vi: 'Không tạo được mã QR' },
  notDetectedRedirect: {
    zh: '尚未检测到支付结果，请在支付页完成后再试',
    en: 'No payment detected yet. Finish it on the payment page, then try again.',
    vi: 'Chưa ghi nhận kết quả thanh toán. Hãy hoàn tất ở trang thanh toán rồi thử lại.',
  },
  notDetected: {
    zh: '尚未检测到支付结果，请稍后再试或继续扫码',
    en: 'No payment detected yet. Try again shortly, or keep scanning.',
    vi: 'Chưa ghi nhận kết quả thanh toán. Thử lại sau ít phút hoặc tiếp tục quét mã.',
  },
  queryFailed: { zh: '查询失败', en: 'Could not check the order', vi: 'Không kiểm tra được đơn hàng' },
  titleAlipay: { zh: '支付宝支付', en: 'Pay with Alipay', vi: 'Thanh toán qua Alipay' },
  titleWx: { zh: '微信支付', en: 'Pay with WeChat Pay', vi: 'Thanh toán qua WeChat Pay' },
  titleAlipayQr: { zh: '支付宝扫码支付', en: 'Scan to pay with Alipay', vi: 'Quét mã để thanh toán qua Alipay' },
  titleWxQr: { zh: '微信扫码支付', en: 'Scan to pay with WeChat Pay', vi: 'Quét mã để thanh toán qua WeChat Pay' },
  tipRedirect: {
    zh: '已打开易支付页面，请在新窗口完成支付；完成后返回本页等待到账',
    en: 'The payment page opened in a new window. Finish there, then come back and leave this tab open until it confirms.',
    vi: 'Trang thanh toán đã mở ở cửa sổ mới. Hãy hoàn tất ở đó, rồi quay lại và để nguyên thẻ này chờ xác nhận.',
  },
  tipAlipay: { zh: '请使用支付宝扫码完成支付', en: 'Scan the code with Alipay to pay', vi: 'Quét mã bằng Alipay để thanh toán' },
  tipWx: { zh: '请使用微信扫码完成支付', en: 'Scan the code with WeChat to pay', vi: 'Quét mã bằng WeChat để thanh toán' },
  close: { zh: '关闭', en: 'Close', vi: 'Đóng' },
  credited: { zh: '到账 ¥{amount}', en: 'Adds ¥{amount} to your balance', vi: 'Cộng ¥{amount} vào số dư' },
  payAmount: { zh: '支付金额', en: 'Amount to pay', vi: 'Số tiền thanh toán' },
  cashierOpened: {
    zh: '支付页已在新窗口打开',
    en: 'The payment page opened in a new window',
    vi: 'Trang thanh toán đã mở ở cửa sổ mới',
  },
  reopenCashier: { zh: '重新打开支付页', en: 'Open the payment page again', vi: 'Mở lại trang thanh toán' },
  qrAlt: { zh: '支付二维码', en: 'Payment QR code', vi: 'Mã QR thanh toán' },
  qrLoading: { zh: '二维码加载中…', en: 'Loading the QR code…', vi: 'Đang tải mã QR…' },
  orderInvalid: {
    zh: '订单已失效，请关闭后重新下单',
    en: 'This order has expired. Close it and place a new one.',
    vi: 'Đơn hàng đã hết hạn. Hãy đóng lại và đặt đơn mới.',
  },
  qrInvalid: {
    zh: '二维码已失效，请关闭后重新下单',
    en: 'This QR code has expired. Close it and place a new one.',
    vi: 'Mã QR đã hết hạn. Hãy đóng lại và đặt đơn mới.',
  },
  payWithinRedirect: {
    zh: '请在 {time} 内完成支付',
    en: 'Finish paying within {time}',
    vi: 'Hoàn tất thanh toán trong {time}',
  },
  qrExpiresIn: {
    zh: '二维码将在 {time} 后失效',
    en: 'This QR code expires in {time}',
    vi: 'Mã QR hết hạn sau {time}',
  },
  paid: { zh: '支付成功，余额即将更新', en: 'Paid. Your balance will update shortly.', vi: 'Thanh toán xong, số dư sẽ cập nhật ngay.' },
  timedOut: { zh: '订单已超时', en: 'The order timed out', vi: 'Đơn hàng đã quá hạn' },
  waiting: { zh: '等待支付结果，请勿关闭页面', en: 'Waiting for the payment result. Do not close this page.', vi: 'Đang chờ kết quả thanh toán. Đừng đóng trang này.' },
  cancelPay: { zh: '取消支付', en: 'Cancel payment', vi: 'Huỷ thanh toán' },
  confirming: { zh: '确认中…', en: 'Checking…', vi: 'Đang kiểm tra…' },
  creditedShort: { zh: '已到账', en: 'Balance updated', vi: 'Đã vào số dư' },
  donePaying: { zh: '我已完成支付', en: 'I have paid', vi: 'Tôi đã thanh toán' },
  secureLine: {
    zh: '支付由易支付安全提供，到账以系统通知为准',
    en: 'Payments are secured by the cashier provider. Your balance updates once the system confirms.',
    vi: 'Thanh toán được bảo vệ bởi nhà cung cấp thu ngân. Số dư cập nhật khi hệ thống xác nhận.',
  },
}

function yuan(fen: number) {
  return (fen / 100).toFixed(2)
}

function formatRemain(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Popup quét mã thanh toán: hiện mã QR hoặc chờ tab thu ngân, đồng thời poll trạng thái đơn */
export default function PaymentModal({ open, checkout, onClose, onPaid }: Props) {
  const lt = useLocalizedText()
  /*
   * qrDataUrl data URL của mã QR
   * remain số giây còn lại
   * status văn bản trạng thái hiện tại
   * checking đang xác nhận thủ công
   */
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [remain, setRemain] = useState(300)
  const [status, setStatus] = useState<'waiting' | 'paid' | 'expired'>('waiting')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  const handlePaid = useEffectEvent(() => {
    onPaid()
  })

  /** Huỷ thanh toán: đóng popup, và cố gắng chuyển đơn chờ thanh toán thành closed */
  async function handleCancel() {
    const tradeNo = checkout?.out_trade_no
    if (tradeNo && status !== 'paid') {
      try {
        await api.closeBillingOrder(tradeNo)
      } catch {
        /* bỏ qua lỗi đóng đơn, vẫn cho phép thoát popup */
      }
    }
    onClose()
  }

  /** Mở lại trang thu ngân ở tab mới (khi Alipay không có mã gốc) */
  function openCashier() {
    const url = (checkout?.payurl || '').trim()
    if (!url) {
      setError(localized(COPY.noPayUrl))
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    if (!open || !checkout) return
    /*
     * expiredAt  dấu thời điểm hết hạn
     * isRedirect  có phải chế độ chuyển hướng tới thu ngân không
     * payload     nội dung cần mã hoá thành QR
     */
    const expiredAt = Date.now() + (checkout.expire_seconds ?? 300) * 1000
    const payurl = (checkout.payurl || '').trim()
    const isRedirect = checkout.pay_mode === 'redirect' || (!checkout.qr_payload && !!payurl)
    setRemain(checkout.expire_seconds ?? 300)
    setStatus('waiting')
    setError('')
    setChecking(false)
    setQrDataUrl('')

    const payload = checkout.qr_payload || checkout.img || ''
    let cancelled = false

    async function paintQr() {
      if (isRedirect) {
        // Không có mã QR gốc: mở thẳng trang thu ngân, popup chỉ chờ số dư về
        if (!cancelled && payurl) {
          window.open(payurl, '_blank', 'noopener,noreferrer')
        }
        return
      }
      if (!payload) {
        setQrDataUrl('')
        // Trong effect thì đọc locale bằng localized(): effect không phải output render,
        // và thêm `lt` vào deps sẽ khởi động lại toàn bộ vòng poll mỗi lần đổi ngôn ngữ.
        setError(localized(COPY.noQr))
        return
      }
      // Nếu cổng trả thẳng URL ảnh thì dùng luôn
      if (/^https?:\/\//i.test(payload) && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(payload)) {
        if (!cancelled) setQrDataUrl(payload)
        return
      }
      try {
        const url = await QRCode.toDataURL(payload, {
          width: 220,
          margin: 2,
          color: { dark: '#111318', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        })
        if (!cancelled) setQrDataUrl(url)
      } catch {
        if (!cancelled) setError(localized(COPY.qrFailed))
      }
    }

    void paintQr()

    const tick = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((expiredAt - Date.now()) / 1000))
      setRemain(left)
      if (left <= 0) {
        setStatus('expired')
        window.clearInterval(tick)
        // Hết đồng hồ: backend tự đóng (gọi thêm một lần để dọn đơn quá hạn)
        void api.getBillingOrder(checkout.out_trade_no).catch(() => undefined)
      }
    }, 250)

    const poll = window.setInterval(async () => {
      if (!checkout.out_trade_no) return
      try {
        const order = await api.getBillingOrder(checkout.out_trade_no)
        if (order.status === 'paid') {
          setStatus('paid')
          window.clearInterval(poll)
          window.clearInterval(tick)
          handlePaid()
        } else if (order.status === 'closed') {
          setStatus('expired')
          window.clearInterval(poll)
          window.clearInterval(tick)
        }
      } catch {
        /* bỏ qua lỗi poll tạm thời */
      }
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(tick)
      window.clearInterval(poll)
    }
  }, [open, checkout])

  async function confirmPaid() {
    if (!checkout) return
    setChecking(true)
    setError('')
    try {
      const order = await api.getBillingOrder(checkout.out_trade_no)
      if (order.status === 'paid') {
        setStatus('paid')
        // Gọi trực tiếp ở event handler, không phải trong effect, nên không cần useEffectEvent
        onPaid()
      } else {
        setError(lt(checkout.pay_mode === 'redirect' ? COPY.notDetectedRedirect : COPY.notDetected))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : lt(COPY.queryFailed))
    } finally {
      setChecking(false)
    }
  }

  if (!checkout) return null

  const isAlipay = checkout.pay_type === 'alipay'
  const isRedirect = checkout.pay_mode === 'redirect' || (!checkout.qr_payload && !!checkout.payurl)
  const title = isRedirect
    ? isAlipay
      ? lt(COPY.titleAlipay)
      : lt(COPY.titleWx)
    : isAlipay
      ? lt(COPY.titleAlipayQr)
      : lt(COPY.titleWxQr)
  const tip = isRedirect
    ? lt(COPY.tipRedirect)
    : isAlipay
      ? lt(COPY.tipAlipay)
      : lt(COPY.tipWx)

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={status !== 'waiting'}
      className="pf-pay-modal"
      size="md"
    >
      <div className="pf-pay-sheet">
        <header className="pf-pay-sheet-head">
          <div className="pf-pay-sheet-title">
            <PaymentBrandIcon brand={isAlipay ? 'alipay' : 'wxpay'} size="md" />
            <strong>{title}</strong>
          </div>
          <button type="button" className="pf-pay-sheet-close" onClick={() => void handleCancel()} aria-label={lt(COPY.close)}>
            ×
          </button>
        </header>

        <div className="pf-pay-sku-box">
          <strong>{checkout.sku_name}</strong>
          <span>{lt(COPY.credited).replace('{amount}', yuan(checkout.credit_fen))}</span>
        </div>

        <div className="pf-pay-amount">
          <span>{lt(COPY.payAmount)}</span>
          <em>¥{yuan(checkout.amount_fen)}</em>
        </div>

        <div className="pf-pay-qr-wrap">
          {isRedirect ? (
            <div className="pf-pay-qr is-empty pf-pay-redirect-box">
              <p>{lt(COPY.cashierOpened)}</p>
              <button type="button" className="pf-pay-btn primary" onClick={openCashier}>
                {lt(COPY.reopenCashier)}
              </button>
            </div>
          ) : qrDataUrl ? (
            <div className="pf-pay-qr">
              <img src={qrDataUrl} alt={lt(COPY.qrAlt)} width={220} height={220} />
              <span className={`pf-pay-qr-badge ${isAlipay ? 'alipay' : 'wxpay'}`} aria-hidden />
            </div>
          ) : (
            <div className="pf-pay-qr is-empty">{error || lt(COPY.qrLoading)}</div>
          )}
          <p className="pf-pay-tip">{tip}</p>
          <p className={`pf-pay-expire${status === 'expired' ? ' is-expired' : ''}`}>
            <span className="pf-pay-clock" aria-hidden />
            {status === 'expired'
              ? isRedirect
                ? lt(COPY.orderInvalid)
                : lt(COPY.qrInvalid)
              : isRedirect
                ? lt(COPY.payWithinRedirect).replace('{time}', formatRemain(remain))
                : lt(COPY.qrExpiresIn).replace('{time}', formatRemain(remain))}
          </p>
          <p className={`pf-pay-wait${status === 'paid' ? ' is-paid' : ''}`}>
            <span className="pf-pay-dot" aria-hidden />
            {status === 'paid'
              ? lt(COPY.paid)
              : status === 'expired'
                ? lt(COPY.timedOut)
                : lt(COPY.waiting)}
          </p>
        </div>

        {error ? <p className="pf-error pf-pay-error">{error}</p> : null}

        <div className="pf-pay-actions">
          <button type="button" className="pf-pay-btn ghost" onClick={() => void handleCancel()}>
            {lt(COPY.cancelPay)}
          </button>
          <button
            type="button"
            className="pf-pay-btn primary"
            disabled={checking || status === 'paid' || status === 'expired'}
            onClick={() => void confirmPaid()}
          >
            {checking ? lt(COPY.confirming) : status === 'paid' ? lt(COPY.creditedShort) : lt(COPY.donePaying)}
          </button>
        </div>

        <p className="pf-pay-secure-line">
          <span className="pf-pay-shield" aria-hidden />
          {lt(COPY.secureLine)}
        </p>
      </div>
    </Modal>
  )
}
