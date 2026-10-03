/**
 * Bảng chỉ đạo nghệ thuật: tách **prompt có nhãn** của mỗi khung thành bảy thẻ có nhãn.
 *
 * ---- CẤU TRÚC THẬT, KHÔNG PHẢI CẤU TRÚC ĐOÁN ----------------------------------
 * Bản trước đây quét **từ khoá** trong văn xuôi (`RULES`, `splitClauses`) để suy ra mệnh đề
 * nào nói về trường nào. Đo được trên ảnh chụp thật, nó hỏng đúng như sợ: một câu tiếng Việt
 * dài vừa có chủ thể vừa có hành động vừa có bối cảnh, và vì `matchClause` trả về **mọi**
 * thẻ mà câu đó khớp, cùng một câu hiện ở ba thẻ — bấm "Sao chép" ở ô nào cũng ra cùng một
 * câu. Bảng mất hết giá trị, và người dùng mất niềm tin vào cả hệ thống.
 *
 * Nhưng **không cần đoán**: backend đã tách sẵn từ khi sinh prompt. Xem
 * `app/services/wizard/prompt_writer.py`:
 *  - `build_messages()` bắt model trả về JSON `{"script", "prompt", "frames[{narration,
 *    prompt}]}`, mỗi prompt là **danh sách nhãn tiếng Anh, mỗi nhãn một dòng**, đúng thứ
 *    tự `subject: …` tới `duration: …`.
 *  - `normalize_prompt()` dựng lại đúng `PROMPT_FIELDS` theo thứ tự cố định và **loại mọi
 *    dòng không phải nhãn đã biết**.
 *
 * Nên `frames[].prompt` mà trang nhận về **đã là cấu trúc**, không phải văn xuôi. Bảng chỉ
 * việc đọc nó. `PROMPT_FIELDS` ở backend và `BOARD_FIELDS` ở đây là **hai tên của cùng một
 * bảy trường** — đổi tên ở một bên thì phải đổi cả bên kia, và `test_wizard_generate_prompt.py`
 * là chỗ khóa thứ tự đó.
 *
 * ---- VÌ SAO VẪN CẦN BẢNG -------------------------------------------------------
 * Người dùng thường chỉ cần **cắm một đoạn**: riêng phần máy quay để dán vào ô camera của
 * Veo, riêng phần ánh sáng để dán vào Kling. Đưa cả bài thì họ phải tự tìm, và tìm thì hay
 * xoá nhầm mất một chi tiết. Nên bước 4 là **bảng**, mỗi trường một thẻ riêng với nút Copy
 * riêng.
 *
 * ---- NGUYÊN TẮC: THỪA TRỐNG CÒN HƠN BỊA ---------------------------------------
 * Một ô không có dữ liệu thì **để trống và nói rõ là trống**. Tuyệt đối không dán nội dung
 * ô khác vào để trông đầy: ô trống thì người dùng biết mình còn thiếu gì, còn ô đầy nhưng
 * trùng nhau thì họ không còn tin bảng nào trên trang này nữa. Vì vậy **mỗi trường của mỗi
 * khung xuất hiện đúng một lần, trong đúng thẻ của nó** — không bao giờ ở hai thẻ.
 *
 * Bất biến đo được, và `wizard-board-check.mjs` kiểm lại trên DOM đang render: không
 * trường nào rơi khỏi bảng, và không giá trị nào nằm ở thẻ không phải của nó.
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
 * Một dòng nhãn trong prompt. **Sao y hệt** `_LABEL_PREFIX_RE` của
 * `prompt_writer.py` — cùng chấp nhận gạch đầu dòng `- * •`, cùng chấp nhận `**bọc đậm**`,
 * cùng nhận cả `:` và `：`.
 *
 * Phải khớp, không phải "gần giống": nếu trình duyệt nhận nhãn mà backend loại thì bảng hiện
 * một trường không tồn tại, và người dùng dán sang Veo một dòng rác.
 *
 * Nhãn thắm chọn `[a-z][a-z ]*?` **không tham lam**, nên `camera: dolly in, he says: hi`
 * ra nhãn `camera` chứ không phải `camera dolly in he says`.
 */
const LABEL_LINE_RE = /^\s*(?:[-*•]\s*)?(?:\*\*)?([a-z][a-z ]*?)(?:\*\*)?\s*[:：]\s*/i

