/**
 * Gán giọng đọc cho phần lời dẫn: chọn từ tài nguyên voice của dự án,
 * ghi vào project.params.narrationVoiceAudio để Seedance dùng làm reference_audio toàn cục.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines } from 'lucide-react'
import { dramaApi, resolveDramaMediaUrl, type DramaAsset, type DramaProject } from '../../api/drama'
import Modal from '../../components/ui/Modal'
import type { VoiceBinding } from './CharacterVoiceBindModal'

type Props = {
  project: DramaProject
  open: boolean
  onClose: () => void
  onUpdated: (project: DramaProject) => void
  onError: (message: string) => void
}

function readNarrationVoiceBinding(project: DramaProject): VoiceBinding | null {
  const params = project.params || {}
  const raw = (params as Record<string, unknown>).narrationVoiceAudio
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const sourceAssetId = typeof data.sourceAssetId === 'number' ? data.sourceAssetId : null
  const url = typeof data.url === 'string' ? data.url : ''
  const label = typeof data.label === 'string' ? data.label : 'Giọng dẫn chuyện'
  if (!sourceAssetId || !url) return null
  return {
    sourceAssetId,
    url,
    label,
    voicePrompt: typeof data.voicePrompt === 'string' ? data.voicePrompt : undefined,
  }
}

export function NarratorVoiceBindModal({ project, open, onClose, onUpdated, onError }: Props) {
  const [voiceAssets, setVoiceAssets] = useState<DramaAsset[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const current = useMemo(() => readNarrationVoiceBinding(project), [project])

  const selectedVoice = useMemo(
    () => voiceAssets.find((v) => v.id === selectedId) || null,
    [voiceAssets, selectedId],
  )
  const previewUrl = selectedVoice?.url ? resolveDramaMediaUrl(selectedVoice.url) : ''

  const boundRef = useRef(false)
  useEffect(() => {
    if (!open) {
      boundRef.current = false
      return
    }
    if (boundRef.current) return
    boundRef.current = true

    setSelectedId(current?.sourceAssetId ?? null)
    dramaApi
      .listAssets(project.id)
      .then((list) => {
        const voices = list.filter((a) => (a.type || '').toLowerCase() === 'voice')
        setVoiceAssets(voices)
      })
      .catch((err) => onError(err instanceof Error ? err.message : 'Tải tài nguyên giọng đọc thất bại'))
  }, [current?.sourceAssetId, onError, open, project.id])

  const handleConfirm = useCallback(async () => {
    if (!selectedVoice?.url || busy) {
      onError('Hãy chọn một giọng đọc cho lời dẫn đã tổng hợp')
      return
    }
    setBusy(true)
    try {
      const binding: VoiceBinding = {
        sourceAssetId: selectedVoice.id,
        url: selectedVoice.url,
        label: selectedVoice.name || 'Giọng dẫn chuyện',
        // Phía Narrator hiện chưa cần voicePrompt, nhưng giữ lại trường để mở rộng sau
        voicePrompt:
          selectedVoice.params && typeof selectedVoice.params === 'object' && typeof (selectedVoice.params as any).voicePrompt === 'string'
            ? (selectedVoice.params as any).voicePrompt
            : undefined,
      }
      const nextParams = {
        ...(project.params || {}),
        narrationVoiceAudio: binding,
      }
      const updated = await dramaApi.updateProject(project.id, { params: nextParams })
      onUpdated(updated)
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gán giọng đọc thất bại')
    } finally {
      setBusy(false)
    }
  }, [busy, onClose, onError, onUpdated, project.id, project.params, selectedVoice])

  const handleUnbind = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const nextParams = { ...(project.params || {}) }
      delete (nextParams as Record<string, unknown>).narrationVoiceAudio
      const updated = await dramaApi.updateProject(project.id, { params: nextParams })
      onUpdated(updated)
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Bỏ gán thất bại')
    } finally {
      setBusy(false)
    }
  }, [busy, onClose, onError, onUpdated, project.id, project.params])

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gán giọng đọc cho lời dẫn"
      size="lg"
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="pf-btn" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          {current ? (
            <button type="button" className="pf-btn" onClick={() => void handleUnbind()} disabled={busy}>
              Bỏ gán
            </button>
          ) : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime"
            onClick={() => void handleConfirm()}
            disabled={!selectedVoice?.url || busy}
          >
            {busy ? 'Đang gán…' : 'Xác nhận gán'}
          </button>
        </>
      }
    >
      <p className="drama-muted">
        Giọng đọc lời dẫn toàn cục sẽ được dùng làm <strong>reference_audio</strong> của Seedance, giúp phần lời dẫn của mọi cảnh quay đều nhất quán.
      </p>

      <div className="drama-voice-mode-tabs" style={{ marginTop: 12 }}>
        <button type="button" className="active">
          Chọn tài nguyên có sẵn
        </button>
      </div>

      <div className="drama-voice-list" style={{ marginTop: 10 }}>
        {voiceAssets.length === 0 ? (
          <p className="drama-muted">Chưa có tài nguyên giọng đọc nào, hãy tổng hợp giọng đọc cho lời dẫn ở tab «Giọng đọc» trước</p>
        ) : (
          voiceAssets.map((voice) => {
            const hasAudio = Boolean(voice.url)
            const selected = selectedId === voice.id
            return (
              <label key={voice.id} className="drama-voice-option" style={{ cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="drama-narrator-voice"
                  checked={selected}
                  onChange={() => setSelectedId(voice.id)}
                />
                <span>
                  {voice.name || `Giọng đọc #${voice.id}`} <small>{hasAudio ? 'Đã tổng hợp' : 'Chưa tổng hợp'}</small>
                </span>
              </label>
            )
          })
        )}
      </div>

      {previewUrl ? (
        <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
          <AudioLines size={16} />
          <audio className="drama-voice-audio" controls src={previewUrl} />
        </div>
      ) : null}
    </Modal>
  )
}

