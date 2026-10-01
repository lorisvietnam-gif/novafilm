/**
 * Nhãn hiển thị cho từ vựng tiếng Trung nằm trong kịch bản drama.
 *
 * Kịch bản tập do mô hình viết ra và backend chèn thêm các marker định dạng (`【字幕：…】`,
 * `【BGM：…】`, `【对白·…】`), còn dàn ý có các dòng thông tin `出场人物：` và dòng cảnh
 * `日 外 <địa điểm>`. Tất cả đều lưu trong database đúng bằng tiếng Trung, vì phía sau
 * `build_fragments.py` và `dramaEpisodeScriptValidate.ts` khớp chuỗi đó để dựng video và
 * để kiểm tra kịch bản. **Giá trị gốc vì vậy không được sửa** — sửa là hỏng chức năng, không
 * chỉ hỏng ngoại hình.
 *
 * Ở đây chỉ tra một **nhãn hiển thị** cho từ vựng cố định đó, đúng khuôn
 * `backendMessages.ts` / `templateLabels.ts`: bảng là `Record` thuần, đọc qua
 * `localized()` lúc hiển thị, thiếu mục thì trả về nguyên văn.
 *
 * Ranh giới quan trọng — bảng này chỉ dùng cho **đọc xem**:
 * - `outlineScriptPreview.tsx` dùng `localizeScriptLine()` khi render thẻ cảnh.
 * - `dramaEpisodePromptEditor.ts` dùng `localizeScriptContent()` **chỉ khi không ở chế độ
 *   soạn**, vì ô soạn thảo serialize ngược DOM về `content` và gửi lên backend.
 *   Ở chế độ soạn phải giữ nguyên tiếng Trung, nếu không người dùng bấm "Lưu" là hỏng
 *   luôn bài kiểm tra định dạng.
 *
 * Cùng cơ chế với `dramaImageStyles.ts` (module từng gây trắng trang, xem `AGENTS.md` §7):
 * KHÔNG dùng getter và KHÔNG spread các mục này ở cấp module.
 */

import { localized, type LocalizedText } from './localeStrings'

/**
 * Marker cue đứng đầu dòng, khoá là **đúng chuỗi** backend chèn vào `content`.
 *
 * Liệt kê từ `seedance_segments.py` và `drama/build_fragments.py`. Bản `zh` giữ nguyên
 * vì người dùng locale `zh` phải thấy đúng kịch bản như đã lưu.
 */
