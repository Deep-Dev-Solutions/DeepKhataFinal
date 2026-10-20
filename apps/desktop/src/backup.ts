import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

export interface PgConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** Runs pg_dump and streams its plain-SQL stdout into `out`. */
export type DumpRunner = (cmd: string, args: string[], env: NodeJS.ProcessEnv, out: Writable) => Promise<void>;

export interface RunBackupOptions {
  pgDumpPath: string;
  connection: PgConnection;
  dir: string;
  /** Number of newest backups to keep. Default 14. */
  keep?: number;
  now: Date;
  /** File name prefix; defaults to APP_NAME env or "DeepKhata". */
  appName?: string;
  /** Injectable for tests. */
  dump?: DumpRunner;
}

export interface BackupInfo {
  name: string;
  path: string;
  /** Parsed from the file name (local time). */
  createdAt: Date;
  size: number;
}

const NAME_RE = /^(.+)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.(sql\.gz|dump)$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function sanitizeAppName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]+/g, '') || 'DeepKhata';
}

export function formatTimestamp(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function backupFileName(appName: string, now: Date, ext: 'sql.gz' | 'dump' = 'sql.gz'): string {
  return `${sanitizeAppName(appName)}-${formatTimestamp(now)}.${ext}`;
}

export const defaultDumpRunner: DumpRunner = (cmd, args, env, out) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.once('error', reject);
    const piped = pipeline(child.stdout, out);
    const exited = new Promise<void>((res, rej) => {
      child.once('close', (code) =>
        code === 0 ? res() : rej(new Error(`pg_dump exited with code ${code}: ${stderr.trim().slice(0, 500)}`)),
      );
    });
    Promise.all([piped, exited]).then(() => resolve(), reject);
  });

export async function listBackups(dir: string): Promise<BackupInfo[]> {
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: BackupInfo[] = [];
  for (const name of names) {
    const m = NAME_RE.exec(name);
    if (!m) continue;
    const [, , y, mo, d, h, mi] = m;
    const full = path.join(dir, name);
    const stat = await fsp.stat(full);
    out.push({
      name,
      path: full,
      createdAt: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)),
      size: stat.size,
    });
  }
  // Newest first; name as tie-break so the order is deterministic.
  out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.name.localeCompare(a.name));
  return out;
}

/** Delete everything but the `keep` newest backups. Returns deleted names. */
export async function pruneBackups(dir: string, keep: number): Promise<string[]> {
  const all = await listBackups(dir);
  const doomed = all.slice(Math.max(0, keep));
  for (const b of doomed) await fsp.rm(b.path, { force: true });
  return doomed.map((b) => b.name);
}

/** True when the newest backup is older than `maxAgeHours` (or none exist). */
export function isBackupDue(backups: BackupInfo[], now: Date, maxAgeHours = 24): boolean {
  if (backups.length === 0) return true;
  return now.getTime() - backups[0].createdAt.getTime() >= maxAgeHours * 3600 * 1000;
}

/**
 * pg_dump (plain SQL) -> gzip -> `<APP_NAME>-YYYYMMDD-HHmm.sql.gz`, then prune
 * to the newest `keep` files. The file is written as `.part` and renamed only
 * after pg_dump succeeds, so a failed run never leaves a corrupt backup.
 */
export async function runBackup(opts: RunBackupOptions): Promise<BackupInfo> {
  const keep = opts.keep ?? 14;
  const dump = opts.dump ?? defaultDumpRunner;
  const appName = opts.appName ?? process.env.APP_NAME ?? 'DeepKhata';
  await fsp.mkdir(opts.dir, { recursive: true });

  const finalName = backupFileName(appName, opts.now);
  const finalPath = path.join(opts.dir, finalName);
  const partPath = `${finalPath}.part`;
  const c = opts.connection;
  const args = ['-h', c.host, '-p', String(c.port), '-U', c.user, '-d', c.database, '--no-owner', '--format=plain'];
  const env = { ...process.env, PGPASSWORD: c.password };

  const gzip = createGzip();
  const file = createWriteStream(partPath);
  const writing = pipeline(gzip, file);
  try {
    // Surface the gzip pipeline failure too, whichever side fails first.
    await Promise.all([dump(opts.pgDumpPath, args, env, gzip), writing]);
    await fsp.rename(partPath, finalPath);
  } catch (err) {
    // Tear the streams down and wait for them to settle before deleting, or
    // the file stream could recreate the .part file after we removed it.
    gzip.destroy();
    file.destroy();
    await writing.catch(() => undefined);
    await fsp.rm(partPath, { force: true });
    throw err;
  }
  await pruneBackups(opts.dir, keep);
  const stat = await fsp.stat(finalPath);
  return { name: finalName, path: finalPath, createdAt: new Date(opts.now.getTime()), size: stat.size };
}
