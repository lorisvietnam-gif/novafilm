/**
 * Đo tràn layout theo ngôn ngữ — chữ tiếng Anh dài hơn tiếng Việt, nên cùng một
 * component có thể vỡ ở `en` mà vẫn đẹp ở `vi`.
 *
 * Chạy:  set AUDIT_BASE=http://127.0.0.1:5271 && node scripts\layout-audit.mjs
 *
 * Bề rộng đo: mặc định 1440 (bản desktop đã đạt). Thêm `AUDIT_WIDTHS=360,390` để
 * đo lại ở các bề rộng điện thoại — cùng một component có thể tràn ở 390 nhưng
 * không ở 1440, và số đo phải là số chứ không phải cảm nhận.
 *
 * Cùng cơ chế với `visual-audit.mjs`: Edge headless + Chrome DevTools Protocol,
 * không cài thêm gì. Khác ở chỗ: nó **đo** thay vì **đếm ký tự** — báo những chỗ
 * bề ngang bị tràn, bị cắt, hoặc tràn ra ngoài khung chứa.
 *
 * Cần có dev server của đúng lane này. `AUDIT_BASE` mặc định là 5173, nhưng cổng
 * đó dùng chung và thường bị lane khác giữ, nên luôn nên truyền `AUDIT_BASE`.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9336
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:8000'
const OUT = process.env.AUDIT_OUT || 'C:\\Users\\NOVAST~1\\AppData\\Local\\Temp\\kilo\\audit'
const PROFILE = 'C:\\Users\\NOVAST~1\\AppData\\Local\\Temp\\kilo\\edge-layout-profile'
const TOLERANCE = 2
const HEIGHT = 1400
// `AUDIT_WIDTHS=360,390,430` để đo nhiều bề rộng. Không đặt thì chỉ 1440.
const WIDTHS = (process.env.AUDIT_WIDTHS || '1440')
  .split(',')
  .map((w) => Number(w.trim()))
  .filter((w) => Number.isFinite(w) && w > 0)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, init) {
  const res = await fetch(`${API}${path}`, init)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

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

async function ensureStudioProject(token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const list = await api('/api/projects?page=1&page_size=1', { headers })
  const items = Array.isArray(list) ? list : list?.items
  if (Array.isArray(items) && items.length) return items[0].id
  const templates = await api('/api/templates', { headers })
  const created = await api('/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      template_id: templates[0].id,
      title: 'Kiem thu giao dien',
      source_text: 'Mot cau chuyen ngan ve mo quan ca phe va doi thuong.',
      pipeline_mode: 'full',
      output_ratio: '9:16',
    }),
  })
  return created.id
}

const ROUTES = [
  ['/', 'trang-chu'],
  ['/method', 'phuong-phap'],
  ['/auth', 'dang-nhap'],
  ['/templates', 'mau'],
  ['/tools', 'cong-cu'],
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
 * Đo trong trang. Chạy trong ngữ cảnh trang, trả về số đo thuần.
 *
 * - `pageOverflow`: trang bị tràn ngang (cuộn ngang trên cả trang) — lỗi nặng nhất.
 * - `clipped`: phần tử có nội dung dài hơn khung nhưng bị `overflow: hidden` cắt mất.
 *   Đây là dạng "chữ bị cắt" mà nhìn bằng mắt rất dễ bỏ sót.
 * - `escaped`: phần tử tràn ra ngoài khung chứa, đè lên vùng khác.
 */
const MEASURE = `(() => {
  const doc = document.documentElement
  const pageOverflow = Math.max(0, doc.scrollWidth - doc.clientWidth)
  const scrollWidth = doc.scrollWidth
  const innerWidth = window.innerWidth

  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim() : ''
    const text = (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60)
    return (el.tagName.toLowerCase() + (cls ? '.' + cls.split(/\\s+/).slice(0, 2).join('.') : '')) +
      (text ? ' | ' + text : '')
  }

  const clipped = []
  const escaped = []
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue
    // .sr-only cố tình bóp nội dung về 1px cho trình đọc màn hình. Báo nó là
    // "chữ bị cắt" là báo động giả — loại ra.
    if (el.classList && el.classList.contains('sr-only')) continue
    const over = el.scrollWidth - el.clientWidth
    if (over > ${TOLERANCE} && cs.overflowX !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
      clipped.push({ el: describe(el), over, hidden: cs.textOverflow === 'ellipsis' })
    }
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.right > window.innerWidth + ${TOLERANCE}) {
      escaped.push({ el: describe(el), right: Math.round(r.right), limit: window.innerWidth })
    }
  }
  // Sắp theo mức vượt: phần tử tràn nhiều nhất đứng đầu, để tên thủ phạm hiện ra
  // trước thay vì phải đọc hết danh sách.
  const byOverflow = (a, b) => (b.right - b.limit) - (a.right - a.limit)
  escaped.sort(byOverflow)
  clipped.sort((a, b) => b.over - a.over)
  return { pageOverflow, scrollWidth, innerWidth, clipped, escaped }
})()`

