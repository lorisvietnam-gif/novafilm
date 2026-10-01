/**
 * Hỏi backend xem **nhà cung cấp AI đã được cấu hình thật chưa**.
 *
 * VÌ SAO CẦN — nút "Tạo video" không được biến thành nút chỉ sao chép. Nhưng khi
 * máy chủ chưa có khoá nhà cung cấp thì bấm "Tạo video" chỉ tạo ra một hàng đợi
 * chết. Ta cần một tín hiệu **đo được** để biết lúc nào nên mở hộp thoại prompt,
 * chứ không đoán bằng cảm giác.
 *
 * Nguồn tín hiệu — chỉ dùng endpoint công khai, không cần token:
 *
 * - `GET /api/health` → `ark_mock` và `models.llm`.
 *   `ark_mock === true` là cờ của chính backend: `ArkClient.mock` trả về true khi
 *   cờ này bật **hoặc** khoá rỗng, tức là sẽ không gọi nhà cung cấp nào cả.
 *   `models.llm` rỗng là backend tự nói không có mô hình văn bản dùng được — cùng
 *   điều kiện mà thông báo "未解析到可用文字模型" của backend mô tả.
 * - `GET /api/media-models` → danh mục model video. Rỗng nghĩa là quản trị chưa
 *   lưu model video mặc định, nên không có gì để định tuyến.
 *
 * RANH GIỚI PHẢI GIỮ — suy luận thiếu thì trả `unknown`, **không** coi là
 * "chưa cấu hình". `has_api_key` thật sự chỉ nằm ở `GET /api/admin/settings/routing`
 * (yêu cầu admin) và mở khoá được từ trang quản trị; endpoint công khai không
 * tiết lộ khoá có hợp lệ hay không. Vì vậy probe này **không** bắt được trường hợp
 * khoá tồn tại mà sai (ví dụ khoá mẫu) — xem ghi chú hạn chế trong báo cáo.
 */

import { useEffect, useState } from 'react'
import type { MediaModelsCatalog } from '../api'
import { getDramaApiBase } from '../api/drama'

/** Lý do backend **chắc chắn** chưa tạo được video thật. */
export type AiReadinessReason =
  /** Backend bật chế độ giả lập: không gọi nhà cung cấp nào. */
  | 'mock'
  /** Backend báo không có mô hình văn bản dùng được. */
  | 'noTextModel'
  /** Danh mục model video rỗng: chưa có gì để định tuyến. */
  | 'noVideoModel'
  /** `/api/health` tự báo mình không khoẻ, nên hàng đợi sẽ không chạy. */
  | 'runtimeDown'

export type AiRenderReadiness = {
  /**
   * - `checking` — đang hỏi, chưa kết luận được.
   * - `ready` — không có lý do nào chặn.
   * - `unconfigured` — có ít nhất một lý do chắc chắn ở trên.
   * - `unknown` — hỏi không được (mạng, backend tắt, CORS). Khi này **không** khoá
   *   tạo video, vì khoá theo một phép đo thất bại là biến tính năng thật thành
   *   nút chết.
   */
  state: 'checking' | 'ready' | 'unconfigured' | 'unknown'
  reasons: AiReadinessReason[]
}

const UNKNOWN: AiRenderReadiness = { state: 'unknown', reasons: [] }
const CHECKING: AiRenderReadiness = { state: 'checking', reasons: [] }

type HealthPayload = {
  ok?: unknown
  ark_mock?: unknown
  models?: { llm?: unknown; video?: unknown }
}

type HealthProbe =
  | { kind: 'checking' }
  | { kind: 'failed' }
  | { kind: 'loaded'; payload: HealthPayload }

const PROBE_TTL_MS = 60_000

let cachedHealth: { at: number; value: HealthProbe } | null = null
let inflight: Promise<HealthProbe> | null = null

function readCachedHealth(): HealthProbe | null {
  if (!cachedHealth) return null
  if (Date.now() - cachedHealth.at > PROBE_TTL_MS) return null
  return cachedHealth.value
}

function loadHealth(): Promise<HealthProbe> {
  const fresh = readCachedHealth()
  if (fresh) return Promise.resolve(fresh)
  if (!inflight) {
    inflight = fetch(`${getDramaApiBase()}/api/health`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`health ${res.status}`)
        const body = (await res.json()) as unknown
        const value: HealthProbe =
          body && typeof body === 'object'
            ? { kind: 'loaded', payload: body as HealthPayload }
            : { kind: 'failed' }
        cachedHealth = { at: Date.now(), value }
        return value
      })
      .catch(() => ({ kind: 'failed' }) as HealthProbe)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Gộp hai nguồn thành một kết luận. */
export function resolveAiRenderReadiness(
  health: HealthProbe,
  catalog: MediaModelsCatalog | null,
): AiRenderReadiness {
  if (health.kind === 'checking') return CHECKING

  const reasons: AiReadinessReason[] = []

  if (health.kind === 'loaded') {
    const payload = health.payload
    if (payload.ok === false) reasons.push('runtimeDown')
    if (payload.ark_mock === true) reasons.push('mock')
    if (!String(payload.models?.llm ?? '').trim()) reasons.push('noTextModel')
  }

  // Danh mục chưa tới thì không kết luận được; chỉ khi nó **tới và rỗng** mới tính.
  if (catalog && catalog.video_models.length === 0) reasons.push('noVideoModel')

  // Không đọc được máy chủ, hoặc chỉ đọc được danh mục rỗng khi health hỏng: coi như
  // chưa biết thay vì chặn.
  if (health.kind === 'failed') {
    return reasons.length > 0 ? { state: 'unconfigured', reasons } : UNKNOWN
  }

  return reasons.length > 0 ? { state: 'unconfigured', reasons } : { state: 'ready', reasons }
}

/**
 * Hook đọc tín hiệu cấu hình nhà cung cấp.
 *
 * `catalog` lấy từ `useMediaModelsCatalog()` để dùng chung một lần tải với bộ chọn
 * model, không gọi trùng `/api/media-models`.
 */
export function useAiRenderReadiness(catalog: MediaModelsCatalog | null): AiRenderReadiness {
  const [health, setHealth] = useState<HealthProbe>(cachedHealth?.value ?? { kind: 'checking' })

  useEffect(() => {
    let cancelled = false
    if (readCachedHealth()) {
      setHealth(readCachedHealth() as HealthProbe)
      return () => {
        cancelled = true
      }
    }
    loadHealth().then((value) => {
      if (!cancelled) setHealth(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return resolveAiRenderReadiness(health, catalog)
}