# Database strategy

Prisma owns the internal PostgreSQL schema and migrations. PostgreSQL stores tenants, users, CRM data, conversations, audit records, and synchronized read models.

The Day 1 schema contains tenants and platform-aware nullable tenant memberships for users. A null tenant is not authorization as super-admin; explicit platform authorization must be added later.

External MySQL databases are never accessed through Prisma and are never written directly by the platform.

## Day 2 tenant-owned tables

`dealerships`, `branches`, and `tenant_memberships` are tenant-owned and protected by PostgreSQL RLS. Tenant context is transaction-local: application repositories set `app.tenant_id` with `set_config(..., true)` and execute protected operations inside the same transaction.

Protected application transactions also set `SET LOCAL ROLE "aicrm_app"` so the non-superuser application role is subject to forced RLS. Platform administrators and migration/admin operations use explicitly separate database roles and interfaces; the application role has no platform-administrator privileges.

RLS is implemented and verified locally, but it is not a replacement for application authorization. Backend repositories continue to require trusted tenant context and permission checks.
