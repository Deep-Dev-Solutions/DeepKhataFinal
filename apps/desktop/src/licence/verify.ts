import { createPublicKey, verify } from 'node:crypto';
import type { LicencePayload, LicenceResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days the shop keeps full access after a licence expires. */
export const GRACE_DAYS = 15;
/** Allowed backwards clock movement before we call it a rollback. */
export const ROLLBACK_TOLERANCE_MS = DAY_MS;

function fromBase64Url(segment: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  return Buffer.from(segment, 'base64url');
}

function isPayload(value: unknown): value is LicencePayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  const limits = p.limits as Record<string, unknown> | undefined;
  return (
    p.v === 1 &&
    typeof p.businessId === 'string' &&
    typeof p.plan === 'string' &&
    typeof p.deviceId === 'string' &&
    typeof p.issuedAt === 'string' &&
    typeof p.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(p.issuedAt)) &&
    !Number.isNaN(Date.parse(p.expiresAt)) &&
    typeof limits === 'object' &&
    limits !== null &&
    typeof limits.maxBranches === 'number' &&
    typeof limits.maxUsers === 'number' &&
    typeof limits.maxProducts === 'number'
  );
}

/**
 * Verify an offline licence token:
 *   <base64url(JSON payload)>.<base64url(Ed25519 signature over the payload segment bytes)>
 *
 * - bad format / signature / payload -> 'invalid'
 * - now < lastSeenAt - 1 day         -> 'clock_rollback' (payload still returned)
 * - now <= expiresAt                 -> 'valid'
 * - now <= expiresAt + 15 days       -> 'grace'
 * - otherwise                        -> 'expired'
 */
export function verifyLicence(
  token: string,
  publicKeyPem: string,
  now: Date,
  lastSeenAt?: Date,
): LicenceResult {
  if (typeof token !== 'string') return { state: 'invalid' };
  const parts = token.trim().split('.');
  if (parts.length !== 2) return { state: 'invalid' };
  const [payloadSegment, signatureSegment] = parts;
  const signature = fromBase64Url(signatureSegment);
  const payloadBytes = fromBase64Url(payloadSegment);
  if (!signature || !payloadBytes || signature.length === 0 || payloadBytes.length === 0) {
    return { state: 'invalid' };
  }

  let signatureOk = false;
  try {
    const key = createPublicKey(publicKeyPem);
    signatureOk = verify(null, Buffer.from(payloadSegment, 'utf8'), key, signature);
  } catch {
    return { state: 'invalid' };
  }
  if (!signatureOk) return { state: 'invalid' };

  let payload: unknown;
  try {
    payload = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    return { state: 'invalid' };
  }
  if (!isPayload(payload)) return { state: 'invalid' };

  const expiresMs = Date.parse(payload.expiresAt);
  const graceEndMs = expiresMs + GRACE_DAYS * DAY_MS;
  const graceEndsAt = new Date(graceEndMs).toISOString();

  if (lastSeenAt && now.getTime() < lastSeenAt.getTime() - ROLLBACK_TOLERANCE_MS) {
    return { state: 'clock_rollback', payload, graceEndsAt };
  }
  if (now.getTime() <= expiresMs) return { state: 'valid', payload, graceEndsAt };
  if (now.getTime() <= graceEndMs) return { state: 'grace', payload, graceEndsAt };
  return { state: 'expired', payload, graceEndsAt };
}
