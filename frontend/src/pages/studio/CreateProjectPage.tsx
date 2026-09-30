import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, defaultsFromTemplate } from '../../api'
import type { Template } from '../../api'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import AppShell from '../../components/layout/AppShell'
import Stepper from '../../components/ui/Stepper'
import PillTabs from '../../components/ui/PillTabs'
import { IconChevronLeft, IconRefresh, IconSparkles } from '../../components/ui/Icons'
import { CATEGORY_ORDER } from '../../lib/categories'
import { kepuStepIndex, kepuSteps } from '../../lib/status'
import { getDramaImageStylePreviewUrl } from '../../lib/dramaImageStylePreviews'
import './studio.css'

type Inspiration = {
  title: string
  theme: string
  script: string
}

const ALL_CATEGORY = 'Tất cả'
const FEATURED_CATEGORY = 'Đề xuất'
const THEME_TAB = 'Chủ đề một câu'
const SCRIPT_TAB = 'Dán lời dẫn đầy đủ'
const UNTITLED = 'Chưa có tên'

const INSPIRATION_POOL: Inspiration[] = [
  {
    title: 'Cách quay check-in tại quán',
    theme:
      'Biến điểm bán của một quán địa phương thành video TikTok thu hút khách: 3 giây đầu phải cuốn, bối cảnh, 1-2 trải nghiệm thật, lời rủ ghé. Chỉ nói điều có thật.',
    script:
      'Mười lần đi ngang con đường này, lần này mới bước vào.\n\n' +
      'Quán không lớn, biển hiệu rõ, ngay gần cửa tàu điện ngầm.\n\n' +
      'Mình gọi món đặc trưng của quán, vị thì theo trải nghiệm của mình: đúng vị, ra món nhanh.\n\n' +
      'Muốn thử thì nhìn set menu sẵn có của quán rồi tự quyết, đừng nghe lời hứa suốt.',
  },
  {
    title: 'Bài note giới thiệu quán cho nhóm bạn thân',
    theme:
      'Bài note thu hút khách kiểu Xiaohongshu: tiêu đề gây tò mò, ấn tượng đầu tiên, trải nghiệm thật theo từng ý, hợp với ai. Điểm bán chỉ nêu khách quan.',
    script:
      'Đi ngang thôi, cuối cùng ngồi lại trong quán rất lâu.\n\n' +
      'Ấn tượng đầu tiên là ánh sáng sạch, chỗ ngồi không chật.\n\n' +
      'Mình gọi món đặc trưng, phần lượng nói thật; không gian yên tĩnh, hợp để trò chuyện.\n\n' +
      'Hợp hơn với người muốn ngồi từ từ; ai vội thì xem set menu trước rồi hãy quyết.',
  },
  {
    title: 'Phân tích đánh giá để khách quyết định',
    theme:
      'Video giải thích kiểu đánh giá: nhận định tổng thể, không gian và dịch vụ, món nên chọn kèm lý do, mức giá so với chất lượng, hợp với ai. Giá chưa niêm yết thì đừng đoán.',
    script:
      'Cảm nhận chung: sạch sẽ, quy trình rõ ràng, hợp với người đến lần đầu.\n\n' +
      'Không gian thông thoáng, nhân viên chủ động giải thích nên chọn món nào.\n\n' +
      'Nên thử món đặc trưng của quán, lý do là mình tự trải nghiệm và các bước rất dễ hiểu.\n\n' +
      'Gá tính theo bảng niêm yết tại quán. Đi cùng nhóm bạn sẽ hợp hơn đi một mình.',
  },
  {
    title: 'Giới thiệu nhẹ trong nhóm bạn bè',
    theme:
      'Video ngắn thu hút khách qua mạng bạn bè: một câu cảm nhận thật, một chi tiết cụ thể, một lời giới thiệu nhẹ. Tiết chế, không giống quảng cáo.',
    script:
      'Hôm nay đi ngang nên ghé ngồi một lát, yên tĩnh hơn mình tưởng.\n\n' +
      'Bàn cạnh cửa sổ có ánh sáng tự nhiên, hợp để nghỉ chân.\n\n' +
      'Nếu bạn ở gần thì tự ghé xem nhé.',
  },
  {
    title: 'Hố đen hình thành ra sao',
    theme:
      'Hố đen hình thành ra sao? Giải thích bằng cách dễ hiểu về sự sụp của ngôi sao, chân trời sự kiện và độ cong của không gian, hướng tới học sinh cấp hai.',
    script:
      'Một trong những thiên thể bí ẩn nhất bầu trời đêm chính là hố đen.\n\n' +
      'Khi một ngôi sao đủ lớn cạn nhiên liệu, lõi của nó sẽ sụp mạnh dưới lực hút, mật độ cao tới mức ánh sáng cũng không thoát ra được, và chân trời sự kiện ra đời.\n\n' +
      'Nó không phải máy hút bụi của vũ trụ, mà là một vùng không gian bị uốn cong dữ dội. Càng đến gần, thời gian càng trôi khác thường.\n\n' +
      'Nhớ một điều: khối lượng đủ lớn và sụp đủ mạnh thì hố đen sẽ xuất hiện. Lần sau đọc tin khoa học, bạn sẽ phân biệt được truyền thuyết với khoa học.',
  },
  {
    title: 'Vì sao bầu trời lại xanh',
    theme:
      'Vì sao bầu trời lại xanh? Dùng hiệu ứng tán Rayleigh để giải thích ánh nắng, phân tử không khí và mây đỏ lúc hoàng hôn, hợp với người mới bắt đầu học khoa học.',
    script:
      'Ngẩng lên, bầu trời ban ngày thường xanh, vậy là ngẫu nhiên sao?\n\n' +
      'Ánh nắng trông trắng nhưng thực ra chứa nhiều màu. Phân tử không khí tán màu xanh mạnh hơn, ánh sáng xanh dễ bị "bật" ra mọi phía, nên bầu trời ta thấy ngả xanh.\n\n' +
      'Buổi sớm và chiều muộn mặt trời thấp hơn, ánh sáng phải xuyên qua lớp không khí dày hơn, màu xanh bị tán hết, phần ánh sáng đỏ cam còn lại nhuộm đỏ chân trời.\n\n' +
      'Nên màu bầu trời chính là kết quả cộng tác giữa ánh sáng và không khí.',
  },
  {
    title: 'AI thay đổi cuộc sống ra sao',
    theme:
      'AI thay đổi cuộc sống ra sao: từ gợi ý nội dung, trợ lý giọng nói đến ảnh y tế, làm rõ sự tiện lợi và thiên lệch cần thận trọng.',
    script:
      'Mở điện thoại, gợi ý video, chỉ đường, trợ lý giọng nói — trí tuệ nhân tạo đã lặng lẽ bước vào đời sống hằng ngày.\n\n' +
      'Nó giỏi tìm quy luật trong lượng dữ liệu khổng lồ: giúp bác sĩ phát hiện dấu hiệu trên ảnh, giúp nhà máy dự báo sự cố, và giúp bạn biến tìm kiếm thành cuộc trò chuyện.\n\n' +
      'Nhưng AI không phải phép thuật. Dữ liệu có thiên lệch, mô hình sẽ sai, và quyền riêng tư vẫn cần có ranh giới. Cái thực sự hữu ích là coi AI là công cụ, chứ không phải là chân lý.\n\n' +
      'Hiểu rõ nó làm được gì và không làm được gì, bạn mới dùng nó khôn ngoan hơn.',
  },
  {
    title: 'Một ngày trên sao Hỏa',
    theme:
      'Một ngày trên sao Hỏa trông như thế nào? So sánh độ dài ngày với Trái Đất, nhiệt độ, bụi cát và hình dung về trạm nghiên cứu của con người, thành video khoa học có bối cảnh.',
    script:
      'Hãy tưởng tượng bạn tỉnh dậy trên sao Hỏa: mặt trời xa hơn và nhỏ hơn, bầu trời ngả màu kem, một ngày dài khoảng 24 giờ 39 phút.\n\n' +
      'Ban ngày có thể "ấm" tới dưới 0 độ, ban đêm còn lạnh hơn. Lớp khí CO2 mỏng không giữ được nhiệt, bão bụi thỉnh thoảng che kín bầu trời.\n\n' +
      'Các nhà khoa học vẫn đang lên kế hoạch trạm cơ sở: chắn bức xạ, tạo oxy, trồng thức ăn. Sao Hỏa không phải Trái Đất thứ hai, nhưng nó là lớp học ngoài không gian gần nhất.\n\n' +
      'Tìm hiểu một ngày trên sao Hỏa, chính là xem trước chuyến đi xa tiếp theo của con người.',
  },
  {
    title: 'Sức mạnh của giấc mơ',
    theme:
      'Sức mạnh của giấc mơ: chu kỳ ngủ, pha REM và việc sắp xếp trí nhớ, dùng một câu chuyện để giải thích giấc mơ giúp não "tổng kết" ra sao.',
    script:
      'Khi bạn ngủ, bộ não không tan cao.\n\n' +
      'Ở pha REM, bộ não như đang chiếu lại các mảnh của ban ngày rồi ghép lại thành giấc mơ kỳ lạ. Các nhà khoa học cho rằng điều này giúp sắp xếp trí nhớ và ổn định cảm xúc.\n\n' +
      'Ngủ thiếu, cả tập trung lẫn sáng tạo đều giảm; ngủ đúng giờ thì giống như bảo trì đêm cho não.\n\n' +
      'Lần sau gặp giấc mơ kỳ, đừng chỉ thấy vô lý — có thể não đang tăng ca học thêm.',
  },
  {
    title: 'Mùa xuân của một mèo hoang',
    theme:
      'Mùa xuân của một mèo hoang: lời dẫn xuyên suốt giải thích sinh thái đô thị, ranh giới khi cho ăn và cách sống chung với người, theo hướng ấm áp.',
    script:
      'Mùa xuân về, mèo lý mèo ở đầu ngõ bắt đầu thay lông và cũng bắt đầu tìm một góc nào đó an toàn hơn.\n\n' +
      'Động vật hoang trong thành phố sống nhờ phần bản năng hoang dã còn sót lại và thiện ý vô tình của con người. Cho ăn đúng khoa học, triệt sản và giữ đúng khoảng cách quan trọng hơn lúc bốc đồng.\n\n' +
      'Chúng không phải cảnh tượng, cũng không phải phiền phức, mà là một phần của hệ sinh thái đô thị.\n\n' +
      'Trong mùa xuân này, mong mỗi con mèo đều gặp một ngày mai đàng hoàng hơn.',
  },
  {
    title: 'Bí mật của quang hợp',
    theme:
      'Bí mật của quang hợp: lá cây biến ánh nắng thành đường ra sao, làm rõ lục lạp, chuyển hóa năng lượng và nguồn oxy của Trái Đất.',
    script:
      'Lá xanh không chỉ để trang trí, chúng là những nhà máy hóa học yên tĩnh nhất trên Trái Đất.\n\n' +
      'Lục lạp bắt ánh nắng, biến nước và CO2 thành đường rồi giải phóng oxy. Không có quá trình này, phần lớn chuỗi thức ăn sẽ đứt gãy.\n\n' +
      'Oxy bạn hít vào, cơm và rau trên bàn ăn, đều gián tiếp đến từ phép màu của ánh sáng này.\n\n' +
      'Hiểu quang hợp là hiểu sổ cái nền tảng của sự sống.',
  },
  {
    title: 'Khi động đất xảy ra thì làm gì',
    theme:
      'Khi động đất xảy ra thì làm gì: dạy theo tình huống thật về việc chuẩn bị trước, tư thế tránh và cách phân biệt tin đồn, mang tính an toàn thực dụng.',
    script:
      'Mặt đất bỗng rung lên, phản xạ đầu tiên thường là hoảng.\n\n' +
      'Cách làm đúng là nằm sấp xuống chỗ gần, che đầu, bám chắc, tránh xa cửa sổ và vật treo cao; đừng chen nhau bước vào thang máy. Chuẩn bị sẵn túi cứu hộ từ trước còn hữu ích hơn chạy vội lúc sự cố.\n\n' +
      'Sau động đất vẫn phải cảnh giác dư chấn và tin đồn. Thông tin chính thống và trật tự giúp nhau mới là cảm giác an toàn thực sự.\n\n' +
      'Biết một chút về động đất, khoảnh khắc quyết định bạn sẽ bình tĩnh hơn một phần.',
  },
  {
    title: 'Caffeine tỉnh táo thế nào',
    theme:
      'Caffeine tỉnh táo thế nào: thụ cảm adenosine, hiện tượng dung nạp và cái giá phải trả cho giấc ngủ, giúp dân văn phòng uống cà phê đúng cách.',
    script:
      'Buồn ngủ mà uống một ly cà phê, có thật sự là "đánh thức não" không?\n\n' +
      'Caffeine chiếm chỗ của adenosine khiến bạn tạm thấy tỉnh. Nhưng nó không thay thế được giấc ngủ, uống nhiều vào buổi chiều thì đêm dễ trằn trọc hơn.\n\n' +
      'Khi cơ thể quen dần, hiệu quả của cùng một ly sẽ giảm. Cách dùng khôn ngoan hơn là chỉ dùng lúc cần tập trung, và chừa khoảng trống cho giấc ngủ.\n\n' +
      'Tỉnh táo thì có thể nhờ cà phê, nhưng lấy lại sức thì vẫn phải nhờ ngủ.',
  },
  {
    title: 'Nhựa đi đâu rồi',
    theme:
      'Nhựa đi đâu rồi: vi nhựa, hệ lưu hành đại dương và vật liệu thay thế, thành video khoa học chủ đề bảo vệ môi trường.',
    script:
      'Cái túi nhựa bỏ đi, thật sự biến mất chứ?\n\n' +
      'Phần lớn chỉ bị bẻ vụn thành những mảnh nhỏ hơn. Vi nhựa đi vào sông và biển, rồi vào chuỗi thức ăn, cuối cùng có thể quay lại bàn ăn của chúng ta.\n\n' +
      'Giảm nhựa dùng một lần, phân loại đúng và thúc đẩy vật liệu tốt hơn rẻ hơn nhiều so với dọn dẹp sau.\n\n' +
      'Hỏi "nhựa đi đâu rồi" thực chất là hỏi: chúng ta sẵn sàng để lại gì cho tương lai.',
  },
  {
    title: 'Vì sao vaccine hiệu quả',
    theme:
      'Vì sao vaccine hiệu quả: dùng hình ảnh "diễn tập" để nói rõ kháng nguyên, kháng thể và miễn dịch cộng đồng, đồng thời xóa các hiểu lầm thường gặp.',
    script:
      'Vaccine không phải thuốc, nó giống một đoạn xem trước gửi cho hệ miễn dịch hơn.\n\n' +
      'Nó cho cơ thể biết trước những đặc điểm quan trọng của mầm bệnh, để khi gặp thật thì kháng thể được huy động nhanh hơn. Đây không phải sửa gen, mà là huấn luyện trí nhớ.\n\n' +
      'Khi đủ nhiều người được bảo vệ, chuỗi lây lan sẽ bị cắt đứt, đó là ý nghĩa của miễn dịch cộng đồng.\n\n' +
      'Tiêm chủng đúng cách là đặt bản thân và những người bên cạnh vào chung một mạng lưới an toàn hơn.',
  },
  {
    title: 'Thủy triều lên xuống',
    theme:
      'Thủy triều vì sao lên xuống: lực hút của Mặt Trăng, lực quán tính và triều lớn triều nhỏ, giải thích bằng bối cảnh bờ biển.',
    script:
      'Người biển hiểu nhất: mực nước lúc nào cũng lên đúng giờ, rút đúng giờ.\n\n' +
      'Động lực chính là lực hút của Mặt Trăng, Mặt Trời cũng góp một tay. Khi Trái Đất, Mặt Trăng và Mặt Trời thành một đường thẳng, biên độ triều lớn hơn, đó là triều lớn.\n\n' +
      'Thủy triều còn ảnh hưởng tới hàng hải, phát điện và cả nhịp sinh học. Ngẩng nhìn Mặt Trăng, biển dưới chân cũng đang đáp lại.\n\n' +
      'Trong nhịp lên xuống ấy là dấu vết nhìn thấy được của lực hút trời đất.',
  },
]

