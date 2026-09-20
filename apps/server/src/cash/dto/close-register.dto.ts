import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseRegisterDto {
  @IsNumber()
  @Min(0, { message: 'Counted physical cash cannot be negative.' })
  actualCash: number;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
