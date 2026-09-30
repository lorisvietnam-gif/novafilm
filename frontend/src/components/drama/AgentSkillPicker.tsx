/** Danh sách chọn nhiều Agent Skill (dùng chung cho popup và dropdown trên canvas): xem trước, tải về */
import { useRef, useState, type MouseEvent } from 'react'
import { Download, Eye, X } from 'lucide-react'
import type { AgentSkill } from '../../api/agentSkills'
import { triggerBlobDownload } from '../../lib/clientDownload'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type AgentSkillPickerProps = {
  skills: AgentSkill[]
  selectedIds: number[]
  onToggle: (skillId: number) => void
  onSelectAll?: () => void
  onSelectNone?: () => void
  onUpload?: (file: File) => void
  uploading?: boolean
  uploadError?: string
  emptyText?: string
  compact?: boolean
}

const COPY: Record<string, LocalizedText> = {
  empty: { zh: '暂无可用 Skill', en: 'No skills available yet', vi: 'Chưa có Skill nào' },
  selectAll: { zh: '全选', en: 'Select all', vi: 'Chọn tất cả' },
  selectNone: { zh: '不使用', en: 'Use none', vi: 'Không dùng' },
  uploading: { zh: '上传中…', en: 'Uploading…', vi: 'Đang tải lên…' },
  upload: { zh: '上传 .md', en: 'Upload .md', vi: 'Tải .md lên' },
  preview: { zh: '预览', en: 'Preview', vi: 'Xem trước' },
  previewOf: { zh: '预览 {name}', en: 'Preview {name}', vi: 'Xem trước {name}' },
  download: { zh: '下载 .md', en: 'Download .md', vi: 'Tải .md xuống' },
  downloadOf: { zh: '下载 {name}', en: 'Download {name}', vi: 'Tải {name} xuống' },
  closePreview: { zh: '关闭预览', en: 'Close preview', vi: 'Đóng xem trước' },
}

/** Khôi phục một Skill thành file SKILL.md kiểu Cursor */
export function skillToMarkdown(skill: AgentSkill): string {
  const tasks = Array.isArray(skill.tasks) ? skill.tasks.filter(Boolean) : []
  const taskLines =
    tasks.length > 0
      ? ['tasks:', ...tasks.map((task) => `  - ${String(task).replace(/\n/g, ' ')}`)]
      : ['tasks: []']
  const desc = String(skill.description || '').replace(/\n/g, ' ').trim()
  const name = String(skill.name || skill.slug || 'skill').trim() || 'skill'
  return [
    '---',
    `name: ${name}`,
    `description: ${desc}`,
    ...taskLines,
    '---',
    '',
    String(skill.body || '').trim(),
    '',
  ].join('\n')
}

/** Tên file khi tải về */
function skillDownloadName(skill: AgentSkill): string {
  const base = (skill.slug || skill.name || 'skill')
    .replace(/[^\w\u4e00-\u9fff.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${base || 'skill'}.md`
}

/** Render danh sách Skill có ô tick, kèm xem trước / tải về / tải lên */
export function AgentSkillPicker({
  skills,
  selectedIds,
  onToggle,
  onSelectAll,
  onSelectNone,
  onUpload,
  uploading = false,
  uploadError = '',
  emptyText,
  compact = false,
}: AgentSkillPickerProps) {
  const lt = useLocalizedText()
  const selected = new Set(selectedIds)
  const rootClass = compact ? 'fc-skill-picker' : 'pf-skill-picker'
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewSkill, setPreviewSkill] = useState<AgentSkill | null>(null)

  // Tải một Skill về dạng .md
  function handleDownload(skill: AgentSkill, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    const markdown = skillToMarkdown(skill)
    triggerBlobDownload(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), skillDownloadName(skill))
  }

  // Mở xem trước (chặn sự kiện tick nổi lên)
  function handlePreview(skill: AgentSkill, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    setPreviewSkill(skill)
  }

  return (
    <div className={rootClass}>
      <div className={`${rootClass}-toolbar`}>
        {onSelectAll ? (
          <button type="button" className={`${rootClass}-link`} onClick={onSelectAll}>
            {lt(COPY.selectAll)}
          </button>
        ) : null}
        {onSelectNone ? (
          <button type="button" className={`${rootClass}-link`} onClick={onSelectNone}>
            {lt(COPY.selectNone)}
          </button>
        ) : null}
        {onUpload ? (
          <button
            type="button"
            className={`${rootClass}-link`}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? lt(COPY.uploading) : lt(COPY.upload)}
          </button>
        ) : null}
      </div>
      {skills.length === 0 ? (
        <p className={`${rootClass}-empty`}>{emptyText || lt(COPY.empty)}</p>
      ) : (
        <ul className={`${rootClass}-list`}>
          {skills.map((skill) => {
            const checked = selected.has(skill.id)
            return (
              <li key={skill.id} className={`${rootClass}-row`}>
                <label className={`${rootClass}-item${checked ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(skill.id)}
                  />
                  <span>
                    <strong>{skill.name}</strong>
                    {skill.description ? <em>{skill.description}</em> : null}
                  </span>
                </label>
                <div className={`${rootClass}-actions`}>
                  <button
                    type="button"
                    className={`${rootClass}-action`}
                    title={lt(COPY.preview)}
                    aria-label={lt(COPY.previewOf).replace('{name}', skill.name)}
                    onClick={(event) => handlePreview(skill, event)}
                  >
                    <Eye size={14} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    className={`${rootClass}-action`}
                    title={lt(COPY.download)}
                    aria-label={lt(COPY.downloadOf).replace('{name}', skill.name)}
                    onClick={(event) => handleDownload(skill, event)}
                  >
                    <Download size={14} strokeWidth={1.8} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {onUpload ? (
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onUpload(file)
          }}
        />
      ) : null}
      {uploadError ? <p className={`${rootClass}-error`}>{uploadError}</p> : null}

      {previewSkill ? (
        <div className={`${rootClass}-preview`} role="dialog" aria-label={lt(COPY.previewOf).replace('{name}', previewSkill.name)}>
          <div className={`${rootClass}-preview-head`}>
            <div>
              <strong>{previewSkill.name}</strong>
              {previewSkill.description ? <span>{previewSkill.description}</span> : null}
            </div>
            <div className={`${rootClass}-preview-head-actions`}>
              <button
                type="button"
                className={`${rootClass}-link`}
                onClick={(event) => handleDownload(previewSkill, event)}
              >
                {lt(COPY.download)}
              </button>
              <button
                type="button"
                className={`${rootClass}-action`}
                aria-label={lt(COPY.closePreview)}
                onClick={() => setPreviewSkill(null)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <pre className={`${rootClass}-preview-body`}>{skillToMarkdown(previewSkill)}</pre>
        </div>
      ) : null}
    </div>
  )
}
