import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const integrationEnabled = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!integrationEnabled)('PostgreSQL authentication persistence', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const userId = '75111111-1111-4111-8111-111111111111';
  const tenantId = '75222222-2222-4222-8222-222222222222';
  const membershipId = '75333333-3333-4333-8333-333333333333';
  const sessionId = '75444444-4444-4444-8444-444444444444';

  it('persists credentials and sessions and revokes sessions', async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when RUN_POSTGRES_INTEGRATION=true');
    }

    await pool.query(
      `INSERT INTO tenants (id, name, slug, status, updated_at)
       VALUES ($1, 'Auth Test Tenant', 'auth-test-day3', 'ACTIVE', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, name, status, updated_at)
       VALUES ($1, $2, 'auth-day3@example.test', 'Auth Test', 'ACTIVE', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [userId, tenantId],
    );
    await pool.query(
      `INSERT INTO password_credentials (id, user_id, password_hash, password_changed_at, created_at, updated_at)
       VALUES ('75555555-5555-4555-8555-555555555555', $1, '$argon2id$v=19$test-only-not-used-for-login', NOW(), NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    await pool.query(
      `INSERT INTO tenant_memberships (id, user_id, tenant_id, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'DEALER_ADMIN', 'ACTIVE', NOW(), NOW())
       ON CONFLICT (user_id, tenant_id) DO NOTHING`,
      [membershipId, userId, tenantId],
    );
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, token_hash, active_tenant_id, expires_at, created_at, last_used_at)
       VALUES ($1, $2, 'day3-integration-token-hash', $3, NOW() + INTERVAL '1 hour', NOW(), NOW())
       ON CONFLICT (token_hash) DO NOTHING`,
      [sessionId, userId, tenantId],
    );

    const credential = await pool.query(
      'SELECT password_hash FROM password_credentials WHERE user_id = $1',
      [userId],
    );
    expect(credential.rowCount).toBe(1);
    expect(credential.rows[0].password_hash).not.toBe('plaintext');

    const membership = await pool.query(
      'SELECT role, status FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId],
    );
    expect(membership.rows[0]).toEqual({ role: 'DEALER_ADMIN', status: 'ACTIVE' });

    await pool.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1`, [sessionId]);
    const revoked = await pool.query(
      'SELECT revoked_at IS NOT NULL AS revoked FROM auth_sessions WHERE id = $1',
      [sessionId],
    );
    expect(revoked.rows[0].revoked).toBe(true);

    await pool.query('DELETE FROM auth_sessions WHERE id = $1', [sessionId]);
    await pool.query('DELETE FROM tenant_memberships WHERE id = $1', [membershipId]);
    await pool.query('DELETE FROM password_credentials WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });
});
