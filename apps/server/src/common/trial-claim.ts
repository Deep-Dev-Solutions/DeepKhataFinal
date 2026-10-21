import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizePhone, PHONE_INVALID_MESSAGE } from './phone';

export const PHONE_INVALID = 'PHONE_INVALID';
export const TRIAL_ALREADY_USED = 'TRIAL_ALREADY_USED';

/** E.164 form of `raw`, or 400 { code: PHONE_INVALID }. */
export function requireNormalizedPhone(raw: unknown): string {
  const phone = typeof raw === 'string' ? normalizePhone(raw) : null;
  if (!phone) {
    throw new BadRequestException({
      code: PHONE_INVALID,
      message: PHONE_INVALID_MESSAGE,
    });
  }
  return phone;
}

/**
 * Claims the trial for `phoneNormalized` inside the caller's transaction (the
 * one that creates the business). A second claim for the same phone fails on
 * the unique index, even when two requests race, and 409 rolls the whole
 * transaction back so nothing else is created.
 */
export async function claimTrial(
  tx: Prisma.TransactionClient,
  claim: { phoneNormalized: string; businessId: string; userId?: string | null },
): Promise<void> {
  try {
    await tx.trialClaim.create({
      data: {
        phoneNormalized: claim.phoneNormalized,
        businessId: claim.businessId,
        userId: claim.userId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException({
        code: TRIAL_ALREADY_USED,
        message:
          'A free trial has already been used with this phone number. Please contact the agency to continue.',
      });
    }
    throw e;
  }
}
