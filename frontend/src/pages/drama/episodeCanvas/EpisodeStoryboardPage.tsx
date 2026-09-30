/** Canvas storyboard toàn màn hình cho một tập: nối theo thứ tự cảnh quay, mỗi nút có video / tài nguyên trong cảnh / prompt */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronLeft } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  dramaApi,
  resolveDramaAssetPreviewUrl,
  type DramaAsset,
  type DramaEpisode,
  type DramaFragment,
} from '../../../api/drama'
import Modal from '../../../components/ui/Modal'
import {
  collectFragmentAssetIds,
  normalizeAssetTab,
} from '../dramaEpisodeEditUtils'
import RequireAuth from '../RequireAuth'
import {
  buildEpisodeFragmentFlow,
  type EpisodeFragmentNodeData,
  type EpisodeFlowNodeData,
} from './buildEpisodeFlow'
import { EpisodeAssetNode } from './EpisodeAssetNode'
import { EpisodeFragmentNode } from './EpisodeFragmentNode'
import './episodeCanvas.css'

const SAVE_DEBOUNCE_MS = 800

// Thêm mention @asset vào nội dung
function ensureAssetMention(content: string, assetId: number): string {
  const token = `@asset:${assetId}`
  if ((content || '').includes(token)) return content || ''
  const trimmed = (content || '').trimEnd()
  return trimmed ? `${trimmed} ${token}` : token
}

