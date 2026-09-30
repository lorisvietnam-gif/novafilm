/** Thanh trên node đang chọn: tải lên từ máy + chọn từ thư viện tư liệu toàn cục + sinh / nghe thử giọng cho nhân vật */
import { useCallback, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { AudioLines, FolderOpen, Loader2, Upload } from 'lucide-react'
import { dramaApi } from '../../../../api/drama'
import { CharacterVoicePreviewButton } from '../../../../components/drama/CharacterVoicePreviewButton'
import { generateAndBindCharacterVoice } from '../../../../lib/characterVoiceGenerate'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../../../lib/dramaVoiceBinding'
import { useCanvasStore } from '../CanvasStore'
import { CANVAS_UPLOADABLE_KINDS, type CanvasNodeKind } from '../canvasTypes'
import {
  canvasKindToLibraryTypes,
  GlobalAssetPickerModal,
} from '../../GlobalAssetPickerModal'

type CanvasNodeUploadBarProps = {
  nodeId: string
  kind: CanvasNodeKind
  /** Tên giọng đã gắn của node nhân vật */
  voiceLabel?: string | null
  /** Địa chỉ nghe thử của giọng đã gắn cho node nhân vật */
  voiceUrl?: string | null
}

/** Dựng thanh thao tác tải lên và chọn từ thư viện cho node đang chọn */
export function CanvasNodeUploadBar({
  nodeId,
  kind,
  voiceLabel,
  voiceUrl,
}: CanvasNodeUploadBarProps) {
  /*
   * uploading đang tải lên từ máy
   * pickerOpen hộp chọn từ thư viện tư liệu
   * voiceLoading đang sinh giọng hoặc tải tư liệu của nhân vật
   */
  const {
    uploadNodeMedia,
    applyLibraryMediaToNode,
    syncNodeFromAsset,
    ensureNodeAsset,
    setErrorMessage,
    projectId,
  } = useCanvasStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)

  const stopFlowEvent = useCallback((event: MouseEvent) => {
    event.stopPropagation()
  }, [])

  if (!CANVAS_UPLOADABLE_KINDS.has(kind)) return null

  const isCharacter = kind === 'character'
  const hasVoice = Boolean(voiceUrl || voiceLabel)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Vui lòng chọn một tệp ảnh')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('Ảnh không được vượt quá 20 MB')
      return
    }

    setUploading(true)
    void uploadNodeMedia(nodeId, file)
      .catch((err) => setErrorMessage(err instanceof Error ? err.message : 'Tải lên thất bại'))
      .finally(() => setUploading(false))
  }

  // Sinh giọng bằng AI và gắn vào node nhân vật
  async function handleGenerateVoice() {
    if (voiceLoading) return
    setVoiceLoading(true)
    try {
      const assetId = await ensureNodeAsset(nodeId)
      const list = await dramaApi.listAssets(projectId)
      const asset = list.find((a) => a.id === assetId)
      if (!asset) throw new Error('Không tìm thấy tư liệu của nhân vật')
      const { character } = await generateAndBindCharacterVoice(projectId, asset)
      syncNodeFromAsset(nodeId, character)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sinh giọng thất bại')
    } finally {
      setVoiceLoading(false)
    }
  }

  return (
    <>
      <div className="fc-node-toolbar nodrag nopan" onMouseDown={stopFlowEvent} onPointerDown={stopFlowEvent}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="fc-hidden-input"
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="fc-toolbar-chip"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 size={14} className="fc-spin" /> : <Upload size={14} strokeWidth={1.8} />}
          {uploading ? 'Đang tải lên…' : 'Tải ảnh lên'}
        </button>
        <button
          type="button"
          className="fc-toolbar-chip"
          disabled={uploading}
          onClick={() => setPickerOpen(true)}
        >
          <FolderOpen size={14} strokeWidth={1.8} />
          Chọn từ thư viện tư liệu
        </button>
        {DRAMA_VOICE_BINDING_ENABLED && isCharacter ? (
          hasVoice && voiceUrl ? (
            <CharacterVoicePreviewButton
              url={voiceUrl}
              label={voiceLabel || undefined}
              variant="chip"
              className="is-active"
              onError={setErrorMessage}
            />
          ) : (
            <button
              type="button"
              className="fc-toolbar-chip"
              disabled={uploading || voiceLoading}
              onClick={() => void handleGenerateVoice()}
              title="Dùng AI sinh giọng theo phần thiết kế của nhân vật"
            >
              {voiceLoading ? (
                <Loader2 size={14} className="fc-spin" />
              ) : (
                <AudioLines size={14} strokeWidth={1.8} />
              )}
              {voiceLoading ? 'Đang sinh…' : 'Sinh giọng'}
            </button>
          )
        ) : null}
      </div>

      <GlobalAssetPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        projectId={projectId}
        defaultTab="all"
        allowedTypes={canvasKindToLibraryTypes(kind)}
        title="Chọn từ thư viện tư liệu"
        confirmLabel="Dùng mục này"
        onPick={async (source) => {
          await applyLibraryMediaToNode(nodeId, source)
        }}
      />
    </>
  )
}
