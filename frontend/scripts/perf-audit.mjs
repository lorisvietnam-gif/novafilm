/**
 * Rà soát hiệu năng thật — đo byte, ảnh ngoài khung nhìn, CLS, LCP.
 *
 * Không cài gì thêm: dùng Microsoft Edge có sẵn ở chế độ headless, điều khiển qua
 * Chrome DevTools Protocol bằng WebSocket của Node 24 — **cùng cách dựng phiên với
 * `visual-audit.mjs`** (cùng lock, cùng cách đóng socket rồi mới đóng tab, cùng
 * `taskkillTree` lọc theo profile, cùng mốc CDP timeout).
 *
 * Chạy (từ `frontend`, sau `npm run build`):
 *   npx vite preview --port 5204 --host 127.0.0.1 --strictPort
 *   node scripts\perf-audit.mjs --base http://127.0.0.1:5204 --out .kilo\perf-before
 *
 * Vì sao đo trên **preview của bản build**, không đo dev server:
 * `vite dev` không tree-shake, không gộp và không nén, nên byte JS/CSS nó đo ra là
 * byte của công cụ dựng, không phải byte người dùng tải. LCP/CLS trên dev cũng không
 * đại diện. Số cần dùng để quyết định là số của bản đóng gói.
 *
 * Xem: `frontend\.kilo\perf-<tag>\report.json` + `.kilo\perf-<tag>\*.png`
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
/** Cổng debug đổi mỗi lần chạy — cùng lý do như `visual-audit.mjs`: cổng cứng thì một
 *  phiên Edge mồ côi nào đó chiếm cổng là mọi lần chạy sau đo nhầm vào phiên cũ. */
const PORT = 9800 + (process.pid % 400)

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const LOCK = resolve(HERE, '..', '.kilo', 'audit.lock')

function arg(name, fallback) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const eq = hit.indexOf('=')
  return eq === -1 ? process.argv[process.argv.indexOf(hit) + 1] : hit.slice(eq + 1)
}

const BASE = String(arg('base', process.env.PERF_BASE || 'http://127.0.0.1:5204')).replace(/\/$/, '')
const API = String(arg('api', process.env.PERF_API || 'http://127.0.0.1:8000')).replace(/\/$/, '')
const TAG = String(arg('tag', 'perf'))
const OUT = resolve(HERE, '..', '.kilo', arg('out', TAG))
const SHOT = arg('shot', '1') !== '0'
const PROFILE = join(OUT, '..', `edge-perf-${process.pid}`)

/**
 * Chặn ảnh chụp: 25 route × PNG toàn trang tốn hàng trăm MB trong `dist`-adjacent
 * `.kilo/`. Mặc định chụp, tắt bằng `--shot 0` khi chỉ cần số.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Điều kiện mạng giả lập. Đặt **cố định** và ghi ra báo cáo, vì LCP/CLS chỉ so được
 * với nhau khi cả hai lần chạy cùng một điều kiện. Mặc định là họ DevTools
 * "Fast 3G" (1,6 Mbps xuống · 750 Kbps lên · 150 ms RTT) — dải mà người dùng di động
 * ở Việt Nam thật sự gặp, và là nơi mà vài trăm KB ảnh thừa lộ ra rõ nhất.
 * Sửa bằng `--net off` để đo không nghẽn (byte không đổi, chỉ LCP/CLS đổi).
 */
