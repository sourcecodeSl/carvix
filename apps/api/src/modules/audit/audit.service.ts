import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuditEventPageResponse, AuditSummaryResponse, TenantContext } from '@aicrm/shared';
import type { Prisma } from '@aicrm/database';
import { AuditRepository, type AuditEventRecord } from './audit.repository';
import type { ListAuditEventsDto } from './audit.dto';

export type AuditEventInput = {
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
  resourceId?: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  async record(
    transaction: Prisma.TransactionClient,
    context: TenantContext,
    input: AuditEventInput,
  ): Promise<void> {
    await this.audit.recordTenantEvent(transaction, context, sanitizeInput(input));
  }

  async list(context: TenantContext, filters: ListAuditEventsDto): Promise<AuditEventPageResponse> {
    const start = filters.startDate ? new Date(filters.startDate) : null;
    const end = filters.endDate ? new Date(filters.endDate) : null;
    if (start && end && start > end) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }
    const result = await this.audit.list(context, filters);
    return {
      items: result.items.map(toResponse),
      total: result.total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async get(context: TenantContext, eventId: string) {
    const event = await this.audit.findById(context, eventId);
    return event ? toResponse(event) : null;
  }

  async summary(
    context: TenantContext,
    filters: { startDate?: string; endDate?: string },
  ): Promise<AuditSummaryResponse> {
    const start = filters.startDate ? new Date(filters.startDate) : null;
    const end = filters.endDate ? new Date(filters.endDate) : null;
    if (start && end && start > end) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }
    return this.audit.summary(context, start, end);
  }
}

export function sanitizeInput(input: AuditEventInput): AuditEventInput {
  const metadata = input.metadata ? sanitizeMetadata(input.metadata) : null;
  return {
    ...input,
    resourceId: input.resourceId ? input.resourceId.slice(0, 128) : null,
    requestId: input.requestId ? input.requestId.slice(0, 128) : null,
    ipAddress: input.ipAddress ? input.ipAddress.slice(0, 64) : null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 256) : null,
    metadata,
  };
}

export function sanitizeMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> | null {
  const allowedKeys = new Set([
    'status',
    'previousRole',
    'newRole',
    'previousStatus',
    'newStatus',
    'branchCount',
    'invitationStatus',
    'changedFields',
  ]);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof value === 'string') output[key] = value.slice(0, 128);
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
    else if (typeof value === 'boolean') output[key] = value;
    else if (Array.isArray(value)) {
      output[key] = value
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 50)
        .map((item) => item.slice(0, 128));
    }
  }
  if (JSON.stringify(output).length > 8192) return null;
  return Object.keys(output).length ? output : null;
}

function toResponse(event: AuditEventRecord): import('@aicrm/shared').AuditEventResponse {
  return {
    id: event.id,
    tenantId: event.tenantId,
    actorUserId: event.actorUserId,
    actorName: event.actorName,
    actorMembershipId: event.actorMembershipId,
    eventType: event.eventType,
    category: event.category,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    outcome: event.outcome,
    requestId: event.requestId,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    metadata: event.metadata as Record<string, unknown> | null,
    schemaVersion: event.schemaVersion,
    occurredAt: event.occurredAt.toISOString(),
  };
}
