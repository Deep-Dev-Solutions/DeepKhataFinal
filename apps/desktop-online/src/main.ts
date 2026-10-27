import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyAutostart, isAutostartEnabled, shouldOpenHidden } from './autostart';
import { resolveCloudUrl } from './cloud';
import { registerIpcHandlers } from './ipc';
import type { PrintResult } from './ipc';
import {
  buildPrintDocument,
  buildRawTarget,
  CASH_DRAWER_PULSE,
  receiptPageSize,
  writeRawBytes,
} from './printer';
import type { PaperWidth } from './printer';
import { loadShellSettings, saveShellSettings } from './settings';
import type { ShellSettings } from './settings';
import { createTray } from './tray';
import type { PrinterChoice } from './tray-menu';
import { MIN_WINDOW, readWindowState, sanitizeWindowState, saveWindowState } from './window-state';
import type { WindowState } from './window-state';

const APP_NAME = process.env.APP_NAME || 'DeepKhata';
const CLOUD_URL = resolveCloudUrl(process.env.CLOUD_URL ?? process.env.NEXT_PUBLIC_CLOUD_URL);
const RETRY_MS = 5_000;
const PRINTER_REFRESH_MS = 60_000;

let userData = '';
let settings: ShellSettings = { printerName: null, paperWidth: 80, drawerTarget: null };
let mainWindow: BrowserWindow | null = null;
let trayCtl: ReturnType<typeof createTray> | null = null;
let printers: PrinterChoice[] = [];
let quitting = false;
let startHidden = false;
let retryTimer: NodeJS.Timeout | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

function log(level: 'info' | 'warn' | 'error', msg: string): void {
  const line = `${new Date().toISOString()} [${level}] ${msg.trimEnd()}\n`;
  try {
    const dir = path.join(userData || app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'main.log'), line);
  } catch {
    /* logging must never crash the app */
  }
  if (!app.isPackaged) process.stdout.write(line);
}

/** Persist printer/width choices so the counter keeps its setup. */
function persistSettings(patch: Partial<ShellSettings>): void {
  settings = { ...settings, ...patch };
  try {
    saveShellSettings(userData, settings);
  } catch (err) {
    log('error', `Could not save settings: ${(err as Error).message}`);
  }
}

async function refreshPrinters(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    printers = list.map((p) => {
      // Chromium reports the default queue through platform-specific options.
      const options = (p.options ?? {}) as Record<string, unknown>;
      return {
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: String(options['printer-is-default'] ?? '') === 'true',
      };
    });
  } catch (err) {
    log('warn', `Could not list printers: ${(err as Error).message}`);
    printers = [];
  }
  refreshTray();
}

function refreshTray(): void {
  trayCtl?.update(
    {
      cloudUrl: CLOUD_URL,
      printerName: settings.printerName,
      paperWidth: settings.paperWidth,
      startWithWindows: isAutostartEnabled({
        platform: process.platform,
        execPath: process.execPath,
        homeDir: app.getPath('home'),
        getLoginItemSettings: () => app.getLoginItemSettings(),
      }),
    },
    printers,
  );
}

/**
 * Silent print: the receipt markup goes into a throwaway hidden window, we
 * measure it so the page height matches the slip, then hand it to the OS queue.
 */
async function printReceipt(html: string, options: { width: PaperWidth }): Promise<PrintResult> {
  const tempFile = path.join(app.getPath('temp'), `deepkhata-receipt-${Date.now()}.html`);
  let win: BrowserWindow | null = null;
  try {
    fs.writeFileSync(tempFile, buildPrintDocument(html, options.width), 'utf8');
    win = new BrowserWindow({
      show: false,
      width: options.width * 4,
      height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });

    await win.loadFile(tempFile);
    const measured = Number(
      await win.webContents.executeJavaScript('document.documentElement.scrollHeight'),
    );
    const pageSize = receiptPageSize(options.width, Number.isFinite(measured) ? measured : 600);

    const deviceName = settings.printerName ?? undefined;
    const outcome = await new Promise<{ success: boolean; failureReason?: string }>((resolve) => {
      win!.webContents.print(
        {
          silent: true,
          printBackground: true,
          pageSize,
          margins: { marginType: 'none' },
          ...(deviceName ? { deviceName } : {}),
        },
        (success, failureReason) => resolve({ success, failureReason }),
      );
    });

    if (!outcome.success) {
      log('error', `Print failed: ${outcome.failureReason ?? 'unknown'}`);
      return { ok: false, error: outcome.failureReason || 'The printer rejected the job.' };
    }
    log('info', `Receipt printed at ${options.width}mm (${pageSize.height} micron tall)`);
    return { ok: true };
  } catch (err) {
    log('error', `Print threw: ${(err as Error).message}`);
    return { ok: false, error: (err as Error).message };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    fs.rm(tempFile, { force: true }, () => undefined);
  }
}

