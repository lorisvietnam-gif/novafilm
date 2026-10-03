/**
 * Kiểm chứng bước 4 của `/wizard`: bảng chỉ đạo, nút Copy từng thẻ, toast cho trình đọc
 * màn hình, và **tính toàn vẹn của bảng**.
 *
 *   node scripts\wizard-board-check.mjs
 *   BASE=http://127.0.0.1:5183 node scripts\wizard-board-check.mjs
 *
 * Thoát mã 0 = đạt, khác 0 = có vi phạm, in rõ từng vi phạm.
 *
 * ---- VÌ SAO CẦN RIÊNG, KHÔNG CHỈ DỰA VÀO `visual-audit.mjs` ---------------------
 * `visual-audit.mjs` **đo** (đếm ký tự Trung, bắt lỗi JS, chụp ảnh) nhưng không
 * **khẳng định** gì về bảng: nó không biết có đúng bảy thẻ không, mỗi thẻ có nút Copy
 * không, toast có `role="status"` không, và quan trọng nhất là các thẻ có **giữ được mọi
 * mệnh đề** không. Đây là những điều kiện nghiệm thu của brief, nên cần một lượt chạy
 * **ép** rồi **kiểm**.
 *
 * ---- VÌ SAO ẢNH CHỤP Ở ĐÂY, KHÔNG LẤY TỪ `visual-audit.mjs` ----------------------
 * Ảnh bước 4 của `visual-audit.mjs` **không có bảng** — nó chụp lúc bước 4 còn rỗng.
 * Lý do đo được: `WIZARD_GENERATE` bấm "soạn", endpoint thật tồn tại và cần token, nên nó
 * gọi mô hình; còn `waitForSettled` chỉ chờ văn bản **đứng yên** vài nhịp, mà trong lúc
 * chờ mạng thì văn bản vẫn đứng yên nên nó kết luận "trang đã ổn định" và chụp ảnh. Rồi
 * hai lần bấm "Tiếp tục" đưa sang bước 4 trước khi lệnh gọi quay về. Ảnh đó đúng với
 * điều kiện đo của nó, nhưng nó **không** là bằng chứng cho bảng.
 *
 * Vì vậy script này chụp lại cả bốn bước, hai theme, hai locale — và chặn endpoint để
 * bảng dựng ra thật. Đây là ảnh để **nhìn**, nhưng khả năng kiểm chứng thì ở phần assert
 * bên dưới, không nhờ vào mắt.
 *
 * Bốn hợp đồng được giữ, đều kiểm bằng selector chứ không bằng mắt:
 *  1. `.wizard-actions .pf-btn` — nút cuối là "Tiếp tục" (audit bấm nút này bốn lần).
 *  2. `.wizard-textarea` — ô ý tưởng ở bước 2.
 *  3. `.wizard-generate` — nút soạn ở bước 2.
 *  4. Không nút sao chép nào được nằm trong `.wizard-actions` (xem `wizard.css`).
 *
 * ---- BẤT BIẾN CỦA BẢNG ---------------------------------------------------------
 * Mỗi trường của prompt phải nằm ở **đúng thẻ của nó**, đúng một lần. Bảng sinh ra để
 * người dùng cắm một đoạn; một trường rơi khỏi bảng là một đoạn họ không bao giờ lấy được,
 * và một trường nằm ở hai thẻ là hai thẻ nói cùng một điều — bấm Copy ở đâu ra chỗ đó.
 * Script này đo lại điều đó trên DOM đang render, không tin lời khai của mã nguồn. Chi tiết
 * ba cách đo nằm ở `COVERAGE` bên dưới.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const OUT = resolve(HERE, '..', '.kilo', 'wizard-board')

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = (process.env.BASE || process.env.AUDIT_BASE || 'http://127.0.0.1:5183').replace(/\/$/, '')
const API = process.env.AUDIT_API || 'http://127.0.0.1:8000'
const PROFILE = join(tmpdir(), `novafilm-wizard-board-${process.pid}`)

const PORT_MIN = Number(process.env.AUDIT_PORT_MIN || 19400)
const PORT_MAX = Number(process.env.AUDIT_PORT_MAX || 19999)
const CDP_TIMEOUT_MS = Number(process.env.AUDIT_CDP_TIMEOUT_MS || 60_000)

const EXPECTED_FIELDS = ['subject', 'action', 'setting', 'camera', 'lighting', 'style', 'duration']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
function require_(ok, message) {
  if (!ok) problems.push(message)
  return ok
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
  } catch { /* không dọn được thì không chặn */ }
  for (let i = 0; i < 5; i += 1) {
    try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 }) } catch { /* thử lại */ }
  }
}

