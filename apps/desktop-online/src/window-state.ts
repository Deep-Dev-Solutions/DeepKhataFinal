import * as nodeFs from 'node:fs';
import * as path from 'node:path';

/**
 * Window geometry remembered between launches. Kept in `userData/window-state.json`
 * so a POS counter that is always 1366x768 reopens exactly like it was left.
 */
export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_WINDOW = { width: 1366, height: 768 } as const;
export const MIN_WINDOW = { width: 1024, height: 680 } as const;
const FILE = 'window-state.json';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;

/**
 * Turn whatever is on disk into geometry that is safe to open: never smaller
 * than the POS minimum, never wider/taller than the current screen, and drop a
 * stale position that would put the window off-screen (monitor unplugged).
 */
export function sanitizeWindowState(raw: unknown, workArea: WorkArea): WindowState {
  const data = (raw ?? {}) as Partial<Record<keyof WindowState, unknown>>;
  const maxW = Math.max(MIN_WINDOW.width, Math.floor(workArea.width));
  const maxH = Math.max(MIN_WINDOW.height, Math.floor(workArea.height));
  const width = clamp(num(data.width) ?? DEFAULT_WINDOW.width, MIN_WINDOW.width, maxW);
  const height = clamp(num(data.height) ?? DEFAULT_WINDOW.height, MIN_WINDOW.height, maxH);

  // Keep a position only when a real chunk of the window lands on the work area.
  const x = num(data.x);
  const y = num(data.y);
  const visible =
    x !== null &&
    y !== null &&
    x + width > workArea.x + 40 &&
    y + height > workArea.y + 40 &&
    x < workArea.x + workArea.width - 40 &&
    y < workArea.y + workArea.height - 40;

  return {
    width,
    height,
    ...(visible ? { x: x as number, y: y as number } : {}),
    isMaximized: data.isMaximized === true,
  };
}

export function readWindowState(dir: string, fs: typeof nodeFs = nodeFs): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8'));
  } catch {
    return null;
  }
}

export function saveWindowState(dir: string, state: WindowState, fs: typeof nodeFs = nodeFs): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, FILE), JSON.stringify(state, null, 2), 'utf8');
  } catch {
    /* remembering the window must never crash the app */
  }
}
