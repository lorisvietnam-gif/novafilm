/**
 * Tự kiểm `/wizard` bước 2 khi backend **không có** endpoint.
 *
 * Vì sao cần script riêng thay vì chỉ chạy `visual-audit.mjs`:
 *
 * 1. `visual-audit.mjs` **đo** thì đúng, nhưng nó **không khẳng định** điều gì cả —
 *    nó đếm ký tự Trung và bắt `Runtime.exceptionThrown`. Yêu cầu của brief
 *    ("bấm bước 2 khi endpoint 404 không phát sinh lỗi uncaught") là một khẳng
 *    định có/không, nên nó cần một lượt chạy **ép** endpoint trả 404 rồi **kiểm**.
 * 2. Endpoint `POST /api/wizard/generate_prompt` chưa tồn tại (xem
 *    `docs/briefs/case-wizard-integration-b2-b4.md`). Ta **không** sửa backend ở
 *    task này, nên phải ép 404 ngay trong trình duyệt bằng CDP `Fetch` — như vậy
 *    script chạy được kể cả khi backend đã có endpoint thật.
 *
 * Script **không cài gì thêm**: dùng đúng Microsoft Edge có sẵn ở chế độ headless,
 * điều khiển qua CDP, giống `visual-audit.mjs`.
 *
 * Chạy:
 *   node scripts\wizard-error-check.mjs
 *
 * Biến môi trường:
 *   BASE=http://127.0.0.1:5183   dev server của lane này (mặc định :5183)
 *
 * Thoát mã 0 = đạt, khác 0 = có vi phạm (in rõ từng vi phạm).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5183'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

/** Endpoint mà bước 2 gọi — đúng đường dẫn trong `api.ts`. */
const ENDPOINT = '/api/wizard/generate_prompt'

/** Ý tưởng thử: có dấu chấm câu để bản nháp tách được thành khung. */
const IDEA =
  'Một cô gái trẻ mặc áo khoác da chạy băng qua phố mưa lúc đêm, dừng lại trước một quán cà phê nhỏ, ngẩng đầu nhìn đèn neon và thở dài.'

/** Câu UI kỳ vọng ở locale `vi` — lấy từ `i18n/locales/vi/shell.ts` (`errors.notFound`). */
const VI_ERROR_TITLE = 'Có lỗi xảy ra'
const VI_ERROR_NOT_FOUND = 'Không tìm thấy dữ liệu này.'

const CDP_TIMEOUT_MS = 60_000
const PORT_MIN = Number(process.env.AUDIT_PORT_MIN || 19400)
const PORT_MAX = Number(process.env.AUDIT_PORT_MIN ? Number(process.env.AUDIT_PORT_MIN) + 200 : 19999)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Cổng trống: có ai trả lời và có tiến trình Edge nào giữ không. */
async function freePort() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN))
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
  throw new Error(`Khong tim duoc cong debug trong [${PORT_MIN}, ${PORT_MAX}].`)
}

/**
 * Profile Edge đặt ở `%TEMP%`, **không** đặt trong workspace.
 *
 * Lý do: dev server Vite theo dõi toàn bộ `frontend/`, nên nó cũng theo dõi
 * `frontend/.kilo/`. Profile Edge nằm ở đó và Edge giữ file trong lúc chạy →
 * Vite dính `EBUSY` và tự chết, làm mọi trang sau đó trả `ERR_CONNECTION_REFUSED`.
 * Đã xảy ra thật và đã ghi ở `visual-audit.mjs`; ở đây kế thừa nguyên tắc đó.
 */
const PROFILE_ROOT = join(tmpdir(), `novafilm-wizard-check-edge-${process.pid}`)

/**
 * Bộ thu lỗi, cài **trước** mọi script của trang.
 *
 * `Page.addScriptToEvaluateOnNewDocument` là bắt buộc: nếu cài sau khi trang đã
 * tải thì một lỗi ném ra lúc tải đầu đã lọt qua không ai đo.
 *
 * Cả `unhandledrejection` lẫn `error` đều phải nghe:
 * - `unhandledrejection`: promise lỗi không ai `catch` — đúng thứ brief cấm.
 * - `error`: lỗi ném đồng bộ. Chỉ tính khi `e.error` có mặt, vì lỗi tải ảnh
 *   (`<img>` hỏng) cũng bắn `error` với `message` rỗng và sẽ thành báo động giả.
 */
