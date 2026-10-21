import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Profile columns only. creditLimit and isDefaulter live in PATCH customerrisk
 * (manage:risk); businessId, id, balances and relations can never be written here.
 * The global ValidationPipe is whitelist:true, so any other key is stripped.
 */
export class UpdateCustomerDto {
  @ValidateIf((_o, v) => v !== undefined) // required columns: null is rejected
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ValidateIf((_o, v) => v !== undefined) // required columns: null is rejected
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  shopName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  cnicNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guarantorPhone?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  paymentTermsDays?: number | null;
}
