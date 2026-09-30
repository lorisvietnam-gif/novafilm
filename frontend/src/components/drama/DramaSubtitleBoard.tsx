/** Bảng phụ đề của storyboard: xem trước lời đọc cả tập, có thể thu gọn và xuất. */
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { DramaFragment } from '../../api/drama'
import { sanitizeMediaBasename } from '../../lib/canvasNodeMedia'
import { triggerBlobDownload } from '../../lib/clientDownload'
import {
  buildDramaSubtitleBoard,
  exportDramaSubtitleBoardSrt,
  formatSubtitleClock,
  subtitleModeUsesModelOutput,
  type DramaSubtitleMode,
} from '../../lib/dramaSubtitleBoard'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type Props = {
  fragments: DramaFragment[]
  episodeName?: string
  subtitleMode: DramaSubtitleMode
}

const COPY: Record<string, LocalizedText> = {
  episodeDefault: { zh: '本集', en: 'Episode', vi: 'Tập này' },
  title: { zh: '字幕板', en: 'Subtitle board', vi: 'Bảng phụ đề' },
  fromModel: { zh: '模型自出', en: 'Rendered by the model', vi: 'Mô hình tự tạo' },
  stitched: { zh: '后期拼接', en: 'Stitched afterwards', vi: 'Ghép sau hậu kỳ' },
  cueCount: { zh: '{n} 条', en: '{n} cues', vi: '{n} câu' },
  exportTitle: { zh: '导出 SRT，可直接导入剪映', en: 'Export SRT, ready to import into JianYing', vi: 'Xuất SRT, nạp thẳng vào JianYing được' },
  export: { zh: '导出SRT', en: 'Export SRT', vi: 'Xuất SRT' },
  fileSuffix: { zh: '字幕', en: 'subtitles', vi: 'phu-de' },
  empty: {
    zh: '当前分镜里还没有可预览的对白/旁白字幕。',
    en: 'There is no dialogue or narration to preview in this storyboard yet.',
    vi: 'Storyboard này chưa có đối thoại hay lời dẫn để xem trước.',
  },
  shot: { zh: '片段 {n}', en: 'Shot {n}', vi: 'Cảnh {n}' },
}

// Render bảng phụ đề của tập, có thể thu gọn, kèm nút xuất.
export function DramaSubtitleBoard({
  fragments,
  episodeName,
  subtitleMode,
}: Props) {
  const lt = useLocalizedText()
  const cues = buildDramaSubtitleBoard(fragments)
  const modelOutput = subtitleModeUsesModelOutput(subtitleMode)
  // collapsed mặc định thu gọn, để bớt chiếm chỗ ở khung xem bên phải
  const [collapsed, setCollapsed] = useState(true)
  const episodeLabel = episodeName || lt(COPY.episodeDefault)

  return (
    <section className={`drama-subtitle-board${collapsed ? ' is-collapsed' : ''}`}>
      <div className="drama-subtitle-board__header">
        <button
          type="button"
          className="drama-subtitle-board__toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          <span className="drama-subtitle-board__title-wrap">
            <h4>{lt(COPY.title)}</h4>
            <p>
              {modelOutput ? lt(COPY.fromModel) : lt(COPY.stitched)} ·{' '}
              {lt(COPY.cueCount).replace('{n}', String(cues.length))}
            </p>
          </span>
          {collapsed ? (
            <ChevronDown size={16} strokeWidth={1.8} aria-hidden />
          ) : (
            <ChevronUp size={16} strokeWidth={1.8} aria-hidden />
          )}
        </button>
        <button
          type="button"
          className="drama-subtitle-board__export"
          disabled={cues.length === 0}
          title={lt(COPY.exportTitle)}
          onClick={(event) => {
            event.stopPropagation()
            const srt = exportDramaSubtitleBoardSrt(fragments)
            if (!srt) return
            // JianYing bản desktop nhận được file .srt có BOM UTF-8
            const blob = new Blob(['\uFEFF', srt], { type: 'application/x-subrip;charset=utf-8' })
            triggerBlobDownload(
              blob,
              `${sanitizeMediaBasename(episodeLabel)}_${lt(COPY.fileSuffix)}.srt`,
            )
          }}
        >
          {lt(COPY.export)}
        </button>
      </div>
      {!collapsed ? (
        cues.length === 0 ? (
          <div className="drama-subtitle-board__empty">{lt(COPY.empty)}</div>
        ) : (
          <div className="drama-subtitle-board__list">
            {cues.map((cue, index) => (
              <div
                key={`${cue.fragmentId}-${cue.startSec}-${index}`}
                className="drama-subtitle-board__item"
              >
                <div className="drama-subtitle-board__meta">
                  <span>
                    {formatSubtitleClock(cue.startSec)} - {formatSubtitleClock(cue.endSec)}
                  </span>
                  <span>
                    {lt(COPY.shot).replace('{n}', String(cue.fragmentIndex + 1).padStart(2, '0'))}
                  </span>
                  <span>{cue.speaker}</span>
                </div>
                <div className="drama-subtitle-board__text">{cue.text}</div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </section>
  )
}
