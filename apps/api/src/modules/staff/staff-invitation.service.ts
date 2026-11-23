import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateStaffInvitationResponse, StaffInvitationPreviewResponse } from '@aicrm/shared';
import type { TenantContext } from '@aicrm/shared';
import { AuthPrismaService } from '../../database/auth-prisma.service';
import { PasswordService } from '../../auth/password.service';
import type {
  AcceptNewStaffInvitationDto,
  CreateStaffInvitationDto,
  ListStaffInvitationsDto,
} from './staff.dto';
import { StaffInvitationRateLimitService } from './staff-invitation-rate-limit.service';
import {
  STAFF_INVITATION_DELIVERY,
  type StaffInvitationDelivery,
} from './staff-invitation-delivery';
import {
  StaffInvitationRepository,
  type StaffInvitationPreviewRecord,
  type StaffInvitationRecord,
} from './staff-invitation.repository';

const invitationLifetimeMs = 48 * 60 * 60 * 1000;

@Injectable()
export class StaffInvitationService {
  constructor(
    private readonly invitations: StaffInvitationRepository,
    private readonly authPrisma: AuthPrismaService,
    private readonly passwords: PasswordService,
    private readonly rateLimits: StaffInvitationRateLimitService,
    @Inject(STAFF_INVITATION_DELIVERY)
    private readonly delivery: StaffInvitationDelivery,
    private readonly config: ConfigService,
  ) {}

  async create(
    context: TenantContext,
    dto: CreateStaffInvitationDto,
  ): Promise<CreateStaffInvitationResponse> {
    this.assertDevelopmentDelivery();
    const trusted = context;
    const email = dto.email.trim().toLowerCase();
    await this.rateLimits.assertCanCreate(trusted.tenantId, trusted.membershipId, email);
    const origin = this.developmentOrigin();

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + invitationLifetimeMs);
    const previewUrl = `${origin}/invite#${token}`;
    const invitation = await this.invitations.create(trusted, {
      email,
      role: dto.role,
      tokenHash: hashToken(token),
      expiresAt,
      branchIds: dto.branchIds ?? [],
    });
    const delivery = await this.delivery.deliver({
      email,
      role: dto.role,
      previewUrl,
    });

    return {
      invitation: toResponse(invitation),
      previewUrl: delivery.previewUrl,
    };
  }

  async list(context: TenantContext, filters: ListStaffInvitationsDto) {
    const result = await this.invitations.list(context, {
      page: filters.page,
      pageSize: filters.pageSize,
      ...(filters.status ? { status: filters.status } : {}),
    });
    return {
      items: result.items.map(toResponse),
      total: result.total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async cancel(context: TenantContext, invitationId: string) {
    const invitation = await this.invitations.cancel(context, invitationId);
    if (!invitation) throw new NotFoundException('Invitation not found');
    return toResponse(invitation);
  }

  async validatePublic(
    token: string,
    sourceAddress: string,
  ): Promise<StaffInvitationPreviewResponse> {
    this.assertDevelopmentDelivery();
    const tokenHash = hashToken(token);
    await this.rateLimits.assertCanUseToken(sourceAddress, tokenHash);
    const resolved = await this.invitations.resolveToken(tokenHash);
    if (!resolved) throw new NotFoundException('Invitation is invalid or expired');
    const invitation = await this.invitations.preview(tokenHash, resolved.tenantId);
    if (!invitation) throw new NotFoundException('Invitation is invalid or expired');
    return toPreviewResponse(invitation);
  }

  async acceptForExistingUser(
    userId: string,
    token: string,
    sourceAddress: string,
  ): Promise<{ status: 'accepted'; tenantId: string }> {
    this.assertDevelopmentDelivery();
    const tokenHash = hashToken(token);
    await this.rateLimits.assertCanUseToken(sourceAddress, tokenHash);
    const resolved = await this.invitations.resolveToken(tokenHash);
    if (!resolved) throw new NotFoundException('Invitation is invalid or expired');

    const user = await this.authPrisma.user.findUnique({
      where: { id: userId },
      select: { email: true, status: true },
    });
    const invitation = await this.invitations.preview(tokenHash, resolved.tenantId);
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !invitation ||
      normalizeEmail(user.email) !== invitation.email
    ) {
      throw new ForbiddenException('Sign in with the account addressed by this invitation');
    }

    const accepted = await this.invitations.acceptForExistingUser(
      tokenHash,
      resolved.invitationId,
      resolved.tenantId,
      userId,
    );
    if (!accepted) throw new NotFoundException('Invitation is invalid or expired');
    return { status: 'accepted', tenantId: resolved.tenantId };
  }

  async acceptForNewUser(
    dto: AcceptNewStaffInvitationDto,
    sourceAddress: string,
  ): Promise<{ status: 'accepted'; tenantId: string }> {
    this.assertDevelopmentDelivery();
    const tokenHash = hashToken(dto.token);
    await this.rateLimits.assertCanUseToken(sourceAddress, tokenHash);
    const resolved = await this.invitations.resolveToken(tokenHash);
    if (!resolved) throw new NotFoundException('Invitation is invalid or expired');
    const invitation = await this.invitations.preview(tokenHash, resolved.tenantId);
    if (!invitation) throw new NotFoundException('Invitation is invalid or expired');

    const passwordHash = await this.passwords.hashPassword(dto.password);
    const result = await this.invitations.acceptForNewUser(
      tokenHash,
      resolved.invitationId,
      resolved.tenantId,
      dto.name,
      passwordHash,
    );
    if (result === 'existing-user') {
      throw new ConflictException('Sign in with the invited account to accept this invitation');
    }
    if (result !== 'accepted') throw new NotFoundException('Invitation is invalid or expired');
    return { status: 'accepted', tenantId: resolved.tenantId };
  }

  private assertDevelopmentDelivery(): void {
    if (this.config.getOrThrow<string>('NODE_ENV') !== 'development') {
      throw new ServiceUnavailableException(
        'Staff invitations are unavailable until a trusted email delivery provider is configured',
      );
    }
  }

  private developmentOrigin(): string {
    const origins = this.config.getOrThrow<string[]>('CORS_ORIGINS');
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (
          ['http:', 'https:'].includes(parsed.protocol) &&
          parsed.origin === origin.replace(/\/$/, '')
        ) {
          return parsed.origin;
        }
      } catch {
        continue;
      }
    }
    throw new ServiceUnavailableException('No valid frontend origin is configured');
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toResponse(invitation: StaffInvitationRecord) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    branches: invitation.branches.map(({ branch }) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
    })),
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

function toPreviewResponse(
  invitation: StaffInvitationPreviewRecord,
): StaffInvitationPreviewResponse {
  return {
    email: invitation.email,
    role: invitation.role,
    tenantName: invitation.tenant.name,
    branches: invitation.branches.map(({ branch }) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
    })),
    expiresAt: invitation.expiresAt.toISOString(),
  };
}
