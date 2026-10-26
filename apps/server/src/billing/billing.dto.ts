import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AgencyPaymentMethod,
  BillingCycle,
  InvoiceStatus,
} from '@prisma/client';

/** Money arrives as a string or a JSON number; it is validated as text so no float maths happens. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const moneyToString = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : value;

export class InvoiceLineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;

  @Transform(moneyToString)
  @Matches(MONEY_PATTERN, { message: 'unitPrice must be a non-negative amount with up to 2 decimals' })
  unitPrice!: string;
}

export class CreateInvoiceDto {
  @IsUUID()
  businessId!: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @IsOptional()
  @IsISO8601()
  periodEnd?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  periods?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];

  @IsOptional()
  @Transform(moneyToString)
  @Matches(MONEY_PATTERN, { message: 'discount must be a non-negative amount with up to 2 decimals' })
  discount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  dueDays?: number;
}

export class RecordPaymentDto {
  @Transform(moneyToString)
  @Matches(MONEY_PATTERN, { message: 'amount must be a positive amount with up to 2 decimals' })
  amount!: string;

  @IsEnum(AgencyPaymentMethod)
  method!: AgencyPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  proofUrl?: string;

  @IsOptional()
  @IsISO8601()
  receivedAt?: string;
}

export class ListInvoicesQueryDto {
  @IsOptional()
  @IsUUID()
  businessId?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}

export class ListPaymentsQueryDto {
  @IsOptional()
  @IsUUID()
  businessId?: string;
}
