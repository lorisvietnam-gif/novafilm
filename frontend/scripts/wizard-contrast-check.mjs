/**
 * Đo tương phản WCAG AA của riêng `/wizard`, cả 4 bước, cả hai theme.
 *
 *   node scripts\wizard-contrast-check.mjs            (từ `frontend`)
 *   BASE=http://127.0.0.1:5183 node scripts\wizard-contrast-check.mjs
 *
 * Vì sao không dùng `contrast-audit.mjs`: script đó có `ROUTES` g��m cứng, không bấm
 * được qua từng bước của `/wizard`, và nó quét **26 route** — mà brief này hỏi riêng
 * một trang. Sửa `ROUTES` của nó là đụng script dùng chung cho mọi lane, nên ở đây
 * dựng script riêng cho lane.
 *
 * ---- TƯƠNG PHẢN PHẢI ĐO, KHÔNG GIẢ ĐỊNH ---------------------------------------
 * Đã có tiền lệ: `#64748b` tưởng đẹp mà đo ra **4,20:1** (hụt AA), đổi `#475569` ra
 * **6,68:1** mới đạt. Glassmorphism còn làm **tăng** độ khó: đổi nền là đổi tương phản
 * của chữ nằm trên đó. Vì vậy mọi cặp màu ở báo cáo đều lấy từ script này.
 *
 * Cách dựng nền hiệu dụng — leo cây phân tầng, gộp mọi nền **không trong suốt**,
 * dừng ở nền đục, tính từ trong ra ngoài. Đây là cùng thuật toán với `contrast-audit.mjs`
 * nên số của hai script so được với nhau.
 *
 * Điểm khác biệt: script này dựng lại DOM đo **ngay sau khi bấm qua bước**, và đo cả
 * hai theme bằng `prefers-color-scheme` — màu champagne `#f2c94c` đảo vai trò giữa hai
 * theme (fill ở sáng, stroke ở tối) nên chỉ đo một theme là đo thiếu.
 *
 * Giới hạn đã biết, nói thẳng ra: không xuyên qua `background-image`. Cặp nào đứng trên
 * nền có gradient/ảnh được đánh cờ `onArt: true` và phải đo bằng `contrast-on-media.mjs`
 * trên pixel thật — script này không tự coi là đạt.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const OUT = resolve(HERE, '..', '.kilo', 'wizard-contrast')

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = (process.env.BASE || process.env.AUDIT_BASE || 'http://127.0.0.1:5183').replace(/\/$/, '')
const API = process.env.AUDIT_API || 'http://127.0.0.1:8000'
const PROFILE = join(tmpdir(), `novafilm-wizard-contrast-${process.pid}`)

const PORT_MIN = Number(process.env.AUDIT_PORT_MIN || 19400)
const PORT_MAX = Number(process.env.AUDIT_PORT_MAX || 19999)
const CDP_TIMEOUT_MS = Number(process.env.AUDIT_CDP_TIMEOUT_MS || 60_000)
const WIDTH = Number(process.env.AUDIT_WIDTH || 1280)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ chạy Edge ---- */

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
    } catch { /* cổng trống, đúng ý */ }
    return port
  }
  throw new Error(`Khong tim duoc cong debug trong [${PORT_MIN}, ${PORT_MAX}].`)
}

/** Giết Edge theo profile của lần chạy này — không đụng trình duyệt của người dùng. */
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
    try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 }) } catch { /* thử lại vòng sau */ }
  }
}

