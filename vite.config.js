import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000
  },
  test: {
    // engine/ is a separate package with its own toolchain and tests.
    exclude: [...configDefaults.exclude, 'engine/**'],
  },
})
