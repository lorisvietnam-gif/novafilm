/**
 * Đo CLS của riêng `/wizard`, bốn bước, và **đo cả hai nhánh font**.
 *
 *   node scripts\wizard-cls-check.mjs
 *   BASE=http://127.0.0.1:4173 node scripts\wizard-cls-check.mjs
 *
 * ---- ĐO TRÊN BUILD, KHÔNG ĐO TRÊN DEV SERVER ------------------------------------
 * Cần trỏ `BASE` vào `npm run preview` (`:4173`), **không** phải dev server Vite.
 * Dev server phục vụ hàng trăm module rời, và dưới Fast 3G trang cần hàng chục giây mới
 * dựng xong — đo trên đó ra CLS của một trang *chưa kịp vẽ*, tức là số của công cụ chứ
 * không phải của người dùng. `perf-audit.mjs` cũng ghi rõ điều này ở dòng 15.
 *
 * ---- VÌ SAO PHẢI ĐO, KHÔNG GIẢ ĐỊNH ------------------------------------------
 * `index.html` nối `Noto Serif` (và Noto Serif SC) qua Google Fonts với
 * `display=swap`. Đo trên máy này: **Noto Serif KHÔNG cài sẵn cục bộ** — danh sách font
 * đã cài chỉ có Cambria, Constantia, Georgia, Palatino Linotype, Times New Roman. Nên
 * font tới từ CDN, và `swap` nghĩa là trình duyệt vẽ bằng font dự phòng trước rồi mới
 * thay. Mỗi lần thay là một cú dịch bố cục.
 *
 * Vì vậy script đo **hai lần**:
 *   - `cdn`      : font CDN tới bình thường. Đây là điều kiện thật.
 *   - `no-cdn`   : chặn `fonts.googleapis.com` / `fonts.gstatic.com` bằng `Fetch`.
 *                  Đây là trần xấu nhất — mọi thứ vẫn phải đọc được bằng font dự phòng.
 *
 * Hai con số này mới trả lời được câu hỏi "nó có nhảy không": nếu `no-cdn` bằng 0 và
 * `cdn` khác 0 thì cú dịch do font, và quy mô nó bằng hiệu của hai con số.
 *
 * Cùng điều kiện mạng cả hai nhánh (Fast 3G — đúng preset `perf-audit.mjs` dùng) vì
 * LCP/CLS chỉ so được khi điều kiện giống nhau.
 *
 * `layout-shift` phải đọc qua `PerformanceObserver` **trong trang**. Đọc sau bằng
 * `getEntriesByType` ra `null` và CLS = 0 cho mọi route — tức là báo "không có vấn đề
 * gì" trong khi thực ra không đo được gì.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const OUT = resolve(HERE, '..', '.kilo', 'wizard-cls')

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = (process.env.BASE || process.env.AUDIT_BASE || 'http://127.0.0.1:4173').replace(/\/$/, '')
const PROFILE = join(tmpdir(), `novafilm-wizard-cls-${process.pid}`)

const PORT_MIN = Number(process.env.AUDIT_PORT_MIN || 19400)
const PORT_MAX = Number(process.env.AUDIT_PORT_MAX || 19999)
const CDP_TIMEOUT_MS = Number(process.env.AUDIT_CDP_TIMEOUT_MS || 60_000)
const WIDTH = 1440
const HEIGHT = 900

/** Đúng preset Fast 3G của `perf-audit.mjs`: 1,6 Mbps xuống · 750 Kbps lên · 150 ms RTT. */
const NET = { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function portHeldByProcess(port) {
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000,
    })
    return out.split(/\r?\n/).some((l) => l.includes(`:${port} `) && l.includes('LISTENING'))
  } catch {
    return false
  }
}

async function pickPort() {
  for (let i = 0; i < 60; i += 1) {
    const port = PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN))
    if (portHeldByProcess(port)) continue
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(700) })
      if (res.ok) continue
    } catch { /* trống, đúng ý */ }
    return port
  }
  throw new Error(`Khong tim duoc cong debug trong [${PORT_MIN}, ${PORT_MAX}].`)
}

