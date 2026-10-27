import * as nodeFs from 'node:fs';
import * as path from 'node:path';

/**
 * Start-with-Windows. Windows/macOS use Electron's login item; on Linux we drop
 * a freedesktop autostart entry so the shell behaves the same in a test VM.
 */
export const AUTOSTART_FILE = 'deepkhata-online.desktop';

/** Launched by the OS at login: start in the tray without stealing focus. */
export function shouldOpenHidden(argv: string[]): boolean {
  return argv.includes('--hidden');
}

export function renderAutostartDesktopFile(execPath: string): string {
  const exec = /\s/.test(execPath) ? `"${execPath}"` : execPath;
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=DeepKhata',
    'Comment=DeepKhata cloud desktop shell',
    `Exec=${exec} --hidden`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

export interface AutostartDeps {
  platform: NodeJS.Platform;
  execPath: string;
  homeDir: string;
  fs?: typeof nodeFs;
  setLoginItemSettings?: (settings: { openAtLogin: boolean; args?: string[] }) => void;
}

export function autostartFilePath(homeDir: string): string {
  return path.join(homeDir, '.config', 'autostart', AUTOSTART_FILE);
}

/** Enable/disable autostart. Best effort: a failure must not block the app. */
export function applyAutostart(enabled: boolean, deps: AutostartDeps): void {
  const fs = deps.fs ?? nodeFs;
  try {
    if (deps.platform === 'win32' || deps.platform === 'darwin') {
      deps.setLoginItemSettings?.({ openAtLogin: enabled, args: ['--hidden'] });
      return;
    }
    const file = autostartFilePath(deps.homeDir);
    if (enabled) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, renderAutostartDesktopFile(deps.execPath), 'utf8');
    } else {
      fs.rmSync(file, { force: true });
    }
  } catch {
    /* autostart is a convenience, never a startup blocker */
  }
}

/** Read back the current choice: the OS login item on Windows/macOS, the file on Linux. */
export function isAutostartEnabled(
  deps: AutostartDeps & { getLoginItemSettings?: () => { openAtLogin: boolean } },
): boolean {
  try {
    if (deps.platform === 'win32' || deps.platform === 'darwin') {
      return deps.getLoginItemSettings?.().openAtLogin === true;
    }
    return (deps.fs ?? nodeFs).existsSync(autostartFilePath(deps.homeDir));
  } catch {
    return false;
  }
}
