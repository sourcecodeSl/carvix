import mysql, { type Pool, type PoolOptions, type RowDataPacket } from 'mysql2/promise';
import { lookup as dnsLookup } from 'node:dns/promises';
import { connect as netConnect, isIP } from 'node:net';

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

export type InventoryMysqlVehicle = Record<string, unknown>;

export type InventoryMysqlQueryOptions = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  tls?: boolean;
  connectTimeoutMs?: number;
  queryTimeoutMs?: number;
  developmentFixture?: boolean;
  nodeEnv: 'development' | 'test' | 'production';
};

export type ResolvedInventoryAddress = { address: string; family: 4 | 6 };
export type InventoryAddressLookup = (host: string) => Promise<ResolvedInventoryAddress[]>;

export type InventoryMysqlTestResult = {
  connected: boolean;
  dialect: 'mysql';
  testedAt: string;
};

export class InventoryMysqlError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_DESTINATION'
      | 'FORBIDDEN_DESTINATION'
      | 'CONNECTION_FAILED'
      | 'CONNECTION_TIMEOUT'
      | 'QUERY_TIMEOUT'
      | 'INVALID_IDENTIFIER'
      | 'UNSUPPORTED_OPERATION',
    message: string,
  ) {
    super(message);
    this.name = 'InventoryMysqlError';
  }
}

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const forbiddenOperations =
  /;|--|#|\/\*|\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke)\b|\binto\s+(outfile|dumpfile)\b|\bload_file\s*\(/i;

export function validateSqlIdentifier(value: string): string {
  if (!identifierPattern.test(value)) {
    throw new InventoryMysqlError(
      'INVALID_IDENTIFIER',
      'The database identifier contains unsupported characters.',
    );
  }
  return value;
}

export function quoteSqlIdentifier(value: string): string {
  return `\`${validateSqlIdentifier(value).replaceAll('`', '``')}\``;
}

export function assertSelectOnly(sql: string): void {
  if (!/^\s*select\b/i.test(sql) || forbiddenOperations.test(sql)) {
    throw new InventoryMysqlError(
      'UNSUPPORTED_OPERATION',
      'Only bounded SELECT queries are allowed.',
    );
  }
}

export function validateInventoryHost(
  host: string,
  port: number,
  nodeEnv: 'development' | 'test' | 'production',
  developmentFixture = false,
): void {
  if (!host || host !== host.trim() || /[\s/:?#@]/.test(host) || host.length > 253) {
    throw new InventoryMysqlError('INVALID_DESTINATION', 'Inventory host is invalid.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InventoryMysqlError('INVALID_DESTINATION', 'Inventory port is invalid.');
  }

  if (nodeEnv === 'production') {
    const normalized = host.trim().toLowerCase();
    const addressFamily = isIP(normalized);
    if (
      normalized.endsWith('.') ||
      normalized === 'localhost' ||
      normalized.endsWith('.localhost') ||
      normalized.endsWith('.local') ||
      normalized === 'metadata.google.internal' ||
      (addressFamily !== 0 && !isPublicAddress(normalized))
    ) {
      throw new InventoryMysqlError(
        'FORBIDDEN_DESTINATION',
        'The inventory destination is not permitted.',
      );
    }
  } else if (!developmentFixture || host !== '127.0.0.1' || port !== 3307) {
    throw new InventoryMysqlError(
      'FORBIDDEN_DESTINATION',
      'Development inventory connections require an approved local fixture destination.',
    );
  }
}

/** Resolve once, reject every unsafe DNS answer, then pin the socket to a vetted IP. */
export async function resolveInventoryDestination(
  host: string,
  port: number,
  nodeEnv: 'development' | 'test' | 'production',
  lookup: InventoryAddressLookup = async (hostname) =>
    (await dnsLookup(hostname, { all: true, verbatim: true })).map(({ address, family }) => ({
      address,
      family: family as 4 | 6,
    })),
  developmentFixture = false,
): Promise<ResolvedInventoryAddress> {
  validateInventoryHost(host, port, nodeEnv, developmentFixture);
  const family = isIP(host);
  const answers = family ? [{ address: host, family: family as 4 | 6 }] : await lookup(host);
  if (!answers.length) {
    throw new InventoryMysqlError('INVALID_DESTINATION', 'The inventory host did not resolve.');
  }

  const normalizedHost = host.toLowerCase();
  for (const answer of answers) {
    const permitted =
      nodeEnv === 'production'
        ? isPublicAddress(answer.address)
        : developmentFixture &&
          normalizedHost === '127.0.0.1' &&
          port === 3307 &&
          answer.address === '127.0.0.1' &&
          answer.family === 4;
    if (!permitted) {
      throw new InventoryMysqlError(
        'FORBIDDEN_DESTINATION',
        'The inventory destination resolved to a network that is not permitted.',
      );
    }
  }
  return answers[0]!;
}

const MAX_ACTIVE_CONNECTORS = 8;
const MAX_QUEUED_CONNECTORS = 16;
let activeConnectors = 0;
const connectorWaiters: Array<(release: () => void) => void> = [];

function createSlotRelease(): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = connectorWaiters.shift();
    if (next) next(createSlotRelease());
    else activeConnectors--;
  };
}

