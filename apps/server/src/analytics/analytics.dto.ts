import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const TENANT_FILTERS = [
  'trialing',
  'expiring7',
  'pastdue',
  'inactive7',
  'overlimit',
] as const;
export type TenantFilter = (typeof TENANT_FILTERS)[number];

export class TenantsAnalyticsQueryDto {
  @IsOptional()
  @IsIn(TENANT_FILTERS as unknown as string[])
  filter?: TenantFilter;

  @IsOptional()
  @IsIn(['gmv', 'lastActive'])
  sort?: 'gmv' | 'lastActive';

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}

export class UsageStatementQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(['pdf', 'json'])
  format?: 'pdf' | 'json';
}

export class AccessLogQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
