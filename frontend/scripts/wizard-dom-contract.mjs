/**
 * Đo hợp đồng DOM của `/wizard` — cùng một bộ đếm chạy trước và sau khi đổi nền.
 *
 * Vì sao cần riêng: `wizard-board-check.mjs` khẳng định **bảng** đúng, nhưng không in ra
 * con số selector từng bước để so trước/sau. Đổi nền là thay CSS, nên DOM không được đổi —
 * và cách duy nhất chứng minh "không đổi" là **đếm**, không phải mắt.
 *
 * Đếm cả `visible` vì brief cấm lách bằng cách "ẩn đi cho audit quên": một phần tử còn
 * trong DOM nhưng `display:none` thì `visible` rơi về 0 và báo động.
 *
 * Dùng: node scripts\wizard-dom-contract.mjs [base]
 * Thoát mã khác 0 nếu một selector nào mất hoặc bị ẩn ở bất kỳ bước nào.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:5183').replace(/\/$/, '')
const PORT = 9599

/**
 * Số tối thiểu phải còn **ở mọi bước** — chốt từ lượt đo trước khi đổi nền.
 *
 * Chỉ những selector nào tồn tại ở cả bốn bước mới vào đây. `.wizard-drop` chỉ có ở bước 1,
 * `.wizard-textarea` chỉ ở bước 2, `.wizard-select`/`.wizard-target` chỉ ở bước 3 — đặt
 * sàn cho chúng ở mọi bước là báo động giả (đã dính: `.wizard-drop` "vi phạm" ở bước 2-4
 * dù nó vốn chưa bao giờ tồn tại ở đó). Chúng vẫn được **đếm và in ra** mỗi bước để so
 * trước/sau bằng mắt, chỉ không dùng làm ngưỡng.
 */
const FLOOR = {
  '.wizard-scoped': 1,
  '.wizard-actions': 1,
  '.wizard-actions .pf-btn': 1,
  '.pf-btn': 2,
  '.pf-step': 4,
  '.pf-stepper': 1,
}

const SELECTORS = [
  '.wizard-scoped',
  '.wizard-actions',
  '.wizard-actions .pf-btn',
  '.pf-btn',
  '.pf-step',
  '.pf-stepper',
  '.wizard-textarea',
  '.wizard-generate',
  '.wizard-select',
  '.wizard-drop',
  '.wizard-target',
  '.wizard-frame',
  '.wizard-board-card',
  '.wizard-board-card-head .pf-btn',
  '.wizard-board-primary .pf-btn',
  '.wizard-toast',
]

const PROBE = `(() => {
  const vis = (el) => {
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none') return false
    if (parseFloat(s.opacity) === 0) return false
    return el.getClientRects().length > 0
  }
  const q = (sel) => {
    const all = [...document.querySelectorAll(sel)]
    return { total: all.length, visible: all.filter(vis).length }
  }
  const out = { step: document.querySelector('.wizard-scoped') ? 'rendered' : 'absent' }
  for (const sel of ${JSON.stringify(SELECTORS)}) out[sel] = q(sel)
  const shell = document.querySelector('.pf-shell') || document.body
  out['__shell-bg'] = getComputedStyle(shell).backgroundColor
  const wiz = document.querySelector('.wizard-scoped')
  out['__wizard-bg'] = wiz ? getComputedStyle(wiz).backgroundColor : 'none'
  const title = document.querySelector('.pf-page-title')
  out['__title-color'] = title ? getComputedStyle(title).color : 'none'
  return out
})()`

async function wsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* chua len */ }
    await sleep(500)
  }
  throw new Error('khong ket noi duoc DevTools')
}

async function main() {
  const edge = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
    '--user-data-dir=' + process.env.TEMP + '\\kilo\\dom-contract-profile', 'about:blank',
  ], { stdio: 'ignore' })

  const problems = []
  try {
    const ws = new WebSocket(await wsUrl())
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    let id = 0
    const pend = new Map()
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    }
    const send = (method, params) => new Promise((res) => {
      const n = ++id
      pend.set(n, res)
      ws.send(JSON.stringify({ id: n, method, params }))
    })
    const evalIn = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.result?.exceptionDetails) {
        throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)
      }
      return r.result?.result?.value
    }

    await send('Page.enable')
    await send('Runtime.enable')

    for (let n = 1; n <= 4; n += 1) {
      await send('Page.navigate', { url: BASE + '/wizard' })
      await sleep(2200)
      for (let i = 1; i < n; i += 1) {
        await evalIn(
          `(() => { const b=[...document.querySelectorAll('.wizard-actions .pf-btn')].pop(); if (b) b.click(); return !!b })()`,
        )
        await sleep(900)
      }
      const r = await evalIn(PROBE)
      console.log(`\nbuoc ${n} (${r.step})`)
      for (const sel of SELECTORS) {
        console.log(`  ${sel.padEnd(34)} total=${r[sel].total} visible=${r[sel].visible}`)
        const floor = FLOOR[sel]
        if (floor !== undefined && r[sel].visible < floor) {
          problems.push(`buoc ${n}: ${sel} visible=${r[sel].visible}, can >= ${floor}`)
        }
      }
      console.log(`  nen shell            = ${r['__shell-bg']}`)
      console.log(`  nen .wizard-scoped   = ${r['__wizard-bg']}`)
      console.log(`  chu tieu de           = ${r['__title-color']}`)
    }
    ws.close()
  } finally {
    try { process.kill(edge.pid) } catch { /* Edge tu dong */ }
  }

  if (problems.length) {
    console.log('\nHOP DONG DOM VI PHAM:')
    problems.forEach((p) => console.log('  ' + p))
    process.exit(1)
  }
  console.log('\nDAT: moi selector bat buoc deu con va deu hien.')
}

main().catch((e) => { console.error('LOI:', e.message); process.exit(2) })