/** Chỉnh sửa tập: thanh tài nguyên bên trái (tập này / toàn bộ + thẻ theo phân loại) */
import { resolveDramaAssetPreviewUrl, type DramaAsset } from '../../api/drama'
import { CharacterVoicePreviewButton } from '../../components/drama/CharacterVoicePreviewButton'
import { readAssetVoiceBinding } from './CharacterVoiceBindModal'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../lib/dramaVoiceBinding'
import {
  ASSET_TABS,
  normalizeAssetTab,
  type AssetScope,
  type AssetTab,
} from './dramaEpisodeEditUtils'

type Props = {
  scope: AssetScope
  tab: AssetTab | null
  assets: DramaAsset[]
  activeIds?: Set<number>
  imageBusyIds?: ReadonlySet<number>
  createBusy?: boolean
  onScopeChange: (scope: AssetScope) => void
  onTabChange: (tab: AssetTab | null) => void
  onOpenCanvas: () => void
  /** Mở chi tiết tài nguyên: sửa prompt / tạo lại / tải ảnh lên */
  onOpenAsset: (asset: DramaAsset) => void
  /** Chèn @asset vào kịch bản của storyboard hiện tại */
  onMention: (asset: DramaAsset) => void
  /** Bỏ liên kết tài nguyên này khỏi storyboard hiện tại (không xoá tài nguyên) */
  onUnlinkAsset?: (assetId: number) => void
  onGenerateVoice?: (asset: DramaAsset) => void
  voiceBusyIds?: ReadonlySet<number>
  onVoiceError?: (message: string) => void
  /** Tạo tài nguyên thuộc phân loại hiện tại */
  onCreateAsset?: () => void
  /** Nhập từ thư viện tài nguyên toàn cục */
  onImportAsset?: () => void
}

// Chữ trên nút tạo theo phân loại hiện tại
function createLabel(tab: AssetTab | null): string {
  if (tab === 'scene') return 'Tạo bối cảnh'
  if (tab === 'prop') return 'Tạo đạo cụ'
  return 'Tạo nhân vật'
}

// Render thanh tài nguyên bên trái của màn chỉnh sửa tập
export function EpisodeEditAssetPanel({
  scope,
  tab,
  assets,
  activeIds,
  imageBusyIds,
  createBusy,
  onScopeChange,
  onTabChange,
  onOpenCanvas,
  onOpenAsset,
  onMention,
  onUnlinkAsset,
  onGenerateVoice,
  voiceBusyIds,
  onVoiceError,
  onCreateAsset,
  onImportAsset,
}: Props) {
  return (
    <aside className="drama-ep-assets">
      <div className="drama-ep-assets-top">
        <div className="drama-ep-scope">
          <button
            type="button"
            className={scope === 'episode' ? 'active' : ''}
            onClick={() => onScopeChange('episode')}
          >
            Tập này
          </button>
          <button
            type="button"
            className={scope === 'series' ? 'active' : ''}
            onClick={() => onScopeChange('series')}
          >
            Toàn bộ
          </button>
        </div>
        <button
          type="button"
          className="drama-ep-icon-btn solid"
          aria-label="Mở canvas storyboard"
          onClick={onOpenCanvas}
        >
          +
        </button>
      </div>
      <div className="drama-ep-asset-tabs">
        {ASSET_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'active' : ''}
            onClick={() => onTabChange(tab === item.key ? null : item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {onCreateAsset || onImportAsset ? (
        <div className="drama-ep-asset-actions">
          {onCreateAsset ? (
            <button
              type="button"
              className="drama-ep-asset-action-btn"
              disabled={createBusy}
              onClick={onCreateAsset}
            >
              {createBusy ? 'Đang tạo…' : createLabel(tab)}
            </button>
          ) : null}
          {onImportAsset ? (
            <button
              type="button"
              className="drama-ep-asset-action-btn is-ghost"
              disabled={createBusy}
              onClick={onImportAsset}
            >
              Nhập
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="drama-ep-asset-grid">
        {assets.length === 0 ? (
          <p className="drama-ep-empty">
            {scope === 'episode'
              ? 'Tập này chưa tham chiếu tài nguyên nào, bấm «Tạo» ở trên để thêm, hoặc chuyển sang «Toàn bộ» để xem tài nguyên của dự án'
              : 'Chưa có tài nguyên nào, bấm «Tạo / Nhập» ở trên để thêm'}
          </p>
        ) : (
          assets.map((asset) => {
            const cover = resolveDramaAssetPreviewUrl(asset)
            const isScene = normalizeAssetTab(asset.type) === 'scene'
            const isCharacter = normalizeAssetTab(asset.type) === 'character'
            const voice = isCharacter ? readAssetVoiceBinding(asset) : null
            const isActive = activeIds?.has(asset.id)
            const voiceGenerating = voiceBusyIds?.has(asset.id) ?? false
            const imageBusy = imageBusyIds?.has(asset.id) ?? false
            return (
              <div key={asset.id} className="drama-ep-asset-card-wrap">
                <button
                  type="button"
                  className={`drama-ep-asset-card ${isScene ? 'scene' : ''}${isActive ? ' is-linked' : ''}${
                    imageBusy ? ' is-gen' : ''
                  }`}
                  onClick={() => onOpenAsset(asset)}
                  title="Bấm để thiết lập: sửa prompt, tạo lại hoặc tải ảnh lên"
                >
                  <div className="drama-ep-asset-thumb">
                    {cover ? (
                      <img key={cover} src={cover} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span>{(asset.name || '?')[0]}</span>
                    )}
                    {imageBusy ? <em className="drama-ep-asset-gen-badge">Đang tạo…</em> : null}
                  </div>
                  <span className="drama-ep-asset-name">{asset.name || `Tài nguyên ${asset.id}`}</span>
                  {isActive ? <span className="drama-ep-asset-linked">Đã tham chiếu</span> : null}
                  {DRAMA_VOICE_BINDING_ENABLED && voice ? (
                    <span className="drama-ep-asset-voice">Giọng đọc</span>
                  ) : null}
                  <span className="drama-ep-asset-settings">Thiết lập</span>
                </button>
                <div className="drama-ep-asset-ops">
                  {isActive && onUnlinkAsset ? (
                    <button
                      type="button"
                      className="drama-ep-asset-op-btn"
                      onClick={() => onUnlinkAsset(asset.id)}
                      title="Chỉ bỏ liên kết với storyboard hiện tại, không xoá tài nguyên"
                    >
                      Bỏ liên kết
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="drama-ep-asset-op-btn"
                      onClick={() => onMention(asset)}
                      title="Chèn vào kịch bản của storyboard hiện tại"
                    >
                      Chèn
                    </button>
                  )}
                  {isCharacter && onGenerateVoice ? (
                    voice ? (
                      <CharacterVoicePreviewButton
                        url={voice.url}
                        label={voice.label}
                        variant="inline"
                        className="drama-ep-asset-voice-btn is-bound"
                        onError={onVoiceError}
                      />
                    ) : (
                      <button
                        type="button"
                        className="drama-ep-asset-voice-btn"
                        disabled={voiceGenerating}
                        onClick={() => onGenerateVoice(asset)}
                      >
                        {voiceGenerating ? 'Đang tạo…' : 'Tạo giọng đọc'}
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
