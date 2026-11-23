import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../database/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.provider';

export type ReadinessResult = {
  status: 'ready' | 'not_ready';
  dependencies: {
    postgres: 'available' | 'unavailable';
    redis: 'available' | 'unavailable';
  };
};

@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(): Promise<ReadinessResult> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);

    return {
      status: postgres && redis ? 'ready' : 'not_ready',
      dependencies: {
        postgres: postgres ? 'available' : 'unavailable',
        redis: redis ? 'available' : 'unavailable',
      },
    };
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
