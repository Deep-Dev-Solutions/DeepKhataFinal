/**
 * Normalise a Pakistani phone number to international digits without '+'
 * (e.g. 923001234567), or null when it cannot be recognised.
 */
export function normalizePkPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^92\d{10}$/.test(d)) return d;
  if (/^03\d{9}$/.test(d)) return `92${d.slice(1)}`;
  if (/^3\d{9}$/.test(d)) return `92${d}`;
  return null;
}
