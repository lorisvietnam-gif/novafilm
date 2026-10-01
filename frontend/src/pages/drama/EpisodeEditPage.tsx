/** Chỉnh sửa tập: dựng lại bốn cột của dự án gốc (tư liệu / kịch bản / xem trước / storyboard) */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  dramaApi,
  resolveDramaMediaUrl,
  type DramaAsset,
  type DramaEpisode,
  type DramaFragment,
} from '../../api/drama'
import { type ImageStyleId } from '../../lib/dramaImageStyles'
import {
  RATIO_OPTIONS,
  buildFragmentRefStripItems,
  collectFragmentAssetIds,
  extractAssetIds,
  filterEpisodeAssets,
  formatFragLabel,
  fragmentQueueBadgeLabel,
  isFragmentGenerationBusy,
  normalizeAssetTab,
  readFragmentGenerationStatus,
  readFragmentVideoVersions,
  resolveFragmentDurationSec,
  type AssetScope,
  type AssetTab,
} from './dramaEpisodeEditUtils'
import {
  enqueueEpisodeVideoJobs,
  ensureEpisodeVideoStatusPoll,
  subscribeEpisodeGenerateStatus,
  syncEpisodeVideoJobs,
  useDramaGenQueue,
  videoJobId,
  type DramaGenJob,
} from '../../lib/dramaGenQueue'
import {
  collectDramaGenerateGateIssues,
  formatDramaGateMessage,
} from '../../lib/dramaEpisodeScriptValidate'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../lib/dramaVoiceBinding'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import { BetaNotice, BetaPromptResult } from '../../components/ui/BetaNotice'
import { dialog } from '../../lib/dialog'
import {
  formatProjectOutputLabel,
  readEpisodeAspectRatio,
  readEpisodeResolution,
} from '../../lib/dramaProjectOutputSettings'
import { DramaFragmentClipSpec } from '../../components/drama/DramaFragmentClipSpec'
import { FragmentPlanSkillModal } from '../../components/drama/FragmentPlanSkillModal'
import { DramaGenTaskDetail } from '../../components/drama/DramaGenTaskDetail'
import { CircleAlert } from 'lucide-react'
import { useDramaImageGenQueue } from '../../hooks/useDramaImageGenQueue'
import { useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { enqueueDramaImageGen } from '../../lib/dramaImageGenQueue'
import { defaultOptionsForAssetKind } from '../../lib/dramaGenerationOptions'
import { dramaAssetImageGenButtonLabel } from '../../lib/dramaAssetImage'
import { readVisualPrompt } from '../../lib/dramaVisualPrompt'
import { generateAndBindCharacterVoice } from '../../lib/characterVoiceGenerate'
import { getImageStyleId } from './dramaWorkspaceUtils'
import { EpisodeEditAssetPanel } from './EpisodeEditAssetPanel'
import { EpisodeEditHeaderControls } from './EpisodeEditHeaderControls'
import { EpisodeEditPromptEditor } from './EpisodeEditPromptEditor'
import { EpisodeEditReferenceStrip } from './EpisodeEditReferenceStrip'
import { EpisodeEditSidePane } from './EpisodeEditSidePane'
import {
  GlobalAssetPickerModal,
  importGlobalAssetToProject,
} from './GlobalAssetPickerModal'
import {
  applySubtitleModeToFragments,
  subtitleModeUsesModelOutput,
  type DramaSubtitleMode,
} from '../../lib/dramaSubtitleBoard'
import {
  applyCharacterIntroModeToFragments,
  characterIntroModeEnabled,
  type DramaCharacterIntroMode,
} from '../../lib/dramaCharacterIntro'
import {
  readEffectiveCharacterIntroMode,
  readEffectiveSubtitleMode,
} from '../../lib/dramaProjectGlobalSettings'
import {
  CharacterVoiceBindModal,
  readAssetVoiceBinding,
} from './CharacterVoiceBindModal'
import { DramaAssetDetailModal } from './DramaAssetDetailModal'
import { buildEpisodeDirItems, DramaEpisodeDir } from './DramaEpisodeDir'
import RequireAuth from './RequireAuth'
import './drama.css'

export default function EpisodeEditPage() {
  return (
    <RequireAuth>
      <EpisodeEditInner />
    </RequireAuth>
  )
}

function readFragmentPlanStatus(ep: DramaEpisode | null): string {
  // Ưu tiên đọc tác vụ lập storyboard trong trung tâm tác vụ thống nhất; params cũ chỉ là phương án dự phòng
  const active = (ep?.active_tasks || []).find((task) => task.task_type === 'fragment_plan')
  if (
    active &&
    !active.cancel_requested &&
    ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(active.status)
  ) {
    return 'generating'
  }
  const st = ep?.params?.fragment_plan_status
  return typeof st === 'string' ? st : ''
}

// Chuẩn hoá một giá trị boolean trong params của dự án, chấp nhận cả dạng chuỗi/số cũ.
function coerceProjectBool(value: unknown, defaultValue: boolean): boolean {
  if (value == null) return defaultValue
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false
  }
  return Boolean(value)
}

