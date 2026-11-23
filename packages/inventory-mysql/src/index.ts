export type MySQLConnectionConfiguration = {
  tenantId: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  tls: boolean;
  connectTimeoutMs: number;
};

export type MySQLConnectionTestResult = {
  tenantId: string;
  connected: boolean;
  testedAt: string;
};

export type VehicleFieldMapping = {
  sourceField: string;
  targetField: string;
  required: boolean;
};

export type InventorySchemaMapping = {
  tenantId: string;
  tableName: string;
  primaryKeyField: string;
  fields: readonly VehicleFieldMapping[];
};

export type InventoryValidationError = {
  code: 'MISSING_REQUIRED_FIELD' | 'INVALID_VALUE';
  field: string;
  sourceVehicleId?: string;
};

export type InventorySyncStatus = {
  tenantId: string;
  status: 'never_synced' | 'succeeded' | 'failed';
  lastAttemptAt?: string;
  lastSyncedAt?: string;
};

export type NormalizedVehicle = {
  tenantId: string;
  sourceVehicleId: string;
  stockId?: string;
  make: string;
  model: string;
  variant?: string;
  year?: number;
  registrationYear?: number;
  price?: number;
  currency?: string;
  mileage?: number;
  fuelType?: string;
  transmission?: string;
  bodyType?: string;
  engineCapacity?: number;
  color?: string;
  location?: string;
  branch?: string;
  condition?: string;
  features?: readonly string[];
  description?: string;
  images?: readonly string[];
  serviceHistory?: string;
  warranty?: string;
  financeAvailability?: boolean;
  availabilityStatus?: string;
  sourceUpdatedAt: string;
  lastSyncedAt: string;
};
