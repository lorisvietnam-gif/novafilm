import { BarChart3, Clapperboard, LayoutDashboard, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

/** 仪表盘主板块 */
export type DashboardSection = "overview" | "usage" | "finance" | "projects";

const SECTIONS: {
  id: DashboardSection;
  labelKey: "sectionOverview" | "sectionUsage" | "sectionFinance" | "sectionProjects";
  descKey:
    | "sectionOverviewDesc"
    | "sectionUsageDesc"
    | "sectionFinanceDesc"
    | "sectionProjectsDesc";
  icon: typeof LayoutDashboard;
}[] = [
  { id: "overview", labelKey: "sectionOverview", descKey: "sectionOverviewDesc", icon: LayoutDashboard },
  { id: "usage", labelKey: "sectionUsage", descKey: "sectionUsageDesc", icon: BarChart3 },
  { id: "finance", labelKey: "sectionFinance", descKey: "sectionFinanceDesc", icon: Wallet },
  { id: "projects", labelKey: "sectionProjects", descKey: "sectionProjectsDesc", icon: Clapperboard },
];

type DashboardSectionTabsProps = {
  value: DashboardSection;
  onChange: (next: DashboardSection) => void;
};

/** 仪表盘板块切换 */
export function DashboardSectionTabs({ value, onChange }: DashboardSectionTabsProps) {
  const { m } = useI18n();
  return (
    <div
      className="admin-dashboard-section-tabs"
      role="tablist"
      aria-label={m.dashboard.sectionAriaLabel}
    >
      {SECTIONS.map((item) => {
        const active = value === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn("admin-dashboard-section-tab", active && "is-active")}
            onClick={() => onChange(item.id)}
          >
            <span className="admin-dashboard-section-tab-icon">
              <Icon className="h-4 w-4" />
            </span>
            <span className="admin-dashboard-section-tab-text">
              <span className="admin-dashboard-section-tab-label">{m.dashboard[item.labelKey]}</span>
              <span className="admin-dashboard-section-tab-desc">{m.dashboard[item.descKey]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