const NET = String(arg('net', 'fast3g'))
const NET_PRESETS = {
  off: { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 },
  fast3g: { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  slow4g: { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 562 },
}
if (!(NET in NET_PRESETS)) throw new Error(`--net phai la mot trong: ${Object.keys(NET_PRESETS).join(', ')}`)

/** Khung nhìn đo. 1440x900 là laptop desktop; dsf=1 để `sizes`/`srcset` được chọn như
 *  một máy không phải retina. Đổi bằng `--viewport 390x844` để đo điện thoại. */
const [VW, VH] = String(arg('viewport', '1440x900')).split('x').map(Number)
const DSF = Number(arg('dsf', '1'))

/**
 * Route nặng nhất. `:project` điền từ dữ liệu thật — không có dữ liệu thì canvas
 * render trống và số đo ra là số của một trang rỗng, tức là sai.
 */
const ROUTES = [
  ['/', 'trang-chu'],
  ['/tools', 'cong-cu'],
  ['/studio/new', 'studio-tao-moi'],
  ['/drama', 'drama-danh-sach'],
  ['/drama/projects/{project}/canvas', 'drama-canvas'],
]

/** Trang báo lỗi API vẫn render tiếng Việt nên trông như đã sạch. Số đo của nó vô
 *  nghĩa — phải đánh dấu `apiDown` chứ không được cộng vào bất kỳ tổng nào. */
const API_ERROR_MARKERS = [
  'Không kết nối được máy chủ',
  'Máy chủ trả về dữ liệu không hợp lệ',
  'Connection failed',
  'Failed to fetch',
  'is not valid JSON',
  'Unexpected token',
]

const CDP_TIMEOUT_MS = Number(process.env.PERF_CDP_TIMEOUT_MS || 90_000)
const SETTLE_MS = 1_500
const HARD_CAP_MS = 70_000

/* ------------------------------------------------------------------ lock ---- */

mkdirSync(resolve(OUT, '..'), { recursive: true })
mkdirSync(OUT, { recursive: true })

function lockHeldByOther() {
  try {
    const pid = Number(readFileSync(LOCK, 'utf8').trim())
    if (!pid || pid === process.pid) return null
    process.kill(pid, 0)
    return pid
  } catch {
    return null
  }
}
const holder = lockHeldByOther()
if (holder) {
  throw new Error(
    `Da co audit khac dang chay (pid ${holder}). `
      + `Hai audit cung luc se hong ca hai va khong con so nao dung duoc. `
      + `Cho no chay xong roi chay lai.`,
  )
}
writeFileSync(LOCK, String(process.pid))
process.on('exit', () => {
  try {
    if (Number(readFileSync(LOCK, 'utf8').trim()) === process.pid) rmSync(LOCK, { force: true })
  } catch { /* da duoc xoa */ }
})

/* --------------------------------------------------------------- helpers ---- */

async function api(path, init) {
  const res = await fetch(`${API}${path}`, init)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function getToken() {
  const body = JSON.stringify({ email: 'board-audit@novafilm.probe', password: 'Audit-2026-x', nickname: 'audit' })
  const headers = { 'Content-Type': 'application/json' }
  try {
    return (await api('/api/auth/register', { method: 'POST', headers, body })).access_token
  } catch {
    return (await api('/api/auth/login', { method: 'POST', headers, body })).access_token
  }
}

function asList(payload) {
  if (Array.isArray(payload)) return payload
  for (const k of ['items', 'data', 'results']) if (Array.isArray(payload?.[k])) return payload[k]
  return []
}

/** Cùng lý do và cùng thứ tự như `visual-audit.mjs`: đóng socket trước, chờ bắp tay
 *  đóng xong rồi hẵng đóng tab — nếu đảo, Edge giữ tab thật và mỗi route rò một
 *  tiến trình renderer, chạy nhiều route là máy cạn bộ nhớ rồi chết im lặng. */
async function closeRoute(ws, tab) {
  try {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      await new Promise((res) => {
        ws.onclose = res
        ws.onerror = res
        ws.close()
        setTimeout(res, 2000)
      })
    }
  } catch { /* socket da hong */ }
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`)
  } catch { /* Edge da chet, tab di theo no */ }
}

function taskkillTree() {
  const tag = PROFILE.replace(/'/g, "''")
  let pids = []
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" `
        + `| Where-Object { $_.CommandLine -like '*${tag}*' } `
        + `| Select-Object -ExpandProperty ProcessId`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    pids = out.split(/\s+/).map(Number).filter(Boolean)
  } catch { /* khong tim thay thi chan chan don dep */ }
  for (const pid of pids) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      try { process.kill(pid) } catch { /* da chet */ }
    }
  }
  return pids.length
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10

