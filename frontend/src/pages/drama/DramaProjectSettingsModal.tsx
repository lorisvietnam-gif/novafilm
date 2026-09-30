/** "Cài đặt dự án" ở bước dàn ý: khung hình / phong cách hình ảnh / phụ đề / giới thiệu nhân vật / nối khung cuối (đổi được ở cấp dự án; trang storyboard chỉ xem) */
import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import { DramaImageStyleModal } from './DramaImageStyleModal'
import {
  characterIntroModeEnabled,
  readEpisodeCharacterIntroMode,
  type DramaCharacterIntroMode,
} from '../../lib/dramaCharacterIntro'
import { type ImageStyleId } from '../../lib/dramaImageStyles'
import {
  DRAMA_RATIO_OPTIONS,
  readProjectAspectRatio,
  readProjectResolution,
  type DramaAspectRatio,
  type DramaResolution,
} from '../../lib/dramaProjectOutputSettings'
import {
  clampVideoResolutionForModel,
  hasKnownVideoModelResolutions,
  resolutionsForModel,
} from '../../lib/dramaVideoGenerationOptions'
import {
  catalogVideoModels,
  useMediaModelsCatalog,
} from '../../hooks/useMediaModelsCatalog'
import {
  readEpisodeSubtitleMode,
  subtitleModeUsesModelOutput,
  type DramaSubtitleMode,
} from '../../lib/dramaSubtitleBoard'
import type { DramaProject, DramaScript } from '../../api/drama'
import { dramaApi } from '../../api/drama'

type Props = {
  open: boolean
  projectId: number
  project: DramaProject
  script: DramaScript | null
  onClose: () => void
  onProjectChange: (p: DramaProject) => void
  onScriptChange: (s: DramaScript) => void
  onError: (msg: string) => void
}

type ChoiceProps<T extends string | boolean> = {
  options: Array<{ value: T; label: string }>
  value: T
  disabled?: boolean
  onChange: (value: T) => void
}

function coerceLinkLastFrame(params: Record<string, unknown> | null | undefined): boolean {
  const raw = params?.linkLastFrame ?? params?.link_last_frame
  if (raw == null) return true
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') {
    const n = raw.trim().toLowerCase()
    if (['0', 'false', 'no', 'off', ''].includes(n)) return false
  }
  return Boolean(raw)
}

