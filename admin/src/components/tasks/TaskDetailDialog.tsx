import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Ban, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminTaskDetail } from "@/api/client";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminModal } from "@/components/admin/AdminModal";
import { Button } from "@/components/ui/button";
import { billingBasisLabel, taskDomainLabel, taskStatusLabel, taskTypeLabel } from "@/lib/statusLabels";
import { hasJsonContent, prettyJson } from "@/lib/jsonPreview";
import { cn, fenToYuan } from "@/lib/utils";
import { getActiveLocale, useI18n } from "@/i18n";
import { messages } from "@/i18n/messages";

type TaskDetailDialogProps = {
  taskId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled?: () => void;
};

type DetailTab = "overview" | "billing" | "steps" | "events" | "json";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

/** Thứ tự trường payload hiển thị; giá trị lấy từ bảng nhãn trong cây pack */
const PAYLOAD_FIELD_KEYS = [
  "prompt",
  "name",
  "kind",
  "model_id",
  "image_style_id",
  "aspect_ratio",
  "resolution",
  "duration_sec",
  "duration",
  "force",
  "total",
  "project_id",
  "user_id",
  "asset_id",
  "episode_count",
  "phase",
  "sync",
  "refresh_prompts",
  "reextract_props",
] as const;

// 格式化时间为本地字符串
function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

// 美化 JSON 展示
function fmtJson(value: unknown): string {
  return prettyJson(value);
}

// 状态 pill 样式
function statusClass(status: string): string {
  if (status === "running" || status === "leased") return "is-run";
  if (status === "succeeded") return "is-done";
  if (status === "failed") return "is-fail";
  if (status === "cancelled" || status === "cancel_requested") return "is-warn";
  return "is-warn";
}

// 仅在有值时渲染一行定义列表项
function DlRow({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === "" || children === "—") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// DlRow 未渲染时 children 仍是元素描述符；按 props 判断是否会出内容。
function dlRowWillShow(child: ReactNode): boolean {
  if (child == null || child === false) return false;
  if (!isValidElement(child)) return Boolean(child);
  if (child.type !== DlRow) return true;
  const c = (child.props as { children?: ReactNode }).children;
  return c != null && c !== "" && c !== "—";
}

// 有内容才包一层 section，避免「标识」等空壳标题
function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  const visible = Children.toArray(children).filter(dlRowWillShow);
  if (visible.length === 0) return null;
  return (
    <section className="task-detail-section">
      <h4>{title}</h4>
      <dl className="task-detail-dl">{visible}</dl>
    </section>
  );
}

// 从 payload 抽出可读字段摘要（其余仍看下方 JSON）
function payloadSummaryRows(
  payload: Record<string, unknown> | null | undefined,
): Array<{ key: string; label: string; value: string }> {
  if (!payload || typeof payload !== "object") return [];
  const locale = getActiveLocale();
  const fieldLabels = messages[locale].labels.payloadField;
  const yes = messages[locale].common.fields.yes;
  const no = messages[locale].common.fields.no;
  const rows: Array<{ key: string; label: string; value: string }> = [];
  for (const key of PAYLOAD_FIELD_KEYS) {
    if (!(key in payload)) continue;
    const raw = payload[key];
    if (raw == null || raw === "") continue;
    if (typeof raw === "boolean") {
      rows.push({ key, label: fieldLabels[key], value: raw ? yes : no });
      continue;
    }
    const text = String(raw).trim();
    if (!text) continue;
    rows.push({ key, label: fieldLabels[key], value: text.length > 240 ? `${text.slice(0, 240)}…` : text });
  }
  return rows;
}

