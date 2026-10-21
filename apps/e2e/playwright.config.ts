import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { E2E, getE2eDatabaseUrl } from './env';

const dbUrl = getE2eDatabaseUrl();
const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: E2E.outputDir,
  reporter: [['list'], ['html', { open: 'never', outputFolder: E2E.reportDir }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: E2E.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      // Parallel runs share one prebuilt server dist: set E2E_SKIP_SERVER_BUILD=1.
      command: process.env.E2E_SKIP_SERVER_BUILD
        ? 'npm run start:prod -w server'
        : 'npm run build -w server && npm run start:prod -w server',
      cwd: repoRoot,
      url: `${E2E.apiUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
      env: {
        PORT: String(E2E.apiPort),
        DATABASE_URL: dbUrl,
        DIRECT_URL: dbUrl,
        ENABLE_TEST_ENDPOINTS: 'true',
        // One IP runs every spec: lift the production throttle limits for the E2E server only.
        THROTTLE_LIMIT: '100000',
        THROTTLE_AUTH_LIMIT: '100000',
        THROTTLE_PUBLIC_LIMIT: '100000',
        CORS_ORIGINS: `${E2E.webUrl},${E2E.adminUrl}`,
      },
    },
    {
      command: 'npm run dev -w client',
      cwd: repoRoot,
      url: E2E.webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
      // PORT is loaded from apps/server/.env into process.env; Next would pick it up, so pin it.
      env: {
        PORT: String(E2E.webPort),
        NEXT_PUBLIC_API_URL: E2E.apiUrl,
        NEXT_DIST_DIR: E2E.clientDistDir,
        NEXT_PUBLIC_AGENCY_URL: E2E.adminUrl,
      },
    },
    ...(E2E.withAdmin
      ? [
          {
            command: `npm exec -w agency-admin -- next dev --webpack -p ${E2E.adminPort}`,
            cwd: repoRoot,
            url: E2E.adminUrl,
            reuseExistingServer: !process.env.CI,
            timeout: 180000,
            env: {
              PORT: String(E2E.adminPort),
              NEXT_PUBLIC_API_URL: E2E.apiUrl,
              NEXT_DIST_DIR: E2E.adminDistDir,
            },
          },
        ]
      : []),
  ],
});
