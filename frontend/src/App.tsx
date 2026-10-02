import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import DialogHost from './components/ui/DialogHost'
import BillingAlertHost from './components/billing/BillingAlertHost'
import { DramaGenQueuePanel } from './components/drama/DramaGenQueuePanel'
import DiscordFab from './components/layout/DiscordFab'
import HomePage from './pages/HomePage'
import ToolDetailPage from './pages/ToolDetailPage'
import './styles/printfilm.css'
import './App.css'

/**
 * Mỗi route nặng một chunk riêng.
 *
 * Số đo (scripts/perf-audit.mjs, 1440x900, Fast 3G): trước khi tách, **mọi** route
 * tải cùng một gói 434KB — kể cả trang chủ, vốn không dùng canvas, trình soạn tập
 * hay bảng khiếu hạn. FCP là 4184ms và LCP trùng đúng FCP, tức là trang không vẽ
 * được gì cho tới khi cả gói về.
 *
 * `React.lazy` là đủ: Vite tách theo import động, mỗi route gọi đúng một lần khi
 * vào. Ước lượng từ kích thước nguồn: canvas + trình soạn tập + storyboard +
 * trình soạn khoa học chiếm phần lớn của gói đó.
 *
 * Cố ý **không** lazy:
 * - `DiscordFab`, `DialogHost`, `BillingAlertHost`, `DramaGenQueuePanel` — chúng treo
 *   ngoài `<Routes>`, cần sẵn ở mọi trang, và lazy chúng chỉ thêm một lần nhảy.
 * - `HomePage` và `ToolDetailPage` — landing page là lối vào phổ biến nhất; tách nó
 *   ra sẽ thêm một round-trip ngay trên route mà người dùng vừa gõ, đổi lại ít byte.
 * - `printfilm.css` và `App.css` — phải có trước lần vẽ đầu, tách chúng là CSS
 *   nhảy có thể thấy được.
 *
 * Đổi route giữa hai trang đã tải là tức thì. Trang đầu tiên vào một route lạ thì
 * đợi một chunk, nên fallback phải giữ chỗ để không nhảy bố cục.
 */
const MethodPage = lazy(() => import('./pages/MethodPage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'))
const ToolsPage = lazy(() => import('./pages/ToolsPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const StudioPage = lazy(() => import('./pages/StudioPage'))
const CreateProjectPage = lazy(() => import('./pages/studio/CreateProjectPage'))
const StyleConfigPage = lazy(() => import('./pages/studio/StyleConfigPage'))
const StoryboardPage = lazy(() => import('./pages/studio/StoryboardPage'))
const EditorPage = lazy(() => import('./pages/studio/EditorPage'))
const DramaListPage = lazy(() => import('./pages/drama/DramaListPage'))
const AssetLibraryPage = lazy(() => import('./pages/drama/AssetLibraryPage'))
const ProjectWorkspacePage = lazy(() => import('./pages/drama/ProjectWorkspacePage'))
const EpisodeEditPage = lazy(() => import('./pages/drama/EpisodeEditPage'))
const EpisodesPage = lazy(() => import('./pages/drama/EpisodesPage'))
const CanvasPage = lazy(() => import('./pages/drama/canvas/CanvasPage'))
const EpisodeStoryboardPage = lazy(() => import('./pages/drama/episodeCanvas/EpisodeStoryboardPage'))

/** Trạm đẻ prompt bốn bước. Trang độc lập, không sửa `/studio` hay `/drama`. */
const WizardPage = lazy(() => import('./pages/wizard/WizardPage'))

/** Hai trang pháp lý dùng chung một module nên vẫn là một chunk. */
const LegalDocPage = lazy(() =>
  import('./pages/LegalDocPage').then((m) => ({ default: m.TermsPage })),
)
const PrivacyPage = lazy(() =>
  import('./pages/LegalDocPage').then((m) => ({ default: m.PrivacyPage })),
)

/**
 * Chỗ dành cho chunk đang tải. `min-height: 60vh` để trang không co về 0 rồi giật
 * lên khi nội dung tới — đúng thứ `min-height` trong `pf-page-head` cũng làm cho
 * phần đầu các trang khác.
 */
function RouteFallback() {
  return <div className="pf-route-fallback" role="status" aria-busy="true" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/method" element={<MethodPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/tools/:toolId" element={<ToolDetailPage />} />
          <Route path="/assets" element={<AssetLibraryPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/terms" element={<LegalDocPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/wizard" element={<WizardPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/studio/new" element={<CreateProjectPage />} />
          <Route path="/studio/:id/style" element={<StyleConfigPage />} />
          <Route path="/studio/:id/editor" element={<EditorPage />} />
          <Route path="/studio/:id" element={<StoryboardPage />} />
          <Route path="/studio" element={<StudioPage />} />
          {/* Agent home (mirrors novel agent entry) */}
          <Route path="/drama" element={<DramaListPage />} />
          <Route path="/drama/dramas" element={<DramaListPage />} />
          <Route path="/drama/assets" element={<AssetLibraryPage />} />
          <Route path="/drama/projects/:projectId" element={<ProjectWorkspacePage />} />
          <Route path="/drama/projects/:projectId/episodes" element={<EpisodesPage />} />
          <Route path="/drama/projects/:projectId/episodes/:episodeId" element={<EpisodeEditPage />} />
          <Route
            path="/drama/projects/:projectId/episodes/:episodeId/canvas"
            element={<EpisodeStoryboardPage />}
          />
          <Route path="/drama/projects/:projectId/canvas" element={<CanvasPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <DiscordFab />
      <DramaGenQueuePanel />
      <BillingAlertHost />
      <DialogHost />
    </BrowserRouter>
  )
}