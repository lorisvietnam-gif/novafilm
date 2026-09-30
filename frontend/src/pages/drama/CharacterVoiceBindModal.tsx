/** Gán giọng đọc cho nhân vật: chọn từ tài nguyên voice của dự án, ghi vào params cho Seedance dùng làm reference_audio */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dramaApi, resolveDramaMediaUrl, type DramaAsset } from '../../api/drama'
import Modal from '../../components/ui/Modal'

export type VoiceBinding = {
  sourceAssetId: number
  url: string
  label: string
  voicePrompt?: string
}

type Props = {
  asset: DramaAsset
  projectId: number
  open: boolean
  onClose: () => void
  onBound: (asset: DramaAsset) => void
  onError: (message: string) => void
}

// Đọc speaker đã lưu của tài nguyên voice
function readVoiceSpeaker(asset: DramaAsset): string {
  const params = (asset.params || {}) as Record<string, unknown>
  return typeof params.speaker === 'string' ? params.speaker.trim() : ''
}

// Đọc mô tả giọng đọc của tài nguyên voice
export function readVoicePrompt(asset: DramaAsset): string {
  const params = (asset.params || {}) as Record<string, unknown>
  return typeof params.voicePrompt === 'string' ? params.voicePrompt.trim() : ''
}

// Đọc giọng đọc đã gán từ params của tài nguyên nhân vật
export function readAssetVoiceBinding(asset: DramaAsset): VoiceBinding | null {
  const params = (asset.params || {}) as Record<string, unknown>
  const raw = params.voiceAudio
  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>
    const sourceAssetId =
      typeof data.sourceAssetId === 'number'
        ? data.sourceAssetId
        : typeof data.voiceId === 'string'
          ? Number.NaN
          : null
    const url =
      typeof data.url === 'string'
        ? data.url
        : typeof data.previewUrl === 'string'
          ? data.previewUrl
          : ''
    if (typeof sourceAssetId === 'number' && sourceAssetId > 0 && url) {
      return {
        sourceAssetId,
        url,
        label: typeof data.label === 'string' ? data.label : 'Giọng',
        voicePrompt: typeof data.voicePrompt === 'string' ? data.voicePrompt : undefined,
      }
    }
  }
  const canvas = params.canvas
  if (canvas && typeof canvas === 'object') {
    const voiceAudio = (canvas as Record<string, unknown>).voiceAudio
    if (voiceAudio && typeof voiceAudio === 'object') {
      const data = voiceAudio as Record<string, unknown>
      const sourceAssetId = typeof data.sourceAssetId === 'number' ? data.sourceAssetId : null
      const url = typeof data.url === 'string' ? data.url : ''
      if (sourceAssetId && url) {
        return { sourceAssetId, url, label: 'Giọng' }
      }
    }
  }
  return null
}

// Dựng params sau khi gán (ghi cả voiceAudio và canvas.voiceAudio)
export function buildBoundParams(asset: DramaAsset, voice: DramaAsset): Record<string, unknown> {
  const url = voice.url || ''
  const binding: VoiceBinding = {
    sourceAssetId: voice.id,
    url,
    label: voice.name || 'Giọng',
    voicePrompt: readVoicePrompt(voice) || undefined,
  }
  const prev = (asset.params || {}) as Record<string, unknown>
  const prevCanvas =
    prev.canvas && typeof prev.canvas === 'object'
      ? (prev.canvas as Record<string, unknown>)
      : {}
  return {
    ...prev,
    voiceAudio: binding,
    canvas: {
      ...prevCanvas,
      voiceAudio: { sourceAssetId: voice.id, url },
    },
  }
}

