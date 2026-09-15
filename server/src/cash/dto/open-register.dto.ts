import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class OpenRegisterDto {
  @IsNumber()
  @Min(0, { message: 'Opening balance cannot be negative.' })
  openingBalance: number;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
