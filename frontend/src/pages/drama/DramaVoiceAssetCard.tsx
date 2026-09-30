/** Một thẻ ở tab «giọng đọc» của thư viện tài nguyên: sửa mô tả, nghe thử và tổng hợp */
import { AudioLines, Trash2, Volume2 } from 'lucide-react'
import { resolveDramaMediaUrl, type DramaAsset } from '../../api/drama'
import { CharacterVoicePreviewButton } from '../../components/drama/CharacterVoicePreviewButton'

type Props = {
  asset: DramaAsset
  promptValue: string
  synthBusy: boolean
  onPromptChange: (value: string) => void
  onPromptBlur: () => void
  onSynth: () => void
  onDelete: () => void
  onError: (message: string) => void
}

// Render thẻ tài nguyên giọng đọc
export function DramaVoiceAssetCard({
  asset,
  promptValue,
  synthBusy,
  onPromptChange,
  onPromptBlur,
  onSynth,
  onDelete,
  onError,
}: Props) {
  const audioSrc = resolveDramaMediaUrl(asset.url)
  const hasAudio = Boolean(audioSrc)

  return (
    <article className="drama-voice-card">
      <header className="drama-voice-card-head">
        <div className="drama-voice-card-badge" aria-hidden>
          <AudioLines size={18} strokeWidth={1.75} />
        </div>
        <div className="drama-voice-card-title">
          <h3>{asset.name || 'Chưa đặt tên'}</h3>
          <span className={`drama-voice-card-status${hasAudio ? ' is-ready' : ' is-pending'}`}>
            {hasAudio ? 'Đã tổng hợp' : 'Chờ tổng hợp'}
          </span>
        </div>
        <button
          type="button"
          className="drama-voice-card-delete"
          aria-label={`Xoá ${asset.name || 'giọng đọc'}`}
          disabled={synthBusy}
          onClick={onDelete}
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </header>

      <div className="drama-voice-card-body">
        <label className="drama-voice-card-field">
          <span>Mô tả giọng đọc</span>
          <textarea
            rows={3}
            value={promptValue}
            disabled={synthBusy}
            onChange={(e) => onPromptChange(e.target.value)}
            onBlur={onPromptBlur}
            placeholder="Mô tả giọng đọc: độ tuổi, giới tính, cách nói, tốc độ nói…"
          />
        </label>

        <div className={`drama-voice-card-player${hasAudio ? '' : ' is-empty'}`}>
          {hasAudio ? (
            <>
              <CharacterVoicePreviewButton
                url={asset.url || ''}
                label={asset.name || undefined}
                variant="button"
                size="sm"
                onError={onError}
              />
              <audio className="drama-voice-card-audio" controls preload="none" src={audioSrc} />
            </>
          ) : (
            <>
              <Volume2 size={16} strokeWidth={1.75} aria-hidden />
              <span>Nhập mô tả rồi tổng hợp bản nghe thử</span>
            </>
          )}
        </div>
      </div>

      <footer className="drama-voice-card-foot">
        <button
          type="button"
          className="pf-btn pf-btn-lime pf-btn-sm drama-voice-card-synth"
          disabled={synthBusy || !promptValue.trim()}
          onClick={onSynth}
        >
          {synthBusy ? 'Đang tổng hợp…' : hasAudio ? 'Tổng hợp lại' : 'Tổng hợp theo prompt'}
        </button>
      </footer>
    </article>
  )
}
