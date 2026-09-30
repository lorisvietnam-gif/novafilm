/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  /**
   * Origin của site, không có dấu `/` cuối (ví dụ `https://example.vn`).
   * Để trống khi chưa có domain. Xem `frontend/.env.production.example`.
   */
  readonly VITE_SITE_URL?: string
  /**
   * Link mời vào cộng đồng Discord (ví dụ `https://discord.gg/xxxx`).
   * Để trống khi chưa có server — nút Discord ẩn hẳn. Xem `src/lib/siteLinks.ts`.
   */
  readonly VITE_DISCORD_INVITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
