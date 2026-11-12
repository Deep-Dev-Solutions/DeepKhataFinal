import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

/** Money arrives as a string so no float maths happens. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const moneyToString = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : value;

export class LogExpenseDto {
  @Transform(moneyToString)
  @Matches(MONEY_PATTERN, {
    message: 'amount must be a positive amount with up to 2 decimals',
  })
  amount!: string;

  @IsString()
  @IsNotEmpty({ message: 'Category is required (e.g. CHAI_REFRESHMENT, DELIVERY_RIDER, REPAIR_PARTS).' })
  category!: string;

  @IsString()
  @IsOptional()
  description?: string;

  /**
   * Only for OWNER / MANAGER when the expense is larger than the cash in the
   * galla. STAFF can never override. The reason is stored in the description.
   */
  @IsString()
  @IsOptional()
  @Length(3, 200, {
    message: 'overrideReason must be between 3 and 200 characters.',
  })
  @MinLength(3)
  overrideReason?: string;
}
