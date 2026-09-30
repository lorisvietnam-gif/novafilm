import {
  Clapperboard,
  Film,
  Image,
  MessageSquareText,
  Mic,
  Palette,
  Video,
  Webhook,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { AdminUsageBucket } from "@/api/client";
import type { DashboardMetric } from "@/pages/dashboard/DashboardFilters";
import type { DashboardInsightItem, DashboardInsightTone } from "@/pages/dashboard/DashboardInsightGrid";
import { formatDashboardMetric, readBucketMetric } from "@/pages/dashboard/dashboardMetrics";
import { getActiveLocale } from "@/i18n/detect";
import { messages } from "@/i18n/messages";
import { capabilityLabel, taskDomainLabel } from "@/lib/statusLabels";

type Meta = { icon: LucideIcon; tone: DashboardInsightTone };

/** Nhãn đến từ bảng nhãn theo mã; icon và màu vẫn cố định vì là thị giác */
const CAPABILITY_META: Record<string, Meta> = {
  llm: { icon: MessageSquareText, tone: "purple" },
  image: { icon: Image, tone: "blue" },
  video: { icon: Video, tone: "teal" },
  tts: { icon: Mic, tone: "sand" },
  unknown: { icon: Wrench, tone: "slate" },
};

const DOMAIN_META: Record<string, Meta> = {
  drama: { icon: Film, tone: "teal" },
  kepu: { icon: Clapperboard, tone: "blue" },
  api: { icon: Webhook, tone: "purple" },
  tools: { icon: Wrench, tone: "sand" },
  studio: { icon: Palette, tone: "mint" },
  unknown: { icon: Wrench, tone: "slate" },
};

function defaultLabelFor(map: Record<string, Meta>, key: string): string {
  return map === CAPABILITY_META ? capabilityLabel(key) : taskDomainLabel(key);
}

function buildInsightItems(
  rows: AdminUsageBucket[],
  metric: DashboardMetric,
  metaMap: Record<string, Meta>,
  labelForKey?: (key: string) => string,
): DashboardInsightItem[] {
  const prepared = [...rows]
    .map((row) => ({
      row,
      value: readBucketMetric(row, metric),
    }))
    .filter((item) => item.value > 0);
  const total = prepared.reduce((sum, item) => sum + item.value, 0);
  const m = messages[getActiveLocale()];

  return prepared
    .sort((a, b) => b.value - a.value)
    .map(({ row, value }) => {
      const meta = metaMap[row.key] ?? metaMap.unknown;
      const sharePct = total > 0 ? ((value / total) * 100).toFixed(1) : null;
      const shareHint = sharePct
        ? m.dashboard.shareHint.replace("{value}", sharePct)
        : undefined;
      return {
        key: row.key,
        label: labelForKey?.(row.key) ?? defaultLabelFor(metaMap, row.key),
        value: formatDashboardMetric(value, metric),
        hint: [shareHint, m.dashboard.callsHint.replace("{count}", row.calls.toLocaleString())]
          .filter(Boolean)
          .join(" · "),
        icon: meta.icon,
        tone: meta.tone,
      };
    });
}

/** 能力分布洞察卡片 */
export function buildCapabilityInsights(
  rows: AdminUsageBucket[],
  metric: DashboardMetric,
): DashboardInsightItem[] {
  return buildInsightItems(rows, metric, CAPABILITY_META);
}

/** 领域分布洞察卡片 */
export function buildDomainInsights(
  rows: AdminUsageBucket[],
  metric: DashboardMetric,
  labelForKey: (key: string) => string,
): DashboardInsightItem[] {
  return buildInsightItems(rows, metric, DOMAIN_META, labelForKey);
}
