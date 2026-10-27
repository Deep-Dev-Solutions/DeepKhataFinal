import { Menu, Tray, nativeImage } from 'electron';
import type { PrinterChoice, TrayMenuActions, TrayMenuState } from './tray-menu';
import { buildTrayMenuTemplate } from './tray-menu';

// 16x16 solid green PNG so the tray works without shipping an asset.
const FALLBACK_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVR4nGNgGAWjYBSMglEwCkbBMAAAAAgAAZt9n2cAAAAASUVORK5CYII=';

export function createTray(appName: string, iconPath: string | undefined, actions: TrayMenuActions) {
  let icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (icon.isEmpty()) icon = nativeImage.createFromDataURL(`data:image/png;base64,${FALLBACK_ICON}`);
  const tray = new Tray(icon);
  tray.setToolTip(appName);
  tray.on('double-click', actions.open);
  return {
    tray,
    update(state: TrayMenuState, printers: PrinterChoice[]) {
      tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate(state, actions, printers)));
    },
    destroy() {
      tray.destroy();
    },
  };
}
