import type { DramaProjectUsageStats } from '../api/drama'

/** Giá trị usage rỗng để dựng, tránh lỗi khi danh sách không trả về usage */
export const EMPTY_DRAMA_USAGE: DramaProjectUsageStats = {
  charge_fen: 0,
  charge_yuan: 0,
  cost_fen: 0,
  cost_yuan: 0,
  tokens: 0,
  calls: 0,
  image_gens: 0,
  video_gens: 0,
}

/** Định dạng phí Drama để hiển thị */
export function formatDramaChargeYuan(yuan: number | undefined | null): string {
  const n = Number(yuan) || 0
  return `¥${n.toFixed(2)}`
}

/** Văn bản ngắn cho danh sách / không gian làm việc: phí · ảnh · video · số lần gọi */
export function formatDramaUsageBrief(usage?: DramaProjectUsageStats | null): string {
  const u = usage || EMPTY_DRAMA_USAGE
  const calls = u.calls > 0 ? ` · ${u.calls} lần gọi` : ''
  return `${formatDramaChargeYuan(u.charge_yuan)} · ${u.image_gens} ảnh · ${u.video_gens} video${calls}`
}
