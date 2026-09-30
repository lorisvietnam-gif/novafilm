/**
 * Audit thị giác NOVAFILM — chụp màn hình thật + quét tiếng Trung còn sót.
 *
 * Không cài gì thêm: dùng Microsoft Edge có sẵn ở chế độ headless, điều khiển qua
 * Chrome DevTools Protocol bằng WebSocket của Node 24.
 *
 * Chạy:  node audit.mjs
 * Xem:   C:\Users\NOVAST~1\AppData\Local\Temp\kilo\audit\<locale>\<route>.png
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9333
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:8000'
const OUT = 'C:\\Users\\NOVAST~1\\AppData\\Local\\Temp\\kilo\\audit'
const PROFILE = 'C:\\Users\\NOVAST~1\\AppData\\Local\\Temp\\kilo\\edge-profile'

const CJK = /[\u4e00-\u9fff]/
const RAW_KEY = /\b(common|home|nav|auth|tools|pricing|help|legal|shell|drama|studio)\.[a-zA-Z][a-zA-Z0-9]*/g

/** Route cần kiểm. `:id` sẽ thay bằng giá trị thật bên dưới. */
const ROUTES = [
  ['/', 'trang-chu'],
  ['/method', 'phuong-phap'],
  ['/auth', 'dang-nhap'],
  ['/templates', 'mau'],
  ['/tools', 'cong-cu'],
  ['/tools/text-to-image', 'cong-cu-text-to-image'],
  ['/assets', 'tai-nguyen'],
  ['/help', 'tro-giup'],
  ['/terms', 'dieu-khoan'],
  ['/privacy', 'quyen-rieng-tu'],
  ['/contact', 'lien-he'],
  ['/settings', 'tai-khoan'],
  ['/pricing', 'bang-gia'],
  ['/history', 'lich-su'],
  ['/studio', 'studio'],
  ['/studio/new', 'studio-tao-moi'],
  ['/studio/1/style', 'studio-phong-cach'],
  ['/studio/1', 'studio-storyboard'],
  ['/studio/1/editor', 'studio-trinh-soan'],
  ['/drama', 'drama-danh-sach'],
  ['/drama/assets', 'drama-tai-nguyen'],
  ['/drama/projects/2', 'drama-du-an'],
  ['/drama/projects/2/episodes', 'drama-tap'],
  ['/drama/projects/2/episodes/1', 'drama-tap-chi-tiet'],
  ['/drama/projects/2/canvas', 'drama-canvas'],
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, init) {
  const res = await fetch(`${API}${path}`, init)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

/** Lấy token để vào được các trang cần đăng nhập. */
async function getToken() {
  const email = 'board-audit@novafilm.probe'
  const password = 'Audit-2026-x'
  const body = JSON.stringify({ email, password, nickname: 'audit' })
  const headers = { 'Content-Type': 'application/json' }
  try {
    const r = await api('/api/auth/register', { method: 'POST', headers, body })
    return r.access_token
  } catch {
    const r = await api('/api/auth/login', { method: 'POST', headers, body })
    return r.access_token
  }
}

async function main() {
  const token = await getToken()
  console.log('da lay token')

  const { spawn } = await import('node:child_process')
  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    'about:blank',
  ], { stdio: 'ignore' })

  let version = null
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
      break
    } catch { /* chua len */ }
  }
  if (!version) throw new Error('Edge headless khong len duoc')
  console.log('Edge da len')

  const results = []
  for (const locale of ['vi', 'en']) {
    const dir = join(OUT, locale)
    mkdirSync(dir, { recursive: true })

    for (const [route, name] of ROUTES) {
      const tab = await (
        await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/')}`, {
          method: 'PUT',
        })
      ).json()

      const ws = new WebSocket(tab.webSocketDebuggerUrl)
      let id = 0
      const pending = new Map()
      const consoleErrors = []

      await new Promise((res, rej) => {
        ws.onopen = res
        ws.onerror = rej
      })

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg.result)
          pending.delete(msg.id)
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          const d = msg.params?.exceptionDetails
          consoleErrors.push(d?.exception?.description || d?.text || 'exception')
        }
      }

      const send = (method, params = {}) =>
        new Promise((res) => {
          const n = ++id
          pending.set(n, res)
          ws.send(JSON.stringify({ id: n, method, params }))
        })

      // Chặt locale + token rồi tải lại trang để ứng dụng đọc đúng giá trị.
      await send('Runtime.evaluate', {
        expression: `localStorage.setItem('novafilm.locale', ${JSON.stringify(locale)});
                     localStorage.setItem('token', ${JSON.stringify(token)});`,
      })
      await send('Page.enable')
      await send('Page.navigate', { url: BASE + route })
      await sleep(2600)
      await send('Page.reload', { ignoreCache: false })
      await sleep(2600)

      const textRes = await send('Runtime.evaluate', {
        expression: 'document.body ? document.body.innerText : ""',
        returnByValue: true,
      })
      const text = textRes?.result?.value || ''

      const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
      const rawKeys = [...new Set(text.match(RAW_KEY) || [])]
      const visible = text.trim().length

      const shot = await send('Page.captureScreenshot', { format: 'png' })
      if (shot?.data) {
        writeFileSync(join(dir, `${name}.png`), Buffer.from(shot.data, 'base64'))
      }

      results.push({ locale, route, cjk, rawKeys, visible, errors: consoleErrors.length })

      console.log(
        `${locale}  ${route.padEnd(34)} cjk=${String(cjk).padStart(4)}` +
          (rawKeys.length ? `  KEY_LEAK=${rawKeys.join(',')}` : '') +
          (consoleErrors.length ? `  JS_ERROR=${consoleErrors.length}` : '') +
          (visible < 40 ? '  <-- TRANG RONG' : ''),
      )

      ws.close()
      await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`)
    }
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2))

  console.log('\n===== TONG HOP =====')
  for (const locale of ['vi', 'en']) {
    const rows = results.filter((r) => r.locale === locale)
    const bad = rows.filter((r) => r.cjk > 0 || r.rawKeys.length || r.errors || r.visible < 40)
    const total = rows.reduce((a, r) => a + r.cjk, 0)
    console.log(`${locale}: ${rows.length} route · ${total} ky tu Trung · ${bad.length} route van van`)
    for (const r of bad) {
      console.log(
        `   ${r.route.padEnd(34)} cjk=${r.cjk}` +
          (r.rawKeys.length ? ` keyLeak=${r.rawKeys.length}` : '') +
          (r.errors ? ` jsError=${r.errors}` : '') +
          (r.visible < 40 ? ' RONG' : ''),
      )
    }
  }

  edge.kill()
}

main().catch((e) => {
  console.error('LOI:', e.message)
  process.exit(1)
})
