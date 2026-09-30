import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsStatusBar,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";
import { useI18n } from "@/i18n";

/** 站点公网地址与媒体工具路径 */
export function SiteSettingsPanel() {
  const { m } = useI18n();
  const { form, loading, saving, patchField, save } = useAdminModelSettings();

  async function handleSave() {
    if (!form) return;
    await save(
      {
        public_base_url: form.public_base_url,
        ffmpeg_path: form.ffmpeg_path,
        ffprobe_path: form.ffprobe_path,
      },
      m.settings.siteSaved,
    );
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  const hasPublic = Boolean(form.public_base_url?.trim());
  const hasFfmpeg = Boolean(form.ffmpeg_path?.trim());
  const hasFfprobe = Boolean(form.ffprobe_path?.trim());

  return (
    <SettingsTabShell onSave={() => void handleSave()} saving={saving}>
      <SettingsStatusBar
        title={m.settings.siteReadyTitle}
        items={[
          {
            id: "public",
            label: m.settings.sitePublicUrl,
            ready: hasPublic,
            readyText: m.settings.ready,
            pendingText: m.settings.siteNotFilled,
          },
          {
            id: "ffmpeg",
            label: "ffmpeg",
            ready: hasFfmpeg,
            readyText: form.ffmpeg_path || m.settings.ready,
            pendingText: m.settings.useDefaultPath,
          },
          {
            id: "ffprobe",
            label: "ffprobe",
            ready: hasFfprobe,
            readyText: form.ffprobe_path || m.settings.ready,
            pendingText: m.settings.useDefaultPath,
          },
        ]}
      />

      <div className="settings-routing-grid">
        <SettingsPanel
          className="settings-panel--compact"
          title={m.settings.sitePanelPublicTitle}
          description={m.settings.sitePanelPublicDesc}
        >
          <div className="settings-field-grid">
            <LabeledControl
              label={m.settings.siteBackendBase}
              hint={m.settings.siteBackendBaseHint}
              className="settings-field-span-full"
            >
              <input
                className="settings-input"
                value={form.public_base_url}
                onChange={(e) => patchField("public_base_url", e.target.value)}
              />
            </LabeledControl>
          </div>
          <p className="settings-panel-footnote">{m.settings.siteInfraNote}</p>
        </SettingsPanel>

        <SettingsPanel
          className="settings-panel--compact"
          title={m.settings.siteMediaTitle}
          description={m.settings.siteMediaDesc}
        >
          <div className="settings-field-grid">
            <LabeledControl label={m.settings.ffmpegPath}>
              <input
                className="settings-input"
                placeholder="ffmpeg"
                value={form.ffmpeg_path}
                onChange={(e) => patchField("ffmpeg_path", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label={m.settings.ffprobePath}>
              <input
                className="settings-input"
                placeholder="ffprobe"
                value={form.ffprobe_path}
                onChange={(e) => patchField("ffprobe_path", e.target.value)}
              />
            </LabeledControl>
          </div>
        </SettingsPanel>
      </div>
    </SettingsTabShell>
  );
}
