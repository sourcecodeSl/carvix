import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@aicrm/shared';
import { PrismaService } from '../../database/prisma.service';
import { assertTenantContext } from '../context/tenant-context';

@Injectable()
export class TenantMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveForUser(context: TenantContext | null, userId: string) {
    const trusted = assertTenantContext(context);
    if (trusted.userId !== userId) {
      throw new Error('Cross-user membership access is denied');
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL ROLE "aicrm_app"');
      await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${trusted.tenantId}, true)`;
      return transaction.tenantMembership.findMany({
        where: {
          tenantId: trusted.tenantId,
          userId,
          status: 'ACTIVE',
        },
      });
    });
  }
}
