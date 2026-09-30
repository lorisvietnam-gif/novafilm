/** Xác nhận dựng lại storyboard bằng AI: cho chọn Agent Skill sẽ dùng cho lần này */
import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AgentSkillPicker } from './AgentSkillPicker'
import { useAgentSkillSelection } from '../../hooks/useAgentSkillSelection'
import { useLocalizedText } from '../../lib/useLocalizedText'
import type { LocalizedText } from '../../lib/localeStrings'

type FragmentPlanSkillModalProps = {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  onCancel: () => void
  onConfirm: (skillIds: number[]) => void
}

const COPY: Record<string, LocalizedText> = {
  title: { zh: 'AI 重新分镜', en: 'Rebuild the storyboard with AI', vi: 'Dựng lại storyboard bằng AI' },
  confirm: { zh: '开始分镜', en: 'Start storyboarding', vi: 'Bắt đầu dựng storyboard' },
  skillLabel: { zh: '本次使用的 Skill', en: 'Skills for this run', vi: 'Skill dùng cho lần này' },
  skillEmpty: { zh: '还没有 Skill，可上传 .md', en: 'No skills yet. You can upload a .md file.', vi: 'Chưa có Skill nào. Bạn có thể tải một file .md lên.' },
  cancel: { zh: '取消', en: 'Cancel', vi: 'Huỷ' },
}

/** Cho người dùng chọn Skill trước khi ghi đè storyboard */
export function FragmentPlanSkillModal({
  open,
  title,
  message,
  confirmText,
  onCancel,
  onConfirm,
}: FragmentPlanSkillModalProps) {
  const lt = useLocalizedText()
  const { skills, selectedIds, toggleSkill, selectAll, selectNone, uploadSkill, uploading, uploadError } =
    useAgentSkillSelection()

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="pf-dialog-root" role="presentation">
      <div className="pf-dialog-veil" aria-hidden onMouseDown={onCancel} />
      <form
        className="pf-dialog pf-dialog--danger pf-dialog--skills"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fragment-plan-skill-title"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm(selectedIds)
        }}
      >
        <div className="pf-dialog-glow" aria-hidden />
        <div className="pf-dialog-header">
          <div className="pf-dialog-mark" aria-hidden>
            <AlertTriangle size={22} strokeWidth={1.75} />
          </div>
          <div className="pf-dialog-body">
            <h2 id="fragment-plan-skill-title" className="pf-dialog-title">
              {title || lt(COPY.title)}
            </h2>
            <p className="pf-dialog-message">{message}</p>
          </div>
        </div>
        <div className="pf-dialog-skill-block">
          <div className="pf-dialog-skill-label">{lt(COPY.skillLabel)}</div>
          <AgentSkillPicker
            skills={skills}
            selectedIds={selectedIds}
            onToggle={toggleSkill}
            onSelectAll={selectAll}
            onSelectNone={selectNone}
            onUpload={(file) => void uploadSkill(file)}
            uploading={uploading}
            uploadError={uploadError}
            emptyText={lt(COPY.skillEmpty)}
          />
        </div>
        <div className="pf-dialog-actions">
          <button type="button" className="pf-dialog-btn pf-dialog-btn-ghost" onClick={onCancel}>
            {lt(COPY.cancel)}
          </button>
          <button type="submit" className="pf-dialog-btn pf-dialog-btn-danger">
            {confirmText || lt(COPY.confirm)}
          </button>
        </div>
      </form>
    </div>
  )
}
