#!/usr/bin/env node
/**
 * Starts the dev Postgres + Mailpit on the ports `apps/server/.env` already points at,
 * so `npm run dev` never boots the API against a database that is not there.
 *
 * Ports come from apps/server/.env (DATABASE_URL, SMTP_PORT) because this machine can
 * hold several projects' databases: the dev compose defaults (5432 / 1025 / 8025) are
 * only used when there is no .env. Override with POSTGRES_PORT / MAILPIT_SMTP_PORT /
 * MAILPIT_UI_PORT.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'apps/server/.env');

function readEnv(file) {
  const out = {};
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function portOf(value, fallback) {
  if (!value) return fallback;
  try {
    return new URL(value).port || fallback;
  } catch {
    return fallback;
  }
}

const env = existsSync(envPath) ? readEnv(envPath) : {};

const dbPort = process.env.POSTGRES_PORT || portOf(env.DATABASE_URL, '5432');
const smtpPort = process.env.MAILPIT_SMTP_PORT || env.SMTP_PORT || '1025';
const uiPort =
  process.env.MAILPIT_UI_PORT || env.MAILPIT_UI_PORT || String(Number(smtpPort) + 7000);

const run = spawnSync(
  'docker',
  ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d', '--wait', 'postgres', 'mailpit'],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      POSTGRES_PORT: dbPort,
      MAILPIT_SMTP_PORT: smtpPort,
      MAILPIT_UI_PORT: uiPort,
    },
  },
);

if (run.status !== 0) {
  console.error(`
Could not start the dev database on port ${dbPort}.

apps/server/.env points Postgres at :${dbPort}, so that port must be free or already
served by the deepkhata dev container. If another project holds it:

  docker ps --format '{{.Names}} {{.Ports}}'

then either stop that container or start the dev stack on a free port and update
DATABASE_URL / DIRECT_URL / DATABASE_URL_TEST / E2E_DATABASE_URL to match:

  POSTGRES_PORT=<free port> npm run db:up
`);
  process.exit(run.status ?? 1);
}

console.log(
  `db ready — postgres :${dbPort} · mailpit smtp :${smtpPort} · ui http://localhost:${uiPort}`,
);
