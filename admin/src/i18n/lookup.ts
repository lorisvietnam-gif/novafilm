/** Lấy văn bản theo đường dẫn chấm, rồi nội suy `{name}` */

export type TVars = Record<string, string | number>

// Duyệt object lồng theo "nav.users" để tới một chuỗi
export function lookupMessage(source: unknown, path: string): string | undefined {
  const parts = path.split('.')
  let cur: unknown = source
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === 'string' ? cur : undefined
}

// Thay {key} trong mẫu bằng giá trị tương ứng trong vars
export function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  )
}
