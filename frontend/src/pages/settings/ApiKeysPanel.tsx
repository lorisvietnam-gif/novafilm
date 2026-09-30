import { useCallback, useEffect, useState } from 'react'
import { apiKeysApi, getPublicApiBase, type ApiKeyItem } from '../../api/apiKeys'
import { dialog } from '../../lib/dialog'
import { useI18n } from '../../i18n'
import { getActiveLocale } from '../../i18n/detect'

/** 格式化时间 */
function formatWhen(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  // Ngôn ngữ phải theo giao diện: trước đây hard-code `zh-CN` nên ngày hiện
  // theo kiểu Trung Quốc kể cả khi người dùng chọn `en` hay `vi`.
  return d.toLocaleString(getActiveLocale(), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 设置页 API：Key 管理与调用文档 */
export default function ApiKeysPanel() {
  const { t } = useI18n()
  /*
   * keys Key 列表
   * name 新建名称
   * busy 提交中
   * error 错误
   * createdSecret 刚创建的一次性 secret
   */
  const [keys, setKeys] = useState<ApiKeyItem[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createdSecret, setCreatedSecret] = useState('')

  const base = getPublicApiBase()

  // `t` chỉ đổi identity khi đổi ngôn ngữ, nên effect chạy lại đúng một lần mỗi lần
  // đổi locale — không lặp vô hạn.
  const reload = useCallback(async () => {
    setError('')
    try {
      setKeys(await apiKeysApi.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('apiKeys.loadFailed'))
    }
  }, [t])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleCreate() {
    if (busy) return
    setBusy(true)
    setError('')
    setCreatedSecret('')
    try {
      const row = await apiKeysApi.create(name.trim() || t('apiKeys.defaultName'))
      setCreatedSecret(row.secret)
      setName('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('apiKeys.createFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(item: ApiKeyItem) {
    const ok = await dialog.confirm({
      title: t('apiKeys.revokeTitle'),
      message: t('apiKeys.revokeMessage', { name: item.name, prefix: item.key_prefix }),
      confirmText: t('apiKeys.revokeConfirm'),
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await apiKeysApi.revoke(item.id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('apiKeys.revokeFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="pf-settings-card">
      <h1>{t('apiKeys.title')}</h1>
      <p className="pf-muted">{t('apiKeys.lead')}</p>

      <div className="pf-api-create">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('apiKeys.namePlaceholder')}
          maxLength={64}
        />
        <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" disabled={busy} onClick={() => void handleCreate()}>
          {busy ? t('apiKeys.creating') : t('apiKeys.create')}
        </button>
      </div>

      {createdSecret ? (
        <div className="pf-api-secret">
          <p>
            <strong>{t('apiKeys.secretNotice')}</strong>
          </p>
          <code>{createdSecret}</code>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => void copyText(createdSecret)}>
            {t('apiKeys.copyKey')}
          </button>
        </div>
      ) : null}

      {error ? <p className="pf-error">{error}</p> : null}

      {keys.length > 0 ? (
        <ul className="pf-settings-list pf-api-key-list">
          {keys.map((item) => (
            <li key={item.id}>
              <div className="pf-settings-list-row">
                <span className="pf-settings-list-main">
                  <strong>{item.name}</strong>
                  <em className="pf-muted">
                    {item.key_prefix}… · {t('apiKeys.createdAt', { when: formatWhen(item.created_at) })}
                    {item.last_used_at
                      ? ` · ${t('apiKeys.lastUsedAt', { when: formatWhen(item.last_used_at) })}`
                      : ''}
                  </em>
                </span>
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm"
                  disabled={busy}
                  onClick={() => void handleRevoke(item)}
                >
                  {t('apiKeys.revoke')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="pf-settings-empty">
          <p>{t('apiKeys.empty')}</p>
        </div>
      )}

      <div className="pf-api-docs">
        <h3>{t('apiKeys.docsHeading')}</h3>
        <p className="pf-muted">{t('apiKeys.docsAuth')}</p>
        <pre>{`Authorization: Bearer pf_live_...\nX-Api-Key: pf_live_...`}</pre>

        <p className="pf-muted">{t('apiKeys.docsImage')}</p>
        <pre>{`POST ${base}/api/v1/images/generations
Content-Type: application/json

{
  "prompt": "cyberpunk city at night",
  "ratio": "16:9",
  "image_url": null
}`}</pre>

        <p className="pf-muted">{t('apiKeys.docsVideo')}</p>
        <pre>{`POST ${base}/api/v1/videos/generations

{
  "prompt": "the camera pushes in slowly, neon flickering",
  "image_url": "https://.../first_frame.jpg",
  "duration": 5,
  "resolution": "480p"
}`}</pre>

        <p className="pf-muted">{t('apiKeys.docsRelay')}</p>
        <pre>{`POST ${base}/api/v1/seedance/tasks

{
  "content": [
    { "type": "text", "text": "describe the shot..." },
    { "type": "image_url", "image_url": { "url": "https://..." }, "role": "first_frame" }
  ],
  "duration": 5,
  "resolution": "480p"
}`}</pre>

        <p className="pf-muted">{t('apiKeys.docsTask')}</p>
        <pre>{`GET ${base}/api/v1/tasks/{task_id}`}</pre>
      </div>
    </section>
  )
}
