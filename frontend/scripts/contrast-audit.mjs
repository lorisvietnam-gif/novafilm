/**
 * Đo tương phản WCAG AA của mọi chữ đang render, theo computed style.
 *
 *   node scripts/contrast-audit.mjs [out.json]
 *
 * Cần backend sống (`:8000`) và một bản build đã preview. Không sửa token.
 *
 * ---- VÌ SAO CẦN SCRIPT NÀY, VÌ SAO TOKEN KHÔNG ĐỦ -----------------------------
 * Đọc `tokens.css` cho biết token nào là màu nào, nhưng không biết chữ nào thực
 * sự nằm trên token đó. Một nút có thể kế thừa `color` từ xa, và `background`
 * của nó có thể là một gradient chứ không phải một màu. Script này duyệt DOM
 * đang render, dựng lại nền hiệu dụng bằng cách leo cây phân tầng (gộp các nền
 * không trong suốt, dừng ở nền đục), rồi tính tỉ lệ.
 *
 * ---- GIỚI HẠN ĐÃ BIẾT, NÓI THẲNG RA --------------------------------------------
 * * Không nhìn xuyên qua `background-image`. Nếu chữ nằm trên gradient phủ lên
 *   ảnh, script không có nền để dựng và sẽ dừng ở nền trang -> báo sai.
 *   Những cặp đó được đánh dấu `onArt: true` và phải đo bằng
 *   `contrast-on-media.mjs`, thao tác trên pixel thật.
 * * Không dựng được chữ nửa trong suốt trên nền ảnh. Cùng lý do trên.
 * * `color: transparent` dùng cho placeholder ảnh sẽ ra tỉ lệ 1:1. Đó là kỹ
 *   thuật "chữ ẩn", không phải chữ đọc được, và script không tự phân biệt.
 *
 * Dùng cùng script này trước và sau một thay đổi để so số.
 */
import { writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9400 + (process.pid % 100)
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:4173'
const API = process.env.AUDIT_API || 'http://127.0.0.1:8000'
const OUT = process.argv[2] || join(tmpdir(), 'novafilm-contrast.json')
const WIDTH = Number(process.env.AUDIT_WIDTH || 1280)
const PROFILE = join(tmpdir(), `novafilm-contrast-edge-${process.pid}`)
const EDGE_PATH = process.env.EDGE_PATH || EDGE

const ROUTES = [
  '/', '/method', '/tools', '/templates', '/assets', '/help', '/pricing',
  '/history', '/settings', '/drama', '/contact', '/auth',
  '/studio/new', '/studio/40', '/studio/40/style', '/drama/projects/4/episodes',
]

let EDGE_PID = null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Edge sinh tiến trình con sống dai hơn một lần `taskkill`, và profile bị giữ lại
 * là ~450MB trên dia D:. Phai giai thuc lai nhieu lan roi moi xoa.
 */
function cleanup() {
  for (let i = 0; i < 5; i++) {
    try { execFileSync('taskkill', ['/PID', String(EDGE_PID), '/T', '/F'], { stdio: 'ignore' }) } catch { }
    const until = Date.now() + 300
    while (Date.now() < until) { /* doi Edge nhan tin tuc */ }
  }
  try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 }) } catch { }
}
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('uncaughtException', (err) => { console.error('LOI:', err.message); cleanup(); process.exit(1) })

// Toan bo phep tinh do sang chay TRONG TRANG (xem `MEASURE` ben duoi) vi no
// can `getComputedStyle` cua chinh DOM do. Node side khong can goi cai do, nen
// khong giu mot ban sao: mot ban sao se kiem tinh mot thu khong ai chay va
// se tro thanh nguon so lieu gia.

const MEASURE = `(() => {
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
  const ratio = (a, b) => {
    const hi = Math.max(lum(a), lum(b))
    const lo = Math.min(lum(a), lum(b))
    return (hi + 0.05) / (lo + 0.05)
  }
  const parse = (value) => {
    const m = value.match(/rgba?\\(([^)]+)\\)/)
    if (!m) return null
    const p = m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number)
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 }
  }
  const over = (fg, bg, a) => [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a))
  const backdrop = (el) => {
    let node = el
    const stack = []
    let onArt = false
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') onArt = true
      const c = parse(cs.backgroundColor)
      if (c && c.a > 0) { stack.push(c); if (c.a >= 0.999) break }
      node = node.parentElement
    }
    if (!stack.length) stack.push({ rgb: [255, 255, 255], a: 1 })
    let base = stack[stack.length - 1].rgb
    for (let i = stack.length - 2; i >= 0; i--) base = over(stack[i].rgb, base, stack[i].a)
    return { rgb: base, onArt }
  }
  const rows = []
  const seen = new Set()
  for (const el of document.querySelectorAll('#root *')) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim())
      .join(' ')
    if (!own) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue
    if (el.closest('.sr-only, .pf-sr-only, [aria-hidden="true"]')) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const fg = parse(cs.color)
    if (!fg) continue
    const bd = backdrop(el)
    const flat = fg.a < 1 ? over(fg.rgb, bd.rgb, fg.a) : fg.rgb
    const px = parseFloat(cs.fontSize)
    const bold = parseInt(cs.fontWeight, 10) >= 700
    const large = px >= 24 || (bold && px >= 18.66)
    const need = large ? 3 : 4.5
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).slice(0, 2).join('.')
    const key = cls + '|' + cs.color + '|' + cs.fontSize + '|' + bd.rgb.join(',') + '|' + bd.onArt
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      route: location.pathname,
      el: el.tagName.toLowerCase() + (cls ? '.' + cls : ''),
      text: own.slice(0, 34),
      color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      bg: 'rgb(' + bd.rgb.map(Math.round).join(', ') + ')', onArt: bd.onArt,
      need, pass: ratio(flat, bd.rgb) >= need,
      ratio: Math.round(ratio(flat, bd.rgb) * 100) / 100,
    })
  }
  return rows
})()`

