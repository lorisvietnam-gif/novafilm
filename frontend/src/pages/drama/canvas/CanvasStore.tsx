/** Context trạng thái canvas: node/edge, lịch sử, công tắc UI và thao tác thêm/xoá */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react'
import { dramaApi, resolveDramaMediaUrl } from '../../../api/drama'
import type { DramaAsset } from '../../../api/drama'
import { enqueueDramaImageGen, resumeDramaImageGensFromAssets } from '../../../lib/dramaImageGenQueue'
import { enqueueDramaVideoGen, resumeDramaVideoGensFromAssets } from '../../../lib/dramaVideoGenQueue'
import type { ImageGenerationOptions } from '../../../lib/dramaGenerationOptions'
import type { VideoGenerationOptions } from '../../../lib/dramaVideoGenerationOptions'
import { readEditableVisualPrompt } from '../../../lib/dramaVisualPrompt'
import {
  collectCanvasReferenceImages,
  requireWithinReferenceImageLimit,
} from '../../../lib/referenceImages'
import { getImageStyleId } from '../dramaWorkspaceUtils'
import { isCanvasWorkflow } from '../../../lib/dramaWorkflow'
import {
  createEmptyCanvasHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type CanvasHistoryState,
} from './canvasHistory'
import { mergeAssetsWithCanvasLayout, buildNodeDataFromAsset } from './assetsToCanvasNodes'
import {
  CANVAS_NODE_DEFAULT_LABEL,
  nextCanvasNodeLabel,
  canvasKindToAssetType,
  type CanvasAssetNodeData,
  type CanvasNodeKind,
} from './canvasTypes'
import { useCanvasAutoSave } from './useCanvasAutoSave'
import { CanvasStoreContext, useCanvasStore as useCanvasStoreBase } from './canvasStoreContext'

type CanvasStoreValue = {
  projectId: number
  nodes: Node<CanvasAssetNodeData>[]
  edges: Edge[]
  loading: boolean
  errorMessage: string
  saveStatusVisible: boolean
  snapToGrid: boolean
  showMinimap: boolean
  canUndo: boolean
  canRedo: boolean
  showNodeSelector: boolean
  setErrorMessage: (msg: string) => void
  toggleSnapToGrid: () => void
  toggleMinimap: () => void
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNodeOfKind: (kind: CanvasNodeKind, position: { x: number; y: number }) => Promise<void>
  undo: () => void
  redo: () => void
  pushSnapshot: () => void
  focusNodeId: string | null
  requestFocusNode: (id: string) => void
  clearFocusNode: () => void
  ensureNodeAsset: (nodeId: string) => Promise<number>
  uploadNodeMedia: (nodeId: string, file: File) => Promise<void>
  applyLibraryMediaToNode: (nodeId: string, source: DramaAsset) => Promise<void>
  /** Đồng bộ node theo field asset mới nhất (gắn giọng đọc…) */
  syncNodeFromAsset: (nodeId: string, asset: DramaAsset) => void
  /** Ghi lại prompt của node (cục bộ) */
  updateNodePrompt: (nodeId: string, prompt: string) => void
  /** Ghi lại tham số tạo của node video */
  updateNodeVideoOptions: (nodeId: string, options: Record<string, unknown>) => void
  /** Đổi tên node (đồng bộ luôn name của asset) */
  renameNode: (nodeId: string, name: string) => Promise<void>
  generateNodeImage: (
    nodeId: string,
    prompt: string,
    options?: Partial<ImageGenerationOptions>,
  ) => Promise<void>
  generateNodeVideo: (
    nodeId: string,
    prompt: string,
    options?: Partial<VideoGenerationOptions>,
  ) => Promise<void>
  updateNodeTextContent: (nodeId: string, textContent: string) => void
  /** Các node canvas có thể tham chiếu bằng @ (nhân vật / bối cảnh / ảnh…) */
  mentionableNodes: Array<{
    nodeId: string
    assetId: number
    kind: CanvasNodeKind
    label: string
    mediaUrl?: string | null
  }>
  /** ID phong cách hình ảnh dựng sẵn ở cấp dự án */
  projectImageStyleId: string
  /** Dự án có dùng quy trình canvas tự do hay không (không phải chia tập theo dàn ý) */
  freeCanvasMode: boolean
}

