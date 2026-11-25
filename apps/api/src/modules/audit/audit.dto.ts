import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const auditCategories = [
  'AUTHENTICATION',
  'AUTHORIZATION',
  'DEALERSHIP',
  'BRANCH',
  'STAFF',
  'INVITATION',
  'SECURITY',
  'SYSTEM',
] as const;

export const auditOutcomes = ['SUCCESS', 'FAILURE', 'DENIED'] as const;

export class AuditSummaryDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

export class ListAuditEventsDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  eventType?: string;

  @IsOptional()
  @IsIn(auditCategories)
  category?: (typeof auditCategories)[number];

  @IsOptional()
  @IsIn(auditOutcomes)
  outcome?: (typeof auditOutcomes)[number];

  @IsOptional()
  @IsUUID('4')
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceType?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

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
