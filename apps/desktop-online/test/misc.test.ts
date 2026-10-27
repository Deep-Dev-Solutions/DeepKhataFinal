import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyAutostart,
  AUTOSTART_FILE,
  autostartFilePath,
  isAutostartEnabled,
  renderAutostartDesktopFile,
  shouldOpenHidden,
} from '../src/autostart';
import { DEFAULT_CLOUD_URL, isInsecureCloudUrl, resolveCloudUrl } from '../src/cloud';
import { DEFAULT_SHELL_SETTINGS, loadShellSettings, saveShellSettings } from '../src/settings';
import { buildTrayMenuTemplate } from '../src/tray-menu';

describe('resolveCloudUrl', () => {
  it('defaults to the shipped cloud URL', () => {
    expect(resolveCloudUrl(undefined)).toBe(DEFAULT_CLOUD_URL);
    expect(resolveCloudUrl('   ')).toBe(DEFAULT_CLOUD_URL);
    expect(DEFAULT_CLOUD_URL.startsWith('https://app.')).toBe(true);
  });

  it('accepts a bare host and a path, dropping the trailing slash', () => {
    expect(resolveCloudUrl('shop.example.com')).toBe('https://shop.example.com');
    expect(resolveCloudUrl('https://shop.example.com/')).toBe('https://shop.example.com');
    expect(resolveCloudUrl('https://shop.example.com/pos')).toBe('https://shop.example.com/pos');
  });

  it('keeps plain http for a staging box', () => {
    expect(resolveCloudUrl('http://192.168.0.10:3000')).toBe('http://192.168.0.10:3000');
    expect(isInsecureCloudUrl('http://192.168.0.10:3000')).toBe(true);
    expect(isInsecureCloudUrl('https://app.deepkhata.com')).toBe(false);
  });

  it('falls back instead of opening a nonsense URL', () => {
    expect(resolveCloudUrl('file:///etc/passwd')).toBe(DEFAULT_CLOUD_URL);
    expect(resolveCloudUrl('ftp://example.com')).toBe(DEFAULT_CLOUD_URL);
    expect(resolveCloudUrl('https://')).toBe(DEFAULT_CLOUD_URL);
  });
});

describe('start with Windows', () => {
  it('knows when it was launched by the OS', () => {
    expect(shouldOpenHidden(['electron', '.', '--hidden'])).toBe(true);
    expect(shouldOpenHidden(['electron', '.'])).toBe(false);
  });

  it('renders a freedesktop entry that starts hidden', () => {
    const file = renderAutostartDesktopFile('/opt/DeepKhata/deepkhata');
    expect(file).toContain(`Exec=/opt/DeepKhata/deepkhata --hidden`);
    expect(file).toContain('Type=Application');
    expect(file).toContain('X-GNOME-Autostart-enabled=true');
  });

  it('quotes an executable path with spaces', () => {
    expect(renderAutostartDesktopFile('C:\\Program Files\\DeepKhata\\app.exe')).toContain(
      'Exec="C:\\Program Files\\DeepKhata\\app.exe" --hidden',
    );
  });

  it('writes and removes the Linux autostart file', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-auto-'));
    try {
      const deps = { platform: 'linux' as const, execPath: '/opt/deepkhata', homeDir: home };
      expect(isAutostartEnabled(deps)).toBe(false);

      applyAutostart(true, deps);
      expect(fs.existsSync(autostartFilePath(home))).toBe(true);
      expect(path.basename(autostartFilePath(home))).toBe(AUTOSTART_FILE);
      expect(isAutostartEnabled(deps)).toBe(true);

      applyAutostart(false, deps);
      expect(fs.existsSync(autostartFilePath(home))).toBe(false);
      expect(isAutostartEnabled(deps)).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('uses the OS login item on Windows', () => {
    const setLoginItemSettings = vi.fn();
    applyAutostart(true, {
      platform: 'win32',
      execPath: 'C:\\DeepKhata\\DeepKhata.exe',
      homeDir: 'C:\\Users\\shop',
      setLoginItemSettings,
    });
    expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, args: ['--hidden'] });

    expect(
      isAutostartEnabled({
        platform: 'win32',
        execPath: 'C:\\DeepKhata\\DeepKhata.exe',
        homeDir: 'C:\\Users\\shop',
        getLoginItemSettings: () => ({ openAtLogin: true }),
      }),
    ).toBe(true);
  });

  it('never throws when the autostart folder cannot be written', () => {
    const failingFs = {
      mkdirSync: () => {
        throw new Error('EACCES');
      },
      writeFileSync: () => {
        throw new Error('EACCES');
      },
      rmSync: () => {
        throw new Error('EACCES');
      },
      existsSync: () => false,
    } as unknown as typeof fs;

    expect(() =>
      applyAutostart(true, {
        platform: 'linux',
        execPath: '/opt/deepkhata',
        homeDir: '/home/shop',
        fs: failingFs,
      }),
    ).not.toThrow();
  });
});

