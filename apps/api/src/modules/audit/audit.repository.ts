import { Injectable } from '@nestjs/common';
import type { AuditSummaryResponse, TenantContext } from '@aicrm/shared';
import { Prisma } from '@aicrm/database';
import { PrismaService } from '../../database/prisma.service';
import { assertTenantContext, scopeTenantTransaction } from '../context/tenant-context';
import type { ListAuditEventsDto } from './audit.dto';
import type { AuditEventInput } from './audit.service';

export type AuditEventRecord = {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorMembershipId: string | null;
  eventType: string;
  category:
    | 'AUTHENTICATION'
    | 'AUTHORIZATION'
    | 'DEALERSHIP'
    | 'BRANCH'
    | 'STAFF'
    | 'INVITATION'
    | 'SECURITY'
    | 'SYSTEM';
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Prisma.JsonValue | null;
  schemaVersion: number;
  occurredAt: Date;
};

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordTenantEvent(
    transaction: Prisma.TransactionClient,
    context: TenantContext,
    input: AuditEventInput,
  ): Promise<void> {
    await transaction.auditEvent.create({
      data: {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        eventType: input.eventType,
        category: input.category,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        outcome: input.outcome,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async list(context: TenantContext, filters: ListAuditEventsDto) {
    const trusted = assertTenantContext(context);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const start = filters.startDate ? new Date(filters.startDate) : null;
      const end = filters.endDate ? new Date(filters.endDate) : null;
      const where: Prisma.AuditEventWhereInput = {
        tenantId: trusted.tenantId,
        ...(filters.eventType ? { eventType: { equals: filters.eventType } } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.outcome ? { outcome: filters.outcome } : {}),
        ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
        ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
        ...(start || end
          ? {
              occurredAt: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {}),
              },
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        transaction.auditEvent.count({ where }),
        transaction.auditEvent.findMany({
          where,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
      ]);
      const actorIds = [
        ...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => !!id)),
      ];
      const users = actorIds.length
        ? await transaction.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true },
          })
        : [];
      const names = new Map(users.map((user) => [user.id, user.name]));
      return {
        total,
        items: rows.map((row) => ({
          ...row,
          actorName: row.actorUserId ? (names.get(row.actorUserId) ?? null) : null,
        })) as AuditEventRecord[],
      };
    });
  }

  async findById(context: TenantContext, eventId: string): Promise<AuditEventRecord | null> {
    const trusted = assertTenantContext(context);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const row = await transaction.auditEvent.findFirst({
        where: { id: eventId, tenantId: trusted.tenantId },
      });
      if (!row) return null;
      const actor = row.actorUserId
        ? await transaction.user.findFirst({
            where: { id: row.actorUserId },
            select: { name: true },
          })
        : null;
      return { ...row, actorName: actor?.name ?? null } as AuditEventRecord;
    });
  }

  async summary(
    context: TenantContext,
    start: Date | null,
    end: Date | null,
  ): Promise<AuditSummaryResponse> {
    const trusted = assertTenantContext(context);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const base: Prisma.AuditEventWhereInput = {
        tenantId: trusted.tenantId,
        ...(start || end
          ? {
              occurredAt: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {}),
              },
            }
          : {}),
      };
      const [
        total,
        successfulLogins,
        failedLogins,
        accessDenied,
        staffRoleChanges,
        invitationAcceptances,
        branchModifications,
      ] = await Promise.all([
        transaction.auditEvent.count({ where: base }),
        transaction.auditEvent.count({
          where: { ...base, eventType: 'auth.login.success', outcome: 'SUCCESS' },
        }),
        transaction.auditEvent.count({ where: { ...base, eventType: 'auth.login.failure' } }),
        transaction.auditEvent.count({ where: { ...base, outcome: 'DENIED' } }),
        transaction.auditEvent.count({ where: { ...base, eventType: 'staff.role.changed' } }),
        transaction.auditEvent.count({
          where: { ...base, eventType: 'staff.invitation.accepted' },
        }),
        transaction.auditEvent.count({
          where: {
            ...base,
            OR: [
              { eventType: 'branch.created' },
              { eventType: 'branch.updated' },
              { eventType: 'branch.activated' },
              { eventType: 'branch.deactivated' },
              { eventType: 'dealership.profile.updated' },
            ],
          },
        }),
      ]);
      return {
        period: { start: start?.toISOString() ?? null, end: end?.toISOString() ?? null },
        total,
        successfulLogins,
        failedLogins,
        accessDenied,
        staffRoleChanges,
        invitationAcceptances,
        branchModifications,
      };
    });
  }
}
