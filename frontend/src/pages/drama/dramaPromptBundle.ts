/**
 * Gom prompt của toàn bộ cảnh quay trong một tập thành văn bản để **sao chép**.
 *
 * Mục tiêu là công cụ dàn prompt: người dùng dàn cảnh trong giao diện, lấy prompt ra
 * dán sang công cng của họ. Nhưng vì thế, mọi thứ ở đây phải **trung thực**:
 *
 * - Prompt được viết cho **một** mô hình cụ thể. Ta chỉ biết cách diễn đạt cho mô
 *   hình mà mình cấu hình, nên không hứa là dùng được ở mọi nơi, và không bịa cách
 *   viết lại cho hãng khác. Thứ duy nhất ta đổi được một cách liêm chính là **tham
 *   số**: thời lượng, tỉ lệ khung hình và độ phân giải, vì catalog của backend công
 *   bố rõ mô hình đích chấp nhận gì. Mỗi thay đổi đều được ghi ra để người dùng thấy.
 * - Token `@asset:12` và `@duration:8` là **quy ước riêng của NOVAFILM**, mang nghĩa
 *   khác với mô hình, dán nguyên ra ngoài thì vô nghĩa. Bản "dán ra ngoài" thay
 *   chúng bằng tên tài nguyên và số giây thật; bản "nguyên bản" giữ đúng những gì
 *   NOVAFILM gửi đi.
 * - Cảnh nào chưa có prompt thì **nói ra**, không dựng khung rỗng rồi bắt dán.
 *
 * Các nhãn 【…】 trong kịch bản là tiếng Trung và là protocol mà mô hình đọc
 * (`dramaEpisodeScriptValidate.ts` giữ nguyên chúng vì lý do đó). Bản dán ra ngoài
 * vẫn giữ, vì bỏ đi là bịa ra một prompt khác với prompt NOVAFILM thật sự gửi.
 */

import type { MediaModelOption } from '../../api'
import type { DramaAsset, DramaFragment } from '../../api/drama'
import {
  inferAspectRatioFromPixels,
  pickDramaAspectRatio,
  pickDramaResolution,
  readFragmentVideoDimensions,
} from '../../lib/dramaProjectOutputSettings'
import { resolveFragmentDurationSec } from './dramaEpisodeEditUtils'

/** Mô hình đích, đã gom phần tham số mà catalog công bố. */
export type PromptTargetModel = {
  id: string
  label: string
  /** null nghĩa là catalog không nói — không đoán bừa, giữ nguyên tham số cũ. */
  durationMin: number | null
  durationMax: number | null
  aspectRatios: string[]
  resolutions: string[]
}

/** Một tham số bị đổi vì mô hình đích không nhận giá trị cũ. */
export type PromptAdjustment = {
  kind: 'durationSec' | 'aspectRatio' | 'resolution'
  from: string
  to: string
}

export type PromptSceneEntry = {
  key: string
  index: number
  ordinal: string
  /** Cảnh chưa có prompt: giao diện nói rõ, không dựng khung rỗng. */
  hasPrompt: boolean
  /** Đúng nội dung sẽ được chép, theo chế độ đang chọn. */
  prompt: string
  /** Nguyên bản NOVAFILM gửi cho mô hình. */
  raw: string
  aspectRatio: string
  resolution: string
  durationSec: number
  assets: Array<{ id: number; name: string; resolved: boolean }>
  adjustments: PromptAdjustment[]
}

export type PromptBundleInput = {
  fragments: DramaFragment[]
  assets: DramaAsset[]
  episodeParams?: Record<string, unknown> | null
  projectParams?: Record<string, unknown> | null
  target: PromptTargetModel | null
  /** true = giữ nguyên token NOVAFILM; false = bản dán ra ngoài. */
  raw: boolean
}

/** Chuyển một mục catalog thành mô hình đích có tham số đã chuẩn hoá. */
export function resolvePromptTargetModel(model: MediaModelOption | null): PromptTargetModel | null {
  if (!model) return null
  const id = (model.id || '').trim()
  if (!id) return null
  const readBound = (value: number | undefined): number | null => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  const readList = (value: string[] | undefined): string[] =>
    Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []
  return {
    id,
    label: (model.label || '').trim() || id,
    durationMin: readBound(model.duration_min),
    durationMax: readBound(model.duration_max),
    aspectRatios: readList(model.allowed_aspect_ratios),
    resolutions: readList(model.allowed_resolutions),
  }
}

/**
 * Đổi token nội bộ thành chữ đọc được cho người dùng ở nơi khác.
 *
 * `@asset:12` → `[Lan Anh]`, `@duration:8` → `(8s)`. Tài nguyên không tìm thấy thì
 * để lộ `#12` và báo ra, chứ không âm thầm bỏ mất một tham chiếu mà mô hình của ta
 * đã dùng.
 */
