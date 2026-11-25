import { readFileSync } from 'node:fs';
import * as argon2 from 'argon2';
import { PrismaPg, PrismaClient } from '@aicrm/database';

function readHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    if (!process.stdin.isTTY) {
      resolve(readFileSync(0, 'utf8').trim());
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode?.(true);
    let value = '';
    process.stdin.on('data', (character) => {
      const key = character.toString();
      if (key === '\u0003') process.exit(130);
      if (key === '\r' || key === '\n') {
        process.stdin.setRawMode?.(false);
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (key === '\u0008' || key === '\u007f') {
        value = value.slice(0, -1);
        return;
      }
      value += key;
    });
  });
}

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

if (process.env.NODE_ENV !== 'development') {
  throw new Error('Local user provisioning is only allowed in NODE_ENV=development');
}

const email = getArg('--email')?.trim().toLowerCase();
const name = getArg('--name')?.trim();
const tenantSlug = getArg('--tenant');
const role = getArg('--role');
const superAdmin = args.includes('--super-admin');

if (!email || !name) throw new Error('Required: --email and --name');
if (
  !superAdmin &&
  (!tenantSlug || !['DEALER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'].includes(role))
) {
  throw new Error('Required: --tenant and --role for tenant membership');
}

const password = await readHidden('Password (12+ characters): ');
if (password.length < 12) throw new Error('Password must be at least 12 characters');

const connectionString = process.env.DATABASE_MIGRATION_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATION_URL is required');
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

try {
  const passwordHash = await argon2.hash(password, {
    memoryCost: 19456,
    timeCost: 3,
    parallelism: 1,
  });

  await prisma.$transaction(async (transaction) => {
    let tenant = null;
    if (tenantSlug) {
      tenant = await transaction.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);
    }

    let user = await transaction.user.findFirst({ where: { email } });
    if (user) {
      user = await transaction.user.update({
        where: { id: user.id },
        data: {
          name,
          status: 'ACTIVE',
          ...(tenant && !user.tenantId ? { tenantId: tenant.id } : {}),
        },
      });
    } else {
      user = await transaction.user.create({
        data: { email, name, status: 'ACTIVE', tenantId: tenant?.id ?? null },
      });
    }

    await transaction.passwordCredential.upsert({
      where: { userId: user.id },
      update: { passwordHash, passwordChangedAt: new Date() },
      create: { userId: user.id, passwordHash },
    });

    if (tenant) {
      await transaction.tenantMembership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        update: { role, status: 'ACTIVE' },
        create: { userId: user.id, tenantId: tenant.id, role, status: 'ACTIVE' },
      });
    }

    if (superAdmin) {
      await transaction.platformAdministrator.upsert({
        where: { userId: user.id },
        update: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
        create: { userId: user.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
    }
  });
  process.stdout.write(`Provisioned active development user: ${email}\n`);
} finally {
  await prisma.$disconnect();
}
