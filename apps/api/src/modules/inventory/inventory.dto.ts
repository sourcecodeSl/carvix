import { ApiPropertyOptional } from '@nestjs/swagger';
import { vehicleSortOptions, type VehicleSort } from '@aicrm/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InventoryMappingDto {
  @IsString()
  @MaxLength(64)
  tableName!: string;

  @IsString()
  @MaxLength(64)
  primaryKeyField!: string;

  @IsString()
  @MaxLength(64)
  idField!: string;

  @IsString()
  @MaxLength(64)
  makeField!: string;

  @IsString()
  @MaxLength(64)
  modelField!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  variantField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  yearField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  registrationYearField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  priceField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  currencyField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mileageField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  fuelTypeField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  transmissionField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  conditionField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bodyTypeField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  colorField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  availabilityField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  descriptionField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  imageUrlField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  engineCapacityField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  locationField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  featuresField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serviceHistoryField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  warrantyField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  financeAvailabilityField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceUpdatedAtField?: string;
}

export class CreateInventoryConnectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(253)
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port = 3306;

  @IsString()
  @MaxLength(64)
  databaseName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  password!: string;

  @IsBoolean()
  tlsEnabled = true;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  tlsServername?: string;

  @ValidateNested()
  @Type(() => InventoryMappingDto)
  mapping!: InventoryMappingDto;
}

export class UpdateInventoryConnectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  databaseName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  password?: string;

  @IsOptional()
  @IsBoolean()
  tlsEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  tlsServername?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InventoryMappingDto)
  mapping?: InventoryMappingDto;
}

function parseQueryInteger({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

export class ListVehiclesDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional()
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional()
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional()
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\d+(?:\.\d{1,2})?$/)
  @ApiPropertyOptional()
  minPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\d+(?:\.\d{1,2})?$/)
  @ApiPropertyOptional()
  maxPrice?: string;

  @IsOptional()
  @Transform(parseQueryInteger)
  @IsInt()
  @Min(1886)
  @Max(2100)
  @ApiPropertyOptional()
  minYear?: number;

  @IsOptional()
  @Transform(parseQueryInteger)
  @IsInt()
  @Min(1886)
  @Max(2100)
  @ApiPropertyOptional()
  maxYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional()
  fuelType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional()
  transmission?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional()
  availability?: string;

  @IsOptional()
  @Transform(parseQueryInteger)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiPropertyOptional()
  minMileage?: number;

  @IsOptional()
  @Transform(parseQueryInteger)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  @ApiPropertyOptional()
  maxMileage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional()
  condition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional()
  bodyType?: string;

  @IsOptional()
  @IsIn(vehicleSortOptions)
  @ApiPropertyOptional({ enum: vehicleSortOptions })
  sort?: VehicleSort;

  @Transform(parseQueryInteger)
  @IsInt()
  @Min(1)
  @Max(10000)
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10000 })
  page: number = 1;

  @Transform(parseQueryInteger)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  pageSize: number = 20;
}