describe('shell settings', () => {
  it('defaults to the system printer at 80 mm', () => {
    expect(DEFAULT_SHELL_SETTINGS).toEqual({ printerName: null, paperWidth: 80, drawerTarget: null });
  });

  it('round-trips the chosen printer, width and drawer target', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-set-'));
    try {
      expect(loadShellSettings(dir)).toEqual(DEFAULT_SHELL_SETTINGS);
      saveShellSettings(dir, { printerName: 'POS-80', paperWidth: 58, drawerTarget: '\\\\localhost\\POS-80' });
      expect(loadShellSettings(dir)).toEqual({
        printerName: 'POS-80',
        paperWidth: 58,
        drawerTarget: '\\\\localhost\\POS-80',
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('repairs junk in the settings file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-set-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'settings.json'),
        JSON.stringify({ printerName: 42, paperWidth: 'wide', drawerTarget: '' }),
      );
      expect(loadShellSettings(dir)).toEqual(DEFAULT_SHELL_SETTINGS);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('tray menu', () => {
  const actions = {
    open: vi.fn(),
    choosePrinter: vi.fn(),
    chooseWidth: vi.fn(),
    toggleStartWithWindows: vi.fn(),
    quit: vi.fn(),
  };
  const state = {
    cloudUrl: 'https://app.deepkhata.com',
    printerName: 'POS-80',
    paperWidth: 80 as const,
    startWithWindows: true,
  };

  it('always offers Open and Quit, and shows which cloud it loads', () => {
    const template = buildTrayMenuTemplate(state, actions, []);
    const labels = template.map((item) => item.label);
    expect(labels).toContain('Open');
    expect(labels).toContain('Quit');
    expect(labels[0]).toBe('app.deepkhata.com');
  });

  it('lists the printers with the saved one checked', () => {
    const template = buildTrayMenuTemplate(state, actions, [
      { name: 'POS-80', displayName: 'Xprinter POS-80', isDefault: true },
      { name: 'HP-1020', displayName: 'HP LaserJet 1020', isDefault: false },
    ]);
    const printers = template.find((item) => item.label === 'Receipt printer')
      ?.submenu as Electron.MenuItemConstructorOptions[];
    expect(printers.map((p) => p.label)).toEqual([
      'System default',
      'Xprinter POS-80',
      'HP LaserJet 1020',
    ]);
    expect(printers[0].checked).toBe(false);
    expect(printers[1].checked).toBe(true);
  });

  it('says so when no printer is installed', () => {
    const template = buildTrayMenuTemplate({ ...state, printerName: null }, actions, []);
    const printers = template.find((item) => item.label === 'Receipt printer')
      ?.submenu as Electron.MenuItemConstructorOptions[];
    expect(printers[0].checked).toBe(true);
    expect(printers[1]).toMatchObject({ label: 'No printers found', enabled: false });
  });

  it('reflects the paper width and the start-with-Windows choice', () => {
    const template = buildTrayMenuTemplate(state, actions, []);
    const widths = template.find((item) => item.label === 'Paper width')
      ?.submenu as Electron.MenuItemConstructorOptions[];
    expect(widths.map((w) => w.label)).toEqual(['80 mm', '58 mm']);
    expect(widths[0].checked).toBe(true);

    const autostart = template.find((item) => item.label === 'Start with Windows');
    expect(autostart?.type).toBe('checkbox');
    expect(autostart?.checked).toBe(true);
  });
});
