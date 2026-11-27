import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Prisma, PrismaClient, PrismaPg } from '@aicrm/database';
import { Permission, RolePermissions, type TenantContext } from '@aicrm/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { REDIS_CLIENT } from '../../redis/redis.provider';
import { PrismaService } from '../../database/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { InventoryRepository } from './inventory.repository';

const enabled = process.env.RUN_POSTGRES_INTEGRATION === 'true';
const mysqlApiEnabled = enabled && process.env.RUN_MYSQL_INTEGRATION === 'true';
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const appUrl = process.env.DATABASE_APP_URL;

describe.skipIf(!enabled)('inventory PostgreSQL tenant, RBAC, and audit integration', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const managerId = randomUUID();
  const agentId = randomUUID();
  const membershipAId = randomUUID();
  const membershipBId = randomUUID();
  const managerMembershipId = randomUUID();
  const agentMembershipId = randomUUID();
  const dealershipAId = randomUUID();
  const dealershipBId = randomUUID();
  let owner: PrismaClient | undefined;
  let runtime: PrismaService | undefined;
  let repository: InventoryRepository | undefined;
  let app: INestApplication | undefined;
  let contextA: TenantContext;
  let contextB: TenantContext;
  let connectionAId = '';
  let connectionBId = '';
  const testPassword = 'Inventory-Test-Pass!2026';
  const apiOrigin = 'http://127.0.0.1:3000';

  beforeAll(async () => {
    if (!migrationUrl || !appUrl) {
      throw new Error('DATABASE_MIGRATION_URL and DATABASE_APP_URL are required');
    }
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: migrationUrl }) });
    runtime = new PrismaService({
      getOrThrow: () => appUrl,
    } as never);
    const audit = new AuditService(new AuditRepository(runtime));
    repository = new InventoryRepository(runtime, audit);

    await owner.tenant.createMany({
      data: [
        { id: tenantAId, name: 'Inventory test A', slug: `inventory-${suffix}-a` },
        { id: tenantBId, name: 'Inventory test B', slug: `inventory-${suffix}-b` },
      ],
    });
    await owner.user.createMany({
      data: [
        {
          id: userAId,
          tenantId: tenantAId,
          email: `inventory-a-${suffix}@example.test`,
          name: 'Inventory A',
        },
        {
          id: userBId,
          tenantId: tenantBId,
          email: `inventory-b-${suffix}@example.test`,
          name: 'Inventory B',
        },
        {
          id: managerId,
          tenantId: tenantAId,
          email: `inventory-manager-${suffix}@example.test`,
          name: 'Inventory Manager',
        },
        {
          id: agentId,
          tenantId: tenantAId,
          email: `inventory-agent-${suffix}@example.test`,
          name: 'Inventory Agent',
        },
      ],
    });
    const passwordHash = await argon2.hash(testPassword, {
      memoryCost: 19456,
      timeCost: 3,
      parallelism: 1,
    });
    await owner.passwordCredential.createMany({
      data: [userAId, userBId, managerId, agentId].map((userId) => ({ userId, passwordHash })),
    });
    await owner.tenantMembership.createMany({
      data: [
        {
          id: membershipAId,
          tenantId: tenantAId,
          userId: userAId,
          role: 'DEALER_ADMIN',
          status: 'ACTIVE',
        },
        {
          id: membershipBId,
          tenantId: tenantBId,
          userId: userBId,
          role: 'DEALER_ADMIN',
          status: 'ACTIVE',
        },
        {
          id: managerMembershipId,
          tenantId: tenantAId,
          userId: managerId,
          role: 'SALES_MANAGER',
          status: 'ACTIVE',
        },
        {
          id: agentMembershipId,
          tenantId: tenantAId,
          userId: agentId,
          role: 'SALES_AGENT',
          status: 'ACTIVE',
        },
      ],
    });
    await owner.dealership.createMany({
      data: [
        {
          id: dealershipAId,
          tenantId: tenantAId,
          businessName: 'Inventory A',
          contactEmail: `dealer-a-${suffix}@example.test`,
          country: 'Sri Lanka',
          timezone: 'Asia/Colombo',
          currency: 'LKR',
        },
        {
          id: dealershipBId,
          tenantId: tenantBId,
          businessName: 'Inventory B',
          contactEmail: `dealer-b-${suffix}@example.test`,
          country: 'Sri Lanka',
          timezone: 'Asia/Colombo',
          currency: 'LKR',
        },
      ],
    });
    contextA = {
      kind: 'tenant',
      tenantId: tenantAId,
      userId: userAId,
      membershipId: membershipAId,
      permissions: RolePermissions.DEALER_ADMIN,
    };
    contextB = {
      kind: 'tenant',
      tenantId: tenantBId,
      userId: userBId,
      membershipId: membershipBId,
      permissions: RolePermissions.DEALER_ADMIN,
    };

    const counters = new Map<string, number>();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REDIS_CLIENT)
      .useValue({
        incr: async (key: string) => {
          const count = (counters.get(key) ?? 0) + 1;
          counters.set(key, count);
          return count;
        },
        expire: async () => 1,
      })
      .compile();
    const config = moduleRef.get(ConfigService);
    config.set('NODE_ENV', 'development');
    config.set('LOGIN_LIMIT_PER_MINUTE', 100);
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (owner) {
      await owner.auditEvent.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await owner.inventoryConnection.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await owner.dealership.deleteMany({ where: { id: { in: [dealershipAId, dealershipBId] } } });
      await owner.tenantMembership.deleteMany({
        where: {
          id: { in: [membershipAId, membershipBId, managerMembershipId, agentMembershipId] },
        },
      });
      await owner.passwordCredential.deleteMany({
        where: { userId: { in: [userAId, userBId, managerId, agentId] } },
      });
      await owner.user.deleteMany({
        where: { id: { in: [userAId, userBId, managerId, agentId] } },
      });
      await owner.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    }
    await Promise.all([owner?.$disconnect(), runtime?.$disconnect()]);
  });

  it('scopes connections by tenant, enforces management permission, and audits mutations transactionally', async () => {
    const mapping = {
      tableName: 'vehicles',
      primaryKeyField: 'id',
      idField: 'id',
      makeField: 'make',
      modelField: 'model',
      yearField: 'year',
      registrationYearField: null,
      priceField: 'price_lkr',
      currencyField: null,
      variantField: null,
      mileageField: 'mileage',
      fuelTypeField: 'fuel_type',
      transmissionField: 'transmission',
      conditionField: 'condition_name',
      bodyTypeField: 'body_type',
      colorField: 'color',
      availabilityField: 'availability',
      descriptionField: 'description',
      imageUrlField: 'image_urls',
      engineCapacityField: null,
      locationField: null,
      branchField: null,
      featuresField: null,
      serviceHistoryField: null,
      warrantyField: null,
      financeAvailabilityField: null,
      sourceUpdatedAtField: null,
    } satisfies Prisma.InputJsonObject;
    const first = await repository!.upsert(contextA, dealershipAId, {
      name: 'Primary inventory',
      host: '127.0.0.1',
      port: 3307,
      databaseName: 'carvix_inventory_fixture',
      username: 'carvix_inventory_reader',
      credentialCiphertext: 'aa',
      credentialIv: '0'.repeat(24),
      credentialTag: '0'.repeat(32),
      credentialReference: 'test-key',
      mapping,
    });
    expect(first).not.toBeNull();
    connectionAId = first!.id;
    expect(await repository!.findById(contextB, first!.id)).toBeNull();
    const second = await repository!.upsert(contextB, dealershipBId, {
      name: 'Primary inventory',
      host: '127.0.0.1',
      port: 3307,
      databaseName: 'carvix_inventory_fixture',
      username: 'carvix_inventory_reader',
      credentialCiphertext: 'cc',
      credentialIv: '2'.repeat(24),
      credentialTag: '3'.repeat(32),
      credentialReference: 'test-key',
      mapping,
    });
    connectionBId = second!.id;

    const salesContext: TenantContext = {
      kind: 'tenant',
      tenantId: tenantAId,
      userId: userAId,
      membershipId: membershipAId,
      permissions: [Permission.INVENTORY_READ],
    };
    await expect(repository!.findById(salesContext, first!.id)).rejects.toThrow(
      'Insufficient inventory permissions',
    );

    await owner!.inventoryConnection.update({
      where: { id: first!.id },
      data: { lastSuccessfulConnectionAt: new Date(), lastTestedAt: new Date(), status: 'ACTIVE' },
    });
    const updated = await repository!.upsert(contextA, dealershipAId, {
      name: 'Primary inventory',
      host: '127.0.0.1',
      port: 3307,
      databaseName: 'carvix_inventory_fixture',
      username: 'carvix_inventory_reader',
      credentialCiphertext: 'bb',
      credentialIv: '1'.repeat(24),
      credentialTag: '2'.repeat(32),
      credentialReference: 'test-key',
      mapping: { ...mapping, currencyField: 'currency' },
    });
    expect(updated?.status).toBe('DRAFT');
    expect(updated?.lastTestedAt).toBeNull();
    expect(updated?.lastSuccessfulConnectionAt).toBeNull();

    const events = await owner!.auditEvent.findMany({
      where: { tenantId: tenantAId, resourceId: first!.id },
      select: { eventType: true },
    });
    expect(events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'inventory.connection.created',
        'inventory.connection.updated',
        'inventory.mapping.updated',
      ]),
    );
    expect(
      events.some(
        (event) => event.eventType.includes('password') || event.eventType.includes('secret'),
      ),
    ).toBe(false);

    const testedRevision = updated!.configurationRevision;
    const changedWhileTestWasInFlight = await repository!.upsert(contextA, dealershipAId, {
      name: 'Primary inventory',
      host: '127.0.0.1',
      port: 3307,
      databaseName: 'carvix_inventory_fixture',
      username: 'carvix_inventory_reader',
      credentialCiphertext: 'bb',
      credentialIv: '1'.repeat(24),
      credentialTag: '2'.repeat(32),
      credentialReference: 'test-key',
      mapping: { ...mapping, currencyField: 'currency', availabilityField: 'availability' },
    });
    expect(changedWhileTestWasInFlight!.configurationRevision).toBeGreaterThan(testedRevision);
    await expect(
      repository!.recordTestResult(contextA, first!.id, testedRevision, true),
    ).resolves.toBe(false);
    await expect(repository!.setStatus(contextA, first!.id, 'ACTIVE')).resolves.toBeNull();
    await expect(
      repository!.recordTestResult(
        contextA,
        first!.id,
        changedWhileTestWasInFlight!.configurationRevision,
        true,
      ),
    ).resolves.toBe(true);
    await expect(repository!.setStatus(contextA, first!.id, 'ACTIVE')).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    await expect(repository!.setStatus(contextA, first!.id, 'INACTIVE')).resolves.toMatchObject({
      status: 'INACTIVE',
    });
  });

  it('enforces inventory API permissions, rejects forged tenant scope, and lists only the active tenant', async () => {
    async function signIn(email: string): Promise<string> {
      const response = await request(app!.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', apiOrigin)
        .send({ email, password: testPassword })
        .expect(200);
      const cookies = response.headers['set-cookie'];
      const cookie = (Array.isArray(cookies) ? cookies : [cookies])
        .find((value) => value.startsWith('aicrm_session='))
        ?.split(';')[0];
      if (!cookie) throw new Error('Expected session cookie');
      return cookie;
    }

    const adminCookie = await signIn(`inventory-a-${suffix}@example.test`);
    const ownConnections = await request(app!.getHttpServer())
      .get('/api/v1/inventory/connections')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(ownConnections.body.map((item: { id: string }) => item.id)).toEqual([connectionAId]);
    expect(ownConnections.body[0]).not.toHaveProperty('credentialCiphertext');

    await request(app!.getHttpServer())
      .patch(`/api/v1/inventory/connections/${connectionBId}`)
      .set('Cookie', adminCookie)
      .set('Origin', apiOrigin)
      .send({ name: 'Forged cross-tenant connection' })
      .expect(404);
    await request(app!.getHttpServer())
      .post('/api/v1/inventory/connections')
      .set('Cookie', adminCookie)
      .set('Origin', apiOrigin)
      .send({ tenantId: tenantBId })
      .expect(400);

    const managerCookie = await signIn(`inventory-manager-${suffix}@example.test`);
    await request(app!.getHttpServer())
      .get('/api/v1/inventory/connections')
      .set('Cookie', managerCookie)
      .expect(403);
    await request(app!.getHttpServer())
      .get('/api/v1/inventory/vehicles')
      .set('Cookie', managerCookie)
      .expect(404); // Read permission passes; no connection is active.

    const tenantBCookie = await signIn(`inventory-b-${suffix}@example.test`);
    const tenantBConnections = await request(app!.getHttpServer())
      .get('/api/v1/inventory/connections')
      .set('Cookie', tenantBCookie)
      .expect(200);
    expect(tenantBConnections.body.map((item: { id: string }) => item.id)).toEqual([connectionBId]);
  });

  it('rejects hosted PATCH requests in development and saves validated production settings as draft', async () => {
    const login = await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', apiOrigin)
      .send({ email: `inventory-a-${suffix}@example.test`, password: testPassword })
      .expect(200);
    const cookies = login.headers['set-cookie'];
    const cookie = (Array.isArray(cookies) ? cookies : [cookies])
      .find((value) => value.startsWith('aicrm_session='))
      ?.split(';')[0];
    if (!cookie) throw new Error('Expected session cookie');
    const path = `/api/v1/inventory/connections/${connectionAId}`;
    const patch = () =>
      request(app!.getHttpServer()).patch(path).set('Origin', apiOrigin).set('Cookie', cookie);
    const row = () =>
      owner!.inventoryConnection.findUniqueOrThrow({ where: { id: connectionAId } });
    const before = await row();
    const mapping = {
      tableName: 'vehicles',
      primaryKeyField: 'id',
      idField: 'id',
      makeField: 'make',
      modelField: 'model',
    };
    const hosted = {
      host: 'mysql.example.com',
      port: 3306,
      databaseName: 'main',
      username: 'cloud_reader',
      password: randomUUID(),
      tlsEnabled: true,
      tlsServername: null,
      mapping,
    };
    const rejected = await patch().send(hosted).expect(400);
    expect(rejected.body.message).toContain('accepts only the local MySQL fixture');
    const afterRejection = await row();
    expect(afterRejection.configurationRevision).toBe(before.configurationRevision);
    expect(afterRejection.updatedAt).toEqual(before.updatedAt);
    expect(afterRejection.host).toBe(before.host);

    const config = app!.get(ConfigService);
    config.set('NODE_ENV', 'production');
    try {
      await patch()
        .send({ ...hosted, databaseName: 'invalid/name' })
        .expect(400);
      await patch()
        .send({ ...hosted, tlsEnabled: false })
        .expect(400);
      const saved = await patch().send(hosted).expect(200);
      expect(saved.body).toMatchObject({
        host: hosted.host,
        port: 3306,
        databaseName: 'main',
        username: 'cloud_reader',
        tlsEnabled: true,
        tlsServername: null,
        status: 'DRAFT',
      });
      expect(saved.body).not.toHaveProperty('password');
      expect(saved.body).not.toHaveProperty('credentialCiphertext');
      const afterSave = await row();
      expect(afterSave.configurationRevision).toBe(before.configurationRevision + 1);
      expect(afterSave.lastTestedRevision).toBeNull();
      expect(afterSave.lastSuccessfulConnectionAt).toBeNull();
      expect(afterSave.credentialCiphertext !== hosted.password).toBe(true);
      await patch()
        .send({ mapping: { ...mapping, priceField: 'price_lkr' } })
        .expect(200);
      expect((await row()).credentialCiphertext === afterSave.credentialCiphertext).toBe(true);
      await patch().send({ host: '93.184.216.34', tlsServername: 'mysql.example.com' }).expect(400);
      const ip = await patch()
        .send({ host: '93.184.216.34', tlsServername: 'mysql.example.com', password: randomUUID() })
        .expect(200);
      expect(ip.body.tlsServername).toBe('mysql.example.com');
    } finally {
      config.set('NODE_ENV', 'development');
    }
  });

  it.skipIf(!mysqlApiEnabled)(
    'tests connection setup, read-only MySQL access, activation, vehicle search, and details over HTTP',
    async () => {
      const password = process.env.INVENTORY_MYSQL_PASSWORD;
      if (!password)
        throw new Error('INVENTORY_MYSQL_PASSWORD is required for MySQL API integration');
      const login = await request(app!.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', apiOrigin)
        .send({ email: `inventory-a-${suffix}@example.test`, password: testPassword })
        .expect(200);
      const cookies = login.headers['set-cookie'];
      const cookie = (Array.isArray(cookies) ? cookies : [cookies])
        .find((value) => value.startsWith('aicrm_session='))
        ?.split(';')[0];
      if (!cookie) throw new Error('Expected session cookie');

      const mapping = {
        tableName: 'vehicles',
        primaryKeyField: 'id',
        idField: 'id',
        makeField: 'make',
        modelField: 'model',
        yearField: 'year',
        priceField: 'price_lkr',
        mileageField: 'mileage',
        fuelTypeField: 'fuel_type',
        transmissionField: 'transmission',
        conditionField: 'condition_name',
        bodyTypeField: 'body_type',
        colorField: 'color',
        availabilityField: 'availability',
        descriptionField: 'description',
        imageUrlField: 'image_urls',
      };
      await request(app!.getHttpServer())
        .post('/api/v1/inventory/connections')
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({
          name: 'Fixture TLS without certificate identity',
          host: '127.0.0.1',
          port: Number(process.env.INVENTORY_MYSQL_PORT ?? 3307),
          databaseName: process.env.INVENTORY_MYSQL_DATABASE ?? 'carvix_inventory_fixture',
          username: process.env.INVENTORY_MYSQL_USER ?? 'carvix_inventory_reader',
          password,
          tlsEnabled: true,
          mapping,
        })
        .expect(400);
      const configuration = await request(app!.getHttpServer())
        .post('/api/v1/inventory/connections')
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({
          name: 'Fixture inventory',
          host: '127.0.0.1',
          port: Number(process.env.INVENTORY_MYSQL_PORT ?? 3307),
          databaseName: process.env.INVENTORY_MYSQL_DATABASE ?? 'carvix_inventory_fixture',
          username: process.env.INVENTORY_MYSQL_USER ?? 'carvix_inventory_reader',
          password,
          tlsEnabled: false,
          mapping: { ...mapping, priceField: 'missing_price_column' },
        })
        .expect(201);
      expect(configuration.body).not.toHaveProperty('credentialCiphertext');
      expect(configuration.body).not.toHaveProperty('password');

      await request(app!.getHttpServer())
        .post(`/api/v1/inventory/connections/${configuration.body.id}/test`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .expect(503);
      const invalidOptionalMapping = await request(app!.getHttpServer())
        .patch(`/api/v1/inventory/connections/${configuration.body.id}`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({ mapping: { ...mapping, priceField: 'missing_price_column' } })
        .expect(200);
      await request(app!.getHttpServer())
        .post(`/api/v1/inventory/connections/${configuration.body.id}/test`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .expect(503);
      await request(app!.getHttpServer())
        .post(`/api/v1/inventory/connections/${configuration.body.id}/activate`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .expect(403);
      await request(app!.getHttpServer())
        .patch(`/api/v1/inventory/connections/${configuration.body.id}`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({ mapping: { ...mapping, makeField: 'missing_make_column' } })
        .expect(200);
      await request(app!.getHttpServer())
        .post(`/api/v1/inventory/connections/${configuration.body.id}/test`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .expect(503);
      await request(app!.getHttpServer())
        .patch(`/api/v1/inventory/connections/${configuration.body.id}`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({ mapping })
        .expect(200);
      await request(app!.getHttpServer())
        .patch(`/api/v1/inventory/connections/${configuration.body.id}`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({ mapping: { ...mapping, makeField: 'make; DROP TABLE vehicles' } })
        .expect(400);
      expect(invalidOptionalMapping.body.mapping.priceField).toBe('missing_price_column');

      const staleConfig = await owner!.inventoryConnection.findUniqueOrThrow({
        where: { id: configuration.body.id },
      });
      const testedRevision = staleConfig.configurationRevision;
      const changedConfig = await repository!.upsert(contextA, dealershipAId, {
        name: staleConfig.name,
        host: staleConfig.host,
        port: staleConfig.port,
        databaseName: staleConfig.databaseName,
        username: staleConfig.username,
        credentialCiphertext: staleConfig.credentialCiphertext,
        credentialIv: staleConfig.credentialIv,
        credentialTag: staleConfig.credentialTag,
        credentialReference: staleConfig.credentialReference,
        tlsEnabled: staleConfig.tlsEnabled,
        mapping: mapping as Prisma.InputJsonObject,
      });
      expect(changedConfig!.configurationRevision).toBeGreaterThan(testedRevision);
      await expect(
        repository!.recordTestResult(contextA, configuration.body.id, testedRevision, true),
      ).resolves.toBe(false);
      await expect(
        repository!.setStatus(contextA, configuration.body.id, 'ACTIVE'),
      ).resolves.toBeNull();

      await request(app!.getHttpServer())
        .post(`/api/v1/inventory/connections/${configuration.body.id}/test`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .expect(201)
        .expect(({ body }) =>
          expect(body).toMatchObject({ connected: true, mappingAccessible: true }),
        );
      await request(app!.getHttpServer())
        .post(`/api/v1/inventory/connections/${configuration.body.id}/activate`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .expect(201)
        .expect(({ body }) => expect(body.status).toBe('ACTIVE'));

      const tenantBCookie = await request(app!.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', apiOrigin)
        .send({ email: `inventory-b-${suffix}@example.test`, password: testPassword })
        .expect(200)
        .then(({ headers }) => {
          const values = headers['set-cookie'];
          const value = (Array.isArray(values) ? values : [values]).find((item) =>
            item.startsWith('aicrm_session='),
          );
          if (!value) throw new Error('Expected tenant B session cookie');
          return value.split(';')[0]!;
        });
      await request(app!.getHttpServer())
        .get('/api/v1/inventory/connections')
        .set('Cookie', tenantBCookie)
        .expect(200)
        .expect(({ body }) =>
          expect(body.map((item: { id: string }) => item.id)).toEqual([connectionBId]),
        );
      await request(app!.getHttpServer())
        .get('/api/v1/inventory/vehicles')
        .set('Cookie', tenantBCookie)
        .expect(404);

      const agentCookie = await request(app!.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', apiOrigin)
        .send({ email: `inventory-agent-${suffix}@example.test`, password: testPassword })
        .expect(200)
        .then(({ headers }) => {
          const values = headers['set-cookie'];
          const value = (Array.isArray(values) ? values : [values]).find((item) =>
            item.startsWith('aicrm_session='),
          );
          if (!value) throw new Error('Expected Sales Agent session cookie');
          return value.split(';')[0]!;
        });
      await request(app!.getHttpServer())
        .get('/api/v1/inventory/connections')
        .set('Cookie', agentCookie)
        .expect(403);
      await request(app!.getHttpServer())
        .get('/api/v1/inventory/vehicles?page=1&pageSize=1')
        .set('Cookie', agentCookie)
        .expect(200);

      const vehicles = await request(app!.getHttpServer())
        .get('/api/v1/inventory/vehicles?q=Toyota&page=1&pageSize=10&sort=priceAsc')
        .set('Cookie', cookie)
        .expect(200);
      expect(vehicles.body.items.length).toBeGreaterThan(0);
      const missingPrice = vehicles.body.items.find(
        (vehicle: { id: string }) => vehicle.id === 'SYN-MISSING-006',
      );
      expect(missingPrice?.price).toBeNull();
      expect(missingPrice?.availabilityStatus).toBeNull();
      const secondPage = await request(app!.getHttpServer())
        .get('/api/v1/inventory/vehicles?page=2&pageSize=2&sort=yearDesc')
        .set('Cookie', cookie)
        .expect(200);
      expect(secondPage.body.page).toBe(2);
      expect(secondPage.body.pageSize).toBe(2);
      expect(secondPage.body.items.length).toBeLessThanOrEqual(2);

      const list = (query: Record<string, string | number> = {}) =>
        request(app!.getHttpServer())
          .get('/api/v1/inventory/vehicles')
          .set('Cookie', cookie)
          .query(query);
      const all = await list({ q: '   ', sort: 'priceDesc' }).expect(200);
      expect(all.body).toMatchObject({ total: 16, page: 1, pageSize: 20, totalPages: 1 });
      expect(all.body.items).toHaveLength(16);
      expect(all.body.items.at(-1)).toMatchObject({ id: 'SYN-MISSING-006', price: null });
      expect(all.body.supportedFilters).toEqual(
        expect.arrayContaining(['mileage', 'condition', 'bodyType']),
      );

      const combined = await list({
        q: ' tOyOtA ',
        make: 'Toyota',
        model: 'Cor',
        condition: 'Used',
        bodyType: 'Sedan',
        fuelType: 'Petrol',
        transmission: 'Automatic',
        availability: 'Available',
        minPrice: '8950000.00',
        maxPrice: '8950000.00',
        minYear: 2022,
        maxYear: 2022,
        minMileage: 32000,
        maxMileage: 32000,
        sort: 'mileageAsc',
      }).expect(200);
      expect(combined.body.total).toBe(1);
      expect(combined.body.items[0].id).toBe('SYN-TOY-001');
      const idMatch = await list({ q: 'aqua-007' }).expect(200);
      expect(idMatch.body.items[0].id).toBe('SYN-TOY-AQUA-007');

      const empty = await list({ q: '%' }).expect(200);
      expect(empty.body).toMatchObject({ total: 0, totalPages: 0, items: [] });
      const beyond = await list({ page: 3, pageSize: 8 }).expect(200);
      expect(beyond.body).toMatchObject({ total: 16, totalPages: 2, items: [] });
      const tied = await list({ sort: 'yearDesc', pageSize: 1, page: 2 }).expect(200);
      expect(tied.body.items[0].id).toBe('SYN-HON-002');

      for (const invalid of [
        { minPrice: '10', maxPrice: '5' },
        { minYear: 2023, maxYear: 2020 },
        { minMileage: 30000, maxMileage: 100 },
        { minMileage: '0x10' },
        { sort: 'invalid' },
        { page: 0 },
        { pageSize: 101 },
      ])
        await list(invalid as Record<string, string | number>).expect(400);

      const details = await request(app!.getHttpServer())
        .get('/api/v1/inventory/vehicles/SYN-TOY-001')
        .set('Cookie', cookie)
        .expect(200);
      expect(details.body).toMatchObject({
        id: 'SYN-TOY-001',
        make: 'Toyota',
        source: 'EXTERNAL_MYSQL',
      });

      const connectionUrl = `/api/v1/inventory/connections/${configuration.body.id}`;
      await request(app!.getHttpServer())
        .patch(connectionUrl)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({ mapping: { ...mapping, mileageField: null, bodyTypeField: null } })
        .expect(200);
      for (const action of ['test', 'activate']) {
        await request(app!.getHttpServer())
          .post(`${connectionUrl}/${action}`)
          .set('Cookie', cookie)
          .set('Origin', apiOrigin)
          .expect(201);
      }
      const partialMapping = await list({ q: 'missing-006' }).expect(200);
      expect(partialMapping.body.supportedFilters).not.toContain('mileage');
      expect(partialMapping.body.supportedFilters).not.toContain('bodyType');
      expect(partialMapping.body.items[0].mileage).toBeNull();
      await list({ minMileage: 0 }).expect(400);
      await list({ sort: 'mileageAsc' }).expect(400);
      await list({ bodyType: 'Sedan' }).expect(400);

      const events = await owner!.auditEvent.findMany({
        where: { tenantId: tenantAId, resourceId: configuration.body.id },
        select: { eventType: true },
      });
      expect(events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining([
          'inventory.connection.updated',
          'inventory.connection.tested',
          'inventory.connection.activated',
        ]),
      );
      await request(app!.getHttpServer())
        .post(`/api/v1/inventory/connections/${configuration.body.id}/deactivate`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .expect(201)
        .expect(({ body }) => expect(body.status).toBe('INACTIVE'));
    },
  );
});
