/** Chuẩn hoá dữ liệu canvas từ backend / bản cũ thành node và edge của xyflow */
import type { Edge, Node } from '@xyflow/react'
import {
  CANVAS_NODE_DEFAULT_LABEL,
  type CanvasAssetNodeData,
  type CanvasNodeKind,
} from './canvasTypes'

const KIND_SET = new Set<CanvasNodeKind>([
  'character',
  'scene',
  'video',
  'image',
  'text',
  'audio',
])

/** Kiểm tra có phải loại nút hợp lệ không */
function isCanvasNodeKind(value: unknown): value is CanvasNodeKind {
  return typeof value === 'string' && KIND_SET.has(value as CanvasNodeKind)
}

/** Chuẩn hoá một node (tương thích bản cũ { id, label, x, y }) */
export function normalizeCanvasNode(raw: unknown, index: number): Node<CanvasAssetNodeData> | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = String(item.id || `n-${index}`)

  /* xyflow bản mới: position + data */
  if (item.position && typeof item.position === 'object') {
    const pos = item.position as { x?: unknown; y?: unknown }
    const dataRaw = (item.data && typeof item.data === 'object' ? item.data : {}) as Record<
      string,
      unknown
    >
    const kind = isCanvasNodeKind(dataRaw.kind)
      ? dataRaw.kind
      : isCanvasNodeKind(item.type)
        ? item.type
        : 'image'
    const label =
      typeof dataRaw.label === 'string' && dataRaw.label
        ? dataRaw.label
        : CANVAS_NODE_DEFAULT_LABEL[kind]

    return {
      id,
      type: 'asset',
      position: {
        x: Number(pos.x) || 0,
        y: Number(pos.y) || 0,
      },
      data: {
        kind,
        label,
        assetId: typeof dataRaw.assetId === 'number' ? dataRaw.assetId : undefined,
        mediaUrl:
          typeof dataRaw.mediaUrl === 'string'
            ? dataRaw.mediaUrl
            : typeof dataRaw.url === 'string'
              ? dataRaw.url
              : null,
        textContent: typeof dataRaw.textContent === 'string' ? dataRaw.textContent : undefined,
      },
    }
  }

  /* Bản cũ định vị tuyệt đối: x / y / label */
  if ('x' in item || 'y' in item || 'label' in item) {
    const label =
      typeof item.label === 'string' && item.label
        ? item.label
        : CANVAS_NODE_DEFAULT_LABEL.image
    return {
      id,
      type: 'asset',
      position: {
        x: Number(item.x) || 40 + (index % 5) * 180,
        y: Number(item.y) || 40 + Math.floor(index / 5) * 120,
      },
      data: {
        kind: 'image',
        label,
      },
    }
  }

  return null
}

/** Chuẩn hoá danh sách edge */
export function normalizeCanvasEdges(raw: unknown): Edge[] {
  if (!Array.isArray(raw)) return []
  const edges: Edge[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    const source = String(e.source || '')
    const target = String(e.target || '')
    if (!source || !target || source === target) continue
    edges.push({
      id: String(e.id || `e-${source}-${target}-${i}`),
      source,
      target,
    })
  }
  return edges
}

/** Chuẩn hoá danh sách node */
export function normalizeCanvasNodes(raw: unknown): Node<CanvasAssetNodeData>[] {
  if (!Array.isArray(raw)) return []
  const nodes: Node<CanvasAssetNodeData>[] = []
  for (let i = 0; i < raw.length; i++) {
    const node = normalizeCanvasNode(raw[i], i)
    if (node) nodes.push(node)
  }
  return nodes
}

/** Tính toạ độ đặt node mới ở chính giữa viewport */
export function getViewportCenterNodePosition(
  screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number },
  size: { width: number; height: number },
) {
  const pane = document.querySelector('.react-flow')
  const bounds = pane?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }
  const center = screenToFlowPosition({
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  })
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  }
}
