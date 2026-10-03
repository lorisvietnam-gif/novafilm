/**
 * Đo tương phản WCAG AA cho chữ đang hiện trên trang.
 *
 * Vì sao: `#64748b` nhìn rất đẹp mà đo ra **4,20:1** (hụt AA). Cảm tính không phải
 * bằng chứng. Trang đã được cài đặt xong thì nền true black mới quyết định được.
 *
 * Cách làm: lấy màu + cỡ chữ từ trang, **tính toán ở Node** — tránh nhúng biểu thức
 * toàn bộ vào trang (bẫy dấu ngoặc JSON trong mẫu câu).
 *
 * Dùng: node scripts\wcag-contrast-check.mjs --base http://127.0.0.1:5173 --route /wizard
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9555

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}

const BASE = arg('base', 'http://127.0.0.1:5173')
const ROUTES = arg('route', '/wizard').split(',')
const AA = Number(arg('threshold', '4.5'))
const AA_LARGE = Number(arg('large', '3'))

// ---- toán WCAG (chạy ở Node) ----
const chan = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]))
function ratio(fg, bg) {
  const f = fg[3] < 1 ? over(fg, bg) : fg
  const a = lum(f); const b = lum(bg.slice(0, 3))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
function parseColor(v) {
  const m = String(v || '').match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const p = m[1].split(',').map((x) => parseFloat(x.trim()))
  if (p.some((x) => Number.isNaN(x))) return null
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
}

async function wsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* chua len */ }
    await sleep(500)
  }
  throw new Error('khong ket noi duoc DevTools')
}

// Lấy danh sách chữ kèm nền hiệu dụng. Nền hiệu dụng tính ngay trên trang cho đúng,
// rồi Node chỉ làm phép so sánh.
const COLLECT = `(() => {
  const parse = (v) => {
    const m = String(v || '').match(/rgba?\\(([^)]+)\\)/)
    if (!m) return null
    const p = m[1].split(',').map((x) => parseFloat(x.trim()))
    if (p.some((x) => isNaN(x))) return null
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
  }
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none') continue
    if (parseFloat(s.opacity) === 0) continue
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    let node = el, bg = null
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor)
      if (c && c[3] > 0.05) { bg = c; break }
      node = node.parentElement
    }
    if (!bg) bg = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]
    const fg = parse(s.color)
    if (!fg) continue
    out.push({
      fg, bg,
      px: parseFloat(s.fontSize) || 0,
      bold: (parseInt(s.fontWeight, 10) || 400) >= 700,
      text: (el.textContent || '').trim().slice(0, 60),
    })
    if (out.length >= 300) break
  }
  return out
})()`

async function main() {
  const edge = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
    '--user-data-dir=' + process.env.TEMP + '\\kilo\\wcag-profile', 'about:blank',
  ], { stdio: 'ignore' })

  let code = 1
  try {
    const ws = new WebSocket(await wsUrl())
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    let id = 0
    const pend = new Map()
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
    const send = (method, params) => new Promise((res) => { const n = ++id; pend.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
    const evalIn = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)
      return r.result?.result?.value
    }

    await send('Page.enable'); await send('Runtime.enable')

    for (const route of ROUTES) {
      await send('Page.navigate', { url: BASE + route })
      await sleep(2500)
      const items = (await evalIn(COLLECT)) || []
      const fails = []
      for (const it of items) {
        const need = it.px >= 24 || (it.bold && it.px >= 18.66) ? AA_LARGE : AA
        const r = ratio(it.fg, it.bg)
        if (r < need) fails.push({ r, need, text: it.text })
      }
      fails.sort((a, b) => a.r - b.r)
      console.log(`\n${route}: ${items.length} chu · ${fails.length} khong dat AA`)
      fails.slice(0, 10).forEach((f) => console.log(`  FAIL ${f.r.toFixed(2)}:1 (can >=${f.need})  ${f.text}`))
      if (!fails.length) { console.log('  PASS tat ca'); code = 0 }
    }
    ws.close()
  } finally {
    try { process.kill(edge.pid) } catch { /* da tu dong */ }
  }
  process.exit(code)
}

main().catch((e) => { console.error('LOI:', e.message); process.exit(2) })
