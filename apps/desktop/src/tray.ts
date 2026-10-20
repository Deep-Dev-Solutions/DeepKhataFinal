import { Menu, Tray, nativeImage } from 'electron';

export type ServiceStatus = 'starting' | 'running' | 'stopped' | 'error';

export interface TrayStatus {
  db: ServiceStatus;
  api: ServiceStatus;
  /** Sync = last backup / sync info line, free text. */
  sync: string;
  lanMode: boolean;
  uncleanShutdown: boolean;
  licence: string;
}

export interface TrayActions {
  open(): void;
  backupNow(): void;
  toggleLanMode(): void;
  showLanInfo(): void;
  quit(): void;
}

// 16x16 solid green PNG so the tray works without shipping an asset.
const FALLBACK_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVR4nGNgGAWjYBSMglEwCkbBMAAAAAgAAZt9n2cAAAAASUVORK5CYII=';

const label: Record<ServiceStatus, string> = {
  starting: 'starting...',
  running: 'running',
  stopped: 'stopped',
  error: 'ERROR',
};

export function buildTrayMenuTemplate(status: TrayStatus, actions: TrayActions): Electron.MenuItemConstructorOptions[] {
  return [
    { label: `Database: ${label[status.db]}`, enabled: false },
    { label: `API: ${label[status.api]}`, enabled: false },
    { label: `Sync: ${status.sync}`, enabled: false },
    { label: `Licence: ${status.licence}`, enabled: false },
    ...(status.uncleanShutdown
      ? [{ label: 'Warning: last shutdown was not clean', enabled: false } as Electron.MenuItemConstructorOptions]
      : []),
    { type: 'separator' },
    { label: 'Open', click: actions.open },
    { label: 'Backup now', click: actions.backupNow },
    { label: 'Other counters (LAN mode)', type: 'checkbox', checked: status.lanMode, click: actions.toggleLanMode },
    { label: 'Show LAN address', click: actions.showLanInfo },
    { type: 'separator' },
    { label: 'Quit', click: actions.quit },
  ];
}

export function createTray(appName: string, iconPath: string | undefined, actions: TrayActions) {
  let icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (icon.isEmpty()) icon = nativeImage.createFromDataURL(`data:image/png;base64,${FALLBACK_ICON}`);
  const tray = new Tray(icon);
  tray.setToolTip(appName);
  tray.on('double-click', actions.open);
  return {
    tray,
    update(status: TrayStatus) {
      tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate(status, actions)));
    },
    destroy() {
      tray.destroy();
    },
  };
}
