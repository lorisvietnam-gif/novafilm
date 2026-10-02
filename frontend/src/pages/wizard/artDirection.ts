/**
 * Bảng chỉ đạo nghệ thuật: cắt prompt của mỗi khung thành bảy trường có nhãn.
 *
 * ---- VÌ SAO PHẢI CẮT, KHÔNG CHỈ LIỆT KÊ --------------------------------------
 * Người dùng thường chỉ cần **cắm một đoạn**: riêng chuyển động máy quay để dán vào ô
 * camera của Veo, riêng phần ánh sáng để dán vào Kling. Đưa cả bài vào thì họ phải tự
 * tìm, và tìm thì hay xoá nhầm mất một chi tiết. Nên bước 4 là **bảng**, mỗi trường một
 * thẻ riêng với nút Copy riêng — không phải một ô text.
 *
 * ---- HỢP ĐỒNG VỚI BACKEND: KHÔNG ĐỔI -------------------------------------------
 * `POST /api/wizard/generate_prompt` chỉ hứa "một prompt tiếng Anh"
 * (`WizardGeneratePromptOut`: `prompt`, `script`, `frames[{prompt, narration}]`). Không
 * có trường cấu trúc nào để đọc. Vì vậy phân rã **ở trình duyệt** trên đúng văn bản đã
 * có, và không đụng hợp đồng API — đổi API là việc của lane khác.
 *
 * ---- TÍNH CHẤT ĐO ĐƯỢC, KHÔNG PHẢI LờI Hứa ------------------------------------
 * `classifyClause` là hàm thuần, và bảng luôn có **đúng bảy thẻ** với đúng bảy nhãn
 * kể cả khi trường đó không có gì — thẻ rỗng nói thẳng là prompt không nhắc tới, và nút
 * Copy của nó **tắt**. Bỏ trống im lặng thì người dùng tưởng mình đã lấy đủ thông tin.
 *
 * Bất biến quan trọng nhất, và là thứ `wizard-board-check.mjs` kiểm: **không mệnh đề nào
 * rơi khỏi bảng**. Không câu nào biến mất — mất một câu nghĩa là mất thứ người dùng cần dán.
 * Nên `matchClause` không bao giờ trả danh sách rỗng, và `unplaced` phải bằng `0`.
 */

/** Bảy trường của bảng chỉ đạo. Thứ tự là thứ tự hiển thị. */
export const BOARD_FIELDS = [
  'subject',
  'action',
  'setting',
  'camera',
  'lighting',
  'style',
  'duration',
] as const

export type BoardField = (typeof BOARD_FIELDS)[number]

/**
 * Trường cuối trong `BOARD_FIELDS`, dùng làm **thùng rác** cho câu không khớp quy tắc nào.
 *
 * `action` vì hợp đồng của nó là "prompt nói chuyện gì xảy ra", và một mệnh đề trần không
 * phân loại được thì thường rơi vào đúng chỗ đó. Quan trọng hơn là lựa chọn thứ hai —
 * `return null` sẽ **im lặng bỏ mất câu**, tức là bảng không còn tái dựng được prompt.
 */
const FALLBACK_FIELD: BoardField = 'action'

/**
 * Ranh giới từ phải hiểu chữ có dấu, **không** dùng `\b`.
 *
 * Đo trên chính câu thật của bản nháp (`re-test.mjs`, xem báo cáo): với `\b` kiểu ASCII,
 * 6/10 từ khoá tiếng Việt khớp; đổi sang ranh giới theo `\p{L}` thì 10/10. Bốn từ mất là
 * `phố`, `đêm`, `đèn`, `thở` — tức là **mọi từ Việt tận cùng bằng một chữ có dấu**. Lý do:
 * `\b` chỉ coi `[A-Za-z0-9_]` là chữ, nên `ố` là "không phải chữ", rồi `\b` đòi một bên là
 * chữ và bên kia không — mà hai bên đều không phải chữ nên không có ranh giới, và từ đó
 * không bao giờ khớp. Hậu quả là thẻ "Bối cảnh" và "Hành động" trống trên câu tiếng Việt
 * mà bảng tưởng là đã nhận diện được.
 */
const WORD_START = '(?<![\\p{L}\\p{N}])'
const WORD_END = '(?![\\p{L}\\p{N}])'

function wordRule(field: BoardField, body: string): { field: BoardField; re: RegExp } {
  return { field, re: new RegExp(`${WORD_START}(?:${body})${WORD_END}`, 'iu') }
}

