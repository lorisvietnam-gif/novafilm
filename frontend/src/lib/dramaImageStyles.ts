/**
 * Drama image style options (aligned with manju imageStyles).
 *
 * The `id` is the wire value: it is what the backend stores and what
 * `backend/app/services/drama/image_styles.py` keys its prompt table on, so it
 * stays ASCII and untouched. Only `label` is display text, and it is resolved
 * per read so a locale switch re-renders correctly.
 */

import { localized, type LocalizedText } from './localeStrings'

export const IMAGE_STYLE_IDS = [
  'retro-sci-fi-atompunk',
  'palace-intrigue-cold',
  'domestic-suspense-cold',
  'ancient-romance-soft',
  'ancient-chinese-mythology',
  'japanese-youth-film',
  'japanese-daily-natural',
  'korean-urban-soft',
  'chinese-urban-realistic',
  'wuxia-realistic-photo',
  '90s-realistic-film',
  'retro-narrative-film',
  'american-retro-hollywood',
  'neon-cyberpunk-film',
  '90s-rural-china-film',
  'cgi-3d-animation',
  'ghibli-handdrawn-anime',
  'tezuka-era-cartoon',
  'shanghai-animation',
  'pixel-art',
  'shadow-puppet-illustration',
] as const

export type ImageStyleId = (typeof IMAGE_STYLE_IDS)[number]

export const IMAGE_STYLE_OPTIONS: Array<{ id: ImageStyleId; label: string }> = IMAGE_STYLE_IDS.map(
  (id) => ({ id, ...styleOption(id) }),
)

/** Display name per style id, in every interface language. */
const IMAGE_STYLE_LABELS: Record<ImageStyleId, LocalizedText> = {
  'retro-sci-fi-atompunk': {
    zh: '复古科幻原子朋克',
    en: 'Retro sci-fi atompunk',
    vi: 'Atompunk khoa huyền viễn kiểu cổ điển',
  },
  'palace-intrigue-cold': {
    zh: '宫斗权谋冷峻',
    en: 'Cold palace intrigue',
    vi: 'Hậu cung tranh đoạt, lạnh lùng',
  },
  'domestic-suspense-cold': {
    zh: '国产悬疑冷调',
    en: 'Chinese suspense, cold palette',
    vi: 'Trinh thám Hoa kỳ, tông lạnh',
  },
  'ancient-romance-soft': {
    zh: '古偶唯美柔光',
    en: 'Soft-lit period romance',
    vi: 'Tình cổ trang, ánh sáng dịu',
  },
  'ancient-chinese-mythology': {
    zh: '中国古代神话史诗',
    en: 'Ancient Chinese mythology, epic',
    vi: 'Thần thoại cổ đại Trung Hoa, sử thi',
  },
  'japanese-youth-film': {
    zh: '日式青春胶片',
    en: 'Japanese youth film',
    vi: 'Phim thanh xuân Nhật, chất film',
  },
  'japanese-daily-natural': {
    zh: '日式生活自然',
    en: 'Natural Japanese everyday',
    vi: 'Đời thường Nhật, tự nhiên',
  },
  'korean-urban-soft': {
    zh: '韩剧都市柔光',
    en: 'Soft-lit Korean urban',
    vi: 'Đô thị Hàn Quốc, ánh sáng dịu',
  },
  'chinese-urban-realistic': {
    zh: '国产都市写实',
    en: 'Chinese urban realism',
    vi: 'Đô thị Hoa kỳ, chân thực',
  },
  'wuxia-realistic-photo': {
    zh: '武侠江湖写实摄影',
    en: 'Wuxia, realistic photography',
    vi: 'Võ hiệp giang hồ, ảnh chân thực',
  },
  '90s-realistic-film': {
    zh: '90年代写实电影',
    en: '1990s realist cinema',
    vi: 'Điện ảnh thực tế thập niên 90',
  },
  'retro-narrative-film': {
    zh: '复古叙事电影',
    en: 'Retro narrative film',
    vi: 'Phim tự sự cổ điển',
  },
  'american-retro-hollywood': {
    zh: '美式复古好莱坞',
    en: 'American retro Hollywood',
    vi: 'Hollywood cổ điển kiểu Mỹ',
  },
  'neon-cyberpunk-film': {
    zh: '霓虹赛博电影',
    en: 'Neon cyber film',
    vi: 'Điện ảnh cyberpunk neon',
  },
  '90s-rural-china-film': {
    zh: '90年代中国农村电影',
    en: '1990s rural China film',
    vi: 'Phim nông thôn Trung Quốc thập niên 90',
  },
  'cgi-3d-animation': {
    zh: '3D 动画',
    en: '3D animation',
    vi: 'Hoạt hình 3D',
  },
  'ghibli-handdrawn-anime': {
    zh: '宫崎骏气质手绘',
    en: 'Hand-drawn in the Ghibli spirit',
    vi: 'Vẽ tay phong cách Ghibli',
  },
  'tezuka-era-cartoon': {
    zh: '手冢治虫时代卡通画风',
    en: 'Tezuka-era cartoon',
    vi: 'Hoạt hình đương thời Tezuka',
  },
  'shanghai-animation': {
    zh: '上美画风',
    en: 'Shanghai animation',
    vi: 'Hoạt hình Thượng Hải',
  },
  'pixel-art': {
    zh: '像素风',
    en: 'Pixel art',
    vi: 'Đồ hoạ pixel',
  },
  'shadow-puppet-illustration': {
    zh: '皮影戏插画',
    en: 'Shadow-puppet illustration',
    vi: 'Minh hoạ múa rối bóng',
  },
}

function styleOption(id: ImageStyleId): { label: string } {
  return {
    get label() {
      return localized(IMAGE_STYLE_LABELS[id])
    },
  }
}

export const EPISODE_COUNT_PRESETS = [1, 12, 24, 36, 48] as const

export function getImageStyleLabel(styleId: string | undefined | null): string | null {
  if (!styleId) return null
  return IMAGE_STYLE_OPTIONS.find((o) => o.id === styleId)?.label ?? null
}
