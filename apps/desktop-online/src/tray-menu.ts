import type { MenuItemConstructorOptions } from 'electron';
import type { PaperWidth } from './printer';

export interface PrinterChoice {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface TrayMenuState {
  cloudUrl: string;
  printerName: string | null;
  paperWidth: PaperWidth;
  startWithWindows: boolean;
}

export interface TrayMenuActions {
  open(): void;
  choosePrinter(name: string | null): void;
  chooseWidth(width: PaperWidth): void;
  toggleStartWithWindows(): void;
  quit(): void;
}

/**
 * Tray menu for the cloud shell: what the shop needs at the counter, nothing
 * more. Called again after every change so the radios reflect the saved choice.
 */
export function buildTrayMenuTemplate(
  state: TrayMenuState,
  actions: TrayMenuActions,
  printers: PrinterChoice[],
): MenuItemConstructorOptions[] {
  let host = state.cloudUrl;
  try {
    host = new URL(state.cloudUrl).host;
  } catch {
    /* keep the raw string */
  }

  const printerItems: MenuItemConstructorOptions[] = [
    {
      label: 'System default',
      type: 'radio',
      checked: state.printerName === null,
      click: () => actions.choosePrinter(null),
    },
    ...printers.map(
      (printer): MenuItemConstructorOptions => ({
        label: printer.displayName || printer.name,
        type: 'radio',
        checked: state.printerName === printer.name,
        click: () => actions.choosePrinter(printer.name),
      }),
    ),
  ];
  if (printers.length === 0) {
    printerItems.push({ label: 'No printers found', enabled: false });
  }

  return [
    { label: host, enabled: false },
    { type: 'separator' },
    { label: 'Open', click: actions.open },
    { label: 'Receipt printer', submenu: printerItems },
    {
      label: 'Paper width',
      submenu: [
        { label: '80 mm', type: 'radio', checked: state.paperWidth === 80, click: () => actions.chooseWidth(80) },
        { label: '58 mm', type: 'radio', checked: state.paperWidth === 58, click: () => actions.chooseWidth(58) },
      ],
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: state.startWithWindows,
      click: actions.toggleStartWithWindows,
    },
    { type: 'separator' },
    { label: 'Quit', click: actions.quit },
  ];
}
