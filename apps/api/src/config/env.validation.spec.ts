import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './env.validation';

describe('environment validation', () => {
  it('accepts valid development configuration', () => {
    const result = validateEnvironment({
      NODE_ENV: 'development',
      API_PORT: '3001',
      DATABASE_URL: 'postgresql://aicrm:password@localhost:5432/aicrm',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGINS: 'http://localhost:3000',
    });
    expect(result.API_PORT).toBe(3001);
  });

  it('rejects an invalid Redis URL', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://aicrm:password@localhost:5432/aicrm',
        REDIS_URL: 'not-a-url',
      }),
    ).toThrow(/Invalid environment configuration/);
  });
});
