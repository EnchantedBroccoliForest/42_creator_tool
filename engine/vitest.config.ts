import { defineConfig } from 'vitest/config';

// Without a local config, vitest searches upward and loads the legacy app's
// vite.config.js, which imports packages engine/ does not install.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
