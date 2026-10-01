/** Thư viện tài nguyên toàn cục: phân loại theo nhân vật / bối cảnh / đạo cụ / giọng đọc, giọng đọc có thể nghe thử */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import AppShell from '../../components/layout/AppShell'
import Button from '../../components/ui/Button'
import FilterSelect from '../../components/ui/FilterSelect'
import Pagination from '../../components/ui/Pagination'
import PillFilter from '../../components/ui/PillFilter'
import { CharacterVoicePreviewButton } from '../../components/drama/CharacterVoicePreviewButton'
import {
  dramaApi,
  resolveDramaMediaUrl,
  type DramaAsset,
  type DramaProjectListItem,
} from '../../api/drama'
import { readAssetVoiceBinding } from './CharacterVoiceBindModal'
import { DramaImageLightbox } from './DramaImageLightbox'
import { filterDramaLibraryAssets, isDramaLibraryAsset } from '../../lib/dramaLibraryAssets'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../lib/dramaVoiceBinding'
import { pageCountOf } from '../../lib/pagination'
import { dramaProjectTitle } from '../../lib/projectTitleLabels'
import RequireAuth from './RequireAuth'
import './drama.css'

type AssetTabKey = 'all' | 'character' | 'scene' | 'prop' | 'voice'

const PAGE_SIZE_DEFAULT = 12
const PAGE_SIZE_OPTIONS = [12, 24, 36] as const

const TABS: Array<{ value: AssetTabKey; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'character', label: 'Nhân vật' },
  { value: 'scene', label: 'Bối cảnh' },
  { value: 'prop', label: 'Đạo cụ' },
  ...(DRAMA_VOICE_BINDING_ENABLED ? [{ value: 'voice' as const, label: 'Giọng đọc' }] : []),
]

const KIND_LABEL: Record<string, string> = {
  character: 'Nhân vật',
  scene: 'Bối cảnh',
  prop: 'Đạo cụ',
  voice: 'Giọng đọc',
}

export default function AssetLibraryPage() {
  return (
    <RequireAuth>
      <AssetLibraryInner />
    </RequireAuth>
  )
}

// Gán asset.type vào nhân vật / bối cảnh / đạo cụ / giọng đọc
function assetKind(asset: DramaAsset): AssetTabKey | 'other' {
  if (!isDramaLibraryAsset(asset)) return 'other'
  const t = (asset.type || '').toLowerCase()
  if (t === 'character' || t === 'scene' || t === 'prop' || t === 'voice') return t
  return 'other'
}

function matchTab(asset: DramaAsset, tab: AssetTabKey): boolean {
  if (!isDramaLibraryAsset(asset)) return false
  if (!DRAMA_VOICE_BINDING_ENABLED && assetKind(asset) === 'voice') return false
  if (tab === 'all') return true
  return assetKind(asset) === tab
}

function fileMeta(asset: DramaAsset): string {
  const kind = assetKind(asset)
  if (kind !== 'other') return KIND_LABEL[kind]
  const url = (asset.cover || asset.url || '').toLowerCase()
  const ext = url.match(/\.([a-z0-9]{2,5})(\?|$)/)?.[1]
  if (ext) return `.${ext}`
  return asset.type || 'Tệp'
}

// Địa chỉ nghe thử của tài nguyên giọng đọc hoặc của nhân vật đã gán giọng
function voicePreviewUrl(asset: DramaAsset): string {
  if (assetKind(asset) === 'voice') return asset.url || ''
  return readAssetVoiceBinding(asset)?.url || ''
}

function isImageLike(asset: DramaAsset): boolean {
  const kind = assetKind(asset)
  return kind === 'character' || kind === 'scene' || kind === 'prop' || kind === 'other'
}

