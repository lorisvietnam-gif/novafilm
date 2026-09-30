import { AdminChipFilter } from "@/components/admin/AdminChipFilter";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { getActiveLocale } from "@/i18n/detect";
import { messages } from "@/i18n/messages";
import { useI18n } from "@/i18n";
import { capabilityLabel, taskDomainLabel } from "@/lib/statusLabels";

/** 仪表盘筛选维度 */
export type DashboardDays = "1" | "7" | "14" | "30";
export type DashboardDomain = "all" | "drama" | "kepu" | "api" | "tools" | "studio";
export type DashboardCapability = "all" | "llm" | "image" | "video" | "tts";
export type DashboardMetric = "charge" | "cost" | "calls";

export type DashboardFilterState = {
  days: DashboardDays;
  domain: DashboardDomain;
  capability: DashboardCapability;
  metric: DashboardMetric;
};

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilterState = {
  days: "7",
  domain: "all",
  capability: "all",
  metric: "charge",
};

/** 运维 Tab 固定全量 30 日，不受隐藏筛选影响 */
export const PROJECTS_DASHBOARD_FILTERS: DashboardFilterState = {
  days: "30",
  domain: "all",
  capability: "all",
  metric: "charge",
};

/**
 * Mã của các ô lọc là **giá trị gửi lên API** nên để nguyên ở đây; nhãn hiển thị
 * lấy từ cây pack để đổi theo ngôn ngữ.
 */
const DAY_VALUES: DashboardDays[] = ["1", "7", "14", "30"];
const DOMAIN_VALUES: DashboardDomain[] = ["all", "drama", "kepu", "api", "tools", "studio"];
const CAPABILITY_VALUES: DashboardCapability[] = ["all", "llm", "image", "video", "tts"];
const METRIC_VALUES: DashboardMetric[] = ["charge", "cost", "calls"];

/** 图表 / 区块标题用的时间范围文案 */
export function dashboardRangeLabel(days: DashboardDays): string {
  const m = messages[getActiveLocale()];
  if (days === "1") return m.dashboard.rangeToday;
  return m.dashboard.rangeDays.replace("{days}", days);
}

/** Nhãn của một chỉ số thống kê (charge / cost / calls) */
function dashboardMetricLabel(metric: DashboardMetric): string {
  const m = messages[getActiveLocale()];
  if (metric === "cost") return m.dashboard.metricCost;
  if (metric === "calls") return m.dashboard.metricCalls;
  return m.dashboard.metricCharge;
}

type DashboardFiltersProps = {
  value: DashboardFilterState;
  onChange: (next: DashboardFilterState) => void;
};

/** 仪表盘用量筛选条（两行紧凑布局） */
export function DashboardFilters({ value, onChange }: DashboardFiltersProps) {
  const { m } = useI18n();
  const patch = (partial: Partial<DashboardFilterState>) => onChange({ ...value, ...partial });

  const dayOptions = DAY_VALUES.map((v) => ({
    value: v,
    label: v === "1" ? m.dashboard.rangeToday : m.dashboard[`days${v}` as "days7"],
  }));
  const domainOptions = DOMAIN_VALUES.map((v) => ({
    value: v,
    label: v === "all" ? m.labels.filter.allDomain : taskDomainLabel(v),
  }));
  const capabilityOptions = CAPABILITY_VALUES.map((v) => ({
    value: v,
    label: v === "all" ? m.labels.filter.allCapability : capabilityLabel(v),
  }));
  const metricOptions = METRIC_VALUES.map((v) => ({ value: v, label: dashboardMetricLabel(v) }));

  return (
    <AdminFilterBar className="admin-dashboard-filters">
      <AdminChipFilter
        label={m.dashboard.filterDays}
        value={value.days}
        options={dayOptions}
        onChange={(days) => patch({ days: days as DashboardDays })}
        className="admin-chip-filter--segment"
      />
      <AdminChipFilter
        label={m.dashboard.filterDomain}
        value={value.domain}
        options={domainOptions}
        onChange={(domain) => patch({ domain: domain as DashboardDomain })}
        className="admin-chip-filter--segment"
      />
      <AdminChipFilter
        label={m.dashboard.filterCapability}
        value={value.capability}
        options={capabilityOptions}
        onChange={(capability) => patch({ capability: capability as DashboardCapability })}
        className="admin-chip-filter--segment"
      />
      <AdminChipFilter
        label={m.dashboard.filterMetric}
        value={value.metric}
        options={metricOptions}
        onChange={(metric) => patch({ metric: metric as DashboardMetric })}
        className="admin-chip-filter--segment"
      />
    </AdminFilterBar>
  );
}

/** 拼接 stats API 查询串 */
export function buildStatsQuery(filters: DashboardFilterState): string {
  const params = new URLSearchParams({
    days: filters.days,
    domain: filters.domain,
    capability: filters.capability,
    top_metric: filters.metric,
  });
  return `/api/admin/stats?${params.toString()}`;
}
