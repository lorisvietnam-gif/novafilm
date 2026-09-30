/** Node tư liệu tuỳ biến trên canvas: icon theo loại + thẻ media + thanh công cụ khi được chọn */
import {
  memo,
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react'
import {
  Handle,
  NodeToolbar,
  Position,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { AudioLines, Image as ImageIcon, Landmark, Loader2, Maximize2, Play, UserRound } from 'lucide-react'
import { resolveDramaMediaUrl } from '../../../api/drama'
import { isAudioUrl, isPlayableVideoUrl } from '../../../lib/canvasNodeMedia'
import { DramaImageStylePreviewImg } from '../../../components/drama/DramaImageStylePreviewImg'
import type { ImageStyleId } from '../../../lib/dramaImageStyles'
import { useCanvasStore } from './CanvasStore'
import {
  CANVAS_GENERATABLE_KINDS,
  CANVAS_NODE_OPTION_BY_KIND,
  CANVAS_UPLOADABLE_KINDS,
  canvasMediaFrameSize,
  type CanvasAssetNodeData,
} from './canvasTypes'
import { CanvasNodeGeneratePanel } from './nodes/CanvasNodeGeneratePanel'
import { CanvasNodePreviewModal } from './CanvasNodePreviewModal'
import { CanvasNodeUploadBar } from './nodes/CanvasNodeUploadBar'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../../lib/dramaVoiceBinding'

/** Ảnh nhỏ video trên canvas: chỉ hiện ảnh bìa, không chặn click đơn (click đơn dùng để chọn node và mở bảng câu lệnh) */
function CanvasAssetVideoPreview({
  src,
  onAspect,
}: {
  src: string
  onAspect?: (aspect: number) => void
}) {
  return (
    <div className="fc-asset-video">
      <video
        className="fc-asset-media"
        src={src}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const el = event.currentTarget
          if (el.videoWidth > 0 && el.videoHeight > 0) {
            onAspect?.(el.videoWidth / el.videoHeight)
          }
        }}
      />
      <span className="fc-asset-video-play" aria-hidden>
        <Play size={22} strokeWidth={2.2} fill="currentColor" />
      </span>
    </div>
  )
}

/** Icon chờ theo loại tư liệu */
function PlaceholderIcon({ kind }: { kind: CanvasAssetNodeData['kind'] }) {
  const className = 'fc-placeholder-icon'
  if (kind === 'character') return <UserRound className={className} size={40} strokeWidth={1.4} />
  if (kind === 'scene') return <Landmark className={className} size={40} strokeWidth={1.4} />
  if (kind === 'video') return <Play className={className} size={40} strokeWidth={1.4} />
  if (kind === 'audio') return <AudioLines className={className} size={32} strokeWidth={1.4} />
  if (kind === 'text') return null
  return <ImageIcon className={className} size={40} strokeWidth={1.4} />
}

/** Ảnh nền cho ô chờ, chọn theo loại tư liệu; loại không có ảnh thì chỉ hiện icon */
const NODE_WAITING_STILL: Partial<Record<CanvasAssetNodeData['kind'], ImageStyleId>> = {
  character: 'wuxia-realistic-photo',
  scene: 'palace-intrigue-cold',
  image: 'retro-narrative-film',
  video: 'neon-cyberpunk-film',
}

/** Khung chờ của node: ảnh thật làm nền mờ, icon phủ lên trên */
function NodeWaitingStill({ kind }: { kind: CanvasAssetNodeData['kind'] }) {
  const styleId = NODE_WAITING_STILL[kind]
  return (
    <div className="fc-asset-waiting">
      {styleId ? (
        <DramaImageStylePreviewImg styleId={styleId} alt="" loading="lazy" />
      ) : null}
      <PlaceholderIcon kind={kind} />
    </div>
  )
}

