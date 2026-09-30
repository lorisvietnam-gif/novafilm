/** Bước dàn ý: tự tạo tóm tắt + luồng kịch bản theo tập */
import { useEffect, useRef, useState } from 'react'
import {
  dramaApi,
  type DramaProject,
  type DramaScript,
} from '../../api/drama'
import { getImageStyleLabel, type ImageStyleId } from '../../lib/dramaImageStyles'
import {
  autoMissingEpisodeCount,
  getEpisodeContentStatus,
  getImageStyleId,
  getSummaryStatus,
  hasSubstantialEpisode,
  parseEpisodeBodies,
} from './dramaWorkspaceUtils'
import { dialog } from '../../lib/dialog'
import Modal from '../../components/ui/Modal'
import { DramaImageStyleModal } from './DramaImageStyleModal'
import { DramaProjectSettingsModal } from './DramaProjectSettingsModal'
import { OutlineEpisodePanel } from './OutlineEpisodePanel'

type MetaModalKey = 'source' | 'summary' | 'project'

export type OutlineStepProps = {
  projectId: number
  project: DramaProject
  onProjectChange: (p: DramaProject) => void
  /** Tùy chọn: báo dàn ý đã sẵn sàng (workspace không còn phụ thuộc "bước tiếp theo") */
  onOutlineReadyChange?: (ready: boolean) => void
  onError: (msg: string) => void
}

