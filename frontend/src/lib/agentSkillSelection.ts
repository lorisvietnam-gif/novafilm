/** Chọn Agent Skill: bộ nhớ đệm cục bộ và giá trị mặc định */

import type { AgentSkill } from '../api/agentSkills'

const STORAGE_KEY = 'agentSkillIds:v1'

/** Đọc id của các Skill đã chọn lần trước; không có trong bộ nhớ đệm thì trả `null` */
export function loadStoredSkillIds(): number[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed
      .map((item) => Number(item))
      .filter((id) => Number.isInteger(id) && id > 0)
  } catch {
    return null
  }
}

/** Ghi id của các Skill đã chọn */
export function saveStoredSkillIds(ids: number[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* Bỏ qua khi đang ở chế độ riêng tư hoặc hết hạn mức */
  }
}

/** Chọn mặc định: toàn bộ skill đang bật */
export function defaultSkillIds(skills: AgentSkill[]): number[] {
  return skills.filter((skill) => skill.is_active).map((skill) => skill.id)
}

/** Đối chiếu id trong bộ nhớ đệm với danh sách hiện có; không có thì dùng các mục đang bật làm mặc định */
export function resolveSelectedSkillIds(skills: AgentSkill[], stored: number[] | null): number[] {
  const valid = new Set(skills.map((skill) => skill.id))
  if (stored == null) return defaultSkillIds(skills)
  return stored.filter((id) => valid.has(id))
}

/** Tên các Skill đã chọn, hiển thị trên nút */
export function skillTriggerLabel(skills: AgentSkill[], selectedIds: number[]): string {
  if (skills.length === 0) return 'Skill'
  if (selectedIds.length === 0) return 'Không dùng Skill'
  if (selectedIds.length === 1) {
    const hit = skills.find((skill) => skill.id === selectedIds[0])
    return hit?.name || 'Skill'
  }
  return `Skill · ${selectedIds.length}`
}
