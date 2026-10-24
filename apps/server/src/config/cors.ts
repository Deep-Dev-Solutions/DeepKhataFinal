/**
 * Allowed browser origins. Comma-separated CORS_ORIGINS overrides the default
 * local list (production sets it to the app/admin domains).
 */
const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw || !raw.trim()) return DEFAULT_ORIGINS;
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
