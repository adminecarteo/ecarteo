import { defineConfig, devices } from '@playwright/test';

// Tests only the built public artifact. The local preview has no auth/backend proxy.
export default defineConfig({
  testDir: './tests/marketing-browser',
  outputDir: './test-results/static-marketing',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3216',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'marketing-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: 'vite preview --outDir out/marketing/public --host 127.0.0.1 --port 3216 --strictPort',
    url: 'http://127.0.0.1:3216',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
