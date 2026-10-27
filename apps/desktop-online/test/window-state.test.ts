import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOW,
  MIN_WINDOW,
  readWindowState,
  sanitizeWindowState,
  saveWindowState,
} from '../src/window-state';

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

describe('sanitizeWindowState', () => {
  it('falls back to the 1366x768 POS default on a fresh install', () => {
    expect(sanitizeWindowState(null, WORK_AREA)).toEqual({ ...DEFAULT_WINDOW, isMaximized: false });
    expect(sanitizeWindowState({}, WORK_AREA)).toEqual({ ...DEFAULT_WINDOW, isMaximized: false });
  });

  it('restores a saved size and position', () => {
    expect(
      sanitizeWindowState({ width: 1500, height: 900, x: 40, y: 30, isMaximized: true }, WORK_AREA),
    ).toEqual({ width: 1500, height: 900, x: 40, y: 30, isMaximized: true });
  });

  it('never opens smaller than the POS minimum', () => {
    const state = sanitizeWindowState({ width: 300, height: 200 }, WORK_AREA);
    expect(state.width).toBe(MIN_WINDOW.width);
    expect(state.height).toBe(MIN_WINDOW.height);
  });

  it('never opens bigger than the screen', () => {
    const state = sanitizeWindowState({ width: 5000, height: 4000 }, WORK_AREA);
    expect(state.width).toBe(1920);
    expect(state.height).toBe(1080);
  });

  it('drops a position that would land off-screen (monitor unplugged)', () => {
    const state = sanitizeWindowState({ width: 1366, height: 768, x: 4000, y: 3000 }, WORK_AREA);
    expect(state.x).toBeUndefined();
    expect(state.y).toBeUndefined();
  });

  it('keeps a partially visible window', () => {
    const state = sanitizeWindowState({ width: 1366, height: 768, x: 1000, y: 500 }, WORK_AREA);
    expect(state.x).toBe(1000);
    expect(state.y).toBe(500);
  });

  it('treats non-numeric junk as absent and ignores a non-boolean maximise flag', () => {
    expect(
      sanitizeWindowState({ width: 'wide', height: null, isMaximized: 'yes' }, WORK_AREA),
    ).toEqual({ ...DEFAULT_WINDOW, isMaximized: false });
  });
});

describe('readWindowState / saveWindowState', () => {
  it('round-trips through window-state.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-win-'));
    try {
      expect(readWindowState(dir)).toBeNull();
      const state = { width: 1440, height: 900, x: 10, y: 20, isMaximized: false };
      saveWindowState(dir, state);
      expect(readWindowState(dir)).toEqual(state);
      expect(fs.existsSync(path.join(dir, 'window-state.json'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores an unreadable file and never throws while saving', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-win-'));
    try {
      fs.writeFileSync(path.join(dir, 'window-state.json'), '{not json');
      expect(readWindowState(dir)).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    const failing = {
      mkdirSync: () => {
        throw new Error('EACCES');
      },
      writeFileSync: () => {
        throw new Error('EACCES');
      },
      readFileSync: () => {
        throw new Error('EACCES');
      },
    } as unknown as typeof fs;

    expect(() =>
      saveWindowState('/anywhere', { width: 1366, height: 768, isMaximized: false }, failing),
    ).not.toThrow();
    expect(readWindowState('/anywhere', failing)).toBeNull();
  });
});
