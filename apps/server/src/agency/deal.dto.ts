import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BillingCycle } from '@prisma/client';

/** Money arrives as a string so no float maths happens. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const moneyToString = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : value;

export class SetDealDto {
  @IsNotEmpty()
  @IsString()
  plan!: string;

  @Transform(moneyToString)
  @Matches(MONEY_PATTERN, {
    message: 'price must be a non-negative amount with up to 2 decimals',
  })
  price!: string;

  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  maxBranches!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  maxUsers!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  @IsOptional()
  maxProducts?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
