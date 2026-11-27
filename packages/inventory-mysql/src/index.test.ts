import { describe, expect, it } from 'vitest';
import type { InventorySchemaMapping, NormalizedVehicle } from './index.js';
import {
  assertSelectOnly,
  assertSelectOnlyGrants,
  isEnzonicSyntheticEndpoint,
  InventoryMysqlError,
  quoteSqlIdentifier,
  resolveInventoryDestination,
  resolveInventoryTlsServername,
  sanitizeMysqlError,
  validateInventoryHost,
  validateSqlIdentifier,
} from './index.js';

describe('MySQL inventory contracts', () => {
  it('accepts only the expected Enzonic synthetic grants when explicitly enabled', () => {
    const allow = 'GRANT SELECT, SHOW VIEW ON `main`.* TO `carvix_inventory_reader`@`%`';
    const usage = 'GRANT USAGE ON *.* TO `carvix_inventory_reader`@`%`';
    expect(() => assertSelectOnlyGrants([usage, allow], 'main')).toThrow(InventoryMysqlError);
    expect(() => assertSelectOnlyGrants([usage, allow], 'main', false, true)).not.toThrow();
    for (const unexpected of [
      allow.replace('carvix_inventory_reader', 'other_reader'),
      allow.replace('`main`.*', '*.*'),
      allow.replace('`main`', '`other`'),
      allow + ' WITH GRANT OPTION',
      'GRANT `role`@`%` TO `carvix_inventory_reader`@`%`',
      ...['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'FILE'].map((privilege) =>
        allow.replace('SHOW VIEW', privilege),
      ),
    ]) {
      expect(() => assertSelectOnlyGrants([usage, allow, unexpected], 'main', false, true)).toThrow(
        InventoryMysqlError,
      );
    }
  });

  it('requires the exact public TLS endpoint and reader for Enzonic compatibility', () => {
    const endpoint = {
      host: 'carvix-cloud-test-fwax1p.db.enzonic.com',
      port: 3306,
      database: 'main',
      username: 'carvix_inventory_reader',
      tls: true,
      nodeEnv: 'production' as const,
    };
    expect(isEnzonicSyntheticEndpoint(endpoint)).toBe(true);
    for (const change of [
      { username: 'other_reader' },
      { tls: false },
      { database: 'other' },
      { port: 3307 },
      { host: 'mysql.example.com' },
      { nodeEnv: 'development' as const },
    ]) {
      expect(isEnzonicSyntheticEndpoint({ ...endpoint, ...change })).toBe(false);
    }
  });
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
    expect(() => validateInventoryHost('93.184.216.34', 3306, 'production')).not.toThrow();
  });

  it('accepts a globally routable IPv6 destination and pins its address family', async () => {
    const destination = await resolveInventoryDestination(
      'mysql.example.com',
      3306,
      'production',
      async () => [{ address: '2606:4700:4700::1111', family: 6 }],
    );
    expect(destination).toEqual({ address: '2606:4700:4700::1111', family: 6 });
    expect(() => validateInventoryHost('2606:4700:4700::1111', 3306, 'production')).not.toThrow();
  });

  it('requires a DNS certificate identity for TLS to public IP destinations', () => {
    expect(resolveInventoryTlsServername('mysql.example.com')).toBe('mysql.example.com');
    expect(resolveInventoryTlsServername('93.184.216.34', 'mysql.example.com')).toBe(
      'mysql.example.com',
    );
    expect(() => resolveInventoryTlsServername('93.184.216.34')).toThrow(InventoryMysqlError);
    expect(() => resolveInventoryTlsServername('mysql.example.com', '127.0.0.1')).toThrow(
      InventoryMysqlError,
    );
    expect(() => resolveInventoryTlsServername('mysql.example.com', 'bad/name')).toThrow(
      InventoryMysqlError,
    );
    expect(() => resolveInventoryTlsServername('mysql.example.com', 'other.example.com')).toThrow(
      InventoryMysqlError,
    );
  });

  it('rejects DNS failures without returning resolver details and bounds stalled lookups', async () => {
    await expect(
      resolveInventoryDestination('mysql.example.com', 3306, 'production', async () => {
        throw new Error('raw resolver details');
      }),
    ).rejects.toMatchObject({ message: 'The inventory host could not be resolved.' });
    await expect(
      resolveInventoryDestination(
        'mysql.example.com',
        3306,
        'production',
        () => new Promise(() => {}),
        false,
        10,
      ),
    ).rejects.toMatchObject({ code: 'CONNECTION_TIMEOUT' });
  });

  it.each([
    ['127.0.0.1', 4],
    ['10.0.0.8', 4],
    ['169.254.169.254', 4],
    ['168.63.129.16', 4],
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

  it('rejects a DNS answer whose declared address family does not match its address', async () => {
    await expect(
      resolveInventoryDestination('inventory.example.test', 3306, 'production', async () => [
        { address: '93.184.216.34', family: 6 },
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

  it('rejects delegated, role, and wildcard schema grants in production', () => {
    for (const grant of [
      'GRANT SELECT ON `dealer_stock`.* TO `reader`@`%`',
      'GRANT SELECT ON `DEALER_STOCK`.`vehicles` TO `reader`@`%`',
      'GRANT SELECT ON `dealer_stock`.`vehicles` TO `reader`@`%` WITH GRANT OPTION',
      'GRANT `editor`@`%` TO `reader`@`%`',
    ]) {
      expect(() => assertSelectOnlyGrants([grant], 'dealer_stock')).toThrow(InventoryMysqlError);
    }
    expect(() =>
      assertSelectOnlyGrants(
        ['GRANT SELECT ON `dealer\\_stock`.* TO `reader`@`%`'],
        'dealer_stock',
      ),
    ).not.toThrow();
    expect(() =>
      assertSelectOnlyGrants(
        ['GRANT SELECT ON `dealer_stock`.`vehicles` TO `reader`@`%`'],
        'dealer_stock',
      ),
    ).not.toThrow();
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
