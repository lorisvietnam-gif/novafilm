/** Bảng nổi nhập câu lệnh AI ở dưới node đang chọn (sinh ảnh / sinh video) */
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { ArrowUp, CircleHelp, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { SeedanceRulesModal } from '../../../../components/drama/SeedanceRulesModal'
import { useCanvasStore } from '../CanvasStore'
import { CANVAS_GENERATABLE_KINDS, type CanvasNodeKind } from '../canvasTypes'
import {
  defaultOptionsForAssetKind,
  type ImageGenerationOptions,
} from '../../../../lib/dramaGenerationOptions'
import {
  DEFAULT_VIDEO_GENERATION_OPTIONS,
  readVideoGenerationOptions,
  type VideoGenerationOptions,
} from '../../../../lib/dramaVideoGenerationOptions'
import { optimizePromptWithSkills } from '../../../../api/agentSkills'
import { useAgentSkillSelection } from '../../../../hooks/useAgentSkillSelection'
import { DramaImageGenOptionsBar } from './DramaImageGenOptionsBar'
import { DramaSkillOptionsBar } from './DramaSkillOptionsBar'
import { DramaVideoGenOptionsBar } from './DramaVideoGenOptionsBar'
import { CanvasPromptEditor } from './CanvasPromptEditor'
import { BetaNotice, BetaPromptResult } from '../../../../components/ui/BetaNotice'

type CanvasNodeGeneratePanelProps = {
  nodeId: string
  kind: CanvasNodeKind
  generating?: boolean
  defaultPrompt?: string
  /** Tên hiển thị của node, dùng để lọc bỏ câu lệnh mặc định vô nghĩa */
  label?: string
  /** Đã có ảnh tham chiếu chưa (từ thư viện tư liệu hoặc tải lên) */
  hasMedia?: boolean
  /** Tham số Seedance đã lưu của node video */
  videoOptions?: Record<string, unknown>
}

/** Chữ của bảng theo loại node */
function panelCopy(kind: CanvasNodeKind, hasMedia: boolean) {
  if (kind === 'video') {
    return {
      title: hasMedia ? 'Sửa và sinh lại video' : 'AI tạo video',
      placeholder: 'Mô tả hình ảnh video, chuyển động máy quay và không khí; gõ @ để trích dẫn nhân vật / bối cảnh…',
      hint: 'Enter để tạo video · @ để trích dẫn · Shift+Enter xuống dòng',
    }
  }
  if (kind === 'character') {
    return {
      title: hasMedia ? 'Sửa và sinh lại nhân vật' : 'AI tạo nhân vật',
      placeholder: 'Mô tả ngoại hình, trang phục và thần thái của nhân vật…',
      hint: 'Enter để tạo · Shift+Enter xuống dòng',
    }
  }
  if (kind === 'scene') {
    return {
      title: hasMedia ? 'Sửa và sinh lại bối cảnh' : 'AI tạo bối cảnh',
      placeholder: 'Mô tả không gian, ánh sáng và không khí của bối cảnh…',
      hint: 'Enter để tạo · Shift+Enter xuống dòng',
    }
  }
  return {
    title: hasMedia ? 'Sửa và sinh lại ảnh' : 'AI tạo ảnh',
    placeholder: 'Mô tả nội dung khung hình; gõ @ để trích dẫn nhân vật / bối cảnh…',
    hint: 'Enter để tạo · @ để trích dẫn · Shift+Enter xuống dòng',
  }
}

const PLACEHOLDER_PROMPT = /^(character|scene|prop|material|none|image|audio|video)\s+\S+$/i

/** Làm sạch câu lệnh mặc định: chỉ bỏ loại chỗ như «video video mới», giữ lại mô tả ngắn của người dùng và các trích dẫn @ */
function sanitizePrompt(raw: string, kind: CanvasNodeKind, label: string): string {
  const text = (raw || '').trim()
  if (!text) return ''
  if (PLACEHOLDER_PROMPT.test(text)) return ''
  if (label && (text === `${kind} ${label}` || text === label)) return ''
  return text
}

/** Dựng bảng chỉnh câu lệnh AI */
export function CanvasNodeGeneratePanel({
  nodeId,
  kind,
  generating = false,
  defaultPrompt = '',
  label = '',
  hasMedia = false,
  videoOptions: savedVideoOptions,
}: CanvasNodeGeneratePanelProps) {
  const {
    generateNodeImage,
    generateNodeVideo,
    setErrorMessage,
    projectImageStyleId,
    updateNodePrompt,
    updateNodeVideoOptions,
    mentionableNodes,
  } = useCanvasStore()
  const [prompt, setPrompt] = useState(() => sanitizePrompt(defaultPrompt, kind, label))
  /*
   * busy đang gửi yêu cầu tạo
   * rulesOpen hộp luật của Seedance
   * optimizing đang viết lại bằng Skill
   */
  const [busy, setBusy] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  // promptReady là prompt vừa tạo của node video, để hiện kèm nút sao chép
  const [promptReady, setPromptReady] = useState('')
  const { skills, selectedIds, toggleSkill, selectAll, selectNone, uploadSkill, uploading, uploadError } =
    useAgentSkillSelection()
  // imageOptions phong cách / model / tỉ lệ khung hình khi sinh ảnh
  const [imageOptions, setImageOptions] = useState<ImageGenerationOptions>(() => ({
    ...defaultOptionsForAssetKind(kind),
    image_style_id: projectImageStyleId || undefined,
  }))
  // videoOpts thời lượng / tỉ lệ / độ rõ của Seedance
  const [videoOpts, setVideoOpts] = useState<VideoGenerationOptions>(() => {
    const saved = readVideoGenerationOptions(savedVideoOptions)
    return {
      ...DEFAULT_VIDEO_GENERATION_OPTIONS,
      ...saved,
      image_style_id: saved.image_style_id || projectImageStyleId || undefined,
    }
  })
  const copy = panelCopy(kind, hasMedia)
  const allowMention = kind === 'video' || kind === 'image'
  const isVideo = kind === 'video'

  /* Có thể trích dẫn: loại trừ chính node hiện tại */
  const mentionItems = useMemo(
    () => mentionableNodes.filter((n) => n.nodeId !== nodeId),
    [mentionableNodes, nodeId],
  )

  const lastNodeIdRef = useRef(nodeId)

  /* Khi đổi node thì ép đồng bộ; cùng một node thì không dùng giá trị mặc định rỗng để xoá nội dung người dùng đã gõ */
  useEffect(() => {
    const switched = lastNodeIdRef.current !== nodeId
    lastNodeIdRef.current = nodeId
    const next = sanitizePrompt(defaultPrompt, kind, label)
    if (switched) {
      setPrompt(next)
      setPromptReady('')
      return
    }
    setPrompt((prev) => next || prev)
  }, [defaultPrompt, nodeId, kind, label])

  /* Đồng bộ tuỳ chọn mặc định khi loại node hoặc phong cách của dự án đổi */
  useEffect(() => {
    setImageOptions((prev) => ({
      ...defaultOptionsForAssetKind(kind),
      image_style_id: prev.image_style_id || projectImageStyleId || undefined,
      model_id: prev.model_id,
      resolution: prev.resolution,
    }))
  }, [kind, nodeId, projectImageStyleId])

  useEffect(() => {
    const saved = readVideoGenerationOptions(savedVideoOptions)
    setVideoOpts({
      ...DEFAULT_VIDEO_GENERATION_OPTIONS,
      ...saved,
      image_style_id: saved.image_style_id || projectImageStyleId || undefined,
    })
    // Chỉ khôi phục tham số đã lưu khi chuyển node, để lúc sửa tuỳ chọn không bị ghi đè
  }, [nodeId, projectImageStyleId])

  const isBusy = busy || generating || optimizing
  const canSubmit = prompt.trim().length > 0 && !isBusy
  const canOptimize = prompt.trim().length > 0 && selectedIds.length > 0 && !isBusy

  if (!CANVAS_GENERATABLE_KINDS.has(kind)) return null

  const stopFlowEvent = (event: MouseEvent) => {
    event.stopPropagation()
  }

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      updateNodePrompt(nodeId, prompt)
      if (isVideo) {
        updateNodeVideoOptions(nodeId, videoOpts)
      }
      if (isVideo) {
        await generateNodeVideo(nodeId, prompt, videoOpts)
        // Bản beta này cho ra prompt chứ không có video, nên nói đúng và đưa nút sao chép
        setPromptReady(prompt.trim())
      } else {
        setPromptReady('')
        await generateNodeImage(nodeId, prompt, imageOptions)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Tạo thất bại')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit()
  }

  // Viết lại câu lệnh hiện tại theo các Skill đã chọn, giữ nguyên trích dẫn @asset
  const optimizePrompt = async () => {
    if (!canOptimize) return
    setOptimizing(true)
    try {
      const result = await optimizePromptWithSkills({
        prompt,
        skill_ids: selectedIds,
        task: isVideo ? 'video_prompt' : 'image_prompt',
      })
      const next = (result.prompt || '').trim()
      if (next) {
        setPrompt(next)
        updateNodePrompt(nodeId, next)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Tối ưu bằng Skill thất bại')
    } finally {
      setOptimizing(false)
    }
  }

  return (
    <form
      className={`fc-generate-panel nodrag nopan nowheel${hasMedia ? ' has-media' : ''}`}
      onMouseDown={stopFlowEvent}
      onPointerDown={stopFlowEvent}
      onClick={stopFlowEvent}
      onSubmit={handleSubmit}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          updateNodePrompt(nodeId, prompt)
        }
      }}
    >
      <div className="fc-generate-head">
        <Sparkles size={14} strokeWidth={1.8} />
        <span>{copy.title}</span>
        {hasMedia ? <em className="fc-generate-tag">Có thể tạo lại</em> : null}
        {isVideo ? (
          <button
            type="button"
            className="fc-generate-help"
            title="Cách truyền giá trị và quy tắc dùng của Seedance"
            aria-label="Cách truyền giá trị và quy tắc dùng của Seedance"
            disabled={isBusy}
            onClick={() => setRulesOpen(true)}
          >
            <CircleHelp size={14} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
      <CanvasPromptEditor
        value={prompt}
        placeholder={copy.placeholder}
        disabled={isBusy}
        allowMention={allowMention}
        mentionItems={mentionItems}
        onChange={(next) => {
          setPrompt(next)
          // Sửa prompt là kết quả cũ không còn đúng
          setPromptReady('')
        }}
        onSubmit={() => void submit()}
      />
      {isVideo ? (
        <DramaVideoGenOptionsBar
          value={videoOpts}
          disabled={isBusy}
          onChange={(next) => {
            setVideoOpts(next)
            updateNodeVideoOptions(nodeId, next)
          }}
        />
      ) : (
        <DramaImageGenOptionsBar value={imageOptions} onChange={setImageOptions} disabled={isBusy} />
      )}
      <DramaSkillOptionsBar
        skills={skills}
        selectedIds={selectedIds}
        disabled={isBusy}
        onToggle={toggleSkill}
        onSelectAll={selectAll}
        onSelectNone={selectNone}
        onUpload={(file) => void uploadSkill(file)}
        uploading={uploading}
        uploadError={uploadError}
      />
      {isVideo ? (
        // Dòng này đứng ngay trên nút tạo: người dùng đọc trước khi bấm.
        <BetaNotice placement="drama-canvas-video" variant="compact" />
      ) : null}
      {isVideo && promptReady ? <BetaPromptResult prompt={promptReady} /> : null}
      <div className="fc-generate-actions">
        <span className="fc-generate-hint">{copy.hint}</span>
        <div className="fc-generate-action-btns">
          <button
            type="button"
            className="fc-generate-optimize"
            disabled={!canOptimize}
            title={selectedIds.length ? 'Viết lại câu lệnh theo các Skill đã chọn' : 'Hãy chọn Skill trước'}
            onClick={() => void optimizePrompt()}
          >
            {optimizing ? <Loader2 size={14} className="fc-spin" /> : <Wand2 size={14} strokeWidth={1.8} />}
            Tối ưu bằng Skill
          </button>
          <button type="submit" className="fc-generate-submit" disabled={!canSubmit} aria-label="Tạo">
            {isBusy && !optimizing ? (
              <Loader2 size={16} className="fc-spin" />
            ) : (
              <ArrowUp size={16} strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
      {isVideo ? <SeedanceRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} /> : null}
    </form>
  )
}
