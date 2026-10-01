/**
 * Đo tương phản của chữ ĐANG NẰM TRÊN ẢNH, bằng pixel thật.
 *
 *   node scripts/contrast-on-media.mjs [out.json]
 *
 * ---- VÌ SAO KHÔNG DÙNG computed style CHO VIỆC NÀY -----------------------------
 * `contrast-audit.mjs` dựng nền bằng cách leo cây phân tầng. Với một gradient
 * phủ lên ảnh thì không có màu nền nào để dựng, nên nó dừng ở nền trang và báo
 * "chữ trắng trên #f7f8fa = 1.06:1" — con số sai hoàn toàn, vì chữ đó nằm trên
 * một bức ảnh tối. Script này không suy đoán: nó chụp pixel.
 *
 * ---- CÁCH ĐO ---------------------------------------------------------------------
 *   1. chụp vùng phần tử với mau chu binh thuong
 *   2. gan `color: transparent !important`, chup lai cung vung   -> nen that
 *   3. lay p05 (te nhat) va p50 (dien hinh) cua do sang nen
 *   4. hop mau chu nua trong suot len nen truoc khi tinh ti le, dung nhu WCAG
 *
 * Buoc 2 la diem mau chot: an chu di thi moi pixel con lai dung la nen.
 * `onArt` cua script kia doi voi p05..p95: mot khoi chu duoc doc tren ca vung
 * no nam, khong phai tren mot diem sang loa don le, nen phet hanh bang p50; p05
 * van duoc in ra de thay truong hop xau nhat.
 *
 * Can backend song (`:8000`) va mot ban build da preview.
 */
import { writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require_ = createRequire(join(process.cwd(), 'package.json'))
const pngjs = require_('pngjs')
const PNG = pngjs.PNG || pngjs

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9100 + (process.pid % 50)
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:4173'
const API = process.env.AUDIT_API || 'http://127.0.0.1:8000'
const OUT = process.argv[2] || join(tmpdir(), 'novafilm-contrast-on-media.json')
const WIDTH = Number(process.env.AUDIT_WIDTH || 1280)
const HEIGHT = Number(process.env.AUDIT_HEIGHT || 900)
const PROFILE = join(tmpdir(), `novafilm-onmedia-edge-${process.pid}`)
const EDGE_PATH = process.env.EDGE_PATH || EDGE

/**
 * Chi nhung cap ma mau chu KHONG lay duoc tu nen bang CSS — tuc la nam tren mot
 * gradient/anh. Danh sach nay la bang cong viec chup va tim, khong phai doan.
 */
const TARGETS = [
  ['/', '.pf-land-kicker', 'kicker hero'],
  ['/', '.pf-land-hero h1', 'tieu de hero'],
  ['/', '.pf-land-lede', 'lede hero'],
  ['/', '.pf-land-close h2', 'tieu de CTA cuoi'],
  ['/', '.pf-land-close p', 'do phu CTA cuoi'],
  ['/', '.pf-land-close .pf-btn-ghost', 'nut ghost tren anh'],
  ['/method', '.pf-method-hero .pf-method-kicker', 'kicker method'],
  ['/method', '.pf-method-hero h1', 'tieu de method'],
  ['/method', '.pf-method-hero .pf-method-lede', 'lede method'],
  ['/method', '.pf-method-hero .pf-method-lede em', 'em method'],
  ['/pricing', '.pf-pricing-hero-copy h1', 'tieu de pricing'],
  ['/pricing', '.pf-pricing-hero-copy p', 'phu de pricing'],
  ['/pricing', '.pf-pricing-hero-copy li', 'chip pricing'],
  ['/help', '.pf-help-page-hero p', 'phu de help'],
  ['/contact', '.pf-legal-hero p', 'phu de lien he'],
  ['/terms', '.pf-legal-hero p', 'phu de dieu khoan'],
  ['/auth', '.auth-panel h1', 'tieu de dang nhap'],
  ['/drama', '.pf-drama-card-cover-fallback', 'ten duan tren anh'],
  ['/drama', '.pf-drama-card-cover-badge', 'chip tren anh du an'],
]

let EDGE_PID = null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cleanup() {
  for (let i = 0; i < 5; i++) {
    try { execFileSync('taskkill', ['/PID', String(EDGE_PID), '/T', '/F'], { stdio: 'ignore' }) } catch { }
    const until = Date.now() + 300
    while (Date.now() < until) { }
  }
  try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 }) } catch { }
}
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('uncaughtException', (err) => { console.error('LOI:', err.message); cleanup(); process.exit(1) })

