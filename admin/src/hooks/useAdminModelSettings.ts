import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminModelSettings } from "@/api/client";
import { useI18n } from "@/i18n";

// 加载 / 保存管理端 flat 配置（DB 覆盖 env）
export function useAdminModelSettings() {
  const { t } = useI18n();
  const [form, setForm] = useState<AdminModelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setForm(await api<AdminModelSettings>("/api/admin/settings/models"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.toast.loadConfigFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchField<K extends keyof AdminModelSettings>(key: K, value: AdminModelSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save(body: Record<string, unknown>, successMessage?: string) {
    setSaving(true);
    try {
      await api("/api/admin/settings/models", { method: "PATCH", body: JSON.stringify(body) });
      await load();
      toast.success(successMessage ?? t("common.toast.configSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return { form, loading, saving, load, patchField, save };
}
