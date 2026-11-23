import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Permission, type TenantContext } from '@aicrm/shared';
import { Prisma } from '@aicrm/database';
import { PrismaService } from '../../database/prisma.service';
import { assertTenantContext, scopeTenantTransaction } from '../context/tenant-context';

const staffSelect = {
  id: true,
  userId: true,
  role: true,
  status: true,
  createdAt: true,
  user: {
    select: {
      name: true,
      email: true,
      status: true,
    },
  },
  branchAssignments: {
    select: {
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
        },
      },
    },
    orderBy: { branch: { name: 'asc' } },
  },
} satisfies Prisma.TenantMembershipSelect;

export type StaffRecord = Prisma.TenantMembershipGetPayload<{ select: typeof staffSelect }>;

@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    context: TenantContext,
    filters: {
      page: number;
      pageSize: number;
      query?: string;
      role?: 'SALES_MANAGER' | 'SALES_AGENT';
      status?: 'ACTIVE' | 'SUSPENDED';
    },
  ): Promise<{ items: StaffRecord[]; total: number }> {
    const trusted = this.requirePermission(context, Permission.USER_READ);
    const canSearchEmail = trusted.permissions.includes(Permission.USER_INVITE);
    const query = filters.query?.trim();
    const userQuery: Prisma.UserWhereInput[] = query
      ? [{ name: { contains: query, mode: 'insensitive' } }]
      : [];
    if (query && canSearchEmail) {
      userQuery.push({ email: { contains: query, mode: 'insensitive' } });
    }
    const where: Prisma.TenantMembershipWhereInput = {
      tenantId: trusted.tenantId,
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(userQuery.length ? { user: { is: { OR: userQuery } } } : {}),
    };

    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const [total, items] = await Promise.all([
        transaction.tenantMembership.count({ where }),
        transaction.tenantMembership.findMany({
          where,
          orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
          select: staffSelect,
        }),
      ]);
      return { items, total };
    });
  }

  async findById(context: TenantContext, membershipId: string): Promise<StaffRecord | null> {
    const trusted = this.requirePermission(context, Permission.USER_READ);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      return transaction.tenantMembership.findFirst({
        where: { id: membershipId, tenantId: trusted.tenantId },
        select: staffSelect,
      });
    });
  }

  async findSelf(context: TenantContext): Promise<StaffRecord | null> {
    const trusted = assertTenantContext(context);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      return transaction.tenantMembership.findFirst({
        where: { id: trusted.membershipId, tenantId: trusted.tenantId },
        select: staffSelect,
      });
    });
  }

  async updateRole(
    context: TenantContext,
    membershipId: string,
    role: 'SALES_MANAGER' | 'SALES_AGENT',
  ): Promise<StaffRecord | null> {
    const trusted = this.requirePermission(context, Permission.USER_UPDATE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      await this.lockAdminChanges(transaction, trusted.tenantId);
      const target = await transaction.tenantMembership.findFirst({
        where: { id: membershipId, tenantId: trusted.tenantId },
        select: { id: true, userId: true, role: true, status: true },
      });
      if (!target) return null;
      this.assertNotSelf(target.userId, trusted.userId);

      if (target.role === 'DEALER_ADMIN' && target.status === 'ACTIVE') {
        await this.assertAnotherActiveAdministrator(transaction, trusted.tenantId, target.id);
      }

      return transaction.tenantMembership.update({
        where: { id: target.id },
        data: { role },
        select: staffSelect,
      });
    });
  }

  async updateStatus(
    context: TenantContext,
    membershipId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<StaffRecord | null> {
    const trusted = this.requirePermission(context, Permission.USER_UPDATE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      await this.lockAdminChanges(transaction, trusted.tenantId);
      const target = await transaction.tenantMembership.findFirst({
        where: { id: membershipId, tenantId: trusted.tenantId },
        select: { id: true, userId: true, role: true, status: true },
      });
      if (!target) return null;
      this.assertNotSelf(target.userId, trusted.userId);

      if (target.role === 'DEALER_ADMIN' && target.status === 'ACTIVE' && status !== 'ACTIVE') {
        await this.assertAnotherActiveAdministrator(transaction, trusted.tenantId, target.id);
      }

      return transaction.tenantMembership.update({
        where: { id: target.id },
        data: { status },
        select: staffSelect,
      });
    });
  }

  async replaceBranches(
    context: TenantContext,
    membershipId: string,
    branchIds: readonly string[],
  ): Promise<StaffRecord | null> {
    const trusted = this.requirePermission(context, Permission.USER_UPDATE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const target = await transaction.tenantMembership.findFirst({
        where: { id: membershipId, tenantId: trusted.tenantId },
        select: { id: true },
      });
      if (!target) return null;

      const branches = branchIds.length
        ? await transaction.branch.findMany({
            where: {
              id: { in: [...branchIds] },
              tenantId: trusted.tenantId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : [];
      if (branches.length !== branchIds.length) {
        throw new BadRequestException('One or more selected branches are unavailable');
      }

      await transaction.staffBranchAssignment.deleteMany({
        where: { tenantId: trusted.tenantId, membershipId: target.id },
      });
      if (branches.length) {
        const now = new Date();
        await transaction.staffBranchAssignment.createMany({
          data: branches.map((branch) => ({
            tenantId: trusted.tenantId,
            membershipId: target.id,
            branchId: branch.id,
            updatedAt: now,
          })),
        });
      }

      return transaction.tenantMembership.findUnique({
        where: { id: target.id },
        select: staffSelect,
      });
    });
  }

  private requirePermission(context: TenantContext, permission: Permission): TenantContext {
    const trusted = assertTenantContext(context);
    if (!trusted.permissions.includes(permission)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return trusted;
  }

  private async lockAdminChanges(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`;
  }

  private async assertAnotherActiveAdministrator(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    targetId: string,
  ): Promise<void> {
    const activeAdministrators = await transaction.tenantMembership.count({
      where: {
        tenantId,
        id: { not: targetId },
        role: 'DEALER_ADMIN',
        status: 'ACTIVE',
      },
    });
    if (activeAdministrators === 0) {
      throw new ConflictException(
        'The tenant must retain at least one active dealer administrator',
      );
    }
  }

  private assertNotSelf(targetUserId: string, currentUserId: string): void {
    if (targetUserId === currentUserId) {
      throw new BadRequestException('You cannot change your own membership');
    }
  }
}