const CUE_LABELS: Record<string, LocalizedText> = {
  '【字幕：底部居中·简体中文·逐句轮换·与口播同步】': {
    zh: '【字幕：底部居中·简体中文·逐句轮换·与口播同步】',
    en: '[Subtitles: bottom centre, Simplified Chinese, rotating line by line, synced to the voice-over]',
    vi: '[Phụ đề: giữa dưới, chữ Trung giản thể, lần lượt từng câu, khớp lời dẫn]',
  },
  '【字幕：后期叠旁白字幕，简体中文逐句同步】': {
    zh: '【字幕：后期叠旁白字幕，简体中文逐句同步】',
    en: '[Subtitles: added in post, Simplified Chinese, synced line by line to the voice-over]',
    vi: '[Phụ đề: dựng thêm ở hậu kỳ, chữ Trung giản thể, khớp từng câu với lời dẫn]',
  },
  '【字幕：全程简体中文字幕，旁白逐句同步烧录】': {
    zh: '【字幕：全程简体中文字幕，旁白逐句同步烧录】',
    en: '[Subtitles: Simplified Chinese throughout, burnt in line by line with the voice-over]',
    vi: '[Phụ đề: chữ Trung giản thể toàn bộ, khắc thẳng khớp từng câu với lời dẫn]',
  },
  '【字幕：底部居中·简体中文·仅标记段落同步】': {
    zh: '【字幕：底部居中·简体中文·仅标记段落同步】',
    en: '[Subtitles: bottom centre, Simplified Chinese, only tagged passages are synced]',
    vi: '[Phụ đề: giữa dưới, chữ Trung giản thể, chỉ đồng bộ đoạn được đánh dấu]',
  },
  '【字幕：底部居中·简体中文】': {
    zh: '【字幕：底部居中·简体中文】',
    en: '[Subtitles: bottom centre, Simplified Chinese]',
    vi: '[Phụ đề: giữa dưới, chữ Trung giản thể]',
  },
  '【对白·慢速清晰·同步字幕】': {
    zh: '【对白·慢速清晰·同步字幕】',
    en: '[Dialogue: slow, clear, subtitled]',
    vi: '[Thoại: chậm rõ ràng, có phụ đề]',
  },
  '【对白·慢速清晰】': {
    zh: '【对白·慢速清晰】',
    en: '[Dialogue: slow and clear]',
    vi: '[Thoại: chậm và rõ ràng]',
  },
  '【旁白·慢速清晰·同步字幕】': {
    zh: '【旁白·慢速清晰·同步字幕】',
    en: '[Narration: slow, clear, subtitled]',
    vi: '[Lời dẫn: chậm rõ ràng, có phụ đề]',
  },
  '【旁白·慢速清晰】': {
    zh: '【旁白·慢速清晰】',
    en: '[Narration: slow and clear]',
    vi: '[Lời dẫn: chậm và rõ ràng]',
  },
  '【旁白·自然语速·同步字幕】': {
    zh: '【旁白·自然语速·同步字幕】',
    en: '[Narration: natural pace, subtitled]',
    vi: '[Lời dẫn: tốc độ tự nhiên, có phụ đề]',
  },
  '【旁白·自然语速】': {
    zh: '【旁白·自然语速】',
    en: '[Narration: natural pace]',
    vi: '[Lời dẫn: tốc độ tự nhiên]',
  },
  '【内心独白·同步字幕】': {
    zh: '【内心独白·同步字幕】',
    en: '[Inner voice: subtitled]',
    vi: '[Nội tâm: có phụ đề]',
  },
  '【内心独白】': { zh: '【内心独白】', en: '[Inner voice]', vi: '[Nội tâm]' },
  '【画面·无配音仅环境音】': {
    zh: '【画面·无配音仅环境音】',
    en: '[Visual: no voice-over, ambient sound only]',
    vi: '[Hình ảnh: không lời dẫn, chỉ tiếng không gian]',
  },
  '【空镜·可仅环境音与 BGM】': {
    zh: '【空镜·可仅环境音与 BGM】',
    en: '[Empty shot: ambient sound and BGM only]',
    vi: '[Cảnh trống: chỉ tiếng không gian và nhạc nền]',
  },
  '【人物介绍·画面叠字·角色身旁】': {
    zh: '【人物介绍·画面叠字·角色身旁】',
    en: '[Character intro: on-screen text beside the character]',
    vi: '[Giới thiệu nhân vật: chữ đè trên hình, cạnh nhân vật]',
  },
  '【人物介绍·画面叠字】': {
    zh: '【人物介绍·画面叠字】',
    en: '[Character intro: on-screen text]',
    vi: '[Giới thiệu nhân vật: chữ đè trên hình]',
  },
  '【片头·集号叠字】': {
    zh: '【片头·集号叠字】',
    en: '[Opening titles: episode number on screen]',
    vi: '[Mở đầu: số tập đè trên hình]',
  },
  '【片头·集名叠字】': {
    zh: '【片头·集名叠字】',
    en: '[Opening titles: episode title on screen]',
    vi: '[Mở đầu: tên tập đè trên hình]',
  },
  '【片头·剧名叠字】': {
    zh: '【片头·剧名叠字】',
    en: '[Opening titles: series title on screen]',
    vi: '[Mở đầu: tên phim đè trên hình]',
  },
  '【片头·类型标注】': {
    zh: '【片头·类型标注】',
    en: '[Opening titles: genre caption]',
    vi: '[Mở đầu: nhãn thể loại]',
  },
  '【背景介绍·画面叠字】': {
    zh: '【背景介绍·画面叠字】',
    en: '[Background: on-screen text]',
    vi: '[Bối cảnh: chữ đè trên hình]',
  },
}

/**
 * Mô tả tâm trạng nhạc nền mà `_infer_bgm_mood()` ở backend chọn từ một danh sách đóng.
 * Danh sách đó nằm trong code backend nên ở đây phải liệt kê trùng; thiếu mục thì cue BGM
 * hiện nguyên tiếng Trung và được ghi trong báo cáo.
 */