/**
 * Từ khoá nhận diện, theo **thứ tự ưu tiên từ trên xuống**; câu khớp trước thì thắng.
 *
 * Thứ tự này là một quyết định, không phải tình cờ. `style` đứng trước `camera` vì
 * "Cinematic shot" là lời chỉ định phong cách trong khi "Medium shot" là lời chỉ định
 * khung hình: cùng chứa chữ `shot`, nhưng nếu để `camera` trước thì cả hai rơi vào máy
 * quay và thẻ "Phong cách" trống trơn.
 *
 * Cả tiếng Anh lẫn tiếng Việt. Bản nháp dựng trong trình duyệt khi API lỗi bám theo ý
 * tưởng của người dùng, mà tiếng Việt là ngôn ngữ chính của sản phẩm — bảng chỉ nhận
 * diện được tiếng Anh thì đúng vào nhánh lỗi lại là thẻ trống.
 */
const RULES: { field: BoardField; re: RegExp }[] = [
  wordRule('duration', '\\d+\\s*(?:s|sec|secs|second|seconds)|giây|duration'),
  wordRule(
    'style',
    'cinematic|style|film\\s?look|colou?r\\s?grade|anamorphic|teal|and\\s?orange|film\\s?grain'
      + '|vintage|retro|noir|documentary|advertis\\w*|commercial|music\\s?video|aspect\\s?ratio'
      + '|16:9|9:16|4k|hd|depth\\s?of\\s?field|bokeh|phong\\s?cách|điện\\s?ảnh',
  ),
  wordRule(
    'camera',
    'dolly|pan|tilt|tracking|handheld|crane|zoom|lens|\\d{2,3}\\s?mm\\b|close-?up|wide\\s?shot'
      + '|medium\\s?shot|over-?the-?shoulder|establishing|shot|camera|framing|push[\\s-]?in'
      + '|pull[\\s-]?back|orbit|máy\\s?quay|chụp|khung\\s?hình',
  ),
  wordRule(
    'lighting',
    'light|lit|lighting|backlit|rim[\\s-]?light|key[\\s-]?light|glow|neon|shadow|highlight'
      + '|golden\\s?hour|blue\\s?hour|dusk|dawn|night|daylight|sunlight|bloom'
      + '|ánh\\s?sáng|đèn|chiều|đêm|bóng',
  ),
  wordRule(
    'setting',
    'street|room|interior|exterior|cafe|café|forest|city|beach|mountain|office|station|shop'
      + '|store|kitchen|bedroom|market|garden|alley|rooftop|background|location|setting|environment'
      + '|bối\\s?cảnh|phố|quán|căn|nhà|rừng|thành\\s?phố|biển',
  ),
  wordRule(
    'subject',
    'woman|man|girl|boy|child|person|people|crowd|dog|cat|character|protagonist|subject|figure'
      + '|silhouette|nhân\\s?vật|cô\\s?gái|con\\s?trai|người|đàn\\s?ông',
  ),
  wordRule(
    'action',
    'run|walk|stop|look|sigh|turn|sit|stand|reach|hold|open|close|smile|laugh|cry|speak|talk|move'
      + '|dance|drive|ride|carry|drop|catch|throw|watch|wait|breathe|gesture|wave|point|lean|bend'
      + '|step|chase|flee|approach|depart'
      + '|chạy|đi|dừng|nhìn|thở|quay|ngồi|đứng|cầm|mở|đóng|cười|khóc|nói|mỉm|vẫy|bước',
  ),
]

/**
 * Cắt một prompt thành các mệnh đề.
 *
 * Cắt ở dấu phẩy và dấu chấm **cuối câu**, nhưng **không** cắt ở dấu chấm thập phân hay
 * trong `1.5` — nên dấu chấm phải đi kèm khoảng trắng hoặc cuối chuỗi, và `:` cũng là
 * ranh giới vì bảng điều khiển bên ngoài hay viết `Camera: dolly in`.
 */
function splitClauses(prompt: string): string[] {
  return prompt
    .replace(/\s+/g, ' ')
    .split(/\s*[;:]\s*|,(?=\s)|\.(?=\s|$)|\s+[-–—]\s+/)
    .map((s) => s.trim().replace(/[.,;:]+$/, ''))
    .filter(Boolean)
}