process.on('exit', killTree)
process.on('uncaughtException', (e) => { console.error('LOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error('PROMISE BI TU CHOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })

/* ------------------------------------------------------------------ đo trong trang ---- */

/**
 * Toàn bộ phép tính chạy TRONG trang vì cần `getComputedStyle` của chính DOM đó.
 * Node side không giữ bản sao — một bản sao chỉ tính thứ không ai chạy và sẽ thành
 * nguồn số liệu giả.
 */
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
    for (let i = stack.length - 2; i >= 0; i -= 1) base = over(stack[i].rgb, base, stack[i].a)
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
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).slice(0, 3).join('.')
    const key = cls + '|' + cs.color + '|' + cs.fontSize + '|' + bd.rgb.join(',') + '|' + bd.onArt
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      el: el.tagName.toLowerCase() + (cls ? '.' + cls : ''),
      text: own.slice(0, 40),
      color: cs.color,
      colorHex: 'rgb(' + flat.map(Math.round).join(', ') + ')',
      bg: 'rgb(' + bd.rgb.map(Math.round).join(', ') + ')',
      fontSize: cs.fontSize,
      onArt: bd.onArt,
      need,
      ratio: Math.round(ratio(flat, bd.rgb) * 100) / 100,
    })
  }
  for (const r of rows) r.pass = r.ratio >= r.need
  return rows
})()`

/* ------------------------------------------------------------------ lái thử ---- */

async function api(path, init) {
  const res = await fetch(`${API}${path}`, init)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function token() {
  const headers = { 'Content-Type': 'application/json' }
  const body = JSON.stringify({ email: 'board-audit@novafilm.probe', password: 'Audit-2026-x', nickname: 'audit' })
  try { return (await api('/api/auth/register', { method: 'POST', headers, body })).access_token }
  catch { return (await api('/api/auth/login', { method: 'POST', headers, body })).access_token }
}

const WIZARD_NEXT = `(() => {
  const btns = document.querySelectorAll('.wizard-actions .pf-btn')
  const next = btns[btns.length - 1]
  if (!next) throw new Error('khong tim thay nut buoc sau')
  next.click()
  return true
})()`

/** Ý tưởng có dấu chấm câu để bản nháp tách được thành khung, đúng như audit chính. */
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
 * Chờ một selector xuất hiện.
 *
 * Không có hàm này thì đo được **trang rỗng**: bấm xong đo luôn thì bước 4 chưa kịp dựng,
 * `MEASURE` trả về danh sách ngắn, và "0 không đạt" trông y hệt trường hợp tốt — trong khi
 * thứ chưa từng được đo.
 */
async function waitForSelector(send, selector, label) {
  const deadline = Date.now() + 45_000
  for (;;) {
    const r = await send('Runtime.evaluate', {
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true,
    })
    if (r?.result?.value === true) return
    if (Date.now() > deadline) throw new Error(`khong thay ${selector} (${label}) sau 45s`)
    await sleep(400)
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const jwt = await token()
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

  const all = []
  try {
    for (const theme of ['light', 'dark']) {
      const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + '/')}`, {
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

      await send('Page.enable')
      await send('Network.enable')
      /*
       * Cấp quyền clipboard trước khi bấm nút sao chép.
       *
       * Không có bước này thì `navigator.clipboard.writeText` ném, trang bật cờ
       * `copyFailed`, và **toast không bao giờ xuất hiện** — nghĩa là cặp màu của toast
       * (màu mới thêm vào `wizard.css`) không được đo. Đo được thứ không sinh ra thì
       * không phải là đo.
       */
      await send('Browser.grantPermissions', {
        origin: BASE,
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      }).catch(() => { /* quyền không cấp được thì toast sẽ không hiện, sẽ thấy ở kết quả */ })
      await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: false })

      /*
       * Chặn `generate_prompt` để bước soạn đi nhánh dựng bản nháp trong trình duyệt.
       *
       * Không chặn thì lần đo này **không đo được bảng chỉ đạo**: endpoint cần token rồi
       * gọi mô hình, mất ~55 giây (AGENTS.md mục 10), trong khi kịch bản đo chỉ chờ 2,2
       * giây — bước 4 hiện `Chưa có khung hình nào để sao chép`, bảng không dựng ra, và
       * báo cáo vẫn in ra "0 không đạt". Đó chính là kiểu báo sạch giả mà brief cảnh báo:
       * trang rỗng trông giống trang sạch. Chặn endpoint là đo đúng thứ người dùng thấy,
       * và là cùng đường mà `visual-audit.mjs` đang chạy.
       */
      await send('Fetch.enable', { patterns: [{ urlPattern: '*api/wizard/generate_prompt*' }] })
      const rawOnMessage = ws.onmessage
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.method === 'Fetch.requestPaused') {
          send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'BlockedByClient' }).catch(() => { })
          return
        }
        rawOnMessage(ev)
      }
      await send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: theme }] })

      const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
        if (r?.exceptionDetails) {
          const d = r.exceptionDetails.exception?.description || r.exceptionDetails.text
          throw new Error(`bieu thuc that bai: ${String(d).split('\n')[0]}`)
        }
        return r?.result?.value
      }

      for (const locale of ['vi', 'en']) {
        const seed = `(() => {
          localStorage.setItem('novafilm.locale', ${JSON.stringify(locale)});
          localStorage.setItem('token', ${JSON.stringify(jwt)});
          return localStorage.getItem('novafilm.locale');
        })()`
        // `localStorage` trên `about:blank` ném SecurityError vì tài liệu chưa có
        // origin. Chỉ khi đó mới đi tới app một lần để lấy origin rồi ghi lại —
        // `visual-audit.mjs` làm y hệt, và bỏ nhánh này thì locale rơi về ngôn ngữ
        // trình duyệt, tức là đo nhầm bản `en` trong khi tưởng đang đo `vi`.
        try {
          await evaluate(seed)
        } catch {
          await send('Page.navigate', { url: BASE + '/' })
          await sleep(2500)
          await evaluate(seed)
        }
        await send('Page.navigate', { url: BASE + '/wizard' })
        await sleep(2500)

        // Bốn bước thật của trang, đo thêm một lần **sau khi** soạn. Nhãn trùng hệt hậu
        // tố ảnh của `visual-audit.mjs` để đối chiếu hai báo cáo không phải dịch tên.
        const walk = [
          { step: '1-anh-tham-chieu', run: null, after: '.wizard-actions .pf-btn' },
          { step: '2a-y-tuong', run: WIZARD_NEXT, after: '.wizard-textarea' },
          { step: '2b-da-soan', run: WIZARD_GENERATE, after: '.wizard-readout' },
          { step: '3-dich-den', run: WIZARD_NEXT, after: '.wizard-target-grid' },
          { step: '4-bang-chi-dao', run: WIZARD_NEXT, after: '.wizard-board-card' },
        ]
        for (const w of walk) {
          if (w.run) {
            await evaluate(w.run)
            await sleep(1800)
            await waitForSelector(send, w.after, w.step)
            await sleep(900)
          }
          const rows = await evaluate(MEASURE)
          if (!Array.isArray(rows)) throw new Error(`${theme} ${locale} buoc ${w.step}: khong co ket qua do`)
          for (const r of rows) all.push({ theme, locale, step: w.step, ...r })
          const fails = rows.filter((r) => !r.pass)
          console.log(
            `${theme.padEnd(5)} ${locale}  buoc ${w.step}  ${String(rows.length).padStart(3)} cap  ·  `
              + `${fails.length} khong dat (${fails.filter((f) => f.onArt).length} tren nen anh)`,
          )
          for (const f of fails) {
            console.log(`        ${f.ratio} < ${f.need}  ${f.el}  "${f.text}"  ${f.colorHex} tren ${f.bg}${f.onArt ? '  [nen anh]' : ''}`)
          }
        }

        /*
         * Toast chỉ tồn tại **sau khi** bấm sao chép, nên phải bấm rồi mới đo được cặp màu
         * của nó. Không làm bước này thì `wizard.css` thêm `.wizard-toast` mà không có
         * con số nào cho nó — tức là thêm CSS mà không đo, đúng điều brief cấm.
         */
        const clicked = await evaluate(`(() => {
          const btn = document.querySelector('.wizard-board-primary .pf-btn')
          if (!btn) return 'khong co nut sao chep lon'
          btn.click()
          return true
        })()`)
        await sleep(1200)
        const toastText = await evaluate(
          `(document.querySelector('.wizard-toast')?.textContent || '').trim()`,
        )
        if (clicked === true && !toastText) {
          throw new Error(`${theme} ${locale}: bam sao chep xong van khong co noi dung toast`)
        }
        if (clicked === true) {
          const toastRows = await evaluate(MEASURE)
          for (const r of toastRows.filter((x) => /wizard-toast/.test(x.el))) {
            all.push({ theme, locale, step: '5-toast', ...r })
            console.log(
              `${theme.padEnd(5)} ${locale}  toast  ${r.ratio} / can ${r.need}  ${r.pass ? 'DAT' : 'KHONG DAT'}`
                + `  ${r.colorHex} tren ${r.bg}  "${toastText.slice(0, 48)}"`,
            )
          }
        }
      }
      ws.close()
      await sleep(300)
    }
  } finally {
    killTree()
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(all, null, 2))

  const onSurface = all.filter((r) => !r.onArt)
  const fails = onSurface.filter((r) => !r.pass)
  console.log(`\nTong ${all.length} cap · tren nen phang ${onSurface.length} · khong dat AA ${fails.length}`)
  if (fails.length) {
    const byPair = {}
    for (const f of fails) {
      const key = `${f.colorHex} tren ${f.bg}`
      byPair[key] = byPair[key] || { n: 0, min: 99, need: f.need, els: new Set() }
      byPair[key].n += 1
      byPair[key].min = Math.min(byPair[key].min, f.ratio)
      byPair[key].els.add(f.el)
    }
    for (const [key, v] of Object.entries(byPair).sort((a, b) => a[1].min - b[1].min)) {
      console.log(`  ${String(v.min).padStart(6)} / can ${v.need}  x${v.n}  ${key}  ${[...v.els].slice(0, 4).join(', ')}`)
    }
  }
  console.log(`ghi ra: ${join(OUT, 'report.json')}`)
  killTree()
}

main().catch((e) => { console.error('LOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })