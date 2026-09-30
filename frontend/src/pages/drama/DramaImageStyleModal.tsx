/** Chọn phong cách hình ảnh: nút mở + lưới thẻ trong Modal */
import { useState } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'
import { DramaImageStyleCardGrid } from '../../components/drama/DramaImageStyleCardGrid'
import { DramaImageStylePreviewImg } from '../../components/drama/DramaImageStylePreviewImg'
import Modal from '../../components/ui/Modal'
import { getImageStyleLabel, type ImageStyleId } from '../../lib/dramaImageStyles'

type Props = {
  value: ImageStyleId | ''
  onChange: (id: ImageStyleId | '') => void
  disabled?: boolean
  /** toolbar: nút viên thuốc ở trang danh sách; field: ô kèm ảnh nhỏ ở trang dàn ý */
  variant?: 'toolbar' | 'field'
  /** Chữ bên trái của biến thể field, mặc định là "Phong cách dự án" */
  fieldLabel?: string
  /** Tiêu đề Modal */
  title?: string
  /** Chữ trên nút mở khi chưa chọn */
  emptyLabel?: string
}

// Render nút mở thư viện phong cách và Modal phong cách hình ảnh
export function DramaImageStyleModal({
  value,
  onChange,
  disabled = false,
  variant = 'toolbar',
  fieldLabel = 'Phong cách dự án',
  title = 'Phong cách hình ảnh',
  emptyLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const styleLabel = getImageStyleLabel(value)
  const triggerLabel = styleLabel || emptyLabel || (variant === 'field' ? 'Chọn phong cách' : 'Thư viện phong cách')
  const active = Boolean(value) || open

  // Chọn phong cách rồi đóng
  function select(id: ImageStyleId | '') {
    onChange(id)
    setOpen(false)
  }

  return (
    <>
      {variant === 'field' ? (
        <div className="drama-style-picker-field">
          <span className="drama-style-picker-field-label">{fieldLabel}</span>
          <button
            type="button"
            className={`drama-style-picker-trigger${active ? ' is-active' : ''}`}
            disabled={disabled}
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            {value ? (
              <span className="drama-style-picker-thumb" aria-hidden>
                <DramaImageStylePreviewImg styleId={value} alt="" loading="lazy" />
              </span>
            ) : (
              <span className="drama-style-picker-thumb is-empty" aria-hidden />
            )}
            <span className="drama-style-picker-text">{triggerLabel}</span>
            <ChevronDown size={14} strokeWidth={2} className={open ? 'is-open' : undefined} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`drama-agent-opt-trigger${active ? ' is-active' : ''}`}
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <BookOpen size={15} strokeWidth={1.8} />
          <span className="drama-agent-opt-label">{triggerLabel}</span>
          <ChevronDown size={13} strokeWidth={2} />
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={title} size="md" className="drama-style-modal">
        {/* Ảnh bìa chính là ảnh tham chiếu phong cách, tránh khiến người dùng tưởng chỉ là xem trước */}
        <p className="drama-style-modal-hint">
          Ảnh bìa sẽ được gửi kèm làm ảnh tham chiếu phong cách. Mô hình chỉ mượn tông màu, nét vẽ và ánh sáng, không sao chép nhân vật hay bố cục trong ảnh bìa.
        </p>
        <DramaImageStyleCardGrid value={value} onChange={select} noneLabel="Không có phong cách" />
      </Modal>
    </>
  )
}
