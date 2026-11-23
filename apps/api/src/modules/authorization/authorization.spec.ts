import { describe, expect, it } from 'vitest';
import { MembershipRole, Permission, RolePermissions } from '@aicrm/shared';

describe('authorization matrix', () => {
  it('allows Dealer Admin to manage branches', () => {
    expect(RolePermissions[MembershipRole.DEALER_ADMIN]).toContain(Permission.BRANCH_UPDATE);
  });

  it('allows Sales Manager to assign leads', () => {
    expect(RolePermissions[MembershipRole.SALES_MANAGER]).toContain(Permission.LEAD_ASSIGN);
  });

  it('does not allow Sales Agent to manage users or branches', () => {
    expect(RolePermissions[MembershipRole.SALES_AGENT]).not.toContain(Permission.USER_INVITE);
    expect(RolePermissions[MembershipRole.SALES_AGENT]).not.toContain(Permission.BRANCH_CREATE);
  });

  it('denies an unsupported permission request', () => {
    expect(
      RolePermissions[MembershipRole.SALES_AGENT].includes(Permission.SUBSCRIPTION_MANAGE),
    ).toBe(false);
  });
});