/**
 * Mệnh đề này thuộc **bao nhiêu** trường — và danh sách đó có thể dài hơn một.
 *
 * Không phải "khớp trước thắng". Đo trên ý tưởng thật của bản nháp, một mệnh đề tiếng Việt
 * mang nhiều thông tin cùng lúc: *"Một cô gái trẻ mặc áo khoác da **chạy** băng qua **phố**
 * mưa lúc đêm"* vừa có chủ thể, vừa có hành động, vừa có bối cảnh. Gán nó vào một thẻ
 * duy nhất là **vứt mất hai phần ba thứ người dùng cần** — mà bảng này sinh ra chính là để
 * họ lấy đúng một phần. Nên một mệnh đề vào **mọi** thẻ mà nó thật sự khớp.
 *
 * Hệ quả được chấp nhận có chủ ý: cùng một câu có thể xuất hiện ở hai thẻ. Đó là cái giá
 * của việc cho phép sao chép "riêng phần ánh sáng", và người dùng đã bấm Copy đúng thẻ
 * mình muốn.
 *
 * Trường hở ra — mệnh đề không khớp quy tắc nào — rơi vào `FALLBACK_FIELD`. Không bao
 * giờ trả danh sách rỗng, vì mệnh đề không khớp ở đâu vẫn phải hiện ở ít nhất một thẻ.
 */
function matchClause(clause: string): BoardField[] {
  const hits = new Set<BoardField>()
  for (const rule of RULES) {
    if (rule.re.test(clause)) hits.add(rule.field)
  }
  if (hits.size === 0) return [FALLBACK_FIELD]
  // Trả về đúng thứ tự `BOARD_FIELDS` để cột bảng luôn đọc như nhau.
  return BOARD_FIELDS.filter((f) => hits.has(f))
}

/** Một ô của bảng: những gì prompt nói về trường đó, theo thứ tự khung. */
export type BoardSlot = {
  /** Mệnh đề ghép lại, `; ` nối các mệnh đề của cùng một trường trong một khung. */
  text: string
  /** Số thứ tự khung (1-based) mà `text` này đến từ đó. */
  frameNo: number
}

/** Một trường của bảng, đã gom theo cả bốn khung. */
export type BoardCard = {
  field: BoardField
  /** Rỗng khi prompt không nhắc tới trường này — lúc đó nút Copy phải tắt. */
  slots: BoardSlot[]
}

export type ArtDirectionBoard = {
  cards: BoardCard[]
  /** Bảy thẻ, **luôn** đủ thứ tự `BOARD_FIELDS` — kể cả thẻ rỗng. */
  cardsByField: Record<BoardField, BoardCard>
  /** Tổng số mệnh đề đã tách ra từ prompt. */
  clauses: number
  /** Số mệnh đề không khớp quy tắc nào và rơi vào `FALLBACK_FIELD`. Đo được, không giấu. */
  unmatched: number
  /**
   * Số mệnh đề **không** xuất hiện ở bất kỳ thẻ nào. Bằng `0` là bất biến của bảng, và
   * `wizard-board-check.mjs` kiểm đúng con số này.
   */
  unplaced: number
}

/**
 * Dựng bảng chỉ đạo từ danh sách prompt của các khung.
 *
 * @param prompts Một prompt mỗi khung. Rỗng thì bảng vẫn có bảy thẻ, tất cả rỗng.
 */
export function buildArtDirectionBoard(prompts: readonly string[]): ArtDirectionBoard {
  const slots: Record<BoardField, BoardSlot[]> = {
    subject: [], action: [], setting: [], camera: [], lighting: [], style: [], duration: [],
  }
  /** Số câu đã vào ít nhất một thẻ, để chứng minh bất biến "không mất câu nào". */
  let placed = 0
  let unmatched = 0
  let clauses = 0

  prompts.forEach((prompt, index) => {
    const grouped = new Map<BoardField, string[]>()
    for (const clause of splitClauses(prompt || '')) {
      clauses += 1
      const fields = matchClause(clause)
      if (fields.length === 1 && fields[0] === FALLBACK_FIELD) unmatched += 1
      if (fields.length) placed += 1
      for (const field of fields) {
        const bucket = grouped.get(field)
        if (bucket) bucket.push(clause)
        else grouped.set(field, [clause])
      }
    }
    for (const [field, parts] of grouped) {
      slots[field].push({ text: parts.join('; '), frameNo: index + 1 })
    }
  })

  const cards = BOARD_FIELDS.map((field) => ({ field, slots: slots[field] }))
  const cardsByField = {} as Record<BoardField, BoardCard>
  for (const card of cards) cardsByField[card.field] = card

  return { cards, cardsByField, clauses, unmatched, unplaced: clauses - placed }
}

/**
 * Nội dung một thẻ để đưa vào bộ nhớ tạm — mỗi khung một dòng.
 *
 * Trả `''` khi thẻ rỗng: đó là tín hiệu để nút Copy **tắt**, không phải để sao chép chuỗi
 * rỗng. Sao chép rỗng là một cú bấm nói dối.
 */
export function boardCardText(card: BoardCard): string {
  return card.slots.map((slot) => slot.text).join('\n')
}