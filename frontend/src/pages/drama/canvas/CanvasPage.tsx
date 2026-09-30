/** Trang canvas tự do: canvas vô hạn React Flow toàn màn hình (không có layout khung ứng dụng) */
import { useParams } from 'react-router-dom'
import RequireAuth from '../RequireAuth'
import { CanvasWorkspace } from './CanvasWorkspace'

/** Render canvas tự do toàn màn hình sau khi xác thực */
export default function CanvasPage() {
  return (
    <RequireAuth>
      <CanvasPageInner />
    </RequireAuth>
  )
}

/** Đọc projectId từ route rồi mount vùng làm việc */
function CanvasPageInner() {
  const { projectId } = useParams()
  const id = Number(projectId)

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="free-canvas-page" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: '#64748b' }}>ID dự án không hợp lệ.</p>
      </div>
    )
  }

  return <CanvasWorkspace projectId={id} />
}
