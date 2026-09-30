import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminStats, type AdminUserRow, type PageMeta } from "@/api/client";
import { AdminField } from "@/components/admin/AdminField";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminListStats } from "@/components/admin/AdminListStats";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { UserDetailDrawer } from "@/components/admin/UserDetailDrawer";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminDetailQuery } from "@/hooks/useAdminDetailQuery";
import { formatAccountId } from "@/lib/admin-account";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { fenToYuan } from "@/lib/utils";
import { useI18n } from "@/i18n";

type ListRes = { items: AdminUserRow[]; meta: PageMeta };

// 用户管理：搜索、筛选、只读明细与编辑
export function UsersPage() {
  const { m, t } = useI18n();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState<ListRes | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUserRow | null>(null);
  const [form, setForm] = useState({
    role: "user",
    balance_yuan: "0",
    balance_note: "",
  });
  const [saving, setSaving] = useState(false);
  const userDetail = useAdminDetailQuery("user");

  async function load(nextPage = page, nextQ = q, nextSize = pageSize) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: String(nextSize),
      });
      if (nextQ.trim()) params.set("q", nextQ.trim());
      if (roleFilter) params.set("role", roleFilter);
      const res = await api<ListRes>(`/api/admin/users?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.toast.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  useEffect(() => {
    void api<AdminStats>("/api/admin/stats?days=7")
      .then(setStats)
      .catch((err) => {
        setStats(null);
        toast.error(err instanceof Error ? err.message : t("users.statsLoadFailed"));
      });
  }, [t]);

  useEffect(() => {
    if (!userDetail.id || !data?.items) return;
    const hit = data.items.find((u) => u.id === userDetail.id);
    if (hit) setDetailUser(hit);
  }, [userDetail.id, data?.items]);

  function openEdit(user: AdminUserRow) {
    setEditing(user);
    setForm({
      role: user.role || "user",
      balance_yuan: fenToYuan(user.balance_fen),
      balance_note: "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const balanceFen = Math.round(parseFloat(form.balance_yuan || "0") * 100);
      if (Number.isNaN(balanceFen)) throw new Error(t("users.balanceInvalid"));
      await api(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: form.role,
          balance_fen: balanceFen,
          balance_note: form.balance_note || undefined,
        }),
      });
      toast.success(t("users.saved"));
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function applyFilters() {
    setPage(1);
    void load(1, q, pageSize);
  }

  return (
    <div className="admin-list-page">
      <PageHeader description={m.users.description} />

      <AdminFilterBar>
        <AdminSearchInput
          value={q}
          onChange={setQ}
          placeholder={m.users.searchPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters();
          }}
        />
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">{m.users.allRoles}</option>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </Select>
        <Button size="sm" className="admin-filter-action" onClick={applyFilters} disabled={loading}>
          {loading ? t("common.state.loading") : m.common.action.search}
        </Button>
      </AdminFilterBar>

      <AdminListStats
        items={[
          { label: m.users.statTotal, value: stats?.user_count ?? (loading ? "…" : "—") },
          {
            label: m.users.statCallsMonth,
            value: stats != null ? (stats.usage_calls_month ?? 0) : loading ? "…" : "—",
            hint: stats ? t("users.callsTodayHint", { count: stats.usage_calls_today ?? 0 }) : undefined,
          },
          {
            label: m.users.statCallsTotal,
            value: stats != null ? (stats.usage_calls_total ?? 0) : loading ? "…" : "—",
          },
        ]}
      />

      <div className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.users.colAccountId}</TableHead>
              <TableHead>{m.users.colEmail}</TableHead>
              <TableHead>{m.users.colNickname}</TableHead>
              <TableHead>{m.users.colPhone}</TableHead>
              <TableHead>{m.users.colBalance}</TableHead>
              <TableHead>{m.users.colFrozen}</TableHead>
              <TableHead>{m.users.colRole}</TableHead>
              <TableHead>{m.users.colSignedUp}</TableHead>
              <TableHead className="w-[140px]">{m.queues.colActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs text-[#909399]">{formatAccountId(u.id)}</TableCell>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell>{u.nickname || "—"}</TableCell>
                <TableCell className="text-xs">{u.phone || "—"}</TableCell>
                <TableCell className="tabular-nums">¥{fenToYuan(u.balance_fen)}</TableCell>
                <TableCell className="tabular-nums">¥{fenToYuan(u.frozen_fen)}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "success" : "secondary"}>{u.role}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {u.created_at ? new Date(u.created_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDetailUser(u);
                        userDetail.open(u.id);
                      }}
                    >
                      {m.users.actionView}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                      {m.users.actionEdit}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && (data?.items.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <EmptyState title={m.users.emptyTitle} description={m.users.emptyHint} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {data && (
          <PaginationBar
            page={data.meta.page}
            pageSize={pageSize}
            total={data.meta.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>

      <UserDetailDrawer
        userId={userDetail.id}
        open={userDetail.isOpen}
        onOpenChange={(open) => {
          if (!open) userDetail.close();
        }}
        initialUser={detailUser}
      />

      <AdminModal
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        size="md"
        title={m.users.editTitle}
        subtitle={editing?.email}
        footer={
          <Button className="w-full sm:w-auto" disabled={saving} onClick={() => void saveEdit()}>
            {saving ? m.users.saving : m.users.saveChanges}
          </Button>
        }
      >
        <div className="admin-form-grid admin-form-grid--2">
          <AdminField label={m.users.colRole}>
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </Select>
          </AdminField>
          <AdminField label={m.users.balanceYuan}>
            <Input
              value={form.balance_yuan}
              onChange={(e) => setForm((f) => ({ ...f, balance_yuan: e.target.value }))}
            />
          </AdminField>
          <AdminField label={m.users.balanceNote} hint={m.users.optional}>
            <Input
              value={form.balance_note}
              onChange={(e) => setForm((f) => ({ ...f, balance_note: e.target.value }))}
              placeholder={m.users.adminNotePlaceholder}
            />
          </AdminField>
        </div>
      </AdminModal>
    </div>
  );
}
