import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class LogExpenseDto {
  @IsNumber()
  @IsPositive({ message: 'Expense amount must be greater than zero.' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'Category is required (e.g. CHAI_REFRESHMENT, DELIVERY_RIDER, REPAIR_PARTS).' })
  category: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  branchId?: string;
}
