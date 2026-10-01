/**
 * Chép văn bản vào clipboard, có đường dự phòng và **báo lại trung thực** kết quả.
 *
 * VÌ SAO CẦN DỰ PHÒNG — `navigator.clipboard` không phải lúc nào cũng dùng được:
 *
 * - Trang mở bằng `http://` (không phải `https://`) thì `navigator.clipboard` có
 *   mặt nhưng `writeText()` luôn ném `NotAllowedError`. Đây đúng là tình huống
 *   của localhost khi dùng `http://<lan-ip>:5173`.
 * - Safari chỉ cấp quyền clipboard sau cú bấm trực tiếp của người dùng, và
 *   Firefox chặn trong một số iframe.
 *
 * Vì vậy `copyText` không bao giờ im lặng: nó trả về đúng tình trạng để giao diện
 * nói với người dùng là đã chép, chép bằng lối dự phòng, hay **thất bại hẳn** — và
 * trong trường hợp cuối thì người dùng còn phải tự bấm Ctrl+C.
 */

/**
 * - `copied` — qua `navigator.clipboard`.
 * - `copiedFallback` — qua `textarea` ẩn + `document.execCommand('copy')`.
 * - `failed` — cả hai đều không được; nội dung vẫn được trả lại cho người dùng tự chép.
 */
export type CopyOutcome = 'copied' | 'copiedFallback' | 'failed'

/** Thử API hiện đại. Trả về false nếu không dùng được, để chuyển sang lối dự phòng. */
async function tryModernClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined') return false
  const clipboard = navigator.clipboard
  if (!clipboard || typeof clipboard.writeText !== 'function') return false
  // Ngoài ngữ cảnh an toàn thì `writeText` chắc chắn ném; chặn sớm để lỗi không
  // đi qua đường bất đồng bộ và làm chậm lần chép.
  if (typeof window !== 'undefined' && window.isSecureContext === false) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Lối dự phòng: một `<textarea>` ẩn được chọn toàn bộ rồi `execCommand('copy')`.
 *
 * Vài điều phải đúng thì mới chạy được trên Safari/iOS:
 * - phần tử phải nằm trong viewport và **không** cuộn theo, nếu không Safari từ chối
 *   chọn vùng văn bản ngoài màn hình;
 * - phải bỏ `opacity: 0` — Safari coi phần tử vô hình là không thể tương tác;
 * - sau khi chép phải trả tiêu điểm về nút đã bấm, không thì người dùng bàn phím mất
 *   vị trí con trỏ.
 */
function tryExecCommandCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.setAttribute('tabindex', '-1')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.width = '1px'
  area.style.height = '1px'
  area.style.padding = '0'
  area.style.border = 'none'
  area.style.outline = 'none'
  area.style.boxShadow = 'none'
  area.style.background = 'transparent'
  area.style.color = 'transparent'
  document.body.appendChild(area)
  const previous = document.activeElement
  try {
    area.focus()
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
    if (previous instanceof HTMLElement && typeof previous.focus === 'function') {
      previous.focus()
    }
  }
}

/** Chép `text`, báo đúng đường đã đi. Không bao giờ ném ra ngoài. */
export async function copyText(text: string): Promise<CopyOutcome> {
  const value = text ?? ''
  if (!value) return 'failed'
  if (await tryModernClipboard(value)) return 'copied'
  return tryExecCommandCopy(value) ? 'copiedFallback' : 'failed'
}