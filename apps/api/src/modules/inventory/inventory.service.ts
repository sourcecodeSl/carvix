import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  InventoryConnectionSummary,
  InventoryMappingConfiguration,
  VehicleSearchResult,
  TenantContext,
} from '@aicrm/shared';
import {
  InventoryMysqlConnector,
  InventoryMysqlError,
  quoteSqlIdentifier,
  validateInventoryHost,
  validateSqlIdentifier,
} from '@aicrm/inventory-mysql';
import { InventoryCredentialsService } from './inventory.credentials';
import { InventoryRepository } from './inventory.repository';
import type {
  CreateInventoryConnectionDto,
  ListVehiclesDto,
  UpdateInventoryConnectionDto,
} from './inventory.dto';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '@aicrm/database';
import { DealershipRepository } from '../dealerships/dealership.repository';

const mappingFields = [
  'tableName',
  'primaryKeyField',
  'idField',
  'makeField',
  'modelField',
  'variantField',
  'yearField',
  'registrationYearField',
  'priceField',
  'currencyField',
  'mileageField',
  'fuelTypeField',
  'transmissionField',
  'conditionField',
  'bodyTypeField',
  'colorField',
  'availabilityField',
  'descriptionField',
  'imageUrlField',
  'engineCapacityField',
  'locationField',
  'branchField',
  'featuresField',
  'serviceHistoryField',
  'warrantyField',
  'financeAvailabilityField',
  'sourceUpdatedAtField',
] as const;

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventory: InventoryRepository,
    private readonly credentials: InventoryCredentialsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly dealerships: DealershipRepository,
  ) {}

  async listConnections(context: TenantContext) {
    return (await this.inventory.list(context)).map((item) => this.toConnection(item));
  }

  async getConnection(context: TenantContext, connectionId: string) {
    const connection = await this.inventory.findById(context, connectionId);
    if (!connection) throw new NotFoundException('Inventory connection not found');
    return this.toConnection(connection);
  }

  async createOrUpdateConnection(
    context: TenantContext,
    dealershipId: string | undefined,
    dto: CreateInventoryConnectionDto | UpdateInventoryConnectionDto,
  ): Promise<InventoryConnectionSummary> {
    if (!dealershipId) {
      const dealerships = await this.dealerships.findForTenant(context);
      const activeDealership = dealerships[0];
      if (!activeDealership) throw new NotFoundException('Dealership not found');
      dealershipId = activeDealership.id;
    }
    const existing = await this.inventory.findByDealership(context, dealershipId);
    const host = dto.host ?? existing?.host;
    const port = dto.port ?? existing?.port;
    const databaseName = dto.databaseName ?? existing?.databaseName;
    const username = dto.username ?? existing?.username;
    const mapping = dto.mapping
      ? ({
          tableName: dto.mapping.tableName,
          primaryKeyField: dto.mapping.primaryKeyField,
          idField: dto.mapping.idField,
          makeField: dto.mapping.makeField,
          modelField: dto.mapping.modelField,
          variantField: dto.mapping.variantField ?? null,
          yearField: dto.mapping.yearField ?? null,
          registrationYearField: dto.mapping.registrationYearField ?? null,
          priceField: dto.mapping.priceField ?? null,
          currencyField: dto.mapping.currencyField ?? null,
          mileageField: dto.mapping.mileageField ?? null,
          fuelTypeField: dto.mapping.fuelTypeField ?? null,
          transmissionField: dto.mapping.transmissionField ?? null,
          conditionField: dto.mapping.conditionField ?? null,
          bodyTypeField: dto.mapping.bodyTypeField ?? null,
          colorField: dto.mapping.colorField ?? null,
          availabilityField: dto.mapping.availabilityField ?? null,
          descriptionField: dto.mapping.descriptionField ?? null,
          imageUrlField: dto.mapping.imageUrlField ?? null,
          engineCapacityField: dto.mapping.engineCapacityField ?? null,
          locationField: dto.mapping.locationField ?? null,
          branchField: dto.mapping.branchField ?? null,
          featuresField: dto.mapping.featuresField ?? null,
          serviceHistoryField: dto.mapping.serviceHistoryField ?? null,
          warrantyField: dto.mapping.warrantyField ?? null,
          financeAvailabilityField: dto.mapping.financeAvailabilityField ?? null,
          sourceUpdatedAtField: dto.mapping.sourceUpdatedAtField ?? null,
        } satisfies InventoryMappingConfiguration)
      : (existing?.mapping as InventoryMappingConfiguration | null);
    if (!host || !port || !databaseName || !username || !mapping) {
      throw new BadRequestException(
        'Host, port, database name, username, and mapping are required.',
      );
    }

    validateInventoryHost(
      host,
      port,
      this.config.getOrThrow<'development' | 'test' | 'production'>('NODE_ENV'),
      this.config.getOrThrow<string>('NODE_ENV') !== 'production',
    );
    if (
      this.config.getOrThrow<string>('NODE_ENV') !== 'production' &&
      (host !== '127.0.0.1' || port !== 3307 || databaseName !== 'carvix_inventory_fixture')
    ) {
      throw new BadRequestException('Development inventory is limited to the synthetic fixture.');
    }
    validateSqlIdentifier(databaseName);
    this.validateMapping(mapping);
    const nodeEnv = this.config.getOrThrow<'development' | 'test' | 'production'>('NODE_ENV');
    const tlsEnabled = dto.tlsEnabled ?? existing?.tlsEnabled ?? true;
    if (nodeEnv === 'production' && !tlsEnabled) {
      throw new BadRequestException('TLS is required for production inventory connections.');
    }

    let encrypted;
    if (dto.password) {
      encrypted = this.credentials.encrypt(dto.password);
    } else if (existing) {
      encrypted = {
        ciphertext: existing.credentialCiphertext,
        iv: existing.credentialIv,
        tag: existing.credentialTag,
        reference: existing.credentialReference,
      };
    } else {
      throw new BadRequestException('Password is required for a new inventory connection.');
    }

    const connection = await this.inventory.upsert(context, dealershipId, {
      name: dto.name ?? existing?.name ?? 'Primary inventory',
      host,
      port,
      databaseName,
      username,
      credentialCiphertext: encrypted.ciphertext,
      credentialIv: encrypted.iv,
      credentialTag: encrypted.tag,
      credentialReference: encrypted.reference,
      tlsEnabled,
      mapping: mapping as Prisma.InputJsonValue,
      status: 'DRAFT',
    });
    if (!connection) throw new NotFoundException('Dealership not found');
    return this.toConnection(connection);
  }

  async updateConnection(
    context: TenantContext,
    connectionId: string,
    dto: UpdateInventoryConnectionDto,
  ): Promise<InventoryConnectionSummary> {
    const existing = await this.inventory.findById(context, connectionId);
    if (!existing) throw new NotFoundException('Inventory connection not found');
    return this.createOrUpdateConnection(context, existing.dealershipId, dto);
  }

  async testConnection(context: TenantContext, connectionId: string) {
    const connection = await this.inventory.findById(context, connectionId);
    if (!connection) throw new NotFoundException('Inventory connection not found');
    const testedRevision = connection.configurationRevision;
    let testedAt: string;
    try {
      validateInventoryHost(
        connection.host,
        connection.port,
        this.config.getOrThrow<'development' | 'test' | 'production'>('NODE_ENV'),
        this.config.getOrThrow<string>('NODE_ENV') !== 'production',
      );
      const password = this.credentials.decrypt(
        connection.credentialCiphertext,
        connection.credentialIv,
        connection.credentialTag,
      );
      const mapping = connection.mapping as InventoryMappingConfiguration;
      this.validateMapping(mapping);
      const connector = await InventoryMysqlConnector.create({
        host: connection.host,
        port: connection.port,
        database: connection.databaseName,
        username: connection.username,
        password,
        tls: connection.tlsEnabled,
        connectTimeoutMs: connection.connectTimeoutMs,
        queryTimeoutMs: connection.queryTimeoutMs,
        developmentFixture: this.config.getOrThrow<string>('NODE_ENV') !== 'production',
        nodeEnv: this.config.getOrThrow<'development' | 'test' | 'production'>('NODE_ENV'),
      });
      try {
        const test = await connector.test();
        const table = quoteSqlIdentifier(mapping.tableName);
        const columns = this.mappingSelectColumns(mapping);
        await connector.query(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 0`);
        const rows = await connector.query(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`);
        const sample = rows[0];
        if (
          sample &&
          (!toNullableString(sample[mapping.idField]) ||
            !toNullableString(sample[mapping.makeField]) ||
            !toNullableString(sample[mapping.modelField]))
        ) {
          throw new InventoryMysqlError(
            'INVALID_IDENTIFIER',
            'The inventory mapping does not provide required vehicle identity fields.',
          );
        }
        testedAt = test.testedAt;
      } finally {
        await connector.close();
      }
    } catch (error) {
      await this.inventory.recordTestResult(context, connection.id, testedRevision, false);
      if (error instanceof ConflictException) throw error;
      if (error instanceof InventoryMysqlError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw new ServiceUnavailableException(
        'The inventory database is unavailable or the mapping is invalid.',
      );
    }
    const recorded = await this.inventory.recordTestResult(
      context,
      connection.id,
      testedRevision,
      true,
    );
    if (!recorded) {
      throw new ConflictException(
        'Inventory configuration changed while its connection was being tested.',
      );
    }
    return { connected: true, testedAt, mappingAccessible: true };
  }

  async setStatus(
    context: TenantContext,
    connectionId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ): Promise<InventoryConnectionSummary> {
    const connection = await this.inventory.findById(context, connectionId);
    if (!connection) throw new NotFoundException('Inventory connection not found');
    const updated = await this.inventory.setStatus(context, connectionId, status);
    if (!updated) throw new ForbiddenException('The inventory connection cannot be activated.');
    return this.toConnection(updated);
  }

  async listVehicles(
    context: TenantContext,
    filters: ListVehiclesDto,
  ): Promise<VehicleSearchResult> {
    const connection = await this.requireActiveConnection(context);
    const password = this.credentials.decrypt(
      connection.credentialCiphertext,
      connection.credentialIv,
      connection.credentialTag,
    );
    const mapping = connection.mapping as InventoryMappingConfiguration;
    this.validateMapping(mapping);
    let connector: InventoryMysqlConnector | undefined;
    try {
      connector = await InventoryMysqlConnector.create({
        host: connection.host,
        port: connection.port,
        database: connection.databaseName,
        username: connection.username,
        password,
        tls: connection.tlsEnabled,
        connectTimeoutMs: connection.connectTimeoutMs,
        queryTimeoutMs: connection.queryTimeoutMs,
        developmentFixture: this.config.getOrThrow<string>('NODE_ENV') !== 'production',
        nodeEnv: this.config.getOrThrow<'development' | 'test' | 'production'>('NODE_ENV'),
      });
      return await this.queryVehicles(connector, connection, mapping, filters);
    } catch (error) {
      if (error instanceof InventoryMysqlError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw new ServiceUnavailableException('The inventory database is unavailable.');
    } finally {
      await connector?.close();
    }
  }

  async getVehicle(context: TenantContext, vehicleId: string) {
    const connection = await this.requireActiveConnection(context);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(vehicleId)) {
      throw new BadRequestException('Vehicle identifier is invalid.');
    }
    const password = this.credentials.decrypt(
      connection.credentialCiphertext,
      connection.credentialIv,
      connection.credentialTag,
    );
    const mapping = connection.mapping as InventoryMappingConfiguration;
    this.validateMapping(mapping);
    let connector: InventoryMysqlConnector | undefined;
    try {
      connector = await InventoryMysqlConnector.create({
        host: connection.host,
        port: connection.port,
        database: connection.databaseName,
        username: connection.username,
        password,
        tls: connection.tlsEnabled,
        connectTimeoutMs: connection.connectTimeoutMs,
        queryTimeoutMs: connection.queryTimeoutMs,
        developmentFixture: this.config.getOrThrow<string>('NODE_ENV') !== 'production',
        nodeEnv: this.config.getOrThrow<'development' | 'test' | 'production'>('NODE_ENV'),
      });
      const columns = this.mappingSelectColumns(mapping);
      const table = quoteSqlIdentifier(mapping.tableName);
      const idField = quoteSqlIdentifier(mapping.idField);
      const rows = await connector.query(
        `SELECT ${columns.join(', ')} FROM ${table} WHERE ${idField} = ? LIMIT 1`,
        [vehicleId],
      );
      if (!rows.length) throw new NotFoundException('Vehicle not found');
      const row = rows[0];
      if (!row) throw new NotFoundException('Vehicle not found');
      return this.normalizeVehicle(connection, mapping, row);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof InventoryMysqlError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw new ServiceUnavailableException('The inventory vehicle could not be retrieved.');
    } finally {
      await connector?.close();
    }
  }

  private async requireActiveConnection(context: TenantContext) {
    const dealership = await this.inventory.findActive(context);
    if (!dealership)
      throw new NotFoundException('No vehicle inventory connection has been configured');
    if (dealership.status !== 'ACTIVE') {
      throw new ServiceUnavailableException('The vehicle inventory connection is inactive.');
    }
    return dealership;
  }

  private validateMapping(mapping: InventoryMappingConfiguration): void {
    if (!mapping || typeof mapping !== 'object') {
      throw new BadRequestException('A valid inventory schema mapping is required.');
    }
    const required = new Set([
      'tableName',
      'primaryKeyField',
      'idField',
      'makeField',
      'modelField',
    ]);
    for (const field of mappingFields) {
      const value = mapping[field];
      if (required.has(field) && (typeof value !== 'string' || !value.trim())) {
        throw new BadRequestException(`The inventory mapping field ${field} is required.`);
      }
      if (value !== null && value !== undefined) {
        if (typeof value !== 'string') {
          throw new BadRequestException(`The inventory mapping field ${field} is invalid.`);
        }
        if (value) {
          try {
            validateSqlIdentifier(value);
          } catch {
            throw new BadRequestException(`The inventory mapping field ${field} is invalid.`);
          }
        }
      }
    }
  }

  private mappingSelectColumns(mapping: InventoryMappingConfiguration): string[] {
    const names = mappingFields
      .filter((field) => field !== 'tableName')
      .map((field) => mapping[field])
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    return [...new Set(names)].map(quoteSqlIdentifier);
  }

  private async queryVehicles(
    connector: Pick<InventoryMysqlConnector, 'query'>,
    connection: { dealershipId: string },
    mapping: InventoryMappingConfiguration,
    filters: ListVehiclesDto,
  ): Promise<VehicleSearchResult> {
    const table = quoteSqlIdentifier(mapping.tableName);
    const conditions: string[] = [];
    const values: unknown[] = [];
    const addText = (field: string | null, value: string | undefined) => {
      if (field && value) {
        conditions.push(`${quoteSqlIdentifier(field)} LIKE ?`);
        values.push(`%${value.trim()}%`);
      }
    };
    addText(mapping.makeField, filters.make);
    addText(mapping.modelField, filters.model);
    if (filters.fuelType && !mapping.fuelTypeField) {
      throw new BadRequestException(
        'Fuel type filtering is unsupported by this inventory mapping.',
      );
    }
    addText(mapping.fuelTypeField, filters.fuelType);
    if (filters.transmission && !mapping.transmissionField) {
      throw new BadRequestException(
        'Transmission filtering is unsupported by this inventory mapping.',
      );
    }
    addText(mapping.transmissionField, filters.transmission);
    if (filters.availability && !mapping.availabilityField) {
      throw new BadRequestException(
        'Availability filtering is unsupported by this inventory mapping.',
      );
    }
    addText(mapping.availabilityField, filters.availability);
    if (filters.q) {
      const searchable = [mapping.makeField, mapping.modelField].map(quoteSqlIdentifier);
      conditions.push(`(${searchable.map((field) => `${field} LIKE ?`).join(' OR ')})`);
      for (let index = 0; index < searchable.length; index++) values.push(`%${filters.q}%`);
    }
    if (mapping.priceField) {
      if (filters.minPrice) {
        if (!/^\d+(?:\.\d{1,2})?$/.test(filters.minPrice)) {
          throw new BadRequestException('Minimum price is invalid.');
        }
        conditions.push(`${quoteSqlIdentifier(mapping.priceField)} >= ?`);
        values.push(filters.minPrice);
      }
      if (filters.maxPrice) {
        if (!/^\d+(?:\.\d{1,2})?$/.test(filters.maxPrice)) {
          throw new BadRequestException('Maximum price is invalid.');
        }
        conditions.push(`${quoteSqlIdentifier(mapping.priceField)} <= ?`);
        values.push(filters.maxPrice);
      }
    } else if (filters.minPrice || filters.maxPrice) {
      throw new BadRequestException('Price filtering is unsupported by this inventory mapping.');
    }
    if (mapping.yearField) {
      if (filters.minYear) {
        conditions.push(`${quoteSqlIdentifier(mapping.yearField)} >= ?`);
        values.push(filters.minYear);
      }
      if (filters.maxYear) {
        conditions.push(`${quoteSqlIdentifier(mapping.yearField)} <= ?`);
        values.push(filters.maxYear);
      }
    } else if (filters.minYear || filters.maxYear) {
      throw new BadRequestException('Year filtering is unsupported by this inventory mapping.');
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const countRows = await connector.query(
      `SELECT COUNT(*) AS total FROM ${table}${where}`,
      values,
    );
    const total = Number((countRows[0]?.total as number) ?? 0);
    const sortMap: Record<string, string> = {
      newest: mapping.yearField
        ? `${quoteSqlIdentifier(mapping.yearField)} DESC`
        : `${quoteSqlIdentifier(mapping.primaryKeyField)} DESC`,
      priceAsc: mapping.priceField
        ? `${quoteSqlIdentifier(mapping.priceField)} ASC`
        : `${quoteSqlIdentifier(mapping.primaryKeyField)} ASC`,
      priceDesc: mapping.priceField
        ? `${quoteSqlIdentifier(mapping.priceField)} DESC`
        : `${quoteSqlIdentifier(mapping.primaryKeyField)} DESC`,
      yearDesc: mapping.yearField
        ? `${quoteSqlIdentifier(mapping.yearField)} DESC`
        : `${quoteSqlIdentifier(mapping.primaryKeyField)} DESC`,
    };
    if ((filters.sort === 'priceAsc' || filters.sort === 'priceDesc') && !mapping.priceField) {
      throw new BadRequestException('Price sorting is unsupported by this inventory mapping.');
    }
    const order = sortMap[filters.sort ?? 'newest'];
    const columns = this.mappingSelectColumns(mapping);
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = await connector.query(
      `SELECT ${columns.join(', ')} FROM ${table}${where} ORDER BY ${order}, ${quoteSqlIdentifier(mapping.primaryKeyField)} DESC LIMIT ? OFFSET ?`,
      [...values, filters.pageSize, offset],
    );
    return {
      items: rows.map((row) => this.normalizeVehicle(connection, mapping, row)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  private normalizeVehicle(
    connection: { dealershipId: string },
    mapping: InventoryMappingConfiguration,
    row: Record<string, unknown>,
  ) {
    const retrievedAt = new Date().toISOString();
    const sourceId = String(row[mapping.idField] ?? '');
    const yearValue = mapping.yearField ? toNullableNumber(row[mapping.yearField]) : null;
    const registrationYear = mapping.registrationYearField
      ? toNullableNumber(row[mapping.registrationYearField])
      : null;
    const rawPriceValue = mapping.priceField ? row[mapping.priceField] : null;
    const priceValue =
      typeof rawPriceValue === 'string' ||
      typeof rawPriceValue === 'number' ||
      typeof rawPriceValue === 'bigint'
        ? String(rawPriceValue)
        : null;
    const mileageValue = mapping.mileageField ? toNullableNumber(row[mapping.mileageField]) : null;
    const engineCapacity = mapping.engineCapacityField
      ? toNullableNumber(row[mapping.engineCapacityField])
      : null;
    const images = mapping.imageUrlField ? toStringArray(row[mapping.imageUrlField]) : [];
    const sourceUpdatedValue = mapping.sourceUpdatedAtField
      ? row[mapping.sourceUpdatedAtField]
      : null;
    const financeValue = mapping.financeAvailabilityField
      ? toNullableBoolean(row[mapping.financeAvailabilityField])
      : null;
    return {
      id: sourceId,
      externalVehicleId: sourceId,
      dealershipId: connection.dealershipId,
      make: toNullableString(row[mapping.makeField]),
      model: toNullableString(row[mapping.modelField]),
      variant: mapping.variantField ? toNullableString(row[mapping.variantField]) : null,
      year: yearValue,
      registrationYear,
      price: priceValue,
      currency: mapping.currencyField ? toNullableString(row[mapping.currencyField]) : null,
      mileage: mileageValue,
      engineCapacity,
      fuelType: mapping.fuelTypeField ? toNullableString(row[mapping.fuelTypeField]) : null,
      transmission: mapping.transmissionField
        ? toNullableString(row[mapping.transmissionField])
        : null,
      condition: mapping.conditionField ? toNullableString(row[mapping.conditionField]) : null,
      bodyType: mapping.bodyTypeField ? toNullableString(row[mapping.bodyTypeField]) : null,
      color: mapping.colorField ? toNullableString(row[mapping.colorField]) : null,
      location: mapping.locationField ? toNullableString(row[mapping.locationField]) : null,
      branch: mapping.branchField ? toNullableString(row[mapping.branchField]) : null,
      features: mapping.featuresField ? toNullableStringArray(row[mapping.featuresField]) : null,
      serviceHistory: mapping.serviceHistoryField
        ? toNullableString(row[mapping.serviceHistoryField])
        : null,
      warranty: mapping.warrantyField ? toNullableString(row[mapping.warrantyField]) : null,
      financeAvailability: financeValue,
      sourceUpdatedAt: sourceUpdatedValue == null ? null : String(sourceUpdatedValue),
      availabilityStatus: mapping.availabilityField
        ? toNullableString(row[mapping.availabilityField])
        : null,
      imageUrls: images,
      retrievedAt,
      ...(mapping.descriptionField
        ? { description: toNullableString(row[mapping.descriptionField]) }
        : { description: null }),
      source: 'EXTERNAL_MYSQL',
    };
  }

  private toConnection(connection: {
    id: string;
    dealershipId: string;
    name: string;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    status: string;
    tlsEnabled: boolean;
    lastTestedAt: Date | null;
    lastSuccessfulConnectionAt: Date | null;
    mapping: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): InventoryConnectionSummary {
    return {
      id: connection.id,
      dealershipId: connection.dealershipId,
      name: connection.name,
      connectorType: 'MYSQL',
      host: connection.host,
      port: connection.port,
      databaseName: connection.databaseName,
      username: connection.username,
      status: connection.status as InventoryConnectionSummary['status'],
      tlsEnabled: connection.tlsEnabled,
      lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
      lastSuccessfulConnectionAt: connection.lastSuccessfulConnectionAt?.toISOString() ?? null,
      mapping: connection.mapping as InventoryMappingConfiguration | null,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }
}

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 20);
}

function toNullableStringArray(value: unknown): string[] | null {
  if (value == null || value === '') return null;
  return toStringArray(value);
}

function toNullableBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 1n) return true;
  if (value === 0 || value === 0n) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'available'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'unavailable'].includes(normalized)) return false;
  }
  return null;
}
