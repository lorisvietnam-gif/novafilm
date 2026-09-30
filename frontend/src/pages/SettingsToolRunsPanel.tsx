import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Eye } from 'lucide-react'
import BillingErrorNotice from '../components/billing/BillingErrorNotice'
import Modal from '../components/ui/Modal'
import Pagination from '../components/ui/Pagination'
import EmptyState from '../components/ui/EmptyState'
import { fetchMediaBlob, triggerBlobDownload } from '../lib/clientDownload'
import {
  getToolRun,
  listToolRuns,
  resolveToolMediaUrl,
  type ToolRunRecord,
} from '../api/tools'
import { chipDisplayLabel, getToolDef, localizeToolDef } from '../lib/toolsCatalog'
import { pageCountOf } from '../lib/pagination'
import { LOCALE_DATE, getActiveLocale } from '../i18n/detect'
import { useI18n, type Messages } from '../i18n'
import { useLocalizedText } from '../lib/useLocalizedText'
import { localized, type LocalizedText } from '../lib/localeStrings'

const PAGE_SIZE_DEFAULT = 8

/**
 * Khoá là trạng thái từ backend; chỉ nhãn hiển thị mới dịch.
 */
const STATUS_LABEL: Record<string, LocalizedText> = {
  queued: { zh: '生成中', en: 'Generating', vi: 'Đang tạo' },
  running: { zh: '生成中', en: 'Generating', vi: 'Đang tạo' },
  succeeded: { zh: '已完成', en: 'Done', vi: 'Đã xong' },
  failed: { zh: '失败', en: 'Failed', vi: 'Thất bại' },
}

const COPY: Record<string, LocalizedText> = {
  title: { zh: '工具创作', en: 'Tool creations', vi: 'Tác vụ tạo bằng công cụ' },
  lede: {
    zh: '文生图、图生图、视频等独立工具的生成记录',
    en: 'History from the standalone tools: text-to-image, image-to-image, video',
    vi: 'Lịch sử từ các công cụ độc lập: văn bản ra ảnh, ảnh ra ảnh, văn bản ra video',
  },
  goCreate: { zh: '去创作', en: 'Create something', vi: 'Đi tạo nội dung' },
  loading: { zh: '加载中…', en: 'Loading…', vi: 'Đang tải…' },
  loadFailed: { zh: '加载失败', en: 'Could not load the history', vi: 'Không tải được lịch sử' },
  detailFailed: { zh: '加载详情失败', en: 'Could not load the details', vi: 'Không tải được chi tiết' },
  downloadFailed: { zh: '下载失败', en: 'The download failed', vi: 'Tải về thất bại' },
  empty: { zh: '还没有工具创作记录', en: 'No tool creations yet', vi: 'Chưa có tác vụ tạo nào' },
  view: { zh: '查看', en: 'View', vi: 'Xem' },
  downloading: { zh: '下载中…', en: 'Downloading…', vi: 'Đang tải…' },
  download: { zh: '下载', en: 'Download', vi: 'Tải về' },
  paginationLabel: { zh: '工具创作分页', en: 'Tool creation pages', vi: 'Phân trang tác vụ tạo' },
  detailTitle: { zh: '创作详情', en: 'Creation details', vi: 'Chi tiết tác vụ tạo' },
  recreate: { zh: '再创作', en: 'Create another', vi: 'Tạo tiếp' },
  downloadResult: { zh: '下载结果', en: 'Download the result', vi: 'Tải kết quả về' },
  resultAlt: { zh: '生成结果', en: 'Generation result', vi: 'Kết quả tạo' },
  notReady: { zh: ' · 结果尚未就绪', en: ' · the result is not ready yet', vi: ' · kết quả chưa sẵn sàng' },
  fieldStatus: { zh: '状态', en: 'Status', vi: 'Trạng thái' },
  fieldTime: { zh: '时间', en: 'Time', vi: 'Thời gian' },
  fieldPrompt: { zh: '提示词', en: 'Prompt', vi: 'Prompt' },
  fieldRatio: { zh: '画幅', en: 'Frame', vi: 'Khung hình' },
  fieldMode: { zh: '输出类型', en: 'Output type', vi: 'Loại đầu ra' },
  fieldPack: { zh: '工具包', en: 'Toolkit', vi: 'Bộ công cụ' },
  fieldError: { zh: '错误', en: 'Error', vi: 'Lỗi' },
  downloadFile: { zh: '下载文件 {n}', en: 'Download file {n}', vi: 'Tải tệp {n}' },
}

