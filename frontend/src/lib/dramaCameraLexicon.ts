/**
 * 漫剧运镜 / 景别词库（对齐 docs/EPISODE_RULES.md §5）
 * 供分集编辑 @ 菜单插入画面行前缀或运镜短语
 *
 * LƯU Ý KỸ THUẬT — vì sao `insert` vẫn giữ tiếng Trung:
 *
 * `insert` là tiếng từ được chèn thẳng vào dòng mô tả hình ảnh trong kịch bản tập,
 * và kịch bản đó đi thẳng vào prompt cho mô hình. `docs/EPISODE_RULES.md` §5.1 quy
 * định rõ các tiền tố này là *hợp đồng với mô hình* — bước `fragment_plan` phải xuất
 * ra đúng những nhãn này — nên dịch chúng sẽ đổi *kết quả sinh video*, không chỉ đổi
 * chữ trên màn hình. Vì vậy `insert` giữ nguyên verbatim ở cả ba ngôn ngữ.
 *
 * `label` và `hint` chỉ hiển thị trong danh sách, nên chúng đi theo ngôn ngữ đang
 * dùng và được khai báo bằng getter để lấy đúng lúc render.
 */

import { localized, localizedList, type LocalizedText } from './localeStrings'

export type DramaCameraLexiconGroup = 'shot' | 'move'

export type DramaCameraLexiconItem = {
  id: string
  group: DramaCameraLexiconGroup
  /** 列表展示名 */
  label: string
  /** 插入到脚本的文本（用户可继续补描写） */
  insert: string
  /** 一行说明 */
  hint: string
}

type LexiconSeed = {
  id: string
  group: DramaCameraLexiconGroup
  /** Tiền tố chèn vào kịch bản — hợp đồng với mô hình, giữ nguyên tiếng Trung */
  insert: string
  label: LocalizedText
  hint: LocalizedText
}

/** Shorthand so each row reads zh | en | vi top to bottom. */
function t(zh: string, en: string, vi: string): LocalizedText {
  return { zh, en, vi }
}

function seed(
  id: string,
  group: DramaCameraLexiconGroup,
  insert: string,
  label: LocalizedText,
  hint: LocalizedText,
): LexiconSeed {
  return { id, group, insert, label, hint }
}

function item(seed: LexiconSeed): DramaCameraLexiconItem {
  return {
    id: seed.id,
    group: seed.group,
    insert: seed.insert,
    get label() {
      return localized(seed.label)
    },
    get hint() {
      return localized(seed.hint)
    },
  }
}

/** 景别标签：写入画面行，勿标成对白 */
export const DRAMA_SHOT_SIZE_LEXICON: DramaCameraLexiconItem[] = [
  seed(
    'empty',
    'shot',
    '空镜：',
    t('空镜', 'Empty shot', 'Cảnh trống'),
    t('环境建立，无对白无旁白', 'Establishes the setting, no dialogue or narration', 'Thiết lập không gian, không lời thoại lẫn lời dẫn'),
  ),
  seed(
    'wide',
    'shot',
    '远景：',
    t('远景', 'Wide shot', 'Cảnh xa'),
    t('交代空间关系', 'Shows spatial relationships', 'Cho thấy quan hệ không gian'),
  ),
  seed(
    'full',
    'shot',
    '全景：',
    t('全景', 'Full shot', 'Toàn cảnh'),
    t('全身与环境同框', 'Whole figure within the setting', 'Toàn thân cùng bối cảnh trong khung hình'),
  ),
  seed(
    'medium',
    'shot',
    '中景：',
    t('中景', 'Medium shot', 'Cảnh trung'),
    t('腰部以上，对白常用', 'From the waist up; standard for dialogue', 'Từ ngang eo lên, dùng phổ biến cho lời thoại'),
  ),
  seed(
    'close',
    'shot',
    '近景：',
    t('近景', 'Close shot', 'Cảnh gần'),
    t('胸部以上，情绪贴近', 'From the chest up; close to the emotion', 'Từ trên ngực lên, gần với cảm xúc'),
  ),
  seed(
    'closeup',
    'shot',
    '特写：',
    t('特写', 'Close-up', 'Cận cảnh'),
    t('脸或关键道具', 'The face, or a key prop', 'Khuôn mặt hoặc vật quan trọng'),
  ),
  seed(
    'ecu',
    'shot',
    '大特写：',
    t('大特写', 'Extreme close-up', 'Cận cảnh cực đại'),
    t('眼、手、细节', 'Eyes, hands, fine detail', 'Mắt, tay, chi tiết nhỏ'),
  ),
  seed(
    'establish',
    'shot',
    '建立镜头：',
    t('建立镜头', 'Establishing shot', 'Cảnh thiết lập'),
    t('开场定场景气氛', 'Opens and sets the mood of a scene', 'Mở đầu và định không khí cho cảnh'),
  ),
  seed(
    'atmosphere',
    'shot',
    '气氛镜头：',
    t('气氛镜头', 'Atmosphere shot', 'Cảnh không khí'),
    t('光影/天气/物件烘托', 'Carried by light, weather, or objects', 'Nhấn mạnh bằng ánh sáng, thời tiết, vật thể'),
  ),
].map(item)

