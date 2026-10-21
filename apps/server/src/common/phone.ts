/**
 * Phone normalisation for one-trial-per-phone. Pakistan first: 03001234567,
 * +92 300 1234567, 0092300..., 923001234567 and 3001234567 all map to
 * +923001234567. Other countries keep their digits with a leading "+" (the
 * number must be written in international form). Returns null for nonsense.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 40) return null;
  // Only digits and common separators are allowed; letters mean it is not a phone.
  if (!/^[+\d\s\-().]+$/.test(trimmed)) return null;

  const hadPlus = trimmed.startsWith('+');
  let d = trimmed.replace(/\D/g, '');
  if (!d) return null;
  if (!hadPlus && d.startsWith('00')) d = d.slice(2);

  // Pakistan mobile: 03XXXXXXXXX, 3XXXXXXXXX, 923XXXXXXXXX.
  if (!hadPlus || d.startsWith('92')) {
    if (/^03\d{9}$/.test(d)) return `+92${d.slice(1)}`;
    if (/^3\d{9}$/.test(d)) return `+92${d}`;
  }
  if (/^92\d{10}$/.test(d)) return `+${d}`;
  if (/^920\d{10}$/.test(d)) return `+92${d.slice(3)}`; // +92 (0)300 ...

  // Everything else must be international: leading + or 00, E.164 length.
  const international = hadPlus || trimmed.replace(/[^\d+]/g, '').startsWith('00');
  if (international && /^[1-9]\d{7,14}$/.test(d)) return `+${d}`;
  return null;
}

export const PHONE_INVALID_MESSAGE =
  'Enter a valid phone number, for example 03001234567 or +92 300 1234567.';
