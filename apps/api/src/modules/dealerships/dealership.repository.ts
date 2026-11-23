import { ForbiddenException, Injectable } from '@nestjs/common';
import { Permission, type TenantContext } from '@aicrm/shared';
import { Prisma } from '@aicrm/database';
import { PrismaService } from '../../database/prisma.service';
import { assertTenantContext, scopeTenantTransaction } from '../context/tenant-context';

const dealershipSelect = {
  id: true,
  businessName: true,
  contactEmail: true,
  contactPhone: true,
  country: true,
  timezone: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DealershipSelect;

export type DealershipRecord = Prisma.DealershipGetPayload<{
  select: typeof dealershipSelect;
}>;

@Injectable()
export class DealershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findForTenant(context: TenantContext | null): Promise<DealershipRecord[]> {
    const trusted = this.requirePermission(context, Permission.DEALER_READ);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      return transaction.dealership.findMany({
        where: { tenantId: trusted.tenantId },
        orderBy: { businessName: 'asc' },
        select: dealershipSelect,
      });
    });
  }

  async findById(
    context: TenantContext | null,
    dealershipId: string,
  ): Promise<DealershipRecord | null> {
    const trusted = this.requirePermission(context, Permission.DEALER_READ);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      return transaction.dealership.findFirst({
        where: { id: dealershipId, tenantId: trusted.tenantId },
        select: dealershipSelect,
      });
    });
  }

  async update(
    context: TenantContext | null,
    dealershipId: string,
    data: Prisma.DealershipUpdateInput,
  ): Promise<DealershipRecord | null> {
    const trusted = this.requirePermission(context, Permission.DEALER_UPDATE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const dealership = await transaction.dealership.findFirst({
        where: { id: dealershipId, tenantId: trusted.tenantId },
        select: { id: true },
      });
      if (!dealership) return null;

      return transaction.dealership.update({
        where: { id: dealership.id },
        data,
        select: dealershipSelect,
      });
    });
  }

  private requirePermission(context: TenantContext | null, permission: Permission): TenantContext {
    const trusted = assertTenantContext(context);
    if (!trusted.permissions.includes(permission)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return trusted;
  }
}
