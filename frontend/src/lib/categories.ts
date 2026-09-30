import { localized, type LocalizedText } from './localeStrings'

export const CATEGORY_ORDER = [
  '开源',
  '科普',
  '获客',
  '纪录片',
  '写实感',
  '真人感',
  '电影感',
  '儿童',
  '动漫',
  '国风',
  '科幻',
  '奇幻',
  '悬疑',
  '商业',
  '复古',
  '图文',
]

/**
 * Tên hiển thị danh mục (tiếng Việt).
 * Khoá vẫn giữ nguyên là chuỗi Trung vì backend trả về đúng giá trị đó và
 * template lọc theo chuỗi này; chỉ phần hiển thị mới dịch sang tiếng Việt.
 */
export const HOME_CATEGORY_LABELS_VI: Record<string, string> = {
  全部: 'Tất cả',
  开源: 'Dự án mã nguồn mở',
  科普: 'Kiến thức phổ thông',
  获客: 'Video thu hút khách',
  纪录片: 'Phim tài liệu',
  写实感: 'Phong cách hiện thực',
  真人感: 'Câu chuyện đời thường',
  电影感: 'Giải thích phim',
  儿童: 'Chữa lành tinh thần',
  动漫: 'Hoạt hình',
  国风: 'Phong cách cổ điển',
  科幻: 'Khoa huyền viễn',
  奇幻: 'Giả tưởng',
  悬疑: 'Trinh thám',
  商业: 'Tiếp thị thương mại',
  复古: 'Hoài niệm',
  图文: 'Ảnh chữ',
}

export const HOME_CATEGORY_LABELS: Record<string, string> = {
  全部: '全部',
  开源: '开源项目',
  科普: '知识科普',
  获客: '获客短视频',
  纪录片: '纪录片',
  写实感: '写实感',
  真人感: '人物故事',
  电影感: '电影解说',
  儿童: '情感治愈',
  动漫: '动漫',
  国风: '国风',
  科幻: '科幻',
  奇幻: '奇幻',
  悬疑: '悬疑',
  商业: '商业营销',
  复古: '复古',
  图文: '图文',
}

/** Khoá danh mục "tất cả": giữ nguyên vì nó cũng là khoá, không chỉ là nhãn. */
export const ALL_CATEGORY_KEY = '全部'

const CATEGORY_LABELS: Record<string, LocalizedText> = {
  全部: { zh: '全部', en: 'All', vi: 'Tất cả' },
  开源: { zh: '开源项目', en: 'Open source', vi: 'Dự án mã nguồn mở' },
  科普: { zh: '知识科普', en: 'Explainer', vi: 'Kiến thức phổ thông' },
  获客: { zh: '获客短视频', en: 'Sales video', vi: 'Video thu hút khách' },
  纪录片: { zh: '纪录片', en: 'Documentary', vi: 'Phim tài liệu' },
  写实感: { zh: '写实感', en: 'Realistic', vi: 'Phong cách hiện thực' },
  真人感: { zh: '人物故事', en: 'Slice of life', vi: 'Câu chuyện đời thường' },
  电影感: { zh: '电影解说', en: 'Film commentary', vi: 'Giải thích phim' },
  儿童: { zh: '情感治愈', en: 'Heartwarming', vi: 'Chữa lành tinh thần' },
  动漫: { zh: '动漫', en: 'Anime', vi: 'Hoạt hình' },
  国风: { zh: '国风', en: 'Chinese classic', vi: 'Phong cách cổ điển' },
  科幻: { zh: '科幻', en: 'Sci-fi', vi: 'Khoa huyền viễn' },
  奇幻: { zh: '奇幻', en: 'Fantasy', vi: 'Giả tưởng' },
  悬疑: { zh: '悬疑', en: 'Mystery', vi: 'Trinh thám' },
  商业: { zh: '商业营销', en: 'Marketing', vi: 'Tiếp thị thương mại' },
  复古: { zh: '复古', en: 'Retro', vi: 'Hoài niệm' },
  图文: { zh: '图文', en: 'Image and text', vi: 'Ảnh chữ' },
  /*
   * Danh mục chỉ template mới dùng, KHÔNG có trong `CATEGORY_ORDER` nên không xuất hiện
   * ở thanh lọc — chúng chỉ hiện trên thẻ mẫu và trong khối thông tin bên trái trang phong
   * cách. Thêm nhãn ở đây thay vì đưa vào `CATEGORY_ORDER` để không đổi thanh lọc.
   * (Khoá vẫn là chuỗi Trung vì backend trả về đúng giá trị đó.)
   */
  故事: { zh: '故事', en: 'Story', vi: 'Câu chuyện' },
  摄影: { zh: '摄影', en: 'Photography', vi: 'Nhiếp ảnh' },
  胶片: { zh: '胶片', en: 'Film', vi: 'Film' },
  剪纸: { zh: '剪纸', en: 'Paper cut', vi: 'Cắt giấy' },
  绘本: { zh: '绘本', en: 'Picture book', vi: 'Truyện tranh' },
  手绘: { zh: '手绘', en: 'Hand-drawn', vi: 'Vẽ tay' },
  赛博: { zh: '赛博', en: 'Cyber', vi: 'Cyber' },
  拼贴: { zh: '拼贴', en: 'Collage', vi: 'Collage' },
  极简: { zh: '极简', en: 'Minimal', vi: 'Tối giản' },
  像素: { zh: '像素', en: 'Pixel', vi: 'Pixel' },
  水墨: { zh: '水墨', en: 'Ink wash', vi: 'Thủy mặc' },
  '3D': { zh: '3D', en: '3D', vi: '3D' },
}

/**
 * Nhãn hiển thị của một khoá danh mục theo ngôn ngữ đang dùng. Khoá lạ (dữ liệu mới
 * thêm mà chưa kịp khai báo) thì trả về nguyên văn thay vì để trống.
 */
export function homeCategoryLabel(key: string): string {
  return localized(CATEGORY_LABELS[key] ?? { zh: key, en: key, vi: key })
}