// Bỏ mention @asset khỏi nội dung
function removeAssetMention(content: string, assetId: number): string {
  return (content || '')
    .replace(new RegExp(`\\s*@asset:${assetId}\\b`, 'g'), ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Sau khi đăng nhập thì mở storyboard của tập
export default function EpisodeStoryboardPage() {
  return (
    <RequireAuth>
      <ReactFlowProvider>
        <EpisodeStoryboardInner />
      </ReactFlowProvider>
    </RequireAuth>
  )
}

// Tải tập rồi render storyboard toàn màn hình
function EpisodeStoryboardInner() {
  const { projectId, episodeId } = useParams()
  const pid = Number(projectId)
  const eid = Number(episodeId)
  const navigate = useNavigate()
  const { fitView } = useReactFlow()

  /*
   * episode / fragments / assets: dữ liệu
   * linkTargetFragId: cảnh quay đang chọn tài nguyên để liên kết
   * dirty / busy / error / status: trạng thái
   */
  const [episode, setEpisode] = useState<DramaEpisode | null>(null)
  const [fragments, setFragments] = useState<DramaFragment[]>([])
  const [assets, setAssets] = useState<DramaAsset[]>([])
  const [linkTargetFragId, setLinkTargetFragId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const fittedRef = useRef(false)
  const fragmentsRef = useRef<DramaFragment[]>([])
  const assetsRef = useRef<DramaAsset[]>([])
  const saveTimer = useRef<number | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<EpisodeFlowNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    fragmentsRef.current = fragments
  }, [fragments])

  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  // Khoá cấu trúc: dựng lại khi bản dựng hoặc tài nguyên liên kết đổi; sửa prompt thì cập nhật tại chỗ
  const structureKey = fragments
    .map((f) => {
      const aids = collectFragmentAssetIds(f).join(',')
      return `${f.id}:${f.sort_order}:${f.video || ''}:${f.cover || ''}:${f.duration_sec ?? 0}:${aids}`
    })
    .join('|')

  useEffect(() => {
    const flow = buildEpisodeFragmentFlow(fragmentsRef.current, assetsRef.current)
    setNodes(flow.nodes)
    setEdges(flow.edges)
  }, [structureKey, assets, setNodes, setEdges])

  useEffect(() => {
    fittedRef.current = false
  }, [eid])

  useEffect(() => {
    if (fittedRef.current || nodes.length === 0) return
    fittedRef.current = true
    void fitView({ padding: 0.22, duration: 280 })
  }, [nodes.length, fitView])

  // Tải tập + tài nguyên của dự án
  useEffect(() => {
    if (!eid || !pid) return
    let cancelled = false
    setBusy(true)
    setError('')
    Promise.all([dramaApi.getEpisode(eid), dramaApi.listAssets(pid)])
      .then(([ep, assetList]) => {
        if (cancelled) return
        setEpisode(ep)
        setFragments(ep.fragments || [])
        setAssets(assetList || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Tải tập thất bại')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [eid, pid])

  // Lưu toàn bộ cảnh quay (giữ thứ tự, giữ bản dựng và các tham chiếu)
  const persistFragments = useCallback(
    async (next: DramaFragment[]) => {
      if (!eid) return
      setBusy(true)
      setError('')
      try {
        const saved = await dramaApi.saveFragments(
          eid,
          next.map((f, index) => {
            const prevParams =
              f.params && typeof f.params === 'object' && !Array.isArray(f.params)
                ? (f.params as Record<string, unknown>)
                : {}
            return {
              id: typeof f.id === 'number' && f.id > 0 ? f.id : undefined,
              sort_order: index,
              content: f.content || '',
              cover: f.cover || '',
              video: f.video || '',
              duration_sec: f.duration_sec ?? 8,
              params: prevParams,
              asset_ids: collectFragmentAssetIds(f),
            }
          }),
        )
        setEpisode(saved)
        setFragments(saved.fragments || [])
        setDirty(false)
        setStatus('Đã lưu')
        window.setTimeout(() => setStatus(''), 1600)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lưu thất bại')
      } finally {
        setBusy(false)
      }
    },
    [eid],
  )

  // Lưu sau debounce
  const scheduleSave = useCallback(() => {
    setDirty(true)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void persistFragments(fragmentsRef.current)
    }, SAVE_DEBOUNCE_MS)
  }, [persistFragments])

  // Làm mới prompt của một nút cảnh quay (đổi tài nguyên liên kết thì dựng lại qua structureKey)
  const patchFragmentPrompt = useCallback(
    (fragmentId: number, content: string) => {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.type !== 'episodeFragment') return node
          const data = node.data as EpisodeFragmentNodeData
          if (data.fragmentId !== fragmentId) return node
          return { ...node, data: { ...data, content } }
        }),
      )
    },
    [setNodes],
  )

  // Sửa prompt
  const handlePromptChange = useCallback(
    (fragmentId: number, content: string) => {
      setFragments((prev) =>
        prev.map((f) => {
          if (f.id !== fragmentId) return f
          const updated = { ...f, content }
          return { ...updated, asset_ids: collectFragmentAssetIds(updated) }
        }),
      )
      patchFragmentPrompt(fragmentId, content)
      scheduleSave()
    },
    [patchFragmentPrompt, scheduleSave],
  )

  // Bỏ liên kết tài nguyên khỏi cảnh quay
  const handleUnlinkAsset = useCallback(
    (fragmentId: number, assetId: number) => {
      setFragments((prev) =>
        prev.map((f) => {
          if (f.id !== fragmentId) return f
          const content = removeAssetMention(f.content || '', assetId)
          const asset_ids = (f.asset_ids || []).filter((id) => id !== assetId)
          return { ...f, content, asset_ids }
        }),
      )
      scheduleSave()
    },
    [scheduleSave],
  )

  // Mở bảng chọn tài nguyên
  const handleRequestLinkAsset = useCallback((fragmentId: number) => {
    setLinkTargetFragId(fragmentId)
  }, [])

  // Xác nhận liên kết tài nguyên
  const handlePickAsset = useCallback(
    (asset: DramaAsset) => {
      if (linkTargetFragId == null) return
      const fragmentId = linkTargetFragId
      setFragments((prev) =>
        prev.map((f) => {
          if (f.id !== fragmentId) return f
          const content = ensureAssetMention(f.content || '', asset.id)
          const asset_ids = Array.from(new Set([...(f.asset_ids || []), asset.id]))
          return { ...f, content, asset_ids }
        }),
      )
      setLinkTargetFragId(null)
      scheduleSave()
    },
    [linkTargetFragId, scheduleSave],
  )

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      episodeFragment: (props) => (
        <EpisodeFragmentNode
          {...props}
          onPromptChange={handlePromptChange}
          onRequestLinkAsset={handleRequestLinkAsset}
        />
      ),
      episodeAsset: (props) => (
        <EpisodeAssetNode {...props} onUnlinkAsset={handleUnlinkAsset} />
      ),
    }),
    [handlePromptChange, handleRequestLinkAsset, handleUnlinkAsset],
  )

  const linkFrag = fragments.find((f) => f.id === linkTargetFragId) || null
  const linkedIdSet = new Set(linkFrag ? collectFragmentAssetIds(linkFrag) : [])
  const pickerAssets = assets.filter((a) => {
    const tab = normalizeAssetTab(a.type || '')
    return Boolean(tab) && !linkedIdSet.has(a.id)
  })

  const backHref = `/drama/projects/${pid}/episodes/${eid}`

  return (
    <div className="ep-storyboard-page">
      <header className="ep-storyboard-topbar">
        <div className="ep-storyboard-topbar-left">
          <button
            type="button"
            className="ep-storyboard-back"
            aria-label="Quay lại tập phim"
            title="Quay lại tập phim"
            onClick={() => navigate(backHref)}
          >
            <ChevronLeft size={20} strokeWidth={1.8} />
          </button>
          <div className="ep-storyboard-title">
            <strong>{episode?.name || `Tập ${eid}`}</strong>
            <span>
              Storyboard · {fragments.length} cảnh quay
              {dirty ? ' · Chưa lưu' : status ? ` · ${status}` : ''}
            </span>
          </div>
        </div>
        <div className="ep-storyboard-actions">
          <button
            type="button"
            className="ep-storyboard-btn ghost"
            onClick={() => navigate(`/drama/projects/${pid}/canvas`)}
          >
            Canvas tài nguyên
          </button>
          <button
            type="button"
            className="ep-storyboard-btn dark"
            disabled={busy || !dirty}
            onClick={() => void persistFragments(fragments)}
          >
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </header>

      <div className="ep-storyboard-flow">
        {fragments.length === 0 && !busy ? (
          <div className="ep-storyboard-empty">
            <strong>Chưa có cảnh quay nào</strong>
            <span>Hãy quay lại trang sửa tập để thêm cảnh quay</span>
          </div>
        ) : null}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.35}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: 'default' }}
        >
          <Background gap={20} size={1} color="#dbe2ea" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
        {error ? (
          <p className="ep-storyboard-toast" role="alert">
            {error}
          </p>
        ) : null}
        {busy && fragments.length === 0 ? (
          <p className="ep-storyboard-toast">Đang tải…</p>
        ) : null}
      </div>

      <Modal
        open={linkTargetFragId != null}
        onClose={() => setLinkTargetFragId(null)}
        title="Liên kết tài nguyên trong cảnh quay"
        size="lg"
      >
        <p className="ep-storyboard-picker-hint">Chọn nhân vật / bối cảnh / đạo cụ xuất hiện trong cảnh quay này</p>
        {pickerAssets.length === 0 ? (
          <p className="ep-storyboard-picker-empty">Chưa có tài nguyên nào để chọn, hãy tạo trong Canvas tài nguyên trước</p>
        ) : (
          <div className="ep-storyboard-picker-grid">
            {pickerAssets.map((asset) => {
              const cover = resolveDramaAssetPreviewUrl(asset)
              return (
                <button
                  key={asset.id}
                  type="button"
                  className="ep-storyboard-picker-card"
                  onClick={() => handlePickAsset(asset)}
                >
                  <div className="ep-storyboard-picker-thumb">
                    {cover ? <img src={cover} alt="" /> : <span>{(asset.name || '?')[0]}</span>}
                  </div>
                  <strong>{asset.name || `Tài nguyên ${asset.id}`}</strong>
                  <em>{normalizeAssetTab(asset.type || '') || asset.type || 'tài nguyên'}</em>
                </button>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}
