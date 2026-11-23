import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const staffRoles = ['SALES_MANAGER', 'SALES_AGENT'] as const;
const staffStatuses = ['ACTIVE', 'SUSPENDED'] as const;

export class ListStaffDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(staffRoles)
  role?: (typeof staffRoles)[number];

  @IsOptional()
  @IsIn(staffStatuses)
  status?: (typeof staffStatuses)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class UpdateStaffRoleDto {
  @IsIn(staffRoles)
  role!: (typeof staffRoles)[number];
}

export class UpdateStaffStatusDto {
  @IsIn(staffStatuses)
  status!: (typeof staffStatuses)[number];
}

export class UpdateStaffBranchesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  branchIds!: string[];
}

export class CreateStaffInvitationDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsIn(staffRoles)
  role!: (typeof staffRoles)[number];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  branchIds?: string[];
}

export class ListStaffInvitationsDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED'])
  status?: 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class InvitationTokenDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;
}

export class AcceptNewStaffInvitationDto extends InvitationTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(1024)
  password!: string;
}
