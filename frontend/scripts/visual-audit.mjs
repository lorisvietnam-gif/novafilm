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

import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

/**
 * Cổng debug. Phải **tự thử và tự kiểm**, không được đoán.
 *
 * Công thức cũ `9400 + (pid % 400)` **không an toàn**: nó chỉ đảm bảo khác nhau khi hai tiến
 * trình có pid khác nhau dưới 400, mà điều đó không giữ được khi nhiều lane chạy audit cùng
 * lúc trên một máy. Đo được hai profile khác nhau cùng treo trên cổng 9456.
 *
 * Hậu quả còn tệ hơn va chạm: khi cổng đã bị chiếm, Edge của ta **không báo lỗi mà thoát
 * im với mã 0** (đo được: `EXITED code=0`), và mọi lệnh `/json/*` sau đó lọt vào trình duyệt
 * *của người khác*. Audit điều khiển sai trình duyệt, đo nhầm, rồi treo khi trình duyệt kia
 * biến mất — và báo cáo vẫn trông bình thường.
 *
 * Vì vậy: thử một cổng thật sự trống, rồi **xác nhận bằng chính profile** rằng cổng đó thuộc
 * về Edge vừa spawn. Thấy profile lạ trên cổng của mình thì báo lỗi, không đo tiếp.
 */
const PORT_MIN = Number(process.env.AUDIT_PORT_MIN || 19400)
const PORT_MAX = Number(process.env.AUDIT_PORT_MAX || 19999)

/**
 * Cổng thật sự dùng ở lần chạy này. Gán trong `main()` sau khi `pickPort()` chọn được,
 * và kiểm tra lại bằng profile ngay sau khi Edge lên — xem `assertOurBrowser()`.
 */
let PORT = 0

/** Cổng này có đang bị ai giữ không. */
async function portBusy(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(700),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Cổng trống: không ai trả lời, và không có tiến trình Edge nào đang giữ. */
function portHeldByProcess(port) {
  try {
    const out = execFileSync(
      'netstat',
      ['-ano', '-p', 'TCP'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
    )
    return out.split(/\r?\n/).some((l) => l.includes(`:${port} `) && l.includes('LISTENING'))
  } catch {
    return false
  }
}

async function pickPort() {
  // Dải rộng nên va chạm hiếm; thử nhiều cổng trước khi tuyệt vọng.
  for (let i = 0; i < 60; i++) {
    const port = PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN))
    if (portHeldByProcess(port)) continue
    if (await portBusy(port)) continue
    return port
  }
  throw new Error(
    `Khong tim duoc cong debug trong [${PORT_MIN}, ${PORT_MAX}]. `
      + `May dang chay qua nhieu Edge. Dong het cac phien headless roi chay lai.`,
  )
}

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
const PROFILE = join(OUT, '..', `edge-profile-${process.pid}`)

/**
 * Chốt: **chỉ một audit chạy một lúc.**
 *
 * Đã xảy ra: board chạy audit trong khi bunny/5 chạy audit của nó. Hai Edge cùng lúc đẻ ra
 * **366 tiến trình**, chạy tranh tài nguyên, và cả hai đều hỏng — một cái chết sau 4 dòng, cái
 * kia bị cắt giữa chừng. Tệ hơn: khi chạy song song thì **không con số nào đáng tin**, mà
 * board đã nhiều lần dính phải đính chính vì đo nhầm.
 *
 * Vì vậy: giữ một file khoá trong thư mục `.kilo` (đã gitignore). Thấy khoá còn sống thì **thoát
 * ngay kèm lý do** — đừng chạy song song.
 */
const LOCK = join(OUT, '..', 'audit.lock')
mkdirSync(resolve(OUT, '..'), { recursive: true })

