import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BusinessStatus } from '@prisma/client';

/** Money arrives as a string so no float maths happens. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export const PAYMENT_METHODS = ['CASH', 'BANK', 'ONLINE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const toMoneyOrNull = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'number' ? String(value) : value;
};

const toIntOrNull = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined || value === '') return null;
  return Number(value);
};

const planCode = /^[A-Z][A-Z0-9_]{1,39}$/;

/**
 * A named plan preset. Every field except code/name is optional so an admin can
 * leave a price or a limit blank, which means "not set / unlimited".
 */
export class CreatePlanDto {
  @IsString()
  @Matches(planCode, {
    message: 'code must be upper-case letters, digits or underscores',
  })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Transform(toMoneyOrNull)
  @Matches(MONEY_PATTERN, {
    message: 'priceMonthly must be an amount with up to 2 decimals',
  })
  priceMonthly?: string | null;

  @IsOptional()
  @Transform(toMoneyOrNull)
  @Matches(MONEY_PATTERN, {
    message: 'priceYearly must be an amount with up to 2 decimals',
  })
  priceYearly?: string | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  @Min(0)
  @Max(1000)
  maxBranches?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  @Min(0)
  @Max(10000)
  maxUsers?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  @Min(0)
  @Max(1000000)
  maxProducts?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Same shape as CreatePlanDto, every field optional (no PartialType available). */
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Transform(toMoneyOrNull)
  @Matches(MONEY_PATTERN, {
    message: 'priceMonthly must be an amount with up to 2 decimals',
  })
  priceMonthly?: string | null;

  @IsOptional()
  @Transform(toMoneyOrNull)
  @Matches(MONEY_PATTERN, {
    message: 'priceYearly must be an amount with up to 2 decimals',
  })
  priceYearly?: string | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  @Min(0)
  @Max(1000)
  maxBranches?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  @Min(0)
  @Max(10000)
  maxUsers?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  @Min(0)
  @Max(1000000)
  maxProducts?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** A payment now also carries the plan it buys. */
/**
 * A payment is cash received against the deal (decision D2). It carries no
 * plan, no price and no expiry - `setDeal` is the only writer of those.
 */
export class RecordPaymentDto {
  @Transform(({ value }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @Matches(MONEY_PATTERN, {
    message: 'amount must be a positive amount with up to 2 decimals',
  })
  amount!: string;

  /** The date the money actually arrived (never an expiry date). */
  @IsISO8601()
  receivedAt!: string;

  @IsIn(PAYMENT_METHODS, {
    message: 'method must be one of CASH, BANK or ONLINE',
  })
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateTenantStatusDto {
  @IsEnum(BusinessStatus)
  status!: BusinessStatus;
}

export class AddBranchDto {
  /**
   * The agency is SUPER_ADMIN by definition, so it may exceed the plan's branch
   * cap. `whitelist: true` in main.ts strips unknown fields, so this must be
   * declared or the service sees `undefined` and refuses.
   */
  @IsOptional()
  @IsBoolean()
  override?: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;
}

