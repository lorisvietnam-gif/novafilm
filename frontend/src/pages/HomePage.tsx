/** Trang chủ NOVAFILM: tuyên bố sản phẩm, lối vào drama/khoa học, quy trình dựng phim và công cụ */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import Button from '../components/ui/Button'
import ComingSoon from '../components/ui/ComingSoon'
import CreateChoiceModal from '../components/ui/CreateChoiceModal'
import { BetaNotice } from '../components/ui/BetaNotice'
import { useI18n } from '../i18n'
import { getDramaImageStylePreviewCandidates, getDramaImageStylePreviewUrl } from '../lib/dramaImageStylePreviews'
import { IMAGE_STYLE_IDS, type ImageStyleId } from '../lib/dramaImageStyles'
import { PRODUCT_ICONS, localizeToolDefs } from '../lib/toolsCatalog'

/** Ảnh của thẻ lối vào sản phẩm (dùng ảnh đã có sẵn trong repo, thuần trang trí). */
const PRODUCT_ART = {
  drama: 'palace-intrigue-cold',
  kepu: 'retro-sci-fi-atompunk',
} as const satisfies Record<string, ImageStyleId>

/** Khung hình nhô lên trên dải hero: hai phong cách đối lập nhau, không lặp với phần dưới. */
const HERO_ART = {
  drama: 'ancient-chinese-mythology',
  kepu: 'neon-cyberpunk-film',
} as const satisfies Record<string, ImageStyleId>

/** Mỗi bước của quy trình một phong cách khác nhau, đi từ hạt phim sang bối cảnh rồi ra khung hình. */
const PIPELINE_ART: readonly ImageStyleId[] = [
  'japanese-youth-film',
  'korean-urban-soft',
  'wuxia-realistic-photo',
]

/** Ba nhóm người dùng, ba tỉ lệ khung hình khác nhau để đoạn này không giống đoạn trên. */
const AUDIENCE_ART: readonly ImageStyleId[] = [
  '90s-rural-china-film',
  'american-retro-hollywood',
  'shadow-puppet-illustration',
]

/**
 * Bản thu nhỏ trong `public/img/` là bản đúng kích thước hiển thị; bản gốc trong
 * `public/image-styles/` là 2560x1440 nặng 234KB-2.8MB.
 *
 * `STILL_WIDTHS` liệt kê đúng các bản thu nhỏ đang có trên đĩa (đo 2026-10-01). Style
 * nào không nằm trong bảng thì dùng `STILL_WIDTHS_BASE`.
 */
const STILL_WIDTHS_BASE: readonly number[] = [512, 1024]
const STILL_WIDTHS: Partial<Record<ImageStyleId, readonly number[]>> = {
  'wuxia-realistic-photo': [512, 640, 1024, 1280],
  'retro-narrative-film': [512, 640, 1024, 1280],
  'neon-cyberpunk-film': [512, 1024, 1280],
  'ghibli-handdrawn-anime': [512, 1024, 1280],
}

/**
 * Style duy nhất trong 21 style **không** có bản thu nhỏ nào trong `public/img/` —
 * kho chỉ có một file PNG gốc 1.26MB. Nó rơi về đường dẫn gốc và không có `srcSet`.
 */
const WITHOUT_DERIVATIVE: ReadonlySet<ImageStyleId> = new Set<ImageStyleId>(['cgi-3d-animation'])

function publicDir(): string {
  const base = import.meta.env.BASE_URL
  return base.endsWith('/') ? base : `${base}/`
}

function stillWidths(id: ImageStyleId): readonly number[] {
  return STILL_WIDTHS[id] ?? STILL_WIDTHS_BASE
}

/**
 * Bản gốc cho style không có bản thu nhỏ.
 *
 * `getDramaImageStylePreviewUrl` trả về **ứng viên đầu tiên** của dãy
 * `jpg → png → api → svg` (`getDramaImageStylePreviewCandidates`). Với 20/21 style ứng
 * viên đầu là `.jpg` và đúng. Riêng `cgi-3d-animation` trên đĩa **chỉ có `.png`**, nên
 * `.jpg` là URL không tồn tại — và nó hỏng âm thầm: dev server trả `index.html`
 * (HTTP 200, `Content-Type: text/html`) cho đường dẫn ảnh, nên trình duyệt báo
 * `complete = true, naturalWidth = 0` thay vì báo lỗi. Ô đen, và không có gì báo.
 *
 * `Still` cố ý không đổi `src` khi ảnh hỏng (xem ghi chú của nó), nên phải chọn đúng ứng
 * viên ngay tại đây.
 */
