/** Bước thư viện tư liệu: tự tạo dữ liệu lần đầu khi chưa có tư liệu, tab phân loại + hàng đợi sinh ảnh + gắn giọng cho nhân vật */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Sparkles } from 'lucide-react'
import { dramaApi, resolveDramaAssetPreviewUrl, type DramaAsset, type DramaProject } from '../../api/drama'
import { api, type BillingPreflight } from '../../api'
import { useDramaImageGenQueue } from '../../hooks/useDramaImageGenQueue'
import { enqueueDramaImageGen, resumeDramaImageGensFromAssets } from '../../lib/dramaImageGenQueue'
import {
  defaultOptionsForAssetKind,
  type ImageGenerationOptions,
} from '../../lib/dramaGenerationOptions'
import { getImageStyleId } from './dramaWorkspaceUtils'
import { DramaImageGenOptionsBar } from './canvas/nodes/DramaImageGenOptionsBar'
import { DramaImageStylePreviewImg } from '../../components/drama/DramaImageStylePreviewImg'
import type { ImageStyleId } from '../../lib/dramaImageStyles'
import {
  CharacterVoiceBindModal,
  readAssetVoiceBinding,
  readVoicePrompt,
} from './CharacterVoiceBindModal'
import { CharacterVoicePreviewButton } from '../../components/drama/CharacterVoicePreviewButton'
import { generateAndBindCharacterVoice } from '../../lib/characterVoiceGenerate'
import { NarratorVoiceBindModal } from './NarratorVoiceBindModal'
import { DramaAssetDetailModal } from './DramaAssetDetailModal'
import { DramaImageLightbox } from './DramaImageLightbox'
import { GlobalAssetPickerModal, importGlobalAssetToProject } from './GlobalAssetPickerModal'
import { DramaVoiceAssetCard } from './DramaVoiceAssetCard'
import Pagination from '../../components/ui/Pagination'
import { dialog } from '../../lib/dialog'
import { handleBillingError, isBillingError } from '../../lib/billingError'
import { alertDramaGenError, formatDramaGenError, isUpstreamAccountError } from '../../lib/dramaGenError'
import { pageCountOf } from '../../lib/pagination'
import { readVisualPrompt } from '../../lib/dramaVisualPrompt'
import { filterDramaLibraryAssets } from '../../lib/dramaLibraryAssets'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../lib/dramaVoiceBinding'
import {
  dramaAssetImageGenButtonLabel,
  dramaAssetNeedsImageGeneration,
} from '../../lib/dramaAssetImage'

type AssetTabKey = 'character' | 'scene' | 'prop' | 'voice'

const ASSET_TABS: Array<{ key: AssetTabKey; label: string }> = [
  { key: 'character', label: 'Nhân vật' },
  { key: 'scene', label: 'Bối cảnh' },
  { key: 'prop', label: 'Đạo cụ' },
  ...(DRAMA_VOICE_BINDING_ENABLED ? [{ key: 'voice' as const, label: 'Giọng' }] : []),
]

const PAGE_SIZE_DEFAULT = 12
const PAGE_SIZE_OPTIONS = [12, 24, 36] as const

// Chia sẻ qua các lần gắn lại do StrictMode, tránh chạy seed đồng thời khi thư viện còn trống
const seedingProjectIds = new Set<number>()

type AssetsStepProps = {
  projectId: number
  onError: (m: string) => void
}

// Chuẩn hoá dữ liệu trả về thành mảng tư liệu, tránh lỗi undefined.filter
function normalizeAssetList(value: unknown): DramaAsset[] {
  return filterDramaLibraryAssets(Array.isArray(value) ? (value as DramaAsset[]) : [])
}

// Kiểm tra tư liệu đã cần sinh ảnh chưa (chưa có ảnh bìa/ảnh chính hợp lệ; tải lên hoặc sinh bằng AI đều tính là đã có ảnh)
function needsImageGeneration(asset: DramaAsset): boolean {
  return dramaAssetNeedsImageGeneration(asset)
}

