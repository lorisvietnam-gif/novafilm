/**
 * Trạng thái rỗng dùng chung: một tấm ảnh phong cách làm nền trang trí, phủ lớp
 * làm dịu, rồi đặt thông điệp lên trên.
 *
 * Vì sao dùng ảnh thật: một ô trống xám khiến người dùng tưởng trang bị lỗi. Một
 * khung hình có bố cục đẹp gợi đúng thứ họ sắp tạo ra, đọc như "chưa có gì ở
 * đây" thay vì "không tải được".
 *
 * Ảnh ở đây thuần trang trí, nên `alt=""` và `aria-hidden`. Nội dung thật của ô rỗng
 * vẫn là văn bản, nên trình đọc màn hình không mất gì.
 */

import type { ReactNode } from 'react'
import { DramaImageStylePreviewImg } from '../drama/DramaImageStylePreviewImg'
import type { ImageStyleId } from '../../lib/dramaImageStyles'
import { cn } from '../../lib/cn'
import './EmptyState.css'

type Props = {
  /** Phong cách của tấm ảnh nền. */
  imageStyle: ImageStyleId
  /** Nội dung thật của ô rỗng. */
  children?: ReactNode
  /** Văn bản hiển thị khi không truyền children. */
  message?: string
  className?: string
  /** Nền tối, dùng khi ô rỗng nằm trong khối nền tối. */
  tone?: 'light' | 'dark'
  /** Bản thấp hơn, cho các ô rỗng nằm trong card công cụ. */
  compact?: boolean
}

export default function EmptyState({
  imageStyle,
  children,
  message,
  className,
  tone = 'light',
  compact = false,
}: Props) {
  return (
    <div
      className={cn(
        'pf-empty-state',
        tone === 'dark' && 'is-dark',
        compact && 'is-compact',
        className,
      )}
    >
      <div className="pf-empty-state__media" aria-hidden>
        <DramaImageStylePreviewImg
          styleId={imageStyle}
          alt=""
          className="pf-empty-state__img"
          loading="lazy"
        />
        <span className="pf-empty-state__scrim" />
      </div>
      <div className="pf-empty-state__body">{children ?? <p>{message}</p>}</div>
    </div>
  )
}
