import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Pakistani mobile: 03XXXXXXXXX, 923XXXXXXXXX or +923XXXXXXXXX (spaces and dashes allowed). */
export const PK_MOBILE_REGEX = /^(?:\+92|92|0)\s?-?3\d{2}\s?-?\d{7}$/;

export class OnboardingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  shopName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  market?: string;

  /** Validated and normalised in the service: 400 { code: PHONE_INVALID }. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  branchName: string;

  @IsOptional()
  @Transform(({ obj }) => obj.loadSampleData)
  @IsBoolean()
  loadSampleData?: boolean;

  @Transform(({ obj }) => obj.acceptTerms)
  @Equals(true, { message: 'You must accept the terms to continue' })
  acceptTerms: true;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;

  /** Optional vanity address; generated from the shop name when omitted. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/, {
    message: 'slug may only contain lowercase letters, digits and dashes',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  teamSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}
