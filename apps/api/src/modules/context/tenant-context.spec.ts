import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@aicrm/shared';
import { assertTenantContext } from './tenant-context';

const validContext: TenantContext = {
  kind: 'tenant',
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  membershipId: '33333333-3333-4333-8333-333333333333',
  permissions: [],
};

describe('TenantContext', () => {
  it('accepts a trusted valid tenant context', () => {
    expect(assertTenantContext(validContext)).toBe(validContext);
  });

  it('rejects missing tenant context', () => {
    expect(() => assertTenantContext(undefined)).toThrow(/trusted tenant context/);
  });

  it('rejects invalid identifiers', () => {
    expect(() => assertTenantContext({ ...validContext, tenantId: 'tenant-a' })).toThrow(
      /invalid identifier/,
    );
  });
});