/** Bỏ query/hash để cùng một tài nguyên không bị đếm thành hai dòng khác nhau. */
function bareUrl(u) {
  try {
    const p = new URL(u)
    return `${p.origin}${p.pathname}`
  } catch {
    return u
  }
}

/**
 * Phân loại byte theo loại. Ưu tiên `mimeType` thật của response vì `type` của CDP hay
 * gán `Other` cho CSS preload và `Font` cho `.woff2` phụ — còn mime thì không nói dối.
 */
function classify(type, mime, url) {
  const m = (mime || '').toLowerCase()
  const u = url.toLowerCase()
  if (m.startsWith('image/') || type === 'Image' || /\.(png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/.test(u)) return 'image'
  if (m.startsWith('video/') || type === 'Media') return 'media'
  if (m.includes('font') || type === 'Font' || /\.(woff2?|ttf|otf|eot)(\?|$)/.test(u)) return 'font'
  if (m.startsWith('text/css') || type === 'Stylesheet' || /\.(css)(\?|$)/.test(u)) return 'css'
  if (m.includes('javascript') || m.includes('ecmascript') || type === 'Script' || /\.(m?js|jsx|ts)(\?|$)/.test(u)) return 'js'
  if (type === 'XHR' || type === 'Fetch' || /\/(api|static)\//.test(u)) return 'api'
  return 'other'
}

/* ------------------------------------------------------- trang đo trong page ---- */

/**
 * Một lần `Runtime.evaluate` lấy cả số Web Vitals lẫn kiểm kê ảnh.
 *
 * Về `layout-shift` / `largest-contentful-paint`: phải đọc qua `PerformanceObserver`
 * với `buffered: true`, **không** dùng `performance.getEntriesByType`. Đo thật trên
 * Edge 154 ở đây: `getEntriesByType('largest-contentful-paint').length` trả `0`, trong
 * khi observer `buffered` trả về đúng entry (LCP 1060ms, `<section>` 230400px). Lý do:
 * Chromium chỉ nạp hai loại entry này vào timeline buffer khi có observer yêu cầu; đọc
 * kiểu `getEntriesByType` không kích hoạt đường nạp đó nên thấy rỗng. Đo bằng cách sai
 * sẽ ra LCP = null và CLS = 0 cho **mọi** route — tức là báo "không có vấn đề gì" khi
 * thật ra là không đo được gì cả.
 *
 * LCP đọc sau khi trang đứng yên là hợp lý: nó chỉ đổi khi có tương tác người dùng hoặc
 * thêm bố cục mới, và ở đây không có cái nào trong hai việc đó.
 *
 * Về "ảnh ngoài khung nhìn": điều kiện là **có thật sự được tải** (`fetched`) chứ không
 * phải chỉ nằm trong DOM. Một `<img loading="lazy">` dưới fold mà trình duyệt chưa
 * tải thì đang làm đúng việc của nó — đếm nó vào sẽ báo oan. Ngược lại ảnh **không có**
 * `loading="lazy"` mà vẫn nằm dưới fold thì đó mới đúng là lỗi brief nói.
 *
 * Về ảnh nền CSS: `getComputedStyle` trả `url()` đã resolve, kể cả trong `image-set()`,
 * nên lấy được cả dải `media.css`. Chỉ quét phần tử có `background-image` khác `none`.
 */
function collect() {
  const viewport = { w: window.innerWidth, h: window.innerHeight }
  const rect = (el) => {
    const r = el.getBoundingClientRect()
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top + window.scrollY),
      bottom: Math.round(r.bottom + window.scrollY),
    }
  }
  const inFold = (b) => b.top < viewport.h && b.bottom > 0

  const imgs = Array.from(document.images).map((el) => {
    const b = rect(el)
    const cs = getComputedStyle(el)
    return {
      kind: 'img',
      url: el.currentSrc || el.src || '',
      declared: el.getAttribute('src') || '',
      srcset: el.getAttribute('srcset'),
      sizes: el.getAttribute('sizes'),
      loading: el.getAttribute('loading'),
      decoding: el.getAttribute('decoding'),
      fetchpriority: el.getAttribute('fetchpriority'),
      attrW: el.getAttribute('width'),
      attrH: el.getAttribute('height'),
      cssWidth: el.style?.width || null,
      aspectRatio: cs.aspectRatio && cs.aspectRatio !== 'auto' ? cs.aspectRatio : null,
      naturalW: el.naturalWidth || 0,
      naturalH: el.naturalHeight || 0,
      complete: el.complete,
      inFold: inFold(b),
      box: b,
      cls: el.className || '',
    }
  })

  const bgs = []
  for (const el of document.querySelectorAll('*')) {
    const bi = getComputedStyle(el).backgroundImage
    if (!bi || bi === 'none') continue
    const urls = [...bi.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1])
    if (!urls.length) continue
    const b = rect(el)
    bgs.push({
      kind: 'css-background',
      url: urls[0],
      allUrls: urls,
      selector: `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''}`,
      inFold: inFold(b),
      box: b,
    })
  }

  const nav = performance.getEntriesByType('navigation')[0]
  const fcp = performance.getEntriesByName('first-contentful-paint')[0] || null

  const payload = {
    viewport,
    scrollHeight: document.documentElement.scrollHeight,
    text: (document.body ? document.body.innerText : '').slice(0, 4000),
    imgs,
    bgs,
    preloads: Array.from(document.querySelectorAll('link[rel="preload"],link[rel="prefetch"]')).map((el) => ({
      as: el.getAttribute('as'),
      href: el.getAttribute('href'),
      imagesrcset: el.getAttribute('imagesrcset'),
      imagesizes: el.getAttribute('imagesizes'),
    })),
    vitals: {
      cls: 0,
      clsShifts: 0,
      clsDetail: [],
      lcp: null,
      lcpEl: null,
      lcpSize: null,
      lcpCandidates: 0,
      observerSupported: true,
      observerError: null,
      fcp: fcp ? fcp.startTime : null,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
      loadEvent: nav ? nav.loadEventEnd : null,
      transferSize: nav ? nav.transferSize : null,
    },
  }

  // Hai observer chạy song song, mỗi cái có trần 1,2s để một observer không hỗ trợ
  // không làm treo cả lần đo. `supported` để phân biệt "đo ra 0" với "không đo được":
  // entry rỗng là một kết quả, thiếu hẳn entry type là thất bại và phải hiện ra.
  const readEntries = (type) =>
    new Promise((res) => {
      try {
        const o = new PerformanceObserver((list) => res(list.getEntries()))
        o.observe({ type, buffered: true })
        setTimeout(() => res(null), 1200)
      } catch (e) {
        res(null)
      }
    })

  return Promise.all([readEntries('layout-shift'), readEntries('largest-contentful-paint')]).then(([shiftsRaw, lcpsRaw]) => {
    const shifts = (shiftsRaw || []).filter((e) => !e.hadRecentInput)
    payload.vitals.cls = shifts.reduce((a, s) => a + s.value, 0)
    payload.vitals.clsShifts = shifts.length
    payload.vitals.clsDetail = shifts.slice(0, 8).map((e) => ({
      v: Math.round(e.value * 10000) / 10000,
      t: Math.round(e.startTime),
      src: e.sources?.map((s) => s.node?.nodeName || '?').slice(0, 3) || [],
    }))
    const lcps = lcpsRaw || []
    payload.vitals.observerSupported = shiftsRaw !== null && lcpsRaw !== null
    payload.vitals.lcpCandidates = lcps.length
    if (lcps.length) {
      const last = lcps[lcps.length - 1]
      payload.vitals.lcp = last.startTime
      payload.vitals.lcpSize = last.size
      payload.vitals.lcpEl = last.element
        ? `${last.element.tagName.toLowerCase()}${last.element.className ? `.${String(last.element.className).trim().split(/\s+/)[0]}` : ''}`
        : null
    }
    return payload
  })
}