// Render nội dung thư viện tài nguyên
function AssetLibraryInner() {
  /*
   * assets tài nguyên trong phạm vi dự án hiện tại
   * projects danh sách dự án (để lọc)
   * projectId id dự án đang chọn, chuỗi rỗng nghĩa là tất cả
   * tab nhân vật / bối cảnh / đạo cụ / giọng đọc
   * query từ khoá tìm kiếm
   * page trang hiện tại
   * playingId id tài nguyên đang nghe thử
   * error nội dung lỗi
   * loading đang tải
   */
  const [assets, setAssets] = useState<DramaAsset[]>([])
  const [projects, setProjects] = useState<DramaProjectListItem[]>([])
  const [projectId, setProjectId] = useState('')
  const [tab, setTab] = useState<AssetTabKey>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    dramaApi
      .listProjects()
      .then(setProjects)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const pid = projectId ? Number(projectId) : undefined
    dramaApi
      .listAssets(Number.isFinite(pid) ? pid : undefined, { libraryOnly: true })
      .then((rows) => {
        if (!cancelled) setAssets(filterDramaLibraryAssets(rows))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Tải dữ liệu thất bại')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  const projectNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of projects) map.set(p.id, dramaProjectTitle(p.title) || `Dự án #${p.id}`)
    return map
  }, [projects])

  const projectOptions = useMemo(
    () => [
      { value: '', label: 'Tất cả dự án' },
      ...projects.map((p) => ({
        value: String(p.id),
        label: dramaProjectTitle(p.title) || `Dự án #${p.id}`,
      })),
    ],
    [projects],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assets.filter((asset) => {
      if (!matchTab(asset, tab)) return false
      if (!q) return true
      const name = (asset.name || '').toLowerCase()
      const type = (asset.type || '').toLowerCase()
      const projectName = (projectNameById.get(asset.project_id) || '').toLowerCase()
      return (
        name.includes(q) ||
        type.includes(q) ||
        projectName.includes(q) ||
        String(asset.project_id).includes(q)
      )
    })
  }, [assets, tab, query, projectNameById])

  const pageCount = pageCountOf(filtered.length, pageSize)
  const safePage = Math.min(page, pageCount)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [tab, query, projectId, pageSize])

  // Nghe thử / tạm dừng giọng đọc ngay trên ảnh thu nhỏ của thẻ
  function toggleVoice(asset: DramaAsset) {
    const src = resolveDramaMediaUrl(voicePreviewUrl(asset))
    if (!src) {
      setError('Giọng đọc này chưa có bản tổng hợp để nghe thử')
      return
    }
    if (playingId === asset.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (!audioRef.current) audioRef.current = new Audio()
    audioRef.current.src = src
    audioRef.current.onended = () => setPlayingId(null)
    void audioRef.current.play().catch(() => setError('Phát âm thanh thất bại'))
    setPlayingId(asset.id)
  }

  return (
    <AppShell active="assets">
      <div className="drama-page pf-asset-page">
        <header className="pf-drama-list-head">
          <div className="pf-drama-list-title-row">
            <div>
              <h1>Quản lý tài nguyên</h1>
              <p className="pf-muted" style={{ margin: '0.35rem 0 0' }}>
                Duyệt theo nhân vật, bối cảnh, đạo cụ và giọng đọc
              </p>
            </div>
            <div className="pf-drama-list-actions">
              <Button to="/drama" variant="ghost" size="sm">
                Dự án Drama
              </Button>
              <Button to="/history" variant="ghost" size="sm">
                Lịch sử AI Short Video
              </Button>
              <Button to="/settings" variant="ghost" size="sm">
                Trung tâm cá nhân
              </Button>
            </div>
          </div>

          <div className="pf-drama-list-toolbar">
            <PillFilter options={TABS} value={tab} onChange={setTab} ariaLabel="Phân loại tài nguyên" />
            <div className="pf-asset-toolbar-filters">
              <FilterSelect
                label="Lọc theo dự án"
                value={projectId}
                options={projectOptions}
                onChange={setProjectId}
              />
              <label className="pf-drama-search">
                <span className="sr-only">Tìm tài nguyên</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm theo tên hoặc dự án"
                />
              </label>
            </div>
          </div>
        </header>

        {error ? <BillingErrorNotice message={error} className="drama-error" /> : null}

        <div className="pf-asset-toolbar-meta">
          <p className="pf-muted" style={{ margin: 0 }}>
            {loading
              ? 'Đang tải…'
              : `Tổng ${assets.length} tài nguyên · Sau khi lọc ${filtered.length} · Trang ${safePage}/${pageCount}`}
          </p>
        </div>

        {!loading && filtered.length === 0 ? (
          <div className="pf-empty-state is-compact">
            <p className="pf-muted">Chưa có tài nguyên nào trong phân loại này</p>
          </div>
        ) : (
          <>
            <div className="pf-asset-grid">
              {pageItems.map((asset) => {
                const kind = assetKind(asset)
                const mediaSrc = resolveDramaMediaUrl(asset.cover || (kind === 'voice' ? '' : asset.url))
                const projectLabel =
                  projectNameById.get(asset.project_id) || `Dự án #${asset.project_id}`
                const previewUrl = voicePreviewUrl(asset)
                const isVoice = kind === 'voice'
                const playing = playingId === asset.id
                return (
                  <article key={asset.id} className="pf-asset-card">
                    <div className={`pf-asset-thumb is-${kind}`}>
                      {isVoice ? (
                        <button
                          type="button"
                          className={`pf-asset-play${playing ? ' is-playing' : ''}`}
                          onClick={() => toggleVoice(asset)}
                          disabled={!previewUrl}
                          title={previewUrl ? (playing ? 'Dừng nghe thử' : 'Nghe thử giọng đọc') : 'Chưa có bản tổng hợp để nghe thử'}
                        >
                          <span className="pf-asset-play-icon" aria-hidden>
                            {playing ? <Pause size={20} strokeWidth={2} /> : <Play size={20} strokeWidth={2} />}
                          </span>
                        </button>
                      ) : mediaSrc && isImageLike(asset) ? (
                        <button
                          type="button"
                          className="pf-asset-thumb-btn"
                          onClick={() =>
                            setLightbox({ src: mediaSrc, alt: asset.name || fileMeta(asset) })
                          }
                          title="Xem ảnh lớn"
                        >
                          <img src={mediaSrc} alt={asset.name || ''} />
                        </button>
                      ) : (
                        <span>{fileMeta(asset)}</span>
                      )}
                    </div>
                    <h3>{asset.name || 'Chưa đặt tên'}</h3>
                    <p>
                      {fileMeta(asset)} · {projectLabel}
                    </p>
                    <div className="pf-asset-card-actions">
                      {DRAMA_VOICE_BINDING_ENABLED && previewUrl && !isVoice ? (
                        <CharacterVoicePreviewButton
                          url={previewUrl}
                          label={asset.name || undefined}
                          onError={setError}
                        />
                      ) : isVoice && !previewUrl ? (
                        <span className="pf-muted">Chưa có bản tổng hợp để nghe thử</span>
                      ) : null}
                      <Button to={`/drama/projects/${asset.project_id}`} variant="ghost" size="sm">
                        Mở dự án
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
            <Pagination
              page={safePage}
              pageCount={pageCount}
              total={filtered.length}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
              onChange={setPage}
              ariaLabel="Phân trang thư viện tài nguyên"
            />
          </>
        )}

        {lightbox ? (
          <DramaImageLightbox
            src={lightbox.src}
            alt={lightbox.alt}
            onClose={() => setLightbox(null)}
          />
        ) : null}
      </div>
    </AppShell>
  )
}
