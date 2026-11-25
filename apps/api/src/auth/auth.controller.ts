import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AuthenticatedUserResponse, Permission } from '@aicrm/shared';
import { RolePermissions } from '@aicrm/shared';
import { AuthPrismaService } from '../database/auth-prisma.service';
import { PasswordService } from './password.service';
import { AuthSessionService } from './session.service';
import { LoginDto, ActiveTenantDto } from './auth.dto';
import { AuthGuard, AUTH_COOKIE_NAME } from './auth.guard';
import { CsrfGuard } from './csrf.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import type { AuthPrincipal } from './auth.types';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
@UseGuards(CsrfGuard)
export class AuthController {
  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionService,
    private readonly loginLimits: LoginRateLimitService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const email = dto.email.trim().toLowerCase();
    const sourceAddress = request.ip || 'unknown';
    if (!(await this.loginLimits.check(sourceAddress, email))) {
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: {
        passwordCredential: true,
      },
    });
    if (!user || user.status !== 'ACTIVE' || !user.passwordCredential) {
      await this.recordAuthEvent(
        null,
        'auth.login.failure',
        null,
        'login',
        'session',
        null,
        'FAILURE',
        request,
      );
      throw new UnauthorizedException('Invalid email or password.');
    }
    const valid = await this.passwords.verifyPassword(
      user.passwordCredential.passwordHash,
      dto.password,
    );
    if (!valid) {
      await this.recordAuthEvent(
        null,
        'auth.login.failure',
        null,
        'login',
        'session',
        null,
        'FAILURE',
        request,
      );
      throw new UnauthorizedException('Invalid email or password.');
    }

    const { token, expiresAt } = await this.sessions.create(user.id, null);
    const sessionTokenHash = this.sessions.hashToken(token);
    const memberships = await this.prisma.$queryRaw<
      Array<{
        membership_id: string;
        tenant_id: string;
        tenant_name: string;
        role: 'DEALER_ADMIN' | 'SALES_MANAGER' | 'SALES_AGENT';
        membership_status: 'ACTIVE';
        tenant_status: 'ACTIVE';
      }>
    >`SELECT * FROM public.auth_active_memberships(${sessionTokenHash})`;
    const activeTenantId = memberships.length === 1 ? (memberships[0]?.tenant_id ?? null) : null;
    await this.sessions.setActiveTenantByTokenHash(sessionTokenHash, activeTenantId);
    await this.recordAuthEvent(
      sessionTokenHash,
      'auth.login.success',
      activeTenantId,
      'login',
      'session',
      null,
      'SUCCESS',
      request,
    );

    const production = this.config.getOrThrow<string>('NODE_ENV') === 'production';
    response.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    return {
      user: await this.buildUserResponse(user.id, activeTenantId, sessionTokenHash),
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth(AUTH_COOKIE_NAME)
  @ApiOperation({ summary: 'Get the authenticated user and active tenant' })
  async me(@Req() request: Request & { auth: AuthPrincipal }): Promise<AuthenticatedUserResponse> {
    return this.buildUserResponse(
      request.auth.userId,
      request.auth.activeTenantId,
      request.auth.sessionTokenHash,
    );
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session and clear the authentication cookie' })
  @HttpCode(200)
  async logout(
    @Req() request: Request & { cookies: Record<string, string> },
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = request.cookies?.[AUTH_COOKIE_NAME];
    if (token) {
      const session = await this.sessions.validate(token);
      if (session) {
        await this.recordAuthEvent(
          this.sessions.hashToken(token),
          'auth.logout',
          session.activeTenantId,
          'logout',
          'session',
          session.id,
          'SUCCESS',
          request,
        );
      }
      await this.sessions.revokeByToken(token);
    }
    response.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.config.getOrThrow<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { status: 'ok' };
  }

  @Post('active-tenant')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async selectActiveTenant(
    @Req() request: Request & { auth: AuthPrincipal },
    @Body() dto: ActiveTenantDto,
  ) {
    const token = (request as Request & { cookies: Record<string, string> }).cookies[
      AUTH_COOKIE_NAME
    ];
    const memberships = await this.prisma.$queryRaw<
      Array<{
        membership_id: string;
        tenant_id: string;
        tenant_name: string;
        role: 'DEALER_ADMIN' | 'SALES_MANAGER' | 'SALES_AGENT';
        membership_status: 'ACTIVE';
        tenant_status: 'ACTIVE';
      }>
    >`SELECT * FROM public.auth_active_memberships(${this.sessions.hashToken(token)})`;
    const membership = memberships.find((row) => row.tenant_id === dto.tenantId);
    if (!membership) throw new ForbiddenException('Tenant is not authorized');
    await this.sessions.setActiveTenant(request.auth.sessionId, membership.tenant_id);
    await this.recordAuthEvent(
      this.sessions.hashToken(token),
      'auth.tenant.switched',
      membership.tenant_id,
      'switch-tenant',
      'tenant',
      membership.tenant_id,
      'SUCCESS',
      request,
    );
    return {
      activeTenant: {
        tenantId: membership.tenant_id,
        tenantName: membership.tenant_name,
        role: membership.role,
      },
    };
  }

  private async recordAuthEvent(
    sessionTokenHash: string | null,
    eventType: string,
    targetTenantId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    outcome: 'SUCCESS' | 'FAILURE' | 'DENIED',
    request: Request,
  ): Promise<void> {
    const userAgent =
      typeof request.headers['user-agent'] === 'string'
        ? request.headers['user-agent'].slice(0, 256)
        : null;
    const requestIdHeader = request.headers['x-request-id'];
    const requestId = typeof requestIdHeader === 'string' ? requestIdHeader.slice(0, 128) : null;
    await this.prisma.$queryRaw`
      SELECT public.audit_record_auth_event(
        ${sessionTokenHash},
        ${eventType},
        ${targetTenantId}::uuid,
        ${action},
        ${resourceType},
        ${resourceId},
        ${outcome}::"AuditEventOutcome",
        ${requestId},
        ${request.ip || null},
        ${userAgent}
      )
    `;
  }

  private async buildUserResponse(
    userId: string,
    activeTenantId: string | null,
    sessionTokenHash: string,
  ): Promise<AuthenticatedUserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, status: true },
    });
    if (!user) throw new UnauthorizedException('Authentication required');

    const membershipRows = await this.prisma.$queryRaw<
      Array<{
        membership_id: string;
        tenant_id: string;
        tenant_name: string;
        role: 'DEALER_ADMIN' | 'SALES_MANAGER' | 'SALES_AGENT';
        membership_status: 'ACTIVE';
        tenant_status: 'ACTIVE';
      }>
    >`SELECT * FROM public.auth_active_memberships(${sessionTokenHash})`;
    const platformRows = await this.prisma.$queryRaw<
      Array<{ role: 'SUPER_ADMIN'; status: 'ACTIVE' }>
    >`SELECT * FROM public.auth_platform_administrator(${sessionTokenHash})`;
    const memberships = membershipRows.map((membership) => ({
      id: membership.membership_id,
      tenantId: membership.tenant_id,
      tenantName: membership.tenant_name,
      role: membership.role,
      status: 'ACTIVE' as const,
    }));

    const activeMembership = memberships.find(
      (membership) => membership.tenantId === activeTenantId && membership.status === 'ACTIVE',
    );
    const activeTenant = activeMembership
      ? {
          tenantId: activeMembership.tenantId,
          tenantName: activeMembership.tenantName,
          role: activeMembership.role,
        }
      : null;

    const permissions: readonly Permission[] = activeMembership
      ? RolePermissions[activeMembership.role]
      : [];

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      memberships,
      activeTenant,
      platformRole: platformRows[0]?.status === 'ACTIVE' ? platformRows[0].role : null,
      permissions,
    };
  }
}