/** 运镜短语：单段运动轴建议 ≤ 2 */
export const DRAMA_CAMERA_MOVE_LEXICON: DramaCameraLexiconItem[] = [
  seed(
    'push',
    'move',
    '推镜：',
    t('推镜', 'Push in', 'Đẩy vào'),
    t('镜头前推靠近主体', 'The camera moves in towards the subject', 'Máy quay tiến lại gần chủ thể'),
  ),
  seed(
    'pull',
    'move',
    '拉镜：',
    t('拉镜', 'Pull out', 'Lùi ra'),
    t('镜头后拉展开空间', 'The camera pulls back to open up the space', 'Máy quay lùi ra để mở rộng không gian'),
  ),
  seed(
    'pan',
    'move',
    '摇镜：',
    t('摇镜', 'Pan', 'Quét ngang'),
    t('机位不动，水平/垂直扫视', 'The camera stays put and sweeps across', 'Máy quay đứng yên, quét ngang hoặc dọc'),
  ),
  seed(
    'truck',
    'move',
    '移镜：',
    t('移镜', 'Tracking shot', 'Camera di chuyển'),
    t('机位平移跟随', 'The camera travels with the subject', 'Máy quay dịch chuyển theo chủ thể'),
  ),
  seed(
    'follow',
    'move',
    '跟拍：',
    t('跟拍', 'Follow shot', 'Bám theo'),
    t('跟随人物移动', 'Follows the character as they move', 'Bám theo nhân vật khi họ di chuyển'),
  ),
  seed(
    'high',
    'move',
    '俯拍：',
    t('俯拍', 'High angle', 'Góc nhìn từ trên xuống'),
    t('高角度向下', 'Looking down from above', 'Nhìn xuống từ góc cao'),
  ),
  seed(
    'low',
    'move',
    '仰拍：',
    t('仰拍', 'Low angle', 'Góc nhìn từ dưới lên'),
    t('低角度向上', 'Looking up from below', 'Nhìn lên từ góc thấp'),
  ),
  seed(
    'aerial',
    'move',
    '航拍：',
    t('航拍', 'Aerial shot', 'Góc nhìn từ trên không'),
    t('大全景俯视', 'A wide overhead view', 'Góc nhìn toàn cảnh từ trên cao'),
  ),
].map(item)

/** 合并词库（插入列表用） */
export const DRAMA_CAMERA_LEXICON: DramaCameraLexiconItem[] = [
  ...DRAMA_SHOT_SIZE_LEXICON,
  ...DRAMA_CAMERA_MOVE_LEXICON,
]

/** 运镜使用提示（只展示，不插入） */
export const DRAMA_CAMERA_USAGE_TIPS: string[] = localizedList([
  {
    zh: '公式：主体 + 动作 + 场景 +（景别/运镜）+（光影）',
    en: 'Formula: subject + action + setting + (shot size / camera move) + (light)',
    vi: 'Công thức: chủ thể + hành động + bối cảnh + (cỡ cảnh / cách quay) + (ánh sáng)',
  },
  {
    zh: '每段运动轴 ≤ 2（推+摇可以；推+摇+升易失控）',
    en: 'At most 2 moves per segment (push + pan is fine; push + pan + rise is easy to lose)',
    vi: 'Mỗi đoạn tối đa 2 trục chuyển động (đẩy + quét ngang thì được; đẩy + quét + nâng rất dễ mất kiểm soát)',
  },
  {
    zh: '近景大旋转易崩脸，环绕留给中景以上',
    en: 'A big orbit on a close shot wrecks the face; save orbits for medium and wider',
    vi: 'Xoay vòng lớn ở cảnh gần dễ làm hỏng khuôn mặt; để vòng quanh cho cảnh trung trở ra',
  },
  {
    zh: '空镜/景别必须用画面写法，禁止标成对白或旁白',
    en: 'Empty shots and shot sizes must stay picture lines — never mark them as dialogue or narration',
    vi: 'Cảnh trống và cỡ cảnh phải viết dưới dạng dòng hình ảnh, tuyệt đối không đánh dấu là lời thoại hay lời dẫn',
  },
])

// 按关键字过滤词库（匹配 label / insert / hint）
export function filterDramaCameraLexicon(
  items: DramaCameraLexiconItem[],
  query: string,
): DramaCameraLexiconItem[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return items
  return items.filter((item) =>
    [item.label, item.insert, item.hint].some((field) => field.toLowerCase().includes(q)),
  )
}
