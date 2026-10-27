import * as nodeFs from 'node:fs';

export type PaperWidth = 58 | 80;

/**
 * ESC/POS cash-drawer kick: `ESC @` (reset) then `ESC p 0 25 250`
 * (pin 2, 50 ms on, 500 ms off). Most Pakistani thermal printers (Xprinter,
 * Rongta, TVS) wire the drawer to pin 2; pin 5 printers ignore it harmlessly.
 */
export const CASH_DRAWER_PULSE = Buffer.from([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);

/** CSS px at 96 dpi -> printer microns (1/1000 mm), which Electron's print API wants. */
export const pxToMicrons = (px: number): number => Math.round((px / 96) * 25.4 * 1000);

/** Printable width in microns for a 58/80 mm roll. */
export const widthToMicrons = (width: PaperWidth): number => width * 1000;

/**
 * Page size for one receipt: roll width by measured content height, with a
 * little room for the last line and the feed. Clamped so a broken measurement
 * can never ask the spooler for metres of paper.
 */
export function receiptPageSize(width: PaperWidth, contentPx: number): { width: number; height: number } {
  const measured = pxToMicrons(Math.max(0, contentPx)) + 4000;
  return {
    width: widthToMicrons(width),
    height: Math.min(Math.max(measured, 40_000), 500_000),
  };
}

/**
 * Self-contained document for the hidden print window. `html` is the app's own
 * receipt markup (already sanitized by `sanitizeReceiptHtml`); this wrapper only
 * adds the roll width, zero margins and exact colours.
 */
export function buildPrintDocument(html: string, width: PaperWidth): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${width}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    width: ${width}mm;
    padding: 2mm 2.5mm;
    box-sizing: border-box;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: ${width === 58 ? 10 : 12}px;
    line-height: 1.25;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  img { max-width: 100%; }
  table { width: 100%; border-collapse: collapse; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
</style>
</head>
<body>${html}</body>
</html>`;
}

/**
 * Where raw bytes (the drawer pulse) can be written for a printer name.
 * Windows: the shared queue as `\\localhost\<share>`. POSIX: only an explicit
 * device path such as `/dev/usb/lp0` can be written to safely.
 */
export function buildRawTarget(printerName: string, platform: NodeJS.Platform): string | null {
  const name = printerName.trim().replace(/[\\/]+$/, '');
  if (!name) return null;
  if (platform === 'win32') {
    const share = name.replace(/^\\\\[^\\]+\\(?:[^\\]+\\)?/, '').replace(/[\\/]+/g, '\\');
    return `\\\\localhost\\${share}`;
  }
  return name.startsWith('/') ? name : null;
}

export interface WriteDeps {
  writeFileSync: (target: string, data: Buffer) => void;
}

/** Push the pulse to the target; never throws, the UI only needs ok/error. */
export function writeRawBytes(
  target: string | null,
  bytes: Buffer,
  deps: Partial<WriteDeps> = {},
): { ok: boolean; error?: string } {
  if (!target) return { ok: false, error: 'No shared printer or device path for the drawer kick.' };
  const write = deps.writeFileSync ?? ((t: string, d: Buffer) => nodeFs.writeFileSync(t, d));
  try {
    write(target, bytes);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
