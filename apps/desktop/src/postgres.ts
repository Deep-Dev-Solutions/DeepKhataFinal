import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PgConnection } from './backup';

export const DB_NAME = 'deepkhata';
export const DB_USER = 'deepkhata';

export interface EmbeddedPgHandle {
  connection: PgConnection;
  dataDir: string;
  stop(): Promise<void>;
}

// embedded-postgres is ESM-only; tsc "Node16" keeps this a real import().
async function loadEmbeddedPostgres() {
  const mod = await import('embedded-postgres');
  return mod.default;
}

/**
 * Start the bundled Postgres on 127.0.0.1:<port> with fsync on, creating the
 * cluster and the `deepkhata` database on first run.
 */
export async function startEmbeddedPostgres(opts: {
  dataDir: string;
  port: number;
  password: string;
  onLog?: (msg: string) => void;
}): Promise<EmbeddedPgHandle> {
  const EmbeddedPostgres = await loadEmbeddedPostgres();
  const log = opts.onLog ?? (() => undefined);
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    port: opts.port,
    user: DB_USER,
    password: opts.password,
    authMethod: 'scram-sha-256',
    persistent: true,
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'fsync=on', '-c', 'synchronous_commit=on'],
    onLog: (m: unknown) => log(String(m)),
    onError: (m: unknown) => log(`[stderr] ${m instanceof Error ? m.message : String(m)}`),
  });

  const firstRun = !fs.existsSync(path.join(opts.dataDir, 'PG_VERSION'));
  if (firstRun) {
    fs.mkdirSync(opts.dataDir, { recursive: true });
    await pg.initialise();
  }
  await pg.start();

  if (firstRun) {
    await pg.createDatabase(DB_NAME);
  } else {
    // Cluster existed but the database may be missing (interrupted first run).
    const client = pg.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
      if (res.rowCount === 0) await pg.createDatabase(DB_NAME);
    } finally {
      await client.end();
    }
  }

  return {
    dataDir: opts.dataDir,
    connection: { host: '127.0.0.1', port: opts.port, user: DB_USER, password: opts.password, database: DB_NAME },
    async stop() {
      // embedded-postgres kills the process with `taskkill /f` on Windows,
      // which skips Postgres' own shutdown (SIGINT = fast shutdown elsewhere).
      // On Windows ask pg_ctl for a fast shutdown first; pg.stop() then only
      // cleans up its bookkeeping, and may never see the already-gone exit
      // event, so it is raced against a short timeout.
      if (process.platform === 'win32') {
        await fastStop(opts.dataDir);
        await Promise.race([pg.stop(), new Promise<void>((r) => setTimeout(r, 3000))]);
      } else {
        await pg.stop();
      }
    },
  };
}

async function fastStop(dataDir: string): Promise<void> {
  try {
    const modName = `@embedded-postgres/${process.platform}-${process.arch}`;
    const mod = (await import(modName)) as { pg_ctl: string };
    await new Promise<void>((resolve) => {
      const child = spawn(mod.pg_ctl, ['-D', dataDir, 'stop', '-m', 'fast', '-w', '-t', '30'], { stdio: 'ignore' });
      child.once('error', () => resolve());
      child.once('close', () => resolve());
    });
  } catch {
    /* fall back to embedded-postgres' own stop() */
  }
}

/** Where to find pg_dump: env override, bundled pgtools, else PATH. */
export function resolvePgDumpPath(resourcesPath: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.PG_DUMP_PATH) return env.PG_DUMP_PATH;
  const exe = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
  const bundled = path.join(resourcesPath, 'pgtools', exe);
  return fs.existsSync(bundled) ? bundled : exe;
}
