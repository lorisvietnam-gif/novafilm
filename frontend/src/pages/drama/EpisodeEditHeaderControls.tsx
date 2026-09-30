/** Thanh công cụ trên cùng khi sửa tập: khung hình/độ phân giải / phong cách hình ảnh / phụ đề / giới thiệu nhân vật / mô hình / nối cảnh quay */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'

import { createPortal } from 'react-dom'

import { BarChart3, ChevronDown, CircleHelp, Link2, Smile, Type, Users } from 'lucide-react'

import { DramaImageStylePreviewImg } from '../../components/drama/DramaImageStylePreviewImg'

import { DramaMediaModelPicker } from '../../components/drama/DramaMediaModelPicker'
import { SeedanceRulesModal } from '../../components/drama/SeedanceRulesModal'

import {
  getImageStyleLabel,
  IMAGE_STYLE_OPTIONS,
  type ImageStyleId,
} from '../../lib/dramaImageStyles'

import { subtitleModeUsesModelOutput, type DramaSubtitleMode } from '../../lib/dramaSubtitleBoard'
import {
  characterIntroModeEnabled,
  type DramaCharacterIntroMode,
} from '../../lib/dramaCharacterIntro'

import {
  catalogModelLabel,
  catalogVideoModels,
  useMediaModelsCatalog,
} from '../../hooks/useMediaModelsCatalog'

import { DramaProjectOutputSettings } from './DramaProjectOutputSettings'

import './canvas/nodes/dramaImageGenOptions.css'
type Props = {
  styleId: ImageStyleId | ''
  modelId: string
  episodeParams: Record<string, unknown>
  projectParams: Record<string, unknown>
  linkLastFrame: boolean
  subtitleMode: DramaSubtitleMode
  characterIntroMode: DramaCharacterIntroMode
  onStyleChange: (id: ImageStyleId | '') => void
  onModelChange: (id: string) => void
  onEpisodeOutputChange: (
    nextParams: Record<string, unknown>,
    opts?: { quiet?: boolean },
  ) => void | Promise<void>
  onLinkLastFrameChange: (enabled: boolean) => void
  onSubtitleModeChange: (mode: DramaSubtitleMode) => void
  onCharacterIntroModeChange: (mode: DramaCharacterIntroMode) => void
  disabled?: boolean
  /** Phong cách/phụ đề/giới thiệu/nối cảnh là cấu hình chung của dự án — trang storyboard chỉ xem, không sửa được; khung hình/độ phân giải vẫn sửa được (lọc theo mô hình) */
  globalSettingsReadOnly?: boolean
}

type OpenPanel = 'style' | 'model' | 'link' | 'subtitle' | 'intro' | null

const STYLE_PANEL_WIDTH = 420

