import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as path from 'node:path';

/** Minimal fs surface so the store can be tested without touching disk. */
export interface StateFs {
  readFileSync(file: string, enc: 'utf8'): string;
  writeFileSync(file: string, data: string, enc: 'utf8'): void;
  existsSync(file: string): boolean;
  renameSync(from: string, to: string): void;
  mkdirSync(dir: string, opts: { recursive: true }): void;
}

export interface StateData {
  /** ISO-8601, last time the app observed a trustworthy clock. */
  lastSeenAt?: string;
}

export interface ReadStateResult {
  data: StateData;
  /** true when the file exists but is unreadable / its HMAC does not match. */
  tampered: boolean;
}

interface StateFile {
  data: StateData;
  mac: string;
}

export const STATE_FILE = 'state.json';

/** Key derived from the deviceId; ties state.json to this installation. */
export function deriveStateKey(deviceId: string): Buffer {
  return createHash('sha256').update(`deepkhata-state-v1:${deviceId}`).digest();
}

function canonical(data: StateData): string {
  // Stable field order so the MAC does not depend on key insertion order.
  return JSON.stringify({ lastSeenAt: data.lastSeenAt ?? null });
}

export function signState(data: StateData, deviceId: string): string {
  return createHmac('sha256', deriveStateKey(deviceId)).update(canonical(data)).digest('hex');
}

function macEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

export class StateStore {
  constructor(
    private readonly dir: string,
    private readonly deviceId: string,
    private readonly fs: StateFs = nodeFs,
  ) {}

  get file(): string {
    return path.join(this.dir, STATE_FILE);
  }

  read(): ReadStateResult {
    if (!this.fs.existsSync(this.file)) return { data: {}, tampered: false };
    try {
      const parsed = JSON.parse(this.fs.readFileSync(this.file, 'utf8')) as StateFile;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof parsed.mac !== 'string' ||
        typeof parsed.data !== 'object' ||
        parsed.data === null
      ) {
        return { data: {}, tampered: true };
      }
      const expected = signState(parsed.data, this.deviceId);
      if (!macEquals(expected, parsed.mac)) return { data: {}, tampered: true };
      const lastSeen = parsed.data.lastSeenAt;
      if (lastSeen !== undefined && Number.isNaN(Date.parse(lastSeen))) {
        return { data: {}, tampered: true };
      }
      return { data: parsed.data, tampered: false };
    } catch {
      return { data: {}, tampered: true };
    }
  }

  write(data: StateData): void {
    this.fs.mkdirSync(this.dir, { recursive: true });
    const file: StateFile = { data: { lastSeenAt: data.lastSeenAt }, mac: signState(data, this.deviceId) };
    const tmp = `${this.file}.tmp`;
    this.fs.writeFileSync(tmp, JSON.stringify(file), 'utf8');
    this.fs.renameSync(tmp, this.file);
  }

  /**
   * Advance lastSeenAt to `now` (never backwards). Returns the stored value.
   * Callers should skip this while the licence state is clock_rollback.
   */
  touch(now: Date): Date {
    const { data, tampered } = this.read();
    const previous = !tampered && data.lastSeenAt ? new Date(data.lastSeenAt) : undefined;
    const next = previous && previous.getTime() > now.getTime() ? previous : now;
    this.write({ lastSeenAt: next.toISOString() });
    return next;
  }
}
