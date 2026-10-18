import { KhataDirection, KhataPartyType } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export const COUNTER_ACCOUNTS = ['ASSET', 'REVENUE'] as const;
export type CounterAccount = (typeof COUNTER_ACCOUNTS)[number];

export class CreateKhataEntryDto {
  @IsEnum(KhataDirection)
  direction: KhataDirection;

  @IsEnum(KhataPartyType)
  partyType: KhataPartyType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  vendorId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  partyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  partyPhone?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsIn(COUNTER_ACCOUNTS)
  counterAccount?: CounterAccount;
}

export class UpdateKhataEntryDto {
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  partyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  partyPhone?: string;
}

export class SettleKhataEntryDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string;
}

export class WriteOffKhataEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PromoteKhataEntryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  vendorId?: string;
}
