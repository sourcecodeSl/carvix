import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

type BranchRow = { id: string };

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://aicrm:aicrm_dev_password@localhost:55432/aicrm';
const integrationEnabled = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!integrationEnabled)('PostgreSQL tenant RLS', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const tenantA = '71111111-1111-4111-8111-111111111111';
  const tenantB = '72222222-2222-4222-8222-222222222222';
  const dealershipA = '73111111-1111-4111-8111-111111111111';
  const dealershipB = '73222222-2222-4222-8222-222222222222';
  const branchA = '74111111-1111-4111-8111-111111111111';
  const branchB = '74222222-2222-4222-8222-222222222222';

  it('blocks missing context and enforces cross-tenant reads, updates, and deletes', async () => {
    await pool.query(
      `
      INSERT INTO tenants (id, name, slug, status, updated_at)
      VALUES
        ($1, 'RLS Tenant A', 'rls-tenant-a', 'ACTIVE', NOW()),
        ($2, 'RLS Tenant B', 'rls-tenant-b', 'ACTIVE', NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [tenantA, tenantB],
    );
    await pool.query(
      `
      INSERT INTO dealerships (id, tenant_id, business_name, contact_email, country, timezone, currency, updated_at)
      VALUES
        ($1, $3, 'RLS Dealer A', 'a@example.test', 'Sri Lanka', 'Asia/Colombo', 'LKR', NOW()),
        ($2, $4, 'RLS Dealer B', 'b@example.test', 'Sri Lanka', 'Asia/Colombo', 'LKR', NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [dealershipA, dealershipB, tenantA, tenantB],
    );
    await pool.query(
      `
      INSERT INTO branches (id, tenant_id, dealership_id, name, code, status, updated_at)
      VALUES
        ($1, $3, $5, 'RLS Branch A', 'A1', 'ACTIVE', NOW()),
        ($2, $4, $6, 'RLS Branch B', 'B1', 'ACTIVE', NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [branchA, branchB, tenantA, tenantB, dealershipA, dealershipB],
    );

    const missingContext = await pool.connect();
    try {
      await missingContext.query('BEGIN');
      await missingContext.query('SET LOCAL ROLE "aicrm_app"');
      await missingContext.query(`SELECT set_config('app.tenant_id', '', true)`);
      const result = await missingContext.query('SELECT id FROM branches');
      expect(result.rowCount).toBe(0);
      await missingContext.query('ROLLBACK');
    } finally {
      missingContext.release();
    }

    const tenantAClient = await pool.connect();
    try {
      await tenantAClient.query('BEGIN');
      await tenantAClient.query('SET LOCAL ROLE "aicrm_app"');
      await tenantAClient.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
      const visible = await tenantAClient.query('SELECT id FROM branches WHERE tenant_id = $1', [
        tenantA,
      ]);
      expect(visible.rows.map((row: BranchRow) => row.id)).toContain(branchA);
      expect(visible.rows.map((row: BranchRow) => row.id)).not.toContain(branchB);

      const crossUpdate = await tenantAClient.query('UPDATE branches SET name = $1 WHERE id = $2', [
        'Unauthorized',
        branchB,
      ]);
      expect(crossUpdate.rowCount).toBe(0);
      const crossDelete = await tenantAClient.query('DELETE FROM branches WHERE id = $1', [
        branchB,
      ]);
      expect(crossDelete.rowCount).toBe(0);
      await tenantAClient.query('ROLLBACK');
    } finally {
      tenantAClient.release();
    }

    await pool.query('DELETE FROM branches WHERE id = ANY($1::uuid[])', [[branchA, branchB]]);
    await pool.query('DELETE FROM dealerships WHERE id = ANY($1::uuid[])', [
      [dealershipA, dealershipB],
    ]);
    await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [[tenantA, tenantB]]);
  });

  it('does not leak tenant context across reused connections', async () => {
    const scoped = await pool.connect();
    try {
      await scoped.query('BEGIN');
      await scoped.query('SET LOCAL ROLE "aicrm_app"');
      await scoped.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
      await scoped.query('COMMIT');
    } finally {
      scoped.release();
    }

    const reused = await pool.connect();
    try {
      await reused.query('BEGIN');
      await reused.query('SET LOCAL ROLE "aicrm_app"');
      await reused.query(`SELECT set_config('app.tenant_id', '', true)`);
      const result = await reused.query('SELECT id FROM branches');
      expect(result.rowCount).toBe(0);
      await reused.query('ROLLBACK');
    } finally {
      reused.release();
    }
  });
});
