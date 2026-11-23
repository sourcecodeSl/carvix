import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const authUrl = process.env.DATABASE_AUTH_URL;
const appUrl = process.env.DATABASE_APP_URL;
const enabled = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!enabled)('PostgreSQL runtime role separation', () => {
  it('proves auth role isolation and app role RLS fail-closed behavior', async () => {
    if (!databaseUrl || !authUrl || !appUrl) {
      throw new Error('DATABASE_URL, DATABASE_AUTH_URL, and DATABASE_APP_URL are required');
    }

    const owner = new Pool({ connectionString: databaseUrl });
    const auth = new Pool({ connectionString: authUrl });
    const app = new Pool({ connectionString: appUrl });

    try {
      await auth.query('SELECT id FROM users');
      await auth.query('SELECT id FROM password_credentials');
      await expect(
        auth.query('SELECT token_hash FROM auth_sessions LIMIT 1'),
      ).rejects.toMatchObject({ code: '42501' });

      await expect(auth.query('SELECT id FROM branches')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        auth.query('CREATE TABLE forbidden_auth_role_test(id int)'),
      ).rejects.toMatchObject({ code: '42501' });

      const appClient = await app.connect();
      try {
        await appClient.query('BEGIN');
        await appClient.query('SET LOCAL ROLE aicrm_app');
        await appClient.query(`SELECT set_config('app.tenant_id', '', true)`);
        const result = await appClient.query('SELECT id FROM branches');
        expect(result.rowCount).toBe(0);
        await appClient.query('ROLLBACK');
      } finally {
        appClient.release();
      }

      await expect(app.query('CREATE TABLE forbidden_app_role_test(id int)')).rejects.toMatchObject(
        { code: '42501' },
      );

      const ownerCheck = await owner.query(
        `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
         FROM pg_roles
         WHERE rolname IN ('aicrm_auth_runtime','aicrm_app_runtime')`,
      );
      expect(ownerCheck.rowCount).toBe(2);
      for (const role of ownerCheck.rows) {
        expect(role.rolsuper).toBe(false);
        expect(role.rolbypassrls).toBe(false);
        expect(role.rolcanlogin).toBe(true);
      }
    } finally {
      await owner.end();
      await auth.end();
      await app.end();
    }
  });
});
