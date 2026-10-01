/** Quy trình dự án Drama: dàn ý cốt truyện → storyboard → tạo video; thư viện tài nguyên là lối vào riêng */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Boxes, ChevronLeft } from 'lucide-react'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import AppShell from '../../components/layout/AppShell'
import { dramaApi, type DramaProject } from '../../api/drama'
import { localizeBackendMessage } from '../../lib/backendMessages'
import {
  getInitialProjectStep,
  isEpisodesRouteStep,
  isProjectStepKey,
  normalizeWorkspaceStep,
  type ProjectStepKey,
  type WorkspaceLocationState,
} from '../../lib/dramaProjectSteps'
import { formatDramaUsageBrief } from '../../lib/dramaUsage'
import { resolveStoryboardPath } from '../../lib/dramaStoryboardNav'
import { dramaProjectTitle } from '../../lib/projectTitleLabels'
import { isCanvasWorkflow } from '../../lib/dramaWorkflow'
import { AssetsStep } from './AssetsStep'
import { OutlineStep } from './OutlineStep'
import RequireAuth from './RequireAuth'
import './drama.css'

export default function ProjectWorkspacePage() {
  return (
    <RequireAuth>
      <WorkspaceInner />
    </RequireAuth>
  )
}

// Thân của trang làm việc dự án
function WorkspaceInner() {
  const { projectId } = useParams()
  const id = Number(projectId)
  const navigate = useNavigate()
  const location = useLocation()
  /*
   * project chi tiết dự án
   * activeStep bước hiện tại (dàn ý / tập)
   * assetsOpen khung tài nguyên mở riêng
   * titleDraft tiêu đề đang sửa
   * editingTitle có đang sửa tiêu đề không
   * loading / error trạng thái tải
   */
  const [project, setProject] = useState<DramaProject | null>(null)
  const [activeStep, setActiveStep] = useState<ProjectStepKey>('outline')
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const locationApplied = useRef(false)

  /*
   * Mọi bước con (`AssetsStep`, `OutlineStep`, `OutlineEpisodePanel`) đều tự bóc
   * `err.message` rồi đẩy lên đây, nên đây là chỗ duy nhất phải tra bảng nhãn — bọc ở
   * từng `catch` bên trong con thì không bắt được, và thông báo tiếng Trung của backend
   * sẽ lọt thẳng ra giao diện. Chuỗi lạ trả về nguyên văn nên không nuốt thông báo.
   */
  const reportError = useCallback((message: string) => {
    setError(localizeBackendMessage(message))
  }, [])

  // Áp dụng state của route: bước assets / bước kiểu storyboard sẽ điều hướng
  function applyLocationState(state: WorkspaceLocationState | null) {
    const normalized = normalizeWorkspaceStep(state?.activeStep || state?.returnStep)
    if (normalized === 'assets' || state?.activeStep === 'assets') {
      setAssetsOpen(true)
      return
    }
    if (normalized && isEpisodesRouteStep(normalized)) {
      void resolveStoryboardPath(id)
        .then((path) => navigate(path, { replace: true }))
                .catch((err) => setError(err instanceof Error ? localizeBackendMessage(err.message) : 'Không mở được trang storyboard'))
      return
    }
    if (normalized && isProjectStepKey(normalized)) {
      setAssetsOpen(false)
      setActiveStep(normalized)
    }
  }

  // Tải dự án; dự án toan vẽ tự do luôn chuyển sang trang toan vẽ
  async function reload() {
    const p = await dramaApi.getProject(id)
    if (isCanvasWorkflow(p)) {
      navigate(`/drama/projects/${id}/canvas`, { replace: true })
      return null
    }
    setProject(p)
    setTitleDraft(p.title)
    return p
  }

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) return
    setLoading(true)
    reload()
      .then((p) => {
        if (!p) return
        if (!locationApplied.current) {
          const state = location.state as WorkspaceLocationState | null
          if (state?.activeStep || state?.returnStep) applyLocationState(state)
          else {
            const initial = getInitialProjectStep(Boolean(p.script))
            if (isEpisodesRouteStep(initial)) {
              void resolveStoryboardPath(id)
                .then((path) => navigate(path, { replace: true }))
        .catch((err) => setError(err instanceof Error ? localizeBackendMessage(err.message) : 'Không mở được trang storyboard'))
              return
            }
            setActiveStep(initial)
          }
          locationApplied.current = true
        }
      })
      .catch((err) => setError(err instanceof Error ? localizeBackendMessage(err.message) : 'Tải thất bại'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    applyLocationState(location.state as WorkspaceLocationState | null)
  }, [location.state])

  // Đổi bước thì làm mới mức dùng (sau khi tạo ảnh / tạo video, số trên thanh trên cùng được đồng bộ)
  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0 || loading || !project) return
    void dramaApi
      .getProject(id)
      .then((p) => {
        setProject((prev) => (prev ? { ...prev, usage: p.usage } : p))
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ làm mới theo thay đổi khung nhìn
  }, [activeStep, assetsOpen, id])

  // Lưu tiêu đề
  async function saveTitle() {
    const next = titleDraft.trim()
    if (!next || !project) {
      setEditingTitle(false)
      setTitleDraft(dramaProjectTitle(project?.title))
      return
    }
    try {
      const updated = await dramaApi.updateProject(id, { title: next })
      setProject(updated)
      setTitleDraft(dramaProjectTitle(updated.title))
    } catch (err) {
      setError(err instanceof Error ? localizeBackendMessage(err.message) : 'Lưu tiêu đề thất bại')
    } finally {
      setEditingTitle(false)
    }
  }

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <AppShell active="drama" flush>
        <div className="drama-workspace-status">ID dự án không hợp lệ</div>
      </AppShell>
    )
  }

  if (loading) {
    return (
      <AppShell active="drama" flush>
        <div className="drama-workspace-status">Đang tải…</div>
      </AppShell>
    )
  }

  if (error && !project) {
    return (
      <AppShell active="drama" flush>
        <div className="drama-workspace-status drama-error">{error}</div>
      </AppShell>
    )
  }

  if (!project) {
    return (
      <AppShell active="drama" flush>
        <div className="drama-workspace-status">Không tìm thấy dự án</div>
      </AppShell>
    )
  }

  return (
    <AppShell active="drama" flush wide>
      <div className="drama-workspace">
        <header className="drama-workspace-top">
          <div className="drama-workspace-top-left">
            <button
              type="button"
              className="drama-icon-btn"
              aria-label="Quay lại"
              onClick={() => navigate('/drama/dramas')}
            >
              <ChevronLeft size={20} strokeWidth={1.75} />
            </button>
            {editingTitle ? (
              <input
                className="drama-title-input"
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void saveTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveTitle()
                  if (e.key === 'Escape') {
                    setTitleDraft(dramaProjectTitle(project.title))
                    setEditingTitle(false)
                  }
                }}
              />
            ) : (
              <button type="button" className="drama-title-display" onClick={() => setEditingTitle(true)}>
                {dramaProjectTitle(project.title)}
              </button>
            )}
          </div>

          <div className="drama-workspace-top-right">
            {project.usage ? (
              <span className="drama-usage-chip" title="Tổng chi phí và số lần tạo của bộ phim này">
                {formatDramaUsageBrief(project.usage)}
              </span>
            ) : null}
            <button
              type="button"
              className={`drama-assets-entry-btn${assetsOpen ? ' is-active' : ''}`}
              onClick={() => setAssetsOpen((open) => !open)}
            >
              <Boxes size={15} strokeWidth={2} aria-hidden />
              Thư viện tài nguyên
            </button>
          </div>
        </header>

        {error ? <BillingErrorNotice message={error} className="drama-error drama-workspace-banner" /> : null}

        <main className="drama-workspace-main">
          {assetsOpen ? <AssetsStep projectId={id} onError={reportError} /> : null}
          {!assetsOpen && activeStep === 'outline' ? (
            <OutlineStep
              projectId={id}
              project={project}
              onProjectChange={(p) => {
                setProject(p)
                setTitleDraft(dramaProjectTitle(p.title))
              }}
              onError={reportError}
            />
          ) : null}
        </main>
      </div>
    </AppShell>
  )
}
