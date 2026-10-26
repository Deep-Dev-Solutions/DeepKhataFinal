import { chromium } from '/home/jb/Projects/DeepKhata/node_modules/playwright/index.mjs';
const tag = process.argv[2]; // before|after
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.getByTestId('login-email').fill('owner@deepkhata.test');
await page.getByTestId('login-password').fill('DeepKhata#Test1');
await page.getByTestId('login-submit').click();
await page.waitForURL(/dashboard|orders/, { timeout: 20000 });
await page.waitForSelector('[data-testid="dashboard-root"]', { timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `docs/ui/dashboard-${tag}.png` });
await page.goto('http://localhost:3000/orders/new', { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="pos-result-row"]', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `docs/ui/pos-${tag}.png` });
await browser.close();
console.log('shots done:', tag);
