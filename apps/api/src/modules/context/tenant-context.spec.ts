import { describe, expect, it } from 'vitest';
import { MembershipRole, Permission, type TenantContext } from '@aicrm/shared';
import { assertTenantContext, tenantContextFromPrincipal } from './tenant-context';

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

  it('derives tenant scope and permissions from the active verified membership', () => {
    const context = tenantContextFromPrincipal({
      userId: validContext.userId,
      sessionId: '44444444-4444-4444-8444-444444444444',
      sessionTokenHash: 'hash',
      activeTenantId: validContext.tenantId,
      memberships: [
        {
          id: validContext.membershipId,
          tenantId: validContext.tenantId,
          role: MembershipRole.DEALER_ADMIN,
        },
      ],
      tenantPermissions: [],
      platformRole: null,
      platformPermissions: [],
    });

    expect(context).toEqual({
      ...validContext,
      permissions: expect.arrayContaining([Permission.DEALER_UPDATE, Permission.BRANCH_CREATE]),
    });
  });

  it('rejects principals without an active authorized membership', () => {
    const principal = {
      userId: validContext.userId,
      sessionId: '44444444-4444-4444-8444-444444444444',
      sessionTokenHash: 'hash',
      activeTenantId: validContext.tenantId,
      memberships: [],
      tenantPermissions: [],
      platformRole: null,
      platformPermissions: [],
    };

    expect(() => tenantContextFromPrincipal(principal)).toThrow(/active tenant membership/);
  });
});
