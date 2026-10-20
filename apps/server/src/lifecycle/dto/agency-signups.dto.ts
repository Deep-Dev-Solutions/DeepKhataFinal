import { AgencyTaskStatus, FollowUpStatus } from '@prisma/client';
import {
  Equals,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SignupsQueryDto {
  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UpdateSignupDto {
  @IsOptional()
  @IsEnum(FollowUpStatus)
  followUpStatus?: FollowUpStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpNotes?: string;
}

export class TasksQueryDto {
  @IsOptional()
  @IsEnum(AgencyTaskStatus)
  status?: AgencyTaskStatus;
}

export class UpdateTaskDto {
  @Equals('DONE')
  status: 'DONE';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