/** Dựng một node tư liệu trên canvas */
function CanvasAssetNodeComponent({ id, data, selected }: NodeProps<Node<CanvasAssetNodeData>>) {
  const { updateNodeTextContent, renameNode } = useCanvasStore()
  const updateNodeInternals = useUpdateNodeInternals()
  const option = CANVAS_NODE_OPTION_BY_KIND[data.kind]
  const Icon = option.icon
  const isText = data.kind === 'text'
  const mediaSrc = resolveDramaMediaUrl(data.mediaUrl)
  const showUpload = selected && CANVAS_UPLOADABLE_KINDS.has(data.kind)
  const showGenerate = selected && CANVAS_GENERATABLE_KINDS.has(data.kind)
  const voiceLabel = typeof data.voiceLabel === 'string' ? data.voiceLabel : ''
  const voiceUrl = typeof data.voiceUrl === 'string' ? data.voiceUrl : ''
  const displayName =
    data.kind === 'character'
      ? typeof data.characterName === 'string' && data.characterName
        ? data.characterName
        : data.label || option.label
      : data.label || option.label
  const footerLabel =
    data.kind === 'character'
      ? DRAMA_VOICE_BINDING_ENABLED && voiceLabel
        ? `Hình nền · ${voiceLabel}`
        : 'Hình nền'
      : data.kind === 'scene'
        ? displayName
        : null

  // renaming có đang sửa tên node không
  // draftName bản nháp tên đang sửa
  // previewOpen có đang mở xem trước toàn màn hình không
  // mediaAspect tỉ lệ khung media (rộng / cao), dùng để khung xem trướng tự co theo chiều ngang dọc
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(displayName)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mediaAspect, setMediaAspect] = useState<number | null>(null)
  const audioSrc = resolveDramaMediaUrl(voiceUrl || (data.kind === 'audio' ? mediaSrc : ''))
  const textContent = typeof data.textContent === 'string' ? data.textContent : ''
  const canPreview = Boolean(mediaSrc || audioSrc || textContent.trim())
  const frameSize = canvasMediaFrameSize(data.kind, mediaSrc ? mediaAspect : null)
  const orientationClass =
    mediaSrc && mediaAspect
      ? mediaAspect > 1.05
        ? ' is-landscape'
        : mediaAspect < 0.95
          ? ' is-portrait'
          : ' is-square'
      : ''

  useEffect(() => {
    setMediaAspect(null)
  }, [mediaSrc])

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, frameSize.width, frameSize.height, updateNodeInternals])

  /** Sau khi ảnh tải xong thì cập nhật tỉ lệ khung xem trước theo kích thước gốc */
  const handleImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const el = event.currentTarget
    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
      setMediaAspect(el.naturalWidth / el.naturalHeight)
    }
  }, [])

  /** Video sẵn sàng metadata thì cập nhật tỉ lệ khung xem trước */
  const handleVideoAspect = useCallback((aspect: number) => {
    if (aspect > 0) setMediaAspect(aspect)
  }, [])

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeTextContent(id, event.target.value)
    },
    [id, updateNodeTextContent],
  )

  /** Bắt đầu đổi tên */
  const startRename = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    setDraftName(displayName)
    setRenaming(true)
  }

  /** Xác nhận đổi tên */
  const commitRename = () => {
    setRenaming(false)
    const next = draftName.trim()
    if (!next || next === displayName) return
    void renameNode(id, next)
  }

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitRename()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setRenaming(false)
      setDraftName(displayName)
    }
  }

  /** Nhấp đúp lên thẻ: xem trước toàn màn hình (click đơn dành cho chọn node / mở bảng câu lệnh) */
  const handleCardDoubleClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('textarea, input, button, a')) return
    if (!canPreview) return
    event.preventDefault()
    setPreviewOpen(true)
  }

  /** Nút phóng to ở góc: chặn sự kiện lan truyền để không cướp mất thao tác chọn node */
  const handleExpandClick = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (!canPreview) return
    setPreviewOpen(true)
  }

  return (
    <div className={`fc-asset-node${selected ? ' is-selected' : ''}${data.generating ? ' is-generating' : ''}`}>
      {showUpload ? (
        <NodeToolbar nodeId={id} position={Position.Top} align="center" offset={10}>
          <CanvasNodeUploadBar
            nodeId={id}
            kind={data.kind}
            voiceLabel={data.kind === 'character' ? voiceLabel || null : null}
            voiceUrl={data.kind === 'character' ? voiceUrl || null : null}
          />
        </NodeToolbar>
      ) : null}

      <div className="fc-asset-node-header">
        <Icon size={14} strokeWidth={1.8} />
        {renaming ? (
          <input
            className="fc-node-rename nodrag nopan nowheel"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Tên node"
          />
        ) : (
          <button
            type="button"
            className="fc-node-title nodrag nopan"
            title="Nhấp đúp để đổi tên"
            onDoubleClick={startRename}
          >
            {displayName}
          </button>
        )}
      </div>

      <div
        className={`fc-asset-card${canPreview ? ' is-previewable' : ''}`}
        title={canPreview ? 'Nhấp đúp để xem toàn màn hình' : undefined}
        onDoubleClick={handleCardDoubleClick}
      >
        <div
          className={`fc-asset-body is-${data.kind}${orientationClass}`}
          style={
            data.kind === 'text' || data.kind === 'audio'
              ? undefined
              : { width: frameSize.width, height: frameSize.height }
          }
        >
          {isText ? (
            selected ? (
              <textarea
                className="fc-text-editor nodrag nowheel"
                value={data.textContent || ''}
                onChange={handleTextChange}
                placeholder="Nhập nội dung…"
                rows={4}
              />
            ) : (
              <span>{data.textContent || data.label || 'Văn bản'}</span>
            )
          ) : data.generating ? (
            <div className="fc-generating">
              <Loader2 size={28} className="fc-spin" />
              <span>Đang sinh…</span>
            </div>
          ) : mediaSrc && data.kind === 'video' && isPlayableVideoUrl(mediaSrc) ? (
            <CanvasAssetVideoPreview src={mediaSrc} onAspect={handleVideoAspect} />
          ) : mediaSrc && (data.kind === 'audio' || isAudioUrl(mediaSrc)) ? (
            <div className="fc-asset-audio-thumb">
              <AudioLines size={28} strokeWidth={1.6} />
              <span className="fc-asset-video-play" aria-hidden>
                <Play size={18} strokeWidth={2.2} fill="currentColor" />
              </span>
            </div>
          ) : mediaSrc ? (
            <img
              key={mediaSrc}
              className="fc-asset-media"
              src={mediaSrc}
              alt={displayName}
              draggable={false}
              onLoad={handleImageLoad}
            />
          ) : (
            <NodeWaitingStill kind={data.kind} />
          )}
          {canPreview ? (
            <button
              type="button"
              className="fc-asset-expand nodrag nopan nowheel"
              title="Xem toàn màn hình"
              aria-label={`Xem toàn màn hình ${displayName}`}
              onClick={handleExpandClick}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Maximize2 size={14} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
        {footerLabel ? <div className="fc-asset-footer">{footerLabel}</div> : null}
      </div>

      {showGenerate ? (
        <NodeToolbar
          nodeId={id}
          className="nodrag nopan nowheel"
          position={Position.Bottom}
          align="center"
          offset={14}
          isVisible={selected}
        >
          <CanvasNodeGeneratePanel
            nodeId={id}
            kind={data.kind}
            generating={Boolean(data.generating)}
            defaultPrompt={typeof data.promptHint === 'string' ? data.promptHint : ''}
            label={data.label || ''}
            hasMedia={Boolean(mediaSrc)}
            videoOptions={data.videoOptions}
          />
        </NodeToolbar>
      ) : null}

      <Handle className="fc-handle" type="target" position={Position.Left} />
      <Handle className="fc-handle" type="source" position={Position.Right} />
      {previewOpen && canPreview ? (
        <CanvasNodePreviewModal
          payload={{
            kind: data.kind,
            title: displayName,
            mediaUrl: mediaSrc || null,
            voiceUrl: audioSrc || null,
            textContent,
          }}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  )
}

export const CanvasAssetNode = memo(CanvasAssetNodeComponent)