function lockHeldByOther() {
  try {
    const pid = Number(readFileSync(LOCK, 'utf8').trim())
    if (!pid || pid === process.pid) return null
    process.kill(pid, 0) // chỉ kiểm tra, không giết
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

const CJK = /[\u4e00-\u9fff]/

/**
 * Bộ đếm ký tự Trung **bị lừa** bởi trang báo lỗi: khi API chết, trang vẫn render bằng tiếng Việt
 * nhưng không có dữ liệu nào, nên ký tự Trung = 0 và trang **trông như đã sạch**.
 * Đã xảy ra thật: `/templates` báo `cjk=1` trong khi ảnh chụp cho thấy
 * *"Không kết nối được máy chủ"* và *"Không có template nào khớp"*.
 *
 * Vì vậy: route nào chứa một trong các chuỗi lỗi này thì **không được tính là đạt** — nó bị đánh
 * dấu `apiDown` và phải báo ra, đồng thời số ký tự của nó không được góp vào tổng.
 */
const API_ERROR_MARKERS = [
  'Không kết nối được máy chủ',
  'Máy chủ trả về dữ liệu không hợp lệ',
  'Connection failed',
  'Failed to fetch',
  'NetworkError',
]
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

/**
 * Mỗi lệnh CDP chờ tối đa bao lâu trước khi bị coi là hỏng.
 *
 * Không có giới hạn này thì một lệnh mà Edge không trả lời sẽ treo vĩnh viễn — và node
 * thoát **mã 0, không in gì**, vì event loop rỗng.
 *
 * Con số này phải **chịu được máy đang bận**, không chỉ máy rảnh. Máy này chạy nhiều lane
 * song song và mỗi lane đều đẻ Edge: đo được 132 tiến trình Edge của lane khác lúc audit
 * chạy. Renderer khi đó phản hồi `Page.reload`/`Runtime.evaluate` chậm hơn nhiều lần, và
 * mốc 15s giữa được gây hỏng **48/50 route rồi dừng** — tức là báo nhầm "Edge chết" khi Edge
 * chỉ chậm. Nên: 60s mặc định, chỉnh được bằng `AUDIT_CDP_TIMEOUT_MS`.
 *
 * Mốc này cố tình lớn. Nó không phải để phát hiện chậm — `Page.reload` cần thời gian tuỳ
 * máy — mà để bắt đúng trường hợp renderer **đã chết**: lúc đó không có phản hồi nào cả,
 * và chờ càng lâu cũng vô ích. Chờ lâu hơn có giá rất nhỏ; báo nhầm thì mất trắng toàn bộ
 * lần audit.
 */
const CDP_TIMEOUT_MS = Number(process.env.AUDIT_CDP_TIMEOUT_MS || 60_000)

/**
 * Đóng socket rồi đóng tab, **chỉ dùng ở cuối cùng** một lần chạy.
 *
 * Không được gọi ở giữa chừng. Đo được: đóng tab bằng `/json/close` khiến Edge **tự tắt** —
 * tiến trình tụt 15 → 10 → 0 và audit chết ở route thứ 4, không có crash nào trong Event
 * Log. Đó là lý do `auditRoutes` chỉ mở **một** tab và điều hướng nó qua mọi route.
 *
 * Thứ tự socket-trước-tab vẫn cần giữ: `/json/close` gọi khi bắt tay đóng socket chưa xong
 * là điều kiện của lỗi libuv mà comment cũ mô tả.
 */
async function closeTab(ws, tab) {
  try {
    await new Promise((res) => {
      ws.onclose = res
      ws.onerror = res
      ws.close()
      setTimeout(res, 2000) // không để chờ bắt tay đóng treo nếu Edge đã đi
    })
  } catch { /* socket da hong */ }
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`)
  } catch { /* Edge da chet, tab di theo no */ }
}

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

/** Backend trả `{ items: [...] }` chứ không phải mảng thuần. Quên chỗ này thì `ensureData()`
 *  không bao giờ tái dùng được dữ liệu cũ và cứ tạo project mới mỗi lần chạy audit. */
function asList(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.items)) return payload.items
  if (payload && Array.isArray(payload.data)) return payload.data
  if (payload && Array.isArray(payload.results)) return payload.results
  return []
}

/**
 * Tạo dữ liệu thật để các route có `:id` render được. Không có bước này thì storyboard,
 * trình soạn, chi tiết tập và canvas đều trống, và audit sẽ báo "0 ký tự Trung" một cách
 * dễ chủ quan — tức là báo xong trong khi thực ra **chưa kiểm tra gì**.
 */
async function ensureData(token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const out = { studio: null, drama: null, episode: null }

  const existing = asList(await api('/api/projects', { headers }))
  if (existing.length) out.studio = existing[0].id

  if (!out.studio) {
    const templates = asList(await api('/api/templates', { headers }))
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

  // Chọn project drama **đã có tập**, không phải project mới nhất.
  //
  // Trước đây lấy `dramas[0]`, tức project mới nhất. Nhưng project vừa tạo chưa chạy script
  // nên `episode_count = 0`, và route `/drama/projects/{d}/episodes/{e}` bị rơi khỏi danh
  // sách: audit chỉ còn 48/50 route mà vẫn in tổng kết như thể đã đủ. Đo được: database có
  // project id=4 với 2 tập, nhưng audit vẫn báo `episode=null` vì id=10 mới hơn lại rỗng.
  //
  // Duyệt từng project cho tới khi thấy project nào có tập thật; chỉ tạo mới khi không có.
  const dramaList = asList(await api('/api/drama/projects', { headers }))
  for (const d of dramaList) {
    try {
      const eps = asList(await api(`/api/drama/episodes?project_id=${d.id}`, { headers }))
      if (eps.length) {
        out.drama = d.id
        out.episode = eps[0].id
        break
      }
    } catch { /* project nay khong doc duoc danh sach tap */ }
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
      const eps = asList(await api(`/api/drama/episodes?project_id=${out.drama}`, { headers }))
      if (asList(eps).length) out.episode = eps[0].id
    } catch { /* can co script moi co tap */ }
  }

  return out
}

/**
 * Chặn sớm khi ổ đĩa đầy.
 *
 * Đã xảy ra thật: máy còn **4.8MB trống** và audit chết giữa chừng với
 * `ENOSPC: no space left on device` khi ghi ảnh. Nguyên nhân gốc là rò profile: mỗi lần
 * chạy để lại ~490MB trong `edge-profile-<pid>`, và 23 lần chạy là đầy ổ.
 *
 * Báo lỗi ngay ở đầu thay vì để chết lúc ghi ảnh — và nói rõ cần dọn cái gì.
 */
function assertDiskSpace() {
  const needBytes = 400 * 1024 * 1024
  // Lấy ký tự ổ từ đường dẫn ảnh: `D:\...` -> `D`.
  const drive = /([A-Za-z]):/.exec(resolve(OUT))?.[1]
  if (!drive) return
  let free = Infinity
  try {
    const probe = execFileSync('powershell', ['-NoProfile', '-Command',
      `(Get-PSDrive -Name '${drive.toUpperCase()}').Free`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 })
    free = Number(probe.trim())
  } catch {
    return // không đo được thì đừng chặn audit
  }
  if (!Number.isFinite(free) || free >= needBytes) return
  throw new Error(
    `O dia chi con ${(free / 1024 / 1024).toFixed(1)}MB — khong du de luu 50 anh chup. `
      + `Do la hau qua cua viec ro profile cua cac lan chay truoc. `
      + `Don cac thu muc \`frontend/.kilo/edge-profile-*\` roi chay lai.`,
  )
}

async function main() {
  console.log(`anh chup o: ${OUT}`)
  assertDiskSpace()
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

  // Chọn cổng **thật sự trống**, thay vì đoán từ pid. Xem `pickPort`.
  PORT = await pickPort()

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

  // Dù lỗi, dù thành công, phải dọn. Trước đây `taskkillTree` chỉ chạy ở cuối happy path:
  // một route hỏng là **cả cây Edge bị bỏ lại** (đã đo: 14 tiến trình sống dai sau khi
  // `throw`), Edge giữ cổng debug và profile, và các lần chạy sau cộng dồn tới hàng trăm
  // tiến trình — đó là nguồn làm số liệu sai, không phải lỗi ngẫu nhiên.
  try {
    await auditRoutes(ROUTES, token)
  } finally {
    // `edge` giữ tham chiếu tiến trình con để không bị GC, nhưng **không** dùng `edge.pid`
    // để giết — xem `taskkillTree` để hiểu vì sao pid đó vô dụng.
    edge.removeAllListeners()
    const killed = taskkillTree()
    // Xoá profile sau khi đã giết: Edge còn giữ file trong đó nên xoá trước sẽ `EPERM`.
    try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) } catch { /* da duoc xoa */ }
    console.log(`da don ${killed} tien trinh Edge`)
  }
}

