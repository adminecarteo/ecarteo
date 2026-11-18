import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The browser intercepts protected bootstrap and auth responses. No provider or
// backend process is required, and production authorization code stays intact.
export default defineConfig(base, {
  testMatch: ['frontend-bootstrap.spec.ts', 'auth-validation.spec.ts'],
  outputDir: './test-results/frontend-bootstrap',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3110' },
  webServer: {
    command: 'npm run dev -- --port 3110',
    url: 'http://127.0.0.1:3110/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ECARTEO_DEPLOYMENT_TARGET: 'frontend',
      ECARTEO_BACKEND_ORIGIN: 'http://127.0.0.1:3111',
      APP_URL: 'http://127.0.0.1:3110',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_frontend_browser_fixture',
      DATABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_DB_CA_CERT: '',
      OPS_HEALTH_TOKEN: '',
      OPS_CLEANUP_TOKEN: '',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_BILLING_PLANS: '',
    },
  },
});