// Render bước dàn ý
export function OutlineStep({
  projectId,
  project,
  onProjectChange,
  onOutlineReadyChange,
  onError,
}: OutlineStepProps) {
  const notifyOutlineReady = (ready: boolean) => onOutlineReadyChange?.(ready)
  const [script, setScript] = useState<DramaScript | null>(project.script || null)
  const [metaModal, setMetaModal] = useState<MetaModalKey | null>(null)
  const [summaryGenerating, setSummaryGenerating] = useState(false)
  const [episodeGenerating, setEpisodeGenerating] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [episodeError, setEpisodeError] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [summaryEditing, setSummaryEditing] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState<Record<string, unknown> | null>(null)
  const [summarySaving, setSummarySaving] = useState(false)
  const [sourceEditing, setSourceEditing] = useState(false)
  const [sourceDraft, setSourceDraft] = useState('')
  const [sourceSaving, setSourceSaving] = useState(false)
  const pipelineRef = useRef(0)

  const summary = (script?.summary || null) as Record<string, unknown> | null
  const summaryStatus = getSummaryStatus(script)
  const episodeStatus = getEpisodeContentStatus(script)
  const episodeCount =
    Number(
      summary?.episodeCount ||
        (script?.params || {}).episode_count ||
        project.params?.episode_count,
    ) || 0
  const imageStyleId = getImageStyleId(script, project)

  function openSourceModal() {
    setSourceEditing(false)
    setSourceDraft(script?.source || '')
    setMetaModal('source')
  }

  function openSummaryModal() {
    setSummaryEditing(false)
    setMetaModal('summary')
  }

  function closeMetaModal() {
    setMetaModal(null)
    setSourceEditing(false)
    setSummaryEditing(false)
  }

  // Poll kịch bản cho tới khi thỏa điều kiện (tác vụ async của worker)
  async function pollScriptUntil(
    predicate: (s: DramaScript) => boolean,
    runToken?: number,
  ): Promise<DramaScript | null> {
    const started = Date.now()
    while (Date.now() - started < 45 * 60 * 1000) {
      if (runToken !== undefined && runToken !== pipelineRef.current) return null
      const s = await dramaApi.getScript(projectId)
      setScript(s)
      const prog = (s.params || {}).episode_content_progress as
        | { done?: number; total?: number }
        | undefined
      if (prog && (prog.total || prog.done)) {
        setProgress({
          done: Number(prog.done) || 0,
          total: Number(prog.total) || 0,
        })
      }
      if (predicate(s)) return s
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error('Chờ tạo quá thời gian, vui lòng tải lại trang rồi thử lại')
  }

  // Đưa vào hàng đợi và chờ tóm tắt kịch bản hoàn tất
  async function runSummary(runToken?: number) {
    setSummaryGenerating(true)
    setSummaryError('')
    try {
      const res = await dramaApi.scriptSummary({ project_id: projectId })
      setScript(res.script)
      const finished = await pollScriptUntil((s) => {
        const st = getSummaryStatus(s)
        return st === 'completed' || st === 'failed'
      }, runToken)
      if (!finished) return null
      if (getSummaryStatus(finished) === 'failed') {
        const msg =
          String((finished.params || {}).summary_error || '') || 'Tạo tóm tắt kịch bản thất bại'
        setSummaryError(msg)
        onError(msg)
        throw new Error(msg)
      }
      const p = await dramaApi.getProject(projectId)
      onProjectChange(p)
      return finished
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tạo tóm tắt kịch bản thất bại'
      setSummaryError(msg)
      onError(msg)
      throw err
    } finally {
      setSummaryGenerating(false)
    }
  }

  // Đưa vào hàng đợi và poll kịch bản các tập cho tới khi xong
  async function runEpisodeScripts(runToken?: number, force = false) {
    setEpisodeGenerating(true)
    setEpisodeError('')
    try {
      const res = await dramaApi.episodeScript({
        project_id: projectId,
        batch_size: 1,
        force,
      })
      setScript(res.script)
      setProgress({ done: res.total_generated, total: res.total_target })
      const finished = await pollScriptUntil((s) => {
        const st = getEpisodeContentStatus(s)
        return st === 'completed' || st === 'failed'
      }, runToken)
      if (!finished) return
      if (getEpisodeContentStatus(finished) === 'failed') {
        const msg =
          String((finished.params || {}).episode_content_error || '') ||
          'Tạo kịch bản các tập thất bại'
        setEpisodeError(msg)
        onError(msg)
        notifyOutlineReady(false)
        return
      }
      notifyOutlineReady(true)
      const p = await dramaApi.getProject(projectId)
      onProjectChange(p)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tạo kịch bản các tập thất bại'
      setEpisodeError(msg)
      onError(msg)
      notifyOutlineReady(false)
    } finally {
      setEpisodeGenerating(false)
    }
  }

  // Ép tạo lại toàn bộ nội dung các tập bằng tay
  async function handleRegenerateEpisodes() {
    if (episodeGenerating) return
    const ok = await dialog.confirm({
      title: 'Tạo lại kịch bản các tập',
      message:
        'Sẽ xoá toàn bộ nội dung hiện tại của các tập và tạo lại từ đầu dựa trên tóm tắt kịch bản mới nhất. Mọi chỉnh sửa đã làm sẽ mất. Bạn có muốn tiếp tục không?',
      confirmText: 'Tạo lại',
      tone: 'danger',
    })
    if (!ok) return
    notifyOutlineReady(false)
    await runEpisodeScripts(undefined, true)
  }

  // Tự chạy pipeline khi mount: chưa có tóm tắt → tạo tóm tắt → tạo kịch bản từng tập (chưa đủ số tập mục tiêu thì chạy tiếp; nếu worker đang chạy thì chỉ poll)
  useEffect(() => {
    const token = ++pipelineRef.current
    async function pipeline() {
      let current = script
      const status = getSummaryStatus(current)
      if (!current?.summary && status !== 'completed') {
        try {
          if (status === 'generating') {
            setSummaryGenerating(true)
            current = await pollScriptUntil((s) => {
              const st = getSummaryStatus(s)
              return st === 'completed' || st === 'failed'
            }, token)
            setSummaryGenerating(false)
            if (!current || getSummaryStatus(current) === 'failed') {
              const msg =
                String((current?.params || {}).summary_error || '') || 'Tạo tóm tắt kịch bản thất bại'
              setSummaryError(msg)
              onError(msg)
              return
            }
          } else {
            current = await runSummary(token)
          }
        } catch {
          return
        }
        if (!current || token !== pipelineRef.current) return
      }
      const target =
        Number(
          (current?.summary as Record<string, unknown> | null)?.episodeCount ||
            (current?.params || {}).episode_count ||
            project.params?.episode_count,
        ) || 0
      const bodies = parseEpisodeBodies(current)
      const epStatus = getEpisodeContentStatus(current)
      const autoMissing = autoMissingEpisodeCount(bodies, target)
      const complete =
        epStatus !== 'failed' && autoMissing === 0 && hasSubstantialEpisode(bodies)
      if (complete) {
        notifyOutlineReady(true)
        return
      }
      if (current?.summary || getSummaryStatus(current) === 'completed') {
        if (epStatus === 'generating') {
          setEpisodeGenerating(true)
          const finished = await pollScriptUntil((s) => {
            const st = getEpisodeContentStatus(s)
            return st === 'completed' || st === 'failed'
          }, token)
          setEpisodeGenerating(false)
          if (!finished) return
          if (getEpisodeContentStatus(finished) === 'failed') {
            const msg =
              String((finished.params || {}).episode_content_error || '') ||
              'Tạo kịch bản các tập thất bại'
            setEpisodeError(msg)
            onError(msg)
            notifyOutlineReady(false)
            return
          }
          notifyOutlineReady(true)
          const p = await dramaApi.getProject(projectId)
          onProjectChange(p)
          return
        }
        await runEpisodeScripts(token)
      }
    }
    void pipeline()
    return () => {
      pipelineRef.current += 1
      notifyOutlineReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Cập nhật phong cách hình ảnh
  async function handleStyleChange(styleId: string) {
    try {
      const updated = await dramaApi.updateScript(projectId, {
        image_style_id: styleId || undefined,
      })
      setScript(updated)
      const p = await dramaApi.getProject(projectId)
      onProjectChange(p)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Cập nhật phong cách thất bại')
    }
  }

  // Vào chế độ sửa tóm tắt kịch bản
  function startSummaryEdit() {
    if (!summary) return
    setSummaryDraft(structuredClone(summary) as Record<string, unknown>)
    setSummaryEditing(true)
  }

  // Lưu tóm tắt kịch bản đã sửa tay
  async function saveSummaryEdit() {
    if (!summaryDraft) return
    setSummarySaving(true)
    try {
      const updated = await dramaApi.updateScript(projectId, { summary: summaryDraft })
      setScript(updated)
      setSummaryEditing(false)
      setSummaryDraft(null)
      const p = await dramaApi.getProject(projectId)
      onProjectChange(p)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lưu tóm tắt thất bại')
    } finally {
      setSummarySaving(false)
    }
  }

  const characters = Array.isArray(summary?.characters)
    ? (summary.characters as Array<Record<string, unknown>>)
    : []

  async function saveSourceEdit() {
    setSourceSaving(true)
    try {
      const updated = await dramaApi.updateScript(projectId, { source: sourceDraft })
      setScript(updated)
      setSourceEditing(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lưu ý tưởng thất bại')
    } finally {
      setSourceSaving(false)
    }
  }

  return (
    <div className="drama-outline-page">
      <div className="drama-outline-toolbar">
        <div className="drama-outline-toolbar-left">
          <DramaImageStyleModal
            variant="field"
            fieldLabel="Phong cách dự án"
            title="Chọn phong cách dự án"
            emptyLabel="Chưa chọn"
            value={(imageStyleId as ImageStyleId | '') || ''}
            onChange={(id) => void handleStyleChange(id)}
          />
          <span className="drama-outline-toolbar-meta">
            {episodeCount ? `Tổng ${episodeCount} tập` : 'Số tập chưa chốt'}
            {episodeGenerating || episodeStatus === 'generating'
              ? progress.total > 0
                ? ` · Đang tạo ${progress.done}/${progress.total}`
                : ' · Đang tạo kịch bản các tập'
              : ''}
          </span>
        </div>
        <div className="drama-outline-toolbar-actions">
          <button
            type="button"
            className={`drama-outline-chip-btn${metaModal === 'source' ? ' is-on' : ''}`}
            onClick={openSourceModal}
          >
            Ý tưởng toàn phim
          </button>
          <button
            type="button"
            className={`drama-outline-chip-btn${metaModal === 'project' ? ' is-on' : ''}`}
            onClick={() => setMetaModal('project')}
          >
            Cài đặt dự án
          </button>
          <button
            type="button"
            className={`drama-outline-chip-btn${metaModal === 'summary' ? ' is-on' : ''}`}
            onClick={openSummaryModal}
          >
            Thiết lập chung
          </button>
          {(episodeError || episodeStatus === 'failed') && (
            <button type="button" className="drama-outline-chip-btn" onClick={() => void handleRegenerateEpisodes()}>
              Chạy lại toàn bộ tập
            </button>
          )}
        </div>
      </div>

      <Modal
        open={metaModal === 'source'}
        onClose={closeMetaModal}
        title="Ý tưởng toàn phim"
        size="lg"
        className="drama-outline-meta-modal"
        footer={
          sourceEditing ? (
            <>
              <button type="button" className="drama-btn-ghost" onClick={() => setSourceEditing(false)}>
                Huỷ chỉnh sửa
              </button>
              <button
                type="button"
                className="drama-btn-primary"
                disabled={sourceSaving}
                onClick={() => void saveSourceEdit()}
              >
                {sourceSaving ? 'Đang lưu…' : 'Lưu'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="drama-btn-ghost"
              onClick={() => {
                setSourceDraft(script?.source || '')
                setSourceEditing(true)
              }}
            >
              Sửa
            </button>
          )
        }
      >
        <div className="drama-outline-meta-modal-body">
          {sourceEditing ? (
            <textarea
              className="drama-ep-section-textarea"
              rows={16}
              value={sourceDraft}
              onChange={(e) => setSourceDraft(e.target.value)}
            />
          ) : (
            <p className="drama-pre">{script?.source?.trim() || 'Chưa có ý tưởng toàn phim'}</p>
          )}
        </div>
      </Modal>

      <Modal
        open={metaModal === 'summary'}
        onClose={closeMetaModal}
        title="Thiết lập chung"
        size="lg"
        className="drama-outline-meta-modal"
        footer={
          summaryEditing ? (
            <>
              <button type="button" className="drama-btn-ghost" onClick={() => setSummaryEditing(false)}>
                Huỷ chỉnh sửa
              </button>
              <button
                type="button"
                className="drama-btn-primary"
                disabled={summarySaving}
                onClick={() => void saveSummaryEdit()}
              >
                {summarySaving ? 'Đang lưu…' : 'Lưu'}
              </button>
            </>
          ) : summary && summaryStatus === 'completed' ? (
            <button type="button" className="drama-btn-ghost" onClick={() => startSummaryEdit()}>
              Sửa
            </button>
          ) : summaryError || summaryStatus === 'failed' ? (
            <button type="button" className="drama-btn-primary" onClick={() => void runSummary()}>
              Tạo lại
            </button>
          ) : null
        }
      >
        <div className="drama-outline-meta-modal-body">
          {summaryGenerating || summaryStatus === 'generating' ? (
            <p className="drama-loader">Đang tạo tóm tắt toàn phim…</p>
          ) : null}
          {summaryError || summaryStatus === 'failed' ? (
            <p className="drama-error">{summaryError || 'Tạo tóm tắt thất bại'}</p>
          ) : null}
          {summaryEditing && summaryDraft ? (
            <div className="drama-outline-edit">
              <EditableSummaryField
                label="Tên phim"
                value={String(summaryDraft.seriesTitle || '')}
                onChange={(v) =>
                  setSummaryDraft((prev) => (prev ? { ...prev, seriesTitle: v } : prev))
                }
              />
              <EditableSummaryField
                label="Số tập tùy chỉnh"
                value={String(summaryDraft.episodeCount ?? '')}
                onChange={(v) =>
                  setSummaryDraft((prev) =>
                    prev ? { ...prev, episodeCount: v ? Number(v) || v : '' } : prev,
                  )
                }
              />
              <EditableSummaryField
                label="Thể loại câu chuyện"
                value={String(summaryDraft.storyType || '')}
                onChange={(v) => setSummaryDraft((prev) => (prev ? { ...prev, storyType: v } : prev))}
              />
              <EditableSummaryField
                label="Câu chuyện một câu"
                value={String(summaryDraft.oneLineStory || '')}
                onChange={(v) =>
                  setSummaryDraft((prev) => (prev ? { ...prev, oneLineStory: v } : prev))
                }
                multiline
              />
              <EditableSummaryField
                label="Tóm tắt nội dung"
                value={String(summaryDraft.synopsis || '')}
                onChange={(v) => setSummaryDraft((prev) => (prev ? { ...prev, synopsis: v } : prev))}
                multiline
              />
            </div>
          ) : null}
          {!summaryEditing && summary && summaryStatus === 'completed' ? (
            <div className="drama-summary-structured">
              <SummaryField label="Tên phim" value={String(summary.seriesTitle || '')} />
              <SummaryField label="Thể loại câu chuyện" value={String(summary.storyType || '')} />
              <SummaryField label="Câu chuyện một câu" value={String(summary.oneLineStory || '')} />
              <SummaryField label="Tóm tắt nội dung" value={String(summary.synopsis || '')} />
              {characters.length > 0 ? (
                <section>
                  <h4>Nhân vật</h4>
                  <p className="drama-muted">
                    {characters.map((ch) => String(ch.name || '')).filter(Boolean).join('、')}
                  </p>
                </section>
              ) : null}
            </div>
          ) : null}
          {!summaryEditing && !summary && summaryStatus !== 'generating' && !summaryError ? (
            <p className="drama-muted">Chưa có thiết lập chung, hãy chờ tóm tắt được tạo hoặc bấm Tạo lại.</p>
          ) : null}
        </div>
      </Modal>

      <DramaProjectSettingsModal
        open={metaModal === 'project'}
        projectId={projectId}
        project={project}
        script={script}
        onClose={closeMetaModal}
        onProjectChange={onProjectChange}
        onScriptChange={setScript}
        onError={onError}
      />

      <OutlineEpisodePanel
        projectId={projectId}
        script={script}
        episodeCount={episodeCount}
        summaryReady={summaryStatus === 'completed' || Boolean(summary)}
        episodeGenerating={episodeGenerating || episodeStatus === 'generating'}
        imageStyleLabel={getImageStyleLabel(imageStyleId) || undefined}
        storyType={String(summary?.storyType || '') || undefined}
        onScriptChange={setScript}
        onProjectChange={onProjectChange}
        onError={onError}
        onOpenEpisodes={() => undefined}
      />
    </div>
  )
}

function SummaryField({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <section className="drama-summary-field">
      <h4>{label}</h4>
      <p className="drama-pre">{value}</p>
    </section>
  )
}

function EditableSummaryField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
}) {
  return (
    <label className="drama-outline-edit-field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}