/**
 * Chứng minh cổng debug đang trỏ tới **trình duyệt của lần chạy này**, không phải của ai khác.
 *
 * Đây là chốt chặn cuối và là chốt chặn duy nhất đáng tin. `pickPort()` giảm xác suất va
 * chạm, nhưng vẫn có khe thời gian: giữa lúc ta kiểm tra cổng trống và lúc Edge ta bind,
 * một lane khác có thể chiếm mất. Khi đó Edge ta **thoát mã 0, không báo lỗi**, và mọi
 * `/json/*` rơi vào trình duyệt khác — audit điều khiển sai Edge, đo nhầm, rồi treo.
 *
 * Cách kiểm: Edge luôn để lại một tiến trình cha mang đúng `--user-data-dir` của nó. Nếu cổng
 * của ta có Edge nhưng không tiến trình nào dùng profile của ta, thì cổng đó thuộc về
 * người khác và ta phải dừng, chứ không được đo tiếp.
 */
async function assertOurBrowser() {
  const tag = PROFILE.replace(/'/g, "''")
  let owners = 0
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" `
        + `| Where-Object { $_.CommandLine -like '*${tag}*' } `
        + `| Measure-Object | Select-Object -ExpandProperty Count`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 },
    )
    owners = Number(out.trim()) || 0
  } catch (e) {
    throw new Error(
      `Khong xac minh duoc Edge thuoc san audit (${e.message}). `
        + `Thay vi do tren trinh duyet la, audit dung lai.`,
    )
  }
  if (owners === 0) {
    throw new Error(
      `Cong ${PORT} dang tra loi nhung khong co Edge nao dung profile ${PROFILE}. `
        + `Nghia la Edge cua audit da chet va tay phai trinh duyet cua lane khac. `
        + `Audit dung la — so do ra se thuoc ve trinh duyet khac.`,
    )
  }
}

