import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DealershipResponse, TenantContext } from '@aicrm/shared';
import type { Prisma as DatabasePrisma } from '@aicrm/database';
import { DealershipRepository, type DealershipRecord } from './dealership.repository';
import type { UpdateDealershipDto } from './dealership.dto';

@Injectable()
export class DealershipService {
  constructor(private readonly dealerships: DealershipRepository) {}

  async list(context: TenantContext): Promise<DealershipResponse[]> {
    return (await this.dealerships.findForTenant(context)).map(toResponse);
  }

  async get(context: TenantContext, dealershipId: string): Promise<DealershipResponse> {
    const dealership = await this.dealerships.findById(context, dealershipId);
    if (!dealership) throw new NotFoundException('Dealership not found');
    return toResponse(dealership);
  }

  async update(
    context: TenantContext,
    dealershipId: string,
    dto: UpdateDealershipDto,
  ): Promise<DealershipResponse> {
    if (dto.timezone !== undefined && !isValidTimeZone(dto.timezone)) {
      throw new BadRequestException('timezone must be a valid IANA time zone');
    }

    const data: DatabasePrisma.DealershipUpdateInput = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName.trim();
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail.trim().toLowerCase();
    if (dto.contactPhone !== undefined) data.contactPhone = normalizeNullable(dto.contactPhone);
    if (dto.country !== undefined) data.country = dto.country.trim();
    if (dto.timezone !== undefined) data.timezone = dto.timezone.trim();
    if (dto.currency !== undefined) data.currency = dto.currency.toUpperCase();

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one editable field is required');
    }

    const dealership = await this.dealerships.update(context, dealershipId, data);
    if (!dealership) throw new NotFoundException('Dealership not found');
    return toResponse(dealership);
  }
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeNullable(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function toResponse(dealership: DealershipRecord): DealershipResponse {
  return {
    id: dealership.id,
    businessName: dealership.businessName,
    contactEmail: dealership.contactEmail,
    contactPhone: dealership.contactPhone,
    country: dealership.country,
    timezone: dealership.timezone,
    currency: dealership.currency,
    createdAt: dealership.createdAt.toISOString(),
    updatedAt: dealership.updatedAt.toISOString(),
  };
}