/* ------------------------------------------------------------------ main ---- */

async function main() {
  console.log(`do tren: ${BASE}   (viewport ${VW}x${VH} dsf=${DSF}, net=${NET})`)
  const token = await getToken()
  const projects = asList(await api('/api/drama/projects', { headers: { Authorization: `Bearer ${token}` } }))
  const project = projects[0]?.id
  if (!project) throw new Error('khong co drama project de do canvas')
  console.log(`token ok, drama project=${project}`)

  const ROUTES_REAL = ROUTES.map(([tpl, name]) => [tpl.replace('{project}', String(project)), name])

  const stale = await fetch(`http://127.0.0.1:${PORT}/json/version`).catch(() => null)
  if (stale?.ok) {
    throw new Error(
      `cong debug ${PORT} dang bi chiem boi mot Edge khac. `
        + `taskkill /F /IM msedge.exe /FI "WINDOWTITLE eq *headless*" roi chay lai. `
        + `KHONG bo qua loi nay — ket qua se do sai.`,
    )
  }

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

  const results = []
  try {
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

    for (const [route, name] of ROUTES_REAL) {
      results.push(await measureRoute(route, name, token))
    }
  } finally {
    edge.removeAllListeners()
    const killed = taskkillTree()
    try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) } catch { /* da xoa */ }
    console.log(`da don ${killed} tien trinh Edge`)
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ tag: TAG, base: BASE, net: NET, viewport: `${VW}x${VH}`, dsf: DSF, routes: results }, null, 2))
  report(results)
}

