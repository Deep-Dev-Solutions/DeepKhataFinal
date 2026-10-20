import type { StateStore } from '../state';
import type { LicenceResult } from './types';
import { verifyLicence } from './verify';

export interface EvaluateLicenceInput {
  /** Raw token text, or null when no licence file exists yet. */
  token: string | null;
  publicKeyPem: string;
  now: Date;
  state: Pick<StateStore, 'read'>;
  /** When set, a licence issued for another device is 'invalid'. */
  deviceId?: string;
}

/**
 * Combine token verification with the tamper-evident lastSeenAt store.
 * A tampered state.json is treated like a clock rollback.
 */
export function evaluateLicence(input: EvaluateLicenceInput): LicenceResult {
  if (!input.token) return { state: 'invalid' };
  const { data, tampered } = input.state.read();
  const lastSeenAt = data.lastSeenAt ? new Date(data.lastSeenAt) : undefined;
  const result = verifyLicence(input.token, input.publicKeyPem, input.now, lastSeenAt);
  if (result.state === 'invalid') return result;
  if (input.deviceId && result.payload && result.payload.deviceId !== input.deviceId) {
    return { state: 'invalid' };
  }
  if (tampered) return { ...result, state: 'clock_rollback' };
  return result;
}
