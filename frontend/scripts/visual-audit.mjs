/**
 * Audit thị giác NOVAFILM — chụp màn hình thật + quét tiếng Trung còn sót.
 *
 * Không cài gì thêm: dùng Microsoft Edge có sẵn ở chế độ headless, điều khiển qua
 * Chrome DevTools Protocol bằng WebSocket của Node 24.
 *
 * Chạy:  node audit.mjs
 * Xem:   C:\Users\NOVAST~1\AppData\Local\Temp\kilo\audit\<locale>\<route>.png
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = Number(process.env.AUDIT_CDP_PORT || 9333)
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173'
const API = process.env.AUDIT_API || 'http://127.0.0.1:8000'
const OUT = process.env.AUDIT_OUT || 'C:\\Users\\NOVAST~1\\AppData\\Local\\Temp\\kilo\\audit'
const PROFILE =
  process.env.AUDIT_PROFILE || 'C:\\Users\\NOVAST~1\\AppData\\Local\\Temp\\kilo\\edge-profile'
/** `AUDIT_LOCALES=vi` để chạy một nửa lượt khi máy đang bận chạy song song. */
const LOCALES = (process.env.AUDIT_LOCALES || 'vi,en').split(',').filter(Boolean)

const CJK = /[\u4e00-\u9fff]/g
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

/** Trang đã render xong chưa: DOM không rỗng và số ký tự đã đứng yên. */
const PAGE_PROBE =
  'JSON.stringify([document.readyState, document.body ? document.body.innerText : ""])'

const MIN_VISIBLE = 40
const STABLE_MS = 700
const RENDER_TIMEOUT_MS = 10000
const MAX_RELOADS = 1

async function waitForStableText(send) {
  const deadline = Date.now() + RENDER_TIMEOUT_MS
  let last = null
  let stableSince = Date.now()
  while (Date.now() < deadline) {
    const res = await send('Runtime.evaluate', { expression: PAGE_PROBE, returnByValue: true })
    let probe = ['loading', '']
    try {
      probe = JSON.parse(res?.result?.value || '[]')
    } catch { /* DOM chua san */ }
    const [ready, text] = [probe[0] || 'loading', probe[1] || '']

    // Chỉ coi là "đứng yên" khi trang đã tải xong. Nếu không, một trang đang trắng
    // cũng "ổn định" suốt 700 ms và ta chụp phải trang trắng — đúng cái lỗi mà
    // sleep cứng gây ra.
    if (ready !== 'complete') {
      last = null
      stableSince = Date.now()
    } else if (text !== last) {
      last = text
      stableSince = Date.now()
    } else if (Date.now() - stableSince >= STABLE_MS) {
      return text
    }
    await sleep(250)
  }
  return last || ''
}

/**
 * Đọc nội dung trang, nạp lại tối đa `MAX_RELOADS` lần nếu lần đầu ra trang trắng.
 * Lần nạp lại là để chờ Vite transform xong; nếu vẫn trắng thì đó là dữ liệu thiếu
 * thật và phải hiện ra trong báo cáo chứ không phải lỗi đo.
 */
async function readRendered(send) {
  let text = await waitForStableText(send)
  let reloads = 0
  while (text.trim().length < MIN_VISIBLE && reloads < MAX_RELOADS) {
    reloads += 1
    await send('Page.reload', { ignoreCache: false })
    text = await waitForStableText(send)
  }
  return { text, retried: reloads > 0 }
}

