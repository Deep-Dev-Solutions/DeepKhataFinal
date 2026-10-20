import { generateKeyPairSync, sign } from 'node:crypto';
import type { LicencePayload } from '../src/licence/types';

export function makeKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKey, privateKey, publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

export function makePayload(over: Partial<LicencePayload> = {}): LicencePayload {
  return {
    v: 1,
    businessId: 'biz_1',
    plan: 'standard',
    limits: { maxBranches: 3, maxUsers: 10, maxProducts: 5000 },
    deviceId: 'dev_1',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-12-31T00:00:00.000Z',
    ...over,
  };
}

export function makeToken(privateKey: ReturnType<typeof makeKeys>['privateKey'], payload: LicencePayload): string {
  const segment = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(null, Buffer.from(segment, 'utf8'), privateKey).toString('base64url');
  return `${segment}.${signature}`;
}
