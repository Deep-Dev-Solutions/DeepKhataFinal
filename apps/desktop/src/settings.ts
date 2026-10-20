import * as nodeFs from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import * as path from 'node:path';

export interface Settings {
  lanMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = { lanMode: false };

export function loadSettings(dir: string, fs: typeof nodeFs = nodeFs): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')) as Partial<Settings>;
    return { lanMode: raw.lanMode === true };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(dir: string, settings: Settings, fs: typeof nodeFs = nodeFs): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');
}

/** Stable per-installation id (used to bind licence + HMAC key). */
export function getOrCreateDeviceId(dir: string, fs: typeof nodeFs = nodeFs): string {
  const file = path.join(dir, 'device.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { deviceId?: string };
    if (parsed.deviceId) return parsed.deviceId;
  } catch {
    /* first run */
  }
  const deviceId = randomUUID();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ deviceId }), 'utf8');
  return deviceId;
}

/** Random secret (>= 32 chars), generated once and kept in userData (mode 600). */
export function getOrCreateSecret(dir: string, name: string, bytes = 24, fs: typeof nodeFs = nodeFs): string {
  const file = path.join(dir, name);
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    /* first run */
  }
  const secret = randomBytes(bytes).toString('hex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

export const getOrCreateDbPassword = (dir: string, fs: typeof nodeFs = nodeFs): string =>
  getOrCreateSecret(dir, 'db-secret', 24, fs);
