import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './env.validation';

describe('environment validation', () => {
  it('accepts valid development configuration', () => {
    const result = validateEnvironment({
      NODE_ENV: 'development',
      API_PORT: '3001',
      DATABASE_AUTH_URL: 'postgresql://aicrm_auth_runtime:password@localhost:55432/aicrm',
      DATABASE_APP_URL: 'postgresql://aicrm_app_runtime:password@localhost:55432/aicrm',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGINS: 'http://localhost:3000',
    });
    expect(result.API_PORT).toBe(3001);
  });

  it('rejects an invalid Redis URL', () => {
    expect(() =>
      validateEnvironment({
        REDIS_URL: 'not-a-url',
      }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('rejects development database credentials in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_AUTH_URL: 'postgresql://aicrm_auth_runtime:aicrm_auth_dev_password@db/aicrm',
        DATABASE_APP_URL: 'postgresql://aicrm_app_runtime:aicrm_app_dev_password@db/aicrm',
        REDIS_URL: 'redis://redis:6379',
        INVENTORY_CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
      }),
    ).toThrow(/Development database credentials are prohibited/);
  });
});
