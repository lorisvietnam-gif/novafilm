/** Gộp `className`, loại bỏ giá trị falsy */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}
