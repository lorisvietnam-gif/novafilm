import { Activity, Film, Percent, TrendingUp } from "lucide-react";
import type { AdminStats } from "@/api/client";
import { fenToYuan } from "@/lib/utils";
import { dashboardRangeLabel, type DashboardFilterState } from "@/pages/dashboard/DashboardFilters";
import { DashboardKpiCard } from "@/pages/dashboard/DashboardKpiCard";
import { calcProfitFen, sumDailyUsage } from "@/pages/dashboard/dashboardMetrics";
import { useI18n } from "@/i18n";

type DashboardPeriodKpisProps = {
  stats: AdminStats | null;
  filters: DashboardFilterState;
  loading: boolean;
};

/** 第二行 KPI：随筛选时间窗变化的调用/扣费/毛利/项目规模 */
export function DashboardPeriodKpis({ stats, filters, loading }: DashboardPeriodKpisProps) {
  const { m, t } = useI18n();
  const placeholder = loading ? "…" : "—";
  const rangeLabel = dashboardRangeLabel(filters.days);
  const period = sumDailyUsage(stats?.daily_usage ?? []);
  const profitFen = calcProfitFen(period.charge_fen, period.cost_fen);
  const profitPct =
    period.charge_fen > 0 ? `${((profitFen / period.charge_fen) * 100).toFixed(1)}%` : undefined;

  return (
    <div className="admin-dashboard-kpi-grid admin-dashboard-kpi-grid--secondary">
      <DashboardKpiCard
        label={t("dashboard.kpiCalls", { range: rangeLabel })}
        value={stats ? period.calls.toLocaleString() : placeholder}
        hint={
          stats
            ? t("dashboard.kpiCallsTotalHint", { count: stats.usage_calls_total ?? 0 })
            : m.dashboard.kpiCallsHint
        }
        icon={Activity}
        tone="mint"
      />
      <DashboardKpiCard
        label={t("dashboard.kpiCharge", { range: rangeLabel })}
        value={stats ? `¥${fenToYuan(period.charge_fen)}` : placeholder}
        hint={
          stats
            ? t("dashboard.kpiChargeMonthHint", { value: fenToYuan(stats.usage_charge_month_fen ?? 0) })
            : m.dashboard.kpiChargeUserHint
        }
        icon={TrendingUp}
        tone="blue"
      />
      <DashboardKpiCard
        label={t("dashboard.kpiProfit", { range: rangeLabel })}
        value={stats ? `¥${fenToYuan(profitFen)}` : placeholder}
        hint={
          stats
            ? t("dashboard.kpiProfitCostHint", { value: fenToYuan(period.cost_fen) })
            : m.dashboard.kpiProfitHint
        }
        icon={Percent}
        tone="rose"
        trend={profitPct ? t("dashboard.kpiProfitRate", { value: profitPct }) : undefined}
      />
      <DashboardKpiCard
        label={m.dashboard.kpiDramaProjects}
        value={stats ? stats.drama_project_count ?? 0 : placeholder}
        hint={stats ? t("dashboard.kpiDramaUsersHint", { count: stats.user_count }) : m.dashboard.kpiScaleHint}
        icon={Film}
        tone="slate"
      />
    </div>
  );
}
