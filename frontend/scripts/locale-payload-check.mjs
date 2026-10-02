/**
 * Đo xem các lời gọi **sinh kịch bản** có mang ngôn ngữ đang hiện trên giao diện không.
 *
 * Vì sao cần script riêng:
 *
 * 1. `npm run build` chỉ chứng minh nó **biên dịch được**. Nó không nói gì về nội dung
 *    của request. Đếm bằng mắt trong mã nguồn cũng không đủ — cùng cái sai đó đã xảy ra
 *    với `dramaImageStyles.ts` (build xanh, trang trắng).
 * 2. Yêu cầu của brief là một khẳng định **có/không** về **payload**: "bấm nút tạo kịch
 *    bản ở `vi` ⇒ payload có `locale: "vi"`". Nên phải chặn request thật và đọc
 *    `postData` của nó.
 *
 * Cách đo:
 *
 * - Edge headless + CDP, y hệt `visual-audit.mjs` / `wizard-error-check.mjs`. Không cài
 *   thêm gì.
 * - `Fetch.requestPaused` chặn **đúng 4 endpoint sinh kịch bản** và đọc
 *   `request.postData` — tức là đọc đúng những gì backend sẽ nhận.
 * - Chặn ở `Request` stage rồi **tự trả lời** bằng dữ liệu giả. Nhờ vậy lượt chạy này
 *   **không** gọi LLM, **không** trừ credit và **không** đẩy database đi xa. Đây là điều
 *   kiện để chạy được: nếu để request đi thật thì mỗi lượt tốn tiền và để rác trong DB.
 * - Mỗi endpoint được bắn bởi đúng **luồng UI thật**:
 *     - `/api/content/expand`      → bấm nút `.pf-btn-ai` ở `/studio/new`
 *     - `/api/projects/{id}/generate` → bấm `.pf-btn-lime.pf-btn-lg` ở `/studio/{id}/style`
 *     - `drama/agents/script_summary` → `OutlineStep` **tự chạy** khi mount
 *       (`OutlineStep.tsx:198-274`) với project drama còn trống, nên chỉ cần vào trang
 *     - `drama/agents/episode_script` → tiếp theo, vì tóm tắt giả báo `completed` còn
 *       `episode_content` rỗng nên `autoMissingEpisodeCount` > 0 và pipeline gọi tiếp
 *
 * Chạy:
 *   npm run check:locale
 *
 * Biến môi trường:
 *   BASE=http://127.0.0.1:5183   dev server của lane này (mặc định :5183)
 *   API=http://127.0.0.1:8000    backend (mặc định :8000)
 *
 * Thoát mã 0 = mọi endpoint gửi đúng locale ở mọi locale đã thử; khác 0 = có vi phạm.
 *
 * Endpoint nào **không** bắn được request thì tính là SAI chứ không phải bỏ qua — không
 * có khoảng trống nào được giấu âm thầm.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5183'
const API = process.env.API || 'http://127.0.0.1:8000'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

/** Tài khoản riêng cho lượt kiểm này, không dùng chung tài khoản của `visual-audit`. */
const PROBE = { email: 'board-locale@novafilm.probe', password: 'Locale-2026-x' }

/** Các locale cần đo. Brief yêu cầu `vi` và `en`; `zh` thêm vào để chắc payload bám theo
 *  giao diện chứ không phải bám theo một giá trị cứng. */
const LOCALES = ['vi', 'en', 'zh']

/** Bốn endpoint sinh kịch bản, key là nhãn dùng trong báo cáo. */
const ENDPOINTS = {
  contentExpand: '/api/content/expand',
  studioGenerate: '/api/projects/{id}/generate',
  scriptSummary: '/api/drama/agents/script_summary',
  episodeScript: '/api/drama/agents/episode_script',
}

/**
 * Regex khớp pathname cho từng endpoint.
 *
 * Dùng regex chứ không phải `endsWith`: `/api/projects/{id}/generate` có **id động** ở
 * giữa, nên so chuỗi hậu tố không bao giờ khớp (`/api/projects//generate` là của chính nó).
 * Sai lần đầu: `studioGenerate` không bao giờ được chặn, và kịch bản vẫn chạy "thành công"
 * vì đơn giản là không có gì để kiểm.
 */
const ENDPOINT_MATCHERS = Object.entries(ENDPOINTS).map(([key, sample]) => [
  key,
  new RegExp(`^${sample.replace(/\{[a-z]+\}/g, '[^/]+')}$`),
])

/** `document.documentElement.lang` — giá trị HTML, khác mã locale ở `zh`. */
const LOCALE_HTML = { vi: 'vi', en: 'en', zh: 'zh-CN' }

