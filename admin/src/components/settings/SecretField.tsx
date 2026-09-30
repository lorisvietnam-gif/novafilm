import { LabeledControl } from "@/components/settings/SettingsPanel";
import { useI18n } from "@/i18n";

type SecretFieldProps = {
  label: string;
  hint?: string;
  value: string;
  configured: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
};

// 密钥输入：留空不修改，支持清除已存密钥
export function SecretField({
  label,
  hint,
  value,
  configured,
  placeholder,
  onChange,
  onClear,
}: SecretFieldProps) {
  const { m } = useI18n();
  return (
    <LabeledControl
      label={label}
      hint={hint ?? (configured ? m.settings.secretConfiguredHint : undefined)}
    >
      <div className="admin-secret-field">
        <div className="admin-secret-field-row">
          <input
            type="password"
            className="settings-input is-secret"
            placeholder={
              placeholder ?? (configured ? m.settings.secretKeepPlaceholder : m.settings.secretFillPlaceholder)
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
          />
          {configured && onClear ? (
            <button type="button" className="admin-btn admin-btn-secondary settings-mini-btn" onClick={onClear}>
              {m.settings.clear}
            </button>
          ) : null}
        </div>
        {configured ? <span className="admin-secret-status">{m.settings.secretConfigured}</span> : null}
      </div>
    </LabeledControl>
  );
}
