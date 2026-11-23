# Multi-tenancy

Every dealership is represented as a tenant. A tenant identity must be derived from authenticated server-side context, tenant membership, and route authorization. Browser-provided tenant IDs are never authorization.

Tenant-scoped services must apply an explicit tenant predicate to all tenant-owned queries. PostgreSQL RLS, RLS test matrices, audited tenant role setup, and cross-tenant integration/job authorization are required before tenant-owned business features are enabled.

Audit events should retain actor, tenant, action, target, and timestamp. Global platform users require explicit capabilities rather than inferred access from a null tenant ID.

## Implemented Day 2 relationships

- A tenant has one primary dealership profile.
- A dealership has many branches.
- A branch foreign key includes both dealership and tenant, preventing tenant mismatched ownership.
- A user may belong to multiple tenants through `TenantMembership`.
- Membership role and status are explicit.
- Platform administration is represented by `PlatformAdministrator` and is separate from tenant membership.

Tenant-aware repository operations require a `TenantContext`, set PostgreSQL transaction-local tenant state, and execute with the restricted `aicrm_app` role.
