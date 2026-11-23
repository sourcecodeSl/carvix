import { Injectable } from '@nestjs/common';
import { Permission, type TenantContext } from '@aicrm/shared';
import type { Prisma } from '@aicrm/database';
import { PrismaService } from '../../database/prisma.service';
import { assertTenantContext } from '../context/tenant-context';

@Injectable()
export class BranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(context: TenantContext | null, branchId: string) {
    const trusted = assertTenantContext(context);
    if (!trusted.permissions.includes(Permission.BRANCH_READ)) {
      throw new Error('Tenant context lacks branch read permission');
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.scopeTransaction(transaction, trusted.tenantId);
      return transaction.branch.findFirst({
        where: { id: branchId, tenantId: trusted.tenantId },
      });
    });
  }

  async updateName(context: TenantContext | null, branchId: string, name: string) {
    const trusted = assertTenantContext(context);
    if (!trusted.permissions.includes(Permission.BRANCH_UPDATE)) {
      throw new Error('Tenant context lacks branch update permission');
    }
    if (name.trim().length === 0) {
      throw new Error('Branch name is required');
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.scopeTransaction(transaction, trusted.tenantId);
      const branch = await transaction.branch.findFirst({
        where: { id: branchId, tenantId: trusted.tenantId },
      });
      if (!branch) return null;
      return transaction.branch.update({
        where: { id: branch.id },
        data: { name: name.trim() },
      });
    });
  }

  private async scopeTransaction(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await transaction.$executeRawUnsafe('SET LOCAL ROLE "aicrm_app"');
    await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  }
}
