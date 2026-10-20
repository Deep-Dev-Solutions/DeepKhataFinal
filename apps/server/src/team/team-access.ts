import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'branch' | 'user'>;

export interface BranchAccessInput {
  allBranches?: boolean;
  branchIds?: string[];
}

export interface BranchAccessResult {
  allBranches: boolean;
  branchIds: string[];
}

/** Resolves the allBranches flag and branch list from optional inputs. */
export function resolveAccess(
  input: BranchAccessInput,
  current?: BranchAccessResult,
): BranchAccessResult {
  const provided = input.branchIds ? [...new Set(input.branchIds)] : undefined;
  const allBranches =
    input.allBranches ??
    (provided && provided.length > 0 ? false : (current?.allBranches ?? true));
  if (allBranches) return { allBranches: true, branchIds: [] };
  const branchIds = provided ?? current?.branchIds ?? [];
  if (branchIds.length === 0) {
    throw new BadRequestException('Select at least one branch for this member.');
  }
  return { allBranches: false, branchIds };
}

/** Branch ids must exist (not deleted) in the caller's business. */
export async function assertBranchesInBusiness(
  db: Db,
  businessId: string,
  branchIds: string[],
): Promise<void> {
  if (branchIds.length === 0) return;
  const found = await db.branch.count({
    where: { businessId, deletedAt: null, id: { in: branchIds } },
  });
  if (found !== new Set(branchIds).size) {
    throw new BadRequestException(
      'One or more branches do not belong to your business.',
    );
  }
}

/** Unverified owners may log in but cannot add people to the business. */
export async function assertOwnerVerified(
  db: Db,
  actor: { id: string; role: Role },
): Promise<void> {
  if (actor.role !== Role.OWNER) return;
  const row = await db.user.findUnique({
    where: { id: actor.id },
    select: { emailVerified: true },
  });
  if (!row?.emailVerified) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Verify your email before adding team members.',
    });
  }
}
