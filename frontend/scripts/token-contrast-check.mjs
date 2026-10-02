/**
 * Đo tỉ lệ tương phản giữa các **token màu** trong `styles/tokens.css`.
 *
 *   node scripts\token-contrast-check.mjs
 *
 * ---- VÌ SAO CẦN, KHI ĐÃ CÓ `contrast-audit.mjs` -------------------------------
 * `contrast-audit.mjs` đo chữ **đang render** — nó đúng, nhưng nó chỉ thấy những cặp đã
 * xuất hiện trên trang. Ở đây cần câu hỏi ngược lại: "cặp màu này **nếu** dùng thì có
 * đạt không", trước khi dùng. Champagne `#f2c94c` là ví dụ — đặt làm màu chữ trên nền sáng
 * thì hỏng ở mức rõ ràng, nhưng chỉ biết sau khi đã dùng và đo lại.
 *
 * Cùng công thức WCAG 2.x với phép đo trong trang của `contrast-audit.mjs` và
 * `wizard-contrast-check.mjs`, nên ba con số này so được với nhau.
 *
 * ---- SỐ ĐO ĐÃ GIỮ NGUYÊN TỪNG LẦN ----------------------------------------------
 * `tokens.css` ghi `#f2c94c` trên `#ffffff` là **1,60:1**. Script này in ra **1,59:1**.
 * Chênh lệch đó là do làm tròn ở tầng khác nhau, không phải hai người tính khác nhau. Số
 * của script là số máy tính, nên báo cáo dùng số của script.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const OUT = resolve(HERE, '..', '.kilo', 'token-contrast')

const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => {
  const hi = Math.max(lum(a), lum(b))
  const lo = Math.min(lum(a), lum(b))
  return (hi + 0.05) / (lo + 0.05)
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const R = (a, b) => Math.round(ratio(hex(a), hex(b)) * 100) / 100

/** Cặp cần biết trước khi dùng, kèm lý do để người đọc không phải đoán. */
const PAIRS = [
  ['#f2c94c', '#ffffff', 'champagne tren nen trang — nen tao nen day la mau CHU'],
  ['#f2c94c', '#f7f8fa', 'champagne tren --pf-bg sang'],
  ['#f2c94c', '#fef6dc', 'champagne tren the chat sang (accent-100) — mau chu se hong'],
  ['#f2c94c', '#0e0e11', 'champagne tren nen toi'],
  ['#f2c94c', '#363229', 'champagne tren the chat toi (accent-100)'],
  ['#1c1c1a', '#fef6dc', 'ink tren the chat sang'],
  ['#1c1c1a', '#363229', 'ink sang tren the chat toi — thieu, mau chu phai doi theo theme'],
  ['#f5f5f7', '#363229', 'ink sang tren the chat toi'],
  ['#55565c', '#fef6dc', 'ink-secondary tren the chat sang'],
  ['#a9aab2', '#363229', 'ink-secondary toi tren the chat toi'],
  ['#6a5116', '#fef6dc', 'accent-800 tren the chat sang'],
  ['#6a5116', '#363229', 'accent-800 tren the chat toi — thieu, khong dung lam mau chu o toi'],
  ['#f8dc87', '#363229', 'accent-300 tren the chat toi'],
]

const rows = PAIRS.map(([a, b, label]) => {
  const r = R(a, b)
  return {
    a, b, label, ratio: r,
    aa: r >= 4.5 ? 'du AA chu thuong' : r >= 3 ? 'chi AA chu lon' : 'KHONG dat AA',
  }
})

for (const row of rows) {
  console.log(
    `${row.a} tren ${row.b}  ${String(row.ratio).padStart(6)}:1  ${row.aa.padEnd(20)}  ${row.label}`,
  )
}

writeFileSync(OUT + '.json', JSON.stringify({ generatedBy: 'token-contrast-check.mjs', rows }, null, 2))
console.log(`\nghi ra: ${OUT}.json`)