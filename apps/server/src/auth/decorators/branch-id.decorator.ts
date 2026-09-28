import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';

export interface BranchIdOptions {
  required?: boolean;
}

export const BranchId = createParamDecorator(
  (options: BranchIdOptions | undefined, ctx: ExecutionContext) => {
    const required = options?.required ?? true;
    const request = ctx.switchToHttp().getRequest();
    const rawBranchId = request.headers['x-branch-id'];
    const branchId =
      typeof rawBranchId === 'string' ? rawBranchId.trim() : undefined;

    if (required && !branchId) {
      throw new BadRequestException('x-branch-id header is required');
    }

    return branchId;
  },
);