const COLLECTOR = `(() => {
  window.__wizardUncaught = [];
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    const msg = r && r.message ? r.message : String(r);
    window.__wizardUncaught.push('unhandledrejection: ' + msg);
  });
  window.addEventListener('error', (e) => {
    if (!e.error) return;
    window.__wizardUncaught.push('error: ' + (e.message || String(e.error)));
  });
})()`

/** Bấm nút cuối trong `.wizard-actions` — luôn là "Tiếp tục", không phụ thuộc ngôn ngữ. */
const CLICK_NEXT = `(() => {
  const btns = document.querySelectorAll('.wizard-actions .pf-btn');
  const next = btns[btns.length - 1];
  if (!next) throw new Error('khong tim thay nut buoc sau');
  next.click();
  return true;
})()`

/**
 * Điền ý tưởng rồi bấm nút soạn.
 *
 * Gán giá trị phải qua setter của prototype rồi bắn `input` — React đọc giá trị qua
 * value tracker, gán thẳng `element.value` thì React không thấy thay đổi.
 */
const FILL_AND_GENERATE = `(() => {
  const area = document.querySelector('.wizard-textarea');
  if (!area) throw new Error('khong tim thay o nhap y tuong');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(area, ${JSON.stringify(IDEA)});
  area.dispatchEvent(new Event('input', { bubbles: true }));
  const go = document.querySelector('.wizard-generate');
  if (!go) throw new Error('khong tim thay nut soan');
  go.click();
  return true;
})()`