// Render bộ điều khiển tham số tạo ở thanh trên cùng
export function EpisodeEditHeaderControls({
  styleId,
  modelId,
  episodeParams,
  projectParams,
  linkLastFrame,
  subtitleMode,
  characterIntroMode,
  onStyleChange,
  onModelChange,
  onEpisodeOutputChange,
  onLinkLastFrameChange,
  onSubtitleModeChange,
  onCharacterIntroModeChange,
  disabled = false,
  globalSettingsReadOnly = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<OpenPanel>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const catalog = useMediaModelsCatalog()
  const videoModels = catalogVideoModels(catalog)
  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPanelStyle(null)
      return
    }
    // Cố định vị trí panel thả xuống để không bị top/bottom ép chiều cao
    function updatePanelPosition() {
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const width =
        open === 'style'
          ? Math.min(STYLE_PANEL_WIDTH, window.innerWidth - 24)
          : open === 'model'
            ? Math.min(400, window.innerWidth - 24)
            : Math.min(360, window.innerWidth - 24)
      let left = rect.right - width
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12))
      const top = Math.min(rect.bottom + 8, window.innerHeight - 24)
      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width,
        bottom: 'auto',
        right: 'auto',
        zIndex: 320,
      })
    }
    updatePanelPosition()
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)
    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    function onDoc(e: Event) {
      const target = e.target as Node | null
      if (!target) return
      if (rootRef.current?.contains(target)) return
      if ((target as Element).closest?.('.fc-gen-opt-panel--portal')) return
      setOpen(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const stop = (e: MouseEvent) => {
    e.stopPropagation()
  }
  const styleLabel = getImageStyleLabel(styleId) || 'Phong cách hình ảnh'
  const modelLabel = catalogModelLabel(modelId, videoModels, 'Mô hình video')
  const subtitleLabel = subtitleMode === 'model' ? 'Phụ đề từ mô hình' : 'Phụ đề hậu kỳ'
  const subtitleUsesModel = subtitleModeUsesModelOutput(subtitleMode)
  const introLabel = characterIntroMode === 'model' ? 'Giới thiệu nhân vật' : 'Không chữ chồng giới thiệu'
  const introEnabled = characterIntroModeEnabled(characterIntroMode)
  const globalLocked = disabled || globalSettingsReadOnly
  return (
    <div
      ref={rootRef}
      className="fc-gen-opts drama-ep-header-gen-opts"
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <div className="fc-gen-opts-triggers">
        <DramaProjectOutputSettings
          scope="episode"
          params={episodeParams}
          fallbackParams={projectParams}
          disabled={disabled}
          compact
          videoModelId={modelId}
          onChange={onEpisodeOutputChange}
        />
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'style' || styleId ? ' active' : ''}${globalSettingsReadOnly ? ' is-readonly' : ''}`}
          disabled={globalLocked}
          onClick={() => {
            if (globalSettingsReadOnly) return
            setOpen((c) => (c === 'style' ? null : 'style'))
          }}
          title={globalSettingsReadOnly ? `${styleLabel} (cấu hình dự án, storyboard chỉ đọc)` : styleLabel}
        >
          <Smile size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{styleLabel}</span>
          {!globalSettingsReadOnly ? <ChevronDown size={12} strokeWidth={2} /> : null}
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'subtitle' || !subtitleUsesModel ? ' active' : ''}${globalSettingsReadOnly ? ' is-readonly' : ''}`}
          disabled={globalLocked}
          onClick={() => {
            if (globalSettingsReadOnly) return
            setOpen((c) => (c === 'subtitle' ? null : 'subtitle'))
          }}
          title={globalSettingsReadOnly ? `${subtitleLabel} (cấu hình dự án, storyboard chỉ đọc)` : 'Cài đặt phụ đề'}
        >
          <Type size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{subtitleLabel}</span>
          {!globalSettingsReadOnly ? <ChevronDown size={12} strokeWidth={2} /> : null}
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'intro' || !introEnabled ? ' active' : ''}${globalSettingsReadOnly ? ' is-readonly' : ''}`}
          disabled={globalLocked}
          onClick={() => {
            if (globalSettingsReadOnly) return
            setOpen((c) => (c === 'intro' ? null : 'intro'))
          }}
          title={globalSettingsReadOnly ? `${introLabel} (cấu hình dự án, storyboard chỉ đọc)` : 'Chữ chồng giới thiệu nhân vật'}
        >
          <Users size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{introLabel}</span>
          {!globalSettingsReadOnly ? <ChevronDown size={12} strokeWidth={2} /> : null}
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'model' ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => setOpen((c) => (c === 'model' ? null : 'model'))}
        >
          <BarChart3 size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{modelLabel}</span>
          <ChevronDown size={12} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'link' || linkLastFrame ? ' active' : ''}${globalSettingsReadOnly ? ' is-readonly' : ''}`}
          disabled={globalLocked}
          onClick={() => {
            if (globalSettingsReadOnly) return
            setOpen((c) => (c === 'link' ? null : 'link'))
          }}
          title={globalSettingsReadOnly ? `${linkLastFrame ? 'Nối khung cuối' : 'Tạo song song'} (cấu hình dự án, storyboard chỉ đọc)` : 'Nối khung cuối giữa các cảnh quay'}
        >
          <Link2 size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{linkLastFrame ? 'Nối khung cuối' : 'Tạo song song'}</span>
          {!globalSettingsReadOnly ? <ChevronDown size={12} strokeWidth={2} /> : null}
        </button>
        <button
          type="button"
          className="fc-gen-opt-btn drama-seedance-help-btn"
          disabled={disabled}
          title="Seedance: quy tắc truyền giá trị và cách dùng"
          aria-label="Seedance: quy tắc truyền giá trị và cách dùng"
          onClick={() => setRulesOpen(true)}
        >
          <CircleHelp size={14} strokeWidth={1.8} />
        </button>
      </div>
      <SeedanceRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {open && panelStyle
        ? createPortal(
            <>
              {open === 'style' ? (
                <div
                  className="fc-gen-opt-panel fc-gen-style-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label="Phong cách hình ảnh"
                >
                  <div className="fc-gen-opt-panel-title">Phong cách hình ảnh</div>
                  <div className="fc-gen-style-grid">
                    {IMAGE_STYLE_OPTIONS.map((opt) => {
                      const selected = styleId === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`fc-gen-style-card${selected ? ' selected' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onStyleChange(opt.id)
                            setOpen(null)
                          }}
                        >
                          <DramaImageStylePreviewImg styleId={opt.id} alt={opt.label} />
                          <span>{opt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {open === 'model' ? (
                <div
                  className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label="Mô hình video"
                >
                  <div className="fc-gen-opt-panel-title">Mô hình video</div>
                  <DramaMediaModelPicker
                    models={videoModels}
                    selectedId={modelId}
                    emptyHint="Hãy lưu mô hình mặc định trong mục “Mô hình” ở trang quản trị trước"
                    onSelect={(opt) => {
                      onModelChange(opt.id)
                      setOpen(null)
                    }}
                  />
                </div>
              ) : null}
              {open === 'link' ? (
                <div
                  className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label="Nối giữa các cảnh quay"
                >
                  <div className="fc-gen-opt-panel-title">Nối giữa các cảnh quay</div>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="checkbox"
                      checked={linkLastFrame}
                      disabled={disabled}
                      onChange={(e) => onLinkLastFrameChange(e.target.checked)}
                    />
                    <span>
                      Nối bằng khung cuối của cảnh trước
                      <em>
                        Mặc định bật. Sinh theo thứ tự cảnh quay, có thể gửi trước cảnh kế tiếp và để nó chờ trong hàng đợi tới khi cảnh trước xong; tắt đi thì mặc định tạo song song. Đổi thiết lập sẽ xếp lại ngay các tác vụ chưa bắt đầu. Khi có ảnh tham chiếu nhân vật hoặc bối cảnh, khung cuối sẽ đi kèm ảnh tham chiếu (không dùng chung với
                        first_frame)
                      </em>
                    </span>
                  </label>
                </div>
              ) : null}
              {open === 'subtitle' ? (
                <div
                  className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label="Cài đặt phụ đề"
                >
                  <div className="fc-gen-opt-panel-title">Cài đặt phụ đề</div>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="radio"
                      name="episode-subtitle-mode"
                      checked={subtitleMode === 'model'}
                      disabled={disabled}
                      onChange={() => onSubtitleModeChange('model')}
                    />
                    <span>
                      Phụ đề do mô hình tự tạo
                      <em>
                        Khi đổi, hệ thống sẽ chèn lại ngay vào nội dung storyboard hiện tại prompt “同步字幕 / 字幕 cue”; lúc tạo, mô hình tự xuất phụ đề.
                      </em>
                    </span>
                  </label>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="radio"
                      name="episode-subtitle-mode"
                      checked={subtitleMode === 'post'}
                      disabled={disabled}
                      onChange={() => onSubtitleModeChange('post')}
                    />
                    <span>
                      Phụ đề ghép hậu kỳ
                      <em>
                        Khi đổi, hệ thống sẽ xoá ngay các prompt phụ đề trong storyboard hiện tại; bảng phụ đề bên phải vẫn xem trước và xuất được, phục vụ chữ chồng hậu kỳ.
                      </em>
                    </span>
                  </label>
                </div>
              ) : null}
              {open === 'intro' ? (
                <div
                  className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label="Giới thiệu nhân vật"
                >
                  <div className="fc-gen-opt-panel-title">Chữ chồng giới thiệu nhân vật</div>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="radio"
                      name="episode-character-intro-mode"
                      checked={characterIntroMode === 'model'}
                      disabled={disabled}
                      onChange={() => onCharacterIntroModeChange('model')}
                    />
                    <span>
                      Mô hình tự thêm chữ giới thiệu
                      <em>
                        Bật thì mỗi lần lập lại storyboard, các nhân vật quan trọng xuất hiện lần đầu sẽ được ghi kèm “人物介绍·画面叠字·角色身旁”; lúc tạo, mô hình sẽ đặt phần giới thiệu cạnh nhân vật.
                      </em>
                    </span>
                  </label>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="radio"
                      name="episode-character-intro-mode"
                      checked={characterIntroMode === 'off'}
                      disabled={disabled}
                      onChange={() => onCharacterIntroModeChange('off')}
                    />
                    <span>
                      Tắt giới thiệu nhân vật
                      <em>
                        Khi đổi, hệ thống sẽ xoá ngay dòng chữ chồng giới thiệu nhân vật trong storyboard hiện tại; lúc tạa sẽ không sinh thêm thẻ chữ giới thiệu trong khung hình. Phần giới thiệu đã xoá phải lập lại storyboard mới hiện lại.
                      </em>
                    </span>
                  </label>
                </div>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </div>
  )
}