async function acquireConnectorSlot(): Promise<() => void> {
  if (
    activeConnectors >= MAX_ACTIVE_CONNECTORS &&
    connectorWaiters.length >= MAX_QUEUED_CONNECTORS
  ) {
    throw new InventoryMysqlError('CONNECTION_TIMEOUT', 'Inventory connection capacity is busy.');
  }
  if (activeConnectors >= MAX_ACTIVE_CONNECTORS) {
    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = connectorWaiters.indexOf(grant);
        if (index >= 0) connectorWaiters.splice(index, 1);
        reject(
          new InventoryMysqlError('CONNECTION_TIMEOUT', 'Inventory connection capacity timed out.'),
        );
      }, 30000);
      const grant = (release: () => void) => {
        clearTimeout(timer);
        resolve(release);
      };
      connectorWaiters.push(grant);
    });
  }
  activeConnectors++;
  return createSlotRelease();
}

function ipv4Number(address: string): bigint | null {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts.reduce((value, part) => (value << 8n) | BigInt(part), 0n);
}

function inIpv4Range(address: string, base: string, prefix: number): boolean {
  const value = ipv4Number(address);
  const start = ipv4Number(base);
  if (value === null || start === null) return false;
  const mask = prefix === 0 ? 0n : ((1n << 32n) - 1n) ^ ((1n << BigInt(32 - prefix)) - 1n);
  return (value & mask) === (start & mask);
}

