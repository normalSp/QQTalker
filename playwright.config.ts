import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:43180',
    headless: true,
  },
  webServer: {
    command: 'node tests/e2e/mock-dashboard-server.cjs',
    port: 43180,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
