/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  /**
   * Origin của site, không có dấu `/` cuối (ví dụ `https://example.vn`).
   * Để trống khi chưa có domain. Xem `frontend/.env.production.example`.
   */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
