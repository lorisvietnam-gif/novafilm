import { useState } from "react";

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import {

  Bell,

  Clapperboard,

  FileVideo,

  Film,

  Image,

  Layers,

  LayoutDashboard,

  ListVideo,

  LogOut,

  Maximize2,

  Menu,

  Receipt,

  Settings,

  Shapes,

  Users,

  Wallet,

} from "lucide-react";

import { LOCALES, useI18n, type Locale } from "@/i18n";

import { clearAuth, getCachedUser } from "@/lib/auth";

import { cn } from "@/lib/utils";



type NavItem = {

  to: string;

  /** Khoá trong `nav.item` của cây pack, tra lúc dựng danh sách */
  labelKey: keyof ReturnType<typeof useI18n>["m"]["nav"]["item"];

  icon: typeof LayoutDashboard;

  end?: boolean;

  matchPrefix?: boolean;

};



type NavGroup = {

  labelKey: keyof ReturnType<typeof useI18n>["m"]["nav"]["group"];

  items: NavItem[];

};



const navGroups: NavGroup[] = [

  {

    labelKey: "overview",

    items: [{ to: "/", labelKey: "dashboard", icon: LayoutDashboard, end: true }],

  },

  {

    labelKey: "business",

    items: [

      { to: "/users", labelKey: "users", icon: Users },

      { to: "/orders", labelKey: "orders", icon: Receipt },
      { to: "/finance", labelKey: "finance", icon: Wallet },

      { to: "/projects", labelKey: "projects", icon: Clapperboard },

      { to: "/works", labelKey: "works", icon: FileVideo },

    ],

  },

  {

    labelKey: "drama",

    items: [

      { to: "/drama-projects", labelKey: "dramaProjects", icon: Film, matchPrefix: true },

      { to: "/drama-assets", labelKey: "dramaAssets", icon: Image, matchPrefix: true },

      { to: "/drama-episodes", labelKey: "dramaEpisodes", icon: ListVideo, matchPrefix: true },

      { to: "/drama-fragments", labelKey: "dramaFragments", icon: Layers, matchPrefix: true },

    ],

  },

  {

    labelKey: "resources",

    items: [

      { to: "/templates", labelKey: "templates", icon: Shapes },

      { to: "/queues", labelKey: "queues", icon: Layers },

    ],

  },

  {

    labelKey: "system",

    items: [{ to: "/settings", labelKey: "settings", icon: Settings }],

  },

];



/** Đường dẫn → khoá `nav.item`; các trang chi tiết dùng khoá riêng trong `nav.detail` */
const pathTitleKeys: Record<string, keyof ReturnType<typeof useI18n>["m"]["nav"]["item"]> = {

  "/": "dashboard",

  "/users": "users",

  "/orders": "orders",
  "/finance": "finance",

  "/projects": "projects",

  "/drama-projects": "dramaProjects",

  "/drama-assets": "dramaAssets",

  "/drama-episodes": "dramaEpisodes",

  "/drama-fragments": "dramaFragments",

  "/works": "works",

  "/templates": "templates",

  "/settings": "settings",

  "/queues": "queues",

};



const localeNames: Record<Locale, string> = {

  zh: "中文",
  en: "English",
  vi: "Tiếng Việt",

};



function resolveTitle(pathname: string, m: ReturnType<typeof useI18n>["m"]): string {

  if (pathname.startsWith("/drama-projects/")) return m.nav.detail.dramaProject;

  if (pathname.startsWith("/drama-assets/")) return m.nav.detail.asset;

  if (pathname.startsWith("/drama-episodes/")) return m.nav.detail.episode;

  if (pathname.startsWith("/drama-fragments/")) return m.nav.detail.fragment;

  const key = pathTitleKeys[pathname];

  return key ? m.nav.item[key] : m.nav.fallback;

}



// Admin shell: dark sidebar + glass top bar