const PAGE_SIZE = 6

/** Tên doạn trước khi Việt hoá vẫn được coi là "chưa đặt tên" */
const LEGACY_UNTITLED = '未命名作品'

function isDefaultTitle(value: string) {
  const t = value.trim()
  return !t || t === UNTITLED || t === LEGACY_UNTITLED
}

function deriveTitle(text: string) {
  const line = text
    .trim()
    .split(/\n/)[0]
    .replace(/["""'']/g, '')
    .replace(/[。！？!?：:].*$/, '')
    .trim()
  if (!line) return UNTITLED
  return line.slice(0, 18)
}

export default function CreateProjectPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState(params.get('template') || '')
  const [category, setCategory] = useState(ALL_CATEGORY)
  const [q, setQ] = useState('')
  const [inputTab, setInputTab] = useState(THEME_TAB)
  const [sourceText, setSourceText] = useState(INSPIRATION_POOL[0].theme)
  const [title, setTitle] = useState(INSPIRATION_POOL[0].title)
  const [titleTouched, setTitleTouched] = useState(false)
  const [inspPage, setInspPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    api.me().catch(() => nav('/auth'))
    api.templates().then((list) => {
      setTemplates(list)
      const fromUrl = params.get('template') || ''
      setTemplateId((prev) => prev || fromUrl || list[0]?.id || '')
    })
  }, [nav, params])

  const categories = useMemo(() => {
    const found = new Set<string>()
    for (const t of templates) {
      for (const c of t.category || []) {
        if (CATEGORY_ORDER.includes(c)) found.add(c)
      }
    }
    return [ALL_CATEGORY, FEATURED_CATEGORY, ...CATEGORY_ORDER.filter((c) => found.has(c))]
  }, [templates])

  const filtered = useMemo(() => {
    let list = templates
    if (category === FEATURED_CATEGORY)
      list = [...templates].sort((a, b) => a.sort_order - b.sort_order).slice(0, 8)
    else if (category !== ALL_CATEGORY) list = list.filter((t) => (t.category || []).includes(category))
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter((t) => t.name.toLowerCase().includes(s))
    }
    return list
  }, [templates, category, q])

  const selected = templates.find((t) => t.id === templateId)
  const sourceType = inputTab === SCRIPT_TAB ? 'script' : 'theme'
  const inspTotal = Math.ceil(INSPIRATION_POOL.length / PAGE_SIZE)
  const inspirations = INSPIRATION_POOL.slice(inspPage * PAGE_SIZE, inspPage * PAGE_SIZE + PAGE_SIZE)

  // Đổ gợi ý mẫu vào ô chủ đề/lời dẫn và đồng bộ tên ngắn
  function applyInspiration(item: Inspiration) {
    if (sourceType === 'script') {
      setInputTab(SCRIPT_TAB)
      setSourceText(item.script.slice(0, 8000))
    } else {
      setInputTab(THEME_TAB)
      setSourceText(item.theme.slice(0, 100))
    }
    setTitle(item.title.slice(0, 24))
    setTitleTouched(false)
    setError('')
  }

  function shuffleInspirations() {
    setInspPage((p) => (p + 1) % inspTotal)
  }

  async function aiExpand() {
    const seed = sourceText.trim() || title.trim() || 'AI thay đổi cuộc sống ra sao'
    setAiBusy(true)
    setError('')
    try {
      const mode = sourceType === 'script' ? 'script' : 'theme'
      const result = await api.expandContent(seed, mode)
      setSourceText(result.content.slice(0, mode === 'theme' ? 100 : 8000))
      if (!titleTouched || isDefaultTitle(title)) {
        setTitle(result.title.slice(0, 24))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI không tạo được nội dung.')
    } finally {
      setAiBusy(false)
    }
  }

  async function next() {
    if (!templateId || !sourceText.trim()) {
      setError('Hãy chọn mẫu và nhập nội dung chủ đề.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const tpl = templates.find((t) => t.id === templateId)
      const d = tpl ? defaultsFromTemplate(tpl) : undefined
      const modeParam = params.get('mode')
      const pipeline_mode: 'full' | 'image_text' =
        modeParam === 'image_text' || modeParam === 'full' ? modeParam : 'full'
      const finalTitle =
        title.trim() || deriveTitle(sourceText) || sourceText.trim().slice(0, 24) || UNTITLED
      const project = await api.createProject({
        template_id: templateId,
        title: finalTitle,
        source_type: sourceType,
        source_text: sourceText.trim(),
        resolution_mode: 'preview',
        pipeline_mode,
        output_ratio: d?.output_ratio || '16:9',
        voice_id: d?.voice_id,
      })
      nav(`/studio/${project.id}/style`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo dự án thất bại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell active="studio" wide>
      <header className="pf-page-head studio-scoped">
        <div className="pf-page-head-row">
          <div>
            <button type="button" className="pf-back" onClick={() => nav('/')}>
              <IconChevronLeft size={18} />
              Dự án mới / Bắt đầu sáng tạo
            </button>
            <h1 className="pf-page-title">Tạo dự án</h1>
          </div>
          <Stepper steps={kepuSteps()} current={kepuStepIndex('create')} doneThrough={-1} />
        </div>
      </header>

      <div className="pf-create studio-scoped">
        <aside className="pf-create-col">
          <h3>Chọn mẫu</h3>
          <div className="pf-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm mẫu…"
              aria-label="Tìm mẫu theo tên"
            />
          </div>
          <PillTabs
            items={categories.slice(0, 6)}
            value={category}
            onChange={setCategory}
            ariaLabel="Nhóm mẫu"
          />
          <div className="pf-tpl-list" style={{ marginTop: '0.75rem' }}>
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                className={templateId === t.id ? 'pf-tpl-mini selected' : 'pf-tpl-mini'}
                onClick={() => setTemplateId(t.id)}
              >
                <img src={api.assetUrl(t.preview_cover)} alt="" loading="lazy" />
                <div>
                  <strong>{t.name}</strong>
                  <span>
                    {t.default_ratio} · {(t.category || [])[0] || 'Đa dụng'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="pf-create-col">
          <h3>Nhập nội dung</h3>
          <div className="pf-input-tabs">
            {[THEME_TAB, SCRIPT_TAB].map((tab) => (
              <button
                key={tab}
                type="button"
                className={['pf-pill', inputTab === tab ? 'lime active' : ''].join(' ')}
                onClick={() => setInputTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <label className="pf-field">
            <span className="pf-field-label">Tên dự án</span>
            <input
              className="pf-field-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
              onBlur={() => {
                if (isDefaultTitle(title) && sourceText.trim()) {
                  setTitle(deriveTitle(sourceText))
                  setTitleTouched(false)
                }
              }}
              placeholder="Sẽ tự động điền theo nội dung"
            />
          </label>

          <div className="pf-textarea-wrap">
            <div className="pf-textarea-toolbar">
              <button
                type="button"
                className="pf-btn pf-btn-ai pf-btn-sm pf-btn-icon"
                disabled={aiBusy || busy}
                onClick={aiExpand}
              >
                <IconSparkles size={14} />
                {aiBusy
                  ? 'Đang tạo…'
                  : sourceType === 'script'
                    ? 'AI viết dài lời dẫn'
                    : 'AI tạo chủ đề'}
              </button>
              <span className="pf-muted" style={{ fontSize: '0.75rem' }}>
                {sourceType === 'script'
                  ? 'Viết dài từ một câu thành lời dẫn đầy đủ'
                  : 'Bổ sung đối tượng và kiến thức trọng tâm'}
              </span>
            </div>
            <textarea
              value={sourceText}
              onChange={(e) => {
                const next = e.target.value.slice(0, sourceType === 'theme' ? 100 : 8000)
                setSourceText(next)
                if (!titleTouched || isDefaultTitle(title)) {
                  setTitle(deriveTitle(next))
                }
              }}
              placeholder={
                sourceType === 'theme'
                  ? 'Ví dụ: Hố đen hình thành ra sao? Giải thích dễ hiểu về lực hút và không gian'
                  : 'Dán lời dẫn đầy đủ hoặc để AI tạo…'
              }
            />
            {sourceType === 'theme' ? (
              <span className="pf-char-count">{sourceText.length}/100</span>
            ) : (
              <span className="pf-char-count">{sourceText.length} ký tự</span>
            )}
          </div>

          <div className="pf-inspire">
            <div className="pf-inspire-head">
              <strong>Gợi ý mẫu</strong>
              <button
                type="button"
                className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
                onClick={shuffleInspirations}
              >
                <IconRefresh size={14} />
                Đổi bộ khác
              </button>
            </div>
            <div className="pf-chips">
              {inspirations.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className="pf-chip"
                  title={sourceType === 'script' ? item.script.slice(0, 80) : item.theme}
                  onClick={() => applyInspiration(item)}
                >
                  {item.title}
                </button>
              ))}
            </div>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0.55rem 0 0' }}>
              Bấm một ví dụ để điền đầy đủ {sourceType === 'script' ? 'lời dẫn' : 'chủ đề'} và tự đặt
                  tên dự án.
            </p>
          </div>

          <div className="pf-hint" style={{ marginTop: '1rem' }}>
            Chủ đề càng cụ thể, AI càng dễ tạo ra storyboard và lời dẫn đúng. Hãy nêu rõ đối tượng
            và kiến thức trọng tâm.
          </div>
          {error ? <BillingErrorNotice message={error} /> : null}
        </section>

        <aside className="pf-create-col">
          <h3>Tóm tắt dự án</h3>
          {selected ? (
            <figure className="studio-summary-figure">
              <img src={api.assetUrl(selected.preview_cover)} alt="" />
              <figcaption>
                <strong>{selected.name}</strong>
                <p className="pf-muted">{selected.description}</p>
              </figcaption>
            </figure>
          ) : (
            <div className="studio-pick-hint">
              <span className="studio-pick-art" aria-hidden>
                <img src={getDramaImageStylePreviewUrl('shanghai-animation')} alt="" />
              </span>
              <p className="pf-muted">Chưa chọn mẫu nào. Bấm một mẫu bên trái để xem phần tóm tắt.</p>
            </div>
          )}
          <div className="pf-summary-row">
            <span>Tên tác phẩm</span>
            <span>{title.trim() || UNTITLED}</span>
          </div>
          <div className="pf-summary-row">
            <span>Định dạng đầu ra</span>
            <span>{selected?.default_ratio === '9:16' ? 'Video · 9:16' : 'Video · 16:9'}</span>
          </div>
          <div className="pf-summary-row">
            <span>Thời lượng ước tính</span>
            <span>~1–3 phút</span>
          </div>
          <div className="pf-summary-row">
            <span>Ngôn ngữ</span>
            <span>Tiếng Việt</span>
          </div>
          <div className="pf-summary-row">
            <span>Cách nhập</span>
            <span>{inputTab}</span>
          </div>
          <button
            type="button"
            className="pf-btn pf-btn-lime pf-btn-block pf-btn-lg pf-btn-icon"
            style={{ marginTop: '1.25rem' }}
            disabled={busy || aiBusy || !templateId || !sourceText.trim()}
            onClick={next}
          >
            {busy ? 'Đang tạo…' : 'Bước tiếp theo: Cấu hình phong cách'}
            {!busy ? <span aria-hidden>→</span> : null}
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm pf-btn-icon"
            style={{ marginTop: '0.55rem' }}
            disabled={aiBusy || busy}
            onClick={aiExpand}
          >
            <IconSparkles size={14} />
            {aiBusy ? 'AI đang tạo…' : 'Chưa đủ ý? Để AI viết hộ'}
          </button>
          <p className="pf-muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
            Phong cách hình ảnh đã đi kèm mẫu. Bước sau xác nhận lồng tiếng và cách dựng phim.
          </p>
        </aside>
      </div>
    </AppShell>
  )
}
