import type { DramaAsset } from '../api/drama'

/** `type` của tài nguyên chỉ dùng cho canvas, không hiện trong thư viện tài nguyên toàn cục / của dự án */
export const DRAMA_CANVAS_ONLY_ASSET_TYPES = new Set(['video', 'audio', 'text'])

/** Các loại thư viện đã ngừng dùng (tư liệu lịch sử / none không còn hiển thị) */
export const DRAMA_LIBRARY_DISABLED_TYPES = new Set(['material', 'none'])

// Kiểm tra tài nguyên có nên xuất hiện trong thư viện (nhân vật / bối cảnh / đạo cụ / giọng đọc…)
export function isDramaLibraryAsset(asset: DramaAsset): boolean {
  const type = (asset.type || '').toLowerCase()
  if (DRAMA_CANVAS_ONLY_ASSET_TYPES.has(type)) return false
  if (DRAMA_LIBRARY_DISABLED_TYPES.has(type)) return false
  const assetType = (asset.asset_type || '').toLowerCase()
  if (assetType === 'video') return false
  return true
}

// Lọc ra các mục hiển thị được trong thư viện tài nguyên
export function filterDramaLibraryAssets(assets: DramaAsset[]): DramaAsset[] {
  return assets.filter(isDramaLibraryAsset)
}
