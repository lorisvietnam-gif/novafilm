/** Lối vào storyboard: bỏ qua trang danh sách tập, vào thẳng trang sửa tập đầu */
import { dramaApi, type DramaEpisode } from '../api/drama'

/** Nếu đã có tập thì chỉ đọc; chỉ cắt tập từ kịch bản một lần khi chưa có tập nào. Muốn cắt lại thì phải truyền `force`. */
export async function loadDramaEpisodes(
  projectId: number,
  force = false,
): Promise<DramaEpisode[]> {
  if (!force) {
    const existing = await dramaApi.listEpisodes(projectId)
    if (existing.length) return existing
  }
  return dramaApi.seedEpisodes(projectId, force)
}

/** Bảo đảm đã tách tập rồi trả về đường dẫn sửa tập đầu (hoặc tập được chỉ định); chưa có tập thì quay về dàn ý */
export async function resolveStoryboardPath(
  projectId: number,
  preferredEpisodeId?: number | null,
): Promise<string> {
  const rows = await loadDramaEpisodes(projectId, false)
  if (preferredEpisodeId && rows.some((r) => r.id === preferredEpisodeId)) {
    return `/drama/projects/${projectId}/episodes/${preferredEpisodeId}`
  }
  const first = rows[0]
  if (first?.id) return `/drama/projects/${projectId}/episodes/${first.id}`
  return `/drama/projects/${projectId}`
}
