import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

type AdminDateRangeFilterProps = {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  className?: string;
};

/** 日期范围筛选（ISO date 字符串 YYYY-MM-DD） */
export function AdminDateRangeFilter({ from, to, onChange, className }: AdminDateRangeFilterProps) {
  const { t } = useI18n();
  return (
    <div className={cn("admin-date-range", className)}>
      <label className="admin-field">
        <span className="admin-field-label">{t("common.dateRange.from")}</span>
        <input
          type="date"
          className="admin-input"
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
        />
      </label>
      <span className="admin-date-range-sep">—</span>
      <label className="admin-field">
        <span className="admin-field-label">{t("common.dateRange.to")}</span>
        <input
          type="date"
          className="admin-input"
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
        />
      </label>
    </div>
  );
}
