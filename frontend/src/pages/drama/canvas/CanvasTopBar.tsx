/** Thanh trên của canvas: quay lại, tiêu đề, chỉ báo đã lưu, chỗ cài đặt */
import { useState } from 'react'
import { ChevronLeft, Maximize2, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCanvasStore } from './CanvasStore'

type Props = {
  variant?: 'fullscreen' | 'embedded'
}

/** Render thanh công cụ đầu trang của canvas */
export function CanvasTopBar({ variant = 'fullscreen' }: Props) {
  const navigate = useNavigate()
  const { saveStatusVisible, projectId, freeCanvasMode } = useCanvasStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const embedded = variant === 'embedded'

  return (
    <>
      <div className="fc-overlay fc-topbar">
        <div className="fc-topbar-left">
          {embedded ? null : (
            <button
              type="button"
              className="fc-icon-btn"
              aria-label="Quay lại"
              title="Quay lại"
              onClick={() => {
                if (freeCanvasMode) {
                  navigate('/drama')
                  return
                }
                if (window.history.length > 1) navigate(-1)
                else navigate(`/drama/projects/${projectId}`)
              }}
            >
              <ChevronLeft size={20} strokeWidth={1.8} />
            </button>
          )}
          <span className="fc-topbar-title">
            {embedded ? 'Canvas tài nguyên' : freeCanvasMode ? 'Canvas tự do' : 'Sắp xếp thư viện tài nguyên'}
          </span>
          {saveStatusVisible ? (
            <span className="fc-save-pill">
              <span className="fc-save-dot" />
              Đã lưu
            </span>
          ) : null}
        </div>

        <div className="fc-topbar-right">
          {embedded ? (
            <button
              type="button"
              className="fc-icon-btn"
              aria-label="Canvas toàn màn hình"
              title="Canvas toàn màn hình"
              onClick={() => navigate(`/drama/projects/${projectId}/canvas`)}
            >
              <Maximize2 size={18} strokeWidth={1.8} />
            </button>
          ) : null}
          <button
            type="button"
            className="fc-icon-btn"
            aria-label="Cài đặt"
            title="Cài đặt"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings size={18} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <div className="fc-settings-pop" role="dialog" aria-label="Cài đặt canvas">
          <strong>Cài đặt canvas</strong>
          {freeCanvasMode
            ? 'Thêm nút, nối các đường và tạo ảnh, video ngay trên canvas. Bố cục và tài nguyên được tự động lưu.'
            : 'Bố cục và tài nguyên dự án được tự động đồng bộ và lưu. Ảnh tải lên qua OSS; khi ghép sẽ tải bản cache cục bộ theo nhu cầu.'}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="fc-icon-btn is-sm"
              style={{ width: 'auto', padding: '0 12px', borderRadius: 10 }}
              onClick={() => setSettingsOpen(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
