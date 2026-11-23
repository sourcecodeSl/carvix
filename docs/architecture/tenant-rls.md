# Tenant PostgreSQL RLS

## Tenant-owned tables

- `dealerships`
- `branches`
- `tenant_memberships`

Each table enables and forces row-level security. Policies require a transaction-local `app.tenant_id` value and compare it with the row's `tenant_id`.

## Transaction model

Tenant repositories use this sequence:

1. Validate the trusted `TenantContext`.
2. Validate the required permission.
3. Start a Prisma transaction.
4. Set `SET LOCAL ROLE "aicrm_app"`.
5. Set `app.tenant_id` using `set_config(..., true)`.
6. Execute Prisma operations.
7. End the transaction, clearing connection-local tenant state.

Missing context fails closed. No policy is present for unmatched tenant IDs.

## Verification

PostgreSQL integration tests verify missing context, tenant reads, cross-tenant updates/deletes, and connection reuse behavior.

## Remaining work

- Add RLS to future tenant-owned CRM and AI tables.
- Add explicit platform-administrator role privileges.
- Integrate RLS with verified authentication and membership context.
- Apply RLS to all background worker transactions.
- Add a dedicated migration/admin database role rather than relying on migration-time superuser access.