type CanvasStoreProviderProps = {
  projectId: number
  children: ReactNode
}

/** Cung cấp trạng thái canvas có kiểm soát và các thao tác lịch sử */
export function CanvasStoreProvider({ projectId, children }: CanvasStoreProviderProps) {
  const [nodes, setNodes] = useState<Node<CanvasAssetNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [history, setHistory] = useState<CanvasHistoryState>(createEmptyCanvasHistory)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveStatusVisible, setSaveStatusVisible] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  // projectImageStyleId phong cách hình ảnh dựng sẵn của dự án
  // freeCanvasMode dự án có dùng canvas tự do hay không
  const [projectImageStyleId, setProjectImageStyleId] = useState('')
  const [freeCanvasMode, setFreeCanvasMode] = useState(false)
  const readyRef = useRef(false)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const historyRef = useRef(history)
  const freeCanvasModeRef = useRef(freeCanvasMode)
  /** Xử lý tuần tự việc tạo node, tránh bấm liên tục sinh trùng tên */
  const addNodeChainRef = useRef(Promise.resolve())
  const flushRef = useRef<
    (override?: { nodes: Node<CanvasAssetNodeData>[]; edges: Edge[] }) => Promise<void>
  >(async () => undefined)
  nodesRef.current = nodes
  edgesRef.current = edges
  historyRef.current = history
  freeCanvasModeRef.current = freeCanvasMode

  useEffect(() => {
    let cancelled = false
    readyRef.current = false
    setLoading(true)
    setDirty(false)
    setSaveStatusVisible(false)
    setErrorMessage('')

    Promise.all([
      dramaApi.getCanvas(projectId),
      dramaApi.listAssets(projectId),
      dramaApi.getProject(projectId).catch(() => null),
    ])
      .then(([canvas, assets, project]) => {
        if (cancelled) return
        const free = project ? isCanvasWorkflow(project) : false
        setFreeCanvasMode(free)
        const { nodes: mergedNodes, edges: mergedEdges } = mergeAssetsWithCanvasLayout(
          assets,
          canvas.nodes,
          canvas.edges,
          { freeCanvas: free },
        )
        setNodes(mergedNodes)
        setEdges(mergedEdges)
        setHistory(createEmptyCanvasHistory())
        setDirty(false)
        if (project) {
          setProjectImageStyleId(getImageStyleId(project.script, project))
        }
        resumeDramaImageGensFromAssets(projectId, assets, (next) => {
          const mediaUrl = next.url || next.cover || ''
          if (!mediaUrl) return
          setNodes((current) =>
            current.map((n) =>
              n.data.assetId === next.id
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      mediaUrl,
                      generating:
                        String(
                          ((next.params || {}).generation as { status?: string } | undefined)
                            ?.status || '',
                        ) === 'generating' ||
                        String(
                          ((next.params || {}).generation as { status?: string } | undefined)
                            ?.status || '',
                        ) === 'queued',
                    },
                  }
                : n,
            ),
          )
        })
        resumeDramaVideoGensFromAssets(projectId, assets)
        readyRef.current = true
      })
      .catch((err) => {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Không tải được canvas.')
        readyRef.current = true
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      readyRef.current = false
    }
  }, [projectId])

  const markDirty = useCallback(() => {
    if (!readyRef.current) return
    setDirty(true)
    setSaveStatusVisible(false)
  }, [])

  const pushSnapshot = useCallback(() => {
    setHistory((prev) =>
      pushHistory(prev, {
        nodes: nodesRef.current,
        edges: edgesRef.current,
      }),
    )
  }, [])

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removeChanges = changes.filter((c) => c.type === 'remove')
      const hasRemove = removeChanges.length > 0
      /*
       * removedAssetIds các asset backend cần xoá
       * nextNodes / nextEdges bố cục sau khi xoá (lưu ngay để refresh không hiện lại)
       */
      const removedAssetIds: number[] = []
      if (hasRemove) {
        setHistory((prev) =>
          pushHistory(prev, {
            nodes: nodesRef.current,
            edges: edgesRef.current,
          }),
        )
        for (const change of removeChanges) {
          const node = nodesRef.current.find((n) => n.id === change.id)
          const assetId = node?.data.assetId
          if (typeof assetId === 'number' && assetId > 0) {
            removedAssetIds.push(assetId)
          }
        }
      }

      const nextNodes = applyNodeChanges(changes, nodesRef.current) as Node<CanvasAssetNodeData>[]
      nodesRef.current = nextNodes
      setNodes(nextNodes)

      /* Cắt luôn các edge trỏ tới node đã xoá, tránh để edge rác trong layout sau khi refresh */
      let nextEdges = edgesRef.current
      if (hasRemove) {
        const removedIds = new Set(removeChanges.map((c) => c.id))
        nextEdges = edgesRef.current.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
        )
        if (nextEdges.length !== edgesRef.current.length) {
          edgesRef.current = nextEdges
          setEdges(nextEdges)
        }
      }

      const structural = changes.some(
        (c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace' || c.type === 'position',
      )
      if (structural) markDirty()

      if (hasRemove && freeCanvasModeRef.current) {
        for (const assetId of removedAssetIds) {
          void dramaApi.deleteAsset(assetId).catch(() => undefined)
        }
        void flushRef.current({
          nodes: nextNodes,
          edges: nextEdges,
        })
      }
    },
    [markDirty],
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const hasRemove = changes.some((c) => c.type === 'remove')
      if (hasRemove) {
        setHistory((prev) =>
          pushHistory(prev, {
            nodes: nodesRef.current,
            edges: edgesRef.current,
          }),
        )
      }
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current)
        edgesRef.current = next
        return next
      })
      if (changes.some((c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace')) {
        markDirty()
      }
    },
    [markDirty],
  )

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return
      }
      setHistory((prev) =>
        pushHistory(prev, {
          nodes: nodesRef.current,
          edges: edgesRef.current,
        }),
      )
      setEdges((current) => {
        const next = addEdge({ ...connection, id: `e-${Date.now()}` }, current)
        edgesRef.current = next
        return next
      })
      markDirty()
    },
    [markDirty],
  )

  const addNodeOfKind = useCallback(
    async (kind: CanvasNodeKind, position: { x: number; y: number }) => {
      const run = async () => {
        /* Tên duy nhất tránh tái dùng nhầm asset khi trùng tên cùng loại; lệch điểm đặt để không chồng lên nhau */
        let label = nextCanvasNodeLabel(kind, nodesRef.current)
        const stagger = nodesRef.current.length * 24
        const placed = { x: position.x + stagger, y: position.y + stagger }
        let assetId: number | undefined
        try {
          const asset = await dramaApi.createAsset({
            project_id: projectId,
            type: kind,
            asset_type: canvasKindToAssetType(kind),
            name: label,
            params: { on_canvas: true },
          })
          assetId = asset.id
          /* Nếu vẫn trúng asset cũ (thẻ trùng tên sẵn có trong thư viện), đổi tên rồi thử lại */
          const usedIds = new Set(
            nodesRef.current
              .map((n) => n.data.assetId)
              .filter((id): id is number => typeof id === 'number' && id > 0),
          )
          if (usedIds.has(assetId)) {
            label = `${label} ${Date.now().toString(36)}`
            const retry = await dramaApi.createAsset({
              project_id: projectId,
              type: kind,
              asset_type: canvasKindToAssetType(kind),
              name: label,
              params: { on_canvas: true },
            })
            if (usedIds.has(retry.id)) {
              setErrorMessage('Không tạo được nút: tài nguyên đã tồn tại trên canvas.')
              return
            }
            assetId = retry.id
          }
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'Không tạo được tài nguyên.')
          return
        }

        const id = `asset-${assetId}`
        const node: Node<CanvasAssetNodeData> = {
          id,
          type: 'asset',
          position: placed,
          data: {
            kind,
            label,
            assetId,
            textContent: kind === 'text' ? '' : undefined,
            mediaUrl: null,
          },
        }
        /* Ghi lại canvas_node_id để sau khi refresh vẫn nhận ra là node canvas */
        void dramaApi
          .updateAsset(assetId, { params: { canvas_node_id: id, on_canvas: true } })
          .catch(() => undefined)

        setHistory((prev) =>
          pushHistory(prev, {
            nodes: nodesRef.current,
            edges: edgesRef.current,
          }),
        )
        const nextNodes = [...nodesRef.current, node]
        nodesRef.current = nextNodes
        setNodes(nextNodes)
        markDirty()
        /* Lưu ngay xuống để refresh không mất node vừa tạo */
        void flushRef.current({
          nodes: nextNodes,
          edges: edgesRef.current,
        })
      }

      const prev = addNodeChainRef.current
      let release!: () => void
      addNodeChainRef.current = new Promise<void>((resolve) => {
        release = resolve
      })
      await prev
      try {
        await run()
      } finally {
        release()
      }
    },
    [markDirty, projectId],
  )

  /** Bảo đảm node đã gắn asset backend, trả về assetId */
  const ensureNodeAsset = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) throw new Error('Nút không tồn tại.')
      if (typeof node.data.assetId === 'number' && node.data.assetId > 0) {
        return node.data.assetId
      }
      const asset = await dramaApi.createAsset({
        project_id: projectId,
        type: node.data.kind,
        asset_type: canvasKindToAssetType(node.data.kind),
        name: node.data.label,
        cover: node.data.mediaUrl || undefined,
        url: node.data.mediaUrl || undefined,
        params: { canvas_node_id: nodeId },
      })
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, assetId: asset.id } } : n,
        ),
      )
      markDirty()
      return asset.id
    },
    [markDirty, projectId],
  )

  /** Tải ảnh lên node từ máy */
  const uploadNodeMedia = useCallback(
    async (nodeId: string, file: File) => {
      pushSnapshot()
      const assetId = await ensureNodeAsset(nodeId)
      const asset = await dramaApi.uploadAssetMedia(assetId, file)
      const mediaUrl = asset.url || asset.cover || ''
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, assetId, mediaUrl, generating: false } }
            : n,
        ),
      )
      markDirty()
    },
    [ensureNodeAsset, markDirty, pushSnapshot],
  )

  /** Chọn ảnh từ thư viện tài nguyên rồi ghi lại vào node, giữ prompt sửa được để tạo lại */
  const applyLibraryMediaToNode = useCallback(
    async (nodeId: string, source: DramaAsset) => {
      if (!source.url && !source.cover) {
        throw new Error('Tài nguyên đã chọn không có ảnh dùng được.')
      }
      pushSnapshot()
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) throw new Error('Nút không tồn tại.')
      const assetId = await ensureNodeAsset(nodeId)
      const promptHint = readEditableVisualPrompt(source)
      const nextName = (source.name || '').trim() || node.data.label
      const currentAsset = await dramaApi.listAssets(projectId).then(
        (list) => list.find((a) => a.id === assetId) || null,
        () => null,
      )
      const prevParams =
        currentAsset?.params && typeof currentAsset.params === 'object'
          ? (currentAsset.params as Record<string, unknown>)
          : {}
      const sourceParams =
        source.params && typeof source.params === 'object'
          ? (source.params as Record<string, unknown>)
          : {}
      const visualImage = String(
        sourceParams.visualImage || sourceParams.visualPrompt || promptHint || '',
      ).trim()
      const updated = await dramaApi.updateAsset(assetId, {
        name: nextName,
        url: source.url || source.cover,
        cover: source.cover || source.url,
        params: {
          ...prevParams,
          importedFromAssetId: source.id,
          importedFromProjectId: source.project_id,
          visualPrompt: promptHint || visualImage || prevParams.visualPrompt,
          visualImage: visualImage || promptHint || prevParams.visualImage,
          canvas: {
            ...(typeof prevParams.canvas === 'object' && prevParams.canvas
              ? (prevParams.canvas as Record<string, unknown>)
              : {}),
            generation: promptHint ? { prompt: promptHint } : undefined,
          },
          canvas_node_id: nodeId,
        },
      })
      const mediaUrl = updated.url || updated.cover || source.url || source.cover || ''
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  assetId,
                  mediaUrl,
                  generating: false,
                  label: nextName,
                  characterName: n.data.kind === 'character' ? nextName : n.data.characterName,
                  promptHint,
                },
              }
            : n,
        ),
      )
      markDirty()
    },
    [ensureNodeAsset, markDirty, pushSnapshot],
  )

  /** Đồng bộ hiển thị node theo field asset mới nhất (giọng đọc, ảnh bìa, prompt…) */
  const syncNodeFromAsset = useCallback(
    (nodeId: string, asset: DramaAsset) => {
      const next = buildNodeDataFromAsset(asset)
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...next,
                  // Giữ trạng thái generating cục bộ để tránh nhấp nháy lúc gắn
                  generating: n.data.generating,
                },
              }
            : n,
        ),
      )
      markDirty()
    },
    [markDirty],
  )

  /** Tạo ảnh bằng AI rồi ghi lại vào node */
  const generateNodeImage = useCallback(
    async (nodeId: string, prompt: string, options?: Partial<ImageGenerationOptions>) => {
      const trimmed = prompt.trim()
      if (!trimmed) throw new Error('Vui lòng nhập prompt.')
      pushSnapshot()
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) throw new Error('Nút không tồn tại.')
      if (node.data.kind === 'video') throw new Error('Nút video phải dùng chức năng tạo video.')

      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, generating: true, promptHint: trimmed } }
            : n,
        ),
      )

      try {
        const assetId = await ensureNodeAsset(nodeId)
        /* Mở rộng @asset:id thành tên đọc được trước khi gửi API tạo ảnh; local vẫn giữ token */
        const expandedPrompt = trimmed.replace(/@asset:(\d+)/g, (token, idStr: string) => {
          const refId = Number(idStr)
          const ref = nodesRef.current.find((n) => n.data.assetId === refId)
          if (!ref) return token
          const kindLabel =
            ref.data.kind === 'character'
              ? 'Nhân vật'
              : ref.data.kind === 'scene'
                ? 'Bối cảnh'
                : ref.data.kind === 'image'
                  ? 'Hình ảnh'
                  : 'Tư liệu'
          return `${kindLabel} «${ref.data.label}»`
        })
        const latest = await enqueueDramaImageGen({
          projectId,
          assetId,
          assetName: node.data.label,
          assetType: node.data.kind,
          prompt: expandedPrompt,
          options: {
            image_style_id: options?.image_style_id || projectImageStyleId || undefined,
            model_id: options?.model_id,
            aspect_ratio: options?.aspect_ratio,
            resolution: options?.resolution,
          },
          onAssetUpdate: (next) => {
            const mediaUrl = next.url || next.cover || ''
            if (!mediaUrl) return
            const genStatus = String(
              ((next.params || {}).generation as { status?: string } | undefined)?.status || '',
            )
            const stillBusy = genStatus === 'queued' || genStatus === 'generating'
            setNodes((current) =>
              current.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        assetId,
                        mediaUrl,
                        generating: stillBusy,
                        promptHint: trimmed,
                      },
                    }
                  : n,
              ),
            )
          },
        })
        const mediaUrl = latest.url || latest.cover || ''
        if (!mediaUrl) throw new Error('Tạo ảnh bị quá thời gian, vui lòng thử lại.')
        setNodes((current) =>
          current.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    assetId,
                    mediaUrl,
                    generating: false,
                    promptHint: trimmed,
                  },
                }
              : n,
          ),
        )
        markDirty()
      } catch (err) {
        setNodes((current) =>
          current.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, generating: false } } : n,
          ),
        )
        throw err
      }
    },
    [ensureNodeAsset, markDirty, projectId, projectImageStyleId, pushSnapshot],
  )

  /** Gom các ID tài nguyên tham chiếu nối vào node hiện tại */
  const collectIncomingAssetIds = useCallback((nodeId: string) => {
    const ids: number[] = []
    const seen = new Set<number>()
    for (const edge of edgesRef.current) {
      if (edge.target !== nodeId) continue
      const source = nodesRef.current.find((n) => n.id === edge.source)
      const assetId = source?.data.assetId
      if (typeof assetId !== 'number' || assetId <= 0 || seen.has(assetId)) continue
      seen.add(assetId)
      ids.push(assetId)
    }
    return ids
  }, [])

  /** Tạo video bằng AI rồi ghi lại vào node (Seedance, giữ nguyên @asset:id) */
  const generateNodeVideo = useCallback(
    async (nodeId: string, prompt: string, options?: Partial<VideoGenerationOptions>) => {
      const trimmed = prompt.trim()
      if (!trimmed) throw new Error('Vui lòng nhập prompt.')
      /*
       * Chặn trước khi gọi API: Canvas đang có quá 9 ảnh tham chiếu (nhân vật + bối cảnh).
       * Cắt bớt âm thầm thì dễ cắt nhầm ảnh nhân vật, nên ném lỗi để người dùng tự xoá.
       * Chặn ở đây, trước pushSnapshot, nên lần bấm bị chặn không đẩy thêm một bước vào lịch sử.
       */
      requireWithinReferenceImageLimit(collectCanvasReferenceImages(nodesRef.current))
      pushSnapshot()
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) throw new Error('Nút không tồn tại.')

      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  generating: true,
                  promptHint: trimmed,
                  videoOptions: { ...(n.data.videoOptions || {}), ...(options || {}) },
                },
              }
            : n,
        ),
      )

      try {
        const assetId = await ensureNodeAsset(nodeId)
        const latest = await enqueueDramaVideoGen({
          projectId,
          assetId,
          assetName: node.data.label,
          prompt: trimmed,
          options: {
            image_style_id: options?.image_style_id || projectImageStyleId || undefined,
            model_id: options?.model_id,
            aspect_ratio: options?.aspect_ratio,
            resolution: options?.resolution,
            duration_sec: options?.duration_sec,
          },
          referenceAssetIds: collectIncomingAssetIds(nodeId),
        })
        const mediaUrl = resolveDramaMediaUrl(latest.url || latest.cover || '')
        if (!mediaUrl) throw new Error('Tạo video bị quá thời gian, vui lòng thử lại.')
        setNodes((current) =>
          current.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    assetId,
                    mediaUrl,
                    generating: false,
                    promptHint: trimmed,
                  },
                }
              : n,
          ),
        )
        markDirty()
      } catch (err) {
        setNodes((current) =>
          current.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, generating: false } } : n,
          ),
        )
        throw err
      }
    },
    [
      collectIncomingAssetIds,
      ensureNodeAsset,
      markDirty,
      projectId,
      projectImageStyleId,
      pushSnapshot,
    ],
  )

  /** Cập nhật prompt của node (không kích hoạt tạo) */
  const updateNodePrompt = useCallback(
    (nodeId: string, prompt: string) => {
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, promptHint: prompt } } : n,
        ),
      )
      markDirty()
    },
    [markDirty],
  )

  /** Cập nhật tham số Seedance của node video */
  const updateNodeVideoOptions = useCallback(
    (nodeId: string, options: Record<string, unknown>) => {
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, videoOptions: options } } : n,
        ),
      )
      markDirty()
    },
    [markDirty],
  )

  /** Đổi tên node và đồng bộ name của asset */
  const renameNode = useCallback(
    async (nodeId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node || node.data.label === trimmed) return
      pushSnapshot()
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  label: trimmed,
                  characterName: n.data.kind === 'character' ? trimmed : n.data.characterName,
                },
              }
            : n,
        ),
      )
      markDirty()
      const assetId =
        typeof node.data.assetId === 'number' && node.data.assetId > 0
          ? node.data.assetId
          : await ensureNodeAsset(nodeId).catch(() => null)
      if (typeof assetId === 'number' && assetId > 0) {
        await dramaApi.updateAsset(assetId, { name: trimmed }).catch(() => undefined)
      }
    },
    [ensureNodeAsset, markDirty, pushSnapshot],
  )

  /** Cập nhật nội dung node văn bản */
  const updateNodeTextContent = useCallback(
    (nodeId: string, textContent: string) => {
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, textContent, label: textContent.slice(0, 24) || n.data.label } }
            : n,
        ),
      )
      markDirty()
    },
    [markDirty],
  )

  const undo = useCallback(() => {
    const result = undoHistory(
      { nodes: nodesRef.current, edges: edgesRef.current },
      historyRef.current,
    )
    if (!result) return
    setNodes(result.snapshot.nodes)
    setEdges(result.snapshot.edges)
    setHistory(result.history)
    markDirty()
  }, [markDirty])

  const redo = useCallback(() => {
    const result = redoHistory(
      { nodes: nodesRef.current, edges: edgesRef.current },
      historyRef.current,
    )
    if (!result) return
    setNodes(result.snapshot.nodes)
    setEdges(result.snapshot.edges)
    setHistory(result.history)
    markDirty()
  }, [markDirty])

  const { flush } = useCanvasAutoSave({
    projectId,
    nodes,
    edges,
    dirty,
    enabled: !loading,
    onSaved: () => {
      setDirty(false)
      setSaveStatusVisible(true)
    },
    onError: (msg) => setErrorMessage(msg),
  })
  flushRef.current = flush

  /* Cố gắng lưu thêm một lần trước khi đóng trang */
  useEffect(() => {
    const onBeforeUnload = () => {
      if (dirty) void flush()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, flush])

  const mentionableNodes = useMemo(
    () =>
      nodes
        .filter(
          (n) =>
            typeof n.data.assetId === 'number' &&
            n.data.assetId > 0 &&
            (n.data.kind === 'character' ||
              n.data.kind === 'scene' ||
              n.data.kind === 'image' ||
              n.data.kind === 'video'),
        )
        .map((n) => ({
          nodeId: n.id,
          assetId: n.data.assetId as number,
          kind: n.data.kind,
          label: n.data.label || CANVAS_NODE_DEFAULT_LABEL[n.data.kind],
          mediaUrl: n.data.mediaUrl,
        })),
    [nodes],
  )

  const value = useMemo<CanvasStoreValue>(
    () => ({
      projectId,
      nodes,
      edges,
      loading,
      errorMessage,
      saveStatusVisible,
      snapToGrid,
      showMinimap,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      showNodeSelector: !loading && nodes.length === 0,
      setErrorMessage,
      toggleSnapToGrid: () => setSnapToGrid((v) => !v),
      toggleMinimap: () => setShowMinimap((v) => !v),
      onNodesChange,
      onEdgesChange,
      onConnect,
      addNodeOfKind,
      undo,
      redo,
      pushSnapshot,
      focusNodeId,
      requestFocusNode: (id: string) => setFocusNodeId(id),
      clearFocusNode: () => setFocusNodeId(null),
      ensureNodeAsset,
      uploadNodeMedia,
      applyLibraryMediaToNode,
      syncNodeFromAsset,
      updateNodePrompt,
      updateNodeVideoOptions,
      renameNode,
      generateNodeImage,
      generateNodeVideo,
      updateNodeTextContent,
      mentionableNodes,
      projectImageStyleId,
      freeCanvasMode,
    }),
    [
      projectId,
      nodes,
      edges,
      loading,
      errorMessage,
      saveStatusVisible,
      snapToGrid,
      showMinimap,
      history.past.length,
      history.future.length,
      onNodesChange,
      onEdgesChange,
      onConnect,
      addNodeOfKind,
      undo,
      redo,
      pushSnapshot,
      focusNodeId,
      ensureNodeAsset,
      uploadNodeMedia,
      applyLibraryMediaToNode,
      syncNodeFromAsset,
      updateNodePrompt,
      updateNodeVideoOptions,
      renameNode,
      generateNodeImage,
      generateNodeVideo,
      updateNodeTextContent,
      mentionableNodes,
      projectImageStyleId,
      freeCanvasMode,
    ],
  )

  return <CanvasStoreContext.Provider value={value}>{children}</CanvasStoreContext.Provider>
}

/** Đọc context trạng thái canvas */
export function useCanvasStore() {
  return useCanvasStoreBase<CanvasStoreValue>()
}
