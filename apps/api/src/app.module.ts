import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env.validation';
import { PrismaService } from './database/prisma.service';
import { HealthController } from './health/health.controller';
import { ReadinessService } from './health/readiness.service';
import { redisProvider } from './redis/redis.provider';
import { BranchRepository } from './modules/branches/branch.repository';
import { TenantMembershipRepository } from './modules/memberships/tenant-membership.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    ReadinessService,
    redisProvider,
    BranchRepository,
    TenantMembershipRepository,
  ],
})
export class AppModule {}
