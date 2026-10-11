import { execSync } from 'node:child_process';
import path from 'node:path';
import { getE2eDatabaseUrl } from './env';

export default async function globalSetup() {
  const url = getE2eDatabaseUrl();
  const cwd = path.resolve(__dirname, '../server');
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };

  execSync('npx prisma migrate reset --force --skip-seed', { cwd, env, stdio: 'inherit' });
  execSync('npx prisma db seed', { cwd, env, stdio: 'inherit' });
}
