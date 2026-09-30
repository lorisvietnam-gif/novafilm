import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminModelSettings } from "@/api/client";
import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsStatusBar,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";

// 运行参数配置（并发、质量、Mock 等 flat 字段）
export function RuntimeSettingsPanel() {
  const { m, t } = useI18n();
  const [form, setForm] = useState<AdminModelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<AdminModelSettings>("/api/admin/settings/models");
      setForm(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.runtimeLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusItems = useMemo(
    () =>
      (form?.readiness ?? []).map((item) => ({
        id: item.capability,
        label: item.label,
        ready: item.ready,
        readyText: item.model || m.settings.ready,
        pendingText: m.settings.notReady,
      })),
    [form?.readiness, m.settings],
  );

  function patchField<K extends keyof AdminModelSettings>(key: K, value: AdminModelSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      const body = {
        ark_image_size: form.ark_image_size,
        ark_video_resolution: form.ark_video_resolution,
        ark_video_ratio: form.ark_video_ratio,
        seedance_duration_min: form.seedance_duration_min,
        seedance_duration_max: form.seedance_duration_max,
        ark_video_poll_interval: form.ark_video_poll_interval,
        ark_video_poll_timeout: form.ark_video_poll_timeout,
        pipeline_image_concurrency: form.pipeline_image_concurrency,
        pipeline_video_concurrency: form.pipeline_video_concurrency,
        pipeline_audio_concurrency: form.pipeline_audio_concurrency,
        task_runtime_max_concurrency: form.task_runtime_max_concurrency,
        task_user_max_concurrency: form.task_user_max_concurrency,
        task_poll_max_concurrency: form.task_poll_max_concurrency,
        drama_user_video_job_limit: form.drama_user_video_job_limit,
        drama_fragment_max_attempts: form.drama_fragment_max_attempts,
        ark_mock: form.ark_mock,
      };
      await api("/api/admin/settings/models", { method: "PATCH", body: JSON.stringify(body) });
      await load();
      toast.success(t("settings.runtimeSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  return (
    <SettingsTabShell onSave={() => void handleSave()} saving={saving}>
      <SettingsStatusBar
        title={m.settings.runtimeReadyTitle}
        items={
          statusItems.length > 0
            ? statusItems
            : [
                {
                  id: "empty",
                  label: m.settings.runtimeEmptyLabel,
                  ready: false,
                  pendingText: m.settings.runtimeEmptyHint,
                },
              ]
        }
        extra={
          <span className="settings-status-extra">
            {form.readiness?.every((item) => item.ready)
              ? m.settings.runtimeAllReady
              : m.settings.runtimeNeedKey}
          </span>
        }
      />

      <div className="settings-routing-grid">
        <SettingsPanel
          className="settings-panel--compact"
          title={m.settings.runtimeQaTitle}
          description={m.settings.runtimeQaDesc}
        >
          <div className="settings-field-grid">
            <LabeledControl label={m.settings.defaultImageSize}>
              <input
                className="settings-input"
                value={form.ark_image_size}
                onChange={(e) => patchField("ark_image_size", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.defaultVideoResolution}>
              <input
                className="settings-input"
                value={form.ark_video_resolution}
                onChange={(e) => patchField("ark_video_resolution", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.defaultVideoRatio}>
              <input
                className="settings-input"
                value={form.ark_video_ratio}
                onChange={(e) => patchField("ark_video_ratio", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.seedanceMinDuration}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.seedance_duration_min}
                onChange={(e) => patchField("seedance_duration_min", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.seedanceMaxDuration}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.seedance_duration_max}
                onChange={(e) => patchField("seedance_duration_max", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.videoPollInterval}>
              <input
                className="settings-input"
                type="number"
                step="0.5"
                value={form.ark_video_poll_interval}
                onChange={(e) => patchField("ark_video_poll_interval", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.videoPollTimeout}>
              <input
                className="settings-input"
                type="number"
                value={form.ark_video_poll_timeout}
                onChange={(e) => patchField("ark_video_poll_timeout", Number(e.target.value))}
              />
            </LabeledControl>
          </div>
        </SettingsPanel>

        <SettingsPanel
          className="settings-panel--compact"
          title={m.settings.runtimeLimitsTitle}
          description={m.settings.runtimeLimitsDesc}
        >
          <div className="settings-field-grid">
            <LabeledControl label={m.settings.imageConcurrency}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.pipeline_image_concurrency}
                onChange={(e) => patchField("pipeline_image_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.videoConcurrency}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.pipeline_video_concurrency}
                onChange={(e) => patchField("pipeline_video_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.audioConcurrency}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.pipeline_audio_concurrency}
                onChange={(e) => patchField("pipeline_audio_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.globalSlots}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.task_runtime_max_concurrency}
                onChange={(e) => patchField("task_runtime_max_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.perUserSlots}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.task_user_max_concurrency}
                onChange={(e) => patchField("task_user_max_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.selectorConcurrency}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.task_poll_max_concurrency}
                onChange={(e) => patchField("task_poll_max_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.perUserDramaJobs}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.drama_user_video_job_limit}
                onChange={(e) => patchField("drama_user_video_job_limit", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.fragmentMaxAttempts}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.drama_fragment_max_attempts}
                onChange={(e) => patchField("drama_fragment_max_attempts", Number(e.target.value))}
              />
            </LabeledControl>
          </div>
          <div className="settings-toggle-row mt-3">
            <div>
              <strong>{m.settings.mockTitle}</strong>
              <span>{m.settings.mockDesc}</span>
            </div>
            <Switch checked={form.ark_mock} onCheckedChange={(v) => patchField("ark_mock", v)} />
          </div>
        </SettingsPanel>
      </div>

      <SettingsPanel
        className="settings-panel--compact"
        title={m.settings.runtimeSummaryTitle}
        description={m.settings.runtimeSummaryDesc}
      >
        <div className="settings-runtime-summary">
          <div className="settings-runtime-summary-row">
            <Activity className="h-4 w-4 text-[var(--admin-forest)]" />
            <span>
              {t("settings.slotsSummary", {
                worker: form.task_runtime_max_concurrency,
                perUser: form.task_user_max_concurrency,
              })}
            </span>
          </div>
          <p className="settings-runtime-summary-hint">
            {t("settings.selectorHint", { count: form.task_poll_max_concurrency })}
          </p>
        </div>
      </SettingsPanel>
    </SettingsTabShell>
  );
}
