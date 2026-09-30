import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminProject, type PageMeta } from "@/api/client";
import {
  AdminDetailMeta,
  AdminDetailNote,
  AdminDetailSection,
  AdminDetailStatGrid,
  AdminDetailTableWrap,
} from "@/components/admin/AdminDetailLayout";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminUserSearchSelect } from "@/components/admin/AdminUserSearchSelect";
import { PaginationBar } from "@/components/PaginationBar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page";
import { useAdminDetailQuery } from "@/hooks/useAdminDetailQuery";
import {
  projectStatusLabel,
  projectStatusOptions,
  shotStatusLabel,
  taskStatusLabel,
  taskTypeLabel,
} from "@/lib/statusLabels";
import { fenToYuan } from "@/lib/utils";
import { useI18n } from "@/i18n";

type ListRes = { items: AdminProject[]; meta: PageMeta };

function statusBadgeVariant(status: string): "destructive" | "success" | "warning" | "info" | "secondary" {
  if (status === "FAILED" || status === "REJECTED") return "destructive";
  if (status === "DONE") return "success";
  if (status === "CANCELLED") return "secondary";
  if (status === "DRAFT") return "secondary";
  return "info";
}

function mediaSrc(url: string | null | undefined): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

// 科普项目列表与详情（镜头 / 任务 / 费用 / 媒体预览）
export function ProjectsPage() {
  const { m, t } = useI18n();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListRes | null>(null);
  const [detail, setDetail] = useState<AdminProject | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const projectDetail = useAdminDetailQuery("open");

  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(DEFAULT_PAGE_SIZE) });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      if (userId) params.set("user_id", String(userId));
      setData(await api<ListRes>(`/api/admin/projects?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.toast.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function openDetail(id: number) {
    setDetailLoading(true);
    projectDetail.open(id);
    try {
      setDetail(await api<AdminProject>(`/api/admin/projects/${id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("projects.loadDetailFailed"));
      projectDetail.close();
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!projectDetail.id) {
      setDetail(null);
      return;
    }
    if (detail?.id === projectDetail.id) return;
    void openDetail(projectDetail.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDetail.id]);

  const usage = detail?.usage;

  return (
    <div className="admin-list-page">
      <PageHeader description={m.projects.description} />
      <AdminFilterBar>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {projectStatusOptions().map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Input
          placeholder={m.projects.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <AdminUserSearchSelect value={userId} onChange={(id) => setUserId(id)} />
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
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.common.fields.id}</TableHead>
              <TableHead>{m.common.fields.title}</TableHead>
              <TableHead>{m.common.fields.user}</TableHead>
              <TableHead>{m.common.fields.template}</TableHead>
              <TableHead>{m.common.fields.pipeline}</TableHead>
              <TableHead>{m.common.fields.status}</TableHead>
              <TableHead>{m.common.fields.progress}</TableHead>
              <TableHead>{m.common.fields.shotCount}</TableHead>
              <TableHead>{m.common.fields.charge}</TableHead>
              <TableHead>{m.common.fields.createdAt}</TableHead>
              <TableHead>{m.common.fields.updatedAt}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.id}</TableCell>
                <TableCell className="max-w-[180px] truncate">{p.title}</TableCell>
                <TableCell className="text-sm">
                  <AdminEntityLink kind="user" id={p.user_id} label={p.user_email ?? undefined} />
                </TableCell>
                <TableCell className="font-mono text-xs">{p.template_id}</TableCell>
                <TableCell className="text-xs">{p.pipeline_mode}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(p.status)}>{projectStatusLabel(p.status)}</Badge>
                </TableCell>
                <TableCell>{p.progress}%</TableCell>
                <TableCell>{p.shot_count}</TableCell>
                <TableCell>¥{fenToYuan(p.charge_fen ?? 0)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(p.updated_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => void openDetail(p.id)}>
                    {m.common.action.detail}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && (
        <PaginationBar
          page={data.meta.page}
          pageSize={data.meta.page_size}
          total={data.meta.total}
          onPageChange={setPage}
        />
      )}

      <AdminModal
        open={projectDetail.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            projectDetail.close();
          }
        }}
        size="full"
        title={
          detail
            ? `${t("projects.modalTitleWithId", { id: detail.id })} · ${detail.title}`
            : m.projects.modalTitle
        }
        subtitle={detail ? projectStatusLabel(detail.status) : detailLoading ? t("common.state.loading") : undefined}
        bodyClassName="space-y-3"
      >
        {detailLoading && !detail ? (
          <div className="py-10 text-center text-sm text-[var(--admin-muted)]">
            {t("common.state.loading")}
          </div>
        ) : null}
        {detail ? (
          <>
            <AdminDetailSection title={m.common.fields.basicInfo}>
              <AdminDetailMeta
                items={[
                  {
                    label: m.common.fields.user,
                    value: (
                      <AdminEntityLink
                        kind="user"
                        id={detail.user_id}
                        label={detail.user_email ?? undefined}
                      />
                    ),
                  },
                  {
                    label: m.projects.statusProgress,
                    value: t("projects.progressWithShots", {
                      status: projectStatusLabel(detail.status),
                      progress: detail.progress,
                      shots: detail.shot_count,
                    }),
                  },
                  { label: m.common.fields.template, value: detail.template_id },
                  { label: m.common.fields.pipeline, value: detail.pipeline_mode },
                  { label: m.common.fields.source, value: detail.source_type || "—" },
                  {
                    label: m.projects.resolutionRatio,
                    value: `${detail.resolution_mode || "—"} · ${detail.output_ratio || "—"}`,
                  },
                  { label: m.projects.voice, value: detail.voice_id || "—", full: true },
                ]}
              />
              <AdminDetailNote empty={!detail.error_msg} className="mt-3">
                {detail.error_msg || m.common.fields.noError}
              </AdminDetailNote>
            </AdminDetailSection>

            {(detail.cover_url || detail.final_video_url) ? (
              <AdminDetailSection title={m.common.fields.mediaPreview}>
                <div className="admin-detail-media">
                  {detail.cover_url ? (
                    <img src={mediaSrc(detail.cover_url)} alt={m.common.fields.cover} />
                  ) : null}
                  {detail.final_video_url ? (
                    <video src={mediaSrc(detail.final_video_url)} controls className="max-w-full" />
                  ) : null}
                </div>
              </AdminDetailSection>
            ) : null}

            <AdminDetailSection title={m.common.fields.costSummary}>
              <AdminDetailStatGrid
                items={[
                  { label: m.common.fields.charge, value: `¥${fenToYuan(usage?.charge_fen ?? detail.charge_fen ?? 0)}` },
                  { label: m.common.fields.cost, value: `¥${fenToYuan(usage?.cost_fen ?? 0)}` },
                  { label: m.common.fields.tokens, value: usage?.tokens ?? 0 },
                  {
                    label: m.projects.usageMix,
                    value: `${usage?.image_gens ?? 0}/${usage?.video_gens ?? 0}/${usage?.llm_calls ?? 0}/${usage?.tts_gens ?? 0}`,
                  },
                ]}
              />
            </AdminDetailSection>

            <AdminDetailSection title={t("projects.shotsSection", { count: (detail.shots ?? []).length })}>
              <AdminDetailTableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{m.common.fields.status}</th>
                      <th>{m.common.fields.duration}</th>
                      <th>{m.common.fields.image}</th>
                      <th>{m.common.fields.video}</th>
                      <th>{m.common.fields.audio}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.shots ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="!text-center text-[var(--admin-muted)]">
                          {m.projects.noShots}
                        </td>
                      </tr>
                    ) : (
                      (detail.shots ?? []).map((s) => (
                        <tr key={s.id}>
                          <td>{s.shot_no}</td>
                          <td>{shotStatusLabel(s.status)}</td>
                          <td>{s.duration}s</td>
                          <td>{s.has_image ? m.common.fields.has : "—"}</td>
                          <td>{s.has_video ? m.common.fields.has : "—"}</td>
                          <td>{s.has_audio ? m.common.fields.has : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </AdminDetailTableWrap>
            </AdminDetailSection>

            <AdminDetailSection
              title={t("projects.relatedTasksSection", { count: (detail.recent_tasks ?? []).length })}
            >
              <AdminDetailTableWrap className="max-h-[200px]">
                <table>
                  <thead>
                    <tr>
                      <th>{m.common.fields.id}</th>
                      <th>{m.common.fields.type}</th>
                      <th>{m.common.fields.status}</th>
                      <th>{m.projects.chargedOverEstimate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.recent_tasks ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
                          {m.projects.noTasks}
                        </td>
                      </tr>
                    ) : (
                      (detail.recent_tasks ?? []).map((task) => (
                        <tr key={task.id}>
                          <td>
                            <AdminEntityLink kind="task" id={task.id} />
                          </td>
                          <td>{taskTypeLabel(task.task_type)}</td>
                          <td>{taskStatusLabel(task.status)}</td>
                          <td>
                            ¥{fenToYuan(task.billing_charged_fen)} / ¥{fenToYuan(task.billing_estimate_fen)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </AdminDetailTableWrap>
            </AdminDetailSection>

            {detail.source_text ? (
              <AdminDetailSection title={m.common.fields.sourceText}>
                <AdminDetailNote>{detail.source_text}</AdminDetailNote>
              </AdminDetailSection>
            ) : null}
          </>
        ) : null}
      </AdminModal>
    </div>
  );
}
