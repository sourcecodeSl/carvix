import { describe, expect, it } from 'vitest';
import type { InventorySchemaMapping, NormalizedVehicle } from './index.js';

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
});
