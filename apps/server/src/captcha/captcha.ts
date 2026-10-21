/**
 * Cloudflare Turnstile verification, shared by the Nest routes (CaptchaService)
 * and the Better Auth hooks (better-auth.ts). Pure functions, no Nest imports,
 * so the Better Auth singleton can use them.
 *
 * Disabled (every check passes) when TURNSTILE_SECRET_KEY is unset: dev, tests,
 * E2E and desktop mode. Read at call time so a restart is not needed in tests.
 */
export const CAPTCHA_HEADER = 'x-captcha-response';
export const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_TIMEOUT_MS = 5000;
const MAX_TOKEN_LENGTH = 4096;

export type CaptchaCode = 'CAPTCHA_REQUIRED' | 'CAPTCHA_INVALID';

export const CAPTCHA_MESSAGES: Record<CaptchaCode, string> = {
  CAPTCHA_REQUIRED: 'Please complete the captcha check and try again.',
  CAPTCHA_INVALID: 'The captcha check failed. Please try again.',
};

export function captchaEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY?.trim();
}

/** Returns null when the request may proceed, otherwise the error code to raise. */
export async function checkCaptcha(
  token: string | null | undefined,
  ip?: string,
): Promise<CaptchaCode | null> {
  if (!captchaEnabled()) return null;
  const value = typeof token === 'string' ? token.trim() : '';
  if (!value) return 'CAPTCHA_REQUIRED';
  if (value.length > MAX_TOKEN_LENGTH) return 'CAPTCHA_INVALID';

  try {
    const body: Record<string, string> = {
      secret: process.env.TURNSTILE_SECRET_KEY!.trim(),
      response: value,
    };
    if (ip) body.remoteip = ip;
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
    if (!res.ok) return 'CAPTCHA_INVALID';
    const json = (await res.json()) as { success?: boolean };
    return json?.success === true ? null : 'CAPTCHA_INVALID';
  } catch {
    // Timeout, DNS or parse failure: fail closed.
    return 'CAPTCHA_INVALID';
  }
}
