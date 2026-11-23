import type { TenantContext } from '@aicrm/shared';

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
