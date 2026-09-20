import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePostingDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  accountType: string;

  @IsNumber()
  amount: number;
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
}

