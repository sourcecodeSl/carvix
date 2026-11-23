import { describe, expect, it } from 'vitest';
import {
  MembershipRole,
  Permission,
  PlatformRole,
  PlatformRolePermissions,
  RolePermissions,
} from './index.js';

describe('role permissions', () => {
  it('gives Dealer Admin tenant management permissions', () => {
    expect(RolePermissions.DEALER_ADMIN).toContain(Permission.BRANCH_CREATE);
  });

  it('gives Sales Manager assignment permissions but not dealer subscription management', () => {
    expect(RolePermissions.SALES_MANAGER).toContain(Permission.LEAD_ASSIGN);
    expect(RolePermissions.SALES_MANAGER).not.toContain(Permission.SUBSCRIPTION_MANAGE);
  });

  it('restricts Sales Agent management permissions', () => {
    expect(RolePermissions.SALES_AGENT).not.toContain(Permission.BRANCH_CREATE);
    expect(RolePermissions.SALES_AGENT).not.toContain(Permission.USER_INVITE);
  });

  it('separates platform permissions from tenant permissions', () => {
    expect(PlatformRolePermissions[PlatformRole.SUPER_ADMIN]).toContain(
      Permission.PLATFORM_DEALERS_CREATE,
    );
    expect(PlatformRolePermissions[PlatformRole.SUPER_ADMIN]).not.toContain(
      Permission.DEALER_UPDATE,
    );
  });

  it('defines a distinct role for every dealership role', () => {
    expect(Object.keys(RolePermissions)).toEqual([
      MembershipRole.DEALER_ADMIN,
      MembershipRole.SALES_MANAGER,
      MembershipRole.SALES_AGENT,
    ]);
  });
});
