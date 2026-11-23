import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg, PrismaClient } from '@aicrm/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_APP_URL');
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    // Dependencies are checked by the readiness endpoint, not startup.
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