async function main() {
  const token = await getToken()
  const studio = await ensureStudioProject(token)
  const all = [...ROUTES, [`/studio/${studio}/style`, 'studio-phong-cach'], [`/studio/${studio}`, 'studio-storyboard']]
  // `AUDIT_ROUTES=/,/pricing` để chỉ đo vài route khi lặp nhiều bề rộng.
  .filter(([route]) => {
    const only = process.env.AUDIT_ROUTES
    if (!only) return true
    return only.split(',').map((r) => r.trim()).includes(route)
  })

  const { spawn } = await import('node:child_process')
  const edge = spawn(
    EDGE,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let version = null
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
      break
    } catch {
      /* chua len */
    }
  }
  if (!version) throw new Error('Edge headless khong len duoc')
  console.log('Edge da len')

  const results = []
  for (const locale of ['vi', 'en']) {
    for (const width of WIDTHS) {
    for (const [route, name] of all) {
      const tab = await (
        await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/')}`, { method: 'PUT' })
      ).json()
      const ws = new WebSocket(tab.webSocketDebuggerUrl)
      let id = 0
      const pending = new Map()
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
      }
      const send = (method, params = {}) =>
        new Promise((res) => {
          const n = ++id
          pending.set(n, res)
          ws.send(JSON.stringify({ id: n, method, params }))
        })

      await send('Runtime.evaluate', {
        expression: `localStorage.setItem('novafilm.locale', ${JSON.stringify(locale)});
                     localStorage.setItem('token', ${JSON.stringify(token)});`,
      })
      // Ép bề rộng khung nhìn thật sự. Không có lệnh này thì Edge headless dùng
      // bề rộng mặc định và mọi số đo "di động" đều vô nghĩa.
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: HEIGHT,
        deviceScaleFactor: 1,
        mobile: width < 768,
      })
      await send('Page.enable')
      await send('Page.navigate', { url: BASE + route })
      await sleep(2600)
      await send('Page.reload', { ignoreCache: false })
      await sleep(2600)

      const measured = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })
      const m = measured?.result?.value || {
        pageOverflow: 0,
        scrollWidth: width,
        innerWidth: width,
        clipped: [],
        escaped: [],
      }

      const suffix = WIDTHS.length > 1 ? `-${width}` : ''
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      if (shot?.data) {
        mkdirSync(join(OUT, locale), { recursive: true })
        writeFileSync(join(OUT, locale, `layout-${name}${suffix}.png`), Buffer.from(shot.data, 'base64'))
      }

      results.push({ locale, width, route, ...m })
      const bad = m.pageOverflow > TOLERANCE || m.clipped.length || m.escaped.length
      console.log(
        `${locale}  ${String(width).padEnd(5)} ${route.padEnd(26)}` +
          ` scrollW=${String(m.scrollWidth).padStart(5)}` +
          ` innerW=${String(m.innerWidth).padStart(5)}` +
          ` tranTrang=${String(m.pageOverflow).padStart(4)}` +
          ` catChu=${String(m.clipped.length).padStart(3)}` +
          ` tranKhung=${String(m.escaped.length).padStart(3)}` +
          (bad ? '   <-- CAN KIEM' : ''),
      )
      ws.close()
      await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`)
    }
    }
  }

  writeFileSync(join(OUT, 'layout-report.json'), JSON.stringify(results, null, 2))

  console.log('\n===== CHI TIET =====')
  for (const r of results) {
    if (!r.pageOverflow && !r.clipped.length && !r.escaped.length) continue
    console.log(`\n${r.locale}  ${r.width}px  ${r.route}`)
    console.log(
      `  scrollWidth=${r.scrollWidth}  innerWidth=${r.innerWidth}  tran ngang=${r.pageOverflow}px`,
    )
    for (const c of r.clipped.slice(0, 6)) {
      console.log(`  cat chu ${c.over}px${c.hidden ? ' (ellipsis)' : ''}: ${c.el}`)
    }
    for (const e of r.escaped.slice(0, 6)) {
      console.log(`  tran ra ngoai ${e.right}>${e.limit}: ${e.el}`)
    }
  }

  edge.kill()
}

main().catch((e) => {
  console.error('LOI:', e.message)
  process.exit(1)
})
