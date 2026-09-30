import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type PayBrand = 'alipay' | 'wxpay' | 'unionpay'

type Props = {
  brand: PayBrand
  /** sm dùng trong nút; md dùng ở tiêu đề popup */
  size?: 'sm' | 'md'
  className?: string
}

const BRAND_META: Record<PayBrand, { src: string; alt: LocalizedText }> = {
  alipay: { src: '/payment/alipay.svg', alt: { zh: '支付宝', en: 'Alipay', vi: 'Alipay' } },
  wxpay: { src: '/payment/wechatpay.svg', alt: { zh: '微信支付', en: 'WeChat Pay', vi: 'WeChat Pay' } },
  unionpay: { src: '/payment/unionpay.svg', alt: { zh: '银联支付', en: 'UnionPay', vi: 'UnionPay' } },
}

/** Icon thương hiệu của kênh thanh toán */
export default function PaymentBrandIcon({ brand, size = 'sm', className = '' }: Props) {
  const lt = useLocalizedText()
  const meta = BRAND_META[brand]
  return (
    <img
      src={meta.src}
      alt={lt(meta.alt)}
      className={`pf-pay-brand-icon is-${size}${className ? ` ${className}` : ''}`}
      width={size === 'md' ? 28 : 22}
      height={size === 'md' ? 28 : 22}
      loading="lazy"
      decoding="async"
    />
  )
}