/** Mở một route, ép locale + token, chờ render rồi chụp và đếm. */
async function auditRoute({ locale, route, name, dir, token, results }) {
  const tab = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/')}`, {
      method: 'PUT',
    })
  ).json()

  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const consoleErrors = []

  try {
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
    await sleep(800)
    await send('Page.reload', { ignoreCache: false })

    // Chờ thật sự có nội dung thay vì đợi mốc thời gian cứng. Máy chạy song song
    // nhiều audit thì lần đầu Vite còn phải transform module, vài giây chưa chắc
    // đủ — chụp lúc đó ra trang trắng và đo ra số liệu sai cho cả route.
    const { text, retried } = await readRendered(send)

    const cjk = (text.match(CJK) || []).length
    const rawKeys = [...new Set(text.match(RAW_KEY) || [])]
    const visible = text.trim().length

    const shot = await send('Page.captureScreenshot', { format: 'png' })
    if (shot?.data) {
      writeFileSync(join(dir, `${name}.png`), Buffer.from(shot.data, 'base64'))
    }

    results.push({ locale, route, cjk, rawKeys, visible, errors: consoleErrors.length, retried })

    console.log(
      `${locale}  ${route.padEnd(34)} cjk=${String(cjk).padStart(4)}` +
        (rawKeys.length ? `  KEY_LEAK=${rawKeys.join(',')}` : '') +
        (consoleErrors.length ? `  JS_ERROR=${consoleErrors.length}` : '') +
        (retried ? '  (nap lai)' : '') +
        (visible < 40 ? '  <-- TRANG RONG' : ''),
    )
  } finally {
    ws.close()
    await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {})
  }
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

/**
 * Nội dung mẫu để trang chi tiết tập render **có nghĩa**, không phải khung rỗng.
 *
 * Vì sao phải tự viết thay vì bấm nút trên UI: nút đó gọi LLM để sinh
 * `script.summary` + `script.episode_content`. Máy audit không có API Key, nên
 * `summary_status` rơi về `failed` và hai field đó là `null`. Đúng như vậy,
 * `POST /api/drama/episodes/seed_from_script` trả 400 `请先生成分集剧本`
 * (app/services/drama/seed.py:836). Bước seed vì thế phải đi qua
 * `PATCH /api/drama/scripts/{id}` — đúng đường mà UI dùng khi người dùng tự sửa
 * kịch bản — chứ không gọi LLM.
 *
 * Vì sao tiếng Việt mà vẫn cần dấu cấu trúc tiếng Trung: `split_episode_content_into_scenes`
 * và `extract_scene_meta` (app/services/drama/build_fragments.py:23,27,31) nhận diện
 * `### 场1-1`, `日 外 <dia diem>` và `出场人物：<dien vien>`; `_strip_screenplay_meta:229`
 * gom đúng ba dòng đó thành metadata nên chúng **không** lọt ra giao diện. Phần thoại
 * và tên bối cảnh thì viết tiếng Việt, để số ký tự Trung audit đo được là lỗi i18n thật
 * chứ không phải tiếng Trung trong dữ liệu thử.
 */
const SEED_SUMMARY = {
  seriesTitle: 'Kiem thu Drama',
  storyType: 'hien thuc',
  characters: [
    {
      name: 'Linh',
      // visualImage là prompt duy nhất nếu các truong mo ta deu rong, nen khong
      // sinh ra tien Trung trong visualPrompt (seed_asset_params.py:38).
      visualImage:
        'Co be 24 tuoi, toc ngan ngang vai, ao khoac len, nhin sang nhung con pho nho phia cua',
      identityBackground: 'Nha kinh doanh san pham gia dinh, chay xe ban dem o khu pho xa.',
      personality: 'Nhanh nhay, hay de ngh',
    },
    {
      name: 'Minh',
      visualImage: 'Thanh nien 26 tuoi, ao som den, luon mang theo mot cuon so tay nho ben tay',
      identityBackground: 'Ky su cham dung o cong vien, quen khong roi bao lau.',
      personality: 'Binh tinh, it noi',
    },
  ],
}

const SEED_SCENES = ['Quan ca phe goc pho', 'Cong vien nho duoi chan cau']