const CDP_TIMEOUT_MS = 60_000
const PROFILE_ROOT = join(tmpdir(), `novafilm-locale-check-edge-${process.pid}`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ *
 * Dữ liệu thật cần để các trang có `:id` render được
 * ------------------------------------------------------------------ */

async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

/** Backend trả `{ items: [...] }` chứ không phải mảng thuần (`visual-audit.mjs`). */
function asList(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.items)) return payload.items
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
}

async function getToken() {
  const body = JSON.stringify({ ...PROBE, nickname: 'locale-probe' })
  const headers = { 'Content-Type': 'application/json' }
  try {
    const r = await api('/api/auth/register', { method: 'POST', headers, body })
    return r.access_token
  } catch {
    const r = await api('/api/auth/login', { method: 'POST', headers, body })
    return r.access_token
  }
}

/** Một project studio đã tồn tại là đủ để `/studio/{id}/style` render. */
async function ensureStudioProject(token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const existing = asList(await api('/api/projects', { headers }))
  if (existing.length) return existing[0].id
  const templates = asList(await api('/api/templates', { headers }))
  if (!templates.length) throw new Error('khong co template nao de tao project')
  const created = await api('/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      template_id: templates[0].id,
      title: 'Kiem thu locale',
      source_text: 'Mot cau chuyen ngan ve mo quan ca phe va doi thuong.',
      pipeline_mode: 'full',
      output_ratio: '9:16',
    }),
  })
  return created.id
}

/**
 * Project drama **mới tạo** mỗi lượt, vì `OutlineStep` chỉ tự gọi `script_summary` khi
 * project còn chưa có tóm tắt. Dùng lại project cũ thì luồng tự chạy không bắn lại.
 */
async function createDramaProject(token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  return api('/api/drama/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Kiem thu locale drama',
      description: 'Du lieu gia lap de do payload locale.',
      source: 'Mot nguoi ban cham ngay trong khu pho xa, phat hien ra dieu khac thuong.',
      episode_count: 3,
      image_style_id: 'pixel-art',
      workflow: 'script',
    }),
  })
}

/**
 * Kịch bản giả để `OutlineStep` đi tiếp sau `script_summary`.
 *
 * `summary_status: 'completed'` cho `pollScriptUntil` thoát ngay thay vì quay 45 phút,
 * và `summary.episodeCount = 3` + `episode_content` rỗng làm `autoMissingEpisodeCount`
 * ra 3 nên pipeline gọi tiếp `episode_script` — tức là cả hai endpoint drama đều được
 * bắn trong **một** lần vào trang.
 */
function synthScript(projectId) {
  return {
    id: 0,
    project_id: projectId,
    name: 'probe',
    source: '',
    summary: { seriesTitle: 'probe', episodeCount: 3 },
    episode_content: { episodes: [] },
    params: { summary_status: 'completed', episode_content_status: 'completed' },
  }
}

/* ------------------------------------------------------------------ *
 * Báo cáo
 * ------------------------------------------------------------------ */

