import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, type AdminDramaAsset } from "@/api/client";
import { AdminDetailMeta, AdminDetailSection } from "@/components/admin/AdminDetailLayout";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { Button } from "@/components/ui/button";
import { dramaAssetTypeLabel, formatDramaGenerationStatus } from "@/lib/dramaLabels";
import { useI18n } from "@/i18n";

/** 漫剧资产详情二级页 */
export function DramaAssetDetailPage() {
  const { m, t } = useI18n();
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AdminDramaAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const id = Number(assetId);

  useEffect(() => {
    if (!id || Number.isNaN(id)) {
      navigate("/drama-assets", { replace: true });
      return;
    }
    setLoading(true);
    void api<AdminDramaAsset>(`/api/admin/drama-assets/${id}`)
      .then(setDetail)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : t("common.toast.loadFailed"));
        navigate("/drama-assets", { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id, navigate, t]);

  if (loading && !detail) {
    return <div className="admin-detail-page-loading">{t("drama.detailLoading")}</div>;
  }
  if (!detail) return null;

  const mediaUrl = detail.cover || detail.url;

  return (
    <div className="admin-detail-page">
      <div className="admin-detail-page-toolbar">
        <Button variant="ghost" size="sm" className="admin-detail-back" asChild>
          <Link to="/drama-assets">
            <ArrowLeft className="h-4 w-4" />
            {m.drama.backToAssets}
          </Link>
        </Button>
        <div className="admin-detail-page-heading">
          <h2 className="admin-detail-page-title">
            {t("drama.assetTitle", { id: detail.id, name: detail.name || m.drama.assetUnnamed })}
          </h2>
          <p className="admin-detail-page-sub">
            {dramaAssetTypeLabel(detail.type)} ·{" "}
            <AdminEntityLink kind="drama" id={detail.project_id} label={detail.project_title ?? undefined} />
          </p>
        </div>
        <div className="admin-detail-page-actions">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/drama-projects/${detail.project_id}`}>{m.drama.openProject}</Link>
          </Button>
        </div>
      </div>

      {mediaUrl ? (
        <AdminDetailSection title={m.common.fields.mediaPreview}>
          <div className="admin-detail-media">
            {detail.asset_type === "video" ? (
              <video src={mediaUrl} controls className="max-w-full" />
            ) : (
              <img src={mediaUrl} alt={detail.name ?? ""} />
            )}
          </div>
        </AdminDetailSection>
      ) : null}

      <AdminDetailSection title={m.common.fields.basicInfo}>
        <AdminDetailMeta
          items={[
            { label: m.common.fields.type, value: dramaAssetTypeLabel(detail.type) },
            { label: m.drama.colMediaType, value: detail.asset_type },
            { label: "derive_id", value: detail.derive_id || "—" },
            {
              label: m.common.fields.user,
              value: detail.user_id ? (
                <AdminEntityLink kind="user" id={detail.user_id} label={detail.user_email ?? undefined} />
              ) : (
                "—"
              ),
            },
            {
              label: m.common.fields.project,
              value: <AdminEntityLink kind="drama" id={detail.project_id} label={detail.project_title ?? undefined} />,
            },
            { label: m.drama.colGenerationStatus, value: formatDramaGenerationStatus(detail.generation_status) },
            {
              label: m.common.fields.createdAt,
              value: detail.created_at ? new Date(detail.created_at).toLocaleString() : "—",
            },
            {
              label: m.common.fields.updatedAt,
              value: detail.updated_at ? new Date(detail.updated_at).toLocaleString() : "—",
            },
          ]}
        />
      </AdminDetailSection>

      {detail.params ? (
        <AdminDetailSection title={m.drama.paramsJson}>
          <pre className="admin-json-preview">{JSON.stringify(detail.params, null, 2)}</pre>
        </AdminDetailSection>
      ) : null}
    </div>
  );
}