async function measureRoute(route, name, token) {
  const tab = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/')}`, { method: 'PUT' })
  ).json()

  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const requests = new Map()
  const failed = []
  const jsErrors = []

  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  try {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        clearTimeout(pending.get(msg.id).timer)
        const { res, rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`))
        else res(msg.result)
      }
      const p = msg.params
      if (msg.method === 'Network.requestWillBeSent' && p?.requestId) {
        // Một request có thể bị redirect: `redirectResponse` đánh dấu lần trước đã
        // xong. Ghi đè bản ghi để chỉ giữ lần cuối, byte của redirect tính vào nó.
        const rec = requests.get(p.requestId) || { bytes: 0 }
        rec.url = p.request?.url || ''
        rec.type = p.type || 'Other'
        rec.method = p.request?.method || 'GET'
        rec.status = null
        rec.mime = null
        rec.start = p.timestamp || null
        requests.set(p.requestId, rec)
      } else if (msg.method === 'Network.responseReceived' && p?.requestId) {
        const rec = requests.get(p.requestId)
        if (rec) {
          rec.status = p.response?.status ?? null
          rec.mime = p.response?.mimeType || null
          rec.fromCache = Boolean(p.response?.fromDiskCache || p.response?.fromPrefetchCache)
          rec.protocol = p.response?.protocol || null
        }
      } else if (msg.method === 'Network.loadingFinished' && p?.requestId) {
        const rec = requests.get(p.requestId)
        if (rec) rec.bytes = p.encodedDataLength || 0
      } else if (msg.method === 'Network.loadingFailed' && p?.requestId) {
        const rec = requests.get(p.requestId)
        if (rec) failed.push({ url: rec.url, error: p.errorText, type: rec.type })
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = p?.exceptionDetails
        jsErrors.push(d?.exception?.description || d?.text || 'exception')
      }
    }

    ws.onclose = () => {
      for (const [, q] of pending) {
        clearTimeout(q.timer)
        q.rej(new Error('Ket noi CDP bi ngat giua chung. Route nay KHONG duoc coi la da do.'))
      }
      pending.clear()
    }

    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const n = ++id
        const timer = setTimeout(() => {
          pending.delete(n)
          rej(new Error(`CDP khong tra loi cho "${method}" sau ${CDP_TIMEOUT_MS / 1000}s. Route nay KHONG duoc coi la da do.`))
        }, CDP_TIMEOUT_MS)
        pending.set(n, { res, rej, timer })
        try {
          ws.send(JSON.stringify({ id: n, method, params }))
        } catch (e) {
          clearTimeout(timer)
          pending.delete(n)
          rej(new Error(`CDP "${method}" gui khong duoc: ${e.message}`))
        }
      })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: VW, height: VH, deviceScaleFactor: DSF, mobile: false,
    })
    await send('Network.emulateNetworkConditions', NET_PRESETS[NET])
    // LCP và CLS chỉ được ghi khi trang ở trạng thái hoạt động. Headless trên Windows có
    // thể mở cửa sổ ẩn, nên phải ép cho chắc — nếu không thì hai số này là 0 giả.
    await send('Page.setWebLifecycleState', { state: 'active' })
    // Cache tắt: "trang này tải bao nhiêu byte" chỉ có nghĩa khi mọi byte đều đi qua
    // mạng. Bật lại sẽ cho route sau dùng bộ nhớ đệm của route trước và số sẽ tụt
    // dần theo thứ tự chạy — tức là số phụ thuộc thứ tự, vô dụng.
    await send('Network.setCacheDisabled', { cacheDisabled: true })

    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('novafilm.locale', 'vi');
                   localStorage.setItem('token', ${JSON.stringify(token)});`,
    })

    const nav = await send('Page.navigate', { url: BASE + route })
    if (nav?.errorText) throw new Error(`khong dieu huong duoc: ${nav.errorText}`)

    // Chờ mạng rảnh: không còn request nào bay 1,5s liên tục, hoặc chạm trần 70s.
    let quietSince = Date.now()
    const started = Date.now()
    let shot = null
    while (Date.now() - started < HARD_CAP_MS) {
      await sleep(250)
      const inflight = [...requests.values()].filter((r) => r.bytes === 0 && r.status === null && !r.fromCache)
      if (inflight.length === 0) {
        if (Date.now() - quietSince >= SETTLE_MS) break
      } else {
        quietSince = Date.now()
      }
    }
    // Thêm một nhịp: LCP/CLS cần thêm chút thời gian sau khi byte cuối về.
    await sleep(600)

    const collected = (await send('Runtime.evaluate', {
      expression: `(${collect.toString()})()`,
      returnByValue: true,
      awaitPromise: true,
    })).result.value

    if (SHOT) {
      const metrics = await send('Page.getLayoutMetrics')
      shot = await send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 72,
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: Math.ceil(metrics?.cssContentSize?.width || VW),
          height: Math.min(Math.ceil(metrics?.cssContentSize?.height || VH), 3000),
          scale: 1,
        },
      })
      if (shot?.data) writeFileSync(join(OUT, `${name}.jpg`), Buffer.from(shot.data, 'base64'))
    }

    const byType = { js: 0, css: 0, image: 0, font: 0, media: 0, api: 0, other: 0 }
    const list = []
    for (const rec of requests.values()) {
      if (!rec.url || rec.url.startsWith('data:') || rec.url.startsWith('blob:')) continue
      const kind = classify(rec.type, rec.mime, rec.url)
      byType[kind] += rec.bytes
      list.push({ url: bareUrl(rec.url), kind, bytes: rec.bytes, status: rec.status, mime: rec.mime, fromCache: rec.fromCache || false })
    }
    const totalBytes = Object.values(byType).reduce((a, b) => a + b, 0)

    const requested = new Set(list.filter((r) => r.kind === 'image').map((r) => r.url))
    const requestedRaw = new Set(list.filter((r) => r.kind === 'image').map((r) => r.url.split('/').pop()))

    const imageInventory = []
    for (const im of collected.imgs) {
      const u = im.url ? bareUrl(im.url) : ''
      const fetched = requested.has(u) || (u && requestedRaw.has(u.split('/').pop()))
      imageInventory.push({ ...im, fetched, bytes: list.find((r) => r.url === u)?.bytes ?? null })
    }
    for (const bg of collected.bgs) {
      const urls = bg.allUrls.map(bareUrl)
      const fetched = urls.some((u) => requested.has(u) || requestedRaw.has(u.split('/').pop()))
      imageInventory.push({
        ...bg,
        url: urls[0],
        fetched,
        bytes: urls.reduce((a, u) => a + (list.find((r) => r.url === u)?.bytes ?? 0), 0),
      })
    }

    const belowFoldFetched = imageInventory.filter((im) => im.fetched && !im.inFold)
    const oversized = imageInventory.filter((im) => im.kind === 'img' && im.box.w > 0 && im.naturalW > 0
      && (im.naturalW / im.box.w) >= 2)
      .map((im) => ({ ...im, ratio: Math.round((im.naturalW / im.box.w) * 100) / 100, wasteBytes: im.bytes }))

    const missingAttrs = {
      noLazyOnBelowFold: imageInventory.filter((im) => !im.inFold && im.loading !== 'lazy' && im.kind === 'img').length,
      noDecodingAsync: imageInventory.filter((im) => im.decoding !== 'async').length,
      noExplicitSize: imageInventory.filter((im) => im.kind === 'img'
        && !im.attrW && !im.attrH && !im.aspectRatio).length,
      noSrcset: imageInventory.filter((im) => im.kind === 'img' && !im.srcset).length,
      srcsetNoSizes: imageInventory.filter((im) => im.srcset && !im.sizes).length,
    }

    const apiDown = API_ERROR_MARKERS.some((m) => collected.text.includes(m))

    const row = {
      name,
      route,
      finalUrl: collected.viewport ? route : route,
      apiDown,
      jsErrors: jsErrors.length,
      failedRequests: failed.length,
      viewport: collected.viewport,
      pageHeightPx: collected.scrollHeight,
      totalBytes,
      byType,
      requests: list.length,
      vitals: {
        ...collected.vitals,
        cls: Math.round((collected.vitals.cls || 0) * 10000) / 10000,
        lcpMs: collected.vitals.lcp == null ? null : Math.round(collected.vitals.lcp),
        fcpMs: collected.vitals.fcp == null ? null : Math.round(collected.vitals.fcp),
        dclMs: collected.vitals.domContentLoaded == null ? null : Math.round(collected.vitals.domContentLoaded),
        loadMs: collected.vitals.loadEvent == null ? null : Math.round(collected.vitals.loadEvent),
      },
      images: {
        total: imageInventory.length,
        fetched: imageInventory.filter((im) => im.fetched).length,
        belowFoldFetched: belowFoldFetched.length,
        belowFoldFetchedBytes: belowFoldFetched.reduce((a, im) => a + (im.bytes || 0), 0),
        belowFoldDetail: belowFoldFetched.map((im) => ({ kind: im.kind, url: im.url, bytes: im.bytes, top: im.box.top, loading: im.loading })),
        oversized,
        attrs: missingAttrs,
        list: imageInventory,
      },
      preloads: collected.preloads,
      resources: list.sort((a, b) => b.bytes - a.bytes),
      networkFailed: failed,
    }
    console.log(
      `${route.padEnd(34)} ${String(kb(totalBytes)).padStart(8)} KB`
      + ` | js ${String(kb(byType.js)).padStart(7)} css ${String(kb(byType.css)).padStart(6)}`
      + ` img ${String(kb(byType.image)).padStart(7)} font ${String(kb(byType.font)).padStart(5)}`
      + ` | LCP ${row.vitals.lcpMs}ms FCP ${row.vitals.fcpMs}ms CLS ${row.vitals.cls}`
      + ` | anh ${row.images.fetched}/${row.images.total} trong do ${row.images.belowFoldFetched} ngoai fold`
      + (row.jsErrors ? ` JS_ERROR=${row.jsErrors}` : '')
      + (row.apiDown ? ' API_DOWN' : ''),
    )
    return row
  } catch (err) {
    console.log(`${route.padEnd(34)} LOI — ${err instanceof Error ? err.message : String(err)}`)
    return { name, route, probeFailed: true, failure: err instanceof Error ? err.message : String(err) }
  } finally {
    await closeRoute(ws, tab)
  }
}