export function AdminLayout() {

  const { locale, setLocale, m } = useI18n();

  const navigate = useNavigate();

  const location = useLocation();

  const user = getCachedUser();

  /*

   * collapsed sidebar collapsed state

   */

  const [collapsed, setCollapsed] = useState(false);



  // Logout and return to login

  function handleLogout() {

    clearAuth();

    navigate("/login");

  }



  const title = resolveTitle(location.pathname, m);

  const initial = (user?.nickname || user?.email || "A").slice(0, 1).toUpperCase();



  return (

    <div className={cn("admin-app", collapsed && "is-collapsed")}>

      <aside className="admin-sidebar">

        <div className="admin-brand">

          <div className="admin-brand-mark">NF</div>

          {!collapsed && (

            <div>

              <div className="admin-brand-name">NOVAFILM</div>

              <div className="admin-brand-sub">{m.nav.brandSub}</div>

            </div>

          )}

        </div>

        <nav className="admin-nav">

          {navGroups.map((group) => (

            <div key={group.labelKey} className="admin-nav-group">

              {!collapsed ? <div className="admin-nav-group-label">{m.nav.group[group.labelKey]}</div> : null}

              {group.items.map((item) => (

                <NavLink

                  key={item.to}

                  to={item.to}

                  end={item.end ?? !item.matchPrefix}

                  className={({ isActive }) =>

                    cn(

                      "admin-nav-item",

                      (isActive || (item.matchPrefix && location.pathname.startsWith(`${item.to}/`))) &&

                        "is-active",

                    )

                  }

                  title={m.nav.item[item.labelKey]}

                >

                  <item.icon className="h-[18px] w-[18px] shrink-0" />

                  {!collapsed && <span>{m.nav.item[item.labelKey]}</span>}

                </NavLink>

              ))}

            </div>

          ))}

        </nav>

        <div className="admin-user-card">

          <div className="admin-avatar">{initial}</div>

          {!collapsed && (

            <div className="min-w-0 flex-1">

              <div className="truncate text-[13px] font-medium text-[#e8f0eb]">{user?.email}</div>

              <div className="text-xs text-[rgba(240,245,242,0.45)]">{m.nav.role}</div>

            </div>

          )}

          <button
            type="button"
            className="admin-icon-btn !text-[rgba(240,245,242,0.55)] hover:!text-[#e8f0eb]"
            onClick={handleLogout}
            title={m.common.action.logout}
          >

            <LogOut className="h-4 w-4" />

          </button>

        </div>

      </aside>



      <div className="admin-main">

        <header className="admin-topbar">

          <div className="flex items-center gap-3">

            <button

              type="button"

              className="admin-icon-btn"

              onClick={() => setCollapsed((v) => !v)}

              aria-label={m.common.a11y.collapseSidebar}

            >

              <Menu className="h-4 w-4" />

            </button>

            <div>

              <div className="admin-topbar-title">{title}</div>

              <div className="admin-topbar-crumb">NOVAFILM · {m.nav.crumb}</div>

            </div>

          </div>

          <div className="flex items-center gap-1">

            <select

              className="admin-select !h-8 !min-h-8 !py-0 text-xs"

              value={locale}

              aria-label={m.common.a11y.language}

              title={m.common.language}

              onChange={(e) => setLocale(e.target.value as Locale)}

            >

              {LOCALES.map((code) => (

                <option key={code} value={code}>

                  {localeNames[code]}

                </option>

              ))}

            </select>

            <button type="button" className="admin-icon-btn" title={m.common.a11y.notifications}>

              <Bell className="h-4 w-4" />

            </button>

            <button

              type="button"

              className="admin-icon-btn"

              title={m.common.a11y.fullscreen}

              onClick={() => {

                if (!document.fullscreenElement) void document.documentElement.requestFullscreen();

                else void document.exitFullscreen();

              }}

            >

              <Maximize2 className="h-4 w-4" />

            </button>

          </div>

        </header>

        <main className="admin-content">

          <Outlet />

        </main>

      </div>

    </div>

  );

}
