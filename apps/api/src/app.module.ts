import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env.validation';
import { PrismaService } from './database/prisma.service';
import { HealthController } from './health/health.controller';
import { ReadinessService } from './health/readiness.service';
import { redisProvider } from './redis/redis.provider';
import { BranchRepository } from './modules/branches/branch.repository';
import { TenantMembershipRepository } from './modules/memberships/tenant-membership.repository';
import { PasswordService } from './auth/password.service';
import { AuthSessionService } from './auth/session.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { CsrfGuard } from './auth/csrf.guard';
import { LoginRateLimitService } from './auth/login-rate-limit.service';
import { AuthPrismaService } from './database/auth-prisma.service';
import { DealershipController } from './modules/dealerships/dealership.controller';
import { DealershipService } from './modules/dealerships/dealership.service';
import { DealershipRepository } from './modules/dealerships/dealership.repository';
import { BranchController } from './modules/branches/branch.controller';
import { BranchService } from './modules/branches/branch.service';
import { StaffController } from './modules/staff/staff.controller';
import {
  PublicInvitationController,
  StaffInvitationController,
} from './modules/staff/staff-invitation.controller';
import { StaffRepository } from './modules/staff/staff.repository';
import { StaffService } from './modules/staff/staff.service';
import { StaffInvitationRepository } from './modules/staff/staff-invitation.repository';
import { StaffInvitationService } from './modules/staff/staff-invitation.service';
import { StaffInvitationRateLimitService } from './modules/staff/staff-invitation-rate-limit.service';
import {
  DevelopmentPreviewInvitationDelivery,
  STAFF_INVITATION_DELIVERY,
} from './modules/staff/staff-invitation-delivery';
import { AuditController } from './modules/audit/audit.controller';
import { AuditRepository } from './modules/audit/audit.repository';
import { AuditService } from './modules/audit/audit.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    DealershipController,
    BranchController,
    StaffController,
    StaffInvitationController,
    PublicInvitationController,
    AuditController,
  ],
  providers: [
    PrismaService,
    AuthPrismaService,
    ReadinessService,
    redisProvider,
    BranchRepository,
    BranchService,
    StaffRepository,
    StaffService,
    StaffInvitationRepository,
    StaffInvitationService,
    StaffInvitationRateLimitService,
    {
      provide: STAFF_INVITATION_DELIVERY,
      useClass: DevelopmentPreviewInvitationDelivery,
    },
    DealershipRepository,
    DealershipService,
    TenantMembershipRepository,
    PasswordService,
    AuthSessionService,
    AuthGuard,
    PermissionsGuard,
    CsrfGuard,
    LoginRateLimitService,
    AuditRepository,
    AuditService,
  ],
})
export class AppModule {}
