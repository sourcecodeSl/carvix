import { describe, expect, it, vi } from 'vitest';
import { ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  it('returns ready when PostgreSQL and Redis are available', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const redis = { status: 'ready', ping: vi.fn().mockResolvedValue('PONG') };
    const service = new ReadinessService(prisma as never, redis as never);

    await expect(service.check()).resolves.toEqual({
      status: 'ready',
      dependencies: { postgres: 'available', redis: 'available' },
    });
  });

  it('returns not_ready when a dependency is unavailable', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('offline')) };
    const redis = { status: 'ready', ping: vi.fn().mockRejectedValue(new Error('offline')) };
    const service = new ReadinessService(prisma as never, redis as never);

    await expect(service.check()).resolves.toEqual({
      status: 'not_ready',
      dependencies: { postgres: 'unavailable', redis: 'unavailable' },
    });
  });
});
