import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SettleMemoDto {
  @IsNumber()
  @Min(0, { message: 'Amount paid cannot be negative' })
  @IsOptional()
  amountPaid?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;
}
