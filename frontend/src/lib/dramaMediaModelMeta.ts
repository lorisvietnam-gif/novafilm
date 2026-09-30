/** Chọn mô hình cho Drama: nhóm icon và văn bản hiển thị */
import type { MediaModelOption } from '../api'
import { localized, type LocalizedText } from './localeStrings'
import { mediaModelDescription, mediaModelEtaHint, mediaModelPricingHint } from './mediaModelLabels'

export type MediaModelIconKind =
  | 'seedance25'
  | 'seedance'
  | 'seedanceMini'
  | 'minimax'
  | 'seedream'
  | 'gptImage'
  | 'generic'

/** Suy ra nhóm icon từ id của mô hình */
export function mediaModelIconKind(modelId: string | undefined | null): MediaModelIconKind {
  const id = (modelId || '').toLowerCase()
  if (!id) return 'generic'
  if (id.includes('minimax')) return 'minimax'
  if (id.includes('seedream')) return 'seedream'
  if (id.includes('gpt-image') || id.includes('sunburst')) return 'gptImage'
  if (id.includes('seedance') && (id.includes('mini') || id.includes('fast'))) return 'seedanceMini'
  if (id.includes('seedance') && (id.includes('2-5') || id.includes('2.5'))) return 'seedance25'
  if (id.includes('seedance')) return 'seedance'
  return 'generic'
}

const FALLBACK_MODEL: LocalizedText = { zh: '模型', en: 'Model', vi: 'Mô hình' }

/** Nhãn năng lực (badge trên danh sách) */
export function mediaModelCapabilityBadge(model: MediaModelOption): string {
  const id = (model.id || '').toLowerCase()
  if (id.includes('minimax')) return 'MiniMax'
  if (id.includes('seedance')) return 'Seedance'
  if (id.includes('seedream')) return 'Seedream'
  if (id.includes('gpt-image')) return 'GPT Image'
  if (model.provider === 'tokenfree') return 'TokenFree'
  return model.provider || localized(FALLBACK_MODEL)
}

const ETA_PREFIX: LocalizedText = { zh: '耗时：', en: 'Time: ', vi: 'Thời gian: ' }
const CLIP_PREFIX: LocalizedText = { zh: '片段', en: 'Clip', vi: 'Phim' }

/** Mô tả đầy đủ cho tooltip / `title` */
export function mediaModelHoverText(model: MediaModelOption): string {
  const clip = mediaModelClipDurationLabel(model)
  const eta = mediaModelEtaHint(model.id, model.eta_hint || '').trim()
  const parts = [
    model.label || model.id,
    mediaModelDescription(model.id, model.description || '').trim(),
    eta ? localized(ETA_PREFIX) + eta : '',
    clip,
    mediaModelPricingHint(model.id, model.pricing_hint || '').trim(),
  ].filter(Boolean)
  return parts.join('\n')
}

/** Văn bản mô tả các thời lượng phim có thể chọn */
export function mediaModelClipDurationLabel(model: MediaModelOption): string {
  const lo = Number(model.duration_min)
  const hi = Number(model.duration_max)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= 0) return ''
  const word = localized(CLIP_PREFIX)
  if (lo === hi) return `${word} ${lo}s`
  return `${word} ${lo}–${hi}s`
}
