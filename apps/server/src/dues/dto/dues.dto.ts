import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const BUCKETS = ['0-7', '8-30', '31-90', '90+'] as const;
export type Bucket = (typeof BUCKETS)[number];

export class ListDuesQueryDto {
  @IsOptional()
  @IsIn(['receivable', 'payable'])
  direction?: 'receivable' | 'payable';

  @IsOptional()
  @IsIn(BUCKETS as unknown as string[])
  bucket?: Bucket;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['oldest', 'amount', 'due'])
  sort?: 'oldest' | 'amount' | 'due';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;
}

export class PromiseDto {
  @IsISO8601()
  promisedDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsIn(['PROMISE', 'SNOOZE'])
  kind?: 'PROMISE' | 'SNOOZE';
}

export class RemindedDto {
  @IsOptional()
  @IsIn(['WHATSAPP_LINK', 'CALL', 'IN_PERSON'])
  channel?: 'WHATSAPP_LINK' | 'CALL' | 'IN_PERSON';
}

export class WhatsappLinkQueryDto {
  @IsOptional()
  @IsIn(['ur', 'en'])
  lang?: 'ur' | 'en';
}
