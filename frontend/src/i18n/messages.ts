import type { Locale } from './detect'
import { en } from './locales/en'
import { vi } from './locales/vi'
import { zh } from './locales/zh'

/**
 * Hợp đồng văn bản toàn site.
 *
 * `zh` khai báo bằng `as const`, nên chính tên khoá và cấu trúc của `zh` là chuẩn.
 * `Widen` chỉ nới kiểu literal thành `string` để các ngôn ngữ khác gán được; nó
 * không thêm và cũng không bỏ khoá nào, và không có cast nào.
 *
 * Kiểm soát bất đối xứng — cần biết trước khi tin báo cáo "0 sai lệch":
 *
 * - THIẾU khoá => lỗi compile. Đây là lỗi thật lúc chạy: `t()` (context.tsx) trả
 *   về chính đường dẫn khoá khi tra không trúng, nên UI hiện ra chuỗi khoá thay
 *   vì văn bản.
 * - THỪA khoá => mặc định KHÔNG bị bắt. Một pack được import như một *biến*, không
 *   phải object literal, nên TypeScript không chạy excess-property check và khoá
 *   thừa lọt qua im lặng. (Trước đây `vi` có `nav.langVi` trong khi `zh` không có,
 *   và build vẫn xanh.) Vì vậy khoá thừa phải được rà soát thủ công — ví dụ bằng
 *   script parity đối chiếu với `zh` — chứ không thể tin vào trình biên dịch.
 *
 * `NoExtraKey` dưới đây thu hẹp lỗ hổng đó một nấc: nó làm pack có khoá thừa ở
 * cấp NGOÀI CÙNG hỏng compile. Khoá thừa lồng sâu bên trong vẫn nằm ngoài tầm
 * với của kiểm tra này và vẫn cần script parity.
 */
type Widen<T> = T extends string
  ? string
  : { readonly [K in keyof T]: Widen<T[K]> }

export type Messages = Widen<typeof zh>

/**
 * Cấu trúc của pack đã bị siết: mọi khoá có trong pack mà không có trong `Messages`
 * đều bị khai báo là `never`, nên pack không còn gán được nếu thừa khoá ở cấp ngoài.
 * Không dùng cast — lỗi vẫn hiện ra như một lỗi gán kiểu thật.
 */
type NoExtraKey<Pack extends object> = Pack &
  Record<Exclude<keyof Pack, keyof Messages>, never>

const zhExact: NoExtraKey<typeof zh> = zh
const enExact: NoExtraKey<typeof en> = en
const viExact: NoExtraKey<typeof vi> = vi

export const messages: Record<Locale, Messages> = {
  zh: zhExact,
  en: enExact,
  vi: viExact,
}