/**
 * Tay nắm tiến trình Edge mà lượt chạy này sinh ra.
 *
 * Giữ lại không phải để `taskkill` theo nó — `visual-audit.mjs` đã đo được rằng trên
 * Windows tiến trình mà `spawn` trả về chết ngay và `taskkill` theo pid đó **không giết
 * được gì**. Nó giữ lại vì lỗi `spawn` (Edge không có ở `EDGE_PATH`) chỉ biết được khi
 * có handle, và dọn dẹp thì vẫn phải lọc theo profile.
 */
let EDGE_HANDLE = null

function killTree() {
  if (EDGE_HANDLE) {
    try {
      execFileSync('taskkill', ['/PID', String(EDGE_HANDLE.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch { /* thường không ăn — xem ghi chú trên; quét profile mới là cách thật */ }
  }
  const tag = PROFILE.replace(/'/g, "''")
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" `
      + `| Where-Object { $_.CommandLine -like '*${tag}*' } `
      + `| Select-Object -ExpandProperty ProcessId`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 })
    for (const pid of out.split(/\s+/).map(Number).filter(Boolean)) {
      try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* đã chết */ }
    }
  } catch { /* không dọn được thì không chặn báo cáo */ }
  for (let i = 0; i < 5; i += 1) {
    try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 }) } catch { /* thử lại */ }
  }
}