/**
 * Chạy vòng lặp route. Tách riêng để `finally` bảo đảm dọn dẹp chạy dù hàm này ném lỗi.
 */
async function auditRoutes(ROUTES, token) {
  let version = null
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
      break
    } catch { /* chua len */ }
  }
  if (!version) throw new Error('Edge headless khong len duoc')
  await assertOurBrowser()
  console.log(`Edge da len (cong ${PORT})`)

  // MỞ **MỘT** tab cho cả lần chạy rồi chỉ điều hướng nó qua từng route.
  //
  // Trước đây mỗi route mở một tab mới, và cả hai cách sửa đều sai:
  //   - Không đóng tab: Edge mọc thêm một tiến trình renderer mỗi route, đo được 15 → 34
  //     tiến trình, máy kiệt sức dần.
  //   - Đóng tab bằng `/json/close`: Edge bị giật mình rồi **tự tắt**. Đo được tiến trình
  //     tụt 15 → 10 → 0 và audit chết ở route thứ 4, không có crash nào trong Event Log.
  //
  // Tái sử dụng một tab là cách đúng: không có tab nào để đóng, không có tiến trình nào để
  // rò. Đo được 50/50 lần điều hướng với số tiến trình giữ phẳng 13 → 9.
  const tab = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/')}`, {
      method: 'PUT',
    })
  ).json()

  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  // Phải là `let`: cùng một tab đi qua nhiều trang, nên bộ đếm lỗi JS phải xoá trước mỗi
  // route, nếu không lỗi của route trước sẽ bị tính cho route sau.
  let consoleErrors = []

  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      clearTimeout(p.timer)
      p.res(msg.result)
      pending.delete(msg.id)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails
      consoleErrors.push(d?.exception?.description || d?.text || 'exception')
    }
  }

  /**
   * Mỗi lệnh CDP **phải** có thời hạn.
   *
   * Đây là nguyên nhân thật khiến audit chết âm thầm. `send()` trả về một promise chỉ được
   * resolve bởi `onmessage`. Khi trình duyệt chết giữa chừng — renderer văng, Edge bị giết,
   * socket đứt — Edge **không** gửi phản hồi, nên promise đó treo vĩnh viễn, `main()` không
   * bao giờ trả về, `catch()` không bao giờ chạy.
   *
   * Và node không báo lỗi: khi mọi handle đã đóng và chỉ còn một promise treo, event loop
   * **rỗng và node thoát với mã 0, in không một dòng nào**. Đã đo trực tiếp:
   * `main().catch()` + `await new Promise(() => {})` cho ra `EXIT=0` với output rỗng.
   * Đó chính xác là triệu chứng "in 5 dòng rồi thoài, không có thông báo lỗi".
   *
   * Nên: hết giờ thì **ném lỗi có tên**. Lỗi thì in được, treo thì chết không dấu vết.
   */
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id
      const timer = setTimeout(() => {
        pending.delete(n)
        rej(new Error(
          `CDP khong tra loi cho "${method}" sau ${CDP_TIMEOUT_MS / 1000}s. `
            + `Renderer/Edge co the da chet. Route nay KHONG duoc coi la da kiem tra.`,
        ))
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

  // Socket đứt thì mọi lệnh đang chờ đều vô lời vĩnh viễn — phải **từ chối** chứ không chờ để
  // chúng treo, vì treo chính là thứ giết tiến trình im lặng. Tuyệt đối không resolve với
  // `undefined`: `undefined` trôi qua mọi `?.` và ra `text = ''`, tức là route bị đọc thành
  // "0 ký tự Trung" — tức là **báo sạch trong khi thật ra là trắng trang**. Đó đúng là cái
  // bẫy mà audit này sinh ra để tránh.
  ws.onclose = () => {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.rej(new Error(
        'Ket noi CDP bi ngat giua chung. Renderer/Edge co the da chet. '
          + 'Route nay KHONG duoc coi la da kiem tra.',
      ))
    }
    pending.clear()
  }

  const results = []
  try {
    // `Page.enable` chỉ cần một lần cho cả phiên.
    await send('Page.enable')

    for (const locale of ['vi', 'en']) {
      const dir = join(OUT, locale)
      mkdirSync(dir, { recursive: true })

      for (const [route, name] of ROUTES) {
        consoleErrors = []

        // Chặt locale + token rồi tải lại trang để ứng dụng đọc đúng giá trị.
        await send('Runtime.evaluate', {
          expression: `localStorage.setItem('novafilm.locale', ${JSON.stringify(locale)});
                       localStorage.setItem('token', ${JSON.stringify(token)});`,
        })
        await send('Page.navigate', { url: BASE + route })
        await sleep(2600)
        await send('Page.reload', { ignoreCache: false })
        await sleep(2600)

        const textRes = await send('Runtime.evaluate', {
          expression: 'document.body ? document.body.innerText : ""',
          returnByValue: true,
        })
        const text = textRes?.result?.value ?? ''

        const apiDown = API_ERROR_MARKERS.some((m) => text.includes(m))
        const cjk = apiDown ? -1 : (text.match(/[\u4e00-\u9fff]/g) || []).length
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

        results.push({ locale, route, cjk, rawKeys, visible, apiDown, errors: consoleErrors.length, cjkLines })

        console.log(
          `${locale}  ${route.padEnd(34)} cjk=${String(cjk).padStart(4)}` +
            (rawKeys.length ? `  KEY_LEAK=${rawKeys.join(',')}` : '') +
            (consoleErrors.length ? `  JS_ERROR=${consoleErrors.length}` : '') +
            (visible < 40 ? '  <-- TRANG RONG' : ''),
        )
        if (process.env.AUDIT_VERBOSE && cjk > 0) {
          for (const line of cjkLines) console.log(`        | ${line.slice(0, 160)}`)
        }
      }
    }
  } finally {
    // Chỉ đóng tab ở đây, MỘT LẦN, sau khi đã đo xong. Gọi ở giữa chừng sẽ khiến Edge tự
    // tắt — xem `closeTab`.
    await closeTab(ws, tab)
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2))

  console.log('\n===== TONG HOP =====')
  for (const locale of ['vi', 'en']) {
    const rows = results.filter((r) => r.locale === locale)
    const broken = rows.filter((r) => r.apiDown)
    const scored = rows.filter((r) => !r.apiDown)
    const bad = scored.filter((r) => r.cjk > 0 || r.rawKeys.length || r.errors || r.visible < 40)
    const total = scored.reduce((a, r) => a + r.cjk, 0)
    console.log(
      `${locale}: ${rows.length} route · ${total} ky tu Trung · ${bad.length} route van van` +
        (broken.length ? ` · ${broken.length} route API CHET (khong duoc tinh vao tong)` : ''),
    )
    for (const r of broken) {
      console.log(`   ${r.route.padEnd(34)} API_CHET — trang hien loi, so 0 ky tu Trung la SAI`)
    }
    for (const r of bad) {
      console.log(
        `   ${r.route.padEnd(34)} cjk=${r.cjk}` +
          (r.rawKeys.length ? ` keyLeak=${r.rawKeys.length}` : '') +
          (r.errors ? ` jsError=${r.errors}` : '') +
          (r.visible < 40 ? ' RONG' : ''),
      )
    }
  }
}

