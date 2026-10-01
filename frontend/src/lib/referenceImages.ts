/**
 * Ảnh tham chiếu gửi kèm khi tạo video: gom từ node Canvas, khử trùng URL, chặn vượt trần.
 *
 * Quản lý nhân vật bằng prompt là cách lạc hậu — giữ khuôn mặt và vóc dáng qua các tập
 * phải bằng **ảnh**. Người dùng đã tải ảnh nhân vật / bối cảnh trên Canvas, nên phần
 * frontend chỉ việc gom URL đã có và gửi kèm; tuyệt đối **không** thêm ô tải ảnh mới.
 *
 * Ba chốt chặn, cùng ý với `backend/app/services/project_reference_images.py`:
 * 1. Cùng một ảnh gửi nhiều lần sẽ bị tính thành nhiều ảnh và chạm trần → khử trùng URL.
 * 2. Vượt trần thì **chặn không cho gọi**, không cắt bớt âm thầm: cắt nhầm sẽ làm sai
 *    nhân vật, mà người dùng không hề biết mình vừa bị đổi nhân vật.
 * 3. Chỉ nhận URL http(s) công khai — backend tải được URL đó; `data:`/`blob:` thì không.
 */
import { resolveDramaMediaUrl } from '../api/drama'
import { localized, type LocalizedText } from './localeStrings'

/** Trần cứng phía dịch vụ (`media_ref_limits.MAX_REFERENCE_IMAGES`): một lượt gửi tối đa 9 ảnh. */
export const MAX_REFERENCE_IMAGES = 9

/*
 * Node nhân vật giữ khuôn mặt và vóc dáng → nhóm subject.
 * Node bối cảnh giữ diện mạo thế giới → nhóm style.
 * Còn lại bỏ qua: xem `collectCanvasReferenceImages`.
 */
const SUBJECT_KINDS = new Set(['character'])
const STYLE_KINDS = new Set(['scene'])

const COPY: Record<string, LocalizedText> = {
  overLimit: {
    zh: '画布上的参考图共 {count} 张，超过单次上限 {limit} 张。请先在画布上删减后再生成 —— 不能自动截断，截错会导致角色画错。',
    en: 'There are {count} reference images on the Canvas, over the limit of {limit} per run. Remove some on the Canvas and generate again — they cannot be trimmed automatically, because trimming the wrong one would change the character.',
    vi: 'Trên Canvas đang có {count} ảnh tham chiếu, vượt trần {limit} ảnh mỗi lượt. Bạn xoá bớt ở Canvas rồi tạo lại — không thể tự cắt, vì cắt nhầm sẽ làm sai nhân vật.',
  },
}

/** Node Canvas đủ để gom ảnh; cấu trúc nên `Node<CanvasAssetNodeData>` khớp được. */
export type ReferenceNodeInput = {
  data: {
    kind?: string
    mediaUrl?: string | null
  }
}

export type CanvasReferenceImages = {
  /** Ảnh nhân vật → `subject_ref_urls` */
  subjectRefUrls: string[]
  /** Ảnh bối cảnh → `style_ref_urls` */
  styleRefUrls: string[]
  /** Tổng số ảnh sau khử trùng — đúng bằng số chỗ sẽ gửi đi */
  total: number
  /** Node có URL nhưng không dùng được (`data:`, `blob:`, rỗng) — đếm ra thay vì im lặng bỏ */
  unusable: number
  /** Node bị bỏ qua: sai loại, hoặc chưa có ảnh */
  ignored: number
  /** Node có ảnh nhưng trùng ảnh đã gom — bị khử trùng */
  duplicates: number
  /** Vượt trần: phải chặn, không cắt */
  overLimit: boolean
}

/** Câu báo cho người dùng, đã nội suy số ảnh và trần. */
export function formatReferenceImageLimitMessage(
  count: number,
  limit: number = MAX_REFERENCE_IMAGES,
): string {
  return localized(COPY.overLimit).replace('{count}', String(count)).replace('{limit}', String(limit))
}

/** Chặn trước khi gọi API khi số ảnh vượt trần. Không cắt bớt. */
export class ReferenceImageLimitError extends Error {}

/**
 * Gom URL ảnh tham chiếu từ node Canvas, theo đúng nhóm hợp đồng với backend:
 * node **nhân vật** vào `subjectRefUrls`, node **bối cảnh** vào `styleRefUrls`.
 *
 * Bỏ qua node `video`, `image`, `text`, `audio`: video là **kết quả** chứ không phải
 * tham chiếu, còn node `image` chung không gắn với nhân vật nào — đưa vào sẽ lấn át
 * ảnh nhân vật và làm sai người. Node chưa có ảnh thì không tính vào trần.
 *
 * Đường dẫn tương đối (`/static/...`) được nối thành URL tuyệt đối trước khi so trùng,
 * vì cùng một ảnh mà một node giữ dạng tương đối và node kia dạng tuyệt đối thì phải
 * tính là một.
 */
export function collectCanvasReferenceImages(
  nodes: readonly ReferenceNodeInput[],
): CanvasReferenceImages {
  const seen = new Set<string>()
  const subjectRefUrls: string[] = []
  const styleRefUrls: string[] = []
  let unusable = 0
  let ignored = 0
  let duplicates = 0

  for (const node of nodes) {
    const kind = (node.data?.kind || '').toLowerCase()
    const isSubject = SUBJECT_KINDS.has(kind)
    const isStyle = STYLE_KINDS.has(kind)
    if (!isSubject && !isStyle) {
      ignored += 1
      continue
    }
    const raw = (node.data?.mediaUrl || '').trim()
    if (!raw) {
      ignored += 1
      continue
    }
    const url = resolveDramaMediaUrl(raw)
    if (!/^https?:\/\//i.test(url)) {
      unusable += 1
      continue
    }
    if (seen.has(url)) {
      duplicates += 1
      continue
    }
    seen.add(url)
    ;(isSubject ? subjectRefUrls : styleRefUrls).push(url)
  }

  const total = subjectRefUrls.length + styleRefUrls.length
  return {
    subjectRefUrls,
    styleRefUrls,
    total,
    unusable,
    ignored,
    duplicates,
    overLimit: total > MAX_REFERENCE_IMAGES,
  }
}

/** Ném `ReferenceImageLimitError` khi vượt trần; im lặng khi còn trong trần. */
export function requireWithinReferenceImageLimit(refs: CanvasReferenceImages): void {
  if (!refs.overLimit) return
  throw new ReferenceImageLimitError(formatReferenceImageLimitMessage(refs.total))
}