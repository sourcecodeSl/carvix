import { PrismaClient, PrismaPg } from '@aicrm/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.RUN_POSTGRES_INTEGRATION === 'true';
const databaseUrl = process.env.DATABASE_MIGRATION_URL;
const authUrl = process.env.DATABASE_AUTH_URL;
const appUrl = process.env.DATABASE_APP_URL;

describe.skipIf(!enabled)('audit logging PostgreSQL integration', () => {
  const tenantA = '56111111-1111-4111-8111-111111111111';
  const tenantB = '56222222-2222-4222-8222-222222222222';
  const eventA = '56333333-3333-4333-8333-333333333333';
  const eventB = '56444444-4444-4444-8444-444444444444';
  let owner: PrismaClient | undefined;
  let auth: PrismaClient | undefined;
  let app: PrismaClient | undefined;

  beforeAll(async () => {
    if (!databaseUrl || !authUrl || !appUrl) {
      throw new Error(
        'DATABASE_MIGRATION_URL, DATABASE_AUTH_URL, and DATABASE_APP_URL are required',
      );
    }
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    auth = new PrismaClient({ adapter: new PrismaPg({ connectionString: authUrl }) });
    app = new PrismaClient({ adapter: new PrismaPg({ connectionString: appUrl }) });

    await owner.$executeRaw`
      INSERT INTO tenants (id,name,slug,status,updated_at)
      VALUES
        (${tenantA}::uuid,'Audit Tenant A','audit-integration-a','ACTIVE',NOW()),
        (${tenantB}::uuid,'Audit Tenant B','audit-integration-b','ACTIVE',NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await owner.$executeRaw`
      INSERT INTO audit_events
        (id,tenant_id,event_type,category,action,resource_type,outcome,metadata,occurred_at)
      VALUES
        (${eventA}::uuid,${tenantA}::uuid,'security.fixture','SECURITY','create','fixture','SUCCESS','{}',NOW()),
        (${eventB}::uuid,${tenantB}::uuid,'security.fixture','SECURITY','create','fixture','SUCCESS','{}',NOW())
      ON CONFLICT (id) DO NOTHING
    `;
  });

  afterAll(async () => {
    if (owner) {
      await owner.$executeRaw`
        DELETE FROM audit_events WHERE id IN (${eventA}::uuid,${eventB}::uuid)
      `;
      await owner.$executeRaw`
        DELETE FROM tenants WHERE id IN (${tenantA}::uuid,${tenantB}::uuid)
      `;
    }
    await Promise.all([owner?.$disconnect(), auth?.$disconnect(), app?.$disconnect()]);
  });

  it('isolates tenant audit reads', async () => {
    await app!.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "aicrm_app"`;
      await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
      const visible = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM audit_events WHERE tenant_id = ${tenantA}::uuid
      `;
      expect(visible.map((row) => row.id)).toContain(eventA);

      const crossTenant = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM audit_events WHERE tenant_id = ${tenantB}::uuid
      `;
      expect(crossTenant).toHaveLength(0);
    });
  });

  it('fails closed with missing tenant context', async () => {
    await app!.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "aicrm_app"`;
      await transaction.$executeRaw`SELECT set_config('app.tenant_id', '', true)`;
      const visible = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM audit_events
      `;
      expect(visible).toHaveLength(0);
    });
  });

  it('denies audit update, delete, and truncate operations', async () => {
    await expect(
      app!.$transaction(async (transaction) => {
        await transaction.$executeRaw`SET LOCAL ROLE "aicrm_app"`;
        await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
        await transaction.$executeRaw`
          UPDATE audit_events SET action = 'forged' WHERE id = ${eventA}::uuid
        `;
      }),
    ).rejects.toBeDefined();

    await expect(
      app!.$transaction(async (transaction) => {
        await transaction.$executeRaw`SET LOCAL ROLE "aicrm_app"`;
        await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
        await transaction.$executeRaw`
          DELETE FROM audit_events WHERE id = ${eventA}::uuid
        `;
      }),
    ).rejects.toBeDefined();

    await expect(app!.$executeRaw`TRUNCATE TABLE audit_events`).rejects.toBeDefined();
  });

  it('rejects authentication helper calls with an invalid session', async () => {
    await expect(
      auth!.$queryRaw`
        SELECT public.audit_record_auth_event(
          repeat('0',64),'auth.login.success',NULL,'login','session',
          NULL,'SUCCESS',NULL,NULL,NULL
        )
      `,
    ).rejects.toBeDefined();
  });
});
