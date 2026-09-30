/** Ảnh xem trước phong cách hình của AI Drama: lùi dần jpg → png → static của backend → svg */
import { useMemo, useState } from 'react'
import { getDramaImageStylePreviewCandidates } from '../../lib/dramaImageStylePreviews'
import type { ImageStyleId } from '../../lib/dramaImageStyles'

type Props = {
  styleId: ImageStyleId
  alt?: string
  className?: string
  loading?: 'lazy' | 'eager'
}

// Render ảnh xem trước của phong cách, có nhiều bước lùi
export function DramaImageStylePreviewImg({
  styleId,
  alt = '',
  className,
  loading = 'lazy',
}: Props) {
  const candidates = useMemo(() => getDramaImageStylePreviewCandidates(styleId), [styleId])
  const [index, setIndex] = useState(0)

  return (
    <img
      key={`${styleId}-${index}`}
      src={candidates[Math.min(index, candidates.length - 1)]}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        setIndex((current) => (current < candidates.length - 1 ? current + 1 : current))
      }}
    />
  )
}
