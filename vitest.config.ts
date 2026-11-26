import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    // Workspace packages resolve to their source, not dist (see package.json "exports").
    conditions: ['poney-source'],
    alias: { '@': fileURLToPath(new URL('./apps/studio/src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/*.test.ts', 'spec/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