/** ESC/POS pulse to the chosen printer (falls back to the OS default queue). */
async function openCashDrawer(): Promise<PrintResult> {
  let name = settings.printerName;
  if (!name && printers.length === 0) await refreshPrinters();
  if (!name) name = printers.find((p) => p.isDefault)?.name ?? null;

  const target = settings.drawerTarget ?? buildRawTarget(name ?? '', process.platform);
  const result = writeRawBytes(target, CASH_DRAWER_PULSE);
  if (!result.ok) log('warn', `Drawer kick failed: ${result.error}`);
  return result;
}

function currentWindowState(): WindowState {
  if (!mainWindow || mainWindow.isDestroyed()) return { width: MIN_WINDOW.width, height: MIN_WINDOW.height, isMaximized: false };
  const isMaximized = mainWindow.isMaximized();
  const bounds = mainWindow.getNormalBounds();
  return { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, isMaximized };
}

function persistWindowState(): void {
  saveWindowState(userData, currentWindowState());
}

function scheduleWindowStateSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistWindowState();
  }, 500);
}

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const state = sanitizeWindowState(readWindowState(userData), workArea);

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    show: false,
    title: APP_NAME,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (state.isMaximized) mainWindow.maximize();
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    void refreshPrinters();
    refreshTray();
    if (!startHidden) mainWindow?.show();
    startHidden = false;
  });

  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('move', scheduleWindowStateSave);
  // Closing keeps the counter in the tray; Quit in the tray really exits.
  mainWindow.on('close', (event) => {
    persistWindowState();
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // A dead network is the cloud app's own offline mode; this only retries a
  // hard navigation failure (no service-worker shell served at all).
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || quitting || errorCode === -3 /* aborted */) return;
    log('warn', `Load failed (${errorCode} ${errorDescription}); retrying in ${RETRY_MS / 1000}s`);
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void mainWindow?.loadURL(CLOUD_URL);
    }, RETRY_MS);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  });

  void mainWindow.loadURL(CLOUD_URL);
}

function boot(): void {
  userData = app.getPath('userData');
  settings = loadShellSettings(userData);
  startHidden = shouldOpenHidden(process.argv);
  log('info', `${APP_NAME} ${app.getVersion()} -> ${CLOUD_URL}`);

  registerIpcHandlers(ipcMain, { print: printReceipt, openDrawer: openCashDrawer });

  trayCtl = createTray(APP_NAME, undefined, {
    open: createWindow,
    choosePrinter: (name) => {
      persistSettings({ printerName: name });
      refreshTray();
    },
    chooseWidth: (width) => {
      persistSettings({ paperWidth: width });
      refreshTray();
    },
    toggleStartWithWindows: () => {
      const enabled = !isAutostartEnabled({
        platform: process.platform,
        execPath: process.execPath,
        homeDir: app.getPath('home'),
        getLoginItemSettings: () => app.getLoginItemSettings(),
      });
      applyAutostart(enabled, {
        platform: process.platform,
        execPath: process.execPath,
        homeDir: app.getPath('home'),
        setLoginItemSettings: (value) => app.setLoginItemSettings(value),
      });
      log('info', `Start with Windows: ${enabled ? 'on' : 'off'}`);
      refreshTray();
    },
    quit: () => {
      quitting = true;
      app.quit();
    },
  });

  createWindow();
  refreshTimer = setInterval(() => void refreshPrinters(), PRINTER_REFRESH_MS);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    startHidden = false;
    createWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // The shell lives in the tray like a shop appliance.
  app.on('window-all-closed', () => {
    /* keep running */
  });

  app.on('before-quit', () => {
    quitting = true;
    if (saveTimer) clearTimeout(saveTimer);
    persistWindowState();
  });

  app.on('will-quit', () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (refreshTimer) clearInterval(refreshTimer);
    trayCtl?.destroy();
  });

  void app
    .whenReady()
    .then(() => {
      boot();
    })
    .catch((err: Error) => {
      log('error', `Startup failed: ${err.stack ?? err.message}`);
    });
}
