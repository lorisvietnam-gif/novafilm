/** 全站右下角：Discord 社区入口（未配置邀请链接时不渲染） */
import { useI18n } from '../../i18n'
import { DISCORD_INVITE_URL } from '../../lib/siteLinks'

/** 简易 Discord 图标（内联 SVG，不引第三方图标包） */
function DiscordIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M20.32 4.37A19.79 19.79 0 0 0 15.43 2.86a.07.07 0 0 0-.08.04c-.21.37-.44.86-.6 1.25a18.3 18.3 0 0 0-5.49 0c-.16-.39-.41-.88-.62-1.25a.08.08 0 0 0-.08-.04A19.74 19.74 0 0 0 3.81 4.37a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.11 12.6 12.6 0 0 1-1.87-.89.08.08 0 0 1 0-.13c.12-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.92 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1 0 .13 12.3 12.3 0 0 1-1.88.89.08.08 0 0 0-.04.11c.36.7.77 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.17-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.41 2.16-2.41 1.21 0 2.18 1.09 2.16 2.41 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.41 2.15-2.41 1.21 0 2.18 1.09 2.16 2.41 0 1.34-.95 2.42-2.16 2.42Z" />
    </svg>
  )
}

export default function DiscordFab() {
  const { t } = useI18n()

  // 未配置邀请链接 = 社区还没开 => 整颗 FAB 不渲染，不给用户一个点了没反应的死按钮
  if (!DISCORD_INVITE_URL) return null

  return (
    <div className="pf-wx-fab-root">
      <a
        className="pf-wx-fab-btn"
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('discord.open')}
        title={t('discord.open')}
      >
        <DiscordIcon />
        <span className="pf-wx-fab-label">{t('discord.short')}</span>
      </a>
    </div>
  )
}
