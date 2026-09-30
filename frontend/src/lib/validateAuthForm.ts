/** Kiểm tra biểu mẫu đăng nhập / đăng ký: thông báo thống nhất trên mọi trình duyệt, không phụ thuộc bubble email gốc. */
export function isValidEmailInput(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed.includes('@')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

export function isValidAuthPassword(value: string): boolean {
  return value.length >= 6 && value.length <= 64
}
