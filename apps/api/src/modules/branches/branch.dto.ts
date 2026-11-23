import { IsEnum, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { BranchStatus } from '@aicrm/shared';

export class CreateBranchDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  @MaxLength(32)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;
}

export class UpdateBranchDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;
}

export class UpdateBranchStatusDto {
  @IsEnum(BranchStatus)
  status!: BranchStatus;
}
