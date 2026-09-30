/** Item shape for a single FAQ entry in the help centre. */
export type HelpFaqItem = {
  q: string
  a: string
}

/**
 * Keyword filter over the FAQ list.
 *
 * Matching is a plain case-insensitive substring test against both the question and
 * the answer, so "as bo" matches "Bảo" and "保存". An empty query returns the input
 * unchanged.
 *
 * @param items FAQ entries, any array
 * @param query  Keyword typed by the user; trimmed, and whitespace-insensitive
 * @returns The entries that matched, in their original order
 */
export function filterHelpFaq(items: HelpFaqItem[], query: string): HelpFaqItem[] {
  const key = query.trim().toLowerCase().replace(/\s+/g, '')
  if (!key) return items
  return items.filter((item) => {
    const hay = (item.q + item.a).toLowerCase().replace(/\s+/g, '')
    return hay.includes(key)
  })
}
