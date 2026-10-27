import * as nodeFs from 'node:fs';
import * as path from 'node:path';
import type { PaperWidth } from './printer';
import { normalizePaperWidth } from './ipc';

/** Small persisted preferences for the shell (not the app's own settings). */
export interface ShellSettings {
  /** Printer for receipts; `null` means the OS default. */
  printerName: string | null;
  paperWidth: PaperWidth;
  /** Raw target for the drawer pulse; defaults to the printer queue when unset. */
  drawerTarget: string | null;
}

export const DEFAULT_SHELL_SETTINGS: ShellSettings = {
  printerName: null,
  paperWidth: 80,
  drawerTarget: null,
};

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export function loadShellSettings(dir: string, fs: typeof nodeFs = nodeFs): ShellSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')) as Partial<
      Record<keyof ShellSettings, unknown>
    >;
    return {
      printerName: str(raw.printerName),
      paperWidth: normalizePaperWidth(raw.paperWidth),
      drawerTarget: str(raw.drawerTarget),
    };
  } catch {
    return { ...DEFAULT_SHELL_SETTINGS };
  }
}

export function saveShellSettings(
  dir: string,
  settings: ShellSettings,
  fs: typeof nodeFs = nodeFs,
): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');
}
