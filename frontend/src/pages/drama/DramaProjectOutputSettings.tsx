/** Cài đặt khung hình và độ phân giải cho tập / dự án (ghi vào episode.params hoặc project.params) */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, RectangleVertical } from 'lucide-react'
import {
  formatProjectOutputLabel,
  readEpisodeAspectRatio,
  readEpisodeResolution,
  readProjectAspectRatio,
  readProjectResolution,
  type DramaAspectRatio,
  type DramaResolution,
} from '../../lib/dramaProjectOutputSettings'
import {
  aspectRatiosForVideoModel,
  clampVideoAspectRatioForModel,
  clampVideoResolutionForModel,
  hasKnownVideoModelResolutions,
  resolutionsForModel,
} from '../../lib/dramaVideoGenerationOptions'
import { catalogVideoModels, useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import './drama.css'

type Props = {
  params: Record<string, unknown>
  /** Ở chế độ theo tập: dùng để hiện giá trị mặc định kế thừa từ dự án */
  fallbackParams?: Record<string, unknown>
  scope?: 'episode' | 'project'
  disabled?: boolean
  compact?: boolean
  /** Mô hình video hiện tại; dùng để lọc độ phân giải / tỉ lệ */
  videoModelId?: string
  onChange: (
    nextParams: Record<string, unknown>,
    opts?: { quiet?: boolean },
  ) => void | Promise<void>
}

/** Render bộ điều khiển thông số đầu ra */
export function DramaProjectOutputSettings({
  params,
  fallbackParams = {},
  scope = 'episode',
  disabled = false,
  compact = false,
  videoModelId = '',
  onChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const [saving, setSaving] = useState(false)
  const catalog = useMediaModelsCatalog()
  const videoModels = catalogVideoModels(catalog)
  const resolutionOptions = resolutionsForModel(videoModelId, catalog, videoModels)
  const aspectRatioOptions = aspectRatiosForVideoModel(videoModelId, catalog, videoModels)

  const aspectRatio =
    scope === 'episode'
      ? readEpisodeAspectRatio(params, fallbackParams)
      : readProjectAspectRatio(params)
  const resolution =
    scope === 'episode'
      ? readEpisodeResolution(params, fallbackParams)
      : readProjectResolution(params)
  const clampedAspect = clampVideoAspectRatioForModel(
    videoModelId,
    aspectRatio,
    catalog,
    videoModels,
  ) as DramaAspectRatio
  const clampedResolution = clampVideoResolutionForModel(
    videoModelId,
    resolution,
    catalog,
    videoModels,
  ) as DramaResolution
  const outputLabel = formatProjectOutputLabel(clampedAspect, clampedResolution)
  const scopeHint = scope === 'episode' ? 'Tập này' : 'Chung dự án'
  const panelTitle = scope === 'episode' ? 'Khung hình của tập' : 'Khung hình dự án'
  const panelNote =
    scope === 'episode'
      ? 'Chỉ dùng cho storyboard của tập này; chưa đặt riêng thì kế thừa mặc định của dự án. Tỉ lệ và độ phân giải được lọc theo mô hình video hiện tại, bấm vào là đổi được.'
      : 'Mọi tập dùng chung một bộ thông số; tỉ lệ và độ phân giải được lọc theo mô hình video hiện tại.'

  /* Chỉ ghi lại giá trị đã bị chạm ngưỡng khi catalog đã khớp danh sách model cho phép, tránh lúc catalog/modelId chưa sẵn sàng mà 1080p bị ghi thành 720p */
  useEffect(() => {
    if (disabled || saving) return
    if (!hasKnownVideoModelResolutions(videoModelId, catalog, videoModels)) return
    if (clampedAspect === aspectRatio && clampedResolution === resolution) return
    void onChange(
      { ...params, aspect_ratio: clampedAspect, resolution: clampedResolution },
      { quiet: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy theo giá trị bị chạm ngưỡng
  }, [videoModelId, catalog, clampedAspect, clampedResolution, disabled])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPanelStyle(null)
      return
    }

    function updatePanelPosition() {
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - 24)
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
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const stop = (e: MouseEvent) => {
    e.stopPropagation()
  }

  /** Gộp rồi ghi lại params */
  async function applyPatch(patch: Partial<{ aspect_ratio: string; resolution: string }>) {
    if (disabled || saving) return
    const nextParams = { ...params, ...patch }
    setSaving(true)
    try {
      await onChange(nextParams)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`fc-gen-opts drama-project-output-settings${compact ? ' drama-project-output-settings--compact' : ''}`}
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <button
        type="button"
        className={`fc-gen-opt-btn drama-project-output-btn${open ? ' active' : ''}`}
        disabled={disabled || saving}
        title={
          scope === 'episode'
            ? 'Khung hình và độ phân giải của tập này; các cảnh quay tạo xong có thể nối thẳng'
            : 'Khung hình và độ phân giải chung cho cả dự án, storyboard tạo xong có thể nối thẳng'
        }
        onClick={() => setOpen((c) => !c)}
      >
        <RectangleVertical size={14} strokeWidth={1.8} />
        <span className="fc-gen-opt-label">{outputLabel}</span>
        {!compact ? <span className="drama-project-output-hint">{scopeHint}</span> : null}
        {!disabled ? <ChevronDown size={12} strokeWidth={2} /> : null}
      </button>

      {open && panelStyle
        ? createPortal(
            <div
              className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
              style={panelStyle}
              role="dialog"
              aria-label={scope === 'episode' ? 'Khung hình và độ phân giải của tập' : 'Khung hình và độ phân giải của dự án'}
            >
              <div className="fc-gen-opt-panel-title">{panelTitle}</div>
              <p className="drama-project-output-note">{panelNote}</p>
              <div className="fc-gen-chip-row">
                {aspectRatioOptions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`fc-gen-chip${clampedAspect === r ? ' selected' : ''}`}
                    disabled={disabled || saving}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void applyPatch({ aspect_ratio: r })}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="fc-gen-opt-panel-title" style={{ marginTop: 12 }}>
                Độ phân giải
              </div>
              <div className="fc-gen-chip-row">
                {resolutionOptions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`fc-gen-chip${clampedResolution === r ? ' selected' : ''}`}
                    disabled={disabled || saving}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void applyPatch({ resolution: r as DramaResolution })}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
