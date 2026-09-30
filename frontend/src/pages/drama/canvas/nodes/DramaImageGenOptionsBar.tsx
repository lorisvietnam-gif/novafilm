/** Sinh ảnh cho drama: thanh chọn phong cách / model / tỉ lệ khung hình (phong cách có sẵn, không tự nhập) */
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { BarChart3, ChevronDown, RectangleVertical, Smile } from 'lucide-react'
import {
  getImageStyleLabel,
  IMAGE_STYLE_OPTIONS,
  type ImageStyleId,
} from '../../../../lib/dramaImageStyles'
import { DramaImageStylePreviewImg } from '../../../../components/drama/DramaImageStylePreviewImg'
import { DramaMediaModelPicker } from '../../../../components/drama/DramaMediaModelPicker'
import {
  aspectRatiosForImageModel,
  clampImageAspectRatioForModel,
  clampImageResolutionForModel,
  formatOutputSettingsLabel,
  GENERATION_ASPECT_RATIO_OPTIONS,
  resolutionsForImageModel,
  type GenerationAspectRatioId,
  type GenerationResolution,
  type ImageGenerationOptions,
} from '../../../../lib/dramaGenerationOptions'
import {
  catalogImageModels,
  catalogModelLabel,
  useMediaModelsCatalog,
} from '../../../../hooks/useMediaModelsCatalog'
import './dramaImageGenOptions.css'

type DramaImageGenOptionsBarProps = {
  value: ImageGenerationOptions
  onChange: (next: ImageGenerationOptions) => void
  disabled?: boolean
  /** Có lưu phong cách xuống dự án không (dùng ở bước Tư liệu) */
  onStylePersist?: (styleId: string) => void | Promise<void>
}

type OpenPanel = 'style' | 'model' | 'output' | null

