import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@aicrm/database';
import type { TenantContext } from '@aicrm/shared';
import { RolePermissions } from '@aicrm/shared';
import type { AuthPrincipal } from '../../auth/auth.types';

export function assertTenantContext(context: TenantContext | null | undefined): TenantContext {
  if (!context || context.kind !== 'tenant') {
    throw new Error('A trusted tenant context is required');
  }
  if (!isUuid(context.tenantId) || !isUuid(context.userId) || !isUuid(context.membershipId)) {
    throw new Error('Tenant context contains an invalid identifier');
  }
  return context;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function tenantContextFromPrincipal(principal: AuthPrincipal): TenantContext {
  const activeTenantId = principal.activeTenantId;
  if (!activeTenantId) {
    throw new ForbiddenException('An active tenant membership is required');
  }

  const membership = principal.memberships.find(
    (candidate) => candidate.tenantId === activeTenantId,
  );
  if (!membership) {
    throw new ForbiddenException('An active tenant membership is required');
  }

  return {
    kind: 'tenant',
    tenantId: membership.tenantId,
    userId: principal.userId,
    membershipId: membership.id,
    permissions: RolePermissions[membership.role],
  };
}

export async function scopeTenantTransaction(
  transaction: Prisma.TransactionClient,
  context: TenantContext,
): Promise<void> {
  const trusted = assertTenantContext(context);
  await transaction.$executeRaw`SET LOCAL ROLE "aicrm_app"`;
  await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${trusted.tenantId}, true)`;
}
