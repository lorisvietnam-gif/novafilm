/**
 * Đo riêng hành vi **sau khi bấm Copy** ở bước 4 của `/wizard`: vùng sống cho trình đọc
 * màn hình, việc bảng có bị dịch chuyển không, lời báo khi sao chép hỏng, và việc lời
 * báo có tự biến mất không.
 *
 *   node scripts\wizard-copy-ux-check.mjs
 *   BASE=http://127.0.0.1:5183 node scripts\wizard-copy-ux-check.mjs
 *
 * Thoát mã 0 = đạt, khác 0 = có vi phạm, in rõ từng vi phạm.
 *
 * ---- VÌ SAO CẦN RIÊNG, KHÔNG DỰA VÀO `wizard-board-check.mjs` ---------------------
 * `wizard-board-check.mjs` khẳng định **cấu trúc**: bảy thẻ, mỗi thẻ một nút, và thẻ
 * `.wizard-toast` có `role="status"` + `aria-live="polite"`. Nó **không** biết ba thứ:
 *
 *   1. Vùng sống có thật sự nằm trong cây trợ năng **lúc nó còn rỗng** không. Đó là điều
 *      kiện để thông báo được đọc: một vùng `aria-live` sinh ra hoặc hiện ra kèm nội
 *      dung thì không có gì để so sánh, nên phần lớn trình đọc màn hình im lặng.
 *   2. Bấm Copy có **đẩy bảng dịch chuyểt** không. Trước đây lời báo nằm ở đầu bước 4,
 *      nên nó chèn vào giữa lúc người dùng đang nhìn một thẻ ở hàng thứ hai.
 *   3. Lỗi sao chép có được **thông báo** không. Clipboard API cần ngữ cảnh bảo mật; trên
 *      `http` ở LAN nó bị từ chối, và đó là lỗi **quan trọng hơn** thành công.
 *
 * Ba điều đó đều đo được bằng selector và bằng cây trợ năng của Edge, nên ở đây chúng
 * được **ép** rồi **kiểm**, không đoán.
 *
 * ---- ĐO CÁCH NÀO CHỨNG MINH ĐƯỢC ĐIỀU GÌ ----------------------------------------
 *   A. `getComputedStyle` + `Accessibility.getFullAXTree` trên `.wizard-toast` khi rỗng.
 *   B. `getBoundingClientRect().top` của `.wizard-board-grid` trước và sau cú bấm.
 *   C. Ghi đè `navigator.clipboard.writeText` để **từ chối có chủ đích**, rồi đọc vùng sống.
 *   D. Cơ chế hẹn lời báo, đo trong một tab **đang ẩn**: `requestAnimationFrame` chỉ chạy
 *      trong các bước render, mà tài liệu ẩn thì không có bước render nào. Đây là
 *      điều kiện thật của trang này: người dùng bấm Copy rồi **ngay lập tức** chuyển sang
 *      tab Veo / Kling để dán — đó chính là việc trang này tồn tại để làm.
 *   E. Đọc lại vùng sống sau 6 giây: lời báo là **toast**, phải tự đi.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const OUT = resolve(HERE, '..', '.kilo', 'wizard-copy-ux')

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = (process.env.BASE || process.env.AUDIT_BASE || 'http://127.0.0.1:5183').replace(/\/$/, '')
const API = process.env.AUDIT_API || 'http://127.0.0.1:8000'
const PROFILE = join(tmpdir(), `novafilm-wizard-copy-${process.pid}`)

const PORT_MIN = Number(process.env.AUDIT_PORT_MIN || 19400)
const PORT_MAX = Number(process.env.AUDIT_PORT_MAX || 19999)
const CDP_TIMEOUT_MS = Number(process.env.AUDIT_CDP_TIMEOUT_MS || 60_000)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
const measurements = []
function require_(ok, message) {
  if (!ok) problems.push(message)
  return ok
}
function measure(id, value, note) {
  measurements.push({ id, value, note })
  console.log(`  ${id.padEnd(6)} ${String(value).padEnd(12)} ${note || ''}`)
}

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
    } catch { /* trống */ }
    return port
  }
  throw new Error('Khong tim duoc cong debug.')
}

let EDGE_HANDLE = null