process.on('exit', killTree)
process.on('uncaughtException', (e) => { console.error('LOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error('PROMISE BI TU CHOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })

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
 * Bất biến của bảng, đo lại từ DOM đang render.
 *
 * Bản trước đây quét **từ khoá** trong văn xuôi nên một câu tiếng Việt dài rơi vào ba thẻ
 * cùng lúc; bấm "Sao chép" ở ô nào cũng ra cùng một câu. Nay backend tách sẵn
 * (`normalize_prompt()` ở `prompt_writer.py`): mỗi dòng prompt là `nhãn: giá trị`, và bảng
 * chỉ đọc nhãn. Nên bất biến cần đo **không phải** "mệnh đề không rơi khỏi bảng" — đó là bất
 * biến của thiết kế cũ — mà là ba điều sau, và cả ba đều đo được trên DOM:
 *
 *   1. **lost**      — mỗi cặp `nhãn: giá trị` trong prompt phải xuất hiện ở đúng thẻ của nó.
 *   2. **misplaced** — một giá trị thuộc nhãn X không được nằm ở thẻ `data-field != X`.
 *   3. **duplicated**— cùng một giá trị không được xuất hiện ở hai thẻ khác nhau.
 *
 * Điểm 2 và 3 chính là lỗi mà bản cũ mắc, và cả hai đều **đo** được chứ không suy ra: nếu bảng
 * dán nội dung ô khác vào ô trống thì chúng bắt được. Nguyên tắc của brief là thừa trống còn
 * hơn bịa, nên ô trống phải được phép — còn ô trùng thì phải fail.
 *
 * Cắt lại ở đây bằng regex riêng là cố ý: dùng lại hàm của mã nguồn thì chỉ chứng minh mã
 * nguồn tự nhất quán với chính nó.
 */
const COVERAGE = `(() => {
  const LABEL = /^\\s*(?:[-*\\u2022]\\s*)?(?:\\*\\*)?([a-z][a-z ]*?)(?:\\*\\*)?\\s*[:\\uff1a]\\s*/i
  const FIELDS = ['subject', 'action', 'setting', 'camera', 'lighting', 'style', 'duration']
  const declared = []
  for (const raw of document.querySelectorAll('.wizard-frame-prompt')) {
    for (const line of (raw.textContent || '').split('\\n')) {
      const t = line.trim()
      if (!t) continue
      const m = LABEL.exec(t)
      if (!m) continue
      const label = m[1].replace(/\\s+/g, ' ').trim().toLowerCase()
      const value = t.slice(m[0].length).trim()
      if (FIELDS.includes(label) && value) declared.push({ field: label, value })
    }
  }

  const cards = [...document.querySelectorAll('.wizard-board-card')].map((c) => ({
    field: c.dataset.field || null,
    values: [...c.querySelectorAll('.wizard-board-value')].map((v) => v.textContent.trim()),
  }))
  const where = new Map()
  for (const card of cards) for (const v of card.values) {
    if (!where.has(v)) where.set(v, [])
    where.get(v).push(card.field)
  }

  const lost = []
  const misplaced = []
  const duplicated = []
  for (const { field, value } of declared) {
    /*
     * So **thẻ khác nhau**, không phải số ô: model viết cùng một chủ thể cho cả ba khung là
     * đúng (cùng một nhân vật), và đó là ba ô *trong cùng một thẻ*. Đếm ô thì bản kiểm này
     * sẽ báo trùng oan mỗi lần chạy với kết quả thật của mô hình.
     */
    const hosts = [...new Set(where.get(value) || [])]
    if (!hosts.includes(field)) {
      (hosts.length ? misplaced : lost).push(field + '=' + value + (hosts.length ? ' -> ' + hosts.join('+') : ''))
    }
    if (hosts.length > 1) duplicated.push(value + ' -> ' + hosts.join('+'))
  }
  return { total: declared.length, lost, misplaced, duplicated }
})()`

/**
 * Chờ một selector xuất hiện.
 *
 * Không có hàm này thì lượt chạy có thể chụp ảnh trang **chưa dựng xong** rồi báo đạt —
 * cùng cái bẫy đã làm ảnh bước 4 của `visual-audit.mjs` trống: đo cái rỗng rồi tưởng đạt.
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

/** Kiểm trạng thái bước 4. `tag` là nhãn để khi hỏng thì biết ngay đang ở locale/theme nào. */
function verify(board, covered, tag) {
  const { cards } = board
  require_(board.cardCount === 7, `${tag} bang co ${board.cardCount} the, phai co 7`)
  const fields = cards.map((c) => c.field)
  require_(
    JSON.stringify(fields) === JSON.stringify(EXPECTED_FIELDS),
    `${tag} thu tu truong sai: ${fields.join(',')}`,
  )
  for (const card of cards) {
    require_(!!card.label, `${tag} the ${card.field} khong co nhan`)
    require_(card.hasCopy, `${tag} the ${card.field} khong co nut Copy rieng`)
    require_(
      card.copyDisabled === card.isEmpty,
      `${tag} the ${card.field}: nut Copy ${card.copyDisabled ? 'tat' : 'bat'} nhung the ${card.isEmpty ? 'rong' : 'co noi dung'}`,
    )
    require_(card.values.length > 0, `${tag} the ${card.field} khong hien gi`)
  }

  require_(board.primaryCopyButtons === 1, `${tag} nut Copy lon phai co dung 1, hien ${board.primaryCopyButtons}`)
  require_(board.toastExists, `${tag} khong co vung toast`)
  require_(board.toastRole === 'status', `${tag} toast thieu role="status" (hien: ${board.toastRole})`)
  require_(board.toastLive === 'polite', `${tag} toast thieu aria-live="polite" (hien: ${board.toastLive})`)

  require_(
    covered && covered.total > 0,
    `${tag} khong tach duoc truong nao tu prompt — bang rong, co phai \`generate_prompt\` bi chan roi khong tach lai?`,
  )
  require_(
    covered && covered.lost.length === 0,
    `${tag} ${covered ? covered.lost.length : '?'} truong roi khoi the cua no, vi du: ${covered ? covered.lost.join(' / ') : ''}`,
  )
  require_(
    covered && covered.misplaced.length === 0,
    `${tag} ${covered ? covered.misplaced.length : '?'} gia tri nam o sai the, vi du: ${covered ? covered.misplaced.join(' / ') : ''}`,
  )
  require_(
    covered && covered.duplicated.length === 0,
    `${tag} ${covered ? covered.duplicated.length : '?'} gia tri bi danh o nhieu the, vi du: ${covered ? covered.duplicated.join(' / ') : ''}`,
  )

  // Hợp đồng DOM: các selector audit bấm phải còn, và `.wizard-actions` không được nuốt
  // thêm nút sao chép nào — nút cuối trong đó phải luôn là "Tiếp tục".
  require_(board.textareas === 0, `${tag} con .wizard-textarea o buoc 4`)
  require_(board.generateButtons === 0, `${tag} con .wizard-generate o buoc 4`)
  require_(board.frameCards > 0, `${tag} khong con the khung nao`)
  require_(
    board.actionButtonLabels.length === 1,
    `${tag} .wizard-actions phai chi con 1 nut o buoc 4, hien ${board.actionButtonLabels.length}`,
  )

  const filled = cards.filter((c) => !c.isEmpty).map((c) => `${c.field}=${c.values.join(' | ')}`)
  const empties = cards.filter((c) => c.isEmpty).map((c) => c.field)
  console.log(
    `${tag} 7 the · ${filled.length} co noi dung · nut lon ${board.primaryCopyButtons}`
      + ` · toast ${board.toastRole}/${board.toastLive}`
      + ` · truong ${covered ? `${covered.total - covered.lost.length}/${covered.total}` : '?'} dung the cua no`,
  )
  for (const f of filled) console.log(`       ${f}`)
  console.log(`       rong (nut Copy tat): ${empties.join(', ') || '(khong co)'}`)
  if (covered && (covered.lost.length || covered.misplaced.length || covered.duplicated.length)) {
    for (const v of covered.lost) console.log(`       MAT: ${v}`)
    for (const v of covered.misplaced) console.log(`       SAI THE: ${v}`)
    for (const v of covered.duplicated) console.log(`       TRUNG: ${v}`)
  }
}

/** Đọc trạng thái bảng từ DOM đang render. Không giữ bản sao ở Node. */
const READ_BOARD = `(() => {
  const cards = [...document.querySelectorAll('.wizard-board-card')]
  const live = document.querySelector('.wizard-toast')
  const actionBtns = [...document.querySelectorAll('.wizard-actions .pf-btn')]
  return {
    cardCount: cards.length,
    cards: cards.map((c) => ({
      field: c.dataset.field || null,
      label: (c.querySelector('.wizard-board-label')?.textContent || '').trim(),
      values: [...c.querySelectorAll('.wizard-board-value')].map((v) => v.textContent.trim()),
      hasCopy: !!c.querySelector('.wizard-board-card-head .pf-btn'),
      copyDisabled: !!c.querySelector('.wizard-board-card-head .pf-btn')?.disabled,
      isEmpty: c.classList.contains('is-empty'),
    })),
    primaryCopyButtons: document.querySelectorAll('.wizard-board-primary .pf-btn').length,
    toastExists: !!live,
    toastRole: live ? live.getAttribute('role') : null,
    toastLive: live ? live.getAttribute('aria-live') : null,
    copyButtonsInsideActions: [...document.querySelectorAll('.wizard-actions .pf-btn')]
      .filter((b) => !b.textContent.trim()).length,
    actionButtonLabels: actionBtns.map((b) => b.textContent.trim()),
    actionButtonCount: actionBtns.length,
    frameCards: document.querySelectorAll('.wizard-frame').length,
    textareas: document.querySelectorAll('.wizard-textarea').length,
    generateButtons: document.querySelectorAll('.wizard-generate').length,
  }
})()`

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

  try {
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
      if (r?.exceptionDetails) {
        throw new Error(`bieu thuc that bai: ${String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]}`)
      }
      return r?.result?.value
    }

    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

    /** Chụp toàn trang, tên `<locale>-<theme>-<buoc>.png`. */
    const shoot = async (locale, theme, step) => {
      const metrics = await send('Page.getLayoutMetrics')
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: Math.ceil(metrics?.cssContentSize?.width || 1440),
          height: Math.min(Math.ceil(metrics?.cssContentSize?.height || 1000), 4000),
          scale: 1,
        },
      })
      if (!shot?.data) return
      const file = join(OUT, `${locale}-${theme}-${step}.png`)
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      console.log(`       anh chup: ${file}`)
    }

    // Chặn endpoint để bước 2 đi nhánh dựng bản nháp trong trình duyệt — cùng lý do và
    // cùng cách như `wizard-cls-check.mjs`, xem chú thích ở đó.
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

    /*
     * Bốn bước thật của trang. Nhãn trùng hệt hậu tố ảnh của `visual-audit.mjs` để đối
     * chiếu hai báo cáo không phải dịch tên. `after` là selector **phải** xuất hiện —
     * không có nó thì lượt chạy có thể chụp ảnh một trang rỗng rồi báo đạt, đúng cái bẫy
     * đã ghi trong chú thích đầu file.
     */
    const WALK = [
      { step: '1-anh-tham-chieu', run: null, after: '.wizard-actions .pf-btn' },
      { step: '2-y-tuong', run: WIZARD_NEXT, after: '.wizard-textarea' },
      { step: '3-da-soan', run: WIZARD_GENERATE, after: '.wizard-readout' },
      { step: '4-dich-den', run: WIZARD_NEXT, after: '.wizard-target-grid' },
      { step: '5-bang-chi-dao', run: WIZARD_NEXT, after: '.wizard-board-card' },
    ]

    for (const theme of ['light', 'dark']) {
      await send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{ name: 'prefers-color-scheme', value: theme }],
      })

      for (const locale of ['vi', 'en']) {
        const seed = `(() => {
          localStorage.setItem('novafilm.locale', ${JSON.stringify(locale)});
          localStorage.setItem('token', ${JSON.stringify(jwt)});
          return true;
        })()`
        try { await evaluate(seed) } catch {
          await send('Page.navigate', { url: BASE + '/' })
          await sleep(2500)
          await evaluate(seed)
        }
        await send('Page.navigate', { url: BASE + '/wizard' })
        await sleep(2500)

        let board = null
        for (const w of WALK) {
          if (w.run) {
            await evaluate(w.run)
            await sleep(1800)
            await waitForSelector(send, w.after, `${locale} ${theme} ${w.step}`)
            await sleep(800)
          }
          await shoot(locale, theme, w.step)
          if (w.step === '5-bang-chi-dao') {
            board = await evaluate(READ_BOARD)
            const covered = await evaluate(COVERAGE)
            if (!board) throw new Error(`${locale} ${theme}: khong doc duoc trang`)
            verify(board, covered, `${locale} ${theme}`)

            /*
             * Chụp thêm một ảnh **sau khi bấm sao chép** — toast chỉ tồn tại ở trạng thái đó,
             * nên ảnh bốn bước ở trên không chứng minh được toast đã hiện ra thật.
             */
            await send('Browser.grantPermissions', {
              origin: BASE,
              permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
            }).catch(() => { })
            await evaluate(`(() => {
              const btn = document.querySelector('.wizard-board-card[data-field="lighting"] .pf-btn')
              if (!btn) throw new Error('khong tim thay nut sao chep cua the Anh sang')
              btn.click()
              return true
            })()`)
            await sleep(1000)
            const toastText = await evaluate(
              `(document.querySelector('.wizard-toast')?.textContent || '').trim()`,
            )
            require_(
              !!toastText,
              `${locale} ${theme}: bam sao chep xong toast van rong — clipboard bi tu choi?`,
            )
            console.log(`       toast: "${toastText}"`)
            await shoot(locale, theme, '6-toast')
          }
        }
      }
    }
    ws.close()
  } finally {
    killTree()
  }

  if (problems.length) {
    console.error(`\n${problems.length} VI PHAM:`)
    for (const p of problems) console.error(`  - ${p}`)
    killTree()
    process.exit(1)
  }
  console.log('\nDAT: bang chI dao, nut Copy tung the, va vung doc man hinh deu dung.')
  killTree()
}

main().catch((e) => { console.error('LOI:', e?.stack || e?.message || e); killTree(); process.exit(1) })