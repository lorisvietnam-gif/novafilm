import {
  Activity,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clapperboard,
  Film,
  Layers,
  Percent,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AdminStats, AdminUpstreamUsage } from "@/api/client";
import type { DashboardInsightItem } from "@/pages/dashboard/DashboardInsightGrid";
import { calcProfitFen, sumDailyUsage, sumProjectStatuses } from "@/pages/dashboard/dashboardMetrics";
import { fenToYuan } from "@/lib/utils";
import { projectStatusLabel } from "@/lib/statusLabels";
import { getActiveLocale } from "@/i18n/detect";
import { messages } from "@/i18n/messages";

/** Thay khoá `{name}` trong văn bản của pack */
function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

/** 财务账单 Tab 图标指标 */
export function buildFinanceInsights(
  stats: AdminStats | null,
  upstream: AdminUpstreamUsage | null,
): DashboardInsightItem[] {
  if (!stats) return [];
  const m = messages[getActiveLocale()].dashboard;

  const monthCharge = stats.usage_charge_month_fen ?? 0;
  const monthCost = stats.usage_cost_month_fen ?? 0;
  const profitFen = calcProfitFen(monthCharge, monthCost);
  const recent = (upstream?.series ?? []).slice(-7);
  const localCost7 = recent.reduce((sum, row) => sum + row.local_cost_fen, 0);
  const officialCost7 = recent.reduce((sum, row) => sum + row.official_cost_fen, 0);
  const delta7 = localCost7 - officialCost7;

  const items: DashboardInsightItem[] = [
    {
      key: "paid-total",
      label: m.paidTotal,
      value: `¥${fenToYuan(stats.order_paid_total_fen)}`,
      hint: fill(m.todayYuan, { value: fenToYuan(stats.order_paid_today_fen) }),
      icon: Banknote,
      tone: "blue",
    },
    {
      key: "charge-month",
      label: m.chargeMonth,
      value: `¥${fenToYuan(monthCharge)}`,
      hint: fill(m.todayYuan, { value: fenToYuan(stats.usage_charge_today_fen ?? 0) }),
      icon: Zap,
      tone: "purple",
    },
    {
      key: "cost-month",
      label: m.costMonth,
      value: `¥${fenToYuan(monthCost)}`,
      hint: fill(m.todayYuan, { value: fenToYuan(stats.usage_cost_today_fen ?? 0) }),
      icon: Wallet,
      tone: "sand",
    },
    {
      key: "profit-month",
      label: m.profitMonth,
      value: `¥${fenToYuan(profitFen)}`,
      hint:
        monthCharge > 0
          ? fill(m.profitRate, { value: ((profitFen / monthCharge) * 100).toFixed(1) })
          : undefined,
      icon: Percent,
      tone: profitFen >= 0 ? "mint" : "rose",
    },
  ];

  if (upstream?.configured && officialCost7 > 0) {
    items.push({
      key: "upstream-delta",
      label: m.delta7,
      value: `¥${fenToYuan(delta7)}`,
      hint: fill(m.delta7Hint, {
        local: fenToYuan(localCost7),
        official: fenToYuan(officialCost7),
      }),
      icon: delta7 >= 0 ? TrendingUp : TrendingDown,
      tone: delta7 >= 0 ? "teal" : "rose",
    });
  }

  items.push({
    key: "paid-today",
    label: m.paidToday,
    value: `¥${fenToYuan(stats.order_paid_today_fen)}`,
    hint: m.paidTodayHint,
    icon: CircleDollarSign,
    tone: "teal",
  });

  return items;
}

const STATUS_META: Record<string, { icon: LucideIcon; tone: DashboardInsightItem["tone"] }> = {
  DONE: { icon: CheckCircle2, tone: "mint" },
  DRAFT: { icon: Layers, tone: "slate" },
  FAILED: { icon: TrendingDown, tone: "rose" },
  SCRIPTING: { icon: Clapperboard, tone: "blue" },
  IMAGING: { icon: Film, tone: "purple" },
  VIDEOING: { icon: Activity, tone: "teal" },
};

/** 项目运维 Tab 图标指标 */
export function buildProjectInsights(stats: AdminStats | null, periodDaily: ReturnType<typeof sumDailyUsage>): DashboardInsightItem[] {
  if (!stats) return [];
  const m = messages[getActiveLocale()].dashboard;

  const kepuTotal = sumProjectStatuses(stats.project_status_counts);
  const items: DashboardInsightItem[] = [
    {
      key: "kepu-total",
      label: m.kepuProjects,
      value: kepuTotal,
      hint: fill(m.kepuProjectsHint, { count: stats.drama_project_count ?? 0 }),
      icon: Clapperboard,
      tone: "blue",
    },
    {
      key: "drama-total",
      label: m.dramaProjects,
      value: stats.drama_project_count ?? 0,
      hint: m.allSite,
      icon: Film,
      tone: "teal",
    },
    {
      key: "calls-today",
      label: m.callsToday,
      value: (stats.usage_calls_today ?? 0).toLocaleString(),
      hint: fill(m.callsMonthHint, { count: stats.usage_calls_month ?? 0 }),
      icon: Activity,
      tone: "mint",
    },
    {
      key: "calls-total",
      label: m.callsTotal,
      value: (stats.usage_calls_total ?? 0).toLocaleString(),
      hint: fill(m.callsWindowHint, { count: periodDaily.calls.toLocaleString() }),
      icon: Layers,
      tone: "slate",
    },
  ];

  const statusEntries = Object.entries(stats.project_status_counts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  for (const [status, count] of statusEntries) {
    const meta = STATUS_META[status] ?? { icon: Layers, tone: "sand" as const };
    items.push({
      key: `status-${status}`,
      label: projectStatusLabel(status),
      value: count,
      hint:
        kepuTotal > 0
          ? fill(m.shareOfKepu, { value: ((count / kepuTotal) * 100).toFixed(1) })
          : undefined,
      icon: meta.icon,
      tone: meta.tone,
    });
  }

  return items;
}