/** Dải lựa chọn trong cài đặt dự án (dùng lại kiểu chip của bước dàn ý) */
function SettingsChoiceRow<T extends string | boolean>({
  options,
  value,
  disabled,
  onChange,
}: ChoiceProps<T>) {
  return (
    <div className="drama-project-settings-chips" role="group">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={`drama-outline-chip-btn${value === opt.value ? ' is-on' : ''}`}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** Hộp thoại cài đặt thông số bản dựng ở cấp dự án */
export function DramaProjectSettingsModal({
  open,
  projectId,
  project,
  script,
  onClose,
  onProjectChange,
  onScriptChange,
  onError,
}: Props) {
  const [saving, setSaving] = useState(false)
  const projectParams = (project.params || {}) as Record<string, unknown>
  const styleId = (String(script?.params?.image_style_id || projectParams.image_style_id || '') ||
    '') as ImageStyleId | ''
  const aspectRatio = readProjectAspectRatio(projectParams)
  const resolution = readProjectResolution(projectParams)
  const catalog = useMediaModelsCatalog()
  const videoModels = catalogVideoModels(catalog)
  const videoModelId =
    String(projectParams.video_model || projectParams.model_id || '').trim() ||
    catalog?.defaults.video_model ||
    ''
  const resolutionOptions = resolutionsForModel(videoModelId, catalog, videoModels)
  const clampedResolution = clampVideoResolutionForModel(
    videoModelId,
    resolution,
    catalog,
    videoModels,
  ) as DramaResolution
  const subtitleMode = readEpisodeSubtitleMode(projectParams)
  const characterIntroMode = readEpisodeCharacterIntroMode(projectParams)
  const linkLastFrame = coerceLinkLastFrame(projectParams)

  useEffect(() => {
    if (!open || saving) return
    if (!hasKnownVideoModelResolutions(videoModelId, catalog, videoModels)) return
    if (clampedResolution === resolution) return
    void patchProjectParams({ resolution: clampedResolution })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoModelId, catalog, clampedResolution])

  async function patchProjectParams(patch: Record<string, unknown>) {
    setSaving(true)
    try {
      const nextParams = { ...projectParams, ...patch }
      const updated = await dramaApi.updateProject(projectId, { params: nextParams })
      onProjectChange(updated)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lưu cài đặt dự án thất bại')
    } finally {
      setSaving(false)
    }
  }

  async function handleStyleChange(id: ImageStyleId | '') {
    setSaving(true)
    try {
      const updated = await dramaApi.updateScript(projectId, {
        image_style_id: id || undefined,
      })
      onScriptChange(updated)
      const p = await dramaApi.getProject(projectId)
      onProjectChange(p)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lưu phong cách thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cài đặt dự án"
      size="md"
      className="drama-project-settings-modal"
      footer={
        <button type="button" className="drama-btn-primary" onClick={onClose} disabled={saving}>
          Xong
        </button>
      }
    >
      <div className="drama-project-settings">
        <p className="drama-muted drama-project-settings-lead">
          Áp dụng cho toàn dự án; trang storyboard chỉ xem. Đổi khung hình thì hãy tạo lại các cảnh quay liên quan.
        </p>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>Khung hình</h4>
          </div>
          <SettingsChoiceRow
            value={aspectRatio}
            disabled={saving}
            options={DRAMA_RATIO_OPTIONS.map((r) => ({ value: r as DramaAspectRatio, label: r }))}
            onChange={(ratio) => void patchProjectParams({ aspect_ratio: ratio })}
          />
          <div className="drama-project-settings-head">
            <h4>Độ phân giải</h4>
          </div>
          <SettingsChoiceRow
            value={clampedResolution}
            disabled={saving}
            options={resolutionOptions.map((r) => ({ value: r as DramaResolution, label: r }))}
            onChange={(res) => void patchProjectParams({ resolution: res })}
          />
        </section>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>Phong cách hình ảnh</h4>
          </div>
          <DramaImageStyleModal
            variant="field"
            fieldLabel=""
            title="Chọn phong cách cho dự án"
            emptyLabel="Chọn phong cách"
            value={styleId}
            disabled={saving}
            onChange={(id) => void handleStyleChange(id)}
          />
        </section>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>Cách làm phụ đề</h4>
          </div>
          <SettingsChoiceRow
            value={subtitleMode}
            disabled={saving}
            options={[
              { value: 'post' as DramaSubtitleMode, label: 'Phụ đề hậu kỳ' },
              { value: 'model' as DramaSubtitleMode, label: 'Phụ đề do mô hình tạo' },
            ]}
            onChange={(mode) =>
              void patchProjectParams({
                subtitleMode: mode,
                subtitleEnabled: subtitleModeUsesModelOutput(mode),
              })
            }
          />
          <p className="drama-muted">Phụ đề hậu kỳ được nối vào sau khi ra phim; phụ đề do mô hình tạo được ghi thẳng vào lúc tạo.</p>
        </section>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>Dòng giới thiệu nhân vật</h4>
          </div>
          <SettingsChoiceRow
            value={characterIntroMode}
            disabled={saving}
            options={[
              { value: 'off' as DramaCharacterIntroMode, label: 'Không có dòng giới thiệu' },
              { value: 'model' as DramaCharacterIntroMode, label: 'Giới thiệu nhân vật' },
            ]}
            onChange={(mode) =>
              void patchProjectParams({
                characterIntroMode: mode,
                characterIntroEnabled: characterIntroModeEnabled(mode),
              })
            }
          />
        </section>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>Nối giữa các cảnh quay</h4>
          </div>
          <SettingsChoiceRow
            value={linkLastFrame}
            disabled={saving}
            options={[
              { value: true, label: 'Nối khung cuối' },
              { value: false, label: 'Tạo song song' },
            ]}
            onChange={(enabled) => void patchProjectParams({ linkLastFrame: enabled })}
          />
          <p className="drama-muted">Khi bật, cảnh quay sau sẽ tham chiếu khung cuối của cảnh trước nên hình ảnh liền mạch hơn.</p>
        </section>
      </div>
    </Modal>
  )
}
