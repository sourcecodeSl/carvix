import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.provider';

@Injectable()
export class StaffInvitationRateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async assertCanCreate(
    tenantId: string,
    membershipId: string,
    normalizedEmail: string,
  ): Promise<void> {
    const issuerKey = `staff-invite:issuer:${tenantId}:${membershipId}`;
    const recipientKey = `staff-invite:recipient:${hash(normalizedEmail)}`;
    const [issuerAllowed, recipientAllowed] = await Promise.all([
      this.incrementWithin(issuerKey, 10, 3600),
      this.incrementWithin(recipientKey, 5, 3600),
    ]);
    if (!issuerAllowed || !recipientAllowed) {
      throw new HttpException(
        'Invitation limit reached; try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async assertCanUseToken(sourceAddress: string, tokenHash: string): Promise<void> {
    const addressKey = `staff-invite:accept-ip:${hash(sourceAddress)}`;
    const tokenKey = `staff-invite:accept-token:${tokenHash}`;
    const [addressAllowed, tokenAllowed] = await Promise.all([
      this.incrementWithin(addressKey, 30, 60),
      this.incrementWithin(tokenKey, 10, 3600),
    ]);
    if (!addressAllowed || !tokenAllowed) {
      throw new HttpException(
        'Invitation request limit reached; try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async incrementWithin(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    try {
      const count = await this.redis.incr(key);
      if (count === 1 && (await this.redis.expire(key, windowSeconds)) !== 1) {
        throw new Error('Could not set invitation rate-limit expiry');
      }
      return count <= limit;
    } catch {
      throw new ServiceUnavailableException('Invitation service is temporarily unavailable');
    }
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
