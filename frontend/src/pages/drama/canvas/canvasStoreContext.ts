/** Context store của canvas: tách riêng để tránh Provider / hook giữ mỗi bên một Context sau khi CanvasStore hot reload */
import { createContext, useContext } from 'react'

export const CanvasStoreContext = createContext<unknown>(null)

/** Đọc trạng thái canvas; phải nằm trong CanvasStoreProvider */
export function useCanvasStore<T>(): T {
  const ctx = useContext(CanvasStoreContext)
  if (!ctx) {
    throw new Error('useCanvasStore must be used within CanvasStoreProvider')
  }
  return ctx as T
}
