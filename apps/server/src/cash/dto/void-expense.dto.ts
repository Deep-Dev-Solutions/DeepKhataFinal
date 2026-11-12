import { IsString, Length } from 'class-validator';

export class VoidExpenseDto {
  @IsString()
  @Length(3, 200)
  reason!: string;
}
