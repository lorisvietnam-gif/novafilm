import type { DramaProject, DramaProjectListItem } from '../api/drama'
import { localized, type LocalizedText } from './localeStrings'

export type DramaWorkflow = 'script' | 'canvas'

/**
 * Hai marker này được so khớp với dữ liệu ĐÃ LƯU trong database, không phải với
 * chuỗi hiển thị: `script.source` do `pages/drama/DramaListPage.tsx` ghi vào, và
 * `title` của dự án. Dịch chúng làm các bản ghi cũ không còn nhận diện được là
 * dự án canvas, nên giữ nguyên verbatim ở mọi ngôn ngữ.
 */
const CANVAS_SOURCE_MARKER = '自由画布创作项目'
const CANVAS_TITLE_MARKER = '自由画布'

type WorkflowSource = {
  workflow?: string | null
  title?: string | null
  params?: Record<string, unknown> | null
  script?: { source?: string | null } | null
}

/** Phân tích luồng Drama: canvas=bảng vẽ tự do; script=dàn ý rồi chia tập */
export function resolveDramaWorkflow(item: WorkflowSource | null | undefined): DramaWorkflow {  const raw = String(item?.workflow || item?.params?.workflow || '')
    .trim()
    .toLowerCase()
  if (raw === 'canvas' || raw === 'script') return raw

  const title = String(item?.title || '')
  if (title.includes(CANVAS_TITLE_MARKER)) return 'canvas'

  const source = String(item?.script?.source || '')
  if (source.includes(CANVAS_SOURCE_MARKER)) return 'canvas'

  return 'script'
}

/** Dự án dùng bảng vẽ tự do */
export function isCanvasWorkflow(
  item: DramaProject | DramaProjectListItem | WorkflowSource | null | undefined,
): boolean {
  return resolveDramaWorkflow(item) === 'canvas'
}

/** Đường dẫn vào dự án: canvas thì vào thẳng canvas, còn lại vào không gian làm việc */
export function dramaProjectEntryPath(
  item: DramaProject | DramaProjectListItem | WorkflowSource,
): string {
  const id = Number((item as { id?: number }).id)
  if (!Number.isFinite(id) || id <= 0) return '/drama'
  if (isCanvasWorkflow(item)) return `/drama/projects/${id}/canvas`
  return `/drama/projects/${id}`
}

const CARD_META: {
  canvas: LocalizedText
  scripted: LocalizedText
  draft: LocalizedText
  nodeAssets: LocalizedText
  episodes: LocalizedText
  assets: LocalizedText
} = {
  canvas: { zh: '自由画布', en: 'Free canvas', vi: 'Bảng vẽ tự do' },
  scripted: { zh: '已写剧本', en: 'Script written', vi: 'Đã có kịch bản' },
  draft: { zh: '草稿 · 待写剧本', en: 'Draft · script pending', vi: 'Bản nháp · chưa có kịch bản' },
  nodeAssets: { zh: '节点资产', en: 'node assets', vi: 'tài nguyên' },
  episodes: { zh: '集', en: 'episodes', vi: 'tập' },
  assets: { zh: '资产', en: 'assets', vi: 'tài nguyên' },
}

/** Văn bản meta trên thẻ danh sách */
export function formatDramaCardMeta(item: DramaProjectListItem): string {
  const assets = item.asset_count || 0
  if (isCanvasWorkflow(item)) {
    return `${localized(CARD_META.canvas)} · ${assets} ${localized(CARD_META.nodeAssets)}`
  }
  if (item.has_script) {
    const episodes = item.episode_count || 0
    return `${localized(CARD_META.scripted)} · ${episodes} ${localized(CARD_META.episodes)} · ${assets} ${localized(CARD_META.assets)}`
  }
  return `${localized(CARD_META.draft)} · ${assets} ${localized(CARD_META.assets)}`
}
