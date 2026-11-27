import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_BIND_HOST: z.enum(['127.0.0.1', '::1']).optional(),
  INVENTORY_ENZONIC_SYNTHETIC_TEST: z.enum(['true', 'false']).default('false'),
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
  const {
    INVENTORY_ENZONIC_SYNTHETIC_TEST,
    NODE_ENV,
    API_PORT,
    API_BIND_HOST,
    CORS_ORIGINS,
    DATABASE_APP_URL,
    DATABASE_AUTH_URL,
  } = result.data;
  if (
    INVENTORY_ENZONIC_SYNTHETIC_TEST === 'true' &&
    (NODE_ENV !== 'production' ||
      API_PORT !== 3002 ||
      API_BIND_HOST !== '127.0.0.1' ||
      CORS_ORIGINS.length !== 1 ||
      CORS_ORIGINS[0] !== 'http://127.0.0.1:3003' ||
      [DATABASE_APP_URL, DATABASE_AUTH_URL].some((value) => {
        const url = new URL(value);
        return (
          !['localhost', '127.0.0.1'].includes(url.hostname) ||
          url.port !== '55433' ||
          url.pathname !== '/aicrm_day3_clean'
        );
      }))
  ) {
    throw new Error(
      'Enzonic synthetic inventory compatibility requires the isolated local test API.',
    );
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
