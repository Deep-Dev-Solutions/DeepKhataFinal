import { describe, expect, it, vi } from 'vitest';
import {
  createBridge,
  normalizePaperWidth,
  OPEN_DRAWER_CHANNEL,
  PRINT_RECEIPT_CHANNEL,
  registerIpcHandlers,
  sanitizeReceiptHtml,
  toPrintResult,
} from '../src/ipc';

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>();
  return {
    handlers,
    handle(channel: string, listener: (event: unknown, payload?: unknown) => unknown) {
      handlers.set(channel, listener);
    },
  };
}

describe('sanitizeReceiptHtml', () => {
  it('keeps the receipt markup intact', () => {
    const html = '<div class="text-center"><b>Order 12</b> Rs. 1,500</div>';
    expect(sanitizeReceiptHtml(html)).toBe(html);
  });

  it('drops scripts, inline handlers and javascript: URLs', () => {
    const dirty =
      '<div onclick="steal()">Sale<img src=x onerror="alert(1)"><script>fetch("/x")</script>' +
      '<a href="javascript:alert(1)">x</a></div>';
    const clean = sanitizeReceiptHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('<div>Sale');
  });

  it('rejects non-string, empty or oversized markup', () => {
    expect(() => sanitizeReceiptHtml(undefined)).toThrow(/string/);
    expect(() => sanitizeReceiptHtml('   ')).toThrow(/empty/);
    expect(() => sanitizeReceiptHtml('<p>x</p>'.repeat(200_000))).toThrow(/too large/);
  });
});

describe('normalizePaperWidth', () => {
  it('only accepts 58 or 80, defaulting to 80 mm', () => {
    expect(normalizePaperWidth(58)).toBe(58);
    expect(normalizePaperWidth('58')).toBe(58);
    expect(normalizePaperWidth(80)).toBe(80);
    expect(normalizePaperWidth(undefined)).toBe(80);
    expect(normalizePaperWidth(57)).toBe(80);
    expect(normalizePaperWidth('a4')).toBe(80);
  });
});

describe('createBridge (what the preload exposes)', () => {
  it('exposes exactly printReceipt and openCashDrawer', () => {
    const bridge = createBridge(async () => ({ ok: true }));
    expect(Object.keys(bridge).sort()).toEqual(['openCashDrawer', 'printReceipt']);
  });

  it('forwards the receipt to the main process with a normalised width', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const bridge = createBridge(invoke);

    await expect(bridge.printReceipt('<b>hi</b>', { width: 58 })).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith(PRINT_RECEIPT_CHANNEL, { html: '<b>hi</b>', width: 58 });

    await bridge.printReceipt('<b>hi</b>');
    expect(invoke).toHaveBeenLastCalledWith(PRINT_RECEIPT_CHANNEL, { html: '<b>hi</b>', width: 80 });
  });

  it('asks the main process for a drawer kick', async () => {
    const invoke = vi.fn(async () => ({ ok: false, error: 'No printer' }));
    const bridge = createBridge(invoke);
    await expect(bridge.openCashDrawer()).resolves.toEqual({ ok: false, error: 'No printer' });
    expect(invoke).toHaveBeenCalledWith(OPEN_DRAWER_CHANNEL);
  });

  it('normalises odd main-process replies', async () => {
    await expect(createBridge(async () => true).printReceipt('x')).resolves.toEqual({ ok: true });
    await expect(createBridge(async () => undefined).printReceipt('x')).resolves.toEqual({ ok: false });
    await expect(createBridge(async () => ({ ok: 'yes' })).printReceipt('x')).resolves.toEqual({ ok: false });
  });

  it('toPrintResult never invents an error string', () => {
    expect(toPrintResult({ ok: false, error: '' })).toEqual({ ok: false });
    expect(toPrintResult({ ok: true, error: 'ignored' })).toEqual({ ok: true, error: 'ignored' });
  });
});

describe('registerIpcHandlers (main process)', () => {
  it('sanitizes before printing and passes the roll width through', async () => {
    const ipc = fakeIpcMain();
    const print = vi.fn(async () => ({ ok: true }));
    registerIpcHandlers(ipc, { print, openDrawer: async () => ({ ok: true }) });

    const handler = ipc.handlers.get(PRINT_RECEIPT_CHANNEL)!;
    await expect(handler({}, { html: '<p onclick="x()">Sale</p>', width: 58 })).resolves.toEqual({
      ok: true,
    });
    expect(print).toHaveBeenCalledWith('<p>Sale</p>', { width: 58 });
  });

  it('returns an error result instead of throwing for bad input', async () => {
    const ipc = fakeIpcMain();
    registerIpcHandlers(ipc, {
      print: async () => ({ ok: true }),
      openDrawer: async () => ({ ok: true }),
    });
    const handler = ipc.handlers.get(PRINT_RECEIPT_CHANNEL)!;

    await expect(handler({}, { html: '' })).resolves.toMatchObject({ ok: false });
    await expect(handler({}, null)).resolves.toMatchObject({ ok: false });
  });

  it('surfaces a print failure and a drawer failure without crashing', async () => {
    const ipc = fakeIpcMain();
    registerIpcHandlers(ipc, {
      print: async () => ({ ok: false, error: 'Offline printer' }),
      openDrawer: async () => {
        throw new Error('No shared queue');
      },
    });

    await expect(ipc.handlers.get(PRINT_RECEIPT_CHANNEL)!({}, { html: '<p>x</p>' })).resolves.toEqual({
      ok: false,
      error: 'Offline printer',
    });
    await expect(ipc.handlers.get(OPEN_DRAWER_CHANNEL)!({})).resolves.toEqual({
      ok: false,
      error: 'No shared queue',
    });
  });

  it('opens the drawer through the injected implementation', async () => {
    const ipc = fakeIpcMain();
    const openDrawer = vi.fn(async () => ({ ok: true }));
    registerIpcHandlers(ipc, { print: async () => ({ ok: true }), openDrawer });
    await expect(ipc.handlers.get(OPEN_DRAWER_CHANNEL)!({})).resolves.toEqual({ ok: true });
    expect(openDrawer).toHaveBeenCalledTimes(1);
  });
});
