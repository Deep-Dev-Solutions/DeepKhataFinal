export interface LicenceLimits {
  maxBranches: number;
  maxUsers: number;
  maxProducts: number;
}

export interface LicencePayload {
  v: 1;
  businessId: string;
  plan: string;
  limits: LicenceLimits;
  deviceId: string;
  /** ISO-8601 */
  issuedAt: string;
  /** ISO-8601 */
  expiresAt: string;
}

export type LicenceState = 'valid' | 'grace' | 'expired' | 'invalid' | 'clock_rollback';

export interface LicenceResult {
  state: LicenceState;
  payload?: LicencePayload;
  /** ISO-8601, set when state is 'grace' (and also 'expired' after grace). */
  graceEndsAt?: string;
}

/** States in which the API must be read-only (enforced server side). */
export const READ_ONLY_STATES: readonly LicenceState[] = ['expired', 'invalid', 'clock_rollback'];
