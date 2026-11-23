import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.provider';

@Injectable()
export class LoginRateLimitService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async check(sourceAddress: string, normalizedEmail: string): Promise<boolean> {
    try {
      const limit = this.config.getOrThrow<number>('LOGIN_LIMIT_PER_MINUTE');
      const safeAddress = sourceAddress || 'unknown';
      const keys = [`login-limit:ip:${safeAddress}`, `login-limit:account:${normalizedEmail}`];
      for (const key of keys) {
        const count = await this.redis.incr(key);
        if (count === 1) await this.redis.expire(key, 60);
        if (count > limit) return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