// 任务详情弹窗：概览 / 步骤 / 事件 / 原始 JSON
export function TaskDetailDialog({ taskId, open, onOpenChange, onCancelled }: TaskDetailDialogProps) {
  const { m, t } = useI18n();
  const [task, setTask] = useState<AdminTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [cancelling, setCancelling] = useState(false);

  async function loadDetail(id: number) {
    setLoading(true);
    try {
      setTask(await api<AdminTaskDetail>(`/api/admin/tasks/${id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tasks.loadFailed"));
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !taskId) {
      setTask(null);
      setTab("overview");
      return;
    }
    void loadDetail(taskId);
  }, [open, taskId]);

  const canCancel = useMemo(() => {
    if (!task) return false;
    return task.cancelable && !TERMINAL.has(task.status);
  }, [task]);

  const waitingChain = useMemo(() => {
    if (!task) return false;
    return task.status === "pending" && !task.next_action_at && Boolean(task.batch_key);
  }, [task]);

  const payloadRows = useMemo(() => payloadSummaryRows(task?.payload ?? null), [task?.payload]);

  async function handleCancel() {
    if (!task || !canCancel) return;
    if (!window.confirm(t("tasks.cancelConfirm", { id: task.id }))) return;
    setCancelling(true);
    try {
      const updated = await api<AdminTaskDetail>(`/api/admin/tasks/${task.id}/cancel`, { method: "POST" });
      setTask(updated);
      toast.success(t("tasks.cancelRequestSent"));
      onCancelled?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tasks.cancelFailed"));
    } finally {
      setCancelling(false);
    }
  }

  const title = task ? t("tasks.titleWithId", { id: task.id, domain: taskDomainLabel(task.domain) }) : m.tasks.title;

  return (
    <AdminModal
      open={open}
      onOpenChange={onOpenChange}
      size="full"
      className="task-detail-modal max-h-[90vh]"
      bodyClassName="p-0 overflow-hidden"
      title={title}
      subtitle={
        task ? (
          <span className="font-mono text-xs">
            {taskTypeLabel(task.task_type)}
            {task.user_email ? ` · ${task.user_email}` : ""}
          </span>
        ) : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {m.tasks.close}
          </Button>
          {taskId ? (
            <Button variant="outline" disabled={loading} onClick={() => void loadDetail(taskId)}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              {m.common.action.refresh}
            </Button>
          ) : null}
          {canCancel ? (
            <Button variant="destructive" disabled={cancelling} onClick={() => void handleCancel()}>
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
              {m.tasks.cancelTask}
            </Button>
          ) : null}
        </>
      }
    >
      {loading && !task ? (
        <div className="task-detail-loading">
          <Loader2 className="h-6 w-6 animate-spin text-[#67c23a]" />
          <span>{m.tasks.loading}</span>
        </div>
      ) : task ? (
        <div className="task-detail-body">
          <div className="task-detail-tabs" role="tablist">
            {(
              [
                ["overview", m.tasks.tabOverview],
                ["billing", t("tasks.tabBilling", { count: task.usage_lines?.length ?? 0 })],
                ["steps", t("tasks.tabSteps", { count: task.steps?.length ?? 0 })],
                ["events", t("tasks.tabEvents", { count: task.events?.length ?? 0 })],
                ["json", m.tasks.tabJson],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                className={cn("task-detail-tab", tab === key && "is-active")}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="task-detail-panel">
            {tab === "overview" ? (
              <div className="task-detail-grid">
                <section className="task-detail-section">
                  <h4>{m.tasks.sectionStatus}</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`admin-status-pill ${statusClass(task.status)}`}>
                      {taskStatusLabel(task.status)}
                    </span>
                    <span className="text-sm text-[#606266]">
                      {t("tasks.progress", { value: task.progress_percent })}
                    </span>
                    {waitingChain ? (
                      <span className="admin-status-pill is-warn">{m.tasks.waitingChain}</span>
                    ) : null}
                  </div>
                  {task.current_step_key ? (
                    <p className="task-detail-meta">
                      {t("tasks.currentStep", {
                        key: task.current_step_key,
                        status: task.current_step_status ?? "",
                      })}
                    </p>
                  ) : null}
                  {task.error_code || task.error_message ? (
                    <pre className="task-detail-error">
                      {[task.error_code, task.error_message].filter(Boolean).join(" · ")}
                    </pre>
                  ) : null}
                </section>

                <DetailSection title={m.tasks.sectionSchedule}>
                  <DlRow label={m.tasks.priority}>{task.priority}</DlRow>
                  <DlRow label="scheduled_at">{task.scheduled_at ? fmtTime(task.scheduled_at) : null}</DlRow>
                  <DlRow label="next_action_at">{task.next_action_at ? fmtTime(task.next_action_at) : null}</DlRow>
                  <DlRow label={m.tasks.leaseUntil}>{task.lease_until ? fmtTime(task.lease_until) : null}</DlRow>
                  <DlRow label="provider_task_id">
                    {task.provider_task_id ? (
                      <span className="font-mono text-xs break-all">{task.provider_task_id}</span>
                    ) : null}
                  </DlRow>
                </DetailSection>

                <DetailSection title={m.tasks.sectionEntities}>
                  <DlRow label={m.common.fields.user}>
                    <AdminEntityLink kind="user" id={task.requested_by} label={task.user_email ?? undefined} />
                  </DlRow>
                  <DlRow label={m.tasks.dramaProject}>
                    {task.drama_project_id ? <AdminEntityLink kind="drama" id={task.drama_project_id} /> : null}
                  </DlRow>
                  <DlRow label={m.tasks.asset}>
                    {task.asset_id ? <AdminEntityLink kind="drama_asset" id={task.asset_id} /> : null}
                  </DlRow>
                  <DlRow label={m.tasks.script}>{task.script_id ? `#${task.script_id}` : null}</DlRow>
                  <DlRow label={m.tasks.episode}>{task.episode_id ? `#${task.episode_id}` : null}</DlRow>
                  <DlRow label={m.tasks.fragment}>{task.fragment_id ? `#${task.fragment_id}` : null}</DlRow>
                  <DlRow label={m.tasks.kepuProject}>
                    {task.project_id ? <AdminEntityLink kind="project" id={task.project_id} /> : null}
                  </DlRow>
                  <DlRow label={m.tasks.shot}>{task.shot_id ? `#${task.shot_id}` : null}</DlRow>
                </DetailSection>

                <DetailSection title={m.tasks.sectionIdentity}>
                  <DlRow label="dedupe_key">
                    {task.dedupe_key ? <span className="font-mono text-xs break-all">{task.dedupe_key}</span> : null}
                  </DlRow>
                  <DlRow label="batch_key">
                    {task.batch_key ? <span className="font-mono text-xs break-all">{task.batch_key}</span> : null}
                  </DlRow>
                  <DlRow label="client_request_id">
                    {task.client_request_id ? (
                      <span className="font-mono text-xs break-all">{task.client_request_id}</span>
                    ) : null}
                  </DlRow>
                </DetailSection>

                <section className="task-detail-section task-detail-section--full">
                  <h4>{m.tasks.sectionTimeline}</h4>
                  <dl className="task-detail-dl task-detail-dl--inline">
                    <div>
                      <dt>{m.common.fields.createdAt}</dt>
                      <dd>{fmtTime(task.created_at)}</dd>
                    </div>
                    <div>
                      <dt>{m.tasks.started}</dt>
                      <dd>{fmtTime(task.started_at)}</dd>
                    </div>
                    <div>
                      <dt>{m.tasks.finished}</dt>
                      <dd>{fmtTime(task.finished_at)}</dd>
                    </div>
                    <div>
                      <dt>{m.tasks.updated}</dt>
                      <dd>{fmtTime(task.updated_at)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="task-detail-section task-detail-section--full">
                  <h4>{m.tasks.sectionPayload}</h4>
                  {payloadRows.length > 0 ? (
                    <dl className="task-detail-dl task-detail-dl--payload mb-3">
                      {payloadRows.map((row) => (
                        <div key={row.key}>
                          <dt>{row.label}</dt>
                          <dd className={row.key === "prompt" ? "whitespace-pre-wrap break-words" : "break-all"}>
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {hasJsonContent(task.payload) ? (
                    <pre className="task-detail-json">{fmtJson(task.payload)}</pre>
                  ) : (
                    <p className="task-detail-meta">{m.tasks.noPayload}</p>
                  )}
                </section>

                <section className="task-detail-section task-detail-section--full">
                  <h4>{m.tasks.sectionResult}</h4>
                  {hasJsonContent(task.result_payload) ? (
                    <pre className="task-detail-json">{fmtJson(task.result_payload)}</pre>
                  ) : (
                    <p className="task-detail-meta">{m.tasks.noResult}</p>
                  )}
                </section>
              </div>
            ) : null}

            {tab === "billing" ? (
              <div className="task-detail-grid">
                <section className="task-detail-section">
                  <h4>{m.tasks.billingSummary}</h4>
                  <dl className="task-detail-dl">
                    <div>
                      <dt>{m.tasks.billingStatus}</dt>
                      <dd>{task.billing_status ?? "none"}</dd>
                    </div>
                    <div>
                      <dt>{m.tasks.billingEstimate}</dt>
                      <dd>¥{fenToYuan(task.billing_estimate_fen ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>{m.tasks.billingCharged}</dt>
                      <dd>¥{fenToYuan(task.billing_charged_fen ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>{m.tasks.billingRefunded}</dt>
                      <dd>¥{fenToYuan(task.billing_refunded_fen ?? 0)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="task-detail-section task-detail-section--full">
                  <h4>{m.tasks.usageLines}</h4>
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{m.common.fields.time}</th>
                          <th>{m.common.fields.capability}</th>
                          <th>{m.common.fields.billingKey}</th>
                          <th>{m.common.fields.model}</th>
                          <th>{m.common.fields.tokens}</th>
                          <th>{m.common.fields.charge}</th>
                          <th>{m.common.fields.cost}</th>
                          <th>{m.common.fields.billingBasis}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(task.usage_lines?.length ?? 0) === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center text-sm text-[#909399]">
                              {m.tasks.noUsageLines}
                            </td>
                          </tr>
                        ) : (
                          task.usage_lines?.map((line) => (
                            <tr key={line.id}>
                              <td className="text-[11px] text-[#909399]">{fmtTime(line.created_at)}</td>
                              <td>{line.capability ?? "—"}</td>
                              <td className="font-mono text-xs">{line.billing_key}</td>
                              <td className="max-w-[120px] truncate text-xs">{line.model || "—"}</td>
                              <td>{line.total_tokens ?? 0}</td>
                              <td>¥{fenToYuan(line.charge_fen ?? 0)}</td>
                              <td>¥{fenToYuan(line.cost_fen ?? 0)}</td>
                              <td>{billingBasisLabel(line.billing_basis, line.estimated)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}

            {tab === "steps" ? (
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{m.tasks.colStep}</th>
                      <th>{m.common.fields.status}</th>
                      <th>{m.tasks.colAttempt}</th>
                      <th>{m.tasks.colProvider}</th>
                      <th>{m.tasks.colError}</th>
                      <th>{m.common.fields.time}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(task.steps?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-sm text-[#909399]">
                          {m.tasks.noSteps}
                        </td>
                      </tr>
                    ) : (
                      task.steps.map((step) => (
                        <tr key={step.id}>
                          <td>
                            <div className="font-mono text-xs">{step.step_key}</div>
                            <div className="text-[11px] text-[#909399]">{step.step_type}</div>
                          </td>
                          <td>
                            <span className={`admin-status-pill ${statusClass(step.status)}`}>
                              {taskStatusLabel(step.status)}
                            </span>
                          </td>
                          <td className="text-xs">{step.attempt_count}</td>
                          <td className="max-w-[140px] truncate font-mono text-[11px]" title={step.provider_task_id ?? ""}>
                            {step.provider_name ?? "—"}
                            {step.provider_task_id ? ` · ${step.provider_task_id}` : ""}
                          </td>
                          <td className="max-w-[200px] truncate text-[11px] text-[#f56c6c]" title={step.error_message ?? ""}>
                            {step.error_message ?? "—"}
                          </td>
                          <td className="text-[11px] text-[#909399]">
                            <div>{t("tasks.stepStarted", { time: fmtTime(step.started_at) })}</div>
                            <div>{t("tasks.stepFinished", { time: fmtTime(step.finished_at) })}</div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "events" ? (
              <div className="task-detail-events">
                {(task.events?.length ?? 0) === 0 ? (
                  <p className="text-sm text-[#909399]">{m.tasks.noEvents}</p>
                ) : (
                  [...(task.events ?? [])]
                    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
                    .map((ev) => (
                      <div key={ev.id} className="task-detail-event">
                        <div className="task-detail-event-head">
                          <span className="font-mono text-xs text-[#303133]">{ev.event_type}</span>
                          <span className="text-[11px] text-[#909399]">{fmtTime(ev.created_at)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#909399]">
                          {ev.status ? <span>status={ev.status}</span> : null}
                          {ev.phase ? <span>phase={ev.phase}</span> : null}
                        </div>
                        {ev.message ? <p className="mt-1 text-sm text-[#606266]">{ev.message}</p> : null}
                        {ev.payload ? (
                          <pre className="task-detail-json task-detail-json--compact">{fmtJson(ev.payload)}</pre>
                        ) : null}
                      </div>
                    ))
                )}
              </div>
            ) : null}

            {tab === "json" ? (
              <div className="space-y-4">
                <div>
                  <h4 className="task-detail-json-title">payload</h4>
                  <pre className="task-detail-json">{fmtJson(task.payload)}</pre>
                </div>
                <div>
                  <h4 className="task-detail-json-title">result_payload</h4>
                  <pre className="task-detail-json">{fmtJson(task.result_payload)}</pre>
                </div>
                <div>
                  <h4 className="task-detail-json-title">targets</h4>
                  <pre className="task-detail-json">{fmtJson(task.targets)}</pre>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </AdminModal>
  );
}