/** Dựng thanh chọn tham số sinh ảnh: phong cách · model · tỉ lệ và độ phân giải */
export function DramaImageGenOptionsBar({
  value,
  onChange,
  disabled = false,
  onStylePersist,
}: DramaImageGenOptionsBarProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<OpenPanel>(null)
  const catalog = useMediaModelsCatalog()
  const imageModels = catalogImageModels(catalog)

  useEffect(() => {
    // Khi danh mục model đã tải xong, thay id Kie/Thuyền cũ bằng model ảnh mặc định của backend và giới hạn tham số về phạm vi hợp lệ
    if (!catalog || disabled) return
    const ids = imageModels.map((m) => m.id)
    if (!ids.length) return
    let nextModel = value.model_id
    if (!nextModel || !ids.includes(nextModel)) {
      nextModel = catalog.defaults.image_model || ids[0]
    }
    const nextRatio = clampImageAspectRatioForModel(
      nextModel,
      value.aspect_ratio,
      catalog,
      imageModels,
    )
    const nextRes = clampImageResolutionForModel(
      nextModel,
      value.resolution,
      catalog,
      imageModels,
    )
    if (
      nextModel !== value.model_id ||
      nextRatio !== value.aspect_ratio ||
      nextRes !== value.resolution
    ) {
      onChange({ ...value, model_id: nextModel, aspect_ratio: nextRatio, resolution: nextRes })
    }
  }, [catalog, disabled])

  useEffect(() => {
    // Sau khi đổi model thì giới hạn lại tỉ lệ / độ phân giải
    if (disabled || !value.model_id) return
    const nextRatio = clampImageAspectRatioForModel(
      value.model_id,
      value.aspect_ratio,
      catalog,
      imageModels,
    )
    const nextRes = clampImageResolutionForModel(
      value.model_id,
      value.resolution,
      catalog,
      imageModels,
    )
    if (nextRatio !== value.aspect_ratio || nextRes !== value.resolution) {
      onChange({ ...value, aspect_ratio: nextRatio, resolution: nextRes })
    }
  }, [value.model_id, catalog, disabled])

  const aspectOptions = aspectRatiosForImageModel(value.model_id, catalog, imageModels)
  const resolutionOptions = resolutionsForImageModel(value.model_id, catalog, imageModels)

  useEffect(() => {
    if (!open) return
    // Bấm ra ngoài thì đóng lớp tuỳ chọn
    function onDoc(e: Event) {
      const target = e.target as Node | null
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const stop = (e: MouseEvent) => {
    e.stopPropagation()
  }

  const styleLabel = getImageStyleLabel(value.image_style_id) || 'Phong cách'
  const modelLabel = catalogModelLabel(value.model_id, imageModels, 'Model ảnh')
  const outputLabel = formatOutputSettingsLabel(value.aspect_ratio, value.resolution)

  return (
    <div ref={rootRef} className="fc-gen-opts" onMouseDown={stop} onPointerDown={stop}>
      <div className="fc-gen-opts-triggers">
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'style' || value.image_style_id ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => setOpen((c) => (c === 'style' ? null : 'style'))}
        >
          <Smile size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{styleLabel}</span>
          <ChevronDown size={12} />
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'model' ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => setOpen((c) => (c === 'model' ? null : 'model'))}
        >
          <BarChart3 size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{modelLabel}</span>
          <ChevronDown size={12} />
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'output' ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => setOpen((c) => (c === 'output' ? null : 'output'))}
        >
          <RectangleVertical size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{outputLabel}</span>
          <ChevronDown size={12} />
        </button>
      </div>

      {open === 'style' ? (
        <div className="fc-gen-opt-panel fc-gen-style-panel" role="dialog" aria-label="Phong cách hình ảnh">
          <div className="fc-gen-opt-panel-title">Phong cách hình ảnh</div>
          <div className="fc-gen-style-grid">
            {IMAGE_STYLE_OPTIONS.map((opt) => {
              const selected = value.image_style_id === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`fc-gen-style-card${selected ? ' selected' : ''}`}
                  onClick={() => {
                    onChange({ ...value, image_style_id: opt.id })
                    void onStylePersist?.(opt.id)
                    setOpen(null)
                  }}
                >
                  <DramaImageStylePreviewImg styleId={opt.id} alt={opt.label} loading="lazy" />
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {open === 'model' ? (
        <div className="fc-gen-opt-panel" role="dialog" aria-label="Model sinh ảnh">
          <div className="fc-gen-opt-panel-title">Model</div>
          <DramaMediaModelPicker
            models={imageModels}
            selectedId={value.model_id}
            onSelect={(m) => {
              const nextRatio = clampImageAspectRatioForModel(m.id, value.aspect_ratio, catalog, imageModels)
              const nextRes = clampImageResolutionForModel(m.id, value.resolution, catalog, imageModels)
              onChange({
                ...value,
                model_id: m.id,
                aspect_ratio: nextRatio,
                resolution: nextRes,
              })
              setOpen(null)
            }}
          />
        </div>
      ) : null}

      {open === 'output' ? (
        <div className="fc-gen-opt-panel" role="dialog" aria-label="Cài đặt đầu ra">
          <div className="fc-gen-opt-panel-title">Tỉ lệ khung hình</div>
          <div className="fc-gen-chip-row">
            {GENERATION_ASPECT_RATIO_OPTIONS.filter((opt) => aspectOptions.includes(opt.id)).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`fc-gen-chip${value.aspect_ratio === opt.id ? ' selected' : ''}`}
                onClick={() =>
                  onChange({ ...value, aspect_ratio: opt.id as GenerationAspectRatioId })
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="fc-gen-opt-panel-title" style={{ marginTop: 10 }}>
            Độ phân giải
          </div>
          <div className="fc-gen-chip-row">
            {resolutionOptions.map((res) => (
              <button
                key={res}
                type="button"
                className={`fc-gen-chip${value.resolution === res ? ' selected' : ''}`}
                onClick={() => {
                  onChange({ ...value, resolution: res as GenerationResolution })
                  setOpen(null)
                }}
              >
                {res}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export type { ImageStyleId }
