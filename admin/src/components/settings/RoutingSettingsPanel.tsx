import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminRoutingSettings } from "@/api/client";
import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsSurface,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import {
  allPresetChannelModels,
  CAPABILITY_ORDER,
  clampDefaultToPreset,
  defaultPresetDefaults,
  detectDefaultRemaps,
  modelCapabilityLabel,
  PRESET_MODELS,
  type ModelCapability,
} from "@/lib/tokenfreeRecommendedModels";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const TOKENFREE_CHANNEL_ID = "tokenfree";
const TOKENFREE_BASE_URL = "https://www.tokenfree.com/v1";
const TOKENFREE_CONSOLE_URL = "https://www.tokenfree.com/channels";

const DEFAULT_KEYS = ["text_model", "image_model", "video_model", "audio_model"] as const;

type SettingsMessages = ReturnType<typeof useI18n>["m"]["settings"];

/** "API Key" là thuật ngữ kỹ thuật, giữ nguyên ở mọi ngôn ngữ */
function buildReadiness(data: AdminRoutingSettings | null, hasKey: boolean, s: SettingsMessages) {
  const defaults = data?.default_models;
  return [
    { id: "secret", label: "API Key", ready: hasKey },
    { id: "text", label: s.capabilityText, ready: Boolean(defaults?.text_model) },
    { id: "image", label: s.capabilityImage, ready: Boolean(defaults?.image_model) },
    { id: "video", label: s.capabilityVideo, ready: Boolean(defaults?.video_model) },
    { id: "audio", label: s.capabilityAudio, ready: Boolean(defaults?.audio_model) },
  ] as const;
}

function normalizeDefaults(raw: AdminRoutingSettings["default_models"] | undefined) {
  const base = defaultPresetDefaults();
  return {
    text_model: clampDefaultToPreset("text", raw?.text_model || base.text_model),
    image_model: clampDefaultToPreset("image", raw?.image_model || base.image_model),
    video_model: clampDefaultToPreset("video", raw?.video_model || base.video_model),
    audio_model: clampDefaultToPreset("audio", raw?.audio_model || base.audio_model),
  };
}

