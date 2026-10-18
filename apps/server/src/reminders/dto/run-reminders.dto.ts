import { IsISO8601, IsOptional } from 'class-validator';

export class RunRemindersDto {
  @IsOptional()
  @IsISO8601()
  now?: string;
}
