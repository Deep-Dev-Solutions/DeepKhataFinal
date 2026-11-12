import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Money arrives as a string so no float maths happens. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const moneyToString = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : value;

export class CloseRegisterDto {
  @Transform(moneyToString)
  @Matches(MONEY_PATTERN, {
    message: 'actualCash must be an amount with up to 2 decimals',
  })
  actualCash!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
