/** Trang trung gian cũ của phần tập: tự chuyển tới màn sửa storyboard của tập đầu tiên */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '../../components/layout/AppShell'
import { localizeBackendMessage } from '../../lib/backendMessages'
import { isCanvasWorkflow } from '../../lib/dramaWorkflow'
import { resolveStoryboardPath } from '../../lib/dramaStoryboardNav'
import { dramaApi } from '../../api/drama'
import RequireAuth from './RequireAuth'
import './drama.css'

export default function EpisodesPage() {
  return (
    <RequireAuth>
      <EpisodesRedirect />
    </RequireAuth>
  )
}

// Sau khi tải xong thì nhảy sang sửa tập đầu, không hiện trang trung gian nữa
function EpisodesRedirect() {
  const { projectId } = useParams()
  const pid = Number(projectId)
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!Number.isFinite(pid) || pid <= 0) return
    let cancelled = false
    ;(async () => {
      try {
        const p = await dramaApi.getProject(pid)
        if (cancelled) return
        if (isCanvasWorkflow(p)) {
          navigate(`/drama/projects/${pid}/canvas`, { replace: true })
          return
        }
        const path = await resolveStoryboardPath(pid)
        if (!cancelled) navigate(path, { replace: true })
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? localizeBackendMessage(err.message) : 'Không mở được trang storyboard',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pid, navigate])

  return (
    <AppShell active="drama" flush>
      <div className="drama-workspace-status">
        {error || 'Đang mở trang storyboard…'}
      </div>
    </AppShell>
  )
}
