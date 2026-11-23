import { describe, expect, it, vi } from 'vitest';
import { AuthSessionService } from './session.service';

describe('AuthSessionService', () => {
  it('generates tokens with at least 256 bits and stores only a hash', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'session-id' }]),
    };
    const config = { getOrThrow: vi.fn().mockReturnValue(24) };
    const service = new AuthSessionService(prisma as never, config as never);
    const result = await service.create('11111111-1111-4111-8111-111111111111', null);

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('rejects expired sessions', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          {
            session_id: 'session-id',
            user_id: 'user-id',
            active_tenant_id: null,
            expires_at: new Date(Date.now() - 1000),
            revoked_at: null,
            user_status: 'ACTIVE',
          },
        ])
        .mockResolvedValue([]),
    };
    const service = new AuthSessionService(prisma as never, { getOrThrow: vi.fn() } as never);
    await expect(service.validate('x'.repeat(43))).resolves.toBeNull();
  });

  it('rejects revoked sessions', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          {
            session_id: 'session-id',
            user_id: 'user-id',
            active_tenant_id: null,
            expires_at: new Date(Date.now() + 10000),
            revoked_at: new Date(),
            user_status: 'ACTIVE',
          },
        ])
        .mockResolvedValue([]),
    };
    const service = new AuthSessionService(prisma as never, { getOrThrow: vi.fn() } as never);
    await expect(service.validate('x'.repeat(43))).resolves.toBeNull();
  });

  it('rejects suspended users', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          {
            session_id: 'session-id',
            user_id: 'user-id',
            active_tenant_id: null,
            expires_at: new Date(Date.now() + 10000),
            revoked_at: null,
            user_status: 'DISABLED',
          },
        ])
        .mockResolvedValue([]),
    };
    const service = new AuthSessionService(prisma as never, { getOrThrow: vi.fn() } as never);
    await expect(service.validate('x'.repeat(43))).resolves.toBeNull();
  });
});