// Thân trang chỉnh sửa tập
function EpisodeEditInner() {
  const { projectId, episodeId } = useParams()
  const pid = Number(projectId)
  const eid = Number(episodeId)
  const navigate = useNavigate()
  /*
   * episode tập phim
   * fragments cảnh quay
   * assets tư liệu
   * selectedIndex cảnh quay đang chọn
   * assetScope / assetTab bộ lọc của thanh bên
   * editing có đang ở chế độ sửa hay không
   * videoStyleId / modelId / aspectRatio tham số sinh (UI)
   * busy / status / error trạng thái
   */
  const [episode, setEpisode] = useState<DramaEpisode | null>(null)
  const [episodeList, setEpisodeList] = useState<DramaEpisode[]>([])
  const [fragments, setFragments] = useState<DramaFragment[]>([])
  const [assets, setAssets] = useState<DramaAsset[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [assetScope, setAssetScope] = useState<AssetScope>('episode')
  const [assetTab, setAssetTab] = useState<AssetTab | null>('character')
  const [editing, setEditing] = useState(false)
  const [videoStyleId, setVideoStyleId] = useState<ImageStyleId | ''>('')
  const [modelId, setModelId] = useState('')
  const mediaCatalog = useMediaModelsCatalog()
  const [aspectRatio, setAspectRatio] = useState<(typeof RATIO_OPTIONS)[number]>('9:16')
  // subtitleMode cách làm phụ đề của tập này: do model tự sinh / ghép sau (mặc định ghép sau)
  const [subtitleMode, setSubtitleMode] = useState<DramaSubtitleMode>('post')
  // characterIntroMode có chồng chữ giới thiệu nhân vật ở tập này không: model tự chồng / tắt (mặc định tắt)
  const [characterIntroMode, setCharacterIntroMode] = useState<DramaCharacterIntroMode>('off')
  // linkLastFrame có dùng khung hình cuối của cảnh trước làm khung hình đầu của cảnh này hay không (ghi vào project.params, mặc định bật)
  const [linkLastFrame, setLinkLastFrame] = useState(true)
  // projectParams bộ nhớ params của dự án (nối tiếp giữa các cảnh + phương án dự phòng cho thông số xuất của tập)
  const [projectParams, setProjectParams] = useState<Record<string, unknown>>({})
  // episodeParams bộ nhớ params của tập (tỉ lệ khung hình / độ phân giải ghi vào đây)
  const [episodeParams, setEpisodeParams] = useState<Record<string, unknown>>({})
  // planModalOpen hộp xác nhận lập lại storyboard bằng AI (kèm chọn Skill)
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  // promptReady là prompt vừa tạo xong, để hiện kèm nút sao chép. Rỗng nghĩa là chưa bấm «Tạo prompt».
  const [promptReady, setPromptReady] = useState('')
  const [characterVoiceBusyIds, setCharacterVoiceBusyIds] = useState<Set<number>>(() => new Set())
  /*
   * detailAsset chi tiết tư liệu ở cột trái (sửa / sinh lại / tải lên)
   * voiceBindAsset tư liệu đang mở hộp gắn giọng
   * imageGenQueue ảnh chụp của hàng đợi sinh ảnh toàn cục
   */
  const [detailAsset, setDetailAsset] = useState<DramaAsset | null>(null)
  const [voiceBindAsset, setVoiceBindAsset] = useState<DramaAsset | null>(null)
  /** failReasonJob lý do lỗi mở ra từ dấu chấm than ở thanh cảnh quay phía dưới */
  const [failReasonJob, setFailReasonJob] = useState<DramaGenJob | null>(null)
  // assetCreateBusy / libraryPickerOpen tạo mới và nhập tư liệu ở thanh bên
  const [assetCreateBusy, setAssetCreateBusy] = useState(false)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  const imageGenQueue = useDramaImageGenQueue()
  const dramaGenQueue = useDramaGenQueue()
  const applyStatusRef = useRef<(st: Awaited<ReturnType<typeof dramaApi.generateStatus>>) => Awaited<
    ReturnType<typeof dramaApi.generateStatus>
  >>(() => ({ episode_id: 0, done: 0, failed: 0, running: 0, total: 0, tasks: [], fragments: [] }))
  const reloadRef = useRef<() => Promise<void>>(async () => {})
  const projectParamsRef = useRef<Record<string, unknown>>({})
  const episodeParamsRef = useRef<Record<string, unknown>>({})

  useEffect(() => {
    // Khi danh mục model đã tải xong, thay id Kie/Thuyền cũ bằng model video mặc định của backend
    if (!mediaCatalog) return
    const ids = mediaCatalog.video_models.map((m) => m.id)
    if (!ids.length) return
    setModelId((prev) => (ids.includes(prev) ? prev : mediaCatalog.defaults.video_model || ids[0]))
  }, [mediaCatalog])

  const selected = fragments[selectedIndex] || null
  const selectedDuration = selected?.duration_sec ?? 8
  // generatingIds id của các cảnh quay đang chờ hàng đợi / đang sinh trong tập hiện tại
  const generatingIds = useMemo(() => {
    const ids = new Set<number>()
    for (const task of episode?.active_tasks || []) {
      if (
        typeof task.episode_id === 'number' &&
        task.episode_id > 0 &&
        task.episode_id !== eid
      ) {
        continue
      }
      if (
        task.task_type === 'fragment_video' &&
        typeof task.fragment_id === 'number' &&
        !task.cancel_requested &&
        ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(task.status)
      ) {
        // Cảnh quay đã xong: bỏ qua tác vụ active sót lại, tránh huy hiệu kẹt ở «đang sinh»
        const frag = fragments.find((f) => f.id === task.fragment_id)
        if (frag && readFragmentGenerationStatus(frag).status === 'done') continue
        if (!frag) continue
        ids.add(task.fragment_id)
      }
    }
    for (const frag of fragments) {
      if (!frag.id) continue
      const st = readFragmentGenerationStatus(frag).status
      if (st === 'done') continue
      if (isFragmentGenerationBusy(st)) ids.add(frag.id)
    }
    return ids
  }, [eid, fragments, episode?.active_tasks])
  // anyFragmentGenerating tập này có cảnh quay nào đang chờ hàng đợi / đang sinh không (không khoá sửa, chỉ khoá sinh hàng loạt)
  const anyFragmentGenerating = generatingIds.size > 0
  // selectedIsGenerating cảnh đang chọn có đang sinh không
  const selectedIsGenerating = Boolean(selected?.id && generatingIds.has(selected.id))
  // selectedHasVideo cảnh đang chọn đã có video thành phẩm chưa (dùng cho chữ «Sinh lại»)
  const selectedHasVideo = Boolean(selected?.video)
  // selectedVersions các bản thành phẩm trước đó của cảnh đang chọn
  const selectedVersions = useMemo(() => readFragmentVideoVersions(selected), [selected])
  // previewVersion bản thành phẩm cũ đang chọn để xem trước
  const previewVersion = useMemo(
    () => selectedVersions.find((ver) => ver.id === previewVersionId) ?? null,
    [previewVersionId, selectedVersions],
  )
  const previewVideoUrl = previewVersion ? resolveDramaMediaUrl(previewVersion.video) : null
  const previewPosterUrl = previewVersion?.cover ? resolveDramaMediaUrl(previewVersion.cover) : null
  // generateAllLocked chỉ khoá lúc vừa gửi hàng đợi, trong lúc sinh không chặn thao tác sửa
  const generateAllLocked = busy
  // planFragmentsLocked chỉ khoá khi tập này đang sinh video hoặc đang lập storyboard bằng AI
  const planFragmentsLocked =
    busy || anyFragmentGenerating || readFragmentPlanStatus(episode) === 'generating'
  const selectedRefIds = useMemo(
    () => new Set(collectFragmentAssetIds(selected)),
    [selected],
  )
  const selectedRefItems = useMemo(
    () =>
      buildFragmentRefStripItems(selected, assets, resolveDramaMediaUrl, (asset) => {
        const voice = readAssetVoiceBinding(asset)
        return voice ? { label: voice.label, url: voice.url } : null
      }),
    [selected, assets],
  )
  // selectedGateIssues các lỗi chặn về kịch bản / tư liệu của cảnh đang chọn (hiện ngay trong vùng sửa)
  const selectedGateIssues = useMemo(() => {
    const { blocking, warnings } = collectDramaGenerateGateIssues(selected, assets)
    return [...blocking, ...warnings]
  }, [selected, assets])

  // prevLastFrameUrl khung hình cuối đã lưu của cảnh trước (điều kiện kích hoạt nối tiếp; tương thích trường generation / bản thành phẩm cũ)
  const prevLastFrameUrl = useMemo(() => {
    if (selectedIndex <= 0) return ''
    const prev = fragments[selectedIndex - 1]
    const params = prev?.params
    if (!params || typeof params !== 'object') return ''
    const rec = params as Record<string, unknown>
    const fromTop = rec.lastFrameUrl
    if (typeof fromTop === 'string' && fromTop.trim()) return fromTop.trim()
    const gen = rec.generation
    if (gen && typeof gen === 'object') {
      const fromGen = (gen as Record<string, unknown>).lastFrameUrl
      if (typeof fromGen === 'string' && fromGen.trim()) return fromGen.trim()
    }
    const versions = readFragmentVideoVersions(prev)
    for (const ver of versions) {
      if (ver.lastFrameUrl && ver.lastFrameUrl.trim()) return ver.lastFrameUrl.trim()
    }
    return ''
  }, [fragments, selectedIndex])

  // Khi bật nối tiếp khung hình cuối: chỉ cấm nếu cảnh trước chưa từng sinh; nếu cảnh trước đang sinh / chờ hàng đợi thì cảnh này vẫn xếp hàng chờ được
  const continuityBlockedReason = useMemo(() => {
    if (!linkLastFrame || selectedIndex <= 0) return ''
    const prev = fragments[selectedIndex - 1]
    if (!prev) return 'Thiếu cảnh trước, không thể nối tiếp'
    if (prev.id && generatingIds.has(prev.id)) {
      return ''
    }
    const prevDone =
      Boolean((prev.video || '').trim()) ||
      readFragmentGenerationStatus(prev).status === 'done' ||
      Boolean(prevLastFrameUrl)
    if (!prevDone) {
      return 'Hãy sinh cảnh trước và đợi khung hình cuối sẵn sàng'
    }
    return ''
  }, [linkLastFrame, selectedIndex, fragments, generatingIds, prevLastFrameUrl])

  const continuityQueueHint = useMemo(() => {
    if (!linkLastFrame || selectedIndex <= 0) return ''
    const prev = fragments[selectedIndex - 1]
    if (!prev?.id || !generatingIds.has(prev.id)) return ''
    return 'Cảnh trước vẫn đang sinh, cảnh này sẽ xếp hàng chờ cho tới khi cảnh trước hoàn tất'
  }, [linkLastFrame, selectedIndex, fragments, generatingIds])

  // selectedGenerateLocked chỉ khoá nút «Sinh» của cảnh đang chọn (kể cả cổng chặn nối tiếp khung hình cuối)
  const selectedGenerateLocked = busy || selectedIsGenerating || Boolean(continuityBlockedReason)

  // Lưu công tắc nối tiếp giữa các cảnh vào params của dự án, đồng thời bảo backend xếp lại các tác vụ chưa chạy
  async function handleLinkLastFrameChange(enabled: boolean) {
    const prevEnabled = linkLastFrame
    const prevParams = projectParams
    const nextParams = { ...projectParams, linkLastFrame: enabled }
    setLinkLastFrame(enabled)
    setProjectParams(nextParams)
    try {
      const updated = await dramaApi.updateProject(pid, { params: nextParams })
      const updatedParams =
        updated.params && typeof updated.params === 'object'
          ? (updated.params as Record<string, unknown>)
          : (nextParams as Record<string, unknown>)
      setProjectParams(updatedParams)
      setLinkLastFrame(coerceProjectBool(updatedParams.linkLastFrame ?? updatedParams.link_last_frame, enabled))
      // Làm mới trạng thái tác vụ của tập để thanh cảnh quay phía dưới phản ánh ngay việc sinh nối tiếp / song song
      try {
        const ep = await dramaApi.getEpisode(eid)
        setEpisode(ep)
        if (Array.isArray(ep.fragments)) setFragments(ep.fragments)
      } catch {
        /* ignore refresh errors */
      }
      setStatus(
        enabled
          ? 'Đã bật nối tiếp khung hình cuối: các tác vụ chưa bắt đầu đã chuyển sang xếp hàng theo thứ tự cảnh, tác vụ đang chạy không bị ảnh hưởng'
          : 'Đã tắt nối tiếp khung hình cuối: các tác vụ chưa bắt đầu đã trở lại và có thể sinh song song, tác vụ đang chạy không bị ảnh hưởng',
      )
    } catch (err) {
      setLinkLastFrame(prevEnabled)
      setProjectParams(prevParams)
      setError(err instanceof Error ? err.message : 'Lưu cài đặt nối tiếp thất bại')
    }
  }

  // Lưu tỉ lệ khung hình / độ phân giải của tập vào episode.params; nếu đã có thành phẩm thì nhắc sinh lại (quiet = im lặng khi model tự giới hạn)
  async function handleEpisodeOutputChange(
    nextParams: Record<string, unknown>,
    opts?: { quiet?: boolean },
  ) {
    const prevRatio = readEpisodeAspectRatio(episodeParams, projectParams)
    const prevRes = readEpisodeResolution(episodeParams, projectParams)
    const nextRatio = readEpisodeAspectRatio(nextParams, projectParams)
    const nextRes = readEpisodeResolution(nextParams, projectParams)
    if (prevRatio === nextRatio && prevRes === nextRes) return

    const prevLabel = formatProjectOutputLabel(prevRatio, prevRes)
    const nextLabel = formatProjectOutputLabel(nextRatio, nextRes)
    const generatedCount = fragments.filter((frag) => Boolean(frag.video)).length
    const quiet = Boolean(opts?.quiet)

    if (!quiet) {
      const ok = await dialog.confirm({
        title: 'Đổi tỉ lệ khung hình / độ rõ',
        message:
          generatedCount > 0
            ? `Sẽ đổi tập này từ ${prevLabel} sang ${nextLabel}. ${generatedCount} cảnh đã sinh sẽ không tự cập nhật, phải sinh lại mới ra video theo thông số mới.`
            : `Sẽ đổi tập này từ ${prevLabel} sang ${nextLabel}. Các cảnh sinh về sau sẽ dùng thông số này.`,
        confirmText: generatedCount > 0 ? 'Lưu và sinh lại' : 'Lưu',
        cancelText: 'Huỷ',
        tone: generatedCount > 0 ? 'danger' : 'default',
      })
      if (!ok) return
    }

    const prevParams = episodeParams
    setEpisodeParams(nextParams)
    episodeParamsRef.current = nextParams
    setAspectRatio(nextRatio)
    try {
      const updated = await dramaApi.updateEpisode(eid, { params: nextParams })
      const updatedParams =
        updated.params && typeof updated.params === 'object' && !Array.isArray(updated.params)
          ? (updated.params as Record<string, unknown>)
          : nextParams
      setEpisode(updated)
      setEpisodeParams(updatedParams)
      episodeParamsRef.current = updatedParams
      setAspectRatio(readEpisodeAspectRatio(updatedParams, projectParams))
      if (!quiet) {
        setStatus(
          generatedCount > 0
            ? `Đã cập nhật thông số của tập thành ${nextLabel}, đang xếp lại hàng đợi theo thông số mới…`
            : `Đã cập nhật thông số của tập thành ${nextLabel}`,
        )
        setError('')
        if (generatedCount > 0) {
          await generateAll({ forceRegen: true, skipConfirm: true })
        }
      } else if (generatedCount > 0) {
        // Model tự giới hạn theo năng lực: không hỏi xác nhận, không xếp lại hàng đợi, nhưng nhắc phải sinh lại các cảnh đã có
        setStatus(`Thông số đã được điều chỉnh theo model hiện tại thành ${nextLabel}; cảnh đã sinh phải sinh lại mới ra theo thông số mới`)
      }
    } catch (err) {
      setEpisodeParams(prevParams)
      episodeParamsRef.current = prevParams
      setAspectRatio(readEpisodeAspectRatio(prevParams, projectParams))
      setError(err instanceof Error ? err.message : 'Lưu thông số xuất của tập thất bại')
      throw err
    }
  }

  // Lưu cách làm phụ đề của tập và viết lại động câu lệnh phụ đề trong cảnh đang chọn
  async function handleEpisodeSubtitleChange(mode: DramaSubtitleMode) {
    if (mode === subtitleMode) return
    const prevParams = episodeParams
    const prevFragments = fragments
    const nextParams = {
      ...episodeParams,
      subtitleMode: mode,
      subtitleEnabled: subtitleModeUsesModelOutput(mode),
    }
    const nextFragments = applySubtitleModeToFragments(fragments, mode)
    setSubtitleMode(mode)
    setEpisodeParams(nextParams)
    episodeParamsRef.current = nextParams
    setFragments(nextFragments)
    try {
      const updated = await dramaApi.updateEpisode(eid, { params: nextParams })
      const updatedParams =
        updated.params && typeof updated.params === 'object' && !Array.isArray(updated.params)
          ? (updated.params as Record<string, unknown>)
          : nextParams
      setEpisode(updated)
      setEpisodeParams(updatedParams)
      episodeParamsRef.current = updatedParams
      setSubtitleMode(readEffectiveSubtitleMode(updatedParams, projectParamsRef.current))
      const contentChanged = nextFragments.some(
        (frag, index) => frag.content !== prevFragments[index]?.content,
      )
      if (contentChanged) {
        const ep = await dramaApi.saveFragments(
          eid,
          nextFragments.map((f, i) => {
            const prevFragParams =
              f.params && typeof f.params === 'object' && !Array.isArray(f.params)
                ? (f.params as Record<string, unknown>)
                : {}
            return {
              id: typeof f.id === 'number' && f.id > 0 ? f.id : undefined,
              sort_order: i,
              content: f.content,
              cover: f.cover,
              video: f.video,
              duration_sec: resolveFragmentDurationSec(f.content, f.duration_sec),
              params: { ...prevFragParams, user_edited: true },
              asset_ids: f.asset_ids || [],
            }
          }),
        )
        setEpisode(ep)
        setFragments(ep.fragments || nextFragments)
      }
      setStatus(
        mode === 'model'
          ? 'Đã chuyển sang phụ đề do model tự sinh và đã bổ sung lại câu lệnh phụ đề cho cảnh quay'
          : 'Đã chuyển sang ghép phụ đề sau hậu kỳ và đã gỡ câu lệnh phụ đề khỏi cảnh quay',
      )
      setError('')
    } catch (err) {
      setSubtitleMode(readEffectiveSubtitleMode(prevParams, projectParamsRef.current))
      setEpisodeParams(prevParams)
      episodeParamsRef.current = prevParams
      setFragments(prevFragments)
      setError(err instanceof Error ? err.message : 'Lưu cách làm phụ đề của tập thất bại')
    }
  }

  // Lưu công tắc chồng chữ giới thiệu nhân vật của tập và gỡ động dòng giới thiệu trong cảnh đang chọn
  async function handleEpisodeCharacterIntroChange(mode: DramaCharacterIntroMode) {
    if (mode === characterIntroMode) return
    const prevParams = episodeParams
    const prevFragments = fragments
    const nextParams = {
      ...episodeParams,
      characterIntroMode: mode,
      characterIntroEnabled: characterIntroModeEnabled(mode),
    }
    const nextFragments = applyCharacterIntroModeToFragments(fragments, mode)
    setCharacterIntroMode(mode)
    setEpisodeParams(nextParams)
    episodeParamsRef.current = nextParams
    setFragments(nextFragments)
    try {
      const updated = await dramaApi.updateEpisode(eid, { params: nextParams })
      const updatedParams =
        updated.params && typeof updated.params === 'object' && !Array.isArray(updated.params)
          ? (updated.params as Record<string, unknown>)
          : nextParams
      setEpisode(updated)
      setEpisodeParams(updatedParams)
      episodeParamsRef.current = updatedParams
      setCharacterIntroMode(readEffectiveCharacterIntroMode(updatedParams, projectParamsRef.current))
      const contentChanged = nextFragments.some(
        (frag, index) => frag.content !== prevFragments[index]?.content,
      )
      if (contentChanged) {
        const ep = await dramaApi.saveFragments(
          eid,
          nextFragments.map((f, i) => {
            const prevFragParams =
              f.params && typeof f.params === 'object' && !Array.isArray(f.params)
                ? (f.params as Record<string, unknown>)
                : {}
            return {
              id: typeof f.id === 'number' && f.id > 0 ? f.id : undefined,
              sort_order: i,
              content: f.content,
              cover: f.cover,
              video: f.video,
              duration_sec: resolveFragmentDurationSec(f.content, f.duration_sec),
              params: { ...prevFragParams, user_edited: true },
              asset_ids: f.asset_ids || [],
            }
          }),
        )
        setEpisode(ep)
        setFragments(ep.fragments || nextFragments)
      }
      setStatus(
        mode === 'model'
          ? 'Đã bật chồng chữ giới thiệu nhân vật; khi lập lại storyboard, dòng giới thiệu sẽ được chèn lại'
          : 'Đã tắt giới thiệu nhân vật và đã gỡ dòng chồng chữ giới thiệu khỏi cảnh quay',
      )
      setError('')
    } catch (err) {
      setCharacterIntroMode(readEffectiveCharacterIntroMode(prevParams, projectParamsRef.current))
      setEpisodeParams(prevParams)
      episodeParamsRef.current = prevParams
      setFragments(prevFragments)
      setError(err instanceof Error ? err.message : 'Lưu cài đặt giới thiệu nhân vật của tập thất bại')
    }
  }

  const referencedIds = useMemo(() => {
    const set = new Set<number>()
    for (const f of fragments) {
      for (const id of extractAssetIds(f.content || '')) set.add(id)
      for (const id of f.asset_ids || []) set.add(id)
    }
    return set
  }, [fragments])

  const filteredAssets = useMemo(
    () => filterEpisodeAssets(assets, assetScope, assetTab, referencedIds),
    [assets, assetScope, assetTab, referencedIds],
  )

  // Áp tiến độ sinh từ backend và đồng bộ trạng thái của từng cảnh + hàng đợi toàn cục
  function applyGenerateStatus(st: Awaited<ReturnType<typeof dramaApi.generateStatus>>) {
    setStatus(`Xong ${st.done}/${st.total} · Đang chạy ${st.running} · Lỗi ${st.failed}`)
    const byId = new Map(st.fragments.map((f) => [f.fragment_id, f.status]))
    setFragments((prev) => {
      const next = prev.map((f) => {
        if (!f.id) return f
        const genStatus = byId.get(f.id)
        if (!genStatus) return f
        const item = st.fragments.find((x) => x.fragment_id === f.id) as
          | {
              fragment_id: number
              status: string
              video?: string
              cover?: string
              message?: string
              phase?: string
              error?: string
            }
          | undefined
        return {
          ...f,
          video: item?.video || f.video,
          cover: item?.cover || f.cover,
          params: {
            ...(f.params || {}),
            generation: {
              status: genStatus,
              video: item?.video,
              cover: item?.cover,
              message: item?.message,
              phase: item?.phase,
              error: item?.error,
            },
          },
        }
      })
      syncEpisodeVideoJobs({
        projectId: pid,
        episodeId: eid,
        episodeName: episode?.name,
        fragments: next.map((f) => ({
          id: f.id,
          sort_order: f.sort_order,
          content: f.content,
        })),
        statusItems: st.fragments.map((f) => {
          const row = f as {
            fragment_id: number
            status: string
            message?: string
            phase?: string
            error?: string
            video?: string
            cover?: string
          }
          return {
            fragment_id: row.fragment_id,
            status: row.status,
            message: row.message,
            phase: row.phase,
            error: row.error,
            video: row.video,
            cover: row.cover,
          }
        }),
        taskItems: st.tasks,
      })
      return next
    })
    return st
  }

  applyStatusRef.current = applyGenerateStatus

  // Vào trang thì kiểm tra có tác vụ sinh hoặc lập storyboard bằng AI đang chạy không
  async function resumeGenerateIfNeeded() {
    try {
      const ep = await dramaApi.getEpisode(eid)
      if (readFragmentPlanStatus(ep) === 'generating') {
        setBusy(true)
        setStatus('AI đang lập storyboard…')
        const started = Date.now()
        while (Date.now() - started < 10 * 60 * 1000) {
          await new Promise((r) => setTimeout(r, 2500))
          const cur = await dramaApi.getEpisode(eid)
          const st = readFragmentPlanStatus(cur)
          if (st === 'completed') {
            setEpisode(cur)
            setFragments(cur.fragments || [])
            setSelectedIndex(0)
            setStatus(`AI đã lập storyboard xong · ${(cur.fragments || []).length} cảnh`)
            setBusy(false)
            return
          }
          if (st === 'failed') {
            setError(String(cur.params?.fragment_plan_error || 'AI lập storyboard thất bại'))
            setBusy(false)
            return
          }
          if (st === 'failed') {
            setError(String(cur.params?.fragment_plan_error || 'AI lập storyboard thất bại'))
            setBusy(false)
            return
          }
        }
        setBusy(false)
        return
      }
      const st = applyGenerateStatus(await dramaApi.generateStatus(eid))
      if (st.running > 0) ensureEpisodeVideoStatusPoll()
    } catch {
      /* ignore */
    }
  }

  // Mở bảng storyboard toàn màn hình
  function openEpisodeStoryboard() {
    navigate(`/drama/projects/${pid}/episodes/${eid}/canvas`)
  }

  // Tải lại tập
  async function reload() {
    const ep = await dramaApi.getEpisode(eid)
    setEpisode(ep)
    const epParams =
      ep.params && typeof ep.params === 'object' && !Array.isArray(ep.params)
        ? (ep.params as Record<string, unknown>)
        : {}
    setEpisodeParams(epParams)
    episodeParamsRef.current = epParams
    setSubtitleMode(readEffectiveSubtitleMode(epParams, projectParamsRef.current))
    setCharacterIntroMode(readEffectiveCharacterIntroMode(epParams, projectParamsRef.current))
    setAspectRatio(readEpisodeAspectRatio(epParams, projectParamsRef.current))
    setFragments(ep.fragments || [])
    if ((ep.fragments || []).length === 0) {
      setFragments([
        {
          id: 0,
          episode_id: eid,
          sort_order: 0,
          content: '',
          cover: '',
          video: '',
          duration_sec: 8,
          asset_ids: [],
        },
      ])
    }
    await resumeGenerateIfNeeded()
  }

  reloadRef.current = reload

  // Tái dùng vòng lặp generate_status toàn cục để khỏi gọi trùng với dramaGenQueue
  useEffect(() => {
    return subscribeEpisodeGenerateStatus(async (episodeId, st) => {
      if (episodeId !== eid) return
      const result = applyStatusRef.current(st)
      if (result.running === 0) {
        await reloadRef.current()
      }
    })
  }, [eid])

  // Chuyển cảnh thì thoát chế độ xem bản thành phẩm cũ
  useEffect(() => {
    setPreviewVersionId(null)
  }, [selectedIndex, selected?.id])

  // Chuyển cảnh thì bỏ prompt đã tạo của cảnh trước, tránh hiện nhầm sang cảnh mới
  useEffect(() => {
    setPromptReady('')
  }, [selectedIndex])

  useEffect(() => {
    if (!eid || !pid) return
    setBusy(false)
    setStatus('')
    setError('')
    reload().catch((err) => setError(err instanceof Error ? err.message : 'Tải dữ liệu thất bại'))
    dramaApi
      .listAssets(pid)
      .then(setAssets)
      .catch(() => setAssets([]))
    dramaApi
      .listEpisodes(pid)
      .then((rows) => setEpisodeList(rows))
      .catch(() => setEpisodeList([]))
    // Nạp phong cách hình ảnh mặc định của dự án / nối tiếp giữa các cảnh vào thanh trên cùng
    dramaApi
      .getProject(pid)
      .then((project) => {
        const styleId = getImageStyleId(project.script, project)
        if (styleId) setVideoStyleId(styleId as ImageStyleId)
        const params =
          project.params && typeof project.params === 'object' && !Array.isArray(project.params)
            ? (project.params as Record<string, unknown>)
            : {}
        setProjectParams(params)
        projectParamsRef.current = params
        const linkRaw = params.linkLastFrame ?? params.link_last_frame
        setLinkLastFrame(coerceProjectBool(linkRaw, true))
        setSubtitleMode(readEffectiveSubtitleMode(episodeParamsRef.current, params))
        setCharacterIntroMode(readEffectiveCharacterIntroMode(episodeParamsRef.current, params))
        setAspectRatio(readEpisodeAspectRatio(episodeParamsRef.current, params))
      })
      .catch(() => {
        /* ignore */
      })
  }, [eid, pid])

  // Cập nhật cảnh đang chọn
  function updateSelected(patch: Partial<DramaFragment>) {
    // Sửa nội dung cảnh là prompt cũ không còn đúng, nên bỏ kết quả đang hiện
    setPromptReady('')
    setFragments((prev) =>
      prev.map((f, i) => (i === selectedIndex ? { ...f, ...patch } : f)),
    )
  }

  // Chèn một cảnh trống
  function insertFrag(at: number) {
    setFragments((prev) => {
      const next = [...prev]
      next.splice(at, 0, {
        id: 0,
        episode_id: eid,
        sort_order: at,
        content: '',
        cover: '',
        video: '',
        duration_sec: 8,
        asset_ids: [],
      })
      return next
    })
    setSelectedIndex(at)
    setEditing(true)
  }

  // Nhân bản cảnh
  function duplicateFrag(index: number) {
    const source = fragments[index]
    if (!source) return
    setFragments((prev) => {
      const next = [...prev]
      next.splice(index + 1, 0, {
        ...source,
        id: 0,
        sort_order: index + 1,
      })
      return next
    })
    setSelectedIndex(index + 1)
  }

  // Xoá cảnh
  function deleteFrag(index: number) {
    if (fragments.length <= 1) return
    setFragments((prev) => prev.filter((_, i) => i !== index))
    setSelectedIndex((cur) => {
      if (cur === index) return Math.max(0, index - 1)
      if (cur > index) return cur - 1
      return cur
    })
  }

  // Lưu toàn bộ cảnh quay (có gửi kèm id để cập nhật, tránh mỗi lần dựng lại id làm đứt các lần sinh đang chạy; đánh dấu user_edited để bộ tự cắt lại không ghi đè)
  async function save() {
    setBusy(true)
    setError('')
    try {
      const ep = await dramaApi.saveFragments(
        eid,
        fragments.map((f, i) => {
          const prevParams =
            f.params && typeof f.params === 'object' && !Array.isArray(f.params)
              ? (f.params as Record<string, unknown>)
              : {}
          return {
            id: typeof f.id === 'number' && f.id > 0 ? f.id : undefined,
            sort_order: i,
            content: f.content,
            cover: f.cover,
            video: f.video,
            duration_sec: resolveFragmentDurationSec(f.content, f.duration_sec),
            params: { ...prevParams, user_edited: true },
            asset_ids: f.asset_ids || [],
          }
        }),
      )
      setEpisode(ep)
      setFragments(ep.fragments || [])
      setStatus('Đã lưu')
      setEditing(false)
      return ep
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu thất bại')
      throw err
    } finally {
      setBusy(false)
    }
  }

  // Kiểm tra cảnh nào có thể bỏ qua an toàn khi bấm «Sinh tất cả»: chỉ bỏ qua cảnh cũ chưa sửa và đã có thành phẩm
  function shouldSkipGenerateAllFragment(frag: DramaFragment): boolean {
    if (!frag.video || !frag.id) return false
    const prev = (episode?.fragments || []).find((item) => item.id === frag.id)
    if (!prev?.video) return false
    const sameContent = (prev.content || '') === (frag.content || '')
    const sameCover = (prev.cover || '') === (frag.cover || '')
    const sameDuration =
      resolveFragmentDurationSec(prev.content || '', prev.duration_sec) ===
      resolveFragmentDurationSec(frag.content || '', frag.duration_sec)
    const prevAssetIds = [...(prev.asset_ids || [])].sort((a, b) => a - b)
    const nextAssetIds = [...(frag.asset_ids || [])].sort((a, b) => a - b)
    const sameAssets =
      prevAssetIds.length === nextAssetIds.length &&
      prevAssetIds.every((id, index) => id === nextAssetIds[index])
    return sameContent && sameCover && sameDuration && sameAssets
  }

  // Chỉ sinh cảnh đang chọn (lưu theo id, lúc sinh vẫn dùng id backend trả về sau khi lưu)
  async function generateSelected() {
    if (!selected) {
      setError('Hãy chọn một cảnh quay trước')
      return
    }
    if (selectedGenerateLocked) {
      if (continuityBlockedReason) {
        setError(continuityBlockedReason)
        await dialog.alert({
          title: 'Không thể sinh',
          message: `${continuityBlockedReason}. Khi bật «Nối tiếp khung hình cuối», phải có thành phẩm của cảnh trước rồi mới sinh cảnh này theo đúng thứ tự.`,
        })
      } else if (selectedIsGenerating) {
        setError('Cảnh đang chọn đang được sinh, vui lòng đợi xong rồi thử lại')
      } else {
        setError('Vui lòng đợi thao tác hiện tại hoàn tất rồi thử lại')
      }
      return
    }

    const { blocking, warnings } = collectDramaGenerateGateIssues(selected, assets)
    if (blocking.length > 0) {
      setError(blocking.map((i) => i.message).join('；'))
      await dialog.alert({
        title: 'Không thể sinh',
        message: formatDramaGateMessage(blocking, warnings, 'Hãy sửa kịch bản theo quy tắc của tập trước khi sinh.'),
      })
      return
    }

    const fragLabel = formatFragLabel(selectedIndex, selectedDuration)
    setPromptReady('')
    const ok = await dialog.confirm({
      title: `Tạo prompt cho «${fragLabel}»`,
      message: formatDramaGateMessage(
        [],
        warnings,
        `Bản beta này tạo prompt, chưa render video trong hệ thống. Prompt của «${fragLabel}» sẽ được lưu và bạn có nút sao chép để mang sang Veo, Muse, Kling, Seedance hoặc công cụ khác.`,
      ),
      confirmText: warnings.length > 0 ? 'Vẫn tạo prompt' : 'Tạo prompt',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    setStatus('Đang lưu và tạo prompt cho cảnh đang chọn…')
    try {
      const ep = await save()
      setBusy(true)
      const frag = (ep.fragments || [])[selectedIndex]
      if (!frag?.id) {
        throw new Error('Sau khi lưu không tìm thấy cảnh đang chọn, vui lòng tải lại rồi thử lại')
      }
      await dramaApi.generateEpisode(eid, [frag.id], modelId)
      // Ghi trạng thái chờ hàng đợi ngay (lạc quan) để video cũ không đè trạng thái thành đã xong
      setFragments((prev) =>
        prev.map((f) =>
          f.id === frag.id
            ? {
                ...f,
                params: {
                  ...(f.params || {}),
                  generation: { status: 'queued', message: 'Đã xếp hàng' },
                },
              }
            : f,
        ),
      )
      enqueueEpisodeVideoJobs({
        projectId: pid,
        episodeId: eid,
        episodeName: ep.name || episode?.name,
        fragments: (ep.fragments || []).map((f, i) => ({
          id: f.id,
          sort_order: f.sort_order ?? i,
        })),
        fragmentIds: [frag.id],
      })
      setBusy(false)
      // Nói đúng thứ vừa xảy ra: đã có prompt kèm nút sao chép, chưa có video.
      setPromptReady((frag.content || '').trim())
      setStatus('')
      ensureEpisodeVideoStatusPoll()
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Tạo prompt thất bại')
    }
  }

  // Đổi một bản thành phẩm cũ thành video đang xem trước
  async function activateVideoVersion(versionId: string) {
    if (!selected?.id || selectedIsGenerating) return
    const ok = await dialog.confirm({
      title: 'Chuyển sang phiên bản cũ',
      message: 'Bản thành phẩm cũ này sẽ thay thế video đang xem trước; thành phẩm hiện tại sẽ nằm trong danh sách phiên bản cũ.',
      confirmText: 'Chuyển',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      const result = await dramaApi.activateFragmentVideoVersion(selected.id, versionId)
      setFragments((prev) =>
        prev.map((f) =>
          f.id === selected.id
            ? {
                ...f,
                video: result.video,
                cover: result.cover || '',
                params: {
                  ...(f.params || {}),
                  video_versions: result.video_versions,
                  lastFrameUrl: result.lastFrameUrl || undefined,
                  generation: {
                    status: 'done',
                    video: result.video,
                    cover: result.cover,
                    lastFrameUrl: result.lastFrameUrl,
                  },
                },
              }
            : f,
        ),
      )
      setPreviewVersionId(null)
      setStatus('Đã chuyển sang phiên bản cũ')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chuyển phiên bản thất bại')
    } finally {
      setBusy(false)
    }
  }

  // Sinh tất cả: xếp hàng toàn bộ cảnh của tập (forceRegen ghi đè các thành phẩm đã có)
  async function generateAll(opts?: { forceRegen?: boolean; skipConfirm?: boolean }) {
    if (fragments.length === 0) {
      setError('Không có cảnh quay nào để sinh')
      return
    }
    if (generateAllLocked) {
      setError('Đang gửi yêu cầu, vui lòng đợi')
      return
    }

    const allBlocking: string[] = []
    const allWarnings: string[] = []
    const doneIndices: number[] = []
    for (let i = 0; i < fragments.length; i++) {
      if (!opts?.forceRegen && shouldSkipGenerateAllFragment(fragments[i])) {
        doneIndices.push(i)
        continue
      }
      const { blocking, warnings } = collectDramaGenerateGateIssues(fragments[i], assets)
      const label = formatFragLabel(i, fragments[i]?.duration_sec)
      for (const issue of blocking) allBlocking.push(`${label}：${issue.message}`)
      for (const issue of warnings) allWarnings.push(`${label}：${issue.message}`)
    }
    const pendingCount = fragments.length - doneIndices.length
    if (pendingCount <= 0) {
      setStatus('Các cảnh của tập đã sinh xong hết, đã tự động bỏ qua')
      return
    }
    if (allBlocking.length > 0) {
      setError(allBlocking[0] || 'Kiểm tra kịch bản cảnh quay không đạt')
      await dialog.alert({
        title: 'Không thể sinh tất cả',
        message: ['Hãy sửa các vấn đề sau trước:', '', ...allBlocking.slice(0, 8).map((m) => `· ${m}`)].join(
          '\n',
        ),
      })
      return
    }

    if (!opts?.skipConfirm) {
      const ok = await dialog.confirm({
        title: opts?.forceRegen ? 'Sinh lại theo thông số mới' : 'Sinh toàn bộ video cảnh quay',
        message: formatDramaGateMessage(
          [],
          allWarnings.slice(0, 8).map((message) => ({ level: 'warn' as const, message })),
          opts?.forceRegen
            ? `Sẽ sinh lại ${pendingCount} cảnh theo tỉ lệ khung hình / độ rõ hiện tại. Thành phẩm hiện tại được giữ lại thành phiên bản cũ.`
            : linkLastFrame
              ? `Sẽ xếp hàng sinh ${pendingCount} cảnh còn lại theo thứ tự (bỏ qua ${doneIndices.length} cảnh đã sinh). Sau khi xếp hàng bạn vẫn sửa tiếp được; cảnh sau sẽ đợi khung hình cuối của cảnh trước được ghi xong mới bắt đầu.`
              : `Sẽ sinh song song ${pendingCount} cảnh còn lại (bỏ qua ${doneIndices.length} cảnh đã sinh). Sau khi xếp hàng bạn vẫn sửa tiếp được; các cảnh không chờ nhau.`,
        ),
        confirmText: allWarnings.length > 0 ? 'Vẫn sinh tất cả' : opts?.forceRegen ? 'Sinh lại toàn bộ' : 'Sinh tất cả',
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusy(true)
    setError('')
    setStatus(`Đang lưu và xếp hàng sinh ${pendingCount} cảnh còn lại…`)
    try {
      const ep = await save()
      setBusy(true)
      const ids = (ep.fragments || [])
        .filter((_, index) => !doneIndices.includes(index))
        .map((f) => f.id)
        .filter((id): id is number => typeof id === 'number' && id > 0)
      if (ids.length === 0) {
        setStatus('Sau khi lưu phát hiện các cảnh đã sinh xong hết, đã tự động bỏ qua')
        setBusy(false)
        return
      }
      const genResult = await dramaApi.generateEpisode(eid, ids, modelId)
      const queuedIds =
        Array.isArray(genResult.fragment_ids) && genResult.fragment_ids.length > 0
          ? genResult.fragment_ids
          : ids
      enqueueEpisodeVideoJobs({
        projectId: pid,
        episodeId: eid,
        episodeName: ep.name || episode?.name,
        fragments: (ep.fragments || []).map((f, i) => ({
          id: f.id,
          sort_order: f.sort_order ?? i,
        })),
        fragmentIds: queuedIds,
      })
      const deferred = Number(genResult.deferred_count || 0)
      const limit = Number(genResult.user_job_limit || 0)
      if (deferred > 0 && limit > 0) {
        setStatus(
          `Đã xếp hàng ${queuedIds.length} cảnh: tối đa ${limit} cảnh sinh cùng lúc, ${deferred} cảnh còn lại đang chờ trong hàng đợi`,
        )
      } else {
        setStatus(`Đã xếp hàng ${queuedIds.length} cảnh, đang sinh…`)
      }
      setBusy(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sinh tất cả thất bại')
      setBusy(false)
    }
  }

  // Quay lại phần dàn ý nội dung
  function handleBack() {
    navigate(`/drama/projects/${pid}`, { state: { activeStep: 'outline' } })
  }

  // Chuyển tập ở danh mục bên trái
  function handleSelectEpisode(nextId: number) {
    if (nextId === eid) return
    navigate(`/drama/projects/${pid}/episodes/${nextId}`)
  }

  // Lập lại storyboard cho một tập bằng LLM: xác nhận và chọn Skill rồi mới xếp hàng
  function planFragmentsWithLlm() {
    if (planFragmentsLocked) {
      setError('Hiện có tác vụ sinh video đang chạy, vui lòng đợi rồi hãy lập lại storyboard')
      return
    }
    setPlanModalOpen(true)
  }

  // Sau khi xếp hàng thì vòng lặp tới khi xong (cách làm phụ đề theo cài đặt hiện tại ở thanh trên)
  async function startPlanFragments(skillIds: number[]) {
    setPlanModalOpen(false)
    setBusy(true)
    setError('')
    setStatus('AI đang lập storyboard…')
    try {
      await dramaApi.planEpisodeFragments(eid, {
        force: true,
        fallback_rules: true,
        skill_ids: skillIds,
        subtitle_enabled: subtitleModeUsesModelOutput(subtitleMode),
      })
      const started = Date.now()
      while (Date.now() - started < 10 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 2500))
        const ep = await dramaApi.getEpisode(eid)
        const st = readFragmentPlanStatus(ep)
        if (st === 'completed') {
          setEpisode(ep)
          const nextParams = (ep.params as Record<string, unknown>) || {}
          setEpisodeParams(nextParams)
          episodeParamsRef.current = nextParams
          setFragments(ep.fragments || [])
          setSelectedIndex(0)
          setEditing(false)
          const mode = String(ep.params?.fragment_plan_mode || 'llm')
          const count = Number(ep.params?.fragment_plan_count) || (ep.fragments || []).length
          setStatus(
            mode === 'rules_fallback'
              ? `Đã lập storyboard xong (model lỗi nên đã lùi về cách cắt theo quy tắc) · ${count} cảnh`
              : `AI đã lập storyboard xong · ${count} cảnh`,
          )
          setBusy(false)
          return
        }
        if (st === 'failed') {
          const msg = String(ep.params?.fragment_plan_error || 'AI lập storyboard thất bại')
          setError(msg)
          setBusy(false)
          return
        }
        setStatus('AI đang lập storyboard…')
      }
      throw new Error('AI lập storyboard quá thời gian chờ, vui lòng tải lại sau')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI lập storyboard thất bại')
      setBusy(false)
    }
  }

  // Bấm vào một tư liệu để chèn trích dẫn @
  function mentionAsset(asset: DramaAsset) {
    if (!selected) return
    const mention = `@asset:${asset.id}`
    const raw = selected.content || ''
    const already = new RegExp(`@asset:${asset.id}(?!\\d)`).test(raw)
    const content = already ? raw : raw ? `${raw.trimEnd()}\n${mention}` : mention
    const ids = Array.from(new Set([...(selected.asset_ids || []), asset.id]))
    updateSelected({ content, asset_ids: ids })
    setEditing(true)
  }

  // Xác định loại tư liệu đang tạo ở thanh bên (chưa chọn phân loại thì mặc định là nhân vật)
  function resolveCreateAssetTab(): AssetTab {
    return assetTab || 'character'
  }

  // Sau khi tạo thì gắn vào cảnh đang chọn và mở chi tiết, để danh sách của tập thấy ngay
  function adoptCreatedAsset(created: DramaAsset, kind: AssetTab) {
    setAssets((prev) => (prev.some((a) => a.id === created.id) ? prev : [...prev, created]))
    setAssetTab(kind)
    mentionAsset(created)
    if ((created.type || '').toLowerCase() !== 'voice') {
      setDetailAsset(created)
    }
  }

  // Tự tạo nhân vật / bối cảnh / đạo cụ
  async function handleCreateSideAsset() {
    const kind = resolveCreateAssetTab()
    const label = kind === 'scene' ? 'bối cảnh' : kind === 'prop' ? 'đạo cụ' : 'nhân vật'
    const name = await dialog.prompt({
      title: `Tạo ${label} mới`,
      message: `Nhập tên ${label}. Sau khi tạo, nó sẽ được chèn vào cảnh đang chọn và bạn có thể tiếp tục sinh hoặc tải hình lên.`,
      placeholder: kind === 'scene' ? 'Ví dụ: vườn thượng uyển cung đình' : kind === 'prop' ? 'Ví dụ: miếng ngọc bích' : 'Ví dụ: Bạch Long',
      confirmText: 'Tạo',
    })
    if (!name?.trim()) return
    setAssetCreateBusy(true)
    setError('')
    try {
      const created = await dramaApi.createAsset({
        project_id: pid,
        type: kind,
        asset_type: 'image',
        name: name.trim(),
        params: { kind },
      })
      adoptCreatedAsset(created, kind)
      setStatus(`Đã tạo ${label} «${created.name}» và chèn vào cảnh đang chọn`)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Tạo ${label} thất bại`)
    } finally {
      setAssetCreateBusy(false)
    }
  }

  // Nhập từ thư viện tư liệu toàn cục vào dự án này rồi gắn vào cảnh đang chọn
  async function handleImportSideAsset(source: DramaAsset) {
    const kind = normalizeAssetTab(source.type) || resolveCreateAssetTab()
    setAssetCreateBusy(true)
    setError('')
    try {
      const created = await importGlobalAssetToProject(pid, source)
      adoptCreatedAsset(created, kind)
      setLibraryPickerOpen(false)
      setStatus(`Đã nhập «${created.name}» và chèn vào cảnh đang chọn`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nhập tư liệu thất bại')
      throw err
    } finally {
      setAssetCreateBusy(false)
    }
  }

  // Chỉ bỏ liên kết của cảnh đang chọn với tư liệu này (không xoá tư liệu khỏi dự án)
  function unlinkSelectedAsset(assetId: number) {
    if (!selected) return
    const content = (selected.content || '')
      .replace(new RegExp(`\\s*@asset:${assetId}(?!\\d)`, 'g'), ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    const asset_ids = (selected.asset_ids || []).filter((id) => id !== assetId)
    updateSelected({ content, asset_ids })
    setEditing(true)
    const name = assets.find((a) => a.id === assetId)?.name
    setStatus(
      name
        ? `Đã bỏ liên kết của cảnh này với «${name}», tư liệu vẫn còn trong dự án (chuyển sang «Toàn bộ» để xem)`
        : 'Đã bỏ liên kết của cảnh này, tư liệu vẫn còn trong dự án (chuyển sang «Toàn bộ» để xem)',
    )
  }

  // Từ thanh liên kết nhảy sang phân loại tương ứng và mở chi tiết tư liệu
  function focusLinkedAsset(assetId: number) {
    const asset = assets.find((a) => a.id === assetId)
    if (!asset) return
    const tab = normalizeAssetTab(asset.type)
    if (tab) setAssetTab(tab)
    setAssetScope('series')
    if ((asset.type || '').toLowerCase() !== 'voice') {
      setDetailAsset(asset)
    }
  }

  // Cập nhật tư liệu (sau khi gắn giọng / tải lên / sinh ảnh thì làm mới cả danh sách lẫn chi tiết)
  function handleCharacterUpdated(updated: DramaAsset) {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    setDetailAsset((prev) => (prev?.id === updated.id ? updated : prev))
  }

  // id của các tư liệu đang chờ hàng đợi / đang sinh ảnh
  const imageBusyIds = useMemo(() => {
    const ids = new Set<number>()
    for (const job of imageGenQueue) {
      if (job.status === 'queued' || job.status === 'running') ids.add(job.assetId)
    }
    return ids
  }, [imageGenQueue])

  // Chữ trên nút sinh ảnh trong hộp chi tiết
  function assetImageGenLabel(asset: DramaAsset): string {
    const job = imageGenQueue.find(
      (j) =>
        j.assetId === asset.id && (j.status === 'queued' || j.status === 'running'),
    )
    let queueLabel: string | null = null
    if (job) {
      if (job.status === 'running') queueLabel = 'Đang sinh…'
      else {
        const queuedOnly = imageGenQueue.filter(
          (j) => j.status === 'queued' || j.status === 'running',
        )
        const pos = queuedOnly.findIndex((j) => j.id === job.id) + 1
        queueLabel = pos > 1 ? `Hàng đợi #${pos}` : 'Đang xếp hàng…'
      }
    }
    return dramaAssetImageGenButtonLabel(asset, queueLabel)
  }

  // Đưa việc sinh ảnh của tư liệu vào hàng đợi toàn cục
  function enqueueAssetImage(asset: DramaAsset) {
    if (imageBusyIds.has(asset.id)) return
    const options = {
      ...defaultOptionsForAssetKind(asset.type),
      image_style_id: videoStyleId || undefined,
    }
    void enqueueDramaImageGen({
      projectId: pid,
      assetId: asset.id,
      assetName: asset.name || undefined,
      assetType: asset.type,
      prompt: readVisualPrompt(asset),
      options,
      onAssetUpdate: handleCharacterUpdated,
    })
      .then((updated) => handleCharacterUpdated(updated))
      .catch((err) => setError(err instanceof Error ? err.message : 'Sinh ảnh thất bại'))
  }

  // Mở lý do lỗi của cảnh (ưu tiên tác vụ trong hàng đợi, nếu không thì dùng params.generation.error của cảnh)
  function openFragmentFailReason(frag: DramaFragment, index: number) {
    if (!frag.id) return
    const fromQueue = dramaGenQueue.find(
      (j) => j.id === videoJobId(frag.id!) || (j.kind === 'video' && j.targetId === frag.id),
    )
    const gen = readFragmentGenerationStatus(frag)
    const title = `${episode?.name || 'Tập này'} · ${formatFragLabel(index, frag.duration_sec)}`
    setFailReasonJob({
      id: fromQueue?.id || videoJobId(frag.id),
      kind: 'video',
      projectId: pid,
      targetId: frag.id,
      episodeId: eid || undefined,
      taskId: fromQueue?.taskId,
      title: fromQueue?.title || title,
      subtype: 'Video cảnh quay',
      status: 'failed',
      error: fromQueue?.error || gen.error || 'Sinh thất bại',
      createdAt: fromQueue?.createdAt || Date.now(),
    })
  }

  // Sinh giọng cho nhân vật bằng AI và gắn luôn (mỗi nhân vật một trạng thái chờ riêng, không chặn lẫn nhau)
  async function handleGenerateCharacterVoice(asset: DramaAsset) {
    if (characterVoiceBusyIds.has(asset.id)) return
    setCharacterVoiceBusyIds((prev) => new Set(prev).add(asset.id))
    setError('')
    try {
      const { character, voice } = await generateAndBindCharacterVoice(pid, asset)
      handleCharacterUpdated(character)
      setAssets((prev) => (prev.some((a) => a.id === voice.id) ? prev : [...prev, voice]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sinh giọng thất bại')
    } finally {
      setCharacterVoiceBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(asset.id)
        return next
      })
    }
  }

  if (!episode) {
    return (
      <div className="drama-ep-fullscreen drama-ep-center">
        {error || 'Đang tải…'}
      </div>
    )
  }

  // id của cảnh đang xem trước / đang chọn (liên kết với thanh cảnh quay phía dưới và phần sửa kịch bản)
  const playingFragmentId = selected?.id ?? null

  // Khi đổi cảnh đang xem trước thì đồng bộ cảnh đang chọn ở thanh phía dưới
  function handlePlayingFragmentChange(fragmentId: number) {
    const index = fragments.findIndex((f) => f.id === fragmentId)
    if (index >= 0) {
      setSelectedIndex(index)
    }
  }

  return (
    <div className="drama-ep-fullscreen">
      <header className="drama-ep-header">
        <div className="drama-ep-header-left">
          <button type="button" className="drama-ep-icon-btn" aria-label="Quay lại" onClick={handleBack}>
            ‹
          </button>
          <h1>{episode.name}</h1>
        </div>
        <div className="drama-ep-header-controls">
          <EpisodeEditHeaderControls
            styleId={videoStyleId}
            modelId={modelId}
            episodeParams={episodeParams}
            projectParams={projectParams}
            linkLastFrame={linkLastFrame}
            subtitleMode={subtitleMode}
            characterIntroMode={characterIntroMode}
            onStyleChange={setVideoStyleId}
            onModelChange={setModelId}
            onEpisodeOutputChange={handleEpisodeOutputChange}
            onLinkLastFrameChange={(enabled) => void handleLinkLastFrameChange(enabled)}
            onSubtitleModeChange={(mode) => void handleEpisodeSubtitleChange(mode)}
            onCharacterIntroModeChange={(mode) => void handleEpisodeCharacterIntroChange(mode)}
            disabled={busy}
            globalSettingsReadOnly
          />
          <button
            type="button"
            className="drama-ep-btn-ghost"
            disabled={planFragmentsLocked}
            onClick={() => void planFragmentsWithLlm()}
          >
            {busy && status.includes('lập storyboard') ? 'Đang lập storyboard…' : 'AI lập lại storyboard'}
          </button>
          {/* Sinh tất cả: tạm ẩn, khi bật lại thì bỏ false && */}
          {false && (
            <button
              type="button"
              className="drama-ep-btn-dark drama-ep-header-gen-all"
              disabled={generateAllLocked || fragments.length === 0}
              onClick={() => void generateAll()}
            >
              {busy ? 'Đang xếp hàng…' : 'Sinh tất cả'}
            </button>
          )}
        </div>
      </header>

      {(status || error) && (
        <div className="drama-ep-banner">
          {error ? <BillingErrorNotice message={error} className="drama-ep-banner-error" inline /> : null}
          {!error && status ? <span>{status}</span> : null}
        </div>
      )}

      <div className="drama-ep-body">
        <DramaEpisodeDir
          items={buildEpisodeDirItems(episodeList.length ? episodeList : episode ? [episode] : [])}
          activeId={eid}
          onSelect={handleSelectEpisode}
        />
        <div className="drama-ep-workspace">
        <EpisodeEditAssetPanel
          scope={assetScope}
          tab={assetTab}
          assets={filteredAssets}
          activeIds={selectedRefIds}
          imageBusyIds={imageBusyIds}
          createBusy={assetCreateBusy}
          onScopeChange={setAssetScope}
          onTabChange={setAssetTab}
          onOpenCanvas={openEpisodeStoryboard}
          onOpenAsset={setDetailAsset}
          onMention={mentionAsset}
          onUnlinkAsset={unlinkSelectedAsset}
          onGenerateVoice={
            DRAMA_VOICE_BINDING_ENABLED
              ? (asset) => void handleGenerateCharacterVoice(asset)
              : undefined
          }
          voiceBusyIds={characterVoiceBusyIds}
          onVoiceError={(message) => setError(message)}
          onCreateAsset={() => void handleCreateSideAsset()}
          onImportAsset={() => setLibraryPickerOpen(true)}
        />

        <section className="drama-ep-editor">
          <div className="drama-ep-editor-head">
            <div>
              <strong>{formatFragLabel(selectedIndex, selectedDuration)}</strong>
              <p>
                Phía trên hiện các tư liệu liên kết của cảnh này; gõ @ để trích dẫn tư liệu hoặc chèn nhãn thời lượng ·{' '}
                {formatProjectOutputLabel(
                  readEpisodeAspectRatio(episodeParams, projectParams),
                  readEpisodeResolution(episodeParams, projectParams),
                )}
              </p>
            </div>
            <label className="drama-ep-duration">
              Thời lượng
              <input
                type="number"
                min={4}
                max={15}
                value={selectedDuration}
                disabled={!editing && !selected}
                onChange={(e) =>
                  updateSelected({ duration_sec: Number(e.target.value) || 8 })
                }
              />
              s
            </label>
          </div>

          <EpisodeEditReferenceStrip items={selectedRefItems} onSelect={focusLinkedAsset} />

          {/*
            Đặt NGOÀI `.drama-ep-editor-box`: ô prompt bên trong là `flex: 1` nên
            thông báo đặt trong đó sẽ ăn mất chiều cao và người dùng chỉ thấy được
            khoảng một nửa kịch bản của mình. Đặt ở đây vẫn nằm ngay trên khung có
            nút bấm, nên đọc được trước khi bấm mà không bóp khung.
          */}
          <BetaNotice placement="drama-episode-generate" variant="inline" />

          <div className={`drama-ep-editor-box ${editing ? 'editing' : ''}`}>
            <EpisodeEditPromptEditor
              content={selected?.content || ''}
              assets={assets}
              referencedIds={referencedIds}
              editing={editing}
              onOpenAsset={focusLinkedAsset}
              onContentChange={(nextContent) => {
                const fromContent = extractAssetIds(nextContent)
                const prevContentIds = extractAssetIds(selected?.content || '')
                const removed = prevContentIds.filter((id) => !fromContent.includes(id))
                /* Trích dẫn bị xoá khỏi nội dung cũng bị gỡ khỏi asset_ids; liên kết chỉ tồn tại trong asset_ids thì giữ lại */
                const prevContentIdSet = new Set(prevContentIds)
                const keptExtra = (selected?.asset_ids || []).filter(
                  (id) => !prevContentIdSet.has(id) || fromContent.includes(id),
                )
                updateSelected({
                  content: nextContent,
                  asset_ids: Array.from(new Set([...keptExtra, ...fromContent])),
                })
                if (removed.length > 0) {
                  setStatus('Đã bỏ liên kết của cảnh này, tư liệu vẫn còn trong dự án (chuyển sang «Toàn bộ» để xem)')
                }
              }}
            />

          {selectedGateIssues.length > 0 ? (
            <ul className="drama-ep-script-issues" aria-live="polite">
              {selectedGateIssues.map((issue) => (
                <li
                  key={`${issue.level}:${issue.message}`}
                  className={
                    issue.level === 'error'
                      ? 'drama-ep-script-issue is-error'
                      : 'drama-ep-script-issue is-warn'
                  }
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}

          {linkLastFrame && selectedIndex > 0 ? (
            <p
              className={`drama-ep-continuity-hint${
                !continuityBlockedReason ? ' is-ready' : ' is-wait'
              }`}
            >
              {continuityBlockedReason
                ? `Đã bật nối tiếp khung hình cuối: ${continuityBlockedReason}`
                : continuityQueueHint
                  ? continuityQueueHint
                  : prevLastFrameUrl
                    ? 'Sẽ dùng khung hình cuối của cảnh trước làm tham chiếu nối tiếp (gửi kèm ảnh tham chiếu của nhân vật)'
                    : 'Cảnh trước đã có thành phẩm: lúc sinh sẽ tự trích khung hình cuối làm tham chiếu nối tiếp'}
            </p>
          ) : !linkLastFrame ? (
            <p className="drama-ep-continuity-hint">
              Hiện chưa bật nối tiếp khung hình cuối: các cảnh sẽ sinh song song độc lập, phù hợp khi cần ra video hàng loạt nhanh.
            </p>
          ) : null}

          <div className="drama-ep-editor-actions">
            {editing ? (
              <>
                <button
                  type="button"
                  className="drama-ep-btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false)
                    void reload()
                  }}
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  className="drama-ep-btn-dark"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? 'Đang lưu…' : 'Lưu'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="drama-ep-btn-ghost"
                  disabled={!selected || selectedIsGenerating || busy}
                  onClick={() => setEditing(true)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className="drama-ep-btn-dark"
                  disabled={selectedGenerateLocked || !selected}
                  title={
                    continuityBlockedReason ||
                    continuityQueueHint ||
                    (selectedIsGenerating ? 'Cảnh đang chọn đang được sinh' : undefined)
                  }
                  onClick={() => void generateSelected()}
                >
                  {selectedIsGenerating
                    ? 'Đang tạo…'
                    : busy
                      ? 'Đang xử lý…'
                      : continuityQueueHint
                        ? 'Xếp hàng tạo prompt'
                        : continuityBlockedReason
                          ? 'Chờ cảnh trước'
                          : selectedHasVideo
                          ? 'Tạo lại prompt'
                          : 'Tạo prompt'}
                </button>
              </>
            )}
          </div>

          {promptReady ? <BetaPromptResult prompt={promptReady} className="drama-ep-beta-result" /> : null}
          </div>

          {selectedVersions.length > 0 && selected?.id ? (
            <div className="drama-ep-versions">
              <span className="drama-ep-versions-label">Phiên bản cũ</span>
              <div className="drama-ep-versions-list">
                {selectedHasVideo && selected.video ? (
                  <button
                    type="button"
                    className={`drama-ep-version is-active${!previewVersionId ? ' is-current' : ''}`}
                    disabled={busy || selectedIsGenerating}
                    title="Thành phẩm hiện tại"
                    onClick={() => setPreviewVersionId(null)}
                  >
                    {selected.cover ? (
                      <img src={resolveDramaMediaUrl(selected.cover)} alt="" />
                    ) : (
                      <video src={resolveDramaMediaUrl(selected.video)} muted />
                    )}
                    <em>Hiện tại</em>
                  </button>
                ) : null}
                {selectedVersions.map((ver, index) => {
                  const cover = ver.cover ? resolveDramaMediaUrl(ver.cover) : ''
                  const video = resolveDramaMediaUrl(ver.video)
                  const versionNo = selectedVersions.length - index
                  return (
                    <button
                      key={ver.id}
                      type="button"
                      className={`drama-ep-version${previewVersionId === ver.id ? ' is-previewing' : ''}`}
                      disabled={busy || selectedIsGenerating}
                      title="Bấm để xem trước; có thể đặt làm bản hiện tại"
                      onClick={() => setPreviewVersionId(ver.id)}
                    >
                      {cover ? <img src={cover} alt="" /> : <video src={video} muted />}
                      <em>v{versionNo}</em>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </section>

        <EpisodeEditSidePane
          fragments={fragments}
          playingFragmentId={playingFragmentId}
          onPlayingFragmentChange={handlePlayingFragmentChange}
          aspectRatio={aspectRatio}
          episodeId={episode?.id}
          episodeName={episode?.name || 'Tập này'}
          subtitleMode={subtitleMode}
          onOpenStoryboard={openEpisodeStoryboard}
          previewVideoUrl={previewVideoUrl}
          previewPosterUrl={previewPosterUrl}
          previewLabel={
            previewVersion
              ? `v${
                  selectedVersions.length -
                  selectedVersions.findIndex((ver) => ver.id === previewVersion.id)
                }`
              : ''
          }
          onClearPreview={() => setPreviewVersionId(null)}
          onActivatePreview={
            previewVersionId
              ? () => {
                  void activateVideoVersion(previewVersionId)
                }
              : undefined
          }
        />
        </div>
      </div>

      <footer className="drama-ep-storyboard">
        <div className="drama-ep-storyboard-row">
          <button
            type="button"
            className="drama-ep-insert"
            aria-label="Chèn cảnh quay ở đầu"
            onClick={() => insertFrag(0)}
          >
            +
          </button>
          {fragments.map((frag, index) => {
            const genInfo = readFragmentGenerationStatus(frag)
            const fragStatus = genInfo.status
            const activeVideoTask = (episode?.active_tasks || []).find(
              (task) =>
                task.task_type === 'fragment_video' &&
                task.fragment_id === frag.id &&
                !task.cancel_requested &&
                ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(
                  task.status,
                ),
            )
            // Trạng thái cuối được ưu tiên; chỉ khi đang chạy mới lấy trạng thái tác vụ của hệ thống đè lên (tránh done bị tác vụ zombie quay về «đang sinh»)
            const displayStatus =
              fragStatus === 'done' ||
              fragStatus === 'failed' ||
              fragStatus === 'cancelled'
                ? fragStatus
                : activeVideoTask
                  ? activeVideoTask.status === 'pending' || activeVideoTask.status === 'leased'
                    ? 'queued'
                    : 'running'
                  : fragStatus
            const fragBusy =
              Boolean(frag.id && generatingIds.has(frag.id)) &&
              displayStatus !== 'done' &&
              displayStatus !== 'failed' &&
              displayStatus !== 'cancelled'
            const badge = fragmentQueueBadgeLabel(displayStatus)
            const clipVideo = frag.video ? resolveDramaMediaUrl(frag.video) : ''
            const clipCover = frag.cover ? resolveDramaMediaUrl(frag.cover) : ''
            const showFailHint = displayStatus === 'failed' && !fragBusy
            const fragParams =
              frag.params && typeof frag.params === 'object' && !Array.isArray(frag.params)
                ? (frag.params as Record<string, unknown>)
                : {}
            return (
            <div key={`${frag.id}-${index}`} className="drama-ep-clip-wrap">
              <div
                className={`drama-ep-clip-shell ${selectedIndex === index ? 'active' : ''}${
                  fragBusy ? ' is-generating' : ''
                }${displayStatus === 'queued' ? ' is-queued' : ''}${
                  displayStatus === 'failed' ? ' is-failed' : ''
                }`}
              >
                <button
                  type="button"
                  className="drama-ep-clip"
                  onClick={() => setSelectedIndex(index)}
                >
                  {clipCover ? (
                    <img src={clipCover} alt="" />
                  ) : clipVideo ? (
                    <video src={clipVideo} muted />
                  ) : (
                    <span className="drama-ep-clip-empty">
                      {fragBusy ? '…' : showFailHint ? (
                        <CircleAlert size={22} strokeWidth={2} aria-hidden />
                      ) : (
                        '+'
                      )}
                    </span>
                  )}
                  {badge ? <span className="drama-ep-clip-badge">{badge}</span> : null}
                  <em>
                    {formatFragLabel(index, frag.duration_sec)}
                    <DramaFragmentClipSpec
                      fragmentParams={fragParams}
                      episodeParams={episodeParams}
                      projectParams={projectParams}
                      videoUrl={clipVideo}
                    />
                  </em>
                </button>
                {showFailHint ? (
                  <button
                    type="button"
                    className="drama-ep-clip-fail-btn"
                    title="Xem lý do lỗi"
                    aria-label={`Xem lý do lỗi của cảnh ${index + 1}`}
                    onClick={() => openFragmentFailReason(frag, index)}
                  >
                    <CircleAlert size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                ) : null}
              </div>
              <div className="drama-ep-clip-ops">
                <button type="button" aria-label="Chèn" onClick={() => insertFrag(index + 1)} disabled={busy}>
                  +
                </button>
                <button type="button" aria-label="Nhân bản" onClick={() => duplicateFrag(index)} disabled={busy}>
                  ⧉
                </button>
                <button
                  type="button"
                  aria-label="Xoá"
                  disabled={busy || fragments.length <= 1}
                  onClick={() => deleteFrag(index)}
                >
                  ⌫
                </button>
              </div>
            </div>
            )
          })}
        </div>
      </footer>

      <FragmentPlanSkillModal
        open={planModalOpen}
        message="Sẽ gọi mô hình lớn lập lại storyboard theo kịch bản của tập này (ghi đè và xoá các cảnh quay hiện có cùng video đã sinh), thường mất vài chục giây. Bạn có thể chọn Skill dùng cho lần này. Cách làm phụ đề sẽ theo cài đặt đang có ở thanh trên cùng."
        onCancel={() => setPlanModalOpen(false)}
        onConfirm={(skillIds) => void startPlanFragments(skillIds)}
      />

      {detailAsset && (detailAsset.type || '').toLowerCase() !== 'voice' ? (
        <DramaAssetDetailModal
          asset={detailAsset}
          open
          busy={imageBusyIds.has(detailAsset.id)}
          genLabel={assetImageGenLabel(detailAsset)}
          onClose={() => setDetailAsset(null)}
          onUpdated={handleCharacterUpdated}
          onGenerate={(a) => enqueueAssetImage(a)}
          onBindVoice={DRAMA_VOICE_BINDING_ENABLED ? (a) => setVoiceBindAsset(a) : undefined}
          onError={(message) => setError(message)}
        />
      ) : null}

      {DRAMA_VOICE_BINDING_ENABLED && voiceBindAsset ? (
        <CharacterVoiceBindModal
          asset={voiceBindAsset}
          projectId={pid}
          open
          onClose={() => setVoiceBindAsset(null)}
          onBound={(updated) => {
            handleCharacterUpdated(updated)
            setVoiceBindAsset(null)
          }}
          onError={(message) => setError(message)}
        />
      ) : null}

      <GlobalAssetPickerModal
        open={libraryPickerOpen}
        onClose={() => setLibraryPickerOpen(false)}
        projectId={pid}
        defaultTab={resolveCreateAssetTab()}
        allowedTypes={
          resolveCreateAssetTab() === 'prop'
            ? ['prop', 'material', 'none']
            : [resolveCreateAssetTab()]
        }
        title={`Nhập ${resolveCreateAssetTab() === 'scene' ? 'bối cảnh' : resolveCreateAssetTab() === 'prop' ? 'đạo cụ' : 'nhân vật'}`}
        confirmLabel="Nhập vào tập này"
        onPick={handleImportSideAsset}
      />

      {failReasonJob ? (
        <div className="drama-ep-fail-reason-pop">
          <DramaGenTaskDetail job={failReasonJob} onClose={() => setFailReasonJob(null)} />
        </div>
      ) : null}
    </div>
  )
}