process.on('exit', killTree)
process.on('uncaughtException', (e) => { console.error('LOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error('PROMISE BI TU CHOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })

const WIZARD_NEXT = `(() => {
  const btns = document.querySelectorAll('.wizard-actions .pf-btn')
  const next = btns[btns.length - 1]
  if (!next) throw new Error('khong tim thay nut buoc sau')
  next.click()
  return true
})()`

const IDEA =
  'Một cô gái trẻ mặc áo khoác da chạy băng qua phố mưa lúc đêm, dừng lại trước một quán cà phê nhỏ, ngẩng đầu nhìn đèn neon và thở dài.'

const WIZARD_GENERATE = `(() => {
  const area = document.querySelector('.wizard-textarea')
  if (!area) throw new Error('khong tim thay o nhap y tuong')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(area, ${JSON.stringify(IDEA)})
  area.dispatchEvent(new Event('input', { bubbles: true }))
  const go = document.querySelector('.wizard-generate')
  if (!go) throw new Error('khong tim thay nut soan')
  go.click()
  return true
})()`

/**
 * Bộ quan sát phải được cài **trước khi** trang điều hướng, không phải sau. `layout-shift`
 * là entry có `buffered: true` nên đọc lại sau vẫn được, nhưng chỉ khi observer đăng ký
 * trước lần paint đầu; đăng ký sau thì cửa sổ đầu đã trôi qua và số ra thấp.
 */
const OBSERVER = `(() => {
  window.__cls = 0
  window.__clsDetail = []
  window.__clsSupported = false
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue
        window.__cls += e.value
        window.__clsDetail.push({
          value: Math.round(e.value * 10000) / 10000,
          time: Math.round(e.startTime),
          nodes: (e.sources || []).map((s) => {
            const n = s.node
            if (!n) return '?'
            const el = n.nodeType === 1 ? n : n.parentElement
            const cls = el && typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''
            return (el ? el.tagName.toLowerCase() : '?') + (cls ? '.' + cls : '')
          }).slice(0, 4),
        })
      }
    }).observe({ type: 'layout-shift', buffered: true })
    window.__clsSupported = true
  } catch (e) {
    window.__clsError = String(e)
  }
  return true
})()`

const READ = `(() => ({
  cls: Math.round((window.__cls || 0) * 10000) / 10000,
  detail: window.__clsDetail || [],
  supported: window.__clsSupported === true,
  observerError: window.__clsError || null,
  serifFamilyLoaded: (() => {
    const seen = new Set()
    for (const f of document.fonts) seen.add(f.family + ' ' + f.weight + ' ' + f.status)
    return [...seen]
  })(),
  notoSerif: (() => {
    for (const f of document.fonts) if (String(f.family).includes('Noto Serif')) return f.status
    return 'absent'
  })(),
  fontsStatus: (() => { try { return document.fonts.status } catch (e) { return null } })(),
  titleHeight: (() => {
    const h = document.querySelector('.pf-page-title')
    return h ? Math.round(h.getBoundingClientRect().height) : null
  })(),
  titleFont: (() => {
    const h = document.querySelector('.pf-page-title')
    return h ? getComputedStyle(h).fontFamily : null
  })(),
}))()`

/**
 * Chờ một selector xuất hiện.
 *
 * Không có hàm này thì đo được **ảnh chụp trang rỗng**: dưới Fast 3G, bấm nút trước khi
 * React dựng xong thì `.wizard-actions` rỗng, `WIZARD_NEXT` ném lỗi, và cả lượt chết
 * với thông báo `Uncaught` — trông giống trang hỏng trong khi trang chỉ chưa kịp vẽ.
 */
async function waitForSelector(send, selector, label) {
  const deadline = Date.now() + 45_000
  for (;;) {
    const r = await send('Runtime.evaluate', {
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true,
    })
    if (r?.result?.value === true) return
    if (Date.now() > deadline) {
      throw new Error(`khong thay ${selector} (${label}) sau 45s`)
    }
    await sleep(400)
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const port = await pickPort()
  EDGE_HANDLE = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${PROFILE}`,
    '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-first-run', 'about:blank',
  ], { stdio: 'ignore' })

  let version = null
  for (let i = 0; i < 60 && !version; i += 1) {
    await sleep(500)
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(5000) })).json() } catch { /* chưa lên */ }
  }
  if (!version) throw new Error('Edge headless khong len duoc')

  const rows = []
  try {
    for (const mode of ['cdn', 'no-cdn']) {
      const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, {
        method: 'PUT', signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
      })).json()
      const ws = new WebSocket(tab.webSocketDebuggerUrl)
      let id = 0
      const pending = new Map()
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('CDP bat tay khong xong')), CDP_TIMEOUT_MS)
        ws.onopen = () => { clearTimeout(t); res() }
        ws.onerror = (e) => { clearTimeout(t); rej(new Error(`CDP that bai: ${e?.message || e}`)) }
      })
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id); clearTimeout(p.timer); p.res(msg.result); pending.delete(msg.id)
        }
      }
      ws.onclose = () => {
        for (const [, p] of pending) { clearTimeout(p.timer); p.rej(new Error('CDP bi ngat')) }
        pending.clear()
      }
      const send = (method, params = {}) => new Promise((res, rej) => {
        const n = ++id
        const timer = setTimeout(() => {
          if (!pending.has(n)) return
          pending.delete(n)
          rej(new Error(`CDP khong tra loi cho "${method}" sau ${CDP_TIMEOUT_MS / 1000}s`))
        }, CDP_TIMEOUT_MS)
        pending.set(n, { res, rej, timer })
        try { ws.send(JSON.stringify({ id: n, method, params })) }
        catch (e) { clearTimeout(timer); pending.delete(n); rej(e) }
      })
      const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
        if (r?.exceptionDetails) throw new Error(`bieu thuc that bai: ${String(r.exceptionDetails.text)}`)
        return r?.result?.value
      }

      await send('Page.enable')
      await send('Network.enable')
      await send('Network.setCacheDisabled', { cacheDisabled: true })
      await send('Network.emulateNetworkConditions', NET)
      await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })

      /*
       * Chặn endpoint `generate_prompt` ở **cả hai** nhánh.
       *
       * Vì sao: endpoint đó cần token rồi gọi mô hình, và AGENTS.md mục 10 ghi đo được
       * `vi/script` mất ~55 giây. Dưới Fast 3G lần đó vượt mốc chờ 60s của CDP và giết
       * cả lượt đo — trong khi thứ ta cần đo là **bố cục**, không phải độ trễ của LLM.
       *
       * Chặn nó thì `generate()` đi vào **đúng nhánh lỗi** mà trang đã viết sẵn: dựng bản
       * nháp trong trình duyệt (`buildDraftFrames`). Đây cũng chính là đường mà
       * `visual-audit.mjs` đang chạy mỗi lần, nên đo được đúng thứ người dùng thấy khi
       * dịch vụ chưa sẵn sàng, và tệp báo cáo ra đủ khung để đo bảng chỉ đạo.
       */
      const blocked = ['*api/wizard/generate_prompt*']
      if (mode === 'no-cdn') blocked.push('*fonts.googleapis.com*', '*fonts.gstatic.com*')

      await send('Fetch.enable', { patterns: blocked.map((urlPattern) => ({ urlPattern })) })
      const rawOnMessage = ws.onmessage
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.method === 'Fetch.requestPaused') {
          send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'BlockedByClient' }).catch(() => { })
          return
        }
        rawOnMessage(ev)
      }

      // Cài observer trên origin thật, rồi mới điều hướng — cài trên `about:blank` thì
      // `localStorage` không có và không đo được.
      await send('Page.navigate', { url: BASE + '/' })
      await sleep(3000)
      await evaluate(OBSERVER)
      await send('Page.navigate', { url: BASE + '/wizard' })
      await waitForSelector(send, '.wizard-actions .pf-btn', 'buoc 1')
      await sleep(6000) // chờ font CDN + swap xong

      /*
       * Thứ tự này phải khớp `WALKTHROUGHS['tram-de-prompt']` của `visual-audit.mjs`:
       * "soạn" **không** đổi bước — nó chỉ điền kết quả vào đúng bước 2. Bấm NEXT một
       * lần nữa mới sang bước 3. Nhãn dưới đây trùng hệt hậu tố ảnh của audit chính để
       * đối chiếu hai báo cáo với nhau mà không phải dịch tên.
       */
      const walk = [
        { step: '1-anh-tham-chieu', run: null, after: '.wizard-actions .pf-btn' },
        { step: '2a-y-tuong', run: WIZARD_NEXT, after: '.wizard-textarea' },
        { step: '2b-da-soan', run: WIZARD_GENERATE, after: '.wizard-readout, .wizard-field-error' },
        { step: '3-dich-den', run: WIZARD_NEXT, after: '.wizard-target-grid' },
        { step: '4-sao-chep', run: WIZARD_NEXT, after: '.wizard-frames, .wizard-drop-empty' },
      ]
      for (const w of walk) {
        if (w.run) {
          await evaluate(w.run)
          await sleep(2200)
          await waitForSelector(send, w.after, `buoc ${w.step}`)
          await sleep(1200)
        }
        const read = await evaluate(READ)
        if (!read) throw new Error(`${mode} buoc ${w.step}: khong doc duoc CLS`)
        rows.push({ mode, step: w.step, ...read })
        console.log(
          `${mode.padEnd(6)} buoc ${w.step}  CLS ${read.cls}  ${read.detail.length} cum  ·  `
            + `NotoSerif=${read.notoSerif} fonts=${read.serifFamilyLoaded.length} tieuDe=${read.titleHeight}px`,
        )
        for (const d of read.detail.slice(0, 4)) {
          console.log(`         +${d.value} tai ${d.time}ms  ${d.nodes.join(', ')}`)
        }
      }
      if (mode === 'no-cdn') await send('Fetch.disable').catch(() => { })
      ws.close()
      await sleep(400)
    }
  } finally {
    killTree()
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ net: NET, viewport: `${WIDTH}x${HEIGHT}`, rows }, null, 2))
  const worst = (m) => Math.max(...rows.filter((r) => r.mode === m).map((r) => r.cls))
  console.log(`\nWorst CLS  cdn=${worst('cdn')}  no-cdn=${worst('no-cdn')}`)
  console.log(`(Google Core Web Vitals: "good" <= 0.1, "needs improvement" <= 0.25)`)
  console.log(`ghi ra: ${join(OUT, 'report.json')}`)
  killTree()
}

main().catch((e) => { console.error('LOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })