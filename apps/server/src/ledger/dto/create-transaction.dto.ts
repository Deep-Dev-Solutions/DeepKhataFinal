import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import type { MoneyInput } from '../../common/money';

export class CreatePostingDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  accountType: string;

  // Internal-only DTO (no controller exposes it); amounts may be Decimal, number or string.
  amount: MoneyInput;
}

export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty()
  businessId: string;

  @IsString()
  @IsOptional()
  referenceId?: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreatePostingDto)
  postings: CreatePostingDto[];

  @IsOptional()
  dueDate?: Date;
}

