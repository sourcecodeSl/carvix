import { describe, expect, it } from 'vitest';
import { InventoryMysqlConnector } from './index.js';

const enabled = process.env.RUN_MYSQL_INTEGRATION === 'true';

describe.skipIf(!enabled)('MySQL inventory fixture integration', () => {
  it('connects only with a database-scoped SELECT-only account', async () => {
    const connector = await InventoryMysqlConnector.create({
      host: process.env.INVENTORY_MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.INVENTORY_MYSQL_PORT ?? 3307),
      database: process.env.INVENTORY_MYSQL_DATABASE ?? 'carvix_inventory_fixture',
      username: process.env.INVENTORY_MYSQL_USER ?? 'carvix_inventory_reader',
      password: process.env.INVENTORY_MYSQL_PASSWORD ?? '',
      tls: false,
      connectTimeoutMs: 2000,
      queryTimeoutMs: 2000,
      developmentFixture: true,
      nodeEnv: 'test',
    });
    try {
      await expect(connector.test()).resolves.toMatchObject({ connected: true, dialect: 'mysql' });
      const rows = await connector.query(
        'SELECT id, price_lkr FROM vehicles ORDER BY id LIMIT ?',
        [6],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.some((row) => row.price_lkr === null)).toBe(true);
      await expect(
        connector.query('UPDATE vehicles SET make = ? WHERE id = ?', ['fake', 'SYN-TOY-001']),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    } finally {
      await connector.close();
    }
  });

  it('enforces a short timeout on a bounded read from the synthetic fixture', async () => {
    const connector = await InventoryMysqlConnector.create({
      host: process.env.INVENTORY_MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.INVENTORY_MYSQL_PORT ?? 3307),
      database: process.env.INVENTORY_MYSQL_DATABASE ?? 'carvix_inventory_fixture',
      username: process.env.INVENTORY_MYSQL_USER ?? 'carvix_inventory_reader',
      password: process.env.INVENTORY_MYSQL_PASSWORD ?? '',
      tls: false,
      connectTimeoutMs: 2000,
      queryTimeoutMs: 500,
      developmentFixture: true,
      nodeEnv: 'test',
    });
    try {
      await expect(connector.query('SELECT SLEEP(2) AS waited')).rejects.toMatchObject({
        code: 'QUERY_TIMEOUT',
      });
    } finally {
      await connector.close();
    }
  });
});
