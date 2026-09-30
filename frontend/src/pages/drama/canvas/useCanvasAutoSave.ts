/** Cờ bẩn bố cục canvas → tự động lưu có debounce */
import { useCallback, useEffect, useRef } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { dramaApi } from '../../../api/drama'
import { CANVAS_AUTO_SAVE_MS, type CanvasAssetNodeData } from './canvasTypes'

type UseCanvasAutoSaveArgs = {
  projectId: number
  nodes: Node<CanvasAssetNodeData>[]
  edges: Edge[]
  dirty: boolean
  enabled: boolean
  onSaved: () => void
  onError: (message: string) => void
}

/** Lưu dữ liệu bẩn (debounce) qua drama canvas API */
export function useCanvasAutoSave({
  projectId,
  nodes,
  edges,
  dirty,
  enabled,
  onSaved,
  onError,
}: UseCanvasAutoSaveArgs) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const latestRef = useRef({ nodes, edges, projectId })
  latestRef.current = { nodes, edges, projectId }

  /** Lưu ngay; có thể truyền node/edge ghi đè (dùng sau khi xoá, chưa kịp render lượt mới) */
  const flush = useCallback(
    async (override?: {
      nodes: Node<CanvasAssetNodeData>[]
      edges: Edge[]
    }) => {
      if (savingRef.current) return
      const base = latestRef.current
      const payload = {
        projectId: base.projectId,
        nodes: override?.nodes ?? base.nodes,
        edges: override?.edges ?? base.edges,
      }
      savingRef.current = true
      try {
        await dramaApi.saveCanvas({
          project_id: payload.projectId,
          nodes: payload.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data,
          })),
          edges: payload.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
          })),
        })
        onSaved()
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Tự động lưu thất bại.')
      } finally {
        savingRef.current = false
      }
    },
    [onError, onSaved],
  )

  useEffect(() => {
    if (!enabled || !dirty) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void flush()
    }, CANVAS_AUTO_SAVE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [dirty, enabled, nodes, edges, flush])

  return { flush }
}