function stillSrcOriginal(id: ImageStyleId): string {
  const png = getDramaImageStylePreviewCandidates(id).find((url) => url.endsWith('.png'))
  return png ?? getDramaImageStylePreviewUrl(id)
}

function stillSrc(id: ImageStyleId): string {
  if (WITHOUT_DERIVATIVE.has(id)) return stillSrcOriginal(id)
  return `${publicDir()}img/${id}-${stillWidths(id)[0]}.jpg`
}

function stillSrcSet(id: ImageStyleId): string | undefined {
  if (WITHOUT_DERIVATIVE.has(id)) return undefined
  return stillWidths(id).map((w) => `${publicDir()}img/${id}-${w}.jpg ${w}w`).join(', ')
}

type StillProps = {
  id: ImageStyleId
  /** Bề rộng ô hiển thị. Bắt buộc: `srcSet` dùng mô tả `w` nên không có `sizes` thì trình duyệt tải bản lớn nhất. */
  sizes: string
  alt?: string
  /** Chỉ ảnh hero được tải ngay; mọi ảnh còn lại đều tải từng khi dưới fold. */
  priority?: boolean
  className?: string
}

/**
 * Một ô ảnh phong cách trên trang chủ.
 *
 * Cố ý không dùng `DramaImageStylePreviewImg`: component đó chỉ đổi `src` theo kiểu
 * lùi dần jpg → png → static, không có `srcSet`/`sizes`, nên mọi ô — kể cả ô 132px —
 * đều tải bản gốc 2560x1440. Ở trang chủ có hơn 30 ô, đó là hàng trăm KB thừa.
 *
 * `width`/`height` là kích thước gốc của file; khung hiển thị do `aspect-ratio` trong
 * media.css giữ chỗ nên không có layout shift, còn hai thuộc tính này cho trình duyệt
 * biết tỉ lệ ngay khi CSS chưa kịp áp.
 */
function Still({ id, sizes, alt = '', priority = false, className }: StillProps) {
  return (
    <img
      src={stillSrc(id)}
      srcSet={stillSrcSet(id)}
      sizes={sizes}
      width={2560}
      height={1440}
      alt={alt}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : 'auto'}
    />
  )
}

/** Bề rộng hiển thị của mỗi ô, đo theo lưới thật trong media.css. */
const HERO_FRAME_SIZES = '(max-width: 700px) 132px, (max-width: 1400px) 17vw, 273px'
const PRODUCT_ART_SIZES = '(max-width: 560px) 92vw, (max-width: 1200px) 22vw, 232px'
const PIPELINE_ART_SIZES = '(max-width: 700px) 92vw, (max-width: 1200px) 31vw, 400px'
const REEL_ART_SIZES = '(max-width: 700px) 38vw, (max-width: 1200px) 12vw, 156px'
const AUDIENCE_ART_SIZES = '(max-width: 700px) 92vw, (max-width: 1200px) 31vw, 400px'

