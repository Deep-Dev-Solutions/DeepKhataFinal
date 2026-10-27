import type { PaperWidth } from './printer';

/** IPC surface between the renderer bridge and the main process. */
export const PRINT_RECEIPT_CHANNEL = 'deepkhata:print-receipt';
export const OPEN_DRAWER_CHANNEL = 'deepkhata:open-cash-drawer';

/** The only global the preload adds to `window`. */
export const BRIDGE_KEY = 'deepkhata';

export interface PrintResult {
  ok: boolean;
  error?: string;
}

export interface ReceiptOptions {
  width?: PaperWidth;
}

export interface DeepKhataBridge {
  printReceipt(html: string, options?: ReceiptOptions): Promise<PrintResult>;
  openCashDrawer(): Promise<PrintResult>;
}

const MAX_RECEIPT_BYTES = 512 * 1024;

export function normalizePaperWidth(value: unknown): PaperWidth {
  return Number(value) === 58 ? 58 : 80;
}

/**
 * Defence in depth: the markup comes from our own POS, but a thermal printer
 * only needs static HTML, so drop scripts, inline handlers and `javascript:`
 * URLs before the page is ever loaded in the hidden print window.
 */
export function sanitizeReceiptHtml(html: unknown): string {
  if (typeof html !== 'string') throw new Error('Receipt HTML must be a string.');
  const out = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s(?:src|href|srcdoc)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi,
      '',
    )
    .trim();
  if (!out) throw new Error('Receipt HTML is empty.');
  if (Buffer.byteLength(out, 'utf8') > MAX_RECEIPT_BYTES) {
    throw new Error('Receipt HTML is too large to print.');
  }
  return out;
}

const errorText = (err: unknown): string =>
  err instanceof Error ? err.message : String(err ?? 'Unknown print error');

/** Coerce whatever came back over IPC into the shape the renderer expects. */
export function toPrintResult(value: unknown): PrintResult {
  if (value && typeof value === 'object' && 'ok' in value) {
    const result = value as { ok?: unknown; error?: unknown };
    return {
      ok: result.ok === true,
      ...(typeof result.error === 'string' && result.error ? { error: result.error } : {}),
    };
  }
  return { ok: value === true };
}

export type Invoke = (channel: string, payload?: unknown) => Promise<unknown>;

/**
 * The object exposed as `window.deepkhata`. Exactly two methods, both round
 * trips to the main process — the renderer never gets Node access.
 */
export function createBridge(invoke: Invoke): DeepKhataBridge {
  return {
    printReceipt: async (html, options) =>
      toPrintResult(await invoke(PRINT_RECEIPT_CHANNEL, { html, width: normalizePaperWidth(options?.width) })),
    openCashDrawer: async () => toPrintResult(await invoke(OPEN_DRAWER_CHANNEL)),
  };
}

export interface IpcDeps {
  /** Silent print of the sanitized receipt markup at the requested roll width. */
  print(html: string, options: { width: PaperWidth }): Promise<PrintResult>;
  /** ESC/POS drawer pulse to the chosen printer. */
  openDrawer(): Promise<PrintResult>;
}

interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, payload?: unknown) => unknown): void;
}

export function registerIpcHandlers(ipcMain: IpcMainLike, deps: IpcDeps): void {
  ipcMain.handle(PRINT_RECEIPT_CHANNEL, async (_event, payload) => {
    try {
      const html = sanitizeReceiptHtml((payload as { html?: unknown } | null)?.html);
      const width = normalizePaperWidth((payload as { width?: unknown } | null)?.width);
      return await deps.print(html, { width });
    } catch (err) {
      return { ok: false, error: errorText(err) };
    }
  });

  ipcMain.handle(OPEN_DRAWER_CHANNEL, async () => {
    try {
      return await deps.openDrawer();
    } catch (err) {
      return { ok: false, error: errorText(err) };
    }
  });
}
