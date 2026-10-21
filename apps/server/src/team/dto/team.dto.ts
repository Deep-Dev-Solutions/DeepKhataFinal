import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const ASSIGNABLE_ROLES = ['MANAGER', 'STAFF'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class InviteStaffDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** The service answers 403 for roles the inviter may not grant (OWNER, SUPER_ADMIN, ...). */
  @IsIn([...Object.values(Role)])
  role!: Role;

  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  branchIds?: string[];
}

/** Body of the POST /settings/staff alias: only MANAGER or STAFF, anything else is a 400. */
export class SettingsInviteStaffDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn([...ASSIGNABLE_ROLES])
  role!: AssignableRole;

  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  branchIds?: string[];
}

export class UpdateRoleDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Only MANAGER or STAFF; OWNER and SUPER_ADMIN are rejected with 400. */
  @IsIn([...ASSIGNABLE_ROLES])
  role!: AssignableRole;
}

export class CreateMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** Login handle; the full login is "<handle>@<business-slug>". */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Matches(/^[a-z0-9._-]{3,30}$/, {
    message: 'username must be 3-30 characters of a-z, 0-9, dot, underscore or dash',
  })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsIn([...ASSIGNABLE_ROLES])
  role!: AssignableRole;

  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  branchIds?: string[];
}

export class UpdateMemberDto {
  @IsOptional()
  @IsIn([...ASSIGNABLE_ROLES])
  role?: AssignableRole;

  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  branchIds?: string[];
}

export class ResetMemberPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
