/**
 * The cloud app this shell loads. `CLOUD_URL` wins over `NEXT_PUBLIC_CLOUD_URL`;
 * anything unparseable falls back to the shipped default so a typo can never
 * leave the user staring at a blank window.
 */
export const DEFAULT_CLOUD_URL = 'https://app.deepkhata.com';

export function resolveCloudUrl(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_CLOUD_URL;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return DEFAULT_CLOUD_URL;
    if (!url.hostname) return DEFAULT_CLOUD_URL;
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return DEFAULT_CLOUD_URL;
  }
}

/** True when the URL is plain http, i.e. a LAN/staging box rather than production. */
export function isInsecureCloudUrl(url: string): boolean {
  return url.startsWith('http://');
}
