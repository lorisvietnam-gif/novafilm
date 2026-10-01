/** Ảnh xem trước phong cách hình của AI Drama: bản thu nhỏ, lùi dần về bản gốc */
import { useMemo, useState } from 'react'
import {
  getDramaImageStylePreviewCandidates,
  getDramaImageStyleStillSrc,
  getDramaImageStyleStillSrcSet,
} from '../../lib/dramaImageStylePreviews'
import type { ImageStyleId } from '../../lib/dramaImageStyles'

type Props = {
  styleId: ImageStyleId
  alt?: string
  className?: string
  loading?: 'lazy' | 'eager'
  /**
   * Bề rộng ô hiển thị. Bắt buộc khi `srcSet` dùng mô tả `w`: không có `sizes` thì
   * trình duyệt coi ô là `100vw` và lấy bản lớn nhất.
   *
   * Mặc định cố ý hào phóng — nó chỉ chọn bản 1024, tối đa 161KB, thay vì bản gốc
   * 2560x1440 nặng 230KB-2.8MB. Quá rộng thì tốn vài chục KB; quá hẹp thì ảnh mờ.
   * Chỗ nào đo được bề rộng thật thì truyền `sizes` vào.
   */
  sizes?: string
}

/**
 * Số đo (perf-audit.mjs, 1440x900, Fast 3G, bản build): trước khi có `srcSet`, mỗi ô
 * ở `/tools` nạp bản gốc 2560x1440 — 275KB-667KB cho một ô 398px. Sáu ô là 2.8MB,
 * và LCP của trang là 15.8s vì cái ô ảnh đó chính là phần tử LCP.
 *
 * Ô nào cũng nhỏ hơn 1024px nên bản thu nhỏ là đủ; `width`/`height` giữ tỉ lệ 16:9
 * để ô không dịch chuyểc khi byte về tới.
 */
const DEFAULT_SIZES = '(max-width: 700px) 100vw, 1024px'

const NATURAL: Record<string, { w: number; h: number }> = {
  'cgi-3d-animation': { w: 1024, h: 1024 },
}

// Render ảnh xem trước của phong cách, có nhiều bước lùi
export function DramaImageStylePreviewImg({
  styleId,
  alt = '',
  className,
  loading = 'lazy',
  sizes = DEFAULT_SIZES,
}: Props) {
  const candidates = useMemo(() => getDramaImageStylePreviewCandidates(styleId), [styleId])
  const srcSet = useMemo(() => getDramaImageStyleStillSrcSet(styleId), [styleId])
  const stillSrc = useMemo(() => getDramaImageStyleStillSrc(styleId), [styleId])
  const natural = NATURAL[styleId] ?? { w: 512, h: 288 }
  const [index, setIndex] = useState(0)

  // Bản thu nhỏ hỏng thì rơi về chuỗi lùi của bản gốc, và phải bỏ `srcSet` — trình
  // duyệt sẽ không báo lỗi cho một URL trong `srcSet` nếu `src` vẫn tải được.
  const src =
    stillSrc && index === 0 ? stillSrc : candidates[Math.min(index, candidates.length - 1)]

  return (
    <img
      key={`${styleId}-${index}`}
      src={src}
      srcSet={index === 0 ? srcSet : undefined}
      sizes={index === 0 ? sizes : undefined}
      width={natural.w}
      height={natural.h}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => {
        setIndex((current) => (current < candidates.length - 1 ? current + 1 : current))
      }}
    />
  )
}