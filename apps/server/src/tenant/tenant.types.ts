import { Role } from '@prisma/client';

export interface TenantContext {
  businessId: string;
  branchId: string | null;
  userId: string;
  role: Role;
}