function isBoardField(label: string): label is BoardField {
  return (BOARD_FIELDS as readonly string[]).includes(label)
}

/** Một cặp `nhãn -> giá trị` đọc được từ prompt. */
export type PromptField = { field: BoardField; value: string }

/** Kết quả đọc một prompt: các trường có nhãn, và những dòng không thuộc bảy trường. */
export type ParsedPrompt = {
  fields: PromptField[]
  /** Số dòng không đọc được thành trường nào. Đếm để báo, không đem điền vào ô nào. */
  stray: number
}

/**
 * Đọc một prompt có nhãn thành các cặp `nhãn -> giá trị`.
 *
 * Hàm thuần, và trả về `fields: []` cho prompt văn xuôi — đó là tín hiệu "không có cấu
 * trúc", và bảng phải nói thẳng chứ không tự dựng nội dung.
 */
export function parsePromptFields(prompt: string): ParsedPrompt {
  const fields: PromptField[] = []
  let stray = 0

  for (const raw of (prompt || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = LABEL_LINE_RE.exec(line)
    if (!m) {
      stray += 1
      continue
    }
    // `replace` vì `build_messages()` cho phép model viết `Depth of Field : …`.
    const label = m[1].replace(/\s+/g, ' ').trim().toLowerCase()
    const value = line.slice(m[0].length).trim()
    if (!isBoardField(label) || !value) {
      stray += 1
      continue
    }
    // Nhãn lặp trong một prompt: giữ lần đầu, y hệt `_label_values` ở backend.
    if (fields.some((f) => f.field === label)) continue
    fields.push({ field: label, value })
  }

  return { fields, stray }
}

/** Một ô của bảng: giá trị của **đúng trường đó** ở một khung. */
export type BoardSlot = {
  /** Nguyên văn giá trị sau nhãn — không gộp, không rút gọn, không diễn giải lại. */
  text: string
  /** Số thứ tự khung (1-based) mà `text` này đến từ đó. */
  frameNo: number
}

/** Một trường của bảng, đã gom theo các khung. */
export type BoardCard = {
  field: BoardField
  /** Rỗng khi prompt không nói gì về trường này — lúc đó nút Copy phải tắt. */
  slots: BoardSlot[]
}

export type ArtDirectionBoard = {
  cards: BoardCard[]
  /** Bảy thẻ, **luôn** đủ thứ tự `BOARD_FIELDS` — kể cả thẻ rỗng. */
  cardsByField: Record<BoardField, BoardCard>
  /** Số khung đọc được ít nhất một trường. */
  labelled: number
  /**
   * Số khung **không** đọc được trường nào — bản nháp cũ, hoặc prompt văn xuôi. Những khung
   * này không vào ô nào cả, và con số này được hiện ra để người dùng biết bảng thiếu gì
   * thay vì tưởng bảng đã đầy.
   */
  unlabelled: number
  /** Số dòng không thuộc bảy trường. Đo được, không giấu. */
  stray: number
}

/**
 * Dựng bảng chỉ đạo từ danh sách prompt của các khung.
 *
 * @param prompts Một prompt mỗi khung, ở **dạng có nhãn** của backend. Rỗng thì bảng vẫn có
 *   bảy thẻ, tất cả rỗng.
 */
export function buildArtDirectionBoard(prompts: readonly string[]): ArtDirectionBoard {
  const slots: Record<BoardField, BoardSlot[]> = {
    subject: [], action: [], setting: [], camera: [], lighting: [], style: [], duration: [],
  }
  let labelled = 0
  let unlabelled = 0
  let stray = 0

  prompts.forEach((prompt, index) => {
    const parsed = parsePromptFields(prompt || '')
    stray += parsed.stray
    if (parsed.fields.length === 0) {
      unlabelled += 1
      return
    }
    labelled += 1
    for (const { field, value } of parsed.fields) {
      slots[field].push({ text: value, frameNo: index + 1 })
    }
  })

  const cards = BOARD_FIELDS.map((field) => ({ field, slots: slots[field] }))
  const cardsByField = {} as Record<BoardField, BoardCard>
  for (const card of cards) cardsByField[card.field] = card

  return { cards, cardsByField, labelled, unlabelled, stray }
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