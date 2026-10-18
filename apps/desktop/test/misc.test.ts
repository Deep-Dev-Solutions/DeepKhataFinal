import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { waitForHealth } from '../src/health';
import { checkStartup, getIntegrityStatus, markCleanShutdown } from '../src/integrity';
import { buildDatabaseUrl, resolveResourcePaths } from '../src/paths';
import { getOrCreateDeviceId, getOrCreateSecret, loadSettings, saveSettings } from '../src/settings';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-misc-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('integrity marker', () => {
  it('flags an unclean shutdown only when the marker was left behind', () => {
    const logs: string[] = [];
    const log = (_l: string, m: string) => logs.push(m);
    expect(checkStartup(dir, log).uncleanShutdown).toBe(false);
    expect(checkStartup(dir, log).uncleanShutdown).toBe(true);
    expect(getIntegrityStatus().uncleanShutdown).toBe(true);
    expect(logs.some((l) => l.includes('Unclean shutdown'))).toBe(true);
    markCleanShutdown(dir);
    expect(checkStartup(dir, log).uncleanShutdown).toBe(false);
  });
});

describe('settings', () => {
  it('lanMode defaults to false and persists', () => {
    expect(loadSettings(dir).lanMode).toBe(false);
    saveSettings(dir, { lanMode: true });
    expect(loadSettings(dir).lanMode).toBe(true);
  });
  it('deviceId and secrets are stable and long enough', () => {
    expect(getOrCreateDeviceId(dir)).toBe(getOrCreateDeviceId(dir));
    const s = getOrCreateSecret(dir, 'x', 32);
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(getOrCreateSecret(dir, 'x', 32)).toBe(s);
  });
});

describe('paths', () => {
  it('resolves packaged and dev layouts', () => {
    const packaged = resolveResourcePaths({ isPackaged: true, resourcesPath: '/r', appDir: '/a' });
    expect(packaged.serverMain).toBe(path.join('/r', 'server', 'dist', 'main.js'));
    expect(packaged.clientServer).toBe(path.join('/r', 'client', 'apps', 'client', 'server.js'));
    const dev = resolveResourcePaths({ isPackaged: false, resourcesPath: '/r', appDir: '/repo/apps/desktop/dist' });
    expect(dev.serverMain).toBe(path.join('/repo', 'apps', 'server', 'dist', 'main.js'));
    expect(dev.clientServer).toBe(path.join('/repo', 'apps', 'client', '.next', 'standalone', 'apps', 'client', 'server.js'));
  });
  it('url-encodes db credentials', () => {
    expect(buildDatabaseUrl({ user: 'u', password: 'p@ss/w', port: 1, database: 'd' })).toBe('postgresql://u:p%40ss%2Fw@127.0.0.1:1/d');
  });
});

describe('waitForHealth', () => {
  it('retries until ok', async () => {
    let n = 0;
    await waitForHealth('http://x/health', {
      fetchFn: async () => { if (++n < 3) throw new Error('refused'); return { ok: true }; },
      sleep: async () => undefined,
    });
    expect(n).toBe(3);
  });
  it('times out', async () => {
    let t = 0;
    await expect(
      waitForHealth('http://x/health', { timeoutMs: 100, fetchFn: async () => ({ ok: false }), sleep: async () => { t += 60; }, now: () => t }),
    ).rejects.toThrow('Timed out');
  });
});