function report(results) {
  console.log(`\n===== TONG HOP (${TAG}) — ${BASE} · net=${NET} · ${VW}x${VH} =====`)
  const head = 'route'.padEnd(30) + 'tong KB'.padStart(9) + 'js KB'.padStart(9) + 'css KB'.padStart(8) + 'anh KB'.padStart(9) + 'font KB'.padStart(8) + 'LCP ms'.padStart(8) + 'CLS'.padStart(8) + 'ngoai fold'.padStart(11)
  console.log(head)
  console.log('-'.repeat(head.length))
  for (const r of results) {
    if (r.probeFailed) {
      console.log(r.route.padEnd(30) + '  LOI: ' + String(r.failure).slice(0, 60))
      continue
    }
    console.log(
      r.route.padEnd(30)
      + String(kb(r.totalBytes)).padStart(9)
      + String(kb(r.byType.js)).padStart(9)
      + String(kb(r.byType.css)).padStart(8)
      + String(kb(r.byType.image)).padStart(9)
      + String(kb(r.byType.font)).padStart(8)
      + String(r.vitals.lcpMs).padStart(8)
      + String(r.vitals.cls).padStart(8)
      + String(r.images.belowFoldFetched).padStart(11),
    )
  }
  const ok = results.filter((r) => !r.probeFailed)
  console.log(`\ntong byte 5 route: ${kb(ok.reduce((a, r) => a + r.totalBytes, 0))} KB`)
  console.log(`anh ngoai khung nhin: ${ok.reduce((a, r) => a + r.images.belowFoldFetched, 0)} anh / ${kb(ok.reduce((a, r) => a + r.images.belowFoldFetchedBytes, 0))} KB`)
  console.log('\nanh tai sai kich thuoc (>=2x ban hien thi):')
  for (const r of ok) {
    for (const o of r.images.oversized) {
      console.log(`  ${r.route.padEnd(30)} ${String(o.box.w).padStart(4)}px hien thi <- ${o.naturalW}px  x${o.ratio}  ${kb(o.wasteBytes || 0)}KB  ${o.url.split('/').pop()}`)
    }
  }
  console.log('\nthieu thuoc tinh img:')
  for (const r of ok) {
    const a = r.images.attrs
    console.log(`  ${r.route.padEnd(30)} duoi-fold-thieu-lazy=${a.noLazyOnBelowFold} thieu-decoding-async=${a.noDecodingAsync} thieu-kich-thuoc=${a.noExplicitSize} thieu-srcset=${a.noSrcset} srcset-thieu-sizes=${a.srcsetNoSizes}`)
  }
  console.log(`\nchi tiet: ${join(OUT, 'report.json')}`)
}

process.on('uncaughtException', (e) => {
  console.error('LOI KHONG BAT DUOC:', e?.stack || e?.message || e)
  process.exit(1)
})
process.on('unhandledRejection', (e) => {
  console.error('PROMISE BI TU CHOI:', e?.stack || e?.message || e)
  process.exit(1)
})

main().catch((e) => {
  console.error('LOI:', e?.stack || e?.message || e)
  process.exit(1)
})
