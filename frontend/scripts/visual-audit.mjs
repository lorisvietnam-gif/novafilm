/**
 * Audit thị giác NOVAFILM — chụp màn hình thật + quét tiếng Trung còn sót.
 *
 * Không cài gì thêm: dùng Microsoft Edge có sẵn ở chế độ headless, điều khiển qua
 * Chrome DevTools Protocol bằng WebSocket của Node 24.
 *
 * Chạy:  node scripts\visual-audit.mjs     (từ thư mục `frontend`)
 * Xem:   frontend\.kilo\audit\<locale>\<route>.png
 *
 * Ảnh nằm trong workspace và trong `.gitignore` — lane đọc được, commit không bị bẩn.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9333
/**
 * `AUDIT_BASE` / `AUDIT_API` để một lane trỏ audit vào **dev server của chính nó**.
 * Không có hai biến này thì mọi lane đều đang đo `main` ở `:5173` — tức là đo nhầm thứ mình
 * vừa sửa. Chạy dev server lane ở cổng riêng rồi:
 *   $env:AUDIT_BASE="http://127.0.0.1:5272"
 *   $env:AUDIT_API="http://127.0.0.1:8014"
 *   node scripts\visual-audit.mjs
 */
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173'
const API = process.env.AUDIT_API || 'http://127.0.0.1:8000'

/**
 * Ảnh phải nằm TRONG workspace thì các lane mới đọc được.
 * Lần đầu script ghi vào `%TEMP%\kilo\audit` và rule `external_directory: deny *` chặn
 * mọi lần đọc từ đó — tức là yêu cầu "mở ảnh ra nhìn" trong brief là không thực hiện được.
 * `frontend/.kilo/` đã được `.gitignore` (dòng 95) nên ghi vào đây vừa đọc được vừa không
 * làm bẩn commit. Muốn chỗ khác thì đặt biến môi trường `AUDIT_OUT`.
 */
const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const OUT = process.env.AUDIT_OUT || resolve(HERE, '..', '.kilo', 'audit')
const PROFILE = join(OUT, '..', 'edge-profile')

const CJK = /[\u4e00-\u9fff]/
const RAW_KEY = /\b(common|home|nav|auth|tools|pricing|help|legal|shell|drama|studio)\.[a-zA-Z][a-zA-Z0-9]*/g

/** Route cần kiểm. `:id` sẽ thay bằng giá trị thật bên dưới. */
const ROUTES_BASE = [
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
  ['/drama', 'drama-danh-sach'],
  ['/drama/assets', 'drama-tai-nguyen'],
]

/**
 * Route có `:id` sẽ được điền từ dữ liệu thật trong database. Không có dữ liệu thì
 * trang render trống và audit cho kết quả sai — nên phải tạo trước, không đoán id.
 */
const DYNAMIC_ROUTES = [
  ['/studio/{s}/style', 'studio-phong-cach'],
  ['/studio/{s}', 'studio-storyboard'],
  ['/studio/{s}/editor', 'studio-trinh-soan'],
  ['/drama/projects/{d}', 'drama-du-an'],
  ['/drama/projects/{d}/episodes', 'drama-tap'],
  ['/drama/projects/{d}/episodes/{e}', 'drama-tap-chi-tiet'],
  ['/drama/projects/{d}/canvas', 'drama-canvas'],
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

/**
 * Tạo dữ liệu thật để các route có `:id` render được. Không có bước này thì storyboard,
 * trình soạn, chi tiết tập và canvas đều trống, và audit sẽ báo "0 ký tự Trung" một cách
 * dễ chủ quan — tức là báo xong trong khi thực ra **chưa kiểm tra gì**.
 */
async function ensureData(token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const out = { studio: null, drama: null, episode: null }

  const existing = await api('/api/projects', { headers })
  if (Array.isArray(existing) && existing.length) out.studio = existing[0].id

  if (!out.studio) {
    const templates = await api('/api/templates', { headers })
    const t = templates[0]
    if (!t) throw new Error('khong co template nao de tao project')
    const created = await api('/api/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        template_id: t.id,
        title: 'Kiem thu giao dien',
        source_text: 'Mot cau chuyen ngan ve mo quan ca phe va doi thuong.',
        pipeline_mode: 'full',
        output_ratio: '9:16',
      }),
    })
    out.studio = created.id
  }

  const dramas = await api('/api/drama/projects', { headers })
  if (Array.isArray(dramas) && dramas.length) {
    out.drama = dramas[0].id
    try {
      const eps = await api(`/api/drama/projects/${out.drama}/episodes`, { headers })
      if (Array.isArray(eps) && eps.length) out.episode = eps[0].id
    } catch { /* chua co tap */ }
  }

  if (!out.drama) {
    const created = await api('/api/drama/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Kiem thu Drama',
        description: 'Du lieu gia lap de kiem chung giao dien.',
        source: 'Mot nguoi ban cham ngay trong khu pho xa, phat hien ra dieu khac thuong.',
        episode_count: 3,
        image_style_id: 'pixel-art',
        workflow: 'script',
      }),
    })
    out.drama = created.id
    try {
      const eps = await api(`/api/drama/projects/${out.drama}/episodes`, { headers })
      if (Array.isArray(eps) && eps.length) out.episode = eps[0].id
    } catch { /* can co script moi co tap */ }
  }

  return out
}

async function main() {
  console.log(`anh chup o: ${OUT}`)
  const token = await getToken()
  console.log('da lay token')

  const ids = await ensureData(token)
  console.log(`du lieu: studio=${ids.studio} drama=${ids.drama} episode=${ids.episode}`)
  if (!ids.episode) {
    console.warn('!! CHUA CO TAP — route chi tiet tap se trong. Audit khong phu day.')
  }

  const ROUTES = [
    ...ROUTES_BASE,
    ...DYNAMIC_ROUTES.map(([tpl, name]) => [
      tpl.replace('{s}', ids.studio).replace('{d}', ids.drama).replace('{e}', ids.episode),
      name,
    ]).filter(([p]) => !p.includes('null')),
  ]

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

      const metrics = await send('Page.getLayoutMetrics')
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: Math.ceil(metrics?.cssContentSize?.width || 1280),
          height: Math.min(Math.ceil(metrics?.cssContentSize?.height || 900), 4000),
          scale: 1,
        },
      })
      if (shot?.data) {
        writeFileSync(join(dir, `${name}.png`), Buffer.from(shot.data, 'base64'))
      }

      const cjkLines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => CJK.test(l))
        .slice(0, 40)

      results.push({ locale, route, cjk, rawKeys, visible, errors: consoleErrors.length, cjkLines })

      console.log(
        `${locale}  ${route.padEnd(34)} cjk=${String(cjk).padStart(4)}` +
          (rawKeys.length ? `  KEY_LEAK=${rawKeys.join(',')}` : '') +
          (consoleErrors.length ? `  JS_ERROR=${consoleErrors.length}` : '') +
          (visible < 40 ? '  <-- TRANG RONG' : ''),
      )
      if (process.env.AUDIT_VERBOSE && cjk > 0) {
        for (const line of cjkLines) console.log(`        | ${line.slice(0, 160)}`)
      }

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
