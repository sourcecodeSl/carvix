import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Permission, type MembershipRole, type TenantContext } from '@aicrm/shared';
import { Prisma } from '@aicrm/database';
import { AuthPrismaService } from '../../database/auth-prisma.service';
import { PrismaService } from '../../database/prisma.service';
import { assertTenantContext, isUuid, scopeTenantTransaction } from '../context/tenant-context';
import { AuditService } from '../audit/audit.service';

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  branches: {
    select: {
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: { branch: { name: 'asc' } },
  },
} satisfies Prisma.StaffInvitationSelect;

export type StaffInvitationRecord = Prisma.StaffInvitationGetPayload<{
  select: typeof invitationSelect;
}>;

export type StaffInvitationPreviewRecord = {
  id: string;
  tenantId: string;
  email: string;
  role: 'SALES_MANAGER' | 'SALES_AGENT';
  tenant: { name: string };
  expiresAt: Date;
  branches: Array<{
    branch: {
      id: string;
      name: string;
      code: string;
    };
  }>;
};

@Injectable()
export class StaffInvitationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authPrisma: AuthPrismaService,
    private readonly audit: AuditService,
  ) {}

  async resolveToken(
    tokenHash: string,
  ): Promise<{ invitationId: string; tenantId: string } | null> {
    const resolved = await this.authPrisma.$queryRaw<
      Array<{ invitation_id: string; tenant_id: string }>
    >`SELECT * FROM public.staff_resolve_invitation(${tokenHash})`;
    const invitation = resolved[0];
    return invitation
      ? { invitationId: invitation.invitation_id, tenantId: invitation.tenant_id }
      : null;
  }

  async preview(tokenHash: string, tenantId: string): Promise<StaffInvitationPreviewRecord | null> {
    const rows = await this.authPrisma.$queryRaw<
      Array<{
        invitation_id: string;
        tenant_id: string;
        email: string;
        role: 'SALES_MANAGER' | 'SALES_AGENT';
        tenant_name: string;
        branches: Array<{ id: string; name: string; code: string }>;
        expires_at: Date;
      }>
    >`SELECT * FROM public.staff_resolve_invitation_preview(${tokenHash})`;
    const invitation = rows.find((row) => row.tenant_id === tenantId);
    if (!invitation || invitation.expires_at.getTime() <= Date.now()) return null;
    return {
      id: invitation.invitation_id,
      tenantId: invitation.tenant_id,
      email: invitation.email,
      role: invitation.role,
      tenant: { name: invitation.tenant_name },
      expiresAt: invitation.expires_at,
      branches: invitation.branches.map((branch) => ({ branch })),
    };
  }

  async create(
    context: TenantContext,
    values: {
      email: string;
      role: Extract<MembershipRole, 'SALES_MANAGER' | 'SALES_AGENT'>;
      tokenHash: string;
      expiresAt: Date;
      branchIds: readonly string[];
    },
  ): Promise<StaffInvitationRecord> {
    const trusted = this.requirePermission(context);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${trusted.tenantId}:staff-invite:${values.email}`}, 0))`;

      const existingMember = await transaction.tenantMembership.findFirst({
        where: {
          tenantId: trusted.tenantId,
          user: { is: { email: { equals: values.email, mode: 'insensitive' } } },
        },
        select: { id: true },
      });
      if (existingMember) throw new ConflictException('This email already has a tenant membership');

      const existingInvitation = await transaction.staffInvitation.findFirst({
        where: {
          tenantId: trusted.tenantId,
          email: values.email,
          status: 'PENDING',
        },
        select: { id: true, expiresAt: true },
      });
      if (existingInvitation && existingInvitation.expiresAt.getTime() > Date.now()) {
        throw new ConflictException('A pending invitation already exists for this email');
      }
      if (existingInvitation) {
        await transaction.staffInvitation.update({
          where: { id: existingInvitation.id },
          data: { status: 'EXPIRED' },
        });
      }

      const branches = values.branchIds.length
        ? await transaction.branch.findMany({
            where: {
              id: { in: [...values.branchIds] },
              tenantId: trusted.tenantId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : [];
      if (branches.length !== values.branchIds.length) {
        throw new BadRequestException('One or more selected branches are unavailable');
      }

      const invitation = await transaction.staffInvitation.create({
        data: {
          tenantId: trusted.tenantId,
          invitedByMembershipId: trusted.membershipId,
          email: values.email,
          role: values.role,
          tokenHash: values.tokenHash,
          expiresAt: values.expiresAt,
        },
        select: { id: true },
      });
      if (branches.length) {
        await transaction.staffInvitationBranch.createMany({
          data: branches.map((branch) => ({
            tenantId: trusted.tenantId,
            invitationId: invitation.id,
            branchId: branch.id,
          })),
        });
      }
      const created = await transaction.staffInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
        select: invitationSelect,
      });
      await this.audit.record(transaction, trusted, {
        eventType: 'staff.invitation.created',
        category: 'INVITATION',
        action: 'create',
        resourceType: 'staff_invitation',
        resourceId: invitation.id,
        outcome: 'SUCCESS',
        metadata: { role: values.role, branchCount: branches.length, invitationStatus: 'PENDING' },
      });
      return created;
    });
  }

  async list(
    context: TenantContext,
    filters: {
      page: number;
      pageSize: number;
      status?: 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
    },
  ): Promise<{ items: StaffInvitationRecord[]; total: number }> {
    const trusted = this.requirePermission(context);
    const now = new Date();
    const where: Prisma.StaffInvitationWhereInput = {
      tenantId: trusted.tenantId,
      ...(filters.status ? { status: filters.status } : {}),
    };
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      await transaction.staffInvitation.updateMany({
        where: {
          tenantId: trusted.tenantId,
          status: 'PENDING',
          expiresAt: { lte: now },
        },
        data: { status: 'EXPIRED' },
      });
      const [total, items] = await Promise.all([
        transaction.staffInvitation.count({ where }),
        transaction.staffInvitation.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
          select: invitationSelect,
        }),
      ]);
      return { items, total };
    });
  }

  async cancel(
    context: TenantContext,
    invitationId: string,
  ): Promise<StaffInvitationRecord | null> {
    const trusted = this.requirePermission(context);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM public.staff_invitations
        WHERE id = ${invitationId}::uuid AND tenant_id = ${trusted.tenantId}::uuid
        FOR UPDATE
      `;
      const invitation = await transaction.staffInvitation.findFirst({
        where: { id: invitationId, tenantId: trusted.tenantId },
        select: { id: true, status: true, expiresAt: true },
      });
      if (!invitation) return null;
      if (invitation.status !== 'PENDING' || invitation.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException('This invitation can no longer be cancelled');
      }
      await transaction.staffInvitation.update({
        where: { id: invitation.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      const cancelled = await transaction.staffInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
        select: invitationSelect,
      });
      await this.audit.record(transaction, trusted, {
        eventType: 'staff.invitation.cancelled',
        category: 'INVITATION',
        action: 'cancel',
        resourceType: 'staff_invitation',
        resourceId: invitation.id,
        outcome: 'SUCCESS',
        metadata: { invitationStatus: 'CANCELLED' },
      });
      return cancelled;
    });
  }

  async acceptForExistingUser(
    tokenHash: string,
    invitationId: string,
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await this.scopeResolvedTenant(transaction, tenantId);
      await this.lockInvitation(transaction, invitationId, tenantId);
      const invitation = await transaction.staffInvitation.findFirst({
        where: { id: invitationId, tenantId, tokenHash, status: 'PENDING' },
        select: {
          id: true,
          role: true,
          expiresAt: true,
          branches: { select: { branchId: true } },
        },
      });
      if (!invitation || invitation.expiresAt.getTime() <= Date.now()) return false;

      const existingMembership = await transaction.tenantMembership.findFirst({
        where: { tenantId, userId },
        select: { id: true },
      });
      if (existingMembership)
        throw new ConflictException('This user already has a tenant membership');

      const membership = await transaction.tenantMembership.create({
        data: {
          tenantId,
          userId,
          role: invitation.role,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      await this.createBranchAssignments(
        transaction,
        tenantId,
        membership.id,
        invitation.branches.map(({ branchId }) => branchId),
      );
      await transaction.staffInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await this.audit.record(
        transaction,
        {
          kind: 'tenant',
          tenantId,
          userId,
          membershipId: membership.id,
          permissions: [],
        },
        {
          eventType: 'staff.invitation.accepted',
          category: 'INVITATION',
          action: 'accept',
          resourceType: 'staff_invitation',
          resourceId: invitation.id,
          outcome: 'SUCCESS',
          metadata: { invitationStatus: 'ACCEPTED', branchCount: invitation.branches.length },
        },
      );
      return true;
    });
  }

  async acceptForNewUser(
    tokenHash: string,
    invitationId: string,
    tenantId: string,
    name: string,
    passwordHash: string,
  ): Promise<'accepted' | 'existing-user' | 'invalid'> {
    return this.prisma.$transaction(async (transaction) => {
      await this.scopeResolvedTenant(transaction, tenantId);
      await this.lockInvitation(transaction, invitationId, tenantId);
      const invitation = await transaction.staffInvitation.findFirst({
        where: { id: invitationId, tenantId, tokenHash, status: 'PENDING' },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          branches: { select: { branchId: true } },
        },
      });
      if (!invitation || invitation.expiresAt.getTime() <= Date.now()) return 'invalid';

      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`staff-user:${invitation.email}`}, 0))`;
      const existingUser = await this.authPrisma.user.findFirst({
        where: { email: { equals: invitation.email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existingUser) return 'existing-user';

      const user = await transaction.user.create({
        data: {
          tenantId,
          email: invitation.email,
          name: name.trim(),
          status: 'INVITED',
        },
        select: { id: true },
      });
      const membership = await transaction.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          role: invitation.role,
          status: 'INVITED',
        },
        select: { id: true },
      });
      const credential = await transaction.$queryRaw<Array<{ created: boolean }>>`
        SELECT public.staff_create_invited_password_credential(
          ${user.id}::uuid,
          ${passwordHash}
        ) AS created
      `;
      if (credential[0]?.created !== true) {
        throw new ConflictException('The invited account could not be activated');
      }

      await transaction.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE' },
      });
      await transaction.tenantMembership.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE' },
      });
      await this.createBranchAssignments(
        transaction,
        tenantId,
        membership.id,
        invitation.branches.map(({ branchId }) => branchId),
      );
      await transaction.staffInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await this.audit.record(
        transaction,
        {
          kind: 'tenant',
          tenantId,
          userId: user.id,
          membershipId: membership.id,
          permissions: [],
        },
        {
          eventType: 'staff.invitation.accepted',
          category: 'INVITATION',
          action: 'accept',
          resourceType: 'staff_invitation',
          resourceId: invitation.id,
          outcome: 'SUCCESS',
          metadata: { invitationStatus: 'ACCEPTED', branchCount: invitation.branches.length },
        },
      );
      return 'accepted';
    });
  }

  private requirePermission(context: TenantContext): TenantContext {
    const trusted = assertTenantContext(context);
    if (!trusted.permissions.includes(Permission.USER_INVITE)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return trusted;
  }

  private async scopeResolvedTenant(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    if (!isUuid(tenantId)) throw new Error('Invitation resolver returned an invalid tenant ID');
    await transaction.$executeRaw`SET LOCAL ROLE "aicrm_app"`;
    await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  }

  private async lockInvitation(
    transaction: Prisma.TransactionClient,
    invitationId: string,
    tenantId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.staff_invitations
      WHERE id = ${invitationId}::uuid AND tenant_id = ${tenantId}::uuid
      FOR UPDATE
    `;
  }

  private async createBranchAssignments(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    branchIds: readonly string[],
  ): Promise<void> {
    if (!branchIds.length) return;
    const now = new Date();
    await transaction.staffBranchAssignment.createMany({
      data: branchIds.map((branchId) => ({
        tenantId,
        membershipId,
        branchId,
        updatedAt: now,
      })),
    });
  }
}
