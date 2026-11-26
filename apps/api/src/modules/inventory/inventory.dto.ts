import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
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
  @ValidateNested()
  @Type(() => InventoryMappingDto)
  mapping?: InventoryMappingDto;
}

export class ListVehiclesDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  minPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  maxPrice?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(2100)
  minYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(2100)
  maxYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  fuelType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  transmission?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  availability?: string;

  @IsOptional()
  @IsIn(['newest', 'priceAsc', 'priceDesc', 'yearDesc'])
  sort?: 'newest' | 'priceAsc' | 'priceDesc' | 'yearDesc';

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
