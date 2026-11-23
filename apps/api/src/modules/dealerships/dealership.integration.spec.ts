import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { PrismaClient, PrismaPg } from '@aicrm/database';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

const enabled = process.env.RUN_POSTGRES_INTEGRATION === 'true';
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const appUrl = process.env.DATABASE_APP_URL;
const apiOrigin = 'http://127.0.0.1:3000';
const password = 'Day4-Integration-Pass!2026';
const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);

describe.skipIf(!enabled)('dealership and branch management HTTP integration', () => {
  let app: INestApplication | undefined;
  let owner: PrismaClient | undefined;
  let runtime: PrismaClient | undefined;
  let tenantA: { id: string; slug: string } | undefined;
  let tenantB: { id: string; slug: string } | undefined;
  let dealershipA: { id: string } | undefined;
  let dealershipB: { id: string } | undefined;
  let branchA: { id: string } | undefined;
  let branchB: { id: string } | undefined;
  let admin: { id: string; email: string } | undefined;
  let manager: { id: string; email: string } | undefined;
  let agent: { id: string; email: string } | undefined;
  let platformAdmin: { id: string; email: string } | undefined;

  beforeAll(async () => {
    if (!migrationUrl || !appUrl) {
      throw new Error(
        'DATABASE_MIGRATION_URL and DATABASE_APP_URL are required for dealership integration tests',
      );
    }

    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: migrationUrl }) });
    runtime = new PrismaClient({ adapter: new PrismaPg({ connectionString: appUrl }) });

    tenantA = await owner.tenant.create({
      data: { name: `Day 4 Tenant A ${suffix}`, slug: `day4-${suffix}-a`, status: 'ACTIVE' },
      select: { id: true, slug: true },
    });
    tenantB = await owner.tenant.create({
      data: { name: `Day 4 Tenant B ${suffix}`, slug: `day4-${suffix}-b`, status: 'ACTIVE' },
      select: { id: true, slug: true },
    });

    const userRows = await Promise.all([
      owner.user.create({
        data: {
          tenantId: tenantA.id,
          email: `dealer-admin-${suffix}@example.test`,
          name: 'Day 4 Dealer Admin',
          status: 'ACTIVE',
        },
        select: { id: true, email: true },
      }),
      owner.user.create({
        data: {
          tenantId: tenantA.id,
          email: `sales-manager-${suffix}@example.test`,
          name: 'Day 4 Sales Manager',
          status: 'ACTIVE',
        },
        select: { id: true, email: true },
      }),
      owner.user.create({
        data: {
          tenantId: tenantA.id,
          email: `sales-agent-${suffix}@example.test`,
          name: 'Day 4 Sales Agent',
          status: 'ACTIVE',
        },
        select: { id: true, email: true },
      }),
      owner.user.create({
        data: {
          email: `platform-admin-${suffix}@example.test`,
          name: 'Day 4 Platform Admin',
          status: 'ACTIVE',
        },
        select: { id: true, email: true },
      }),
    ]);
    [admin, manager, agent, platformAdmin] = userRows;

    const passwordHash = await argon2.hash(password, {
      memoryCost: 19456,
      timeCost: 3,
      parallelism: 1,
    });
    await owner.passwordCredential.createMany({
      data: userRows.map((user) => ({ userId: user.id, passwordHash })),
    });
    await owner.tenantMembership.createMany({
      data: [
        { userId: admin.id, tenantId: tenantA.id, role: 'DEALER_ADMIN', status: 'ACTIVE' },
        { userId: manager.id, tenantId: tenantA.id, role: 'SALES_MANAGER', status: 'ACTIVE' },
        { userId: agent.id, tenantId: tenantA.id, role: 'SALES_AGENT', status: 'ACTIVE' },
      ],
    });
    await owner.platformAdministrator.create({
      data: { userId: platformAdmin.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });

    dealershipA = await owner.dealership.create({
      data: {
        tenantId: tenantA.id,
        businessName: `Day 4 Dealer A ${suffix}`,
        contactEmail: `dealer-a-${suffix}@example.test`,
        country: 'Sri Lanka',
        timezone: 'Asia/Colombo',
        currency: 'LKR',
      },
      select: { id: true },
    });
    dealershipB = await owner.dealership.create({
      data: {
        tenantId: tenantB.id,
        businessName: `Day 4 Dealer B ${suffix}`,
        contactEmail: `dealer-b-${suffix}@example.test`,
        country: 'Sri Lanka',
        timezone: 'Asia/Colombo',
        currency: 'LKR',
      },
      select: { id: true },
    });
    branchA = await owner.branch.create({
      data: {
        tenantId: tenantA.id,
        dealershipId: dealershipA.id,
        name: 'Alpha Office',
        code: 'ALPHA',
      },
      select: { id: true },
    });
    branchB = await owner.branch.create({
      data: {
        tenantId: tenantB.id,
        dealershipId: dealershipB.id,
        name: 'Bravo Office',
        code: 'BRAVO',
      },
      select: { id: true },
    });
    const assignedMemberships = await owner.tenantMembership.findMany({
      where: { tenantId: tenantA.id, userId: { in: [manager.id, agent.id] } },
      select: { id: true },
    });
    await owner.staffBranchAssignment.createMany({
      data: assignedMemberships.map((membership) => ({
        tenantId: tenantA!.id,
        membershipId: membership.id,
        branchId: branchA!.id,
        updatedAt: new Date(),
      })),
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    moduleRef.get(ConfigService).set('LOGIN_LIMIT_PER_MINUTE', 100);
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    const config = app.get(ConfigService);
    app.enableCors({ origin: config.getOrThrow<string[]>('CORS_ORIGINS'), credentials: true });
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
    if (owner) {
      const tenantIds = [tenantA?.id, tenantB?.id].filter((id): id is string => Boolean(id));
      const dealershipIds = [dealershipA?.id, dealershipB?.id].filter((id): id is string =>
        Boolean(id),
      );
      const userIds = [admin?.id, manager?.id, agent?.id, platformAdmin?.id].filter(
        (id): id is string => Boolean(id),
      );
      await owner.$transaction(async (transaction) => {
        await transaction.authSession.deleteMany({
          where: { userId: { in: userIds } },
        });
        await transaction.staffBranchAssignment.deleteMany({
          where: { tenantId: { in: tenantIds } },
        });
        await transaction.branch.deleteMany({
          where: { dealershipId: { in: dealershipIds } },
        });
        await transaction.dealership.deleteMany({
          where: { tenantId: { in: tenantIds } },
        });
        await transaction.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await transaction.platformAdministrator.deleteMany({
          where: { userId: { in: userIds } },
        });
        await transaction.passwordCredential.deleteMany({
          where: { userId: { in: userIds } },
        });
        await transaction.user.deleteMany({ where: { id: { in: userIds } } });
        if (tenantIds.length > 0) {
          await transaction.tenant.deleteMany({ where: { id: { in: tenantIds } } });
        }
      });
    }
    await runtime?.$disconnect();
    await owner?.$disconnect();
  }, 30000);

  async function signIn(email: string): Promise<string> {
    const response = await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', apiOrigin)
      .send({ email, password })
      .expect(200);
    const setCookies = response.headers['set-cookie'];
    const cookie = (Array.isArray(setCookies) ? setCookies : [setCookies])
      .find((value) => value.startsWith('aicrm_session='))
      ?.split(';')[0];
    if (!cookie) throw new Error('Expected the login endpoint to set a session cookie');
    return cookie;
  }

  it('rejects unauthenticated dealership and branch requests', async () => {
    await request(app!.getHttpServer()).get('/api/v1/dealerships').expect(401);
    await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .expect(401);
    await request(app!.getHttpServer())
      .post(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .send({ name: 'Unauthorized', code: 'NOPE' })
      .expect(401);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}`)
      .send({ businessName: 'Unauthorized' })
      .expect(401);
  });

  it('scopes dealership and branch access to the active tenant', async () => {
    const cookie = await signIn(admin!.email);
    const list = await request(app!.getHttpServer())
      .get('/api/v1/dealerships')
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(dealershipA!.id);
    expect(list.body[0]).not.toHaveProperty('tenantId');

    await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipB!.id}`)
      .set('Cookie', cookie)
      .expect(404);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipB!.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ businessName: 'Cross tenant update' })
      .expect(404);
    await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipB!.id}/branches`)
      .set('Cookie', cookie)
      .expect(404);
    await request(app!.getHttpServer())
      .post(`/api/v1/dealerships/${dealershipB!.id}/branches`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ name: 'Cross tenant', code: 'CROSS' })
      .expect(404);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipB!.id}/branches/${branchB!.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ name: 'Cross tenant update' })
      .expect(404);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipB!.id}/branches/${branchB!.id}/status`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ status: 'INACTIVE' })
      .expect(404);

    const branches = await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', cookie)
      .expect(200);
    expect(branches.body).toHaveLength(1);
    expect(branches.body[0].id).toBe(branchA!.id);
    await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipA!.id}/branches/${branchA!.id}`)
      .set('Cookie', cookie)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(branchA!.id));
    await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipA!.id}/branches/${branchB!.id}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('validates dealership updates and keeps ownership fields immutable', async () => {
    const cookie = await signIn(admin!.email);
    const updated = await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({
        businessName: `Updated Dealer A ${suffix}`,
        contactEmail: `updated-${suffix}@example.test`,
        contactPhone: '011 555 0100',
        timezone: 'Asia/Colombo',
      })
      .expect(200);
    expect(updated.body.businessName).toBe(`Updated Dealer A ${suffix}`);
    expect(updated.body.contactEmail).toBe(`updated-${suffix}@example.test`);

    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ contactEmail: 'not-an-email' })
      .expect(400);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ timezone: 'not/a-real-timezone' })
      .expect(400);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ businessName: 'x'.repeat(161) })
      .expect(400);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ tenantId: tenantB!.id })
      .expect(400);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({})
      .expect(400);
    await request(app!.getHttpServer())
      .get('/api/v1/dealerships/not-a-uuid')
      .set('Cookie', cookie)
      .expect(400);
    await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${crypto.randomUUID()}`)
      .set('Cookie', cookie)
      .expect(404);

    const stored = await owner!.dealership.findUniqueOrThrow({
      where: { id: dealershipA!.id },
    });
    expect(stored.tenantId).toBe(tenantA!.id);
    expect(stored.businessName).toBe(`Updated Dealer A ${suffix}`);
  });

  it('creates, edits, deactivates, and reactivates branches without deleting history', async () => {
    const cookie = await signIn(admin!.email);
    const created = await request(app!.getHttpServer())
      .post(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({
        name: 'Kandy Office',
        code: 'kandy-01',
        address: '12 Main Street',
        city: 'Kandy',
        phone: '081 555 0200',
      })
      .expect(201);
    expect(created.body.code).toBe('KANDY-01');
    expect(created.body.status).toBe('ACTIVE');

    const dealershipBeforeBranchUpdate = await owner!.dealership.findUniqueOrThrow({
      where: { id: dealershipA!.id },
    });
    await request(app!.getHttpServer())
      .post(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ name: 'Duplicate code', code: 'kandy-01' })
      .expect(409);
    await request(app!.getHttpServer())
      .post(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({})
      .expect(400);
    await request(app!.getHttpServer())
      .post(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ name: 'x'.repeat(121), code: 'TOO-LONG' })
      .expect(400);
    await request(app!.getHttpServer())
      .post(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ name: 'Forged owner', code: 'FORGED', tenantId: tenantB!.id })
      .expect(400);
    await request(app!.getHttpServer())
      .post(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', cookie)
      .set('Origin', 'https://attacker.example')
      .send({ name: 'Cross origin', code: 'CSRF' })
      .expect(403);

    const edited = await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}/branches/${created.body.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ name: 'Kandy City Office', code: 'kandy-02', city: 'Kandy City' })
      .expect(200);
    expect(edited.body.name).toBe('Kandy City Office');
    expect(edited.body.code).toBe('KANDY-02');
    expect(edited.body).not.toHaveProperty('tenantId');

    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}/branches/${created.body.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({})
      .expect(400);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}/branches/${created.body.id}`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ dealershipId: dealershipB!.id })
      .expect(400);
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}/branches/${created.body.id}/status`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ status: 'ARCHIVED' })
      .expect(400);

    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}/branches/${created.body.id}/status`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ status: 'INACTIVE' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('INACTIVE'));
    await request(app!.getHttpServer())
      .patch(`/api/v1/dealerships/${dealershipA!.id}/branches/${created.body.id}/status`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ status: 'ACTIVE' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ACTIVE'));

    const persisted = await owner!.branch.findUniqueOrThrow({ where: { id: created.body.id } });
    const dealershipAfterBranchUpdate = await owner!.dealership.findUniqueOrThrow({
      where: { id: dealershipA!.id },
    });
    expect(persisted.tenantId).toBe(tenantA!.id);
    expect(persisted.dealershipId).toBe(dealershipA!.id);
    expect(persisted.status).toBe('ACTIVE');
    expect(dealershipAfterBranchUpdate.updatedAt).toEqual(dealershipBeforeBranchUpdate.updatedAt);
    expect(await owner!.branch.count({ where: { id: created.body.id } })).toBe(1);
  });

  it('enforces the read-only Sales Manager and Sales Agent permission matrix', async () => {
    const managerCookie = await signIn(manager!.email);
    const agentCookie = await signIn(agent!.email);

    for (const cookie of [managerCookie, agentCookie]) {
      await request(app!.getHttpServer())
        .get(`/api/v1/dealerships/${dealershipA!.id}`)
        .set('Cookie', cookie)
        .expect(200);
      await request(app!.getHttpServer())
        .get(`/api/v1/dealerships/${dealershipA!.id}/branches`)
        .set('Cookie', cookie)
        .expect(200);
      await request(app!.getHttpServer())
        .patch(`/api/v1/dealerships/${dealershipA!.id}`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({ businessName: 'Read-only role attempted update' })
        .expect(403);
      await request(app!.getHttpServer())
        .post(`/api/v1/dealerships/${dealershipA!.id}/branches`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({ name: 'Read-only role', code: 'READONLY' })
        .expect(403);
      await request(app!.getHttpServer())
        .patch(`/api/v1/dealerships/${dealershipA!.id}/branches/${branchA!.id}`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({ name: 'Read-only role attempted branch update' })
        .expect(403);
      await request(app!.getHttpServer())
        .patch(`/api/v1/dealerships/${dealershipA!.id}/branches/${branchA!.id}/status`)
        .set('Cookie', cookie)
        .set('Origin', apiOrigin)
        .send({ status: 'INACTIVE' })
        .expect(403);
    }

    const platformCookie = await signIn(platformAdmin!.email);
    await request(app!.getHttpServer())
      .get('/api/v1/dealerships')
      .set('Cookie', platformCookie)
      .expect(403);
    await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', platformCookie)
      .expect(403);
  });

  it('keeps tenant RLS fail-closed and rejects cross-tenant foreign keys', async () => {
    await expect(
      owner!.branch.create({
        data: {
          tenantId: tenantA!.id,
          dealershipId: dealershipB!.id,
          name: 'Invalid cross-tenant link',
          code: `FK-${suffix}`,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await runtime!.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "aicrm_app"`;
      await transaction.$executeRaw`SELECT set_config('app.tenant_id', '', true)`;
      expect(await transaction.dealership.count()).toBe(0);
      expect(await transaction.branch.count()).toBe(0);
    });

    await runtime!.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "aicrm_app"`;
      await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA!.id}, true)`;
      expect(await transaction.dealership.count()).toBe(1);
      expect(await transaction.branch.findMany({ where: { id: branchB!.id } })).toHaveLength(0);
      expect(
        await transaction.branch.updateMany({
          where: { id: branchB!.id },
          data: { name: 'Must not update' },
        }),
      ).toMatchObject({ count: 0 });
    });
  });
});