export function toExternalPromptText(content: string, assets: DramaAsset[]): string {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  return String(content || '').replace(/@(asset:\d+|duration:\d+)/g, (_match, token: string) => {
    if (token.startsWith('duration:')) {
      return `(${Number(token.slice('duration:'.length)) || 0}s)`
    }
    const id = Number(token.slice('asset:'.length))
    const name = (byId.get(id)?.name || '').trim()
    return name ? `[${name}]` : `[#${id}]`
  })
}

/** Tỉ lệ khung hình của một cảnh: số pixel thật nếu có, không thì lùi về params. */
function sceneAspectRatio(
  fragment: DramaFragment,
  episodeParams?: Record<string, unknown> | null,
  projectParams?: Record<string, unknown> | null,
): string {
  const dims = readFragmentVideoDimensions(fragment.params)
  if (dims) return inferAspectRatioFromPixels(dims.w, dims.h)
  return pickDramaAspectRatio(fragment.params, episodeParams, projectParams)
}

/**
 * Ép tham số của cảnh về khoảng mà mô hình đích nhận.
 *
 * Chỉ sửa khi catalog **nói rõ** giới hạn và giá trị cũ nằm ngoài. Không có thông tin
 * thì giữ nguyên — đổi mò thì thành bịa.
 */
function applyTargetModel(
  aspectRatio: string,
  resolution: string,
  durationSec: number,
  target: PromptTargetModel | null,
): { aspectRatio: string; resolution: string; durationSec: number; adjustments: PromptAdjustment[] } {
  if (!target) return { aspectRatio, resolution, durationSec, adjustments: [] }
  const adjustments: PromptAdjustment[] = []

  let nextDuration = durationSec
  if (target.durationMin != null && nextDuration < target.durationMin) {
    adjustments.push({
      kind: 'durationSec',
      from: `${durationSec}s`,
      to: `${target.durationMin}s`,
    })
    nextDuration = target.durationMin
  }
  if (target.durationMax != null && nextDuration > target.durationMax) {
    adjustments.push({
      kind: 'durationSec',
      from: `${nextDuration}s`,
      to: `${target.durationMax}s`,
    })
    nextDuration = target.durationMax
  }

  let nextRatio = aspectRatio
  if (target.aspectRatios.length > 0 && !target.aspectRatios.includes(nextRatio)) {
    adjustments.push({ kind: 'aspectRatio', from: nextRatio, to: target.aspectRatios[0] })
    nextRatio = target.aspectRatios[0]
  }

  let nextResolution = resolution
  if (target.resolutions.length > 0 && !target.resolutions.includes(nextResolution)) {
    adjustments.push({ kind: 'resolution', from: nextResolution, to: target.resolutions[0] })
    nextResolution = target.resolutions[0]
  }

  return { aspectRatio: nextRatio, resolution: nextResolution, durationSec: nextDuration, adjustments }
}

/** Tài nguyên mà cảnh tham chiếu, theo cả token trong nội dung lẫn `asset_ids`. */
function sceneAssets(fragment: DramaFragment, byId: Map<number, DramaAsset>) {
  const ids = new Set<number>()
  for (const match of String(fragment.content || '').matchAll(/@asset:(\d+)/g)) {
    const id = Number(match[1])
    if (id > 0) ids.add(id)
  }
  for (const id of fragment.asset_ids || []) {
    if (id > 0) ids.add(id)
  }
  return [...ids]
    .sort((a, b) => a - b)
    .map((id) => {
      const asset = byId.get(id)
      const name = (asset?.name || '').trim()
      return { id, name: name || `#${id}`, resolved: Boolean(asset) && Boolean(name) }
    })
}

/** Dựng danh sách cảnh của một tập, đã áp tham số của mô hình đích. */
export function buildPromptScenes(input: PromptBundleInput): PromptSceneEntry[] {
  const { fragments, assets, episodeParams, projectParams, target, raw } = input
  const byId = new Map(assets.map((asset) => [asset.id, asset]))

  return fragments.map((fragment, index) => {
    const content = String(fragment.content || '')
    const hasPrompt = content.trim().length > 0
    const ratio = sceneAspectRatio(fragment, episodeParams, projectParams)
    const resolution = pickDramaResolution(fragment.params, episodeParams, projectParams)
    const durationSec = resolveFragmentDurationSec(content, fragment.duration_sec)
    const fitted = applyTargetModel(ratio, resolution, durationSec, target)
    return {
      key: fragment.id ? `frag-${fragment.id}` : `frag-idx-${index}`,
      index,
      ordinal: String(index + 1).padStart(2, '0'),
      hasPrompt,
      prompt: raw ? content : toExternalPromptText(content, assets),
      raw: content,
      aspectRatio: fitted.aspectRatio,
      resolution: fitted.resolution,
      durationSec: fitted.durationSec,
      assets: sceneAssets(fragment, byId),
      adjustments: fitted.adjustments,
    }
  })
}

/** Số cảnh thật sự có prompt. */
export function countPromptScenes(entries: PromptSceneEntry[]): number {
  return entries.filter((entry) => entry.hasPrompt).length
}