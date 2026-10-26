import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fe': fileURLToPath(new URL('./src/frontend', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: { exclude: [...configDefaults.exclude, '**/.claude/**'] },
});
