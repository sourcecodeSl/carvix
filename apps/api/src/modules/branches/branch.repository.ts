import { ForbiddenException, Injectable } from '@nestjs/common';
import { Permission, type TenantContext } from '@aicrm/shared';
import { Prisma } from '@aicrm/database';
import { PrismaService } from '../../database/prisma.service';
import { assertTenantContext, scopeTenantTransaction } from '../context/tenant-context';
import { AuditService } from '../audit/audit.service';

const branchSelect = {
  id: true,
  dealershipId: true,
  name: true,
  code: true,
  address: true,
  city: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BranchSelect;

export type BranchRecord = Prisma.BranchGetPayload<{ select: typeof branchSelect }>;

@Injectable()
export class BranchRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findForDealership(
    context: TenantContext | null,
    dealershipId: string,
  ): Promise<BranchRecord[] | null> {
    const trusted = this.requirePermission(context, Permission.BRANCH_READ);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const dealership = await transaction.dealership.findFirst({
        where: { id: dealershipId, tenantId: trusted.tenantId },
        select: { id: true },
      });
      if (!dealership) return null;
      return transaction.branch.findMany({
        where: {
          dealershipId,
          tenantId: trusted.tenantId,
          ...(!trusted.permissions.includes(Permission.BRANCH_UPDATE)
            ? { staffAssignments: { some: { membershipId: trusted.membershipId } } }
            : {}),
        },
        orderBy: [{ name: 'asc' }, { code: 'asc' }, { id: 'asc' }],
        select: branchSelect,
      });
    });
  }

  async findById(
    context: TenantContext | null,
    dealershipId: string,
    branchId: string,
  ): Promise<BranchRecord | null> {
    const trusted = this.requirePermission(context, Permission.BRANCH_READ);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      return transaction.branch.findFirst({
        where: {
          id: branchId,
          dealershipId,
          tenantId: trusted.tenantId,
          ...(!trusted.permissions.includes(Permission.BRANCH_UPDATE)
            ? { staffAssignments: { some: { membershipId: trusted.membershipId } } }
            : {}),
        },
        select: branchSelect,
      });
    });
  }

  async create(
    context: TenantContext | null,
    dealershipId: string,
    data: Omit<Prisma.BranchUncheckedCreateInput, 'tenantId' | 'dealershipId'>,
  ): Promise<BranchRecord | null> {
    const trusted = this.requirePermission(context, Permission.BRANCH_CREATE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const dealership = await transaction.dealership.findFirst({
        where: { id: dealershipId, tenantId: trusted.tenantId },
        select: { id: true },
      });
      if (!dealership) return null;
      const created = await transaction.branch.create({
        data: {
          ...data,
          tenantId: trusted.tenantId,
          dealershipId: dealership.id,
        },
        select: branchSelect,
      });
      await this.audit.record(transaction, trusted, {
        eventType: 'branch.created',
        category: 'BRANCH',
        action: 'create',
        resourceType: 'branch',
        resourceId: created.id,
        outcome: 'SUCCESS',
        metadata: { status: created.status },
      });
      return created;
    });
  }

  async update(
    context: TenantContext | null,
    dealershipId: string,
    branchId: string,
    data: Prisma.BranchUpdateInput,
  ): Promise<BranchRecord | null> {
    const trusted = this.requirePermission(context, Permission.BRANCH_UPDATE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const branch = await transaction.branch.findFirst({
        where: { id: branchId, dealershipId, tenantId: trusted.tenantId },
        select: { id: true },
      });
      if (!branch) return null;
      const updated = await transaction.branch.update({
        where: { id: branch.id },
        data,
        select: branchSelect,
      });
      await this.audit.record(transaction, trusted, {
        eventType: 'branch.updated',
        category: 'BRANCH',
        action: 'update',
        resourceType: 'branch',
        resourceId: branch.id,
        outcome: 'SUCCESS',
        metadata: { changedFields: Object.keys(data).map((key) => String(key)) },
      });
      return updated;
    });
  }

  async updateStatus(
    context: TenantContext | null,
    dealershipId: string,
    branchId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ): Promise<BranchRecord | null> {
    const trusted = this.requirePermission(context, Permission.BRANCH_UPDATE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const branch = await transaction.branch.findFirst({
        where: { id: branchId, dealershipId, tenantId: trusted.tenantId },
        select: { id: true },
      });
      if (!branch) return null;
      const updated = await transaction.branch.update({
        where: { id: branch.id },
        data: { status },
        select: branchSelect,
      });
      await this.audit.record(transaction, trusted, {
        eventType: status === 'ACTIVE' ? 'branch.activated' : 'branch.deactivated',
        category: 'BRANCH',
        action: status === 'ACTIVE' ? 'activate' : 'deactivate',
        resourceType: 'branch',
        resourceId: branch.id,
        outcome: 'SUCCESS',
        metadata: {
          previousStatus: status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
          newStatus: status,
        },
      });
      return updated;
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
