/**
 * Công thức nhịp cắt phim ngắn (sáu nhịp của Skill cộng đồng, dùng để gợi ý thời lượng
 * từng cảnh và lên kế hoạch xuất cả tập)
 * Khớp docs/EPISODE_RULES.md §10 P3
 *
 * `id` là giá trị gửi API nên giữ nguyên. `label` và `hint` là chữ hiển thị, định
 * nghĩa bằng getter để đọc ra đúng ngôn ngữ đang dùng, kể cả khi bên ngoài duyệt
 * mảng preset này rồi render thẳng.
 */
import { localized, type LocalizedText } from './localeStrings'

export type DramaEditRhythmId =
  | 'breath'
  | 'heartbeat'
  | 'wave'
  | 'elastic'
  | 'pulse'
  | 'silence_hammer'

export type DramaEditRhythmPreset = {
  id: DramaEditRhythmId
  label: string
  hint: string
  /** Trọng số nhịp tương đối, được chuẩn hoá về tổng giây mục tiêu */
  weights: number[]
}

const RHYTHM_COPY: Record<DramaEditRhythmId, { label: LocalizedText; hint: LocalizedText }> = {
  breath: {
    label: { zh: '呼吸式', en: 'Breathing', vi: 'Nhịp thở' },
    hint: {
      zh: '缓入—展开—回落，适合建立与抒情',
      en: 'Builds up, opens out and settles. Good for establishing shots and quiet emotion.',
      vi: 'Vào chậm, mở ra rồi lắng xuống. Hợp với cảnh thiết lập và đoạn trữ tình.',
    },
  },
  heartbeat: {
    label: { zh: '心跳式', en: 'Heartbeat', vi: 'Nhịp tim' },
    hint: {
      zh: '短促加速，适合冲突与对峙',
      en: 'Short and accelerating. Good for conflict and confrontation.',
      vi: 'Cắt ngắn, tốc độ tăng dần. Hợp với xung đột và đối đầu.',
    },
  },
  wave: {
    label: { zh: '海浪式', en: 'Wave', vi: 'Nhịp sóng' },
    hint: {
      zh: '层层推高再泄力，适合高潮戏',
      en: 'Each swell higher than the last, then a release. Good for the climax.',
      vi: 'Mỗi đợt cao hơn đợt trước rồi xả vào. Hợp với cảnh cao trào.',
    },
  },
  elastic: {
    label: { zh: '弹性时间', en: 'Elastic time', vi: 'Thời gian đàn hồi' },
    hint: {
      zh: '关键动作拉长，其余压缩',
      en: 'Stretches the key action and compresses everything else.',
      vi: 'Kéo dài hành động then chốt, nén lại phần còn lại.',
    },
  },
  pulse: {
    label: { zh: '脉冲式', en: 'Pulse', vi: 'Nhịp đều' },
    hint: {
      zh: '规律跳动，适合卡点与群像',
      en: 'An even beat. Good for cutting to music and for crowd scenes.',
      vi: 'Nhịp đều đặn. Hợp với cắt theo nhạc và cảnh đông người.',
    },
  },
  silence_hammer: {
    label: { zh: '静默锤击', en: 'Silence hammer', vi: 'Búa im lặng' },
    hint: {
      zh: '蓄势静场后猛切，适合反转',
      en: 'Holds a quiet scene, then cuts hard. Good for a twist.',
      vi: 'Giữ một cảnh tĩnh rồi cắt mạnh. Hợp với cú ngoặt.',
    },
  },
}

function rhythmPreset(
  id: DramaEditRhythmId,
  weights: number[],
): DramaEditRhythmPreset {
  const copy = RHYTHM_COPY[id]
  return {
    id,
    weights,
    get label() {
      return localized(copy.label)
    },
    get hint() {
      return localized(copy.hint)
    },
  }
}

export const DRAMA_EDIT_RHYTHM_PRESETS: DramaEditRhythmPreset[] = [
  rhythmPreset('breath', [3, 5, 4, 3]),
  rhythmPreset('heartbeat', [2, 2, 3, 2, 4]),
  rhythmPreset('wave', [3, 4, 5, 6, 3]),
  rhythmPreset('elastic', [2, 6, 2, 3]),
  rhythmPreset('pulse', [3, 3, 3, 3]),
  rhythmPreset('silence_hammer', [5, 2, 6]),
]

const SEGMENT_MIN = 3
const SEGMENT_MAX = 15

// Chia giây cho N đoạn theo công thức nhịp (kẹp trong 3–15, tổng sát targetTotal)
export function suggestRhythmDurations(
  segmentCount: number,
  rhythmId: DramaEditRhythmId,
  targetTotal = 15,
): number[] {
  const count = Math.max(1, Math.floor(segmentCount))
  const preset =
    DRAMA_EDIT_RHYTHM_PRESETS.find((p) => p.id === rhythmId) || DRAMA_EDIT_RHYTHM_PRESETS[0]
  const weights: number[] = []
  for (let i = 0; i < count; i++) {
    weights.push(preset.weights[i % preset.weights.length] || 3)
  }
  const sumW = weights.reduce((a, b) => a + b, 0) || 1
  const raw = weights.map((w) => (w / sumW) * Math.max(SEGMENT_MIN * count, targetTotal))
  const clamped = raw.map((v) => Math.max(SEGMENT_MIN, Math.min(SEGMENT_MAX, Math.round(v))))
  // Chỉnh lại tổng: thiếu thì cộng vào đoạn dài nhất, thừa thì trừ bớt đi
  let total = clamped.reduce((a, b) => a + b, 0)
  const goal = Math.max(SEGMENT_MIN * count, Math.min(15, Math.round(targetTotal)))
  let guard = 0
  while (total < goal && guard < 40) {
    const idx = clamped.indexOf(Math.max(...clamped))
    if (clamped[idx] < SEGMENT_MAX) {
      clamped[idx] += 1
      total += 1
    } else break
    guard += 1
  }
  while (total > goal && guard < 80) {
    const idx = clamped.indexOf(Math.max(...clamped))
    if (clamped[idx] > SEGMENT_MIN) {
      clamped[idx] -= 1
      total -= 1
    } else break
    guard += 1
  }
  return clamped
}

// Lên kế hoạch xuất cả tập: gợi ý thời lượng cho từng cảnh (D-2 / số cảnh đã có)
export function suggestEpisodeFragmentDurations(
  fragmentCount: number,
  rhythmId: DramaEditRhythmId,
  /** Thời lượng mục tiêu trung bình của một cảnh */
  perFragmentTarget = 10,
): number[] {
  const count = Math.max(1, Math.floor(fragmentCount))
  const total = Math.min(15 * count, Math.max(4 * count, perFragmentTarget * count))
  return suggestRhythmDurations(count, rhythmId, total).map((sec) =>
    Math.max(4, Math.min(15, sec)),
  )
}
