import { afterEach, describe, expect, it } from 'vitest';
import {
  DISPOSABLE_DOMAIN_COUNT,
  assertEmailAllowed,
  emailDomain,
  isDisposableEmail,
} from './disposable-email';

describe('disposable email domains', () => {
  afterEach(() => {
    delete process.env.DISPOSABLE_EMAIL_EXTRA;
    delete process.env.DISPOSABLE_EMAIL_ALLOW;
  });

  it('ships a few hundred domains', () => {
    expect(DISPOSABLE_DOMAIN_COUNT).toBeGreaterThan(300);
  });

  it.each([
    'a@mailinator.com',
    'a@guerrillamail.com',
    'a@10minutemail.com',
    'a@yopmail.com',
    'a@temp-mail.org',
    'a@sharklasers.com',
    'a@getnada.com',
    'a@dispostable.com',
    'a@maildrop.cc',
    'a@trashmail.com',
    'a@throwawaymail.com',
    'a@fakeinbox.com',
    'a@mohmal.com',
    'a@emailondeck.com',
  ])('blocks %s', (email) => {
    expect(isDisposableEmail(email)).toBe(true);
  });

  it('is case-insensitive and subdomain-aware', () => {
    expect(isDisposableEmail('A@MAILINATOR.COM')).toBe(true);
    expect(isDisposableEmail('a@x.mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@deep.sub.Yopmail.com')).toBe(true);
    expect(isDisposableEmail('a@mailinator.com.')).toBe(true);
  });

  it('does not block ordinary providers or look-alike suffixes', () => {
    for (const e of ['a@gmail.com', 'a@outlook.com', 'a@yahoo.com', 'a@notmailinator.org', 'a@example.pk', 'nodomain']) {
      expect(isDisposableEmail(e), e).toBe(false);
    }
    expect(isDisposableEmail('a@fakemailinator.com')).toBe(false);
  });

  it('DISPOSABLE_EMAIL_EXTRA adds domains (and subdomains)', () => {
    expect(isDisposableEmail('a@shady.example')).toBe(false);
    process.env.DISPOSABLE_EMAIL_EXTRA = ' Shady.example , @other.example';
    expect(isDisposableEmail('a@shady.example')).toBe(true);
    expect(isDisposableEmail('a@mx.other.example')).toBe(true);
  });

  it('DISPOSABLE_EMAIL_ALLOW overrides built-in and extra entries', () => {
    process.env.DISPOSABLE_EMAIL_ALLOW = 'mailinator.com';
    expect(isDisposableEmail('a@mailinator.com')).toBe(false);
    expect(isDisposableEmail('a@x.mailinator.com')).toBe(false);
    process.env.DISPOSABLE_EMAIL_EXTRA = 'shady.example';
    process.env.DISPOSABLE_EMAIL_ALLOW = 'shady.example';
    expect(isDisposableEmail('a@shady.example')).toBe(false);
  });

  it('assertEmailAllowed throws EMAIL_DOMAIN_NOT_ALLOWED', () => {
    expect(() => assertEmailAllowed('a@mailinator.com')).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'EMAIL_DOMAIN_NOT_ALLOWED' }),
      }),
    );
    expect(() => assertEmailAllowed('a@gmail.com')).not.toThrow();
  });

  it('emailDomain reads the part after the last @', () => {
    expect(emailDomain('a@b@Example.COM')).toBe('example.com');
    expect(emailDomain('nope')).toBeNull();
  });
});