// 开源版模型配置：固定 TokenFree + 四类预设下拉
export function RoutingSettingsPanel() {
  const { m, t } = useI18n();
  const [data, setData] = useState<AdminRoutingSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultRemaps, setDefaultRemaps] = useState<
    Array<{ capability: ModelCapability; from: string; to: string }>
  >([]);

  const channel = data?.system_channels.find((item) => item.id === TOKENFREE_CHANNEL_ID) ?? data?.system_channels[0];
  const hasSavedKey = Boolean(channel?.has_api_key);
  const hasKey = hasSavedKey || Boolean(apiKeyInput.trim());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<AdminRoutingSettings>("/api/admin/settings/routing");
      setDefaultRemaps(detectDefaultRemaps(res.default_models));
      setData({
        ...res,
        default_models: normalizeDefaults(res.default_models),
        system_channels: res.system_channels.map((item) =>
          item.id === TOKENFREE_CHANNEL_ID
            ? { ...item, models: allPresetChannelModels() }
            : item,
        ),
      });
      setApiKeyInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.routingLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const readiness = buildReadiness(data, hasKey, m.settings);

  function setDefaultModel(key: (typeof DEFAULT_KEYS)[number], value: string) {
    const cap = key.replace("_model", "") as ModelCapability;
    const next = clampDefaultToPreset(cap, value);
    setData((prev) =>
      prev
        ? {
            ...prev,
            default_models: { ...prev.default_models, [key]: next },
          }
        : prev,
    );
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      const defaults = normalizeDefaults(data.default_models);
      const res = await api<{ settings: AdminRoutingSettings }>("/api/admin/settings/routing", {
        method: "PATCH",
        body: JSON.stringify({
          system_channels: [
            {
              id: TOKENFREE_CHANNEL_ID,
              name: "TokenFree New API",
              base_url: TOKENFREE_BASE_URL,
              api_key: apiKeyInput.trim() || undefined,
              api_format: "openai",
              protocol: "auto",
              models: allPresetChannelModels(),
              enabled: true,
              sort_order: 0,
            },
          ],
          default_models: defaults,
        }),
      });
      setData({
        ...res.settings,
        default_models: normalizeDefaults(res.settings.default_models),
      });
      setDefaultRemaps([]);
      setApiKeyInput("");
      setDefaultRemaps([]);
      setApiKeyInput("");
      toast.success(t("settings.routingSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <SettingsLoading label={t("settings.routingLoading")} />;
  }

  return (
    <SettingsTabShell onSave={() => void handleSave()} saving={saving}>
      <SettingsSurface className="settings-readiness-bar">
        <div className="settings-readiness-title">{m.settings.routingReadyTitle}</div>
        <div className="settings-readiness-row">
          {readiness.map((item) => (
            <div key={item.id} className={cn("settings-readiness-item", item.ready && "is-ready")}>
              <span className={cn("settings-readiness-dot", item.ready ? "is-on" : "is-off")} />
              <span>{item.label}</span>
              <em>{item.ready ? m.settings.ready : m.settings.notReady}</em>
            </div>
          ))}
        </div>
      </SettingsSurface>

      {(data?.validation_errors.length ?? 0) > 0 ? (
        <SettingsSurface className="border-[#fde2e2] bg-[#fef0f0]">
          <div className="text-xs font-medium text-[#f56c6c]">{m.settings.validation}</div>
          <ul className="mt-1 space-y-0.5 text-xs text-[#f56c6c]">
            {data?.validation_errors.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </SettingsSurface>
      ) : null}

      {defaultRemaps.length > 0 ? (
        <SettingsSurface className="border-[#faecd8] bg-[#fdf6ec]">
          <div className="text-xs font-medium text-[#e6a23c]">{m.settings.routingRemapTitle}</div>
          <ul className="mt-1 space-y-0.5 text-xs text-[#b88230]">
            {defaultRemaps.map((item) => (
              <li key={`${item.capability}-${item.from}`}>
                · {modelCapabilityLabel(item.capability)}：
                <code className="mx-1">{item.from}</code>→
                <code className="mx-1">{item.to}</code>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-[#909399]">{m.settings.routingRemapHint}</p>
        </SettingsSurface>
      ) : null}

      <SettingsPanel
        title="TokenFree New API"
        description={m.settings.routingPanelDesc}
      >
        <div className="settings-field-grid">
          <LabeledControl label={m.settings.routingEndpoint} className="settings-field-span-full">
            <input className="settings-input" value={TOKENFREE_BASE_URL} readOnly />
            <p className="mt-1 text-xs text-[#909399]">
              {m.settings.console}
              <a className="ml-1 text-[#409eff] hover:underline" href={TOKENFREE_CONSOLE_URL} target="_blank" rel="noreferrer">
                {TOKENFREE_CONSOLE_URL}
              </a>
            </p>
          </LabeledControl>
          <LabeledControl
            label="API Key"
            hint={hasSavedKey ? m.settings.routingKeySavedHint : m.settings.routingKeyMissingHint}
            className="settings-field-span-full"
          >
            <div className="settings-secret-row">
              <input
                className="settings-input is-secret"
                type="password"
                placeholder={
                  hasSavedKey
                    ? m.settings.routingKeySavedPlaceholder
                    : m.settings.routingKeyPastePlaceholder
                }
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              {apiKeyInput ? (
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary settings-mini-btn"
                  onClick={() => setApiKeyInput("")}
                >
                  {m.settings.clear}
                </button>
              ) : null}
            </div>
          </LabeledControl>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title={m.settings.routingDefaultsTitle}
        description={m.settings.routingDefaultsDesc}
      >
        <div className="settings-field-grid settings-field-grid--2">
          {CAPABILITY_ORDER.map((cap) => {
            const key = `${cap}_model` as (typeof DEFAULT_KEYS)[number];
            const options = PRESET_MODELS[cap];
            return (
              <LabeledControl key={key} label={modelCapabilityLabel(cap)}>
                <select
                  className="settings-select"
                  value={data?.default_models[key] ?? options[0]?.id ?? ""}
                  onChange={(e) => setDefaultModel(key, e.target.value)}
                >
                  {options.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </LabeledControl>
            );
          })}
        </div>
      </SettingsPanel>
    </SettingsTabShell>
  );
}
