/** Storyboard của tập: nút tài nguyên dùng chung nối tới từng nút cảnh quay */
import type { Edge, Node } from '@xyflow/react'
import {
  resolveDramaMediaUrl,
  type DramaAsset,
  type DramaFragment,
} from '../../../api/drama'
import {
  collectFragmentAssetIds,
  formatFragLabel,
  normalizeAssetTab,
} from '../dramaEpisodeEditUtils'

export type EpisodeFragmentNodeData = {
  fragmentId: number
  sortOrder: number
  label: string
  content: string
  videoUrl: string
  coverUrl: string
  durationSec: number
  linkedCount: number
  [key: string]: unknown
}

export type EpisodeAssetLinkRef = {
  fragmentId: number
  label: string
}

export type EpisodeAssetNodeData = {
  assetId: number
  linkedFragments: EpisodeAssetLinkRef[]
  name: string
  typeLabel: string
  previewUrl: string
  [key: string]: unknown
}

export type EpisodeFlowNodeData = EpisodeFragmentNodeData | EpisodeAssetNodeData

export const EPISODE_FRAGMENT_NODE_WIDTH = 220
export const EPISODE_ASSET_NODE_WIDTH = 148
export const EPISODE_FRAGMENT_COL_GAP = 36
export const EPISODE_FRAGMENT_ROW_GAP = 36
/** Chiều cao ước lượng của nút cảnh quay (khoảng cách khi xếp lưới) */
export const EPISODE_FRAGMENT_NODE_EST_HEIGHT = 400
export const EPISODE_ASSET_NODE_EST_HEIGHT = 196
export const EPISODE_ASSET_ROW_GAP = 14
export const EPISODE_ASSET_POOL_GAP = 40
export const EPISODE_GRID_START_Y = 32

// id của nút video cảnh quay
export function episodeFragmentNodeId(fragmentId: number): string {
  return `frag-${fragmentId}`
}

// id của nút tài nguyên (duy nhất theo assetId, dùng lại qua các cảnh quay)
export function episodeAssetNodeId(assetId: number): string {
  return `asset-${assetId}`
}

// Số cột lưới tính theo số cảnh quay (trái→phải, trên→dưới, tránh cột quá dài)
export function episodeGridColumns(count: number): number {
  if (count <= 3) return Math.max(1, count)
  if (count <= 8) return 3
  return 4
}

// Toạ độ của cảnh quay trong lưới
export function episodeFragmentGridPosition(
  index: number,
  cols: number,
  startX: number,
): { x: number; y: number } {
  const col = index % cols
  const row = Math.floor(index / cols)
  return {
    x: startX + col * (EPISODE_FRAGMENT_NODE_WIDTH + EPISODE_FRAGMENT_COL_GAP),
    y: EPISODE_GRID_START_Y + row * (EPISODE_FRAGMENT_NODE_EST_HEIGHT + EPISODE_FRAGMENT_ROW_GAP),
  }
}

// Nối theo thứ tự cảnh quay: cùng hàng thì sang phải, sang hàng thì xuống dưới
export function episodeSequenceHandles(fromIndex: number, toIndex: number, cols: number) {
  const fromCol = fromIndex % cols
  const toCol = toIndex % cols
  const fromRow = Math.floor(fromIndex / cols)
  const toRow = Math.floor(toIndex / cols)
  if (toRow === fromRow && toCol === fromCol + 1) {
    return { sourceHandle: 'seq-out-r', targetHandle: 'seq-in-l' }
  }
  return { sourceHandle: 'seq-out-b', targetHandle: 'seq-in-t' }
}

