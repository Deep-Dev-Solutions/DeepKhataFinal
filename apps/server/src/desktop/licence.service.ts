import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createPrivateKey, sign } from 'node:crypto';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const LICENCE_MAX_DAYS = 30;
/** A null (unlimited) plan limit is sent as this number: the payload only allows numbers. */
export const UNLIMITED_LIMIT = 2_147_483_647;

export interface LicencePayload {
  v: 1;
  businessId: string;
  plan: string;
  limits: { maxBranches: number; maxUsers: number; maxProducts: number };
  deviceId: string;
  issuedAt: string;
  expiresAt: string;
}

/** Same wire format apps/desktop/src/licence/verify.ts checks. */
export function signLicence(payload: LicencePayload, privateKeyPem: string): string {
  const segment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(
    null,
    Buffer.from(segment, 'utf8'),
    createPrivateKey(privateKeyPem),
  );
  return `${segment}.${signature.toString('base64url')}`;
}

@Injectable()
export class LicenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  private privateKeyPem(): string {
    const pem = process.env.LICENSE_PRIVATE_KEY_PEM?.replace(/\\n/g, '\n');
    if (!pem) {
      throw new ServiceUnavailableException('Licence signing is not configured');
    }
    return pem;
  }

  async issue(businessId: string, deviceId: string): Promise<{ token: string; expiresAt: string }> {
    const pem = this.privateKeyPem();
    const now = new Date();
    const [sub, limits] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { businessId },
        select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
      }),
      this.planLimits.getLimits(businessId),
    ]);

    // Trial -> trialEndsAt, otherwise the paid period end; capped at 30 days so
    // a shop must come online regularly to renew.
    const cap = now.getTime() + LICENCE_MAX_DAYS * DAY_MS;
    const periodEnd =
      sub?.status === 'TRIALING'
        ? (sub.trialEndsAt ?? sub.currentPeriodEnd)
        : sub?.currentPeriodEnd;
    const expiresAt = new Date(
      periodEnd ? Math.min(periodEnd.getTime(), cap) : cap,
    );

    const payload: LicencePayload = {
      v: 1,
      businessId,
      plan: limits.plan.code,
      limits: {
        maxBranches: limits.maxBranches ?? UNLIMITED_LIMIT,
        maxUsers: limits.maxUsers ?? UNLIMITED_LIMIT,
        maxProducts: limits.maxProducts ?? UNLIMITED_LIMIT,
      },
      deviceId,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const token = signLicence(payload, pem);

    await this.prisma.licenseIssue.create({
      data: { businessId, deviceId, expiresAt },
    });
    return { token, expiresAt: payload.expiresAt };
  }
}
