import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_AUTH_URL: z.url(),
  DATABASE_APP_URL: z.url(),
  REDIS_URL: z.url(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  LOGIN_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(5),
  INVENTORY_CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'A 32-byte inventory credential encryption key is required')
    .optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
  }
  if (result.data.NODE_ENV === 'production') {
    if (
      !result.data.INVENTORY_CREDENTIAL_ENCRYPTION_KEY ||
      !/^[a-fA-F0-9]{64}$/.test(result.data.INVENTORY_CREDENTIAL_ENCRYPTION_KEY)
    ) {
      throw new Error(
        'Invalid environment configuration: A 32-byte inventory credential encryption key is required in production',
      );
    }
    const prohibitedUrls = [result.data.DATABASE_AUTH_URL, result.data.DATABASE_APP_URL];
    if (
      prohibitedUrls.some(
        (url) =>
          url.includes('aicrm_dev_password') ||
          url.includes('aicrm_auth_dev_password') ||
          url.includes('aicrm_app_dev_password'),
      )
    ) {
      throw new Error(
        'Invalid environment configuration: Development database credentials are prohibited in production',
      );
    }
  }
  return result.data;
}