const BGM_MOOD_LABELS: Record<string, LocalizedText> = {
  '低沉紧张、鼓点渐强，烘托压迫与危机感': {
    zh: '低沉紧张、鼓点渐强，烘托压迫与危机感',
    en: 'low and tense, drums building, underlining pressure and danger',
    vi: 'trầm và căng thẳng, tiếng trống dồn dập, nặng không khí ngột ngạt và nguy hiểm',
  },
  '庄重史诗、弦乐铺底，气势恢宏但不抢戏': {
    zh: '庄重史诗、弦乐铺底，气势恢宏但不抢戏',
    en: 'solemn and epic, strings underneath, grand without crowding out the scene',
    vi: 'trang nghiêm và hoành tráng, dây đàn nền, lớn mà không lấn át diễn xuất',
  },
  '神秘悬疑、低频铺底，留白感强': {
    zh: '神秘悬疑、低频铺底，留白感强',
    en: 'mysterious and suspenseful, low frequencies underneath, lots of space',
    vi: 'bí ẩn nghi ngờ, tần số thấp nền, nhiều khoảng trống',
  },
  '流动感环境音乐，水声与弦乐交织': {
    zh: '流动感环境音乐，水声与弦乐交织',
    en: 'flowing ambient music, water and strings interwoven',
    vi: 'nhạc không gian chảy, tiếng nước hòa dây đàn',
  },
  '轻柔开阔、希望感，钢琴或弦乐为主': {
    zh: '轻柔开阔、希望感，钢琴或弦乐为主',
    en: 'soft and open, hopeful, led by piano or strings',
    vi: 'nhẹ và rộng, đầy hy vọng, chủ yếu piano hoặc dây đàn',
  },
  '贴合剧情氛围的轻量配乐，情绪随画面起伏': {
    zh: '贴合剧情氛围的轻量配乐，情绪随画面起伏',
    en: 'light score that follows the mood of the story, rising and falling with the picture',
    vi: 'nhạc nhẹ hợp không khí câu chuyện, lên xuống theo hình ảnh',
  },
}

/** Hậu tố cố định mà backend chèn sau mô tả tâm trạng: `【BGM：<mood>；音量低于人声】`. */
const BGM_VOLUME_SUFFIX = '；音量低于人声】'
const BGM_POST_MIX_PREFIX = '【BGM：后期混音 · '
const BGM_CUE_PREFIX = '【BGM：'

/**
 * Đuôi mà `seedance_segments.build_production_cues()` **luôn** dán vào tâm trạng trước khi
 * bọc cue `【BGM：后期混音 · {mood}】`. Hậu tố này **không** thuộc từ vựng tâm trạng, nên phải
 * bỏ ra trước khi tra `BGM_MOOD_LABELS` — bảng lấy từ `build_fragments._infer_bgm_mood()`, một
 * danh sách khác, và không mục nào chứa `音量低于人声`.
 *
 * Không bỏ nó thì nhánh `postMix` **không bao giờ** trúng bảng: nó là code chết. Đã đo được
 * trên database thật — `【BGM：后期混音 · 轻快专业，音量低于人声】` lọt nguyên tiếng Trung lên
 * `/drama/projects/16/episodes/3` dù `CUE_LABELS` phủ hết cue phụ đề ngay cạnh nó.
 */
const BGM_MOOD_TAIL = '，音量低于人声'

/** Vỏ cue BGM sau khi đã tra tâm trạng; `{mood}` là chỗ chèn nhãn tâm trạng. */
const BGM_CUE_TEMPLATES: Record<string, LocalizedText> = {
  volume: {
    zh: '【BGM：{mood}；音量低于人声】',
    en: '[BGM: {mood}; level below the voice]',
    vi: '[Nhạc nền: {mood} · âm lượng thấp hơn giọng nói]',
  },
  postMix: {
    zh: '【BGM：后期混音 · {mood}{tail}】',
    en: '[BGM: mixed in post · {mood}{tail}]',
    vi: '[Nhạc nền: trộn ở hậu kỳ · {mood}{tail}]',
  },
}

/**
 * Cách nói cùng một ý với `BGM_MOOD_TAIL` cho locale khác.
 *
 * **Không phải từ vựng mới**: đó là đúng chữ đã viết sẵn trong khuôn `volume` ở trên, chỉ tách
 * ra để dán lại khi tra được tâm trạng ở dạng `后期混音`. Bỏ đuôi đi lúc hiển thị là **mất
 * thông tin trong kịch bản** — người dùng `zh` phải thấy đúng những gì đã lưu.
 */
