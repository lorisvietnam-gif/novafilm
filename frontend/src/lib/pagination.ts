/** Các tuỳ chọn số bản ghi mỗi trang dùng chung cho phân trang */
export const DEFAULT_PAGE_SIZE_OPTIONS = [5, 8, 12, 20] as const

/** Tính số trang từ tổng số bản ghi và số bản ghi mỗi trang */
export function pageCountOf(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
}
