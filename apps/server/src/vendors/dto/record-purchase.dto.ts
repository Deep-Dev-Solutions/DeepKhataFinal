import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class RecordPurchaseDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** ISO date; must not be in the past (checked in the service). */
  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}