export default function HomePage() {
  const nav = useNavigate()
  const { t, m } = useI18n()
  const loggedIn = Boolean(localStorage.getItem('token'))
  const [createOpen, setCreateOpen] = useState(false)
  const DramaIcon = PRODUCT_ICONS.drama
  const KepuIcon = PRODUCT_ICONS.kepu
  const tools = localizeToolDefs(m)

  // Chưa đăng nhập thì tới trang đăng nhập; đã đăng nhập thì mở popup chọn sản phẩm
  function goCreate() {
    if (!loggedIn) {
      nav('/auth?next=/')
      return
    }
    setCreateOpen(true)
  }

  // Lối vào sản phẩm: chưa đăng nhập thì kèm next để quay lại
  function goAuthOr(path: string) {
    nav(loggedIn ? path : `/auth?next=${encodeURIComponent(path)}`)
  }

  return (
    <AppShell active="home" hideFooter>
      <section className="pf-land-hero">
        <div className="pf-land-hero-copy">
          <p className="pf-land-kicker">NOVAFILM</p>
          <h1>
            {t('home.headlineBefore')}
            <br />
            <em>{t('home.headlineEm')}</em>
          </h1>
          <p className="pf-land-lede">{t('home.lede')}</p>
          <BetaNotice placement="home-hero" className="pf-land-beta" />
          <div className="pf-land-cta">
            <Button variant="lime" size="lg" icon onClick={goCreate}>
              {t('home.startCreate')}
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Button>
            <Button variant="ghost" size="lg" icon to="/tools">
              {t('home.browseTools')}
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Button>
          </div>
        </div>
        <div className="pf-land-frames" aria-hidden>
          <figure className="pf-land-frame is-drama">
            <Still id={HERO_ART.drama} sizes={HERO_FRAME_SIZES} priority />
            <figcaption>{t('home.dramaTitle')}</figcaption>
          </figure>
          <figure className="pf-land-frame is-kepu">
            <Still id={HERO_ART.kepu} sizes={HERO_FRAME_SIZES} priority />
            <figcaption>{t('home.kepuTitle')}</figcaption>
          </figure>
        </div>
      </section>

      <section className="pf-land-products" id="products" aria-label={t('home.products')}>
        <button type="button" className="pf-land-product is-drama" onClick={() => goAuthOr('/drama')}>
          <span className="pf-land-product-art" aria-hidden>
            <Still id={PRODUCT_ART.drama} sizes={PRODUCT_ART_SIZES} />
            <span className="pf-land-product-icon">
              <DramaIcon size={26} strokeWidth={1.6} />
            </span>
          </span>
          <span className="pf-land-product-body">
            <strong>{t('home.dramaTitle')}</strong>
            <em>{t('home.dramaFor')}</em>
            <span>{t('home.dramaDesc')}</span>
            <span className="pf-land-chips">
              {m.home.dramaSteps.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </span>
          </span>
          <span className="pf-land-product-go" aria-hidden>
            <ArrowRight size={16} strokeWidth={2} />
          </span>
        </button>
        <button type="button" className="pf-land-product is-kepu" onClick={() => goAuthOr('/studio/new')}>
          <span className="pf-land-product-art" aria-hidden>
            <Still id={PRODUCT_ART.kepu} sizes={PRODUCT_ART_SIZES} />
            <span className="pf-land-product-icon">
              <KepuIcon size={26} strokeWidth={1.6} />
            </span>
          </span>
          <span className="pf-land-product-body">
            <strong className="pf-land-product-heading">
              {t('home.kepuTitle')}
              <span className="pf-land-product-tag">{t('home.kepuTag')}</span>
            </strong>
            <em>{t('home.kepuFor')}</em>
            <span>{t('home.kepuDesc')}</span>
            <span className="pf-land-chips">
              {m.home.kepuSteps.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </span>
          </span>
          <span className="pf-land-product-go" aria-hidden>
            <ArrowRight size={16} strokeWidth={2} />
          </span>
        </button>
      </section>

      <section className="pf-land-pipeline" aria-labelledby="pf-land-pipeline-title">
        <header className="pf-land-section-head">
          <p className="pf-land-kicker">{t('home.howKicker')}</p>
          <h2 id="pf-land-pipeline-title">{t('home.howTitle')}</h2>
        </header>
        <ol className="pf-land-pipeline-list">
          {m.home.pipeline.map((item, index) => (
            <li key={item.step}>
              <span className="pf-land-step-art" aria-hidden>
                <span className="pf-land-step-no">{item.step}</span>
                <Still id={PIPELINE_ART[index % PIPELINE_ART.length]} sizes={PIPELINE_ART_SIZES} />
              </span>
              <strong>{item.title}</strong>
              <span>{item.desc}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="pf-land-caps" aria-labelledby="pf-land-caps-title">
        <header className="pf-land-section-head">
          <p className="pf-land-kicker">{t('home.capsKicker')}</p>
          <h2 id="pf-land-caps-title">{t('home.capsTitle')}</h2>
        </header>

        {/* Dải 21 phong cách: cuộn ngang, mỗi ô là một bản thu nhỏ 512px. Ảnh nằm dưới
            fold nên tải từng; phần lớn kho không bao giờ được tải cho tới khi người dùng
            cuộn tới. Không chú thích chữ vì nhãn của từng phong cách đã bị ghim ở module
            (xem IMAGE_STYLE_OPTIONS trong lib/dramaImageStyles.ts) và không đổi theo ngôn
            ngữ — chữ ở đây là bản trang trí của một dải liên hệ, nên `alt=""` là đúng. */}
        <div className="pf-land-reel">
          {IMAGE_STYLE_IDS.map((id) => (
            <figure key={id} className="pf-land-reel-cell">
              <Still id={id} sizes={REEL_ART_SIZES} />
            </figure>
          ))}
        </div>

        <div className="pf-land-cap-grid">
          {m.home.capabilities.map((item) => (
            <article key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pf-land-tools" id="tools">
        <header className="pf-land-section-head is-row">
          <div>
            <p className="pf-land-kicker">{t('home.toolsKicker')}</p>
            <h2>{t('home.toolsTitle')}</h2>
          </div>
          <Link to="/tools" className="pf-link">
            {t('home.allTools')}
          </Link>
        </header>
        <div className="pf-land-sprocket" aria-hidden />
        <div className="pf-land-tool-grid">
          {tools.map((tool) => {
            const Icon = tool.icon
            return (
              <Link
                key={tool.id}
                to={`/tools/${tool.id}`}
                className={`pf-land-tool-card${tool.soon ? ' is-soon' : ''}`}
              >
                <span className="pf-land-tool-icon" aria-hidden>
                  <Icon size={20} strokeWidth={1.7} />
                </span>
                <strong>{tool.title}</strong>
                <span>{tool.desc}</span>
                {tool.soon ? <ComingSoon /> : null}
              </Link>
            )
          })}
        </div>
      </section>

      <section className="pf-land-who" aria-labelledby="pf-land-who-title">
        <header className="pf-land-section-head">
          <p className="pf-land-kicker">{t('home.whoKicker')}</p>
          <h2 id="pf-land-who-title">{t('home.whoTitle')}</h2>
        </header>
        <div className="pf-land-who-grid">
          {m.home.audiences.map((item, index) => (
            <article key={item.title}>
              <span className="pf-land-who-art" aria-hidden>
                <Still id={AUDIENCE_ART[index % AUDIENCE_ART.length]} sizes={AUDIENCE_ART_SIZES} />
              </span>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pf-land-close">
        {/* The closing band is the one warm daylight frame in the set, so the exhale
            after a dark hero reads as a change of light rather than as another dark
            slab.

            It is an `<img loading="lazy">` and not a CSS background on purpose. A
            background image cannot be lazy: the browser fetches it the moment the
            rule applies, and this band sits ~2400px below the top, so 210KB was on
            the critical path for content nobody could see yet. The scrim over it is
            still the same gradient on `.pf-land-close::before`, byte for byte the
            same ladder as before — only the paint order moved. */}
        <img
          className="pf-land-close-art"
          src={`${publicDir()}img/ghibli-handdrawn-anime-1280.jpg`}
          width={2560}
          height={1440}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
        />
        <div>
          <h2>{t('home.closeTitle')}</h2>
          <p>{t('home.closeLead')}</p>
        </div>
        <div className="pf-land-cta">
          <Button variant="lime" size="lg" icon onClick={goCreate}>
            {t('home.startCreate')}
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Button>
          <Button variant="ghost" size="lg" to="/pricing">
            {t('home.viewPricing')}
          </Button>
        </div>
      </section>

      <footer className="pf-land-foot">
        <div className="pf-land-foot-brand">
          <strong>NOVAFILM</strong>
          <p>{t('home.footBrand')}</p>
        </div>
        <nav className="pf-land-foot-nav" aria-label={t('home.footNav')}>
          <Link to="/drama">{t('nav.drama')}</Link>
          <Link to="/history">{t('nav.kepu')}</Link>
          <Link to="/method">{t('home.methodLink')}</Link>
          <Link to="/tools">{t('nav.tools')}</Link>
          <Link to="/pricing">{t('nav.pricing')}</Link>
          <Link to="/help">{t('nav.help')}</Link>
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to="/contact">{t('footer.contact')}</Link>
        </nav>
        <p className="pf-land-copy">© {new Date().getFullYear()} NOVAFILM. All rights reserved.</p>
      </footer>

      <CreateChoiceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </AppShell>
  )
}