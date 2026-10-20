import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ItemCondition } from '@prisma/client';

export class UpdateInstanceDto {
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;

  @IsEnum(ItemCondition)
  @IsOptional()
  condition?: ItemCondition;
}
