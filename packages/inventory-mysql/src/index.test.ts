import { describe, expect, it } from 'vitest';
import type { InventorySchemaMapping, NormalizedVehicle } from './index.js';
import {
  assertSelectOnly,
  assertSelectOnlyGrants,
  InventoryMysqlError,
  quoteSqlIdentifier,
  resolveInventoryDestination,
  sanitizeMysqlError,
  validateInventoryHost,
  validateSqlIdentifier,
} from './index.js';

describe('MySQL inventory contracts', () => {
  it('supports tenant-specific schema mappings', () => {
    const mapping: InventorySchemaMapping = {
      tenantId: 'tenant-a',
      tableName: 'vehicle_stock',
      primaryKeyField: 'stock_no',
      fields: [
        { sourceField: 'stock_no', targetField: 'sourceVehicleId', required: true },
        { sourceField: 'manufacturer', targetField: 'make', required: true },
      ],
    };
    expect(mapping.fields).toHaveLength(2);
  });

  it('does not require invented optional vehicle facts', () => {
    const vehicle: NormalizedVehicle = {
      tenantId: 'tenant-a',
      sourceVehicleId: 'stock-001',
      make: 'Toyota',
      model: 'Corolla',
      sourceUpdatedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    };
    expect(vehicle.variant).toBeUndefined();
  });

  it('allows only reviewed SQL identifiers', () => {
    expect(validateSqlIdentifier('vehicle_stock')).toBe('vehicle_stock');
    expect(quoteSqlIdentifier('vehicle_stock')).toBe('`vehicle_stock`');
    expect(() => validateSqlIdentifier('vehicles; DROP TABLE vehicles')).toThrow(
      InventoryMysqlError,
    );
  });

  it('rejects write and SQL fragment operations', () => {
    expect(() => assertSelectOnly('DELETE FROM vehicles')).toThrow(InventoryMysqlError);
    expect(() => assertSelectOnly('SELECT * FROM vehicles; DROP TABLE vehicles')).toThrow(
      InventoryMysqlError,
    );
  });

  it('allows only approved development fixture destinations', () => {
    expect(() => validateInventoryHost('127.0.0.1', 3307, 'development', true)).not.toThrow();
    for (const [host, port] of [
      ['127.0.0.1', 3306],
      ['127.0.0.1', 3308],
      ['localhost', 3307],
      ['inventory-mysql', 3307],
      ['::1', 3307],
      ['10.0.0.8', 3307],
    ] as const) {
      expect(() => validateInventoryHost(host, port, 'development', true)).toThrow(
        InventoryMysqlError,
      );
    }
    expect(() => validateInventoryHost('127.0.0.1', 3307, 'development')).toThrow(
      InventoryMysqlError,
    );
    expect(() => validateInventoryHost('metadata.google.internal', 3306, 'production')).toThrow(
      InventoryMysqlError,
    );
    expect(() => validateInventoryHost('127.0.0.1', 3306, 'production')).toThrow(
      InventoryMysqlError,
    );
    expect(() => validateInventoryHost('169.254.169.254', 3306, 'production')).toThrow(
      InventoryMysqlError,
    );
  });

  it('pins a production hostname to a vetted public DNS result', async () => {
    const destination = await resolveInventoryDestination(
      'inventory.example.test',
      3306,
      'production',
      async () => [{ address: '93.184.216.34', family: 4 }],
    );
    expect(destination).toEqual({ address: '93.184.216.34', family: 4 });
  });

  it.each([
    ['127.0.0.1', 4],
    ['10.0.0.8', 4],
    ['169.254.169.254', 4],
    ['::1', 6],
    ['fe80::1', 6],
    ['fc00::1', 6],
    ['::ffff:127.0.0.1', 6],
  ] as const)('rejects unsafe production DNS result %s', async (address, family) => {
    await expect(
      resolveInventoryDestination('inventory.example.test', 3306, 'production', async () => [
        { address, family },
      ]),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_DESTINATION' });
  });

  it('rejects a mixed DNS answer if any resolved address is unsafe', async () => {
    await expect(
      resolveInventoryDestination('inventory.example.test', 3306, 'production', async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.8', family: 4 },
      ]),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_DESTINATION' });
  });

  it('pins the development fixture directly to IPv4 loopback and never performs DNS lookup', async () => {
    let lookedUp = false;
    const destination = await resolveInventoryDestination(
      '127.0.0.1',
      3307,
      'development',
      async () => {
        lookedUp = true;
        return [{ address: '10.0.0.8', family: 4 }];
      },
      true,
    );
    expect(destination).toEqual({ address: '127.0.0.1', family: 4 });
    expect(lookedUp).toBe(false);
    await expect(
      resolveInventoryDestination('::1', 3307, 'development', async () => [], true),
    ).rejects.toMatchObject({ code: 'INVALID_DESTINATION' });
  });

  it('accepts database-scoped SELECT grants only', () => {
    expect(() =>
      assertSelectOnlyGrants(
        ['GRANT USAGE ON *.* TO `reader`@`%`', 'GRANT SELECT ON `cars`.* TO `reader`@`%`'],
        'cars',
      ),
    ).not.toThrow();
    expect(() =>
      assertSelectOnlyGrants(['GRANT SELECT ON `cars`.`vehicles` TO `reader`@`%`'], 'cars'),
    ).not.toThrow();
    expect(() =>
      assertSelectOnlyGrants(['GRANT SELECT, UPDATE ON `cars`.* TO `reader`@`%`'], 'cars'),
    ).toThrow(InventoryMysqlError);
    expect(() => assertSelectOnlyGrants(['GRANT SELECT ON *.* TO `reader`@`%`'], 'cars')).toThrow(
      InventoryMysqlError,
    );
  });

  it('sanitizes connect and query timeout errors', () => {
    expect(sanitizeMysqlError({ code: 'ETIMEDOUT' }).code).toBe('CONNECTION_TIMEOUT');
    expect(sanitizeMysqlError({ code: 'PROTOCOL_SEQUENCE_TIMEOUT' }).code).toBe('QUERY_TIMEOUT');
  });

  it('bounds process-wide connector concurrency and drains queued work on close', async () => {
    const options = {
      tenantId: 'tenant-test',
      host: '127.0.0.1',
      port: 3307,
      database: 'carvix_inventory_fixture',
      username: 'fixture-reader',
      password: 'not-a-real-secret',
      tls: false,
      developmentFixture: true,
      nodeEnv: 'test' as const,
    };
    const active = await Promise.all(
      Array.from({ length: 8 }, () =>
        import('./index.js').then(({ InventoryMysqlConnector }) =>
          InventoryMysqlConnector.create(options),
        ),
      ),
    );
    const queuedPromises = Array.from({ length: 16 }, () =>
      import('./index.js').then(({ InventoryMysqlConnector }) =>
        InventoryMysqlConnector.create(options),
      ),
    );
    await expect(
      import('./index.js').then(({ InventoryMysqlConnector }) =>
        InventoryMysqlConnector.create(options),
      ),
    ).rejects.toMatchObject({ code: 'CONNECTION_TIMEOUT' });
    await Promise.all(active.map((connector) => connector.close()));
    const firstQueued = await Promise.all(queuedPromises.slice(0, 8));
    await Promise.all(firstQueued.map((connector) => connector.close()));
    const remainingQueued = await Promise.all(queuedPromises.slice(8));
    await Promise.all(remainingQueued.map((connector) => connector.close()));
  }, 20000);
});