const failures = []
function check(ok, label, detail = '') {
  console.log(`  ${ok ? 'DAT ' : 'SAI '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

async function main() {
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

  // Mọi lỗi đo được phải nằm trong kết quả, không nằm trong tiến trình đã chết.
  const cdpErrors = []
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
      await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + '/wizard')}`, {
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
    /** Bản thân biểu thức ném lỗi — trả về `{ threw: true, text }`. */
    let fetchPaused = false

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id)
        clearTimeout(p.timer)
        pending.delete(msg.id)
        p.resolve(msg)
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params?.exceptionDetails
        cdpErrors.push(d?.exception?.description || d?.text || 'exception')
      }
      if (msg.method === 'Fetch.requestPaused') {
        fetchPaused = true
        const { requestId, request, responseErrorReason } = msg.params
        if (responseErrorReason) {
          send('Fetch.failRequest', { requestId, errorReason: responseErrorReason })
        } else if (request.method === 'OPTIONS') {
          /*
           * Bắt buộc phải trả preflight cho đúng.
           *
           * Yêu cầu của `api.ts` đi kèm `Content-Type: application/json`, nên
           * trình duyệt gửi `OPTIONS` trước — mà `urlPattern` của ta khớp cả
           * `OPTIONS`. Nếu trả 404 cho nó, phản hồi thiếu
           * `access-control-allow-origin`, trình duyệt **chặn** phản hồi `POST`
           * và `fetch` ném `TypeError: Failed to fetch`. Lúc đó trang vẫn bắt
           * được lỗi và vẫn không crash, nhưng thông báo là "không kết nối được"
           * thay vì "không tìm thấy" — tức là ta đang kiểm tra **sai nhánh lỗi**
           * so với brief (404), và chỉ đo được một cách tình cờ.
           */
          send('Fetch.fulfillRequest', {
            requestId,
            responseCode: 204,
            responseHeaders: [
              { name: 'access-control-allow-origin', value: '*' },
              { name: 'access-control-allow-methods', value: 'POST, OPTIONS' },
              { name: 'access-control-allow-headers', value: 'content-type, authorization' },
              { name: 'access-control-max-age', value: '600' },
            ],
          })
        } else {
          // 404 + JSON đúng hình dạng FastAPI trả khi route không tồn tại.
          const body = Buffer.from(JSON.stringify({ detail: 'Not Found' })).toString('base64')
          send('Fetch.fulfillRequest', {
            requestId,
            responseCode: 404,
            responseHeaders: [
              { name: 'content-type', value: 'application/json' },
              { name: 'access-control-allow-origin', value: '*' },
            ],
            body,
          })
        }
      }
    }

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

    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      const value = r?.result?.result?.value
      if (r?.result?.exceptionDetails) {
        return {
          threw: true,
          text:
            r.result.exceptionDetails.exception?.description ||
            r.result.exceptionDetails.text ||
            'loi khong ro',
          value,
        }
      }
      return { threw: false, value }
    }

    /** Chờ tới khi `read()` trả về đúng thì thôi — không đoán bằng số giây cứng. */
    async function waitFor(read, what, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs
      let last = null
      for (;;) {
        last = await read()
        if (last) return last
        if (Date.now() > deadline) {
          throw new Error(`${what} khong xuat hien sau ${timeoutMs / 1000}s`)
        }
        await sleep(200)
      }
    }

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECTOR })

    console.log(`\nkiem tra /wizard buoc 2 khi backend tra 404`)
    console.log(`dev server: ${BASE}`)
    console.log(`endpoint bi chan: POST ${ENDPOINT}\n`)

    // Chặt locale + token **sau khi trang đã nạp xong**.
    //
    // Thứ tự này là điểm mấu chốt. `visual-audit.mjs` ghi `localStorage` ngay khi
    // mở tab, tức là lúc trang còn là `about:blank` — `localStorage` khi đó ném
    // `SecurityError`, giá trị không được ghi, và trang rơi về ngôn ngữ trình duyệt
    // (`en`). Đã đo: `localStorage.setItem` trả `Uncaught`, `stored=null`,
    // `lang=en`, trong khi `/` cùng lượt lại ra tiếng Việt. Ảnh `vi` như vậy là
    // ảnh tiếng Anh — đo sai mà nhìn thì tưởng đã Việt hoá.
    /*
     * Chờ **ứng dụng** dựng xong, đừng chờ `readyState`.
     *
     * `document.readyState` trả `"complete"` ngay cả trên `about:blank`, nên chờ
     * nó là chờ không — và `localStorage` trên `about:blank` ném `SecurityError`
     * ("Access is denied for this document"), tức là locale không bao giờ được
     * ghi. Đo được: `lang="en"` sau khi reload dù đã cố chặt `vi`.
     *
     * `.wizard-actions` chỉ xuất hiện khi `WizardPage` đã render, tức là đúng lúc
     * `document` thuộc origin của dev server và `localStorage` dùng được.
     */
    await waitFor(
      async () => (await evaluate('!!document.querySelector(".wizard-actions")')).value,
      'trang /wizard (app da render)',
    )
    const setLocale = await evaluate(
      "localStorage.setItem('novafilm.locale', 'vi'); localStorage.getItem('novafilm.locale')",
    )
    check(!setLocale.threw, 'ghi duoc locale vao localStorage', setLocale.text)
    check(setLocale.value === 'vi', 'localStorage dang luu "vi"', String(setLocale.value))

    await send('Page.reload', { ignoreCache: false })
    await waitFor(
      async () => (await evaluate('!!document.querySelector(".wizard-actions")')).value,
      'trang /wizard (sau reload)',
    )

    const lang = (await evaluate('document.documentElement.lang')).value
    check(lang === 'vi', 'trang chay o locale vi', `lang="${lang}"`)

    // Bật chặn endpoint. Chỉ chặn đúng đường dẫn này, nên mọi request khác
    // (JS, CSS, ảnh) vẫn đi bình thường.
    await send('Fetch.enable', {
      patterns: [{ urlPattern: `*${ENDPOINT}`, requestStage: 'Request' }],
    })

    const exceptionsBefore = cdpErrors.length

    // --- Bước 1 -> bước 2 ---
    const next1 = await evaluate(CLICK_NEXT)
    check(!next1.threw, 'bam "Tiep tuc" sang buoc 2', next1.text)
    await waitFor(
      async () => (await evaluate('!!document.querySelector(".wizard-textarea")')).value,
      'o nhap y tuong o buoc 2',
    )

    // --- Bấm soạn, endpoint trả 404 ---
    const gen = await evaluate(FILL_AND_GENERATE)
    check(!gen.threw, 'bam nut soan o buoc 2', gen.text)

    const shown = await waitFor(
      async () => {
        const r = await evaluate(
          `(() => {
            const el = document.querySelector('.pf-error-notice-text');
            return el ? el.textContent : null;
          })()`,
        )
        return r.value || null
      },
      'thong bao loi tieng Viet',
    )
    console.log(`  (noi dung thong bao: "${shown.slice(0, 60)}...")`)

    // Nút phải trở lại trạng thái sẵn sàng — không kẹt loading.
    const btn = await evaluate(
      `(() => {
        const b = document.querySelector('.wizard-generate');
        if (!b) return null;
        return JSON.stringify({ disabled: !!b.disabled, text: b.textContent.trim() });
      })()`,
    )
    const btnState = btn.value ? JSON.parse(btn.value) : null
    check(btnState && !btnState.disabled, 'nut buoc 2 khong ket loading', btn.value || 'khong tim thay nut')
    check(
      !/ang soan|generating|Đang soạn/i.test(btnState?.text || ''),
      'nut buoc 2 da ve nhan "soan prompt"',
      btnState?.text,
    )

    // Không có lỗi nào thoát ra ngoài.
    const uncaught = await evaluate('JSON.stringify(window.__wizardUncaught || [])')
    const list = uncaught.value ? JSON.parse(uncaught.value) : ['<doc khong co collector>']
    check(list.length === 0, 'khong co loi uncaught', list.join(' | ') || 'rong')
    check(
      cdpErrors.length === exceptionsBefore,
      'khong co exception nao cua trang',
      cdpErrors.slice(exceptionsBefore).join(' | ') || 'khong co',
    )

    // Câu hiện ra phải là tiếng Việt, không phải câu của `en`.
    const title = (await evaluate(
      `(() => {
        const el = document.querySelector('.pf-error-notice-title');
        return el ? el.textContent : null;
      })()`,
    )).value
    check(title === VI_ERROR_TITLE, 'tieu de loi dung pack vi', `got "${title}"`)
    check(
      shown.includes(VI_ERROR_NOT_FOUND),
      'noi dung loi khop errors.notFound cua vi',
      shown.slice(0, 60),
    )

    // Người dùng vẫn đi được tới bước 4 (bản nháp dựng trong trình duyệt).
    await evaluate(CLICK_NEXT)
    await waitFor(
      async () => (await evaluate('!!document.querySelector(".wizard-target-grid")')).value,
      'buoc 3',
    )
    const n3 = await evaluate(CLICK_NEXT)
    check(!n3.threw, 'di tiep sang buoc 4', n3.text)
    const frames = await evaluate(
      `(() => {
        const f = document.querySelectorAll('.wizard-frame');
        return f.length;
      })()`,
    )
    check(Number(frames.value) > 0, 'buoc 4 co khung de sao chep', `${frames.value} khung`)

    check(fetchPaused, 'da chan duoc request toi endpoint')

    /*
     * Tự thử bộ dò lỗi — bước này giữ cho phần "không có lỗi uncaught" ở trên
     * **có răng** thay vì xanh theo kiểu im lặng.
     *
     * Nếu collector hỏng (không cài, không bắt, sai tên mảng) thì nó im lặng
     * báo "không có lỗi" và mọi lần chạy sau đều xanh dù trang có ném lỗi. Đo được
     * ở chính script này: lần chạy đầu hỏng `window.__wizardUncaught` và phần
     * khẳng định đã báo sai rồi. Nên ở đây ta **cố tình** làm rơi một rejection
     * và đòi bộ dò phải bắt được; bắt được mới chứng minh phần trên có ý nghĩa.
     */
    const selfTest = await evaluate(
      `(() => {
        Promise.reject(new Error('canh bao thu nghiem'));
        return true;
      })()`,
    )
    await sleep(300)
    const selfSeen = await evaluate('JSON.stringify(window.__wizardUncaught || [])')
    const selfList = selfSeen.value ? JSON.parse(selfSeen.value) : []
    check(
      selfList.some((x) => x.includes('canh bao thu nghiem')),
      'bo do loi bat duoc rejection thu nghiem',
      selfList.join(' | ') || 'khong bat gi',
    )
    // Dọn lại để phần báo cuối không bị nhiễu bởi lỗi thử nghiệm.
    await evaluate('window.__wizardUncaught = []; true')
    check(!selfTest.threw, 'buoc tu thu dien ra khong loi', selfTest.text)
  } finally {
    try { ws?.close() } catch { /* da dong */ }
    edge.kill()
    /*
     * Dọn profile **không được làm hỏng kết quả**.
     *
     * Edge giữ file trong lúc chạy nên `rmSync` hay trả `EPERM` trên Windows —
     * đã xảy ra và nó đã che mất dòng kết luận. Vì vậy phải đợi Edge thoát rồi
     * thử lại vài lần, và nếu vẫn không được thì **bỏ qua**: profile nằm ở
     * `%TEMP%`, để sót lại chỉ tốn vài chục MB chứ không làm sai phép đo.
     */
    for (let i = 0; i < 5; i += 1) {
      await sleep(400)
      try {
        rmSync(PROFILE_ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
        break
      } catch { /* Edge chua doi; thu lai */ }
    }
  }

  console.log('')
  if (failures.length) {
    console.log(`KHONG DAT — ${failures.length} vie pham:`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exitCode = 1
    return
  }
  console.log('DAT — trang khong crash, loi ra bang tieng Viet, nut khong ket loading.')
}

main().catch((e) => {
  console.error(`\nLOI: ${e?.message || e}`)
  process.exitCode = 1
})