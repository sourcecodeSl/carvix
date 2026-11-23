import { ForbiddenException, Injectable } from '@nestjs/common';
import { Permission, type TenantContext } from '@aicrm/shared';
import { Prisma } from '@aicrm/database';
import { PrismaService } from '../../database/prisma.service';
import { assertTenantContext, scopeTenantTransaction } from '../context/tenant-context';

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
  constructor(private readonly prisma: PrismaService) {}

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
        where: { dealershipId, tenantId: trusted.tenantId },
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
        where: { id: branchId, dealershipId, tenantId: trusted.tenantId },
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
      return transaction.branch.create({
        data: {
          ...data,
          tenantId: trusted.tenantId,
          dealershipId: dealership.id,
        },
        select: branchSelect,
      });
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
      return transaction.branch.update({
        where: { id: branch.id },
        data,
        select: branchSelect,
      });
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
      return transaction.branch.update({
        where: { id: branch.id },
        data: { status },
        select: branchSelect,
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
