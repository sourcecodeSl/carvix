import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes and verifies a correct password', async () => {
    const hash = await service.hashPassword('Correct-Horse-Battery-12');
    await expect(service.verifyPassword(hash, 'Correct-Horse-Battery-12')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hashPassword('Correct-Horse-Battery-12');
    await expect(service.verifyPassword(hash, 'Wrong-password-123')).resolves.toBe(false);
  });

  it('creates unique salted hashes', async () => {
    const first = await service.hashPassword('Correct-Horse-Battery-12');
    const second = await service.hashPassword('Correct-Horse-Battery-12');
    expect(first).not.toBe(second);
  });

  it('fails safely for an invalid hash', async () => {
    await expect(service.verifyPassword('not-an-argon-hash', 'password')).resolves.toBe(false);
  });
});
