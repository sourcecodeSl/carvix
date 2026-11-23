import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { MembershipRole, PlatformRole, RolePermissions } from '@aicrm/shared';
import { AuthSessionService } from './session.service';
import type { AuthPrincipal } from './auth.types';

export const AUTH_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-aicrm_session' : 'aicrm_session';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: AuthSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { cookies: Record<string, string>; auth?: AuthPrincipal }>();
    const token = request.cookies?.[AUTH_COOKIE_NAME];
    if (!token) throw new UnauthorizedException('Authentication required');

    const session = await this.sessions.validate(token);
    if (!session) throw new UnauthorizedException('Authentication required');

    const memberships = session.memberships.map((membership) => ({
      id: membership.membership_id,
      tenantId: membership.tenant_id,
      role: membership.role as MembershipRole,
    }));

    let activeTenantId = session.activeTenantId;
    if (
      activeTenantId &&
      !memberships.some((membership) => membership.tenantId === activeTenantId)
    ) {
      activeTenantId = null;
    }
    if (!activeTenantId && memberships.length === 1) {
      activeTenantId = memberships[0]?.tenantId ?? null;
    }

    const activeMembership = memberships.find(
      (membership) => membership.tenantId === activeTenantId,
    );
    const tenantPermissions = activeMembership ? RolePermissions[activeMembership.role] : [];
    const platformRole =
      session.platformAdministrator?.status === 'ACTIVE'
        ? (session.platformAdministrator.role as PlatformRole)
        : null;

    request.auth = {
      userId: session.userId,
      sessionId: session.id,
      sessionTokenHash: this.sessions.hashToken(token),
      activeTenantId,
      memberships,
      tenantPermissions,
      platformRole,
      platformPermissions: [],
    };
    return true;
  }
}
