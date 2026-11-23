import { PrismaPg, PrismaClient } from '@aicrm/database';

const allowedArguments = new Set([
  '--tenant',
  '--name',
  '--email',
  '--country',
  '--timezone',
  '--currency',
  '--phone',
]);
const values = new Map();
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 2) {
  const key = args[index];
  const value = args[index + 1];
  if (!allowedArguments.has(key) || !value || value.startsWith('--')) {
    throw new Error(`Invalid or incomplete argument: ${key ?? ''}`);
  }
  if (values.has(key)) throw new Error(`Argument may only be specified once: ${key}`);
  values.set(key, value);
}

if (process.env.NODE_ENV !== 'development') {
  throw new Error('Dealership provisioning is only allowed in NODE_ENV=development');
}

const tenantSlug = values.get('--tenant')?.trim();
const businessName = values.get('--name')?.trim();
const contactEmail = values.get('--email')?.trim().toLowerCase();
const country = values.get('--country')?.trim();
const timezone = values.get('--timezone')?.trim();
const currency = values.get('--currency')?.trim().toUpperCase();
const contactPhone = values.get('--phone')?.trim() || null;

if (!tenantSlug || !businessName || !contactEmail || !country || !timezone || !currency) {
  throw new Error(
    'Required: --tenant, --name, --email, --country, --timezone, and --currency; --phone is optional',
  );
}
if (businessName.length > 160 || country.length > 100 || timezone.length > 100) {
  throw new Error('Name, country, or time zone exceeds its maximum length');
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 254) {
  throw new Error('A valid contact email address is required');
}
if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter code');
if (contactPhone && contactPhone.length > 40) throw new Error('Phone exceeds its maximum length');
try {
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
} catch {
  throw new Error('A valid IANA time zone is required');
}

const connectionString = process.env.DATABASE_MIGRATION_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATION_URL is required');
const databaseUrl = new URL(connectionString);
if (databaseUrl.port !== '55433' || databaseUrl.pathname !== '/aicrm_day3_clean') {
  throw new Error('Provisioning is restricted to aicrm_day3_clean on port 55433');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await prisma.$transaction(async (transaction) => {
    const tenant = await transaction.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, status: true },
    });
    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new Error('An existing active tenant with that slug is required');
    }

    await transaction.dealership.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        businessName,
        contactEmail,
        contactPhone,
        country,
        timezone,
        currency,
      },
    });
  });
  process.stdout.write(
    'Dealership bootstrap completed; an existing dealership, if present, was not changed.\n',
  );
} finally {
  await prisma.$disconnect();
}