/**
 * Giết Edge của **chính lần chạy này**, tìm theo profile chứ không theo pid.
 *
 * Vì sao không theo pid: tiến trình mà `spawn` trả về (`edge.pid`) **thoát ngay lập tức** —
 * Edge trên Windows tự khởi chạy tiến trình trình duyệt thật rồi để tiến trình launcher đó
 * chết. Đo được: `edge.pid` có `exitCode === 0` trong vòng 3 giây, và
 * `taskkill /PID <edge.pid> /T /F` ném lỗi "Command failed" rồi **không giết được gì** —
 * 21 tiến trình Edge vẫn sống sau đó. Nghĩa là `taskkillTree(edge.pid)` chưa bao giờ có tác
 * dụng gì trên máy này, và mọi lần chạy đều rò ra cả cây tiến trình.
 *
 * Profile thì luôn duy nhất theo pid của node, nên lọc theo nó vừa **chính xác** (không đụng
 * Edge của lane khác hay của người dùng) vừa **chắc chắn** bắt được tiến trình thật.
 */
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
  } catch {
    // Không tìm được thì không chặn dọn dẹp phần còn lại.
  }

  for (const pid of pids) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      try { process.kill(pid) } catch { /* da chet */ }
    }
  }
  return pids.length
}

// Đừng để bất cứ thứ gì thoát ra ngoài mà không in. Một lỗi nuốt im ở đây tạo ra đúng
// triệu chứng khó chịu nhất: script "chạy xong" nhưng không kiểm tra được gì cả.
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
