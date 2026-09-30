/** Công tắc hiện tên nhân vật của một tập: để mô hình tự viết hoặc tắt. */

export type DramaCharacterIntroMode = 'model' | 'off'

// Kiểm tra có phải mô hình tự viết dòng tên nhân vật không.
export function characterIntroModeEnabled(mode: DramaCharacterIntroMode): boolean {
  return mode === 'model'
}

// Tương thích dữ liệu bool cũ: đọc cách hiện tên nhân vật của tập, mặc định là tắt.
export function readEpisodeCharacterIntroMode(
  params: Record<string, unknown> | null | undefined,
): DramaCharacterIntroMode {
  const mode = params?.characterIntroMode
  if (mode === 'model' || mode === 'off') return mode
  return readEpisodeCharacterIntroEnabled(params) ? 'model' : 'off'
}

// Tương thích bool dạng chuỗi/số cũ, mặc định tắt hiện tên nhân vật.
export function readEpisodeCharacterIntroEnabled(
  params: Record<string, unknown> | null | undefined,
): boolean {
  const value = params?.characterIntroEnabled
  if (value == null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  }
  return Boolean(value)
}

// Kiểm tra dòng này có phải cue giới thiệu nhân vật không.
export function isCharacterIntroCueLine(line: string): boolean {
  return line.trim().startsWith('【人物介绍')
}

// Bỏ các dòng tên nhân vật khỏi nội dung của một storyboard.
export function stripCharacterIntroFromContent(content: string): string {
  const next = String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !isCharacterIntroCueLine(line))
  return next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

// Viết lại hàng loạt nội dung storyboard theo công tắc (tắt thì bỏ dòng tên; bật thì không chèn lại, phải dựng lại storyboard).
export function applyCharacterIntroModeToFragments<T extends { content?: string | null }>(
  fragments: T[],
  mode: DramaCharacterIntroMode,
): T[] {
  if (mode === 'model') return fragments
  return fragments.map((fragment) => {
    const prev = String(fragment.content || '')
    const next = stripCharacterIntroFromContent(prev)
    if (next === prev) return fragment
    return { ...fragment, content: next }
  })
}