const SEED_EPISODE_CONTENT = {
  episodes: [
    {
      episodeNumber: 1,
      title: 'Tap 1 - Cuoc gap o cong vien',
      body: [
        '### 场1-1',
        '日 外 Cong vien nho duoi chan cau',
        '出场人物：Linh, Minh',
        'Linh ngoi tren ghe, tung mot mieng hoa duong len ngay, ninh pho manh cua khu pho.',
        'Minh (dung lai): Sao van ngon o day?',
        'Linh (nhe): To nen chua ve nha.',
        '### 场1-2',
        '日 内 Quan ca phe goc pho',
        '出场人物：Linh, Minh',
        'Minh day cua ra, nhin Linh mot luc roi ngon nhe.',
        'Linh (cuoi): Cho to mot ly den khi nao anh khong hoi nua.',
      ].join('\n'),
    },
    {
      episodeNumber: 2,
      title: 'Tap 2 - Manh noi trong quyet',
      body: [
        '### 场2-1',
        '夜 内 Quan ca phe goc pho',
        '出场人物：Linh, Minh',
        'Minh (tram tu): Toi da ra hieu doan mot lan roi, lan nay la lan cuoi.',
        'Linh (im lang): Anh biet chuyen gi dang xay ra o day chu?',
        'Minh (nhe): To hon chuyen gi, va toi khong muon biết.',
      ].join('\n'),
    },
  ],
}

/** `PATCH /api/drama/scripts/{id}` ghi thẳng 2 field này — không cần LLM. */
const SEED_SCRIPT_PATCH = {
  summary: SEED_SUMMARY,
  episode_content: SEED_EPISODE_CONTENT,
}

/** Bối cảnh cần có TRƯỚC khi seed, để seed tìm thấy và dùng lại thay vì tự sinh prompt. */
async function ensureSceneAssets(headers, projectId) {
  for (const name of SEED_SCENES) {
    // POST /assets tự trả về bản cũ nếu trùng type+name, nên gọi lại vô hại.
    await api('/api/drama/assets', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        project_id: projectId,
        type: 'scene',
        asset_type: 'image',
        name,
        params: {
          visualImage: `Khong gian ${name.toLowerCase()}, mau phim anh trang, bo cuc ro rang`,
          visualPrompt: `Khong gian ${name.toLowerCase()}, mau phim anh trang, bo cuc ro rang`,
          kind: 'scene',
        },
      }),
    })
  }
}

