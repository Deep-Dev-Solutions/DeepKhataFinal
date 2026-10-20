import { app, BrowserWindow, dialog, shell, utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isBackupDue, listBackups, runBackup } from './backup';
import { checkStartup, getIntegrityStatus, markCleanShutdown } from './integrity';
import { getBindHost, getClientUrls, getCorsOrigins, getLanAddresses, renderLanPage } from './lan';
import { evaluateLicence, getLicencePublicKeyPem, READ_ONLY_STATES } from './licence';
import type { LicenceResult } from './licence';
import { waitForHealth } from './health';
import { runMigrations } from './migrate';
import { buildDatabaseUrl, resolveResourcePaths } from './paths';
import { DB_NAME, DB_USER, resolvePgDumpPath, startEmbeddedPostgres } from './postgres';
import type { EmbeddedPgHandle } from './postgres';
import { getPortOrFree } from './ports';
import { getOrCreateDbPassword, getOrCreateDeviceId, getOrCreateSecret, loadSettings, saveSettings } from './settings';
import type { Settings } from './settings';
import { StateStore } from './state';
import { createTray } from './tray';
import type { ServiceStatus, TrayStatus } from './tray';

const APP_NAME = process.env.APP_NAME || 'DeepKhata';
const HOUR_MS = 60 * 60 * 1000;

let userData = '';
let settings: Settings = { lanMode: false };
let stateStore: StateStore;
let deviceId = '';
let licence: LicenceResult = { state: 'invalid' };
let pg: EmbeddedPgHandle | null = null;
let apiProc: UtilityProcess | null = null;
let clientProc: UtilityProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let clientPort = 0;
let apiPort = 0;
let quitting = false;
let trayCtl: ReturnType<typeof createTray> | null = null;
let timers: NodeJS.Timeout[] = [];
const status: TrayStatus = {
  db: 'starting',
  api: 'starting',
  sync: 'n/a (offline)',
  lanMode: false,
  uncleanShutdown: false,
  licence: 'checking',
};

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

function setStatus(patch: Partial<TrayStatus>): void {
  Object.assign(status, patch);
  trayCtl?.update(status);
}

function refreshLicence(): LicenceResult {
  const tokenFile = path.join(userData, 'licence.txt');
  const token = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : null;
  const now = new Date();
  licence = evaluateLicence({
    token,
    publicKeyPem: getLicencePublicKeyPem(),
    now,
    state: stateStore,
    deviceId,
  });
  // Only move lastSeenAt forward while the clock looks sane.
  if (licence.state !== 'clock_rollback') stateStore.touch(now);
  setStatus({ licence: licence.state });
  if (READ_ONLY_STATES.includes(licence.state)) log('warn', `Licence state ${licence.state}: API will be read-only`);
  return licence;
}

function forkService(name: string, entry: string, cwd: string, env: Record<string, string>): UtilityProcess {
  const child = utilityProcess.fork(entry, [], {
    cwd,
    env: { ...process.env, ...env } as Record<string, string>,
    stdio: 'pipe',
    serviceName: `${APP_NAME}-${name}`,
  });
  child.stdout?.on('data', (d: Buffer) => log('info', `[${name}] ${d.toString()}`));
  child.stderr?.on('data', (d: Buffer) => log('error', `[${name}] ${d.toString()}`));
  child.once('exit', (code) => {
    log(quitting ? 'info' : 'error', `${name} exited with code ${code}`);
    if (!quitting) setStatus(name === 'api' ? { api: 'error' } : {});
  });
  return child;
}

function stopProcess(child: UtilityProcess | null, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve) => {
    if (!child) return resolve();
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

async function startWebServices(paths: ReturnType<typeof resolveResourcePaths>): Promise<void> {
  if (!pg) throw new Error('Database not running');
  const bindHost = getBindHost(settings.lanMode);
  const clientUrls = getClientUrls(settings.lanMode, clientPort, getLanAddresses());
  const dbUrl = buildDatabaseUrl({ user: DB_USER, password: pg.connection.password, port: pg.connection.port, database: DB_NAME });

  setStatus({ api: 'starting' });
  apiProc = forkService('api', paths.serverMain, paths.serverRoot, {
    NODE_ENV: 'production',
    PORT: String(apiPort),
    // NOTE(X2): apps/server/src/main.ts currently calls app.listen(port) with no host.
    // It must honour HOST for LAN mode off to really mean 127.0.0.1 only.
    HOST: bindHost,
    DATABASE_URL: dbUrl,
    DIRECT_URL: dbUrl,
    CORS_ORIGINS: getCorsOrigins(clientUrls, clientPort).join(','),
    FRONTEND_URL: clientUrls[0],
    APP_NAME,
    DEPLOYMENT_MODE: 'desktop',
    DESKTOP_LICENSE_STATE: licence.state,
    ACCESS_TOKEN_SECRET: getOrCreateSecret(userData, 'access-token-secret', 32),
    REFRESH_TOKEN_SECRET: getOrCreateSecret(userData, 'refresh-token-secret', 32),
    ACCESS_TOKEN_EXPIRATION: process.env.ACCESS_TOKEN_EXPIRATION || '15m',
    REFRESH_TOKEN_EXPIRATION: process.env.REFRESH_TOKEN_EXPIRATION || '30d',
  });

  clientProc = forkService('client', paths.clientServer, paths.clientDir, {
    NODE_ENV: 'production',
    PORT: String(clientPort),
    HOSTNAME: bindHost,
  });

  await waitForHealth(`http://127.0.0.1:${apiPort}/health`, { timeoutMs: 90_000 });
  setStatus({ api: 'running' });
  await waitForHealth(`http://127.0.0.1:${clientPort}/`, { timeoutMs: 90_000 });
}

async function stopWebServices(): Promise<void> {
  await stopProcess(clientProc);
  clientProc = null;
  await stopProcess(apiProc);
  apiProc = null;
  setStatus({ api: 'stopped' });
}

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: APP_NAME,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Closing the window keeps the Shop Server running in the tray.
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
  void mainWindow.loadURL(`http://127.0.0.1:${clientPort}/`);
}

