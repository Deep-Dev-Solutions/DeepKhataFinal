import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupFileName, isBackupDue, listBackups, pruneBackups, runBackup } from '../src/backup';
import type { DumpRunner } from '../src/backup';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-backup-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const conn = { host: '127.0.0.1', port: 5433, user: 'u', password: 'secret', database: 'deepkhata' };
const okDump: DumpRunner = async (_cmd, _args, _env, out) => {
  out.end('SELECT 1;\n');
};

describe('backups', () => {
  it('names files <APP>-YYYYMMDD-HHmm.sql.gz', () => {
    expect(backupFileName('DeepKhata', new Date(2026, 0, 5, 9, 7))).toBe('DeepKhata-20260105-0907.sql.gz');
    expect(backupFileName('Deep Khata!', new Date(2026, 11, 31, 23, 59))).toBe('DeepKhata-20261231-2359.sql.gz');
  });

  it('writes a gzip of the dump and passes the password via env only', async () => {
    let seen: { args: string[]; pw?: string } | undefined;
    const info = await runBackup({
      pgDumpPath: 'pg_dump', connection: conn, dir, now: new Date(2026, 5, 1, 10, 30), appName: 'DeepKhata',
      dump: async (c, args, env, out) => {
        seen = { args, pw: env.PGPASSWORD };
        out.end('SELECT 1;\n');
      },
    });
    expect(info.name).toBe('DeepKhata-20260601-1030.sql.gz');
    expect(gunzipSync(fs.readFileSync(info.path)).toString()).toBe('SELECT 1;\n');
    expect(seen?.pw).toBe('secret');
    expect(seen?.args.join(' ')).not.toContain('secret');
    expect(seen?.args).toContain('deepkhata');
  });

  it('prunes to the 14 newest', async () => {
    for (let d = 1; d <= 20; d++) {
      await runBackup({ pgDumpPath: 'x', connection: conn, dir, now: new Date(2026, 0, d, 2, 0), appName: 'DeepKhata', dump: okDump, keep: 14 });
    }
    const left = await listBackups(dir);
    expect(left).toHaveLength(14);
    expect(left[0].name).toBe('DeepKhata-20260120-0200.sql.gz');
    expect(left[13].name).toBe('DeepKhata-20260107-0200.sql.gz');
  });

  it('prune ignores unrelated files and handles a missing dir', async () => {
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
    for (let d = 1; d <= 3; d++) fs.writeFileSync(path.join(dir, `DeepKhata-2026010${d}-0200.dump`), 'x');
    expect(await pruneBackups(dir, 2)).toEqual(['DeepKhata-20260101-0200.dump']);
    expect(fs.existsSync(path.join(dir, 'notes.txt'))).toBe(true);
    expect(await listBackups(path.join(dir, 'missing'))).toEqual([]);
  });

  it('a failed dump leaves no file and does not prune', async () => {
    fs.writeFileSync(path.join(dir, 'DeepKhata-20260101-0200.sql.gz'), 'old');
    await expect(
      runBackup({
        pgDumpPath: 'x', connection: conn, dir, now: new Date(2026, 0, 2), appName: 'DeepKhata', keep: 1,
        dump: async () => { throw new Error('pg_dump exploded'); },
      }),
    ).rejects.toThrow('pg_dump exploded');
    expect(fs.readdirSync(dir)).toEqual(['DeepKhata-20260101-0200.sql.gz']);
  });

  it('isBackupDue after 24h or when none', async () => {
    expect(isBackupDue([], new Date())).toBe(true);
    await runBackup({ pgDumpPath: 'x', connection: conn, dir, now: new Date(2026, 0, 1, 2, 0), appName: 'DeepKhata', dump: okDump });
    const list = await listBackups(dir);
    expect(isBackupDue(list, new Date(2026, 0, 1, 20, 0))).toBe(false);
    expect(isBackupDue(list, new Date(2026, 0, 2, 2, 0))).toBe(true);
  });
});
