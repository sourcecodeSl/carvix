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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
  ],
  controllers: [HealthController, AuthController, DealershipController, BranchController],
  providers: [
    PrismaService,
    AuthPrismaService,
    ReadinessService,
    redisProvider,
    BranchRepository,
    BranchService,
    DealershipRepository,
    DealershipService,
    TenantMembershipRepository,
    PasswordService,
    AuthSessionService,
    AuthGuard,
    PermissionsGuard,
    CsrfGuard,
    LoginRateLimitService,
  ],
})
export class AppModule {}