async function backupNow(): Promise<void> {
  if (!pg) return;
  try {
    const info = await runBackup({
      pgDumpPath: resolvePgDumpPath(process.resourcesPath),
      connection: pg.connection,
      dir: path.join(userData, 'backups'),
      keep: 14,
      now: new Date(),
      appName: APP_NAME,
    });
    log('info', `Backup written: ${info.name}`);
    setStatus({ sync: `last backup ${info.createdAt.toLocaleString()}` });
  } catch (err) {
    log('error', `Backup failed: ${(err as Error).message}`);
    setStatus({ sync: 'backup FAILED' });
  }
}

async function maybeDailyBackup(): Promise<void> {
  const existing = await listBackups(path.join(userData, 'backups'));
  if (isBackupDue(existing, new Date())) await backupNow();
}

function showLanInfo(): void {
  const urls = getClientUrls(settings.lanMode, clientPort, getLanAddresses());
  const html = renderLanPage({ appName: APP_NAME, lanMode: settings.lanMode, urls });
  const win = new BrowserWindow({ width: 560, height: 360, title: `${APP_NAME} - LAN`, autoHideMenuBar: true });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function toggleLanMode(): Promise<void> {
  settings = { ...settings, lanMode: !settings.lanMode };
  saveSettings(userData, settings);
  setStatus({ lanMode: settings.lanMode });
  await stopWebServices();
  await startWebServices(paths());
  mainWindow?.loadURL(`http://127.0.0.1:${clientPort}/`);
}

function paths() {
  return resolveResourcePaths({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, appDir: __dirname });
}

async function shutdown(): Promise<void> {
  if (quitting) return;
  quitting = true;
  timers.forEach(clearInterval);
  timers = [];
  // Order: window -> client -> API -> Postgres.
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  await stopProcess(clientProc);
  await stopProcess(apiProc);
  try {
    await pg?.stop();
  } catch (err) {
    log('error', `Postgres stop failed: ${(err as Error).message}`);
    app.exit(1);
    return; // marker intentionally left behind -> unclean shutdown on next start
  }
  setStatus({ db: 'stopped', api: 'stopped' });
  trayCtl?.destroy();
  markCleanShutdown(userData);
  app.exit(0);
}

async function boot(): Promise<void> {
  userData = app.getPath('userData');
  const integrity = checkStartup(userData, log);
  deviceId = getOrCreateDeviceId(userData);
  stateStore = new StateStore(userData, deviceId);
  log('info', `Device id: ${deviceId}`);
  settings = loadSettings(userData);
  setStatus({ lanMode: settings.lanMode, uncleanShutdown: integrity.uncleanShutdown });
  refreshLicence();

  trayCtl = createTray(APP_NAME, undefined, {
    open: createWindow,
    backupNow: () => void backupNow(),
    toggleLanMode: () => void toggleLanMode(),
    showLanInfo,
    quit: () => void shutdown(),
  });
  trayCtl.update(status);

  const p = paths();
  const dbPort = await getPortOrFree(undefined);
  apiPort = await getPortOrFree(Number(process.env.DESKTOP_API_PORT) || 5000);
  clientPort = await getPortOrFree(Number(process.env.DESKTOP_CLIENT_PORT) || 3000);
  log('info', `Ports: db=${dbPort} api=${apiPort} client=${clientPort}`);

  pg = await startEmbeddedPostgres({
    dataDir: path.join(userData, 'pgdata'),
    port: dbPort,
    password: getOrCreateDbPassword(userData),
    onLog: (m) => log('info', `[pg] ${m}`),
  });
  setStatus({ db: 'running' });

  await runMigrations({
    serverRoot: p.serverRoot,
    schemaPath: p.prismaSchema,
    databaseUrl: buildDatabaseUrl({ user: DB_USER, password: pg.connection.password, port: dbPort, database: DB_NAME }),
    onLog: (m) => log('info', `[migrate] ${m}`),
  });

  await startWebServices(p);
  createWindow();

  timers.push(
    setInterval(() => void maybeDailyBackup(), HOUR_MS),
    setInterval(() => {
      refreshLicence();
    }, HOUR_MS),
  );
  void maybeDailyBackup();
  log('info', `Integrity: ${JSON.stringify(getIntegrityStatus())}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => createWindow());
  app.on('window-all-closed', () => {
    /* keep running in the tray */
  });
  app.on('before-quit', (e) => {
    if (!quitting) {
      e.preventDefault();
      void shutdown();
    }
  });
  void app
    .whenReady()
    .then(boot)
    .catch(async (err: Error) => {
      log('error', `Startup failed: ${err.stack ?? err.message}`);
      setStatus({ db: pg ? 'running' : 'error', api: 'error' });
      dialog.showErrorBox(`${APP_NAME} could not start`, err.message);
      await shutdown();
    });
}
