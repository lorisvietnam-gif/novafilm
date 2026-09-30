/** Nút storyboard: video ở trên, prompt ở dưới; tài nguyên trong cảnh quay liên kết bằng đường nối từ nút bên trái */
import { memo, useCallback, type ChangeEvent } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Clapperboard, Plus } from 'lucide-react'
import type { EpisodeFragmentNodeData } from './buildEpisodeFlow'

type Props = NodeProps<Node<EpisodeFragmentNodeData>> & {
  onPromptChange?: (fragmentId: number, content: string) => void
  onRequestLinkAsset?: (fragmentId: number) => void
}

// Render một nút cảnh quay
function EpisodeFragmentNodeComponent({
  data,
  selected,
  onPromptChange,
  onRequestLinkAsset,
}: Props) {
  const hasVideo = Boolean(data.videoUrl)
  const media = data.coverUrl || data.videoUrl

  const handlePromptChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onPromptChange?.(data.fragmentId, event.target.value)
    },
    [data.fragmentId, onPromptChange],
  )

  return (
    <div className={`ep-frag-node${selected ? ' is-selected' : ''}`}>
      <div className="ep-frag-node-head">
        <Clapperboard size={14} strokeWidth={1.8} aria-hidden />
        <span>{data.label}</span>
        {selected ? (
          <button
            type="button"
            className="ep-frag-link-btn nodrag nopan"
            title="Liên kết tài nguyên trong cảnh quay"
            aria-label="Liên kết tài nguyên trong cảnh quay"
            onClick={() => onRequestLinkAsset?.(data.fragmentId)}
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        ) : (
          <em className="ep-frag-link-count">{data.linkedCount || 0} tài nguyên</em>
        )}
      </div>

      <div className="ep-frag-media">
        {hasVideo ? (
          <video
            className="ep-frag-video"
            src={data.videoUrl}
            poster={data.coverUrl || undefined}
            controls
            playsInline
            preload="metadata"
          />
        ) : media ? (
          <img src={media} alt="" draggable={false} />
        ) : (
          <div className="ep-frag-media-empty">
            <span>Chưa có bản dựng</span>
            <small>Sẽ hiện ở đây sau khi tạo</small>
          </div>
        )}
      </div>

      <div className="ep-frag-prompt">
        <label>Prompt</label>
        {selected ? (
          <textarea
            className="ep-frag-prompt-input nodrag nowheel"
            value={data.content}
            onChange={handlePromptChange}
            placeholder="Kịch bản storyboard / prompt Seedance…"
            rows={5}
          />
        ) : (
          <p className="ep-frag-prompt-text">
            {(data.content || '').trim() || '(Chưa có prompt)'}
          </p>
        )}
      </div>

      <Handle
        className="ep-frag-handle"
        type="target"
        position={Position.Left}
        id="assets"
        style={{ top: '62%' }}
      />
      <Handle
        className="ep-frag-handle"
        type="target"
        position={Position.Left}
        id="seq-in-l"
        style={{ top: '38%' }}
      />
      <Handle className="ep-frag-handle" type="source" position={Position.Right} id="seq-out-r" />
      <Handle className="ep-frag-handle" type="target" position={Position.Top} id="seq-in-t" />
      <Handle className="ep-frag-handle" type="source" position={Position.Bottom} id="seq-out-b" />
    </div>
  )
}

export const EpisodeFragmentNode = memo(EpisodeFragmentNodeComponent)
