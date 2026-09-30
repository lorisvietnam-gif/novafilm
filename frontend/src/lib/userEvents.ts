import type { User } from '../api'

export const USER_UPDATED_EVENT = 'pf-user-updated'

/** Phát tán sự kiện đổi hồ sơ người dùng, để các thành phần như thanh trên cùng đồng bộ ảnh đại diện */
export function dispatchUserUpdated(user: User) {
  window.dispatchEvent(new CustomEvent(USER_UPDATED_EVENT, { detail: user }))
}