// Render modal gán giọng đọc cho nhân vật
export function CharacterVoiceBindModal({
  asset,
  projectId,
  open,
  onClose,
  onBound,
  onError,
}: Props) {
  /*
   * voiceAssets tài nguyên voice trong dự án
   * selectedId giọng đọc đang chọn
   * newPrompt mô tả giọng đọc mới
   * newName tên giọng đọc mới
   * busy đang gửi
   * synthBusy đang tổng hợp
   * promptBusy AI đang tạo prompt
   */
  const [voiceAssets, setVoiceAssets] = useState<DramaAsset[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newPrompt, setNewPrompt] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [synthBusy, setSynthBusy] = useState(false)
  const [promptBusy, setPromptBusy] = useState(false)
  const [suggestedSpeaker, setSuggestedSpeaker] = useState('')
  const [mode, setMode] = useState<'pick' | 'create'>('pick')
  const promptRequestedRef = useRef(false)

  const bound = useMemo(() => readAssetVoiceBinding(asset), [asset])
  const selectedVoice = voiceAssets.find((v) => v.id === selectedId) || null
  const previewUrl = selectedVoice?.url ? resolveDramaMediaUrl(selectedVoice.url) : ''

  // AI tạo mô tả giọng đọc dựa trên thiết lập nhân vật
  const fetchVoicePrompt = useCallback(
    async (force = false) => {
      if (promptBusy) return
      if (!force && newPrompt.trim()) return
      setPromptBusy(true)
      try {
        const result = await dramaApi.suggestVoicePrompt({
          project_id: projectId,
          asset_id: asset.id,
        })
        setNewPrompt(result.voice_prompt || '')
        setSuggestedSpeaker(result.speaker || '')
      } catch (err) {
        onError(err instanceof Error ? err.message : 'AI tạo mô tả giọng đọc thất bại')
      } finally {
        setPromptBusy(false)
      }
    },
    [asset.id, newPrompt, onError, projectId, promptBusy],
  )

  useEffect(() => {
    if (!open) {
      promptRequestedRef.current = false
      return
    }
    setSelectedId(bound?.sourceAssetId ?? null)
    setNewPrompt('')
    setSuggestedSpeaker('')
    setNewName(`Giọng của ${asset.name || 'nhân vật'}`)
    setMode('pick')
    promptRequestedRef.current = false

    dramaApi
      .listAssets(projectId)
      .then((list) => {
        const voices = list.filter((a) => (a.type || '').toLowerCase() === 'voice')
        setVoiceAssets(voices)
        if (!bound?.sourceAssetId && voices[0]) {
          setSelectedId(voices[0].id)
        }
        if (voices.length === 0) {
          setMode('create')
        }
      })
      .catch((err) => onError(err instanceof Error ? err.message : 'Tải tài nguyên giọng đọc thất bại'))
  }, [open, asset, projectId, bound?.sourceAssetId, onError])

  // Khi vào chế độ «Tạo mới và tổng hợp» thì tự động để AI tạo mô tả giọng đọc
  useEffect(() => {
    if (!open || mode !== 'create' || promptRequestedRef.current) return
    promptRequestedRef.current = true
    void fetchVoicePrompt(true)
  }, [open, mode, fetchVoicePrompt])

  if (!open) return null

  // Tạo và tổng hợp tài nguyên voice theo prompt
  async function handleCreateAndSynth() {
    const prompt = newPrompt.trim()
    if (!prompt || synthBusy) return
    setSynthBusy(true)
    try {
      const result = await dramaApi.generateVoice({
        project_id: projectId,
        name: newName.trim() || undefined,
        voice_prompt: prompt,
        speaker: suggestedSpeaker || undefined,
        character_asset_id: asset.id,
      })
      const created = result.asset
      if (!created) throw new Error('Tổng hợp thất bại')
      setVoiceAssets((prev) => [...prev, created])
      setSelectedId(created.id)
      setMode('pick')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Tổng hợp giọng đọc thất bại')
    } finally {
      setSynthBusy(false)
    }
  }

  // Tổng hợp lại cho tài nguyên voice đã có
  async function handleResynth(voice: DramaAsset) {
    const prompt = readVoicePrompt(voice)
    if (!prompt || synthBusy) return
    setSynthBusy(true)
    try {
      const result = await dramaApi.generateVoice({
        project_id: projectId,
        asset_id: voice.id,
        voice_prompt: prompt,
        speaker: readVoiceSpeaker(voice) || suggestedSpeaker || undefined,
        character_asset_id: asset.id,
      })
      if (result.asset) {
        setVoiceAssets((prev) => prev.map((v) => (v.id === voice.id ? result.asset! : v)))
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Tổng hợp lại thất bại')
    } finally {
      setSynthBusy(false)
    }
  }

  // Xác nhận gán cho nhân vật
  async function handleConfirm() {
    if (!selectedVoice?.url || busy) {
      onError('Hãy chọn một tài nguyên giọng đọc đã tổng hợp')
      return
    }
    setBusy(true)
    try {
      const updated = await dramaApi.updateAsset(asset.id, {
        params: buildBoundParams(asset, selectedVoice),
      })
      onBound(updated)
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gán giọng đọc thất bại')
    } finally {
      setBusy(false)
    }
  }

  // Bỏ gán
  async function handleUnbind() {
    if (busy) return
    setBusy(true)
    try {
      const prev = (asset.params || {}) as Record<string, unknown>
      const nextParams = { ...prev }
      delete nextParams.voiceAudio
      if (nextParams.canvas && typeof nextParams.canvas === 'object') {
        const canvas = { ...(nextParams.canvas as Record<string, unknown>) }
        delete canvas.voiceAudio
        nextParams.canvas = canvas
      }
      const updated = await dramaApi.updateAsset(asset.id, { params: nextParams })
      onBound(updated)
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Bỏ gán thất bại')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gán giọng đọc"
      size="lg"
      dismissible={!busy}
      className="drama-voice-bind-modal"
      footer={
        <>
          <button type="button" className="pf-btn" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          {bound ? (
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
        Chọn tài nguyên giọng đọc cho «{asset.name || 'nhân vật'}». Giọng đọc sẽ được gửi kèm làm reference_audio khi Seedance tạo cảnh quay.
      </p>

      <div className="drama-voice-mode-tabs">
        <button
          type="button"
          className={mode === 'pick' ? 'active' : ''}
          onClick={() => setMode('pick')}
        >
          Chọn tài nguyên có sẵn
        </button>
        <button
          type="button"
          className={mode === 'create' ? 'active' : ''}
          onClick={() => {
            setMode('create')
            if (!newPrompt.trim() && !promptBusy) {
              promptRequestedRef.current = false
            }
          }}
        >
          Tạo mới và tổng hợp
        </button>
      </div>

      {mode === 'pick' ? (
        <div className="drama-voice-list">
          {voiceAssets.length === 0 ? (
            <p className="drama-muted">Chưa có tài nguyên giọng đọc nào, hãy chuyển sang «Tạo mới và tổng hợp»</p>
          ) : (
            voiceAssets.map((voice) => {
              const hasAudio = Boolean(voice.url)
              return (
                <label key={voice.id} className="drama-voice-option">
                  <input
                    type="radio"
                    name="drama-voice-asset"
                    checked={selectedId === voice.id}
                    onChange={() => setSelectedId(voice.id)}
                  />
                  <span>
                    {voice.name || `Giọng đọc #${voice.id}`}
                    <small>{hasAudio ? 'Đã tổng hợp' : 'Chưa tổng hợp'}</small>
                  </span>
                  {hasAudio ? (
                    <button
                      type="button"
                      className="pf-btn pf-btn-sm"
                      disabled={synthBusy}
                      onClick={(e) => {
                        e.preventDefault()
                        void handleResynth(voice)
                      }}
                    >
                      Tổng hợp lại
                    </button>
                  ) : null}
                </label>
              )
            })
          )}
        </div>
      ) : (
        <div className="drama-voice-create-form">
          <label className="drama-field">
            <span>Tên giọng đọc</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ví dụ: Đại Vũ - giọng nam trầm ổn định"
            />
          </label>
          <label className="drama-field">
            <span className="drama-voice-prompt-label">
              Mô tả giọng đọc (prompt)
              <button
                type="button"
                className="pf-btn pf-btn-sm"
                disabled={promptBusy || synthBusy}
                onClick={() => void fetchVoicePrompt(true)}
              >
                {promptBusy ? 'AI đang tạo…' : 'AI tạo lại'}
              </button>
            </span>
            <textarea
              rows={4}
              value={promptBusy && !newPrompt ? 'AI đang tạo mô tả giọng đọc dựa trên thiết lập nhân vật…' : newPrompt}
              readOnly={promptBusy && !newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Sẽ tự tạo dựa trên thân phận, tính cách và ngoại hình của nhân vật, bạn cũng có thể tự sửa"
            />
          </label>
          {suggestedSpeaker ? (
            <p className="drama-muted" style={{ margin: 0, fontSize: 12 }}>
              Giọng đọc gợi ý: <code>{suggestedSpeaker}</code> (mỗi nhân vật sẽ tự khớp với một người đọc TTS khác nhau)
            </p>
          ) : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime"
            disabled={!newPrompt.trim() || synthBusy || promptBusy}
            onClick={() => void handleCreateAndSynth()}
          >
            {synthBusy ? 'Đang tổng hợp…' : 'Tổng hợp bản nghe thử theo prompt'}
          </button>
        </div>
      )}

      {previewUrl ? (
        <audio className="drama-voice-audio" controls src={previewUrl} />
      ) : null}
    </Modal>
  )
}
