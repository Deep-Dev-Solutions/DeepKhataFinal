import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCabinetDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  rack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  shelf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  bin?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpdateCabinetDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  rack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  shelf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  bin?: string;
}
