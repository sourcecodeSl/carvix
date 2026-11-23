import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { AuthPrismaService } from '../database/auth-prisma.service';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly config: ConfigService,
  ) {}

  generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  async create(
    userId: string,
    activeTenantId: string | null,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = this.generateToken();
    const ttlHours = this.config.getOrThrow<number>('SESSION_TTL_HOURS');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    await this.prisma.$queryRaw`
      SELECT * FROM public.auth_create_session(
        ${userId}::uuid,
        ${this.hashToken(token)},
        ${activeTenantId}::uuid,
        ${expiresAt}::timestamp
      )
    `;
    return { token, expiresAt };
  }

  async validate(token: string) {
    if (!token || token.length < 32) return null;
    const tokenHash = this.hashToken(token);
    const sessionRows = await this.prisma.$queryRaw<
      Array<{
        session_id: string;
        user_id: string;
        active_tenant_id: string | null;
        expires_at: Date;
        revoked_at: Date | null;
        user_status: 'ACTIVE' | 'INVITED' | 'DISABLED' | 'DELETED';
      }>
    >`SELECT * FROM public.auth_session_for_token(${tokenHash})`;
    const session = sessionRows[0];
    if (
      !session ||
      session.revoked_at ||
      session.expires_at <= new Date() ||
      session.user_status !== 'ACTIVE'
    ) {
      return null;
    }
    await this.prisma.$queryRaw`
      SELECT * FROM public.auth_touch_session(${tokenHash})
    `;
    const memberships = await this.prisma.$queryRaw<
      Array<{
        membership_id: string;
        tenant_id: string;
        tenant_name: string;
        role: 'DEALER_ADMIN' | 'SALES_MANAGER' | 'SALES_AGENT';
        membership_status: 'ACTIVE';
        tenant_status: 'ACTIVE';
      }>
    >`SELECT * FROM public.auth_active_memberships(${tokenHash})`;
    const platform = await this.prisma.$queryRaw<
      Array<{ role: 'SUPER_ADMIN'; status: 'ACTIVE' }>
    >`SELECT * FROM public.auth_platform_administrator(${tokenHash})`;
    return {
      id: session.session_id,
      userId: session.user_id,
      activeTenantId: session.active_tenant_id,
      memberships,
      platformAdministrator: platform[0] ?? null,
    };
  }

  async revokeByToken(token: string): Promise<void> {
    if (!token) return;
    await this.prisma.$queryRaw`
      SELECT * FROM public.auth_revoke_session(${this.hashToken(token)})
    `;
  }

  async setActiveTenant(sessionId: string, tenantId: string): Promise<void> {
    await this.prisma.$queryRaw`
      SELECT * FROM public.auth_set_active_tenant(${sessionId}::uuid, ${tenantId}::uuid)
    `;
  }

  async setActiveTenantByTokenHash(tokenHash: string, tenantId: string | null): Promise<void> {
    if (!tenantId) return;
    const rows = await this.prisma.$queryRaw<
      Array<{ session_id: string }>
    >`SELECT session_id FROM public.auth_session_for_token(${tokenHash})`;
    if (rows[0]) {
      await this.prisma.$queryRaw`
        SELECT * FROM public.auth_set_active_tenant(${rows[0].session_id}::uuid, ${tenantId}::uuid)
      `;
    }
  }
}
