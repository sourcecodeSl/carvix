import { createHash, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { PrismaClient, PrismaPg } from '@aicrm/database';
import { RolePermissions } from '@aicrm/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { StaffRepository } from './staff.repository';

const enabled = process.env.RUN_POSTGRES_INTEGRATION === 'true';
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const authUrl = process.env.DATABASE_AUTH_URL;
const appUrl = process.env.DATABASE_APP_URL;
const apiOrigin = 'http://127.0.0.1:3000';
const password = 'Day5-Integration-Pass!2026';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);

describe.skipIf(!enabled)('staff management PostgreSQL integration', () => {
  let app: INestApplication | undefined;
  let owner: PrismaClient | undefined;
  let authRuntime: PrismaClient | undefined;
  let appRuntime: PrismaClient | undefined;
  let tenantA: { id: string } | undefined;
  let tenantB: { id: string } | undefined;
  let tenantC: { id: string } | undefined;
  let dealershipA: { id: string } | undefined;
  let dealershipB: { id: string } | undefined;
  let branchA: { id: string } | undefined;
  let branchB: { id: string } | undefined;
  let admin: { id: string; email: string } | undefined;
  let manager: { id: string; email: string } | undefined;
  let agent: { id: string; email: string } | undefined;
  let existingUser: { id: string; email: string } | undefined;
  let concurrentAdminA: { id: string; email: string } | undefined;
  let concurrentAdminB: { id: string; email: string } | undefined;
  let adminMembershipId: string | undefined;
  let managerMembershipId: string | undefined;
  let agentMembershipId: string | undefined;
  let concurrentMembershipA: string | undefined;
  let concurrentMembershipB: string | undefined;

  beforeAll(async () => {
    if (!migrationUrl || !authUrl || !appUrl) {
      throw new Error(
        'DATABASE_MIGRATION_URL, DATABASE_AUTH_URL, and DATABASE_APP_URL are required for staff integration tests',
      );
    }

    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: migrationUrl }) });
    authRuntime = new PrismaClient({ adapter: new PrismaPg({ connectionString: authUrl }) });
    appRuntime = new PrismaClient({ adapter: new PrismaPg({ connectionString: appUrl }) });

    tenantA = await owner.tenant.create({
      data: { name: `Day 5 Tenant A ${suffix}`, slug: `day5-${suffix}-a` },
      select: { id: true },
    });
    tenantB = await owner.tenant.create({
      data: { name: `Day 5 Tenant B ${suffix}`, slug: `day5-${suffix}-b` },
      select: { id: true },
    });
    tenantC = await owner.tenant.create({
      data: { name: `Day 5 Tenant C ${suffix}`, slug: `day5-${suffix}-c` },
      select: { id: true },
    });

    const userRows = await Promise.all([
      owner.user.create({
        data: {
          tenantId: tenantA.id,
          email: `dealer-admin-${suffix}@example.test`,
          name: 'Day 5 Dealer Admin',
        },
        select: { id: true, email: true },
      }),
      owner.user.create({
        data: {
          tenantId: tenantA.id,
          email: `sales-manager-${suffix}@example.test`,
          name: 'Day 5 Sales Manager',
        },
        select: { id: true, email: true },
      }),
      owner.user.create({
        data: {
          tenantId: tenantA.id,
          email: `sales-agent-${suffix}@example.test`,
          name: 'Day 5 Sales Agent',
        },
        select: { id: true, email: true },
      }),
      owner.user.create({
        data: {
          tenantId: tenantB.id,
          email: `existing-staff-${suffix}@example.test`,
          name: 'Existing Cross-Tenant Staff',
        },
        select: { id: true, email: true },
      }),
      owner.user.create({
        data: {
          tenantId: tenantC.id,
          email: `concurrent-admin-a-${suffix}@example.test`,
          name: 'Concurrent Admin A',
        },
        select: { id: true, email: true },
      }),
      owner.user.create({
        data: {
          tenantId: tenantC.id,
          email: `concurrent-admin-b-${suffix}@example.test`,
          name: 'Concurrent Admin B',
        },
        select: { id: true, email: true },
      }),
    ]);
    [admin, manager, agent, existingUser, concurrentAdminA, concurrentAdminB] = userRows;

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
        { userId: existingUser.id, tenantId: tenantB.id, role: 'SALES_AGENT', status: 'ACTIVE' },
        {
          userId: concurrentAdminA.id,
          tenantId: tenantC.id,
          role: 'DEALER_ADMIN',
          status: 'ACTIVE',
        },
        {
          userId: concurrentAdminB.id,
          tenantId: tenantC.id,
          role: 'DEALER_ADMIN',
          status: 'ACTIVE',
        },
      ],
    });
    const membershipRows = await owner.tenantMembership.findMany({
      where: { tenantId: { in: [tenantA.id, tenantC.id] } },
      select: { id: true, userId: true },
    });
    adminMembershipId = membershipRows.find((row) => row.userId === admin!.id)?.id;
    managerMembershipId = membershipRows.find((row) => row.userId === manager!.id)?.id;
    agentMembershipId = membershipRows.find((row) => row.userId === agent!.id)?.id;
    concurrentMembershipA = membershipRows.find((row) => row.userId === concurrentAdminA!.id)?.id;
    concurrentMembershipB = membershipRows.find((row) => row.userId === concurrentAdminB!.id)?.id;

    dealershipA = await owner.dealership.create({
      data: {
        tenantId: tenantA.id,
        businessName: `Day 5 Dealer A ${suffix}`,
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
        businessName: `Day 5 Dealer B ${suffix}`,
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
        name: 'Day 5 Alpha Branch',
        code: `A${suffix}`,
      },
      select: { id: true },
    });
    branchB = await owner.branch.create({
      data: {
        tenantId: tenantB.id,
        dealershipId: dealershipB.id,
        name: 'Day 5 Beta Branch',
        code: `B${suffix}`,
      },
      select: { id: true },
    });
    await owner.staffBranchAssignment.createMany({
      data: [managerMembershipId, agentMembershipId].map((membershipId) => ({
        tenantId: tenantA!.id,
        membershipId: membershipId!,
        branchId: branchA!.id,
        updatedAt: new Date(),
      })),
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const config = moduleRef.get(ConfigService);
    config.set('NODE_ENV', 'development');
    config.set('LOGIN_LIMIT_PER_MINUTE', 100);
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
    app.enableCors({ origin: config.getOrThrow<string[]>('CORS_ORIGINS'), credentials: true });
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
    if (owner) {
      const tenantIds = [tenantA?.id, tenantB?.id, tenantC?.id].filter((id): id is string =>
        Boolean(id),
      );
      const dealershipIds = [dealershipA?.id, dealershipB?.id].filter((id): id is string =>
        Boolean(id),
      );
      const userIds = [
        admin?.id,
        manager?.id,
        agent?.id,
        existingUser?.id,
        concurrentAdminA?.id,
        concurrentAdminB?.id,
      ].filter((id): id is string => Boolean(id));
      await owner.$transaction(async (transaction) => {
        await transaction.authSession.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.staffInvitationBranch.deleteMany({
          where: { tenantId: { in: tenantIds } },
        });
        await transaction.staffInvitation.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await transaction.staffBranchAssignment.deleteMany({
          where: { tenantId: { in: tenantIds } },
        });
        await transaction.branch.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await transaction.dealership.deleteMany({ where: { id: { in: dealershipIds } } });
        await transaction.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await transaction.passwordCredential.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.passwordCredential.deleteMany({
          where: { user: { is: { tenantId: { in: tenantIds } } } },
        });
        await transaction.user.deleteMany({
          where: {
            OR: [{ id: { in: userIds } }, { tenantId: { in: tenantIds } }],
          },
        });
        await transaction.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      });
    }
    await Promise.all([
      owner?.$disconnect(),
      authRuntime?.$disconnect(),
      appRuntime?.$disconnect(),
    ]);
  }, 30000);

  async function signIn(email: string, passwordOverride = password): Promise<string> {
    const response = await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', apiOrigin)
      .send({ email, password: passwordOverride })
      .expect(200);
    const setCookies = response.headers['set-cookie'];
    const cookie = (Array.isArray(setCookies) ? setCookies : [setCookies])
      .find((value) => value.startsWith('aicrm_session='))
      ?.split(';')[0];
    if (!cookie) throw new Error('Expected the login endpoint to set a session cookie');
    return cookie;
  }

  it('limits directory data to the active tenant and applies role-specific visibility', async () => {
    const adminCookie = await signIn(admin!.email);
    const adminPage = await request(app!.getHttpServer())
      .get('/api/v1/staff?page=1&pageSize=1')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(adminPage.body.items).toHaveLength(1);
    expect(adminPage.body.total).toBe(3);
    expect(adminPage.body.items[0]).toHaveProperty('email');

    const first = await request(app!.getHttpServer())
      .get('/api/v1/staff?page=1&pageSize=20')
      .set('Cookie', adminCookie)
      .expect(200);
    const second = await request(app!.getHttpServer())
      .get('/api/v1/staff?page=1&pageSize=20')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(first.body.items.map((item: { id: string }) => item.id)).toEqual(
      second.body.items.map((item: { id: string }) => item.id),
    );

    const managerCookie = await signIn(manager!.email);
    const managerPage = await request(app!.getHttpServer())
      .get('/api/v1/staff?q=Day%205')
      .set('Cookie', managerCookie)
      .expect(200);
    expect(managerPage.body.items.length).toBeGreaterThan(0);
    expect(managerPage.body.items[0]).not.toHaveProperty('email');
    await request(app!.getHttpServer())
      .get(`/api/v1/staff/members/${adminMembershipId}`)
      .set('Cookie', managerCookie)
      .expect(200)
      .expect(({ body }) => expect(body).not.toHaveProperty('email'));

    await request(app!.getHttpServer())
      .get('/api/v1/staff')
      .set('Cookie', await signIn(agent!.email))
      .expect(403);
    await request(app!.getHttpServer())
      .get(`/api/v1/staff/members/${adminMembershipId}`)
      .set('Cookie', adminCookie)
      .expect(200);
  });

  it('updates roles, status, and assignments while enforcing tenant and CSRF boundaries', async () => {
    const cookie = await signIn(admin!.email);
    await request(app!.getHttpServer())
      .patch(`/api/v1/staff/members/${managerMembershipId}/role`)
      .set('Cookie', cookie)
      .set('Origin', 'https://attacker.example')
      .send({ role: 'SALES_AGENT' })
      .expect(403);

    await request(app!.getHttpServer())
      .patch(`/api/v1/staff/members/${managerMembershipId}/role`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ role: 'DEALER_ADMIN' })
      .expect(400);

    await request(app!.getHttpServer())
      .patch(`/api/v1/staff/members/${managerMembershipId}/role`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ role: 'SALES_AGENT' })
      .expect(200)
      .expect(({ body }) => expect(body.role).toBe('SALES_AGENT'));

    await request(app!.getHttpServer())
      .patch(`/api/v1/staff/members/${managerMembershipId}/role`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ role: 'SALES_MANAGER' })
      .expect(200);

    await request(app!.getHttpServer())
      .put(`/api/v1/staff/members/${agentMembershipId}/branches`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ branchIds: [branchB!.id] })
      .expect(400);
    await request(app!.getHttpServer())
      .put(`/api/v1/staff/members/${agentMembershipId}/branches`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ branchIds: [branchA!.id] })
      .expect(200)
      .expect(({ body }) =>
        expect(body.branches.map((branch: { id: string }) => branch.id)).toEqual([branchA!.id]),
      );

    const agentCookie = await signIn(agent!.email);
    const managerCookie = await signIn(manager!.email);
    const visibleBranches = await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(visibleBranches.body.map((branch: { id: string }) => branch.id)).toEqual([branchA!.id]);

    await request(app!.getHttpServer())
      .patch(`/api/v1/staff/members/${agentMembershipId}/status`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ status: 'SUSPENDED' })
      .expect(200);
    await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', agentCookie)
      .expect(403);
    await request(app!.getHttpServer())
      .patch(`/api/v1/staff/members/${agentMembershipId}/status`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ status: 'ACTIVE' })
      .expect(200);
  });

  it('creates hashed development invitations and accepts both new and existing identities once', async () => {
    const adminCookie = await signIn(admin!.email);
    const createInvitation = (email: string) =>
      request(app!.getHttpServer())
        .post('/api/v1/staff/invitations')
        .set('Cookie', adminCookie)
        .set('Origin', apiOrigin)
        .send({ email, role: 'SALES_AGENT', branchIds: [branchA!.id] });

    const created = await createInvitation(`new-staff-${suffix}@example.test`).expect(201);
    const previewUrl = created.body.previewUrl as string;
    const newToken = new URL(previewUrl).hash.slice(1);
    const newTokenHash = createHash('sha256').update(newToken).digest('hex');
    const stored = await owner!.staffInvitation.findUnique({
      where: { tokenHash: newTokenHash },
      select: { tokenHash: true, status: true },
    });
    expect(stored?.tokenHash).toBe(newTokenHash);
    expect(stored?.tokenHash).not.toBe(newToken);

    const listed = await request(app!.getHttpServer())
      .get('/api/v1/staff/invitations')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(listed.body.items[0]).not.toHaveProperty('tokenHash');
    expect(listed.body.items[0]).not.toHaveProperty('previewUrl');
    expect(listed.body.items[0]).not.toHaveProperty('token');

    const managerCookie = await signIn(manager!.email);
    await request(app!.getHttpServer())
      .post('/api/v1/staff/invitations')
      .set('Cookie', managerCookie)
      .set('Origin', apiOrigin)
      .send({ email: `forbidden-${suffix}@example.test`, role: 'SALES_AGENT' })
      .expect(403);

    const inviteExisting = await createInvitation(existingUser!.email).expect(201);
    const existingToken = new URL(inviteExisting.body.previewUrl as string).hash.slice(1);
    await request(app!.getHttpServer())
      .post('/api/v1/invitations/validate')
      .set('Origin', apiOrigin)
      .send({ token: existingToken })
      .expect(200)
      .expect(({ body }) => expect(body.email).toBe(existingUser!.email));
    await request(app!.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('Cookie', adminCookie)
      .set('Origin', apiOrigin)
      .send({ token: existingToken })
      .expect(403);

    const existingCookie = await signIn(existingUser!.email);
    const acceptedExisting = await request(app!.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('Cookie', existingCookie)
      .set('Origin', apiOrigin)
      .send({ token: existingToken })
      .expect(200);
    expect(acceptedExisting.body.tenantId).toBe(tenantA!.id);
    await request(app!.getHttpServer())
      .post('/api/v1/auth/active-tenant')
      .set('Cookie', existingCookie)
      .set('Origin', apiOrigin)
      .send({ tenantId: tenantA!.id })
      .expect(200);

    const acceptedNew = await request(app!.getHttpServer())
      .post('/api/v1/invitations/accept-new')
      .set('Origin', apiOrigin)
      .send({
        token: newToken,
        name: 'New Day 5 Staff',
        password: 'Day5-New-Staff-Pass!2026',
      })
      .expect(200);
    expect(acceptedNew.body.tenantId).toBe(tenantA!.id);
    await request(app!.getHttpServer())
      .post('/api/v1/invitations/accept-new')
      .set('Origin', apiOrigin)
      .send({
        token: newToken,
        name: 'Replay Attempt',
        password: 'Day5-New-Staff-Pass!2026',
      })
      .expect(404);

    const newEmail = `new-staff-${suffix}@example.test`;
    const acceptedUser = await owner!.user.findFirst({
      where: { email: newEmail },
      select: { id: true, status: true },
    });
    expect(acceptedUser?.status).toBe('ACTIVE');
    const acceptedMembership = await owner!.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: acceptedUser!.id, tenantId: tenantA!.id } },
      select: { status: true, role: true },
    });
    expect(acceptedMembership).toEqual({ status: 'ACTIVE', role: 'SALES_AGENT' });

    const newCookie = await signIn(newEmail, 'Day5-New-Staff-Pass!2026');
    const newBranches = await request(app!.getHttpServer())
      .get(`/api/v1/dealerships/${dealershipA!.id}/branches`)
      .set('Cookie', newCookie)
      .expect(200);
    expect(newBranches.body.map((branch: { id: string }) => branch.id)).toEqual([branchA!.id]);
  });

  it('rejects unsafe origins, cancels and expires invitations, and disables production previews', async () => {
    const cookie = await signIn(admin!.email);
    const email = `cancelled-${suffix}@example.test`;
    await request(app!.getHttpServer())
      .post('/api/v1/staff/invitations')
      .set('Cookie', cookie)
      .set('Origin', 'https://attacker.example')
      .send({ email, role: 'SALES_AGENT' })
      .expect(403);

    const created = await request(app!.getHttpServer())
      .post('/api/v1/staff/invitations')
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ email, role: 'SALES_AGENT' })
      .expect(201);
    const token = new URL(created.body.previewUrl as string).hash.slice(1);
    await request(app!.getHttpServer())
      .patch(`/api/v1/staff/invitations/${created.body.invitation.id}/cancel`)
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('CANCELLED'));
    await request(app!.getHttpServer())
      .post('/api/v1/invitations/validate')
      .set('Origin', apiOrigin)
      .send({ token })
      .expect(404);

    const expiring = await request(app!.getHttpServer())
      .post('/api/v1/staff/invitations')
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ email: `expired-${suffix}@example.test`, role: 'SALES_MANAGER' })
      .expect(201);
    await owner!.staffInvitation.update({
      where: { id: expiring.body.invitation.id as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app!.getHttpServer())
      .post('/api/v1/invitations/validate')
      .set('Origin', apiOrigin)
      .send({ token: new URL(expiring.body.previewUrl as string).hash.slice(1) })
      .expect(404);
    const expiredList = await request(app!.getHttpServer())
      .get('/api/v1/staff/invitations?status=EXPIRED')
      .set('Cookie', cookie)
      .expect(200);
    expect(
      expiredList.body.items.some(
        (item: { id: string }) => item.id === expiring.body.invitation.id,
      ),
    ).toBe(true);

    const limited = await request(app!.getHttpServer())
      .post('/api/v1/staff/invitations')
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ email: `limited-${suffix}@example.test`, role: 'SALES_AGENT' })
      .expect(201);
    const limitedToken = new URL(limited.body.previewUrl as string).hash.slice(1);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app!.getHttpServer())
        .post('/api/v1/invitations/validate')
        .set('Origin', apiOrigin)
        .send({ token: limitedToken })
        .expect(200);
    }
    await request(app!.getHttpServer())
      .post('/api/v1/invitations/validate')
      .set('Origin', apiOrigin)
      .send({ token: limitedToken })
      .expect(429);

    const config = app!.get(ConfigService);
    config.set('NODE_ENV', 'production');
    await request(app!.getHttpServer())
      .post('/api/v1/staff/invitations')
      .set('Cookie', cookie)
      .set('Origin', apiOrigin)
      .send({ email: `production-${suffix}@example.test`, role: 'SALES_AGENT' })
      .expect(503);
    config.set('NODE_ENV', 'development');
  });

  it('serializes concurrent admin changes and retains at least one active administrator', async () => {
    const staff = app!.get(StaffRepository);
    const contextA = {
      kind: 'tenant' as const,
      tenantId: tenantC!.id,
      userId: concurrentAdminA!.id,
      membershipId: concurrentMembershipA!,
      permissions: RolePermissions.DEALER_ADMIN,
    };
    const contextB = {
      kind: 'tenant' as const,
      tenantId: tenantC!.id,
      userId: concurrentAdminB!.id,
      membershipId: concurrentMembershipB!,
      permissions: RolePermissions.DEALER_ADMIN,
    };
    const outcomes = await Promise.allSettled([
      staff.updateStatus(contextA, concurrentMembershipB!, 'SUSPENDED'),
      staff.updateStatus(contextB, concurrentMembershipA!, 'SUSPENDED'),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const activeAdmins = await owner!.tenantMembership.count({
      where: { tenantId: tenantC!.id, role: 'DEALER_ADMIN', status: 'ACTIVE' },
    });
    expect(activeAdmins).toBe(1);
  });

  it('proves RLS fail-closed behavior and least-privilege invitation helper grants', async () => {
    await expect(
      authRuntime!.$queryRaw`SELECT id FROM public.staff_invitations LIMIT 1`,
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { code: '42501' } } },
    });
    const invalid = await authRuntime!.$queryRaw<Array<{ invitation_id: string }>>`
      SELECT * FROM public.staff_resolve_invitation('invalid')
    `;
    expect(invalid).toHaveLength(0);
    await expect(
      appRuntime!.$queryRaw`SELECT * FROM public.staff_resolve_invitation('invalid')`,
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { code: '42501' } } },
    });
    await expect(
      appRuntime!.$queryRaw`SELECT password_hash FROM public.password_credentials LIMIT 1`,
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { code: '42501' } } },
    });

    const emptyContext = await appRuntime!.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "aicrm_app"`;
      await transaction.$executeRaw`SELECT set_config('app.tenant_id', '', true)`;
      const invitations = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM public.staff_invitations
        UNION ALL
        SELECT id FROM public.staff_branch_assignments
      `;
      const users = await transaction.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.users`;
      return { invitations, users };
    });
    expect(emptyContext.invitations).toHaveLength(0);
    expect(emptyContext.users).toHaveLength(0);

    const invalidCredential = await appRuntime!.$queryRaw<Array<{ created: boolean }>>`
      SELECT public.staff_create_invited_password_credential(
        ${randomUUID()}::uuid,
        '$argon2id$v=19$m=19456,t=3,p=1$YWJjZA$YWJjZA'
      ) AS created
    `;
    expect(invalidCredential[0]?.created).toBe(false);

    const roles = await owner!.$queryRaw<
      Array<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
      }>
    >`
      SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
      FROM pg_roles
      WHERE rolname IN ('aicrm_auth_runtime', 'aicrm_app_runtime')
    `;
    expect(roles).toHaveLength(2);
    for (const role of roles) {
      expect(role.rolsuper).toBe(false);
      expect(role.rolbypassrls).toBe(false);
      expect(role.rolcreatedb).toBe(false);
      expect(role.rolcreaterole).toBe(false);
    }

    const functions = await owner!.$queryRaw<
      Array<{
        prosecdef: boolean;
        owner: string;
        configuration: string;
        public_execute_revoked: boolean;
      }>
    >`
      SELECT p.prosecdef,
             pg_get_userbyid(p.proowner) AS owner,
             COALESCE(array_to_string(p.proconfig, ','), '') AS configuration,
             NOT EXISTS (
               SELECT 1
               FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
               WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
             ) AS public_execute_revoked
      FROM pg_proc AS p
      WHERE p.oid IN (
        'public.staff_resolve_invitation(text)'::regprocedure,
        'public.staff_create_invited_password_credential(uuid,text)'::regprocedure
      )
    `;
    expect(functions).toHaveLength(2);
    const migrationOwner = await owner!.$queryRaw<Array<{ owner: string }>>`
      SELECT current_user AS owner
    `;
    for (const fn of functions) {
      expect(fn.prosecdef).toBe(true);
      expect(fn.owner).toBe(migrationOwner[0]?.owner);
      expect(fn.configuration).toContain('search_path=pg_catalog, public');
      expect(fn.public_execute_revoked).toBe(true);
    }
    const functionGrants = await owner!.$queryRaw<
      Array<{
        auth_can_resolve: boolean;
        app_can_resolve: boolean;
        app_can_create_credential: boolean;
      }>
    >`
      SELECT has_function_privilege(
               'aicrm_auth_runtime',
               'public.staff_resolve_invitation(text)',
               'EXECUTE'
             ) AS auth_can_resolve,
             has_function_privilege(
               'aicrm_app_runtime',
               'public.staff_resolve_invitation(text)',
               'EXECUTE'
             ) AS app_can_resolve,
             has_function_privilege(
               'aicrm_app_runtime',
               'public.staff_create_invited_password_credential(uuid,text)',
               'EXECUTE'
             ) AS app_can_create_credential
    `;
    expect(functionGrants[0]).toEqual({
      auth_can_resolve: true,
      app_can_resolve: false,
      app_can_create_credential: true,
    });
  });
});
