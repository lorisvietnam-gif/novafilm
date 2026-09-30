/** Danh sách tập ở cột trái (dùng chung cho dàn ý / trang sửa tập / trang storyboard) */
import type { ReactNode } from 'react'
import type { DramaEpisode } from '../../api/drama'
import { DramaImageStylePreviewImg } from '../../components/drama/DramaImageStylePreviewImg'

export type DramaEpisodeDirItem = {
  id: number
  label: string
  title: string
  meta?: string
}

type DramaEpisodeDirProps = {
  title?: string
  items: DramaEpisodeDirItem[]
  activeId: number | null
  onSelect: (id: number) => void
  footer?: ReactNode
  emptyText?: string
}

// Sinh mục danh sách từ danh sách tập (sắp theo số tập; thiếu số tập thì không giả vờ là tập 1)
export function buildEpisodeDirItems(episodes: DramaEpisode[]): DramaEpisodeDirItem[] {
  const sorted = [...episodes].sort((a, b) => {
    const an = Number(a.params?.episodeNumber) || 0
    const bn = Number(b.params?.episodeNumber) || 0
    if (an !== bn) return an - bn
    return a.id - b.id
  })
  return sorted.map((ep) => {
    const epNo = Number(ep.params?.episodeNumber) || 0
    const fragCount = (ep.fragments || []).length
    return {
      id: ep.id,
      label: epNo >= 1 ? `Tập ${epNo}` : `Chưa đánh số · ${ep.id}`,
      title: ep.name || `Tập ${ep.id}`,
      meta: fragCount > 0 ? `${fragCount} cảnh quay` : undefined,
    }
  })
}

// Danh sách tập ở cột trái
export function DramaEpisodeDir({
  title = 'Danh sách tập',
  items,
  activeId,
  onSelect,
  footer,
  emptyText = 'Chưa có tập nào',
}: DramaEpisodeDirProps) {
  return (
    <aside className="drama-episode-dir">
      <div className="drama-episode-dir-head">
        <h3>{title}</h3>
        {footer}
      </div>
      {items.length === 0 ? (
        <div className="drama-episode-dir-empty">
          <DramaImageStylePreviewImg styleId="90s-realistic-film" alt="" loading="lazy" />
          <p>{emptyText}</p>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={activeId === item.id ? 'active' : ''}
                onClick={() => onSelect(item.id)}
              >
                <span>{item.label}</span>
                <small>
                  {item.title}
                  {item.meta ? ` · ${item.meta}` : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