// Dựng: nhóm tài nguyên dùng chung bên trái → nối cong sang lưới cảnh quay bên phải
export function buildEpisodeFragmentFlow(
  fragments: DramaFragment[],
  assets: DramaAsset[] = [],
): {
  nodes: Node<EpisodeFlowNodeData>[]
  edges: Edge[]
} {
  const ordered = [...fragments].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const byId = new Map(assets.map((a) => [a.id, a]))
  const nodes: Node<EpisodeFlowNodeData>[] = []
  const edges: Edge[] = []
  const gridCols = episodeGridColumns(ordered.length)
  const fragGridStartX = EPISODE_ASSET_NODE_WIDTH + EPISODE_ASSET_POOL_GAP

  const fragLabels = new Map<number, string>()
  const fragIndexById = new Map<number, number>()
  ordered.forEach((frag, index) => {
    fragLabels.set(frag.id, formatFragLabel(index, frag.duration_sec))
    fragIndexById.set(frag.id, index)
  })

  // assetId → danh sách id cảnh quay đã liên kết (giữ thứ tự)
  const assetToFragments = new Map<number, number[]>()
  ordered.forEach((frag) => {
    for (const assetId of collectFragmentAssetIds(frag)) {
      const list = assetToFragments.get(assetId) ?? []
      if (!list.includes(frag.id)) list.push(frag.id)
      assetToFragments.set(assetId, list)
    }
  })

  const uniqueAssetIds = [...assetToFragments.keys()].sort((a, b) => {
    const fragA = assetToFragments.get(a)?.[0]
    const fragB = assetToFragments.get(b)?.[0]
    const indexA = fragA != null ? fragIndexById.get(fragA) ?? 999 : 999
    const indexB = fragB != null ? fragIndexById.get(fragB) ?? 999 : 999
    return indexA - indexB
  })

  let lastAssetY = EPISODE_GRID_START_Y
  uniqueAssetIds.forEach((assetId) => {
    const asset = byId.get(assetId)
    const fragmentIds = assetToFragments.get(assetId) ?? []
    const tab = normalizeAssetTab(asset?.type || '')
    const linkedIndices = fragmentIds
      .map((fid) => fragIndexById.get(fid))
      .filter((idx): idx is number => idx != null)
    const anchorY =
      linkedIndices.length > 0
        ? linkedIndices.reduce(
            (sum, idx) => sum + episodeFragmentGridPosition(idx, gridCols, fragGridStartX).y,
            0,
          ) / linkedIndices.length
        : lastAssetY
    const y = Math.max(anchorY - EPISODE_ASSET_NODE_EST_HEIGHT / 2, lastAssetY)
    lastAssetY = y + EPISODE_ASSET_NODE_EST_HEIGHT + EPISODE_ASSET_ROW_GAP

    nodes.push({
      id: episodeAssetNodeId(assetId),
      type: 'episodeAsset',
      position: { x: 0, y },
      data: {
        assetId,
        linkedFragments: fragmentIds.map((fragmentId) => ({
          fragmentId,
          label: fragLabels.get(fragmentId) || `Cảnh quay ${fragmentId}`,
        })),
        name: asset?.name || `Tài nguyên ${assetId}`,
        typeLabel: tab || asset?.type || 'tài nguyên',
        previewUrl: resolveDramaMediaUrl(asset?.cover || asset?.url) || '',
      },
      draggable: true,
    })

    for (const fragmentId of fragmentIds) {
      edges.push({
        id: `ea-${fragmentId}-${assetId}`,
        source: episodeAssetNodeId(assetId),
        target: episodeFragmentNodeId(fragmentId),
        targetHandle: 'assets',
        type: 'default',
        animated: false,
      })
    }
  })

  ordered.forEach((frag, index) => {
    const fragNodeId = episodeFragmentNodeId(frag.id)
    const linkedIds = collectFragmentAssetIds(frag)
    const { x, y } = episodeFragmentGridPosition(index, gridCols, fragGridStartX)

    nodes.push({
      id: fragNodeId,
      type: 'episodeFragment',
      position: { x, y },
      data: {
        fragmentId: frag.id,
        sortOrder: frag.sort_order ?? index,
        label: formatFragLabel(index, frag.duration_sec),
        content: frag.content || '',
        videoUrl: resolveDramaMediaUrl(frag.video) || '',
        coverUrl: resolveDramaMediaUrl(frag.cover) || '',
        durationSec: frag.duration_sec && frag.duration_sec > 0 ? frag.duration_sec : 8,
        linkedCount: linkedIds.length,
      },
      draggable: true,
    })

    if (index > 0) {
      const prev = ordered[index - 1]
      const handles = episodeSequenceHandles(index - 1, index, gridCols)
      edges.push({
        id: `ef-${prev.id}-${frag.id}`,
        source: episodeFragmentNodeId(prev.id),
        sourceHandle: handles.sourceHandle,
        target: fragNodeId,
        targetHandle: handles.targetHandle,
        type: 'default',
        animated: false,
        style: { strokeDasharray: '6 4', stroke: '#cbd5e1' },
      })
    }
  })

  return { nodes, edges }
}