const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (l1, l2) => { const hi = Math.max(l1, l2); const lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05) }

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
  console.log(`AUDIT_BASE=${BASE}  ${WIDTH}x${HEIGHT}`)
  const rows = []

  for (const theme of ['light', 'dark']) {
    for (const [route, selector, label] of TARGETS) {
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

      await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 700 })
      await send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
      await send('Page.enable')
      await send('Page.navigate', { url: `${BASE}/` })
      await sleep(1500)
      await send('Runtime.evaluate', { expression: `localStorage.setItem('novafilm.locale','vi');localStorage.setItem('token',${JSON.stringify(token)})` })
      await send('Page.navigate', { url: BASE + route })
      await sleep(2100)
      await send('Page.reload', { ignoreCache: false })
      await sleep(2500)
      for (let i = 0; i < 12; i++) {
        const len = await send('Runtime.evaluate', { expression: '(document.body.innerText||"").trim().length', returnByValue: true })
        if ((len?.result?.value || 0) > 40) break
        await sleep(600)
      }

      const info = JSON.parse((await send('Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return JSON.stringify({ missing: true })
          el.scrollIntoView({ block: 'center' })
          const cs = getComputedStyle(el)
          const fs = parseFloat(cs.fontSize)
          return JSON.stringify({
            color: cs.color, fs,
            need: (fs >= 24 || (parseInt(cs.fontWeight, 10) >= 700 && fs >= 18.66)) ? 3 : 4.5,
          })
        })()`,
        returnByValue: true,
      }))?.result?.value || '{}')

      if (info.missing) {
        console.log(`${theme.padEnd(5)} ${route.padEnd(10)} ${label.padEnd(22)} KHONG TON TAI`)
        ws.close()
        continue
      }
      await sleep(450)

      const geo = JSON.parse((await send('Runtime.evaluate', {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), w: Math.round(r.width), h: Math.round(r.height) }) })()`,
        returnByValue: true,
      }))?.result?.value || '{}')

      const boxH = Math.min(geo.h, 110)
      if (!geo.w || !geo.h || geo.y + boxH > HEIGHT - 10) {
        console.log(`${theme.padEnd(5)} ${route.padEnd(10)} ${label.padEnd(22)} ngoai khung nhien`)
        ws.close()
        continue
      }
      const clip = { x: geo.x, y: geo.y, width: Math.min(geo.w, 420), height: boxH, scale: 1 }

      const withText = await send('Page.captureScreenshot', { format: 'png', clip })
      await send('Runtime.evaluate', {
        expression: `(() => {
          const s = document.createElement('style')
          s.textContent = ${JSON.stringify(`${selector} { color: transparent !important; text-shadow: none !important; }`)}
          document.head.appendChild(s)
          return 1
        })()`,
      })
      await sleep(280)
      const withoutText = await send('Page.captureScreenshot', { format: 'png', clip })

      const shown = PNG.sync.read(Buffer.from(withText.data, 'base64')).data
      const bare = PNG.sync.read(Buffer.from(withoutText.data, 'base64'))
      const pixels = bare.data
      const count = pixels.length / 4
      const sorted = new Float64Array(count)
      for (let i = 0; i < pixels.length; i += 4) sorted[i >> 2] = lum(pixels[i], pixels[i + 1], pixels[i + 2])
      const sortedArr = Array.from(sorted).sort((a, b) => a - b)
      const pick = (q) => sortedArr[Math.min(count - 1, Math.max(0, Math.floor(q * count)))]
      const p05 = pick(0.05)
      const p50 = pick(0.5)
      const p95 = pick(0.95)

      // Ba phan ba pho thay doi gi khi an chu => vung chup co that su co chu.
      let moved = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(shown[i] - pixels[i]) + Math.abs(shown[i + 1] - pixels[i + 1]) + Math.abs(shown[i + 2] - pixels[i + 2]) > 24) moved++
      }
      const ink = moved / count

      const fg = (() => { const m = info.color.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 } })()
      // Mau nua trong suot: uoc luong do sang cua mau do da pha loe. Du cho
      // vong mau don, va du chinh xac hon la "chua hop gi ca".
      const glyph = fg && fg.a < 1 ? lum(fg.rgb[0] * fg.a, fg.rgb[1] * fg.a, fg.rgb[2] * fg.a) : lum(...fg.rgb)

      const measured = ink >= 0.02
      const row = {
        theme, route, selector, label, color: info.color, fontSize: info.fs, need: info.need,
        bgP05: +p05.toFixed(4), bgP50: +p50.toFixed(4), bgP95: +p95.toFixed(4),
        inkPercent: +(ink * 100).toFixed(1),
        typical: +ratio(glyph, p50).toFixed(2),
        worst: +Math.min(ratio(glyph, p05), ratio(glyph, p95)).toFixed(2),
        measured, pass: ratio(glyph, p50) >= info.need,
      }
      rows.push(row)
      const verdict = !measured ? '  (vung chup khong co chu — bo qua)' : row.pass ? 'OK' : '<<< KHONG DAT'
      console.log(
        `${theme.padEnd(5)} ${route.padEnd(10)} ${label.padEnd(22)} ${info.color.padEnd(22)}` +
        ` nen ${p05.toFixed(3)}/${p50.toFixed(3)}/${p95.toFixed(3)}  chu ${(ink * 100).toFixed(1).padStart(5)}%` +
        `  tieu ${String(row.typical).padStart(6)}  xau ${String(row.worst).padStart(6)}  / can ${info.need}${verdict}`,
      )
      ws.close()
      await sleep(120)
    }
  }

  writeFileSync(OUT, JSON.stringify(rows, null, 2))
  const scored = rows.filter((r) => r.measured)
  const fails = scored.filter((r) => !r.pass)
  console.log(`\nTong ${scored.length} cap do duoc tren anh · ${fails.length} khong dat AA`)
  for (const f of fails) console.log(`   ${f.theme} ${f.route} ${f.label}  ${f.typical} / can ${f.need}  nen p05=${f.bgP05} p50=${f.bgP50}`)
  console.log(`ghi ra: ${OUT}`)
  cleanup()
}

main().catch((err) => { console.error('LOI:', err.message); cleanup(); process.exit(1) })