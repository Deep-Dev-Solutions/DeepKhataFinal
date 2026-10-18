import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StateStore } from '../src/state';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-state-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('StateStore', () => {
  it('missing file is not tampered', () => {
    expect(new StateStore(dir, 'dev').read()).toEqual({ data: {}, tampered: false });
  });

  it('round-trips lastSeenAt', () => {
    const s = new StateStore(dir, 'dev');
    s.write({ lastSeenAt: '2026-06-01T00:00:00.000Z' });
    expect(s.read()).toEqual({ data: { lastSeenAt: '2026-06-01T00:00:00.000Z' }, tampered: false });
  });

  it('editing the date by hand is detected', () => {
    const s = new StateStore(dir, 'dev');
    s.write({ lastSeenAt: '2026-06-01T00:00:00.000Z' });
    const raw = JSON.parse(fs.readFileSync(s.file, 'utf8'));
    raw.data.lastSeenAt = '2020-01-01T00:00:00.000Z';
    fs.writeFileSync(s.file, JSON.stringify(raw));
    expect(s.read().tampered).toBe(true);
  });

  it('a state file copied from another device is rejected', () => {
    const a = new StateStore(dir, 'dev-a');
    a.write({ lastSeenAt: '2026-06-01T00:00:00.000Z' });
    expect(new StateStore(dir, 'dev-b').read().tampered).toBe(true);
  });

  it('corrupt JSON is tampered', () => {
    const s = new StateStore(dir, 'dev');
    fs.writeFileSync(s.file, '{not json');
    expect(s.read().tampered).toBe(true);
  });

  it('touch never moves lastSeenAt backwards', () => {
    const s = new StateStore(dir, 'dev');
    s.touch(new Date('2026-06-10T00:00:00Z'));
    const kept = s.touch(new Date('2026-06-01T00:00:00Z'));
    expect(kept.toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect(s.read().data.lastSeenAt).toBe('2026-06-10T00:00:00.000Z');
  });
});
