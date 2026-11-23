# Database strategy

Prisma owns the internal PostgreSQL schema and migrations. PostgreSQL stores tenants, users, CRM data, conversations, audit records, and synchronized read models.

The Day 1 schema contains tenants and platform-aware nullable tenant memberships for users. A null tenant is not authorization as super-admin; explicit platform authorization must be added later.

External MySQL databases are never accessed through Prisma and are never written directly by the platform.
