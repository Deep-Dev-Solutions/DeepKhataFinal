import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TURNSTILE_VERIFY_URL, captchaEnabled, checkCaptcha } from './captcha';

describe('checkCaptcha', () => {
  const saved = process.env.TURNSTILE_SECRET_KEY;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    if (saved === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = saved;
  });

  const reply = (body: unknown, status = 200) =>
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('is a no-op without a secret', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(captchaEnabled()).toBe(false);
    expect(await checkCaptcha(undefined)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks for a token before calling Cloudflare', async () => {
    expect(await checkCaptcha(undefined)).toBe('CAPTCHA_REQUIRED');
    expect(await checkCaptcha('   ')).toBe('CAPTCHA_REQUIRED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts secret, response and remoteip with a timeout signal', async () => {
    reply({ success: true });
    expect(await checkCaptcha('tok', '1.2.3.4')).toBeNull();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ secret: 'secret', response: 'tok', remoteip: '1.2.3.4' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects success:false, HTTP errors, bad JSON and network errors', async () => {
    reply({ success: false });
    expect(await checkCaptcha('tok')).toBe('CAPTCHA_INVALID');
    reply({ success: true }, 503);
    expect(await checkCaptcha('tok')).toBe('CAPTCHA_INVALID');
    fetchSpy.mockResolvedValue(new Response('<html>', { status: 200 }));
    expect(await checkCaptcha('tok')).toBe('CAPTCHA_INVALID');
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));
    expect(await checkCaptcha('tok')).toBe('CAPTCHA_INVALID');
  });

  it('fails closed on a timeout abort', async () => {
    fetchSpy.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    expect(await checkCaptcha('tok')).toBe('CAPTCHA_INVALID');
  });
});