const BGM_MOOD_TAIL_LABELS: LocalizedText = {
  zh: BGM_MOOD_TAIL,
  en: '; level below the voice',
  vi: ' · âm lượng thấp hơn giọng nói',
}

/** `【空镜：<mô tả>】` — phần mô tả do mô hình viết nên không liệt kê, chỉ dịch tiền tố. */
const EMPTY_SHOT_PREFIX = '【空镜：'
const EMPTY_SHOT_OPENERS: Record<string, LocalizedText> = {
  '【空镜：': { zh: '【空镜：', en: '[Empty shot: ', vi: '[Cảnh trống: ' },
}

/** Nhãn tiền tố của dòng thông tin trong dàn ý (`出场人物：…`, `时间：…`, `地点：…`). */
const META_FIELD_LABELS: Record<string, LocalizedText> = {
  出场人物: { zh: '出场人物', en: 'Characters', vi: 'Nhân vật' },
  时间: { zh: '时间', en: 'Time', vi: 'Thời gian' },
  地点: { zh: '地点', en: 'Location', vi: 'Địa điểm' },
  内外景: { zh: '内外景', en: 'Setting', vi: 'Bối cảnh' },
}

/** Múi giờ trong dòng cảnh (`日 外`, `日外`, `清晨 内`…). */
const TIME_LABELS: Record<string, LocalizedText> = {
  日: { zh: '日', en: 'Day', vi: 'Ban ngày' },
  夜: { zh: '夜', en: 'Night', vi: 'Ban đêm' },
  晨: { zh: '晨', en: 'Dawn', vi: 'Bình minh' },
  早: { zh: '早', en: 'Early morning', vi: 'Sáng sớm' },
  午: { zh: '午', en: 'Noon', vi: 'Trưa' },
  晚: { zh: '晚', en: 'Evening', vi: 'Buổi tối' },
  昏: { zh: '昏', en: 'Dusk', vi: 'Chiều muộn' },
  黄昏: { zh: '黄昏', en: 'Dusk', vi: 'Chiều muộn' },
  傍晚: { zh: '傍晚', en: 'Late afternoon', vi: 'Chiều tối' },
  凌晨: { zh: '凌晨', en: 'Small hours', vi: 'Rạng sáng' },
  清晨: { zh: '清晨', en: 'Early morning', vi: 'Sáng sớm' },
}

/** Nội / ngoại cảnh. */
const SETTING_LABELS: Record<string, LocalizedText> = {
  内: { zh: '内', en: 'Interior', vi: 'Nội cảnh' },
  外: { zh: '外', en: 'Exterior', vi: 'Ngoại cảnh' },
  内外: { zh: '内外', en: 'Interior/Exterior', vi: 'Nội – ngoại cảnh' },
  内外景: { zh: '内外景', en: 'Interior/Exterior', vi: 'Nội – ngoại cảnh' },
}

/**
 * Dòng cảnh: múi giờ + nội ngoại + địa điểm.
 *
 * Khớp `SCENE_LOCATION_RE` ở `backend/app/services/drama/build_fragments.py`, nhưng viết
 * dài hơn một chữ ở nhánh thứ nhất (`清晨`, `凌晨`, `黄昏`, `傍晚`) vì regex backend chỉ liệt
 * kê từng ký tự và sẽ khớp nhầm `昏 外` thành `黄昏`. Việc sửa regex backend nằm ngoài phạm vi
 * repo frontend, nên ở đây chỉ cần nhánh hiển thị nhận đúng cả hai dạng.
 */
const SCENE_HEADER_RE = /^(清晨|凌晨|黄昏|傍晚|日|夜|晨|早|晚|午|昏)\s*(内外景|内外|内|外)\s*([\s\S]*)$/
/** Dòng thông tin: `出场人物：A、B` (cũng chấp nhận dấu hai chấm ASCII). */
const META_FIELD_RE = /^(出场人物|时间|地点|内外景)\s*[：:]\s*([\s\S]*)$/
/** Marker cue ở đầu dòng: `【…】`. */
const CUE_RE = /^(【[^】]*】)([\s\S]*)$/

function lookupLabel(
  table: Record<string, LocalizedText>,
  key: string,
): string | null {
  const entry = table[key]
  return entry ? localized(entry) : null
}

function fillBgmTemplate(key: 'volume' | 'postMix', mood: string, tail = ''): string {
  return localized(BGM_CUE_TEMPLATES[key])
    .replace('{mood}', mood)
    // `{tail}` chỉ nằm trong khuôn `postMix`, nên `replace` ở `volume` là no-op.
    .replace('{tail}', tail ? localized(BGM_MOOD_TAIL_LABELS) : '')
}

