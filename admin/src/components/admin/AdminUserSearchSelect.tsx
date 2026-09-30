import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AdminUserRow, type PageMeta } from "@/api/client";
import { formatAccountId, parseAccountIdQuery } from "@/lib/admin-account";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

type ListRes = { items: AdminUserRow[]; meta: PageMeta };

type AdminUserSearchSelectProps = {
  value: number | null;
  onChange: (userId: number | null, user?: AdminUserRow | null) => void;
  placeholder?: string;
  className?: string;
};

/** 远程搜索用户（账号 ID + 邮箱） */
export function AdminUserSearchSelect({
  value,
  onChange,
  placeholder,
  className,
}: AdminUserSearchSelectProps) {
  const { t } = useI18n();
  const hint = placeholder ?? t("common.userSearch.placeholder");
  const idLabel = useCallback(
    (id: number) => t("common.entity.user", { id: formatAccountId(id) }),
    [t],
  );
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AdminUserRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSelected = useCallback(
    async (userId: number) => {
      try {
        const res = await api<ListRes>(
          `/api/admin/users?page=1&page_size=1&q=${encodeURIComponent(String(userId))}`,
        );
        const hit = res.items.find((u) => u.id === userId) ?? res.items[0];
        if (hit) {
          setSelectedLabel(`${hit.email} · ${idLabel(hit.id)}`);
        }
      } catch {
        setSelectedLabel(idLabel(userId));
      }
    },
    [idLabel],
  );

  useEffect(() => {
    if (value) void loadSelected(value);
    else setSelectedLabel("");
  }, [value, loadSelected]);

  const search = useCallback((raw: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const q = raw.trim();
      if (!q) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const accountId = parseAccountIdQuery(q);
        const searchQ = accountId != null ? String(accountId) : q;
        const res = await api<ListRes>(
          `/api/admin/users?page=1&page_size=10&q=${encodeURIComponent(searchQ)}`,
        );
        setOptions(res.items);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 280);
  }, []);

  return (
    <div className={cn("admin-user-search", className)}>
      <input
        className="admin-input"
        placeholder={value ? selectedLabel || hint : hint}
        value={open ? query : value ? selectedLabel : query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          search(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {value ? (
        <button
          type="button"
          className="admin-user-search-clear"
          onClick={() => {
            onChange(null, null);
            setQuery("");
            setSelectedLabel("");
          }}
          aria-label={t("common.userSearch.clear")}
        >
          ×
        </button>
      ) : null}
      {open && (query.trim() || options.length > 0) ? (
        <div className="admin-user-search-dropdown">
          {loading ? <div className="admin-user-search-empty">{t("common.userSearch.searching")}</div> : null}
          {!loading && options.length === 0 ? (
            <div className="admin-user-search-empty">{t("common.userSearch.noMatch")}</div>
          ) : null}
          {options.map((u) => (
            <button
              key={u.id}
              type="button"
              className="admin-user-search-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(u.id, u);
                setSelectedLabel(`${u.email} · ${idLabel(u.id)}`);
                setQuery("");
                setOpen(false);
              }}
            >
              <span className="font-medium">{u.email}</span>
              <span className="text-xs text-[var(--admin-muted)]">
                {idLabel(u.id)}
                {u.nickname ? ` · ${u.nickname}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
