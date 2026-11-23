import type { MembershipRole, Permission, PlatformRole } from '@aicrm/shared';

export type AuthPrincipal = {
  userId: string;
  sessionId: string;
  sessionTokenHash: string;
  activeTenantId: string | null;
  memberships: readonly {
    id: string;
    tenantId: string;
    role: MembershipRole;
  }[];
  tenantPermissions: readonly Permission[];
  platformRole: PlatformRole | null;
  platformPermissions: readonly Permission[];
};