/**
 * Dịch một marker cue.
 *
 * Thứ tự: tra bảng trước (hết các biến thể backend chèn cố định), rồi mới xử lý hai dạng có
 * tham số — tâm trạng BGM và mô tả của `【空镜：…】`. Không nhận diện được thì trả về
 * nguyên văn: mất một marker lạ còn hơn in sai nội dung kịch bản.
 */
export function localizeScriptCue(cue: string): string {
  const exact = lookupLabel(CUE_LABELS, cue)
  if (exact) return exact

  if (cue.startsWith(BGM_CUE_PREFIX) && cue.endsWith(BGM_VOLUME_SUFFIX)) {
    const mood = cue.slice(BGM_CUE_PREFIX.length, cue.length - BGM_VOLUME_SUFFIX.length)
    const moodLabel = lookupLabel(BGM_MOOD_LABELS, mood)
    if (moodLabel) return fillBgmTemplate('volume', moodLabel)
  }

  if (cue.startsWith(BGM_POST_MIX_PREFIX) && cue.endsWith('】')) {
    const mood = cue.slice(BGM_POST_MIX_PREFIX.length, cue.length - 1).trim()
    // Bỏ đuôi `，音量低于人声` trước khi tra: nó là đuôi do backend dán, không phải từ vựng.
    // Tâm trạng gốc vẫn giữ nguyên phần còn lại, và đuôi được dán lại khi dán bản dịch.
    const hasTail = mood.endsWith(BGM_MOOD_TAIL)
    const moodLabel = lookupLabel(
      BGM_MOOD_LABELS,
      hasTail ? mood.slice(0, mood.length - BGM_MOOD_TAIL.length).trim() : mood,
    )
    if (moodLabel) return fillBgmTemplate('postMix', moodLabel, hasTail ? BGM_MOOD_TAIL : '')
  }

  if (cue.startsWith(EMPTY_SHOT_PREFIX) && cue.endsWith('】')) {
    const opener = lookupLabel(EMPTY_SHOT_OPENERS, EMPTY_SHOT_PREFIX)
    const body = cue.slice(EMPTY_SHOT_PREFIX.length, cue.length - 1)
    if (opener && body) return `${opener}${body}]`
  }

  return cue
}

/**
 * Dịch một dòng kịch bản để **hiển thị**. Giá trị gốc không đổi.
 *
 * Ba dạng được nhận diện, đúng thứ tự `parseScriptLine()` dùng để phân loại:
 * dòng cue (`【…】`), dòng thông tin (`出场人物：…`) và dòng cảnh (`日 外 …`).
 */
export function localizeScriptLine(line: string): string {
  const trimmed = (line ?? '').trim()
  if (!trimmed) return trimmed

  const cueMatch = trimmed.match(CUE_RE)
  if (cueMatch) return localizeScriptCue(cueMatch[1]) + cueMatch[2]

  const metaMatch = trimmed.match(META_FIELD_RE)
  if (metaMatch) {
    const label = lookupLabel(META_FIELD_LABELS, metaMatch[1])
    if (label) return `${label}: ${metaMatch[2]}`.trimEnd()
  }

  const sceneMatch = trimmed.match(SCENE_HEADER_RE)
  if (sceneMatch) {
    const time = lookupLabel(TIME_LABELS, sceneMatch[1])
    const setting = lookupLabel(SETTING_LABELS, sceneMatch[2])
    if (time && setting) {
      const place = sceneMatch[3].trim()
      return place ? `${time} · ${setting} — ${place}` : `${time} · ${setting}`
    }
  }

  return trimmed
}

/**
 * Dịch cả khối nội dung kịch bản để **hiển thị**, giữ nguyên số dòng.
 *
 * Dòng không nhận diện được marker thì trả về **nguyên bản** kèm thụt lề, không phải bản
 * đã trim — kịch bản quay dùng thụt lề để phân cấp, mất nó thì bố cục đọc được sẽ đổi.
 */
export function localizeScriptContent(content: string): string {
  return (content || '')
    .split('\n')
    .map((line) => {
      const localizedLine = localizeScriptLine(line)
      return localizedLine === line.trim() ? line : localizedLine
    })
    .join('\n')
}