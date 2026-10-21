import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    '03001234567',
    '0300-1234567',
    '0300 123 4567',
    '+92 300 1234567',
    '+92-300-1234567',
    '+92 (300) 1234567',
    '0092300 1234567',
    '00923001234567',
    '923001234567',
    '3001234567',
    '+92 0300 1234567',
  ])('maps %s to +923001234567', (raw) => {
    expect(normalizePhone(raw)).toBe('+923001234567');
  });

  it('keeps other countries as +digits', () => {
    expect(normalizePhone('+44 7911 123456')).toBe('+447911123456');
    expect(normalizePhone('0044 7911 123456')).toBe('+447911123456');
    expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671');
  });

  it.each([
    '',
    '   ',
    '12345',
    'abcdefghijk',
    '+++',
    '0300-12',
    '0300123456789012345',
    '4155552671', // no country code and not a Pakistani mobile
    '+0 123456789',
    null,
    undefined,
  ])('rejects %s', (raw) => {
    expect(normalizePhone(raw as string)).toBeNull();
  });
});