function ipv6Number(address: string): bigint | null {
  if (address.includes('%')) return null;
  let input = address.toLowerCase();
  if (input.includes('.')) {
    const splitAt = input.lastIndexOf(':');
    const v4 = ipv4Number(input.slice(splitAt + 1));
    if (splitAt < 0 || v4 === null) return null;
    input = `${input.slice(0, splitAt)}:${((v4 >> 16n) & 0xffffn).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }
  const halves = input.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0]!.split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1]!.split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const words = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;
  return words.reduce((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    return ![
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.88.99.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ].some(([base, prefix]) => inIpv4Range(address, base as string, prefix as number));
  }
  if (isIP(address) !== 6) return false;
  const value = ipv6Number(address);
  if (value === null) return false;
  const inRange = (base: bigint, prefix: number) => {
    const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefix)) - 1n);
    return (value & mask) === (base & mask);
  };
  // Only global unicast is accepted. Exclude documentation, special-purpose,
  // and 6to4 ranges to avoid embedded/private IPv4 destinations.
  return (
    inRange(0x20000000000000000000000000000000n, 3) &&
    !inRange(0x20010db8000000000000000000000000n, 32) &&
    !inRange(0x20010000000000000000000000000000n, 23) &&
    !inRange(0x20020000000000000000000000000000n, 16) &&
    !inRange(0x3fff0000000000000000000000000000n, 20)
  );
}

export class InventoryMysqlConnector {
  private readonly pool: Pool;
  private readonly compatiblePool: {
    getConnection(): Promise<{
      query<T>(options: unknown): Promise<[T, unknown[]]>;
      release(): void;
    }>;
  };
  private readOnlyVerified = false;
  private closed = false;
  private readonly releaseSlot: () => void;

  private constructor(
    private readonly options: InventoryMysqlQueryOptions,
    private readonly destination: ResolvedInventoryAddress,
    releaseSlot: () => void,
  ) {
    this.releaseSlot = releaseSlot;
    validateSqlIdentifier(options.database);
    if (options.developmentFixture && options.database !== 'carvix_inventory_fixture') {
      throw new InventoryMysqlError(
        'FORBIDDEN_DESTINATION',
        'The development fixture is limited to its synthetic database.',
      );
    }
    if (options.nodeEnv === 'production' && !options.tls) {
      throw new InventoryMysqlError(
        'CONNECTION_FAILED',
        'TLS is required for production inventory connections.',
      );
    }
    const poolOptions = {
      host: options.host,
      port: options.port,
      database: options.database,
      user: options.username,
      password: options.password,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 20,
      connectTimeout: Math.min(Math.max(options.connectTimeoutMs ?? 5000, 500), 30000),
      enableKeepAlive: true,
      // mysql2 uses host for TLS certificate identity while this stream factory
      // pins the TCP socket to the address vetted before pool construction.
      stream: () => {
        const socket = netConnect({
          host: this.destination.address,
          port: this.options.port,
          family: this.destination.family,
        });
        socket.setNoDelay(true);
        socket.on('connect', () => socket.setKeepAlive(true));
        return socket;
      },
      ...(options.tls
        ? {
            ssl: {
              rejectUnauthorized: true,
              verifyIdentity: true,
            },
          }
        : {}),
    };
    this.pool = mysql.createPool(poolOptions as PoolOptions);
    this.compatiblePool = this.pool as unknown as typeof this.compatiblePool;
  }

  static async create(options: InventoryMysqlQueryOptions): Promise<InventoryMysqlConnector> {
    const releaseSlot = await acquireConnectorSlot();
    try {
      const destination = await resolveInventoryDestination(
        options.host,
        options.port,
        options.nodeEnv,
        undefined,
        options.developmentFixture === true,
      );
      return new InventoryMysqlConnector(options, destination, releaseSlot);
    } catch (error) {
      releaseSlot();
      throw error;
    }
  }

  async test(): Promise<InventoryMysqlTestResult> {
    const connection = await this.compatiblePool.getConnection();
    try {
      await this.verifyReadOnly(connection);
      await connection.query({ sql: 'SELECT 1 AS connected', timeout: 5000 });
      return { connected: true, dialect: 'mysql', testedAt: new Date().toISOString() };
    } catch (error) {
      throw sanitizeMysqlError(error);
    } finally {
      connection.release();
    }
  }

  async query(sql: string, values: readonly unknown[] = []): Promise<RowDataPacket[]> {
    assertSelectOnly(sql);
    const connection = await this.compatiblePool.getConnection();
    try {
      await this.verifyReadOnly(connection);
      const [rows] = await connection.query<RowDataPacket[]>({
        sql,
        timeout: Math.min(Math.max(this.options.queryTimeoutMs ?? 5000, 500), 30000),
        values: [...values],
      });
      return rows;
    } catch (error) {
      throw sanitizeMysqlError(error);
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.pool.end();
    } finally {
      this.releaseSlot();
    }
  }

  private async verifyReadOnly(connection: {
    query<T>(options: unknown): Promise<[T, unknown[]]>;
  }) {
    if (this.readOnlyVerified) return;
    const [rows] = await connection.query<RowDataPacket[]>({
      sql: 'SHOW GRANTS FOR CURRENT_USER()',
      timeout: 5000,
    });
    const grants = rows.map((row) => String(Object.values(row)[0] ?? ''));
    assertSelectOnlyGrants(grants, this.options.database);
    this.readOnlyVerified = true;
  }
}

export function assertSelectOnlyGrants(grants: readonly string[], database: string): void {
  validateSqlIdentifier(database);
  const allowed = grants.every((grant) => {
    const normalized = grant.trim().replaceAll('`', '').replace(/\s+/g, ' ').toLowerCase();
    return (
      /^grant usage on \*\.\* to [^;]+$/.test(normalized) ||
      new RegExp(
        `^grant select on ${escapeRegExp(database.toLowerCase())}\\.(?:\\*|[a-z0-9_]+) to [^;]+$`,
      ).test(normalized)
    );
  });
  if (!grants.length || !allowed || !grants.some((grant) => /\bgrant select on\b/i.test(grant))) {
    throw new InventoryMysqlError(
      'UNSUPPORTED_OPERATION',
      'The inventory account must have SELECT-only access to the configured database.',
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeMysqlError(error: unknown): InventoryMysqlError {
  if (error instanceof InventoryMysqlError) return error;
  const record = error as { code?: string; errno?: number };
  if (record.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || record.code === 'ER_QUERY_TIMEOUT') {
    return new InventoryMysqlError('QUERY_TIMEOUT', 'The inventory query timed out.');
  }
  if (record.code === 'ETIMEDOUT' || record.code === 'PROTOCOL_CONNECTION_LOST') {
    return new InventoryMysqlError('CONNECTION_TIMEOUT', 'The inventory database timed out.');
  }
  if (record.code === 'ER_PARSE_ERROR' || record.code === 'ER_BAD_FIELD_ERROR') {
    return new InventoryMysqlError(
      'INVALID_IDENTIFIER',
      'The inventory mapping could not be applied.',
    );
  }
  if (record.code === 'ER_TABLEACCESS_DENIED_ERROR' || record.code === 'ER_DBACCESS_DENIED_ERROR') {
    return new InventoryMysqlError('CONNECTION_FAILED', 'The inventory database denied access.');
  }
  if (record.code === 'ER_ACCESS_DENIED_ERROR') {
    return new InventoryMysqlError(
      'CONNECTION_FAILED',
      'The inventory database credentials were rejected.',
    );
  }
  return new InventoryMysqlError('CONNECTION_FAILED', 'The inventory database is unavailable.');
}