// Dựng bước thư viện tư liệu
export function AssetsStep({ projectId, onError }: AssetsStepProps) {
  /*
   * assets tư liệu của dự án
   * tab phân loại đang xem
   * loading lần tải đầu tiên
   * batchBusy đang xếp hàng sinh tất cả
   * genOptions tuỳ chọn sinh ảnh
   * voiceAsset nhân vật đang mở hộp giọng
   * detailAsset tư liệu đang mở khung thao tác chi tiết
   * lightbox xem phóng to ảnh
   * batchVoiceBusy đang sinh giọng hàng loạt
   * page số trang hiện tại
   * pageSize số mỗi trang
   * genQueue hàng đợi sinh ảnh toàn cục
   */
  const [assets, setAssets] = useState<DramaAsset[]>([])
  const [tab, setTab] = useState<AssetTabKey>('character')
  const [loading, setLoading] = useState(true)
  const [batchBusy, setBatchBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT)
  const [genOptions, setGenOptions] = useState<ImageGenerationOptions>(() =>
    defaultOptionsForAssetKind('character'),
  )
  const [voiceAsset, setVoiceAsset] = useState<DramaAsset | null>(null)
  const [detailAsset, setDetailAsset] = useState<DramaAsset | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [voiceSynthBusyId, setVoiceSynthBusyId] = useState<number | null>(null)
  const [voicePromptDrafts, setVoicePromptDrafts] = useState<Record<number, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reseedBusy, setReseedBusy] = useState(false)
  const [project, setProject] = useState<DramaProject | null>(null)
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([])
  const [characterVoiceBusyIds, setCharacterVoiceBusyIds] = useState<Set<number>>(() => new Set())
  const [batchVoiceBusy, setBatchVoiceBusy] = useState(false)
  const [narratorVoiceOpen, setNarratorVoiceOpen] = useState(false)
  const genQueue = useDramaImageGenQueue()

  useEffect(() => {
    async function enter() {
      setLoading(true)
      try {
        const p = await dramaApi.getProject(projectId).catch(() => null)
        setProject(p)
        const styleId = p ? getImageStyleId(p.script, p) : ''
        setGenOptions((prev) => ({
          ...defaultOptionsForAssetKind(tab),
          image_style_id: styleId || prev.image_style_id,
          model_id: prev.model_id,
          resolution: prev.resolution,
        }))
        let list = normalizeAssetList(
          await dramaApi.listAssets(projectId, { libraryOnly: true }),
        )
        // Chỉ tự động trích xuất từ kịch bản lần đầu (khi thư viện còn trống và đã có tóm tắt kịch bản); sau đó phải bấm «Trích xuất lại tư liệu»
        if (list.length === 0 && p?.script?.summary && !seedingProjectIds.has(projectId)) {
          seedingProjectIds.add(projectId)
          try {
            const seededResult = await dramaApi.seedAssets(projectId)
            list = normalizeAssetList(seededResult?.assets)
          } finally {
            seedingProjectIds.delete(projectId)
          }
        }
        setAssets(list)
        resumeDramaImageGensFromAssets(projectId, list, (next) => {
          setAssets((prev) => (prev ?? []).map((a) => (a.id === next.id ? next : a)))
        })
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Tải tư liệu thất bại')
        try {
          const list = normalizeAssetList(await dramaApi.listAssets(projectId, { libraryOnly: true }))
          setAssets(list)
          resumeDramaImageGensFromAssets(projectId, list, (next) => {
          setAssets((prev) => (prev ?? []).map((a) => (a.id === next.id ? next : a)))
        })
        } catch {
          /* ignore */
        }
      } finally {
        setLoading(false)
      }
    }
    void enter()
  }, [projectId, onError])

  useEffect(() => {
    setGenOptions((prev) => ({
      ...defaultOptionsForAssetKind(tab),
      image_style_id: prev.image_style_id,
      model_id: prev.model_id,
      resolution: prev.resolution,
    }))
  }, [tab])

  useEffect(() => {
    if (tab !== 'character') {
      setSelectedCharacterIds([])
    }
    setPage(1)
  }, [tab])

  useEffect(() => {
    setPage(1)
  }, [pageSize])

  // Khi hàng đợi xong thì ghi ảnh bìa mới nhất về lại thẻ
  useEffect(() => {
    const projectJobs = genQueue.filter((j) => j.projectId === projectId)
    const doneIds = new Set(
      projectJobs.filter((j) => j.status === 'done' || j.status === 'running').map((j) => j.assetId),
    )
    if (doneIds.size === 0) return
    let cancelled = false
    dramaApi
      .listAssets(projectId, { libraryOnly: true })
      .then((list) => {
        if (cancelled) return
        const next = normalizeAssetList(list)
        setAssets(next)
        setDetailAsset((prev) => (prev ? next.find((a) => a.id === prev.id) || prev : null))
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [genQueue, projectId])

  const assetList = assets ?? []
  const narrationVoiceLabel =
    project?.params && typeof project.params === 'object'
      ? String(
          ((project.params as Record<string, unknown>).narrationVoiceAudio as Record<string, unknown> | undefined)?.label ||
            'Chưa đặt',
        )
      : 'Chưa đặt'
  const filtered = assetList.filter((a) => {
    const t = (a.type || '').toLowerCase()
    if (tab === 'voice') return t === 'voice'
    return t === tab
  })
  const selectedCharacterAssets = assetList.filter(
    (a) => (a.type || '').toLowerCase() === 'character' && selectedCharacterIds.includes(a.id),
  )
  const busyAssetIds = new Set(
    genQueue
      .filter(
        (j) =>
          j.projectId === projectId && (j.status === 'queued' || j.status === 'running'),
      )
      .map((j) => j.assetId),
  )
  // Chưa có ảnh: không có cover/url hợp lệ và hiện không nằm trong hàng đợi
  const pending = filtered.filter((a) => needsImageGeneration(a) && !busyAssetIds.has(a.id))
  const queueBusy = busyAssetIds.size > 0
  const pageCount = pageCountOf(filtered.length, pageSize)
  const safePage = Math.min(page, pageCount)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, safePage, pageSize])

  // Lưu phong cách hình ảnh của dự án
  async function persistStyle(styleId: string) {
    try {
      await dramaApi.updateScript(projectId, { image_style_id: styleId })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lưu phong cách thất bại')
    }
  }

  // Kiểm tra số dư trước khi xếp hàng (dùng chung cho cả hàng loạt và từng mục); thành công thì trả về chi tiết kiểm tra (kèm ước tính từng ảnh)
  async function ensureImageGenBalance(count: number): Promise<BillingPreflight | null> {
    try {
      return await api.billingPreflight({
        domain: 'drama',
        task_type: 'asset_image',
        count,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || '')
      if (isBillingError(message)) return null
      if (await handleBillingError(err)) return null
      onError(message || 'Kiểm tra số dư thất bại')
      return null
    }
  }

  async function notifyImageGenFailure(err: unknown) {
    const message = err instanceof Error ? err.message : String(err || '')
    if (isBillingError(message)) return
    if (isUpstreamAccountError(message)) {
      await alertDramaGenError(err)
      onError(formatDramaGenError(message).message)
      return
    }
    if (await handleBillingError(err)) return
    const view = formatDramaGenError(message)
    if (view.upstreamAccountBlocked || view.billingBlocked) {
      await alertDramaGenError(err)
    }
    onError(view.message || message || 'Sinh ảnh thất bại')
  }

  // Đưa vào hàng đợi sinh ảnh toàn cục (không đẩy nhau ra)
  function enqueueOne(asset: DramaAsset, options = genOptions) {
    if (busyAssetIds.has(asset.id)) return
    void (async () => {
      if (!(await ensureImageGenBalance(1))) return
      try {
        const updated = await enqueueDramaImageGen({
          projectId,
          assetId: asset.id,
          assetName: asset.name || undefined,
          assetType: asset.type,
          prompt: readVisualPrompt(asset),
          options,
          onAssetUpdate: (next) => {
            setAssets((prev) => (prev ?? []).map((a) => (a.id === next.id ? next : a)))
          },
        })
        setAssets((prev) => (prev ?? []).map((a) => (a.id === updated.id ? updated : a)))
      } catch (err) {
        await notifyImageGenFailure(err)
      }
    })()
  }

  // Một lần bấm chỉ xếp hàng những tư liệu «chưa có ảnh» trong phân loại hiện tại (đã có ảnh hoặc đang chờ thì bỏ qua)
  async function batchGenerate() {
    const targets = filtered.filter(
      (a) => needsImageGeneration(a) && !busyAssetIds.has(a.id),
    )
    if (targets.length === 0) {
      onError('Phân loại hiện tại không có tư liệu nào chưa có ảnh')
      return
    }
    const pre = await ensureImageGenBalance(targets.length)
    if (!pre) return
    const unitYuan = pre.unit_estimate_yuan ?? pre.unit_estimate_fen / 100
    const totalYuan = pre.requested_total_yuan ?? pre.requested_total_fen / 100
    const balanceYuan = pre.balance_yuan ?? pre.balance_fen / 100
    const ok = await dialog.confirm({
      title: 'Sinh hình hàng loạt',
      message:
        `Sẽ bắt đầu sinh ảnh cho ${targets.length} tư liệu chưa có ảnh trong «${ASSET_TABS.find((t) => t.key === tab)?.label || 'phân loại'}» hiện tại (gửi song song, không xếp hàng).\n\n` +
        `Mỗi ảnh tạm trừ khoảng ¥${unitYuan.toFixed(2)}, lần này tổng cộng khoảng ¥${totalYuan.toFixed(2)} (số dư hiện tại ¥${balanceYuan.toFixed(2)}; khi xong sẽ hoàn hoặc thu thêm theo mức dùng thực tế).\n\nBạn có muốn tiếp tục?`,
      confirmText: 'Bắt đầu sinh',
    })
    if (!ok) return
    setBatchBusy(true)
    const tasks = targets.map((asset) =>
      enqueueDramaImageGen({
        projectId,
        assetId: asset.id,
        assetName: asset.name || undefined,
        assetType: asset.type,
        prompt: readVisualPrompt(asset),
        options: {
          ...genOptions,
          ...defaultOptionsForAssetKind(asset.type),
          image_style_id: genOptions.image_style_id,
          model_id: genOptions.model_id,
          resolution: genOptions.resolution,
        },
        onAssetUpdate: (next) => {
          setAssets((prev) => (prev ?? []).map((a) => (a.id === next.id ? next : a)))
        },
      }).then((updated) => {
        setAssets((prev) => (prev ?? []).map((a) => (a.id === updated.id ? updated : a)))
      }),
    )
    void Promise.allSettled(tasks).then(async (results) => {
      setBatchBusy(false)
      const failed = results.find((r) => r.status === 'rejected')
      if (failed && failed.status === 'rejected') {
        await notifyImageGenFailure(failed.reason)
      }
    })
  }

  // Sau khi gắn giọng thành công thì làm mới mục trong danh sách
  function handleVoiceBound(updated: DramaAsset) {
    setAssets((prev) => (prev ?? []).map((a) => (a.id === updated.id ? updated : a)))
  }

  function handleVoiceCreated(voice: DramaAsset) {
    setAssets((prev) => {
      const list = prev ?? []
      if (list.some((a) => a.id === voice.id)) return list
      return [...list, voice]
    })
  }

  // Sinh giọng cho nhân vật bằng AI và gắn luôn (mỗi nhân vật một trạng thái chờ riêng, không chặn lẫn nhau)
  async function handleGenerateCharacterVoice(asset: DramaAsset) {
    if (characterVoiceBusyIds.has(asset.id) || batchVoiceBusy) return
    setCharacterVoiceBusyIds((prev) => new Set(prev).add(asset.id))
    try {
      const { character, voice } = await generateAndBindCharacterVoice(projectId, asset)
      handleVoiceBound(character)
      handleVoiceCreated(voice)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Sinh giọng thất bại')
    } finally {
      setCharacterVoiceBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(asset.id)
        return next
      })
    }
  }

  // Sinh giọng hàng loạt theo phần mô tả của từng nhân vật
  async function batchGenerateCharacterVoices() {
    if (batchVoiceBusy || selectedCharacterAssets.length === 0) return
    const ok = await dialog.confirm({
      title: 'Sinh giọng hàng loạt',
      message: `Sẽ dùng AI sinh và gắn giọng riêng cho ${selectedCharacterAssets.length} nhân vật đã chọn. Bạn có muốn tiếp tục?`,
      confirmText: 'Bắt đầu sinh',
    })
    if (!ok) return
    setBatchVoiceBusy(true)
    let failCount = 0
    for (const asset of selectedCharacterAssets) {
      setCharacterVoiceBusyIds((prev) => new Set(prev).add(asset.id))
      try {
        const { character, voice } = await generateAndBindCharacterVoice(projectId, asset)
        handleVoiceBound(character)
        handleVoiceCreated(voice)
      } catch {
        failCount += 1
      } finally {
        setCharacterVoiceBusyIds((prev) => {
          const next = new Set(prev)
          next.delete(asset.id)
          return next
        })
      }
    }
    setBatchVoiceBusy(false)
    setSelectedCharacterIds([])
    if (failCount > 0) {
      onError(`Sinh giọng thất bại ở ${failCount} nhân vật`)
    }
  }

  // Nhập từ thư viện tư liệu toàn cục vào dự án hiện tại
  async function handleImportFromLibrary(source: DramaAsset) {
    const dup = assetList.some(
      (a) =>
        (a.name || '').trim() === (source.name || '').trim() &&
        (a.type || '') === (source.type || ''),
    )
    if (dup) {
      const ok = await dialog.confirm({
        title: 'Có thể bị trùng',
        message: `Dự án hiện tại đã có tư liệu trùng tên «${source.name}», bạn vẫn muốn nhập thêm một bản sao?`,
        confirmText: 'Vẫn nhập',
      })
      if (!ok) throw new Error('Đã huỷ')
    }
    const created = await importGlobalAssetToProject(projectId, source)
    setAssets((prev) => [...(prev ?? []), created])
  }

  // Thêm tư liệu giọng mới
  async function handleAddVoice() {
    const name = await dialog.prompt({
      title: 'Thêm giọng',
      message: 'Nhập tên giọng',
      placeholder: 'Ví dụ: Đại Vũ - nam trầm ổn',
      confirmText: 'Tạo',
    })
    if (!name?.trim()) return
    try {
      const created = await dramaApi.createAsset({
        project_id: projectId,
        type: 'voice',
        asset_type: 'audio',
        name: name.trim(),
        params: { voicePrompt: '' },
      })
      setAssets((prev) => [...(prev ?? []), created])
      setVoicePromptDrafts((prev) => ({ ...prev, [created.id]: '' }))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Tạo giọng thất bại')
    }
  }

  // Lưu phần mô tả giọng vào params của tư liệu
  async function persistVoicePrompt(asset: DramaAsset, prompt: string) {
    const nextParams = { ...(asset.params || {}), voicePrompt: prompt.trim() }
    const updated = await dramaApi.updateAsset(asset.id, { params: nextParams })
    setAssets((prev) => (prev ?? []).map((a) => (a.id === updated.id ? updated : a)))
  }

  // Tổng hợp và nghe thử tư liệu voice theo phần mô tả
  async function handleSynthVoice(asset: DramaAsset) {
    const prompt = (voicePromptDrafts[asset.id] ?? readVoicePrompt(asset)).trim()
    if (!prompt) {
      onError('Hãy nhập phần mô tả giọng trước')
      return
    }
    setVoiceSynthBusyId(asset.id)
    try {
      await persistVoicePrompt(asset, prompt)
      const result = await dramaApi.generateVoice({
        project_id: projectId,
        asset_id: asset.id,
        voice_prompt: prompt,
      })
      setAssets((prev) => (prev ?? []).map((a) => (a.id === asset.id ? result.asset : a)))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Tổng hợp giọng thất bại')
    } finally {
      setVoiceSynthBusyId(null)
    }
  }

  // Xoá tư liệu giọng
  async function handleDeleteVoice(asset: DramaAsset) {
    const ok = await dialog.confirm({
      title: 'Xoá giọng',
      message: `Bạn có chắc muốn xoá giọng «${asset.name || 'Chưa đặt tên'}»?`,
      tone: 'danger',
      confirmText: 'Xoá',
    })
    if (!ok) return
    try {
      await dramaApi.deleteAsset(asset.id)
      setAssets((prev) => (prev ?? []).filter((a) => a.id !== asset.id))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Xoá thất bại')
    }
  }

  // Thêm nhân vật mới
  async function handleAddCharacter() {
    const name = await dialog.prompt({
      title: 'Thêm nhân vật',
      message: 'Nhập tên nhân vật',
      placeholder: 'Ví dụ: Đại Vũ',
      confirmText: 'Tạo',
    })
    if (!name?.trim()) return
    try {
      const created = await dramaApi.createAsset({
        project_id: projectId,
        type: 'character',
        asset_type: 'image',
        name: name.trim(),
        params: { kind: 'character' },
      })
      setAssets((prev) => [...(prev ?? []), created])
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Tạo nhân vật thất bại')
    }
  }

  // Xoá nhân vật
  async function handleDeleteCharacter(asset: DramaAsset) {
    const ok = await dialog.confirm({
      title: 'Xoá nhân vật',
      message: `Bạn có chắc muốn xoá nhân vật «${asset.name || 'Chưa đặt tên'}»? Thao tác này không thể hoàn tác.`,
      tone: 'danger',
      confirmText: 'Xoá',
    })
    if (!ok) return
    if (busyAssetIds.has(asset.id)) {
      onError('Nhân vật này đang sinh ảnh, vui lòng đợi rồi xoá sau')
      return
    }
    try {
      await dramaApi.deleteAsset(asset.id)
      setAssets((prev) => (prev ?? []).filter((a) => a.id !== asset.id))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Xoá thất bại')
    }
  }

  // Trích xuất lại tư liệu từ kịch bản và dùng AI làm mới toàn bộ câu lệnh sinh ảnh
  async function handleReseedAssets() {
    if (reseedBusy || batchBusy) return
    const ok = await dialog.confirm({
      title: 'Trích xuất lại tư liệu',
      message:
        'Sẽ bổ sung nhân vật / bối cảnh mới theo tóm tắt kịch bản mới nhất, và dùng AI sinh lại câu lệnh sinh ảnh đầy đủ cho toàn bộ nhân vật, bối cảnh và đạo cụ. Ảnh đã có và giọng đã gắn sẽ không bị xoá, nhưng lần sinh ảnh sau sẽ dùng câu lệnh mới. Bạn có muốn tiếp tục?',
      confirmText: 'Bắt đầu trích xuất',
      tone: 'danger',
    })
    if (!ok) return
    setReseedBusy(true)
    try {
      const result = await dramaApi.seedAssets(projectId, {
        refreshPrompts: true,
        reextractProps: true,
      })
      if (result.status === 'generating') {
        let seedStatus = 'generating'
        for (let i = 0; i < 90; i += 1) {
          await new Promise((r) => window.setTimeout(r, 2000))
          const p = await dramaApi.getProject(projectId)
          seedStatus = String(
            (p.params as Record<string, unknown> | undefined)?.assets_seed_status || '',
          )
          if (seedStatus === 'done' || seedStatus === 'failed') break
        }
        const list = normalizeAssetList(
          await dramaApi.listAssets(projectId, { libraryOnly: true }),
        )
        setAssets(list)
        const p = await dramaApi.getProject(projectId)
        const params = (p.params || {}) as Record<string, unknown>
        const created = Number(params.assets_seed_created ?? 0)
        const refreshed = Number(params.assets_seed_refreshed ?? 0)
        const propsUpdated = Number(params.assets_seed_props_updated ?? 0)
        const llmErrors = Array.isArray(params.assets_seed_llm_errors)
          ? (params.assets_seed_llm_errors as string[])
          : []
        const failed = seedStatus === 'failed'
        const parts = [`Tạo mới ${created} mục`, `AI làm mới câu lệnh ${refreshed} mục`]
        if (propsUpdated > 0) {
          parts.push(`Cập nhật ${propsUpdated} đạo cụ`)
        }
        let detail = failed
          ? String(params.assets_seed_error || 'Trích xuất thất bại')
          : `${parts.join('，')}.`
        if (!failed && created === 0 && refreshed === 0 && llmErrors.length === 0) {
          detail +=
            ' Nhân vật hoặc bối cảnh đã tồn tại sẽ không được tạo lại; lần này cũng không làm mới được câu lệnh nào. Hãy chắc chắn tóm tắt kịch bản và nội dung tập đã được sinh rồi thử lại.'
        } else if (!failed && llmErrors.length > 0) {
          detail += `\n\nAI làm mới thất bại ở các tư liệu sau:\n${llmErrors.slice(0, 5).join('\n')}${llmErrors.length > 5 ? `\n…tổng ${llmErrors.length} mục` : ''}`
        } else if (!failed) {
          detail += ' Bạn có thể xem prompt trên canvas hoặc bấm «Sinh hình» để kiểm chứng.'
        }
        await dialog.alert({
          title: failed || llmErrors.length > 0 ? 'Đã trích xuất (một phần thất bại)' : 'Đã trích xuất xong',
          message: detail,
          tone: failed || llmErrors.length > 0 ? 'danger' : 'success',
        })
        return
      }
      setAssets(normalizeAssetList(result?.assets))
      const created = result.created_count ?? 0
      const refreshed = result.prompts_refreshed ?? 0
      const propsUpdated = result.props_updated ?? 0
      const llmErrors = Array.isArray(result.llm_errors) ? result.llm_errors : []
      const parts = [`Tạo mới ${created} mục`, `AI làm mới câu lệnh ${refreshed} mục`]
      if (propsUpdated > 0) {
        parts.push(`Cập nhật ${propsUpdated} đạo cụ`)
      }
      let detail = `${parts.join('，')}.`
      if (created === 0 && refreshed === 0 && llmErrors.length === 0) {
        detail +=
          ' Nhân vật hoặc bối cảnh đã tồn tại sẽ không được tạo lại; lần này cũng không làm mới được câu lệnh nào. Hãy chắc chắn tóm tắt kịch bản và nội dung tập đã được sinh rồi thử lại.'
      } else if (llmErrors.length > 0) {
        detail += `\n\nAI làm mới thất bại ở các tư liệu sau:\n${llmErrors.slice(0, 5).join('\n')}${llmErrors.length > 5 ? `\n…tổng ${llmErrors.length} mục` : ''}`
      } else {
        detail += ' Bạn có thể xem prompt trên canvas hoặc bấm «Sinh hình» để kiểm chứng.'
      }
      await dialog.alert({
        title: llmErrors.length > 0 ? 'Đã trích xuất (một phần thất bại)' : 'Đã trích xuất xong',
        message: detail,
        tone: llmErrors.length > 0 ? 'danger' : 'success',
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Trích xuất lại thất bại')
    } finally {
      setReseedBusy(false)
    }
  }

  // Chữ trên nút của thẻ (đã có ảnh thì hiện «Sinh lại hình»)
  function genButtonLabel(asset: DramaAsset): string {
    const job = genQueue.find(
      (j) =>
        j.assetId === asset.id && (j.status === 'queued' || j.status === 'running'),
    )
    let queueLabel: string | null = null
    if (job) {
      if (job.status === 'running') queueLabel = 'Đang sinh…'
      else {
        const queuedOnly = genQueue.filter((j) => j.status === 'queued' || j.status === 'running')
        const pos = queuedOnly.findIndex((j) => j.id === job.id) + 1
        queueLabel = pos > 0 ? (pos > 1 ? `Hàng đợi #${pos}` : 'Đang xếp hàng…') : 'Đang xếp hàng…'
      }
    }
    return dramaAssetImageGenButtonLabel(asset, queueLabel)
  }

  const imageAssetCount = assetList.filter((a) => {
    const t = (a.type || '').toLowerCase()
    return !['voice', 'video', 'audio', 'text'].includes(t)
  }).length

  return (
    <div className="drama-assets-step">
      <header className="drama-assets-hero drama-step-hero">
        <DramaImageStylePreviewImg
          styleId={(genOptions.image_style_id as ImageStyleId) || 'ancient-chinese-mythology'}
          alt=""
          loading="lazy"
        />
        <div className="drama-step-hero-main">
          <div className="drama-step-hero-icon" aria-hidden>
            <Boxes size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h2>Thư viện tư liệu</h2>
            <p className="drama-step-hero-sub">
              Tổng <strong>{assetList.length}</strong> mục tư liệu · Phân loại hiện tại{' '}
              <strong>{filtered.length}</strong> mục · Chờ sinh ảnh <strong>{pending.length}</strong>
            </p>
          </div>
        </div>
      </header>

      <div className="drama-assets-tips" role="note">
        <Sparkles size={15} strokeWidth={1.75} aria-hidden />
        <span>Quản lý nhân vật, bối cảnh và đạo cụ bất cứ lúc nào. Khi xác nhận kịch bản của tập, hệ thống tự trích xuất các tư liệu liên quan; phần sinh ảnh có thể làm tiếp tại đây.</span>
      </div>

      <div className="drama-assets-toolbar">
        <div className="drama-asset-tabs">
          {ASSET_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? 'active' : ''}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="drama-actions">
          {tab === 'character' ? (
            <button type="button" className="pf-btn" onClick={() => void handleAddCharacter()}>
              Thêm nhân vật
            </button>
          ) : null}
          {DRAMA_VOICE_BINDING_ENABLED && tab === 'voice' ? (
            <button type="button" className="pf-btn" onClick={() => void handleAddVoice()}>
              Thêm giọng
            </button>
          ) : null}
          {DRAMA_VOICE_BINDING_ENABLED && tab !== 'voice' ? (
            <button
              type="button"
              className="pf-btn"
              onClick={() => setNarratorVoiceOpen(true)}
              title="Giọng dẫn chuyện dùng chung (để mọi lời dẫn reference_audio nhất quán)"
              disabled={!project}
            >
              Giọng dẫn chuyện: {narrationVoiceLabel}
            </button>
          ) : null}
          <button type="button" className="pf-btn" onClick={() => setPickerOpen(true)}>
            Chọn từ thư viện
          </button>
          <Link className="pf-btn" to="/drama/assets">
            Xem toàn bộ tư liệu
          </Link>
          <button
            type="button"
            className="pf-btn"
            disabled={reseedBusy || batchBusy}
            onClick={() => void handleReseedAssets()}
          >
            {reseedBusy
              ? `AI đang trích xuất… (khoảng ${Math.max(imageAssetCount, 1)} mục, mất 1–3 phút)`
              : 'Trích xuất lại tư liệu'}
          </button>
          {/* Sinh hàng loạt phần chưa có ảnh: tạm ẩn, khi bật lại thì bỏ && false */}
          {tab !== 'voice' && false ? (
            <button
              type="button"
              className="drama-btn-primary"
              disabled={batchBusy || pending.length === 0}
              onClick={() => void batchGenerate()}
              title={
                pending.length > 0
                  ? `Chỉ sinh ${pending.length} mục chưa có ảnh trong phân loại hiện tại (tối đa 3 luồng cùng lúc)`
                  : 'Phân loại hiện tại không có tư liệu nào chưa có ảnh'
              }
            >
              {batchBusy || queueBusy
                ? `Đang sinh ${busyAssetIds.size}`
                : pending.length > 0
                  ? `Sinh hàng loạt phần chưa có ảnh (${pending.length})`
                  : 'Sinh hàng loạt phần chưa có ảnh'}
            </button>
          ) : null}

          {DRAMA_VOICE_BINDING_ENABLED && tab === 'character' ? (
            <button
              type="button"
              className="pf-btn pf-btn-lime"
              disabled={batchBusy || batchVoiceBusy || selectedCharacterIds.length === 0}
              onClick={() => void batchGenerateCharacterVoices()}
              title="Sinh và gắn giọng riêng cho từng nhân vật theo phần thiết kế của họ"
            >
              {batchVoiceBusy
                ? 'Đang sinh hàng loạt…'
                : `Sinh giọng hàng loạt (${selectedCharacterIds.length})`}
            </button>
          ) : null}
          <Link className="pf-btn" to={`/drama/projects/${projectId}/canvas`}>
            Mở canvas
          </Link>
        </div>
      </div>

      {tab !== 'voice' ? (
        <div className="drama-assets-gen-opts">
          <DramaImageGenOptionsBar
            value={genOptions}
            onChange={setGenOptions}
            disabled={batchBusy}
            onStylePersist={persistStyle}
          />
        </div>
      ) : null}

      {loading ? <p className="drama-muted">Đang trích xuất tư liệu từ kịch bản (bao gồm cả đạo cụ)…</p> : null}

      {!loading && filtered.length > 0 ? (
        <p className="drama-muted drama-assets-page-meta">
          Trang {safePage} / {pageCount} · Phân loại này có {filtered.length} mục
        </p>
      ) : null}

      <div className={`drama-asset-grid${tab === 'voice' ? ' is-voice' : ''}`}>
        {pageItems.map((asset) => {
          if (tab === 'voice') {
            const promptValue = voicePromptDrafts[asset.id] ?? readVoicePrompt(asset)
            const synthBusy = voiceSynthBusyId === asset.id
            return (
              <DramaVoiceAssetCard
                key={asset.id}
                asset={asset}
                promptValue={promptValue}
                synthBusy={synthBusy}
                onPromptChange={(value) =>
                  setVoicePromptDrafts((prev) => ({
                    ...prev,
                    [asset.id]: value,
                  }))
                }
                onPromptBlur={() => {
                  const draft = (voicePromptDrafts[asset.id] ?? '').trim()
                  if (draft && draft !== readVoicePrompt(asset)) {
                    void persistVoicePrompt(asset, draft).catch((err) =>
                      onError(err instanceof Error ? err.message : 'Lưu thất bại'),
                    )
                  }
                }}
                onSynth={() => void handleSynthVoice(asset)}
                onDelete={() => void handleDeleteVoice(asset)}
                onError={onError}
              />
            )
          }

          const mediaSrc = resolveDramaAssetPreviewUrl(asset)
          const voice = readAssetVoiceBinding(asset)
          const isCharacter = (asset.type || '').toLowerCase() === 'character'
          const busy = busyAssetIds.has(asset.id)
          return (
            <article
              key={asset.id}
              className="drama-asset-card drama-asset-card-clickable"
              role="button"
              tabIndex={0}
              onClick={() => setDetailAsset(asset)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setDetailAsset(asset)
                }
              }}
            >
              {mediaSrc ? (
                <button
                  type="button"
                  className="drama-asset-thumb-btn"
                  title="Bấm để phóng to"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLightbox({ src: mediaSrc, alt: asset.name || 'Xem trước' })
                  }}
                >
                  <img key={mediaSrc} src={mediaSrc} alt={asset.name || ''} />
                </button>
              ) : (
                <div className="drama-asset-placeholder">
                  <DramaImageStylePreviewImg
                    styleId={(genOptions.image_style_id as ImageStyleId) || 'palace-intrigue-cold'}
                    alt=""
                    loading="lazy"
                  />
                  <span>{asset.type || 'tư liệu'}</span>
                </div>
              )}
              <h3>{asset.name || 'Chưa đặt tên'}</h3>
              <p>
                {asset.type}
                {isCharacter && voice ? ` · ${voice.label}` : ''}
              </p>
              <div
                className="drama-asset-card-actions"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {tab === 'character' && isCharacter ? (
                  <label
                    className="drama-voice-multi-select"
                    style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginRight: 8, cursor: 'pointer' }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCharacterIds.includes(asset.id)}
                      onChange={(e) => {
                        e.stopPropagation()
                        setSelectedCharacterIds((prev) =>
                          prev.includes(asset.id) ? prev.filter((id) => id !== asset.id) : [...prev, asset.id],
                        )
                      }}
                    />
                    <span className="drama-muted">Đã chọn</span>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="pf-btn pf-btn-sm"
                  disabled={busy || batchBusy}
                  onClick={() => enqueueOne(asset)}
                >
                  {genButtonLabel(asset)}
                </button>
                {isCharacter ? (
                  <>
                    {DRAMA_VOICE_BINDING_ENABLED ? (
                      voice ? (
                        <CharacterVoicePreviewButton
                          url={voice.url}
                          label={voice.label}
                          onError={onError}
                        />
                      ) : (
                        <button
                          type="button"
                          className="pf-btn pf-btn-sm pf-btn-lime"
                          disabled={
                            batchBusy ||
                            batchVoiceBusy ||
                            characterVoiceBusyIds.has(asset.id)
                          }
                          onClick={() => void handleGenerateCharacterVoice(asset)}
                        >
                          {characterVoiceBusyIds.has(asset.id) ? 'Đang sinh…' : 'Sinh giọng'}
                        </button>
                      )
                    ) : null}
                    <button
                      type="button"
                      className="pf-btn pf-btn-sm drama-btn-danger-text"
                      disabled={busy || batchBusy || batchVoiceBusy}
                      onClick={() => void handleDeleteCharacter(asset)}
                    >
                      Xoá
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
      {!loading && filtered.length === 0 ? <p className="drama-muted">Phân loại này chưa có tư liệu nào</p> : null}

      {!loading && filtered.length > 0 ? (
        <Pagination
          page={safePage}
          pageCount={pageCount}
          total={filtered.length}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          onChange={setPage}
          ariaLabel="Phân trang thư viện tư liệu"
          className="drama-assets-pagination"
        />
      ) : null}

      {detailAsset && (detailAsset.type || '').toLowerCase() !== 'voice' ? (
        <DramaAssetDetailModal
          asset={detailAsset}
          open
          busy={busyAssetIds.has(detailAsset.id)}
          genLabel={genButtonLabel(detailAsset)}
          onClose={() => setDetailAsset(null)}
          onUpdated={(updated) => {
            setAssets((prev) => (prev ?? []).map((a) => (a.id === updated.id ? updated : a)))
            setDetailAsset(updated)
          }}
          onGenerate={(a) => enqueueOne(a)}
          onBindVoice={DRAMA_VOICE_BINDING_ENABLED ? (a) => setVoiceAsset(a) : undefined}
          onDelete={(a) => {
            setDetailAsset(null)
            void handleDeleteCharacter(a)
          }}
          onError={onError}
        />
      ) : null}

      {lightbox ? (
        <DramaImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      ) : null}

      {DRAMA_VOICE_BINDING_ENABLED && voiceAsset ? (
        <CharacterVoiceBindModal
          asset={voiceAsset}
          projectId={projectId}
          open
          onClose={() => setVoiceAsset(null)}
          onBound={(updated) => {
            handleVoiceBound(updated)
            setDetailAsset((prev) => (prev?.id === updated.id ? updated : prev))
          }}
          onError={onError}
        />
      ) : null}

      {DRAMA_VOICE_BINDING_ENABLED && project ? (
        <NarratorVoiceBindModal
          project={project}
          open={narratorVoiceOpen}
          onClose={() => setNarratorVoiceOpen(false)}
          onUpdated={(p) => setProject(p)}
          onError={onError}
        />
      ) : null}

      <GlobalAssetPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        projectId={projectId}
        defaultTab={tab === 'voice' ? 'voice' : tab}
        title="Nhập từ thư viện tư liệu"
        confirmLabel="Nhập vào dự án này"
        onPick={handleImportFromLibrary}
      />
    </div>
  )
}