const failures = []
function check(ok, label, detail = '') {
  console.log(`  ${ok ? 'DAT ' : 'SAI '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

/* ------------------------------------------------------------------ *
 * Edge + CDP
 * ------------------------------------------------------------------ */

async function freePort() {
  const min = Number(process.env.AUDIT_PORT_MIN || 19400)
  const max = min + 200
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = min + Math.floor(Math.random() * (max - min))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1000),
      })
      if (!res.ok) return port
    } catch {
      return port
    }
    await sleep(150)
  }
  throw new Error(`khong tim duoc cong debug trong [${min}, ${max}]`)
}

async function main() {
  console.log('\n=== DO PAYLOAD LOCALE CUA CAC LOI GOI SINH KHICH BAN ===')
  console.log(`dev server: ${BASE}`)
  console.log(`backend:    ${API}\n`)

  const token = await getToken()
  const studioId = await ensureStudioProject(token)
  const drama = await createDramaProject(token)
  console.log(`project studio: ${studioId}`)
  console.log(`project drama:  ${drama.id}\n`)

  const port = await freePort()
  mkdirSync(PROFILE_ROOT, { recursive: true })

  const edge = spawn(
    EDGE,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${PROFILE_ROOT}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  /** key -> các postData đã bắt được, theo thứ tự thời gian. */
  const captured = new Map(Object.keys(ENDPOINTS).map((k) => [k, []]))
  /** Mỗi lần đo đã hoàn tất, để tổng kết dựng lại từ số đo thay vì từ giả định. */
  const results = []
  let ws

  try {
    for (let i = 0; i < 60; i += 1) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break
      } catch { /* chua len */ }
      if (i === 59) throw new Error('Edge khong len')
      await sleep(250)
    }

    const tab = await (
      await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + '/')}`, {
        method: 'PUT',
        signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
      })
    ).json()

    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('CDP khong bat tay xong')), CDP_TIMEOUT_MS)
      ws.onopen = () => { clearTimeout(timer); res() }
      ws.onerror = () => { clearTimeout(timer); rej(new Error('CDP socket loi')) }
    })

    let id = 0
    const pending = new Map()
    const script = synthScript(drama.id)
    /** Lỗi `Runtime.evaluate` gần nhất, để timeout nói được nguyên nhân. */
    let lastEvalError = ''

    function send(method, params = {}) {
      const mid = ++id
      return new Promise((res) => {
        const timer = setTimeout(() => {
          pending.delete(mid)
          res({ timedOut: true, method })
        }, CDP_TIMEOUT_MS)
        pending.set(mid, { resolve: res, timer })
        ws.send(JSON.stringify({ id: mid, method, params }))
      })
    }

    function fulfill(requestId, code, payload) {
      return send('Fetch.fulfillRequest', {
        requestId,
        responseCode: code,
        responseHeaders: [
          { name: 'content-type', value: 'application/json' },
          { name: 'access-control-allow-origin', value: '*' },
        ],
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      })
    }

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id)
        clearTimeout(p.timer)
        pending.delete(msg.id)
        p.resolve(msg)
        return
      }
      if (msg.method !== 'Fetch.requestPaused') return

      const { requestId, request, responseErrorReason } = msg.params
      if (responseErrorReason) {
        send('Fetch.failRequest', { requestId, errorReason: responseErrorReason })
        return
      }
      // Preflight: phải trả CORS đúng, nếu không trình duyệt chặn phản hồi POST và ta sẽ
      // đo nhầm thành lỗi mạng thay vì payload.
      if (request.method === 'OPTIONS') {
        send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 204,
          responseHeaders: [
            { name: 'access-control-allow-origin', value: '*' },
            { name: 'access-control-allow-methods', value: 'POST, OPTIONS, GET, PATCH' },
            { name: 'access-control-allow-headers', value: 'content-type, authorization' },
            { name: 'access-control-max-age', value: '600' },
          ],
        })
        return
      }

      const { pathname } = new URL(request.url)

      // GET kịch bản: trả bản giá "đã xong" để luồng tự chạy đi tiếp sang episode_script.
      if (request.method === 'GET' && pathname.startsWith('/api/drama/scripts/')) {
        fulfill(requestId, 200, script)
        return
      }

      const hit = ENDPOINT_MATCHERS.find(([, re]) => re.test(pathname))
      if (!hit) {
        send('Fetch.continueRequest', { requestId })
        return
      }
      const [key] = hit
      if (request.method === 'POST') {
        try {
          captured.get(key).push(JSON.parse(request.postData || '{}'))
        } catch {
          captured.get(key).push({ __unparsed: request.postData || '' })
        }
      }

      // Trả lời giả — không gọi LLM, không trừ credit, không đẩy DB.
      if (key === 'contentExpand') fulfill(requestId, 200, { title: 'probe', content: 'probe' })
      else if (key === 'studioGenerate') {
        fulfill(requestId, 409, { detail: 'locale-probe stub' })
      } else if (key === 'scriptSummary') {
        fulfill(requestId, 200, { ok: true, script, total_generated: 0, total_target: 3 })
      } else if (key === 'episodeScript') {
        fulfill(requestId, 200, {
          ok: true,
          script,
          episodes: [],
          total_generated: 0,
          total_target: 3,
          done: true,
        })
      }
    }

    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      if (r?.result?.exceptionDetails) {
        lastEvalError =
          r.result.exceptionDetails.exception?.description ||
          r.result.exceptionDetails.text ||
          'loi khong ro'
        return {
          threw: true,
          text: lastEvalError,
        }
      }
      lastEvalError = ''
      return { threw: false, value: r?.result?.result?.value }
    }

    async function waitFor(read, what, timeoutMs = 45_000) {
      const deadline = Date.now() + timeoutMs
      let last = null
      for (;;) {
        last = await read()
        if (last) return last
        if (Date.now() > deadline) {
          // Nêu luôn lỗi evaluate gần nhất. Không có nó thì timeout chỉ nói "không xuất
          // hiện" — đúng triệu chứng mà không nói được nguyên nhân, và đó chính là lý do
          // lượt chạy đầu tiên chết ở mốc 60s mà không ai biết vì sao.
          throw new Error(`${what} khong xuat hien sau ${timeoutMs / 1000}s${lastEvalError ? ` | evaluate gan nhat: ${lastEvalError}` : ''}`)
        }
        await sleep(200)
      }
    }

    /** Chờ app render, không chờ `readyState` — lý do đã ghi ở `wizard-error-check.mjs`. */
    async function waitForApp() {
      await waitFor(
        async () => (await evaluate("!!document.querySelector('#root')")).value,
        'app da render',
        60_000,
      )
    }