async function ensureScript(headers, projectId) {
  let script = null
  try {
    script = await api(`/api/drama/scripts/${projectId}`, { headers })
  } catch {
    return 'khong co ban kich ban'
  }
  const hasBodies = Array.isArray(script.episode_content?.episodes) &&
    script.episode_content.episodes.some((e) => e && (e.body || e.content))
  if (hasBodies) return 'da co san'
  // 400 '请先生成分集剧本' xuat tu day, khong phai do thieu query.
  await api(`/api/drama/scripts/${projectId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(SEED_SCRIPT_PATCH),
  })
  return 'da ghi kich ban mau'
}

/** `GET /api/projects` trả `{items:[...]}`, còn các API khác trả mảng trần. */
function asList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

/**
 * Tạo dữ liệu thật để các route có `:id` render được. Không có bước này thì storyboard,
 * trình soạn, chi tiết tập và canvas đều trống, và audit sẽ báo "0 ký tự Trung" một cách
 * dễ chủ quan — tức là báo xong trong khi thực ra **chưa kiểm tra gì**.
 *
 * Mọi bước đều idempotent và tự vá: chạy lại trên database cũ vẫn lấy được đủ dữ liệu,
 * không cần thao tác tay.
 */
async function ensureData(token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const out = { studio: null, drama: null, episode: null, assets: 0, fragments: 0, notes: [] }

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

  let dramas = asList(await api('/api/drama/projects', { headers }))
  if (!dramas.length) {
    await api('/api/drama/projects', {
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
    dramas = asList(await api('/api/drama/projects', { headers }))
  }
  out.drama = dramas[0].id

  // Thu tu co y nghia: kich ban truoc (seed can summary), roi boi canh, cuoi cung moi tach tap.
  out.notes.push(`kich ban: ${await ensureScript(headers, out.drama)}`)
  await ensureSceneAssets(headers, out.drama)
  const seededAssets = await api(`/api/drama/assets/seed_from_script?project_id=${out.drama}`, {
    method: 'POST',
    headers,
  })
  out.notes.push(`tai nguyen: ${seededAssets.created_count ?? 0} moi, ${seededAssets.reused_count ?? 0} dung lai`)
  out.assets = asList(await api(`/api/drama/assets?project_id=${out.drama}`, { headers })).length

  // GET /api/drama/episodes?project_id=N — `/api/drama/projects/{id}/episodes` la 404.
  let eps = asList(await api(`/api/drama/episodes?project_id=${out.drama}`, { headers }))
  const needRebuild = !eps.length || !(eps[0].fragments || []).length
  if (needRebuild) {
    eps = asList(
      await api(`/api/drama/episodes/seed_from_script?project_id=${out.drama}&force=true`, {
        method: 'POST',
        headers,
      }),
    )
  }
  if (!eps.length) {
    throw new Error('khong tach duoc tap nao tu kich ban vua ghi')
  }
  out.episode = eps[0].id
  out.fragments = eps.reduce((a, e) => a + ((e.fragments || []).length), 0)
  out.notes.push(`tap: ${eps.length}, tong phan manh: ${out.fragments}`)

  return out
}

async function main() {
  const token = await getToken()
  console.log('da lay token')

  const ids = await ensureData(token)
  console.log(
    `du lieu: studio=${ids.studio} drama=${ids.drama} episode=${ids.episode} ` +
      `tai-nguyen=${ids.assets} phan-manh=${ids.fragments}`,
  )
  for (const note of ids.notes) console.log(`  · ${note}`)
  if (!ids.episode) {
    throw new Error('CHUA CO TAP — route chi tiet tap se trong. Audit khong phu day.')
  }

  // `AUDIT_SEED_ONLY=1` chỉ chạy bước seed, không bật Edge — để kiểm seed nhanh.
  if (process.env.AUDIT_SEED_ONLY) return

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
  for (const locale of LOCALES) {
    const dir = join(OUT, locale)
    mkdirSync(dir, { recursive: true })

    for (const [route, name] of ROUTES) {
      // Một route lỗi không được làm hỏng cả lượt audit: ghi lại rồi đi tiếp,
      // để báo cáo nói đúng "route nào chưa kiểm được" thay vì im lặng.
      try {
        await auditRoute({ locale, route, name, dir, token, results })
      } catch (e) {
        results.push({ locale, route, cjk: 0, rawKeys: [], visible: 0, errors: 0, failed: e.message })
        console.log(`${locale}  ${route.padEnd(34)} LOI: ${e.message}`)
      }
    }
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2))

  console.log('\n===== TONG HOP =====')
  for (const locale of LOCALES) {
    const rows = results.filter((r) => r.locale === locale)
    const failed = rows.filter((r) => r.failed)
    const bad = rows.filter(
      (r) => !r.failed && (r.cjk > 0 || r.rawKeys.length || r.errors || r.visible < 40),
    )
    const total = rows.reduce((a, r) => a + r.cjk, 0)
    const empty = rows.filter((r) => !r.failed && r.visible < 40)
    console.log(
      `${locale}: ${rows.length} route · ${total} ky tu Trung · ${bad.length} route van van` +
        (empty.length ? ` · ${empty.length} route trang` : '') +
        (failed.length ? ` · ${failed.length} route loi` : ''),
    )
    for (const r of failed) {
      console.log(`   ${r.route.padEnd(34)} LOI=${r.failed}`)
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

  edge.kill()
}

main().catch((e) => {
  console.error('LOI:', e.stack || e.message)
  process.exit(1)
})

// Edge/CDP hay đứt giữa chừng khi máy bận; đừng để node chết im như thế.
process.on('unhandledRejection', (e) => {
  console.error('LOI (unhandledRejection):', e?.stack || e)
})
process.on('uncaughtException', (e) => {
  console.error('LOI (uncaughtException):', e?.stack || e)
})
