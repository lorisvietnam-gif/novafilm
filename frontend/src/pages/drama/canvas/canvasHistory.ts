/** Hàm thuần cho ngăn lịch sử Hoàn tác / Làm lại của canvas */
import type { Edge, Node } from '@xyflow/react'
import { MAX_CANVAS_HISTORY, type CanvasAssetNodeData } from './canvasTypes'

export type CanvasSnapshot = {
  nodes: Node<CanvasAssetNodeData>[]
  edges: Edge[]
}

export type CanvasHistoryState = {
  past: CanvasSnapshot[]
  future: CanvasSnapshot[]
}

/** Tạo ngăn lịch sử rỗng */
export function createEmptyCanvasHistory(): CanvasHistoryState {
  return { past: [], future: [] }
}

/** Sao chép sâu một snapshot canvas */
export function cloneCanvasSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as CanvasSnapshot
}

/** Đẩy snapshot vào past rồi xoá future */
export function pushHistory(
  history: CanvasHistoryState,
  snapshot: CanvasSnapshot,
): CanvasHistoryState {
  const nextPast = [...history.past, cloneCanvasSnapshot(snapshot)]
  const trimmedPast =
    nextPast.length > MAX_CANVAS_HISTORY
      ? nextPast.slice(nextPast.length - MAX_CANVAS_HISTORY)
      : nextPast

  return {
    past: trimmedPast,
    future: [],
  }
}

/** Lấy snapshot trước trong past để khôi phục */
export function undoHistory(
  current: CanvasSnapshot,
  history: CanvasHistoryState,
): { snapshot: CanvasSnapshot; history: CanvasHistoryState } | null {
  if (history.past.length === 0) return null

  const previous = history.past[history.past.length - 1]
  return {
    snapshot: previous,
    history: {
      past: history.past.slice(0, -1),
      future: [cloneCanvasSnapshot(current), ...history.future],
    },
  }
}

/** Lấy snapshot kế trong future để khôi phục */
export function redoHistory(
  current: CanvasSnapshot,
  history: CanvasHistoryState,
): { snapshot: CanvasSnapshot; history: CanvasHistoryState } | null {
  if (history.future.length === 0) return null

  const next = history.future[0]
  return {
    snapshot: next,
    history: {
      past: [...history.past, cloneCanvasSnapshot(current)],
      future: history.future.slice(1),
    },
  }
}