function killTree() {
  if (EDGE_HANDLE) {
    try {
      execFileSync('taskkill', ['/PID', String(EDGE_HANDLE.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch { /* thường không ăn — xem wizard-board-check.mjs */ }
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

async function token() {
  const headers = { 'Content-Type': 'application/json' }
  const body = JSON.stringify({ email: 'board-audit@novafilm.probe', password: 'Audit-2026-x', nickname: 'audit' })
  const call = async (path) => (await fetch(`${API}${path}`, { method: 'POST', headers, body })).json()
  try { return (await call('/api/auth/register')).access_token }
  catch { return (await call('/api/auth/login')).access_token }
}

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

/** Nút Copy của thẻ "Ánh sáng" — thẻ nằm ở **hàng thứ hai**, nên lời báo chèn ở đầu là rõ nhất. */
const COPY_LIGHTING = `(() => {
  const btn = document.querySelector('.wizard-board-card[data-field="lighting"] .pf-btn')
  if (!btn) throw new Error('khong tim thay nut Copy cua the Anh sang')
  const box = btn.getBoundingClientRect()
  btn.click()
  return { row: Math.round(box.top) }
})()`

/** Trạng thái vùng sống lúc **rỗng**, cộng vị trí của lưới bảng. */
const READ_EMPTY = `(() => {
  const el = document.querySelector('.wizard-toast')
  const grid = document.querySelector('.wizard-board-grid')
  if (!el) return { missing: true }
  const cs = getComputedStyle(el)
  const rect = el.getBoundingClientRect()
  return {
    missing: false,
    display: cs.display,
    visibility: cs.visibility,
    height: Math.round(rect.height),
    role: el.getAttribute('role'),
    live: el.getAttribute('aria-live'),
    text: (el.textContent || '').trim(),
    gridTop: grid ? Math.round(grid.getBoundingClientRect().top + window.scrollY) : null,
  }
})()`

/** Sau cú bấm: lời báo có hiện không, và bảng có bị đẩy không. */
const READ_AFTER = `(() => {
  const el = document.querySelector('.wizard-toast')
  const grid = document.querySelector('.wizard-board-grid')
  const rect = el ? el.getBoundingClientRect() : null
  return {
    text: el ? (el.textContent || '').trim() : null,
    height: rect ? Math.round(rect.height) : null,
    position: el ? getComputedStyle(el).position : null,
    gridTop: grid ? Math.round(grid.getBoundingClientRect().top + window.scrollY) : null,
  }
})()`

/**
 * Cơ chế hẹn lời báo, đo **trong tab đang ẩn**.
 *
 * Sao chép lại đúng một dòng đang được kiểm — `setToast('')`, rồi hẹn lần gán kế tiếp —
 * nhưng không đi qua React và **không** đi qua clipboard. Cần thế vì khi tab bị ẩn thì tài
 * liệu mất tiêu điểm và `clipboard.writeText` sẽ ném lỗi, lúc đó không phân biệt được lỗi
 * của lịch hẹn với lỗi của clipboard. Ở đây chỉ cần biết **cái gì được hẹn** thì có chạy
 * trong tab ẩn hay không.
 */
const ARM_PROBE = (mode) => `(() => {
  window.__probe = ''
  window.__probeKind = ${JSON.stringify(mode)}
  const setToast = (v) => { window.__probe = v }
  const announce = (m) => {
    setToast('')
    ${mode === 'raf'
      ? 'window.requestAnimationFrame(() => setToast(m))'
      : 'window.setTimeout(() => setToast(m), 60)'}
  }
  announce('LOI_BAO')
  return { armed: true, visibility: document.visibilityState }
})()`

const READ_PROBE = `(() => ({
  value: window.__probe,
  visibility: document.visibilityState,
  rafSeen: window.__rafSeen || 0,
}))()`

/**
 * Câu toast mà brief `case-prompt-board-finish-b2` mục 3 **chốt nguyên văn** cho nút
 * "Sao chép tất cả".
 *
 * Chỗ này ép **nguyên văn** vì đó là điều brief yêu cầu — nhưng "chép lại đúng một câu"
 * mà không kiểm thì chỉ là lời hứa trong commit message. Màu đậm của yêu cầu là **không**
 * hứa hệ thống đang render: không có API video nào chạy được, nên "sẵn sàng render" ở đây
 * là **prompt** sẵn sàng, không phải NOVAFILM đang quay.
 */
const COPY_ALL_TOAST_VI = 'Đã chép Prompt cấu hình, sẵn sàng render!'

const COPY_ALL = `(() => {
  const btn = document.querySelector('.wizard-board-primary .pf-btn')
  if (!btn) throw new Error('khong tim thay nut Copy tat ca')
  btn.click()
  return true
})()`

/** Ghi đè clipboard để **từ chối có chủ đích** — đo nhánh lỗi thay vì đoán. */
const BREAK_CLIPBOARD = `(() => {
  Object.defineProperty(navigator.clipboard, 'writeText', {
    configurable: true,
    value: () => Promise.reject(new DOMException('blocked by probe', 'NotAllowedError')),
  })
  return typeof navigator.clipboard.writeText
})()`

const RESTORE_CLIPBOARD = `(() => {
  delete navigator.clipboard.writeText
  return typeof navigator.clipboard.writeText
})()`

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

/** Có nút nào của `.wizard-toast` nằm trong cây trợ năng không. */
async function inAxTree(send) {
  const tree = await send('Accessibility.getFullAXTree')
  return (tree?.nodes || []).some((n) => {
    const name = (n.name?.value || '')
    const role = (n.role?.value || '')
    return role === 'status' || /wizard-toast|Đã sao chép|LOI_BAO/.test(name)
  })
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

  const tabs = []
  let ws
  try {
    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, {
      method: 'PUT', signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
    })).json()
    tabs.push(tab.id)
    ws = new WebSocket(tab.webSocketDebuggerUrl)
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
      if (r?.exceptionDetails) {
        throw new Error(`bieu thuc that bai: ${String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]}`)
      }
      return r?.result?.value
    }
    const shoot = async (name) => {
      const metrics = await send('Page.getLayoutMetrics')
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: {
          x: 0, y: 0,
          width: Math.ceil(metrics?.cssContentSize?.width || 1440),
          height: Math.min(Math.ceil(metrics?.cssContentSize?.height || 1000), 4000),
          scale: 1,
        },
      })
      if (!shot?.data) return
      writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'))
    }

    await send('Page.enable')
    await send('Accessibility.enable')
    await send('Network.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

    // Chặn endpoint soạn prompt để bước 2 dựng bản nháp trong trình duyệt — cùng lý do
    // và cùng cách như `wizard-board-check.mjs`: gọi mô hình thật mất ~55 giây.
    await send('Fetch.enable', { patterns: [{ urlPattern: '*api/wizard/generate_prompt*' }] })
    const raw = ws.onmessage
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.method === 'Fetch.requestPaused') {
        send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'BlockedByClient' }).catch(() => { })
        return
      }
      raw(ev)
    }

    const seed = `(() => {
      localStorage.setItem('novafilm.locale', 'vi');
      localStorage.setItem('token', ${JSON.stringify(jwt)});
      return true;
    })()`
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(2500)
    await evaluate(seed)
    await send('Page.navigate', { url: BASE + '/wizard' })
    await waitForSelector(send, '.wizard-actions .pf-btn', 'buoc 1')

    for (const w of [WIZARD_NEXT, WIZARD_GENERATE, WIZARD_NEXT, WIZARD_NEXT]) {
      await evaluate(w)
      await sleep(1500)
    }
    await waitForSelector(send, '.wizard-board-card', 'bang chi dao')
    await sleep(800)
    await send('Browser.grantPermissions', {
      origin: BASE, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    }).catch(() => { })

    /* --- A: vùng sống lúc rỗng ---------------------------------------------- */
    console.log('\nA. Vung song luc RONG')
    const empty = await evaluate(READ_EMPTY)
      const axEmpty = await inAxTree(send)
    if (empty.missing) {
      require_(false, 'A: khong tim thay .wizard-toast')
    } else {
      measure('display', empty.display, `chi cao ${empty.height}px · axTree=${axEmpty}`)
      require_(
        empty.display !== 'none',
        `A: vung song bi \`display: ${empty.display}\` khi rong, nen no khong co trong cay tro nang`
          + ' — thong bao cua aria-live se khong duoc doc',
      )
      require_(axEmpty, 'A: vung song khong co trong cay tro nang luc rong')
      require_(empty.role === 'status' && empty.live === 'polite', 'A: thieu role="status" + aria-live="polite"')
    }
    await shoot('a-rong')

    /* --- B: bảng có bị đẩy khi lời báo hiện --------------------------------- */
    console.log('\nB. Bang co bi DAY khi loi bao hien')
    const before = empty.gridTop
    const clicked = await evaluate(COPY_LIGHTING)
    await sleep(700)
    const after = await evaluate(READ_AFTER)
    const shift = after.gridTop == null || before == null ? null : after.gridTop - before
    measure('shift', shift == null ? '?' : `${shift}px`, `nut Copy nam o hang ${clicked?.row}px · toast ${after.height}px · position:${after.position}`)
    require_(shift === 0, `B: bang chuyen ${shift}px khi loi bao hien — nguoi dung dang nhin the o hang thu hai bi day`)
    require_(!!after.text, 'B: bam Copy xong vung song van rong')
    console.log(`       vung song: "${after.text}"`)
    await shoot('b-sau-khi-copy')

    /* --- C: lời báo tự đi sau một khoảng ------------------------------------ */
    console.log('\nC. Loi bao tu di')
    await sleep(6000)
    const later = await evaluate(READ_AFTER)
    measure('sau6s', later.text ? 'con' : 'da di', `do dai ${later.text ? later.text.length : 0}`)
    require_(!later.text, 'C: sau 6 giay loi bao van con — day la mot banner, khong phai toast')
    const gridAfterDismiss = later.gridTop
    require_(
      gridAfterDismiss === after.gridTop,
      `C: khi loi bao di, bang lai nhay ${after.gridTop - gridAfterDismiss}px`,
    )
    await shoot('c-sau-6s')

    /* --- D: co che hen loi bao khi tab AN ----------------------------------- */
    console.log('\nD. Co che hen loi bao khi tab AN')
    for (const mode of ['raf', 'timer']) {
      const armed = await evaluate(ARM_PROBE(mode))
      require_(
        armed?.armed === true,
        `D: probe (${mode}) khong len duoc — cai do khong phai loi cua trang, la loi cua phep do`,
      )
      const other = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, {
        method: 'PUT', signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
      })).json()
      tabs.push(other.id)
      await sleep(1600)
      const probe = await evaluate(READ_PROBE)
      measure(mode, probe.value || 'khong chay', `visibility=${probe.visibility}`)
      if (mode === 'raf') {
        require_(
          probe.value === 'LOI_BAO',
          'D: requestAnimationFrame khong chay khi tab an — trang nay dung nhung dung ban '
            + 'dien hinh nguoi dung chuyen sang tab khau ngay sau khi bam Copy',
        )
      } else {
        require_(probe.value === 'LOI_BAO', 'D: setTimeout cung khong chay khi tab an')
      }
      await fetch(`http://127.0.0.1:${port}/json/close/${other.id}`).catch(() => { })
      await sleep(300)
    }

    /* --- E: nhanh loi bao khi sao chep that bai -------------------------------- */
    console.log('\nE. Loi bao khi sao chep THAT BAI')
    await evaluate(BREAK_CLIPBOARD)
    await evaluate(COPY_LIGHTING)
    await sleep(900)
    const failed = await evaluate(READ_AFTER)
    measure('loi', failed.text ? 'co' : 'khong', failed.text ? `"${failed.text}"` : 'vung song rong')
    require_(!!failed.text, 'E: sao chep that bai ma vung song rong — nguoi dung mu/hinh khong bao gi')
    console.log(`       ghi chu hien tren trang: "${await evaluate(`(document.querySelector('.wizard-draft-note')?.textContent || '').trim()`)}"`)
    await shoot('e-loi')
    await evaluate(RESTORE_CLIPBOARD)

    /* --- F: hop dong selector cua audit -------------------------------------- */
    console.log('\nF. Hop dong selector')
    const contract = await evaluate(`(() => ({
      actionLabels: [...document.querySelectorAll('.wizard-actions .pf-btn')].map((b) => b.textContent.trim()),
      copyInActions: document.querySelectorAll('.wizard-actions .pf-btn[aria-label*=" Sao ch"]').length,
      toastStillPresent: !!document.querySelector('.wizard-toast'),
    }))()`)
    measure('actions', contract.actionLabels.join(' | '), `nut sao chep lot vao actions: ${contract.copyInActions}`)
    require_(contract.actionLabels.length === 1, `F: .wizard-actions phai chi con 1 nut, hien ${contract.actionLabels.length}`)
    require_(contract.copyInActions === 0, 'F: co nut sao chep lot vao .wizard-actions')
    require_(contract.toastStillPresent, 'F: vung song bi thao khoi DOM')

    /*
     * G: câu chữ brief chốt cho nút lớn. Đo sau khi C đã xác nhận vùng sống trống và sau
     * khi clipboard đã được khôi phục, nên đây là cú bấm sạch đầu tiên của nhánh thành công.
     */
    console.log('\nG. Cau toast cua nut Copy tat ca')
    await evaluate(COPY_ALL)
    await sleep(700)
    const allToast = await evaluate(READ_AFTER)
    measure('all', allToast.text ? 'co' : 'khong', `"${allToast.text}"`)
    require_(!!allToast.text, 'G: bam Copy tat ca xong vung song van rong')
    require_(
      allToast.text === COPY_ALL_TOAST_VI,
      `G: toast cua nut lon sai nguoi văn.\n       brief  : "${COPY_ALL_TOAST_VI}"\n       hien tai: "${allToast.text}"`,
    )
    require_(
      !/đang (tạo|render|quay)/i.test(allToast.text || ''),
      `G: toast hua NOVAFILM dang render — khong co API video nao chay duoc: "${allToast.text}"`,
    )
    await shoot('g-copy-tat-ca')
  } finally {
    if (ws) ws.close()
    for (const t of tabs) {
      await fetch(`http://127.0.0.1:${port}/json/close/${t}`).catch(() => { })
    }
    killTree()
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ measurements, problems }, null, 2))
  if (problems.length) {
    console.error(`\n${problems.length} VI PHAM:`)
    for (const p of problems) console.error(`  - ${p}`)
    killTree()
    process.exit(1)
  }
  console.log('\nDAT: vung song, do lech bang, loi bao that bai, va viec tu tat deu dung.')
  console.log(`ghi ra: ${join(OUT, 'report.json')}`)
  killTree()
}

main().catch((e) => { console.error('LOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })