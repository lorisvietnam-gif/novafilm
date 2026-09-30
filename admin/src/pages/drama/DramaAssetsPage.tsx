import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, type AdminDramaAsset, type PageMeta } from "@/api/client";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminUserSearchSelect } from "@/components/admin/AdminUserSearchSelect";
import { PaginationBar } from "@/components/PaginationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page";
import {
  DRAMA_GENERATION_STATUSES,
  dramaAssetTypeLabel,
  formatDramaGenerationStatus,
} from "@/lib/dramaLabels";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useI18n } from "@/i18n";

type ListRes = { items: AdminDramaAsset[]; meta: PageMeta };

const ASSET_TYPES = ["character", "scene", "prop", "material", "none"] as const;

/** 全站漫剧资产库列表 */
export function DramaAssetsPage() {
  const { m, t } = useI18n();
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id");

  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [type, setType] = useState("");
  const [generationStatus, setGenerationStatus] = useState("");
  const [data, setData] = useState<ListRes | null>(null);

  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(DEFAULT_PAGE_SIZE) });
      if (q.trim()) params.set("q", q.trim());
      if (userId) params.set("user_id", String(userId));
      if (projectId.trim()) params.set("project_id", projectId.trim());
      if (type.trim()) params.set("type", type.trim());
      if (generationStatus.trim()) params.set("generation_status", generationStatus.trim());
      setData(await api<ListRes>(`/api/admin/drama-assets?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.toast.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="admin-list-page">
      <PageHeader description={m.drama.assetsDescription} />
      <AdminFilterBar>
        <Input placeholder={m.drama.assetsSearchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
        <AdminUserSearchSelect value={userId} onChange={setUserId} />
        <Input placeholder={m.drama.assetsProjectPlaceholder} value={projectId} onChange={(e) => setProjectId(e.target.value)} />
        <select className="admin-native-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{m.labels.filter.allType}</option>
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {dramaAssetTypeLabel(t)}
            </option>
          ))}
        </select>
        <select
          className="admin-native-select"
          value={generationStatus}
          onChange={(e) => setGenerationStatus(e.target.value)}
        >
          <option value="">{m.drama.allGeneration}</option>
          {DRAMA_GENERATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatDramaGenerationStatus(s)}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          className="admin-filter-action"
          onClick={() => {
            setPage(1);
            void load(1);
          }}
        >
          {m.common.action.filter}
        </Button>
      </AdminFilterBar>

      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>{m.drama.colPreview}</th>
              <th>{m.common.fields.title}</th>
              <th>{m.common.fields.type}</th>
              <th>{m.common.fields.project}</th>
              <th>{m.common.fields.user}</th>
              <th>{m.drama.colGeneration}</th>
              <th>{m.common.fields.updatedAt}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>
                  {row.cover || row.url ? (
                    <img
                      src={row.cover || row.url || ""}
                      alt={row.name ?? ""}
                      className="admin-thumb"
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="max-w-[140px] truncate">{row.name || "—"}</td>
                <td>{dramaAssetTypeLabel(row.type)}</td>
                <td>
                  <AdminEntityLink kind="drama" id={row.project_id} label={row.project_title ?? undefined} />
                </td>
                <td>
                  {row.user_id ? (
                    <AdminEntityLink kind="user" id={row.user_id} label={row.user_email ?? undefined} />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-xs text-[var(--admin-muted)]">
                  {formatDramaGenerationStatus(row.generation_status)}
                </td>
                <td className="text-xs text-[var(--admin-muted)]">
                  {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                </td>
                <td>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/drama-assets/${row.id}`}>{m.drama.viewAction}</Link>
                  </Button>
                </td>
              </tr>
            ))}
            {(data?.items.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={9} className="!text-center text-[var(--admin-muted)]">
                  {m.drama.assetsEmpty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {data?.meta ? (
        <PaginationBar
          page={data.meta.page}
          pageSize={data.meta.page_size}
          total={data.meta.total}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