async function api(path, init) {
  const res = await fetch(`${API}${path}`, init)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function credentials() {
  const headers = { 'Content-Type': 'application/json' }
  const body = JSON.stringify({ email: 'board-audit@novafilm.probe', password: 'Audit-2026-x', nickname: 'audit' })
  try { return (await api('/api/auth/register', { method: 'POST', headers, body })).access_token }
  catch { return (await api('/api/auth/login', { method: 'POST', headers, body })).access_token }
}

async function launch() {
  try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 }) } catch { }
  const { spawn } = await import('node:child_process')
  const edge = spawn(EDGE_PATH, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-first-run', 'about:blank',
  ], { stdio: 'ignore' })
  EDGE_PID = edge.pid
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json() } catch { }
  }
  throw new Error(`Khong bat duoc Edge headless. Kiem tra EDGE_PATH (${EDGE_PATH}).`)
}

async function main() {
  const token = await credentials()
  await launch()
  console.log(`AUDIT_BASE=${BASE}  width=${WIDTH}`)
  console.log(`Route nao khong ton tai trong data se ra 0 cap — do la thieu du lieu, khong phai loi mau.`)

  const all = []
  for (const theme of ['light', 'dark']) {
    for (const route of ROUTES) {
      const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/')}`, { method: 'PUT' })).json()
      const ws = new WebSocket(tab.webSocketDebuggerUrl)
      let id = 0
      const pending = new Map()
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id) }
      }
      const send = (method, params = {}) => new Promise((resolve) => {
        const n = ++id
        pending.set(n, resolve)
        ws.send(JSON.stringify({ id: n, method, params }))
      })

      await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: WIDTH < 700 })
      await send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: theme }] })
      await send('Page.enable')
      await send('Page.navigate', { url: `${BASE}/` })
      await sleep(1500)
      await send('Runtime.evaluate', { expression: `localStorage.setItem('novafilm.locale','vi');localStorage.setItem('token',${JSON.stringify(token)})` })
      await send('Page.navigate', { url: BASE + route })
      await sleep(2200)
      await send('Page.reload', { ignoreCache: false })
      await sleep(2500)
      // Trang render sau khi fetch xong. chup o day se ra anh trang.
      for (let i = 0; i < 12; i++) {
        const len = await send('Runtime.evaluate', { expression: '(document.body.innerText||"").trim().length', returnByValue: true })
        if ((len?.result?.value || 0) > 40) break
        await sleep(600)
      }

      const measured = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })
      // `Runtime.evaluate` tra ve `exceptionDetails` khi bieu thuc nem loi, va
      // `result.value` khi do la `undefined`. Bo qua ca hai se bien mot loi
      // script thanh mot dong "0 cap, 0 khong dat" — doc nhu moi thu dat AA,
      // trong khi thuc te khong do gi ca. Phai noi loi ra.
      if (measured?.exceptionDetails || !Array.isArray(measured?.result?.value)) {
        const why = measured?.exceptionDetails?.exception?.description || measured?.exceptionDetails?.text || 'khong co ket qua'
        throw new Error(`${theme} ${route}: bieu thuc do that bai — ${String(why).split('\n')[0]}`)
      }
      const rows = measured.result.value
      for (const row of rows) all.push({ theme, ...row })
      const fails = rows.filter((r) => !r.pass)
      console.log(
        `${theme.padEnd(5)} ${route.padEnd(32)} ${String(rows.length).padStart(3)} cap  ·  ` +
        `${fails.length} khong dat (${fails.filter((f) => f.onArt).length} tren nen anh)`,
      )
      for (const f of fails) {
        console.log(`       ${f.ratio} < ${f.need}  ${f.el}  "${f.text}"  ${f.color} tren ${f.bg}${f.onArt ? '  [nen anh — do bang contrast-on-media.mjs]' : ''}`)
      }
      ws.close()
      await sleep(150)
    }
  }

  writeFileSync(OUT, JSON.stringify(all, null, 2))
  const onSurface = all.filter((r) => !r.onArt)
  const fails = onSurface.filter((r) => !r.pass)
  const onArt = all.filter((r) => r.onArt && !r.pass)
  console.log(`\nTong ${all.length} cap`)
  console.log(`  tren nen phang : ${onSurface.length} cap, ${fails.length} khong dat AA`)
  console.log(`  tren nen anh    : ${onArt.length} cap, phai do bang pixel thật`)
  console.log(`  ghi ra: ${OUT}`)
  if (fails.length) {
    const byPair = {}
    for (const f of fails) {
      const key = `${f.color} tren ${f.bg}`
      byPair[key] = byPair[key] || { n: 0, min: 99, need: f.need, els: new Set() }
      byPair[key].n++
      byPair[key].min = Math.min(byPair[key].min, f.ratio)
      byPair[key].els.add(f.el)
    }
    for (const [key, v] of Object.entries(byPair).sort((a, b) => a[1].min - b[1].min)) {
      console.log(`  ${String(v.min).padStart(6)} / can ${v.need}  x${v.n}  ${key}  ${[...v.els].slice(0, 4).join(', ')}`)
    }
  }
  cleanup()
}

main().catch((err) => { console.error('LOI:', err.message); cleanup(); process.exit(1) })