import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const SYNC_PULL_ENTITIES = [
  'products',
  'instances',
  'stockSummary',
  'customers',
  'vendors',
  'categories',
  'cabinets',
  'branches',
] as const;
export type SyncPullEntity = (typeof SYNC_PULL_ENTITIES)[number];

export class SyncPullQueryDto {
  @IsIn(SYNC_PULL_ENTITIES)
  entity: SyncPullEntity;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