// Định dạng thời gian của bản ghi
function formatWhen(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(LOCALE_DATE[getActiveLocale()], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Ảnh bìa: ảnh xem trước, hoặc tấm đầu tiên trong kết quả
function coverOf(item: ToolRunRecord): string {
  return resolveToolMediaUrl(item.preview_url || item.urls[0] || '')
}

// Kết quả có phải video không
function isVideoRecord(item: ToolRunRecord, url?: string): boolean {
  if (item.kind === 'video') return true
  const target = url || item.urls[0] || item.preview_url || ''
  return /\.mp4($|\?)/i.test(target)
}

// Tên tệp khi tải về: tên công cụ + id của bản ghi
function downloadName(item: ToolRunRecord, url: string): string {
  const tool = getToolDef(item.tool_id)
  const title = (tool?.title || item.tool_id).replace(/\s+/g, '')
  const ext = isVideoRecord(item, url) ? 'mp4' : url.match(/\.([a-z0-9]{3,4})($|\?)/i)?.[1] || 'png'
  return `${title}_${item.id}.${ext}`
}

/**
 * Tên công cụ đã dịch. tool_id lạ (dữ liệu cũ, công cụ đã bị gỡ khỏi danh mục) thì
 * lùi về chính id thay vì ném lỗi.
 */
function toolTitleOf(toolId: string, m: Messages): string {
  const def = getToolDef(toolId)
  return def ? localizeToolDef(def, m).title : toolId
}

/** Danh sách "Tác vụ tạo bằng công cụ" trong Tài khoản: phân trang ở server, xem và tải chi tiết */
export default function SettingsToolRunsPanel() {
  const { m } = useI18n()
  const lt = useLocalizedText()
  /*
   * page          số trang
   * pageSize      số bản ghi mỗi trang
   * items         các bản ghi của trang hiện tại
   * total         tổng số bản ghi
   * loading       đang tải
   * error         lỗi
   * detail        bản ghi đang mở trong popup
   * detailLoading đang tải chi tiết
   * downloading   url đang tải về
   * actionError   lỗi của thao tác tải / xem chi tiết
   */
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT)
  const [items, setItems] = useState<ToolRunRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ToolRunRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    listToolRuns(page, pageSize)
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : localized(COPY.loadFailed))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, pageSize])

  const pageCount = pageCountOf(total, pageSize)

  // Mở chi tiết: gọi lại API để chắc chắn có URL OSS mới nhất
  async function openDetail(item: ToolRunRecord) {
    setActionError('')
    setDetail(item)
    setDetailLoading(true)
    try {
      const fresh = await getToolRun(item.id)
      setDetail(fresh)
      setItems((prev) => prev.map((row) => (row.id === fresh.id ? fresh : row)))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : localized(COPY.detailFailed))
    } finally {
      setDetailLoading(false)
    }
  }

  // Tải kết quả từ địa chỉ OSS / địa chỉ công khai
  async function downloadUrl(item: ToolRunRecord, url: string) {
    const abs = resolveToolMediaUrl(url)
    if (!abs) return
    setActionError('')
    setDownloading(abs)
    try {
      const blob = await fetchMediaBlob(abs)
      triggerBlobDownload(blob, downloadName(item, abs))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : localized(COPY.downloadFailed))
    } finally {
      setDownloading('')
    }
  }

  // tool_id lạ (dữ liệu cũ, công cụ đã bị gỡ) thì lùi về chính id thay vì crash.
  const detailToolTitle = detail ? toolTitleOf(detail.tool_id, m) : ''

  return (
    <section className="pf-settings-card">
      <div className="pf-settings-card-head">
        <div>
          <h1>{lt(COPY.title)}</h1>
          <p className="pf-muted">{lt(COPY.lede)}</p>
        </div>
        <div className="pf-settings-actions">
          <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/tools">
            {lt(COPY.goCreate)}
          </Link>
        </div>
      </div>
      {loading ? <p className="pf-muted">{lt(COPY.loading)}</p> : null}
      {error ? <BillingErrorNotice message={error} /> : null}
      {actionError ? <BillingErrorNotice message={actionError} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState imageStyle="cgi-3d-animation" className="pf-settings-empty">
          <p>{lt(COPY.empty)}</p>
          <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/tools">
            {lt(COPY.goCreate)}
          </Link>
        </EmptyState>
      ) : null}
      {items.length > 0 ? (
        <ul className="pf-settings-list">
          {items.map((item) => {
            const toolTitle = toolTitleOf(item.tool_id, m)
            const cover = coverOf(item)
            const video = isVideoRecord(item, cover)
            const firstUrl = item.urls[0] || item.preview_url || ''
            const canDownload = item.status === 'succeeded' && Boolean(firstUrl)
            return (
              <li key={item.id}>
                <div className="pf-settings-list-row pf-settings-tool-row">
                  <button type="button" className="pf-settings-tool-main" onClick={() => void openDetail(item)}>
                    {cover ? (
                      video && !item.preview_url ? (
                        <video className="pf-settings-thumb" src={cover} muted />
                      ) : (
                        <img className="pf-settings-thumb" src={cover} alt="" />
                      )
                    ) : (
                      <span className="pf-settings-thumb is-empty" aria-hidden />
                    )}
                    <span className="pf-settings-list-main">
                      <strong>{toolTitle}</strong>
                      <em className="pf-muted">
                        {lt(STATUS_LABEL[item.status] ?? { zh: item.status, en: item.status, vi: item.status })}
                        {item.prompt ? ` · ${item.prompt.slice(0, 36)}` : ''}
                      </em>
                    </span>
                  </button>
                  <span className="pf-settings-tool-actions">
                    <span className="pf-settings-list-meta pf-muted">{formatWhen(item.created_at)}</span>
                    <button
                      type="button"
                      className="pf-btn pf-btn-ghost pf-btn-sm"
                      onClick={() => void openDetail(item)}
                    >
                      <Eye size={14} aria-hidden />
                      {lt(COPY.view)}
                    </button>
                    <button
                      type="button"
                      className="pf-btn pf-btn-ghost pf-btn-sm"
                      disabled={!canDownload || downloading === resolveToolMediaUrl(firstUrl)}
                      onClick={() => void downloadUrl(item, firstUrl)}
                    >
                      <Download size={14} aria-hidden />
                      {downloading === resolveToolMediaUrl(firstUrl) ? lt(COPY.downloading) : lt(COPY.download)}
                    </button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onChange={setPage}
        ariaLabel={lt(COPY.paginationLabel)}
      />

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detailToolTitle || lt(COPY.detailTitle)}
        size="lg"
        className="pf-tool-run-modal"
        footer={
          detail ? (
            <div className="pf-tool-run-foot">
              <Link className="pf-btn pf-btn-ghost pf-btn-sm" to={`/tools/${detail.tool_id}`} onClick={() => setDetail(null)}>
                {lt(COPY.recreate)}
              </Link>
              {detail.urls[0] || detail.preview_url ? (
                <button
                  type="button"
                  className="pf-btn pf-btn-lime pf-btn-sm"
                  disabled={
                    detail.status !== 'succeeded' ||
                    downloading === resolveToolMediaUrl(detail.urls[0] || detail.preview_url || '')
                  }
                  onClick={() => void downloadUrl(detail, detail.urls[0] || detail.preview_url || '')}
                >
                  <Download size={14} aria-hidden />
                  {lt(COPY.downloadResult)}
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {detailLoading && !detail?.urls.length ? <p className="pf-muted">{lt(COPY.loading)}</p> : null}
        {detail ? (
          <div className="pf-tool-run-detail">
            <div className="pf-tool-run-media">
              {detail.urls.length || detail.preview_url ? (
                isVideoRecord(detail) && (detail.urls[0] || '').match(/\.mp4/i) ? (
                  <video src={resolveToolMediaUrl(detail.urls[0])} controls playsInline />
                ) : (
                  <img
                    src={resolveToolMediaUrl(detail.urls[0] || detail.preview_url)}
                    alt={lt(COPY.resultAlt)}
                  />
                )
              ) : (
                <p className="pf-muted">
                  {lt(STATUS_LABEL[detail.status] ?? { zh: detail.status, en: detail.status, vi: detail.status })}
                  {detail.error ? ` · ${detail.error}` : lt(COPY.notReady)}
                </p>
              )}
            </div>
            <dl className="pf-tool-run-meta">
              <div>
                <dt>{lt(COPY.fieldStatus)}</dt>
                <dd>{lt(STATUS_LABEL[detail.status] ?? { zh: detail.status, en: detail.status, vi: detail.status })}</dd>
              </div>
              <div>
                <dt>{lt(COPY.fieldTime)}</dt>
                <dd>{formatWhen(detail.created_at)}</dd>
              </div>
              {detail.prompt ? (
                <div className="is-block">
                  <dt>{lt(COPY.fieldPrompt)}</dt>
                  <dd>{detail.prompt}</dd>
                </div>
              ) : null}
              {detail.params?.ratio ? (
                <div>
                  <dt>{lt(COPY.fieldRatio)}</dt>
                  <dd>{detail.params.ratio}</dd>
                </div>
              ) : null}
              {detail.params?.mode ? (
                <div>
                  <dt>{lt(COPY.fieldMode)}</dt>
                  <dd>{chipDisplayLabel(detail.params.mode, m)}</dd>
                </div>
              ) : null}
              {detail.params?.pack ? (
                <div>
                  <dt>{lt(COPY.fieldPack)}</dt>
                  <dd>{chipDisplayLabel(detail.params.pack, m)}</dd>
                </div>
              ) : null}
              {detail.error ? (
                <div className="is-block">
                  <dt>{lt(COPY.fieldError)}</dt>
                  <dd className="pf-error">{detail.error}</dd>
                </div>
              ) : null}
            </dl>
            {detail.urls.length > 1 ? (
              <div className="pf-tool-run-files">
                {detail.urls.map((url, idx) => (
                  <button
                    key={url}
                    type="button"
                    className="pf-btn pf-btn-ghost pf-btn-sm"
                    disabled={downloading === resolveToolMediaUrl(url)}
                    onClick={() => void downloadUrl(detail, url)}
                  >
                    <Download size={14} aria-hidden />
                    {lt(COPY.downloadFile).replace('{n}', String(idx + 1))}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
