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
import { DramaImageStylePreviewImg } from '../components/drama/DramaImageStylePreviewImg'
import { getDramaImageStylePreviewUrl } from '../lib/dramaImageStylePreviews'
import type { ImageStyleId } from '../lib/dramaImageStyles'
import { PRODUCT_ICONS, localizeToolDefs } from '../lib/toolsCatalog'

/** Ảnh của thẻ lối vào sản phẩm (dùng ảnh đã có sẵn trong repo, tải trễ, thuần trang trí). */
const PRODUCT_ART = {
  drama: 'palace-intrigue-cold',
  kepu: 'retro-sci-fi-atompunk',
} as const satisfies Record<string, ImageStyleId>

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
            <img src={getDramaImageStylePreviewUrl('ancient-chinese-mythology')} alt="" />
            <figcaption>{t('home.dramaTitle')}</figcaption>
          </figure>
          <figure className="pf-land-frame is-kepu">
            <img src={getDramaImageStylePreviewUrl('neon-cyberpunk-film')} alt="" />
            <figcaption>{t('home.kepuTitle')}</figcaption>
          </figure>
        </div>
      </section>

      <section className="pf-land-products" id="products" aria-label={t('home.products')}>
        <button type="button" className="pf-land-product is-drama" onClick={() => goAuthOr('/drama')}>
          <span className="pf-land-product-art" aria-hidden>
            <DramaImageStylePreviewImg styleId={PRODUCT_ART.drama} />
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
            <DramaImageStylePreviewImg styleId={PRODUCT_ART.kepu} />
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
          {m.home.pipeline.map((item) => (
            <li key={item.step}>
              <span className="pf-land-step-no">{item.step}</span>
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
          {m.home.audiences.map((item) => (
            <article key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pf-land-close">
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
