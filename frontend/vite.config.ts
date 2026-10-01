import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      /**
       * `.kilo/` chứa hồ sơ trình duyệt headless của `scripts/visual-audit.mjs`.
       * Edge giữ khoá file `Local State*.tmp` trong đó, Vite thử watch rồi nhận
       * `EBUSY` và **tự tắt cả dev server** — không phải lỗi của mã nguồn ứng dụng.
       * Bỏ qua thư mục công cụ khỏi watcher.
       */
      ignored: ['**/.kilo/**'],
    },
  },
})