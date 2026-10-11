import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { getE2eDatabaseUrl } from './env';

const dbUrl = getE2eDatabaseUrl();
const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
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
      command: 'npm run build -w server && npm run start:prod -w server',
      cwd: repoRoot,
      url: 'http://localhost:5000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
      env: { PORT: '5000', DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
    },
    {
      command: 'npm run dev -w client',
      cwd: repoRoot,
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
      // PORT is loaded from apps/server/.env into process.env; Next would pick it up, so pin it.
      env: { PORT: '3000', NEXT_PUBLIC_API_URL: 'http://localhost:5000' },
    },
  ],
});
