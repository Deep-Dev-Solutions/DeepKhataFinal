import { describe, expect, it, vi } from 'vitest';
import {
  buildPrintDocument,
  buildRawTarget,
  CASH_DRAWER_PULSE,
  pxToMicrons,
  receiptPageSize,
  widthToMicrons,
  writeRawBytes,
} from '../src/printer';

describe('page geometry', () => {
  it('converts CSS px at 96 dpi to microns', () => {
    expect(pxToMicrons(96)).toBe(25_400);
    expect(pxToMicrons(0)).toBe(0);
  });

  it('maps the roll width to microns', () => {
    expect(widthToMicrons(58)).toBe(58_000);
    expect(widthToMicrons(80)).toBe(80_000);
  });

  it('sizes the page to the measured content with a feed allowance', () => {
    const page = receiptPageSize(80, 960); // 10 inches of receipt
    expect(page.width).toBe(80_000);
    expect(page.height).toBe(pxToMicrons(960) + 4_000);
  });

  it('clamps a broken measurement instead of asking for metres of paper', () => {
    expect(receiptPageSize(58, 0).height).toBe(40_000);
    expect(receiptPageSize(58, -50).height).toBe(40_000);
    expect(receiptPageSize(80, 10_000_000).height).toBe(500_000);
  });
});

describe('buildPrintDocument', () => {
  it('sets the page size, zero margins and the receipt body', () => {
    const doc = buildPrintDocument('<b>Order 12</b>', 58);
    expect(doc).toContain('@page { size: 58mm auto; margin: 0; }');
    expect(doc).toContain('width: 58mm');
    expect(doc).toContain('<body><b>Order 12</b></body>');
    expect(doc).toContain('print-color-adjust: exact');
  });

  it('uses a slightly larger base font on 80 mm paper', () => {
    expect(buildPrintDocument('x', 80)).toContain('font-size: 12px');
    expect(buildPrintDocument('x', 58)).toContain('font-size: 10px');
  });
});

describe('cash drawer raw target', () => {
  it('writes through the local Windows queue', () => {
    expect(buildRawTarget('POS-80', 'win32')).toBe('\\\\localhost\\POS-80');
    expect(buildRawTarget('  Xprinter XP-58  ', 'win32')).toBe('\\\\localhost\\Xprinter XP-58');
  });

  it('normalises a UNC path to the local machine', () => {
    expect(buildRawTarget('\\\\COUNTER-PC\\POS-80', 'win32')).toBe('\\\\localhost\\POS-80');
  });

  it('only accepts an explicit device path on POSIX', () => {
    expect(buildRawTarget('/dev/usb/lp0', 'linux')).toBe('/dev/usb/lp0');
    expect(buildRawTarget('POS-80', 'linux')).toBeNull();
  });

  it('has no target for an empty printer name', () => {
    expect(buildRawTarget('', 'win32')).toBeNull();
    expect(buildRawTarget('   ', 'win32')).toBeNull();
  });

  it('sends the ESC/POS pulse: reset then pin 2 kick', () => {
    expect([...CASH_DRAWER_PULSE]).toEqual([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });
});

describe('writeRawBytes', () => {
  it('writes the bytes to the target', () => {
    const writeFileSync = vi.fn();
    expect(writeRawBytes('\\\\localhost\\POS-80', CASH_DRAWER_PULSE, { writeFileSync })).toEqual({
      ok: true,
    });
    expect(writeFileSync).toHaveBeenCalledWith('\\\\localhost\\POS-80', CASH_DRAWER_PULSE);
  });

  it('reports a missing target instead of throwing', () => {
    expect(writeRawBytes(null, CASH_DRAWER_PULSE).ok).toBe(false);
  });

  it('reports a driver error instead of throwing', () => {
    const result = writeRawBytes('\\\\localhost\\POS-80', CASH_DRAWER_PULSE, {
      writeFileSync: () => {
        throw new Error('EBUSY');
      },
    });
    expect(result).toEqual({ ok: false, error: 'EBUSY' });
  });
});
