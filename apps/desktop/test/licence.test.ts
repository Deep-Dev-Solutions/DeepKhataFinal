import { describe, expect, it } from 'vitest';
import { evaluateLicence } from '../src/licence/service';
import { verifyLicence } from '../src/licence/verify';
import { makeKeys, makePayload, makeToken } from './helpers';

const keys = makeKeys();
const other = makeKeys();
const day = 86_400_000;
const expires = new Date('2026-12-31T00:00:00.000Z');

describe('verifyLicence', () => {
  const token = makeToken(keys.privateKey, makePayload());

  it('valid before expiry', () => {
    const r = verifyLicence(token, keys.publicPem, new Date('2026-06-01T00:00:00Z'));
    expect(r.state).toBe('valid');
    expect(r.payload?.businessId).toBe('biz_1');
    expect(r.graceEndsAt).toBe(new Date(expires.getTime() + 15 * day).toISOString());
  });

  it('grace within 15 days after expiry', () => {
    const r = verifyLicence(token, keys.publicPem, new Date(expires.getTime() + 10 * day));
    expect(r.state).toBe('grace');
    expect(verifyLicence(token, keys.publicPem, new Date(expires.getTime() + 15 * day)).state).toBe('grace');
  });

  it('expired after grace', () => {
    const r = verifyLicence(token, keys.publicPem, new Date(expires.getTime() + 15 * day + 1000));
    expect(r.state).toBe('expired');
  });

  it('bad signature (other key) is invalid', () => {
    expect(verifyLicence(token, other.publicPem, new Date('2026-06-01T00:00:00Z')).state).toBe('invalid');
  });

  it('tampered payload is invalid', () => {
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify(makePayload({ plan: 'enterprise' }))).toString('base64url');
    expect(verifyLicence(`${forged}.${sig}`, keys.publicPem, new Date('2026-06-01T00:00:00Z')).state).toBe('invalid');
  });

  it('garbage tokens and bad keys are invalid, never throw', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(verifyLicence('', keys.publicPem, now).state).toBe('invalid');
    expect(verifyLicence('a.b.c', keys.publicPem, now).state).toBe('invalid');
    expect(verifyLicence('not-a-token', keys.publicPem, now).state).toBe('invalid');
    expect(verifyLicence(token, 'not a pem', now).state).toBe('invalid');
  });

  it('wrong payload shape is invalid even with a good signature', () => {
    const bad = makeToken(keys.privateKey, { ...makePayload(), v: 2 } as never);
    expect(verifyLicence(bad, keys.publicPem, new Date('2026-06-01T00:00:00Z')).state).toBe('invalid');
  });

  it('clock rollback when now is more than 1 day before lastSeenAt', () => {
    const lastSeen = new Date('2026-06-10T12:00:00Z');
    const r = verifyLicence(token, keys.publicPem, new Date('2026-06-08T12:00:00Z'), lastSeen);
    expect(r.state).toBe('clock_rollback');
  });

  it('small backwards drift (<= 1 day) is tolerated', () => {
    const lastSeen = new Date('2026-06-10T12:00:00Z');
    expect(verifyLicence(token, keys.publicPem, new Date('2026-06-09T12:00:00Z'), lastSeen).state).toBe('valid');
  });
});

describe('evaluateLicence', () => {
  const token = makeToken(keys.privateKey, makePayload());
  const now = new Date('2026-06-01T00:00:00Z');

  it('no token -> invalid', () => {
    expect(evaluateLicence({ token: null, publicKeyPem: keys.publicPem, now, state: { read: () => ({ data: {}, tampered: false }) } }).state).toBe('invalid');
  });

  it('tampered state file is treated as rollback', () => {
    const r = evaluateLicence({ token, publicKeyPem: keys.publicPem, now, state: { read: () => ({ data: {}, tampered: true }) } });
    expect(r.state).toBe('clock_rollback');
  });

  it('tampered state does not mask an invalid licence', () => {
    const r = evaluateLicence({ token: 'x.y', publicKeyPem: keys.publicPem, now, state: { read: () => ({ data: {}, tampered: true }) } });
    expect(r.state).toBe('invalid');
  });

  it('licence for another device is invalid', () => {
    const r = evaluateLicence({
      token, publicKeyPem: keys.publicPem, now, deviceId: 'someone_else',
      state: { read: () => ({ data: {}, tampered: false }) },
    });
    expect(r.state).toBe('invalid');
  });

  it('uses stored lastSeenAt', () => {
    const r = evaluateLicence({
      token, publicKeyPem: keys.publicPem, now, deviceId: 'dev_1',
      state: { read: () => ({ data: { lastSeenAt: '2026-07-01T00:00:00Z' }, tampered: false }) },
    });
    expect(r.state).toBe('clock_rollback');
  });
});