/**
     * Chặt locale + token, **rồi mới** điều hướng tới route cần đo.
     *
     * Thứ tự này là điều kiện bắt buộc, đo được bằng chính lượt chạy đầu tiên: nếu đi tới
     * `/studio/new` **trước** khi có token thì app điều hướng sang `/auth`, và `Page.reload`
     * sau đó nạp lại `/auth` chứ không phải `/studio/new` — selector `.pf-btn-ai` không bao
     * giờ xuất hiện và lượt chạy chết ở mốc chờ 60s.
     *
     * Đi qua `/` trước mỗi lần chặt chỉ để **lấy origin thật**: `localStorage` trên
     * `about:blank` (lúc mở tab) ném `SecurityError` và giá trị không được ghi
     * (nguyên tắc đã ghi ở `wizard-error-check.mjs`).
     *
     * Vì sao chờ bằng `documentElement.lang` chứ không bằng `#root`: `#root` nằm sẵn trong
     * `index.html` tĩnh, nên nó xuất hiện **trước khi** React mount. Đo được: lượt chạy đầu
     * báo `lang="vi"` ở locale `en` — đúng giá trị `<html lang="vi">` viết cứng trong
     * `index.html`, tức là đo vào lúc app còn chưa render. `lang` do `applyLocale()` ghi lúc
     * mount nên nó vừa là tín hiệu "app đã render" vừa là chính thứ đo.
     */
    async function openAt(route, locale, readySelector) {
      await send('Page.navigate', { url: `${BASE}/` })
      await waitForApp()
      const seed = await evaluate(`(() => {
        localStorage.setItem('novafilm.locale', ${JSON.stringify(locale)});
        localStorage.setItem('token', ${JSON.stringify(token)});
        return localStorage.getItem('novafilm.locale');
      })()`)
      if (seed.threw) throw new Error(`khong ghi duoc locale ${locale}: ${seed.text}`)

      await send('Page.navigate', { url: BASE + route })
      await waitFor(
        async () =>
          (await evaluate('document.documentElement.lang')).value === LOCALE_HTML[locale],
        `${route} render o locale ${locale}`,
        60_000,
      )
      if (readySelector) {
        await waitFor(
          async () => (await evaluate(`!!document.querySelector(${JSON.stringify(readySelector)})`)).value,
          `${route} (${readySelector})`,
        )
      }
      const where = await evaluate('location.pathname')
      if (!where.value?.startsWith(route)) {
        throw new Error(`tu ${route} bi day sang ${where.value} (token chua duoc chap nhan?)`)
      }
    }

    /**
 * Chờ **một** POST của `key` rồi trả về body đã đo.
 *
 * Không tự xoá `captured[key]`: việc đó phải xảy ra **trước** khi bấm nút, không phải sau.
 * Sai lần đầu: `captureOne` tự xoá mảng ngay sau cú click, nên nó xoá luôn chính request
 * cần đo rồi chờ mãi — lượt chạy chết ở `khong xuat hien sau 45s` dù payload đã đúng.
 * Gọi `resetCapture(key)` trước hành động, thì `captureOne` chỉ việc chờ.
 */
    async function captureOne(key, uiLocale) {
      const bodies = await waitFor(
        () => (captured.get(key).length ? captured.get(key) : null),
        `POST ${ENDPOINTS[key]} (${uiLocale})`,
        45_000,
      )
      const sent = bodies[0]
      results.push({ locale: uiLocale, key, sent: sent.locale, ok: sent.locale === uiLocale })
      return sent
    }

    /** Xoá kết quả cũ của `key` — phải gọi **trước** hành động gây ra request. */
    const resetCapture = (key) => {
      captured.get(key).length = 0
    }

    await send('Page.enable')
    await send('Runtime.enable')

    // Chặn trước mọi lần điều hướng, để không bỏ sót request nào phát ra lúc mount.
    await send('Fetch.enable', {
      patterns: [
        { urlPattern: `${API}*`, requestStage: 'Request' },
      ],
    })

    console.log('--- /studio/new: nut AI Viet hoa ("expand") ---')
    for (const locale of LOCALES) {
      await openAt('/studio/new', locale, '.pf-btn-ai')
      resetCapture('contentExpand')
      const click = await evaluate(
        `(() => { const b = document.querySelector('.pf-btn-ai'); if (!b) return 'no button'; b.click(); return 'clicked' })()`,
      )
      check(!click.threw, `  [${locale}] bam nut AI tren /studio/new`, click.text || '')
      const sent = await captureOne('contentExpand', locale)
      check(
        sent.locale === locale,
        `  [${locale}] POST ${ENDPOINTS.contentExpand} gui locale`,
        `locale=${JSON.stringify(sent.locale)} · body=${JSON.stringify(sent)}`,
      )
    }

    console.log('\n--- /studio/{id}/style: nut bat dau ---')
    for (const locale of LOCALES) {
      await openAt(`/studio/${studioId}/style`, locale, '.pf-btn-lime.pf-btn-lg')
      resetCapture('studioGenerate')
      const click = await evaluate(
        `(() => { const b = document.querySelector('.pf-btn-lime.pf-btn-lg'); if (!b) return 'no button'; b.click(); return 'clicked' })()`,
      )
      check(!click.threw, `  [${locale}] bam nut bat dau tren trang style`, click.text || '')
      const sent = await captureOne('studioGenerate', locale)
      check(
        sent.locale === locale,
        `  [${locale}] POST ${ENDPOINTS.studioGenerate} gui locale`,
        `locale=${JSON.stringify(sent.locale)} · body=${JSON.stringify(sent)}`,
      )
    }

    console.log('\n--- /drama/projects/{id}: luong tu dong sinh tom tat + kich ban tung tap ---')
    for (const locale of LOCALES) {
      // Drama tự chạy ngay khi mount, nên phải xoá **trước** khi điều hướng — không có
      // nút bấm để chen vào giữa.
      resetCapture('scriptSummary')
      resetCapture('episodeScript')
      await openAt(`/drama/projects/${drama.id}`, locale)
      for (const key of ['scriptSummary', 'episodeScript']) {
        const sent = await captureOne(key, locale)
        check(
          sent.locale === locale,
          `  [${locale}] POST ${ENDPOINTS[key]} gui locale`,
          `locale=${JSON.stringify(sent.locale)} · body=${JSON.stringify(sent)}`,
        )
      }
    }
  } finally {
    try { ws?.close() } catch { /* socket da dong */ }
    try { edge.kill() } catch { /* Edge da chet */ }
    try { rmSync(PROFILE_ROOT, { recursive: true, force: true }) } catch { /* da don o len chay truoc */ }
  }

  console.log('\n===== TONG HOP =====')
  // Dựng từ `results` (những lần đo đã hoàn tất), **không** từ `captured`.
  //
  // Sai lần đầu: bản cũ lấy `captured.get(key).slice(-1)[0]` cho mọi locale, tức là
  // luôn lấy request cuối cùng — sau khi đã chạy hết `zh`. Nên nó in
  // `vi: 0/4 · SAI` và `en: 0/4 · SAI` ngay dưới dòng "TAT CA ... deu gui dung".
  // Một tổng kết sai còn tệ hơn không có tổng kết: nó khiến người đọc phải chọn giữa hai
  // kết luận trái ngược.
  for (const locale of LOCALES) {
    const rows = results.filter((r) => r.locale === locale)
    const bad = rows.filter((r) => !r.ok)
    const expected = Object.keys(ENDPOINTS).length
    if (rows.length !== expected) {
      console.log(
        `${locale}: chi do ${rows.length}/${expected} endpoint · THIEU: ` +
          Object.keys(ENDPOINTS).filter((k) => !rows.some((r) => r.key === k)).join(', '),
      )
      failures.push(`${locale}: thieu ${expected - rows.length} endpoint`)
      continue
    }
    console.log(
      `${locale}: ${rows.length - bad.length}/${rows.length} endpoint gui dung` +
        (bad.length ? ` · SAI: ${bad.map((r) => r.key).join(', ')}` : ''),
    )
  }
  if (failures.length) {
    console.log(`\n${failures.length} kiem tra khong dat:`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exitCode = 1
  } else {
    console.log(
      `\nDAT: ${results.length} lan do (${Object.keys(ENDPOINTS).length} endpoint x ${LOCALES.length} locale) — ` +
        'payload buoc theo ngon ngu dang hien tren giao dien.',
    )
  }
}

main().catch((e) => {
  console.error(`\nLOI: ${e?.message || e}`)
  process.exitCode = 1
})