# Database role separation

The API does not use the migration/owner `aicrm` role for routine operations.

## Migration role

`DATABASE_MIGRATION_URL` connects Prisma migrations to the owner `aicrm`. It is used only by migration/admin commands.

## Authentication runtime role

`DATABASE_AUTH_URL` connects to `aicrm_auth_runtime`, which inherits only `aicrm_auth`.

It can:

- Read `users`
- Read `password_credentials`
- Read/create/update `auth_sessions`
- Execute fixed membership and platform-administrator lookup functions

It cannot:

- Read `branches`, `dealerships`, or `tenant_memberships` directly
- Create or alter tables
- Bypass RLS
- Become superuser

## Tenant application role

`DATABASE_APP_URL` connects to `aicrm_app_runtime`, which inherits only `aicrm_app`.

It can perform tenant-owned operations only on `dealerships`, `branches`, and `tenant_memberships`. Protected repositories set transaction-local `app.tenant_id` and set `SET LOCAL ROLE aicrm_app`. All protected tables force RLS.

## Security-definer helpers

`auth_active_memberships` and `auth_platform_administrator` are fixed SECURITY DEFINER functions with a pinned `search_path`. EXECUTE is restricted to `aicrm_auth` and runtime login users. They return only the current user's active membership or platform status.
